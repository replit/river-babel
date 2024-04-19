

import type { Test } from "../src/actions";
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

const ProceduresGetDisconnectNotifs: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      // invoking after disconnected should eventually tell us unexpected disconnect
      { type: "invoke", id: "2", proc: "kv.set", payload: { k: "foo", v: 43 } },
      { type: "wait", ms: SESSION_DISCONNECT_MS },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "err", payload: "UNEXPECTED_DISCONNECT" },
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
      { type: "invoke", id: "4", proc: "kv.set", payload: { k: "foo", v: 43 } },
      { type: "connect_network" },
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
  ProceduresGetDisconnectNotifs,
  BuffersWhileDisconnectedTest,
  SubscriptionDisconnectTest,
  SubscriptionReconnectTest,
  TwoClientDisconnectTest,
};