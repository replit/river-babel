// protov2 service definitions should match v1 with new init field requirement
import { ServiceSchema, Ok, Procedure, Err } from '@replit/river';
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
      requestInit: Type.Object({ k: Type.String(), v: Type.Number() }),
      responseData: Type.Object({ v: Type.Number() }),
      responseError: Type.Never(),
      async handler({ ctx, reqInit: { k, v } }) {
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
      requestInit: Type.Object({ k: Type.String() }),
      responseData: Type.Object({ v: Type.Number() }),
      responseError: Type.Object({
        code: Type.Literal('NOT_FOUND'),
        message: Type.String(),
      }),
      async handler({ ctx, reqInit: { k }, resWritable }) {
        const observable = ctx.state.kv.get(k);
        if (!observable) {
          resWritable.write(
            Err({
              code: 'NOT_FOUND',
              message: `key ${k} wasn't found`,
            }),
          );
          resWritable.close();
          return;
        }

        observable.observe((v) => resWritable.write(Ok({ v })));
      },
    }),
  },
);

const EchoService = ServiceSchema.define({
  echo: Procedure.stream({
    requestInit: Type.Object({}),
    requestData: Type.Object({ str: Type.String() }),
    responseData: Type.Object({ out: Type.String() }),
    responseError: Type.Never(),
    async handler({ reqReadable, resWritable }) {
      for await (const res of reqReadable) {
        if (!res.ok) {
          throw new Error('failed');
        }

        resWritable.write(Ok({ out: res.payload.str }));
      }
    },
  }),
  echo_prefix: Procedure.stream({
    requestInit: Type.Object({ prefix: Type.String() }),
    requestData: Type.Object({ str: Type.String() }),
    responseData: Type.Object({ out: Type.String() }),
    responseError: Type.Never(),
    async handler({ reqInit: { prefix }, reqReadable, resWritable }) {
      for await (const res of reqReadable) {
        if (!res.ok) {
          throw new Error('failed');
        }

        resWritable.write(Ok({ out: prefix + res.payload.str }));
      }
    },
  }),
});

const UploadService = ServiceSchema.define({
  send: Procedure.upload({
    requestInit: Type.Object({}),
    requestData: Type.Object({
      part: Type.Union([Type.String(), Type.Literal('EOF')]),
    }),
    responseData: Type.Object({ doc: Type.String() }),
    responseError: Type.Never(),
    async handler({ reqReadable }) {
      let doc = '';

      for await (const res of reqReadable) {
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
