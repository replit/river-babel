import type { Test } from "../driver";

export const KvRpcTest: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "invoke", id: "2", proc: "kv.set", payload: { k: "foo", v: 43 } },
      { type: "invoke", id: "3", proc: "kv.set", payload: { k: "abc", v: 1 } },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 43 },
      { id: "3", status: "ok", payload: 1 },
    ],
  }
}
