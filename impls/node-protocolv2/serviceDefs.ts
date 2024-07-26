// protov2 service definitions should match v1 with new init field requirement
import { ServiceSchema, Ok, Procedure, Err } from 'protocolv2';
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

const KVService = ServiceSchema.define(
  {
    initializeState: () => ({ kv: new Map<string, Observable<number>>() }),
  },
  {
    set: Procedure.rpc({
      init: Type.Object({ k: Type.String(), v: Type.Number() }),
      output: Type.Object({ v: Type.Number() }),
      errors: Type.Never(),
      async handler(ctx, { k, v }) {
        let observable = ctx.state.kv.get(k);
        if (!observable) {
          observable = new Observable(v);
          ctx.state.kv.set(k, observable);
        }

        observable.set(() => v);
        return Ok({ v: observable.get() });
      },
    }),
    watch: Procedure.subscription({
      init: Type.Object({ k: Type.String() }),
      output: Type.Object({ v: Type.Number() }),
      errors: Type.Object({
        code: Type.Literal('NOT_FOUND'),
        message: Type.String(),
      }),
      async handler(ctx, { k }, out) {
        const observable = ctx.state.kv.get(k);
        if (!observable) {
          out.write(
            Err({
              code: 'NOT_FOUND',
              message: `key ${k} wasn't found`,
            }),
          );
          out.close();
          return;
        }

        observable.observe((v) => out.write(Ok({ v })));
      },
    }),
  },
);

const EchoService = ServiceSchema.define({
  echo: Procedure.stream({
    init: Type.Object({}),
    input: Type.Object({ str: Type.String() }),
    output: Type.Object({ out: Type.String() }),
    errors: Type.Never(),
    async handler(_ctx, _init, input, output) {
      for await (const res of input) {
        if (!res.ok) {
          throw new Error('failed');
        }

        output.write(Ok({ out: res.payload.str }));
      }
    },
  }),
  echo_prefix: Procedure.stream({
    init: Type.Object({ prefix: Type.String() }),
    input: Type.Object({ str: Type.String() }),
    output: Type.Object({ out: Type.String() }),
    errors: Type.Never(),
    async handler(_ctx, { prefix }, input, output) {
      for await (const res of input) {
        if (!res.ok) {
          throw new Error('failed');
        }

        output.write(Ok({ out: prefix + res.payload.str }));
      }
    },
  }),
});

const UploadService = ServiceSchema.define({
  send: Procedure.upload({
    init: Type.Object({}),
    input: Type.Object({
      part: Type.Union([Type.String(), Type.Literal('EOF')]),
    }),
    output: Type.Object({ doc: Type.String() }),
    errors: Type.Never(),
    async handler(_ctx, _init, input) {
      let doc = '';

      for await (const res of input) {
        if (!res.ok) {
          throw new Error('failed');
        }

        const { part } = res.payload;

        if (part === 'EOF') {
          break;
        }

        doc += part;
      }

      return Ok({ doc });
    },
  }),
});

// export a listing of all the services that we have
export const serviceDefs = {
  kv: KVService,
  repeat: EchoService,
  upload: UploadService,
};
