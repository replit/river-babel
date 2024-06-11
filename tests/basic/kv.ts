import type { Test } from "../../src/actions";
import { SESSION_DISCONNECT_MS } from "../constants";

const KvRpcTest: Test = {
  clients: {
    client: {
      actions: [
        {
          type: "invoke",
          id: "1",
          proc: "kv.set",
          payload: { k: "foo", v: 42 },
        },
        {
          type: "invoke",
          id: "2",
          proc: "kv.set",
          payload: { k: "foo", v: 43 },
        },
        {
          type: "invoke",
          id: "3",
          proc: "kv.set",
          payload: { k: "abc", v: 1 },
        },
      ],
      expectedOutput: [
        { id: "1", status: "ok", payload: 42 },
        { id: "2", status: "ok", payload: 43 },
        { id: "3", status: "ok", payload: 1 },
      ],
    },
  },
};

const KvSubscribeTest: Test = {
  clients: {
    client: {
      actions: [
        {
          type: "invoke",
          id: "1",
          proc: "kv.set",
          payload: { k: "foo", v: 42 },
        },
        { type: "invoke", id: "2", proc: "kv.watch", payload: { k: "foo" } },
        {
          type: "invoke",
          id: "3",
          proc: "kv.set",
          payload: { k: "abc", v: 1 },
        },
        {
          type: "invoke",
          id: "4",
          proc: "kv.set",
          payload: { k: "foo", v: 43 },
        },
      ],
      expectedOutput: [
        { id: "1", status: "ok", payload: 42 },
        { id: "2", status: "ok", payload: 42 }, // watch should return the current value
        { id: "3", status: "ok", payload: 1 },
        { id: "2", status: "ok", payload: 43 },
        { id: "4", status: "ok", payload: 43 },
      ],
    },
  },
};

const KvSubscribeErrorTest: Test = {
  clients: {
    client: {
      actions: [
        { type: "invoke", id: "1", proc: "kv.watch", payload: { k: "foo" } },
      ],
      expectedOutput: [{ id: "1", status: "err", payload: "NOT_FOUND" }],
    },
  },
};

const KvSubscribeMultipleTest: Test = {
  flaky: true,
  clients: {
    client1: {
      actions: [
        {
          type: "invoke",
          id: "1",
          proc: "kv.set",
          payload: { k: "foo", v: 42 },
        },
        { type: "invoke", id: "2", proc: "kv.watch", payload: { k: "foo" } },
        {
          type: "invoke",
          id: "3",
          proc: "kv.set",
          payload: { k: "foo", v: 43 },
        },
        { type: "wait_response", id: "3" },
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
        { id: "2", status: "ok", payload: 41 },
      ],
    },
    client2: {
      actions: [
        { type: "sleep", ms: 800 },
        { type: "invoke", id: "a", proc: "kv.watch", payload: { k: "foo" } },
        {
          type: "invoke",
          id: "b",
          proc: "kv.set",
          payload: { k: "foo", v: 41 },
        },
      ],
      expectedOutput: [
        // watch foo
        { id: "a", status: "ok", payload: 43 },

        // set foo 41
        { id: "a", status: "ok", payload: 41 },
        { id: "b", status: "ok", payload: 41 },
      ],
    },
  },
};

const KvLongSubscription: Test = {
  clients: {
    client: {
      actions: [
        {
          type: "invoke",
          id: "1",
          proc: "kv.set",
          payload: { k: "foo", v: 42 },
        },
        { type: "invoke", id: "2", proc: "kv.watch", payload: { k: "foo" } },
        { type: "sleep", ms: SESSION_DISCONNECT_MS },
        {
          type: "invoke",
          id: "3",
          proc: "kv.set",
          payload: { k: "foo", v: 43 },
        },
      ],
      expectedOutput: [
        { id: "1", status: "ok", payload: 42 },
        { id: "2", status: "ok", payload: 42 },
        { id: "2", status: "ok", payload: 43 },
        { id: "3", status: "ok", payload: 43 },
      ],
    },
  },
};

const KvMultipleLongSubscription: Test = {
  clients: {
    client: {
      actions: [
        {
          type: "invoke",
          id: "1",
          proc: "kv.set",
          payload: { k: "foo", v: 42 },
        },
        { type: "invoke", id: "2", proc: "kv.watch", payload: { k: "foo" } },
        { type: "sleep", ms: SESSION_DISCONNECT_MS },
        {
          type: "invoke",
          id: "3",
          proc: "kv.set",
          payload: { k: "foo", v: 43 },
        },
        { type: "invoke", id: "4", proc: "kv.watch", payload: { k: "foo" } },
        { type: "sleep", ms: SESSION_DISCONNECT_MS },
        {
          type: "invoke",
          id: "5",
          proc: "kv.set",
          payload: { k: "foo", v: 44 },
        },
      ],
      expectedOutput: [
        { id: "1", status: "ok", payload: 42 },
        { id: "2", status: "ok", payload: 42 },
        { id: "2", status: "ok", payload: 43 },
        { id: "3", status: "ok", payload: 43 },
        { id: "4", status: "ok", payload: 43 },
        { id: "2", status: "ok", payload: 44 },
        { id: "4", status: "ok", payload: 44 },
        { id: "5", status: "ok", payload: 44 },
      ],
    },
  },
};

export default {
  KvRpcTest,
  KvSubscribeTest,
  KvSubscribeErrorTest,
  KvSubscribeMultipleTest,
  KvLongSubscription,
  KvMultipleLongSubscription,
};
