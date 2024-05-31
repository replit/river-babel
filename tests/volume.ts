import type { Action, Test } from "../src/actions";

const MANY = 5000;
const ManyRpcs: Test = {
  client: {
    actions: [
      ...Array.from(
        { length: MANY },
        (_, i): Action => ({
          type: "invoke",
          id: (i + 1).toString(),
          proc: "kv.set",
          payload: { k: "foo", v: i },
        }),
      ),
      { type: "wait", ms: 3000 },
    ],
    expectedOutput: Array.from({ length: MANY }, (_, i) => ({
      id: (i + 1).toString(),
      status: "ok",
      payload: i,
    })),
  },
};

const ManyStreams: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "repeat.echo", init: {} },
      ...Array.from(
        { length: MANY },
        (_, i): Action => ({
          type: "invoke",
          id: "1",
          proc: "repeat.echo",
          payload: { s: i.toString() },
        }),
      ),
      { type: "wait", ms: 2000 },
    ],
    expectedOutput: Array.from({ length: MANY }, (_, i) => ({
      id: "1",
      status: "ok",
      payload: i.toString(),
    })),
  },
};

export default { ManyRpcs, ManyStreams };
