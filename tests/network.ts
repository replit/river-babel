import type { Action, ExpectedOutputEntry, Test } from "../src/actions";
import { DISCONNECT_PERIOD_MS, SESSION_DISCONNECT_MS } from "./constants";

const SurvivesTransientNetworkBlips: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      { type: "connect_network" },
      { type: "invoke", id: "2", proc: "kv.set", payload: { k: "abc", v: 43 } },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 43 },
    ],
  }
}

const ShortConnectionDisconnectTest: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      { type: "wait", ms: DISCONNECT_PERIOD_MS }, 
      { type: "connect_network" },
      { type: "invoke", id: "2", proc: "kv.set", payload: { k: "foo", v: 43 } },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 43 },
    ],
  }
}

const SessionDisconnectTest: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      { type: "wait", ms: SESSION_DISCONNECT_MS }, 
      { type: "connect_network" },
      { type: "invoke", id: "2", proc: "kv.set", payload: { k: "foo", v: 43 } },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 43 },
    ],
  }
}

const ShouldNotSendBufferAfterSessionDisconnect: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "invoke", id: "2", proc: "kv.watch", payload: { k: "foo" }},
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      { type: "invoke", id: "3", proc: "kv.set", payload: { k: "foo", v: 43 } },
      { type: "wait", ms: SESSION_DISCONNECT_MS }, 
      { type: "connect_network" },
      { type: "invoke", id: "4", proc: "kv.watch", payload: { k: "foo" }},
      { type: "invoke", id: "5", proc: "kv.set", payload: { k: "foo", v: 44 } },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 42 },
      { id: "2", status: "err", payload: "UNEXPECTED_DISCONNECT" },
      { id: "3", status: "err", payload: "UNEXPECTED_DISCONNECT" },
      { id: "4", status: "ok", payload: 42 }, // watch should return the current value (43 should not be buffered)
      { id: "4", status: "ok", payload: 44 },
      { id: "5", status: "ok", payload: 44 },
    ],
  }
}

const BufferedMessagesShouldTakePrecedenceOverNewMessages: Test = {
  client: {
    actions: [
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      { type: "invoke", id: "1", proc: "repeat.echo", init: {} },
      { type: "invoke", id: "1", proc: "repeat.echo", payload: { s: "hello" } },
      { type: "connect_network" },
      { type: "invoke", id: "1", proc: "repeat.echo", payload: { s: "world" } },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: "hello" },
      { id: "1", status: "ok", payload: "world" },
    ],
  }
}

const MessageOrderingPreservedDuringDisconnect: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      ...Array.from({ length: 10 }, (_, i): Action => ({ type: "invoke", id: (i + 2).toString(), proc: "kv.set", payload: { k: "foo", v: i } })),
      { type: "wait", ms: DISCONNECT_PERIOD_MS }, 
      { type: "connect_network" },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      ...Array.from({ length: 10 }, (_, i): ExpectedOutputEntry => ({ id: (i + 2).toString(), status: "ok", payload: i })),
    ],
  }
}

const BuffersWhileDisconnectedTest: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "disconnect_network" },
      { type: "invoke", id: "2", proc: "kv.set", payload: { k: "foo", v: 43 } },
      { type: "invoke", id: "3", proc: "kv.set", payload: { k: "abc", v: 1 } },
      { type: "connect_network" },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 43 },
      { id: "3", status: "ok", payload: 1 },
    ],
  }
}

const SubscriptionDisconnectTest: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "invoke", id: "2", proc: "kv.watch", payload: { k: "foo" } },
      { type: "wait", ms: 800 },
      { type: "disconnect_network" },
      { type: "invoke", id: "3", proc: "kv.set", payload: { k: "abc", v: 1 } },
      { type: "invoke", id: "4", proc: "kv.set", payload: { k: "foo", v: 43 } },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 42 }, // watch should return the current value
    ],
  },
};

const SubscriptionReconnectTest: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "invoke", id: "2", proc: "kv.watch", payload: { k: "foo" } },
      { type: "disconnect_network" },
      { type: "wait", ms: 800 },
      { type: "invoke", id: "3", proc: "kv.set", payload: { k: "abc", v: 1 } },
      { type: "connect_network" },
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

const TwoClientDisconnectTest: Test = {
  client1: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "invoke", id: "2", proc: "kv.watch", payload: { k: "foo" } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      { type: "invoke", id: "3", proc: "kv.set", payload: { k: "foo", v: 1 } },
      { type: "wait", ms: 500 },
      { type: "connect_network" },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 46 },
      { id: "2", status: "ok", payload: 1 },
      { id: "3", status: "ok", payload: 1 },
    ],
  },
  client2: {
    actions: [
      { type: "wait", ms: 800 },
      { type: "invoke", id: "5", proc: "kv.watch", payload: { k: "foo" } },
      { type: "invoke", id: "6", proc: "kv.set", payload: { k: "foo", v: 46 } },
    ],
    expectedOutput: [
      { id: "5", status: "ok", payload: 42 },
      { id: "5", status: "ok", payload: 46 },
      { id: "6", status: "ok", payload: 46 },
      { id: "5", status: "ok", payload: 1 },
    ],
  },
};

const RepeatedConnectReconnectTest: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "invoke", id: "2", proc: "kv.set", payload: { k: "foo", v: 43 } },
      { type: "invoke", id: "3", proc: "kv.set", payload: { k: "foo", v: 44 } },
      { type: "disconnect_network" },
      { type: "wait", ms: 500 },
      { type: "connect_network" },
      { type: "invoke", id: "4", proc: "kv.set", payload: { k: "foo", v: 45 } },
      { type: "invoke", id: "5", proc: "kv.set", payload: { k: "foo", v: 46 } },
      { type: "invoke", id: "6", proc: "kv.set", payload: { k: "foo", v: 47 } },
      { type: "disconnect_network" },
      { type: "wait", ms: 500 },
      { type: "connect_network" },
      { type: "invoke", id: "7", proc: "kv.set", payload: { k: "foo", v: 48 } },
      { type: "invoke", id: "8", proc: "kv.set", payload: { k: "foo", v: 49 } },
      { type: "invoke", id: "9", proc: "kv.set", payload: { k: "foo", v: 50 } },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 43 },
      { id: "3", status: "ok", payload: 44 },
      { id: "4", status: "ok", payload: 45 },
      { id: "5", status: "ok", payload: 46 },
      { id: "6", status: "ok", payload: 47 },
      { id: "7", status: "ok", payload: 48 },
      { id: "8", status: "ok", payload: 49 },
      { id: "9", status: "ok", payload: 50 },
    ],
  }
}

export default {
  SurvivesTransientNetworkBlips,
  ShortConnectionDisconnectTest,
  SessionDisconnectTest,
  ShouldNotSendBufferAfterSessionDisconnect,
  BufferedMessagesShouldTakePrecedenceOverNewMessages,
  MessageOrderingPreservedDuringDisconnect,
  BuffersWhileDisconnectedTest,
  SubscriptionDisconnectTest,
  SubscriptionReconnectTest,
  TwoClientDisconnectTest,
  RepeatedConnectReconnectTest,
};
