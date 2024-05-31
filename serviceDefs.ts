import { ServiceSchema, Ok, Procedure, Err } from "@replit/river";
import { Type } from "@sinclair/typebox";

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
      input: Type.Object({ k: Type.String(), v: Type.Number() }),
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
      input: Type.Object({ k: Type.String() }),
      output: Type.Object({ v: Type.Number() }),
      errors: Type.Object({
        code: Type.Literal("NOT_FOUND"),
        message: Type.String(),
      }),
      async handler(ctx, { k }, out) {
        const observable = ctx.state.kv.get(k);
        if (!observable) {
          out.push(
            Err({
              code: "NOT_FOUND",
              message: `key ${k} wasn't found`,
            }),
          );
          out.end();
          return;
        }

        observable.observe((v) => out.push(Ok({ v })));
      },
    }),
  },
);

const EchoService = ServiceSchema.define({
  echo: Procedure.stream({
    input: Type.Object({ str: Type.String() }),
    output: Type.Object({ out: Type.String() }),
    errors: Type.Never(),
    async handler(_ctx, input, output) {
      for await (const { str } of input) {
        output.push(Ok({ out: str }));
      }
    },
  }),
  echo_prefix: Procedure.stream({
    init: Type.Object({ prefix: Type.String() }),
    input: Type.Object({ str: Type.String() }),
    output: Type.Object({ out: Type.String() }),
    errors: Type.Never(),
    async handler(_ctx, { prefix }, input, output) {
      for await (const { str } of input) {
        output.push(Ok({ out: prefix + str }));
      }
    },
  }),
});

const UploadService = ServiceSchema.define({
  send: Procedure.upload({
    input: Type.Object({
      part: Type.Union([Type.String(), Type.Literal("EOF")]),
    }),
    output: Type.Object({ doc: Type.String() }),
    errors: Type.Never(),
    async handler(_ctx, input) {
      let doc = "";
      for await (const { part } of input) {
        if (part === "EOF") {
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
