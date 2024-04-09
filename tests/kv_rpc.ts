import type { Test } from "../driver";

export const KvRpcTest: Test = {
  client: {
    actions: [
      {
        type: "invoke",
        id: "1",
        proc: "kv.set",
        payload: { k: "foo", v: 42 },
      },
    ],
    expectedOutput: [
      {
        id: "1",
        status: "ok",
        payload: 42,
      },
    ],
  }
}