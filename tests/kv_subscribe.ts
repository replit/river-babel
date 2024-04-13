import type { Test } from "../src/actions";

export const KvSubscribeTest: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "invoke", id: "2", proc: "kv.watch", payload: { k: "foo" } },
      { type: "invoke", id: "3", proc: "kv.set", payload: { k: "abc", v: 1 } },
      { type: "invoke", id: "4", proc: "kv.set", payload: { k: "foo", v: 43 } },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 42 }, // watch should return the current value
      { id: "3", status: "ok", payload: 1 },
      { id: "2", status: "ok", payload: 43 },
      { id: "4", status: "ok", payload: 43 },
    ],
  },
};

export const KvSubscribeErrorTest: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.watch", payload: { k: "foo" } },
    ],
    expectedOutput: [
      { id: "1", status: "err", payload: "NOT_FOUND" }
    ],
  },
};

export const KvSubscribeMultipleTest: Test = {
  client1: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "invoke", id: "2", proc: "kv.watch", payload: { k: "foo" } },
      { type: "invoke", id: "3", proc: "kv.set", payload: { k: "foo", v: 43 } },
    ],
    expectedOutput: [
      // set foo 42
      { id: "1", status: "ok", payload: 42 },
      // watch foo
      { id: "2", status: "ok", payload: 42 },

      // set foo 43
      { id: "2", status: "ok", payload: 43 },
      { id: "3", status: "ok", payload: 43 },

      // from client2 setting foo to 41
      { id: "2", status: "ok", payload: 41 }
    ],
  },
  client2: {
    actions: [
      { type: "wait", ms: 800 },
      { type: "invoke", id: "a", proc: "kv.watch", payload: { k: "foo" } },
      { type: "invoke", id: "b", proc: "kv.set", payload: { k: "foo", v: 41 } },
    ],
    expectedOutput: [
      // watch foo
      { id: "a", status: "ok", payload: 43 },

      // set foo 41
      { id: "a", status: "ok", payload: 41 },
      { id: "b", status: "ok", payload: 41 },
    ],
  },
};