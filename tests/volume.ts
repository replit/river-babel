import type { ClientAction, Test } from "../src/actions";

const MANY = 5000;
const ManyRpcs: Test = {
  flaky: true,
  clients: {
    client: {
      actions: [
        ...Array.from(
          { length: MANY },
          (_, i): ClientAction => ({
            type: "invoke",
            id: (i + 1).toString(),
            proc: "kv.set",
            payload: { k: "foo", v: i },
          }),
        ),
        { type: "sleep", ms: 3000 },
      ],
      expectedOutput: Array.from({ length: MANY }, (_, i) => ({
        id: (i + 1).toString(),
        status: "ok",
        payload: i,
      })),
    },
  },
};

const ManyStreams: Test = {
  flaky: true,
  clients: {
    client: {
      actions: [
        { type: "invoke", id: "1", proc: "repeat.echo", init: {} },
        ...Array.from(
          { length: MANY },
          (_, i): ClientAction => ({
            type: "invoke",
            id: "1",
            proc: "repeat.echo",
            payload: { s: i.toString() },
          }),
        ),
        { type: "sleep", ms: 2000 },
      ],
      expectedOutput: Array.from({ length: MANY }, (_, i) => ({
        id: "1",
        status: "ok",
        payload: i.toString(),
      })),
    },
  },
};

export default { ManyRpcs, ManyStreams };
