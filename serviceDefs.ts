import { ServiceBuilder, Ok, buildServiceDefs, Err } from '@replit/river';
import { Type } from '@sinclair/typebox';

export class Observable<T> {
  value: T;
  private listeners: Set<(val: T) => void>;

  constructor(initialValue: T) {
    this.value = initialValue;
    this.listeners = new Set();
  }

  get() {
    return this.value;
  }

  set(tx: (preValue: T) => T) {
    const newValue = tx(this.value);
    this.value = newValue;
    this.listeners.forEach((listener) => listener(newValue));
  }

  observe(listener: (val: T) => void) {
    this.listeners.add(listener);
    listener(this.get());
    return () => this.listeners.delete(listener);
  }
}

const KVConstructor = () =>
  ServiceBuilder.create('kv')
    .initialState({ kv: new Map<string, Observable<number>>() })
    .defineProcedure('set', {
      type: 'rpc',
      input: Type.Object({ k: Type.String(), v: Type.Number() }),
      output: Type.Object({ v: Type.Number() }),
      errors: Type.Never(),
      async handler(ctx, { k, v }) {
        let observable = ctx.state.kv.get(k)
        if (!observable) {
          observable = new Observable(v)
          ctx.state.kv.set(k, observable)
        }

        observable.set(() => v)
        return Ok({ v: observable.get() });
      },
    })
    .defineProcedure('watch', {
      type: 'subscription',
      input: Type.Object({ k: Type.String() }),
      output: Type.Object({ v: Type.Number() }),
      errors: Type.Object({ code: Type.Literal('NOT_FOUND'), message: Type.String() }),
      async handler(ctx, { k }, out) {
        const observable = ctx.state.kv.get(k)
        if (!observable) {
          out.push(Err({
            code: 'NOT_FOUND',
            message: `key ${k} wasn't found`
          }))
          out.end();
          return;
        }

        observable.observe(v => out.push(Ok({ v })));
      }
    })
    .finalize();

const EchoConstructor = () =>
  ServiceBuilder.create('repeat')
    .defineProcedure('echo', {
      type: 'stream',
      input: Type.Object({ str: Type.String() }),
      output: Type.Object({ out: Type.String() }),
      errors: Type.Never(),
      async handler(_ctx, input, output) {
        for await (const { str } of input) {
          output.push(Ok({ out: str }))
        }
      }
    })
    .defineProcedure('echo_prefix', {
      type: 'stream',
      init: Type.Object({ prefix: Type.String() }),
      input: Type.Object({ str: Type.String() }),
      output: Type.Object({ out: Type.String() }),
      errors: Type.Never(),
      async handler(_ctx, { prefix }, input, output) {
        for await (const { str } of input) {
          output.push(Ok({ out: prefix + str }))
        }
      }
    })
    .finalize()

const DummyUploadConstructor = () =>
  ServiceBuilder.create('upload')
    .defineProcedure('send', {
      type: 'upload',
      input: Type.Object({ part: Type.Union([Type.String(), Type.Literal("EOF")]) }),
      output: Type.Object({ doc: Type.String() }),
      errors: Type.Never(),
      async handler(_ctx, input) {
        let doc = ""
        for await (const { part } of input) {
          if (part === 'EOF') {
            break
          }

          doc += part
        }

        return Ok({ doc })
      }
    })
    .finalize()

// export a listing of all the services that we have
export const serviceDefs = buildServiceDefs([KVConstructor(), EchoConstructor(), DummyUploadConstructor()]);
