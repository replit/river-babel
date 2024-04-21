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

// TODO: what happened here is, websocket is creating, but the client is sending request while
// the handshake is not established, and the test is killed
// [river:info] bun-client -- session sess-ke3f7v disconnect from python-server
// [river:info] bun-client -- invoked rpc: kv.set with args: {"k":"foo","v":43}
// [river:info] bun-client -- attempting connection to python-server (reusing previous attempt)
// [river:info] bun-client -- no session for python-server, created a new one (id: sess-bio0db)
// [river:debug] bun-client -- sending {"streamId":"Bl452PMqVBmkIKyWQFraD","serviceName":"kv","procedureName":"set","payload":{"k":"foo","v":43},"controlFlags":6,"id":"jujdsp","to":"python-server","from":"bun-client","seq":0,"ack":0}
// [river:info] bun-client -- failed to send jujdsp (seq: 0) to python-server, connection not ready yet
// [river:debug] bun-client -- sending {"streamId":"heartbeat","controlFlags":1,"payload":{"type":"ACK"},"id":"kvcl9x","to":"python-server","from":"bun-client","seq":1,"ack":0}
// [river:info] bun-client -- failed to send kvcl9x (seq: 1) to python-server, connection not ready yet
// [river:info] bun-client -- establishing a new websocket to python-server
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
      { type: "invoke", id: "4", proc: "kv.set", payload: { k: "foo", v: 44 } },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 42 },
      { id: "2", status: "err", payload: "UNEXPECTED_DISCONNECT" },
      { id: "3", status: "err", payload: "UNEXPECTED_DISCONNECT" },
      { id: "4", status: "ok", payload: 44 },
    ],
  }
}

// TODO: What if client started new session while server is still using old session?
// the timer is different
const MessageOrderingPreservedDuringDisconnect: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      ...Array.from({ length: 10 }, (_, i): Action => ({ type: "invoke", id: (i + 2).toString(), proc: "kv.set", payload: { k: "foo", v: i } })),
      { type: "wait", ms: DISCONNECT_PERIOD_MS }, 
      { type: "connect_network" },
      // TODO: How long should this wait be?
      // { type: "wait", ms: 1000 }, 
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

export default {
  SurvivesTransientNetworkBlips,
  ShortConnectionDisconnectTest,
  SessionDisconnectTest,
  ShouldNotSendBufferAfterSessionDisconnect,
  MessageOrderingPreservedDuringDisconnect,
  BuffersWhileDisconnectedTest,
  SubscriptionDisconnectTest,
  SubscriptionReconnectTest,
  TwoClientDisconnectTest,
};
