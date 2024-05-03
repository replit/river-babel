import type { Action, ExpectedOutputEntry, Test } from "../src/actions";
import { WS_DISCONNECT_PERIOD_MS, SESSION_DISCONNECT_MS } from "./constants";

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
      { type: "wait", ms: WS_DISCONNECT_PERIOD_MS }, 
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

const SurvivesLongSessionIdle: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "wait", ms: 10000 },
      { type: "invoke", id: "2", proc: "kv.set", payload: { k: "abc", v: 43 } },
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
      { type: "wait", ms: WS_DISCONNECT_PERIOD_MS }, 
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


const WatchDuringDisconnect: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      { type: "invoke", id: "2", proc: "kv.watch", payload: { k: "foo" } },
      { type: "wait", ms: WS_DISCONNECT_PERIOD_MS }, 
      { type: "connect_network" },
      { type: "invoke", id: "3", proc: "kv.set", payload: { k: "foo", v: 43 } },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 43 },
      { id: "3", status: "ok", payload: 43 },
    ],
  }
}

const ShortDisconnectMultipleTimes: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "invoke", id: "2", proc: "kv.watch", payload: { k: "foo" } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      { type: "invoke", id: "3", proc: "kv.watch", payload: { k: "foo" } },
      { type: "wait", ms: WS_DISCONNECT_PERIOD_MS }, 
      { type: "connect_network" },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      { type: "wait", ms: WS_DISCONNECT_PERIOD_MS }, 
      { type: "connect_network" },
      { type: "invoke", id: "4", proc: "kv.set", payload: { k: "foo", v: 43 } },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 42 },
      { id: "3", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 43 },
      { id: "3", status: "ok", payload: 43 },
      { id: "4", status: "ok", payload: 43 },
    ],
  }
}

const DisconnectMultipleTimes: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      { type: "wait", ms: SESSION_DISCONNECT_MS }, 
      { type: "connect_network" },
      { type: "invoke", id: "2", proc: "kv.set", payload: { k: "foo", v: 43 } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      { type: "wait", ms: SESSION_DISCONNECT_MS }, 
      { type: "connect_network" },
      { type: "invoke", id: "3", proc: "kv.set", payload: { k: "foo", v: 44 } },
      { type: "wait", ms: 500 }, 
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      // TODO: what should be the behavior here?
      { id: "2", status: "ok", payload: 43 },
      { id: "3", status: "ok", payload: 44 },
    ],
  }
}



const ComplexSituation: Test = {
  client1: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "wait", ms: SESSION_DISCONNECT_MS }, 
      { type: "invoke", id: "2", proc: "kv.watch", payload: { k: "foo" } },
      { type: "invoke", id: "3", proc: "kv.set", payload: { k: "foo", v: 43 } },
      { type: "wait", ms: WS_DISCONNECT_PERIOD_MS }, 
      { type: "invoke", id: "4", proc: "kv.watch", payload: { k: "foo" } },
      { type: "invoke", id: "5", proc: "kv.set", payload: { k: "foo", v: 44 } },
      { type: "wait", ms: SESSION_DISCONNECT_MS }, 
      { type: "invoke", id: "6", proc: "kv.watch", payload: { k: "foo" } },
      { type: "invoke", id: "7", proc: "kv.set", payload: { k: "foo", v: 45 } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      { type: "wait", ms: SESSION_DISCONNECT_MS }, 
      { type: "connect_network" },
      { type: "invoke", id: "11", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "wait", ms: SESSION_DISCONNECT_MS }, 
      { type: "invoke", id: "12", proc: "kv.watch", payload: { k: "foo" } },
      { type: "invoke", id: "13", proc: "kv.set", payload: { k: "foo", v: 43 } },
      { type: "disconnect_network" },
      { type: "wait", ms: WS_DISCONNECT_PERIOD_MS }, 
      { type: "connect_network" },
      { type: "invoke", id: "14", proc: "kv.watch", payload: { k: "foo" } },
      { type: "invoke", id: "15", proc: "kv.set", payload: { k: "foo", v: 44 } },
      { type: "wait", ms: SESSION_DISCONNECT_MS }, 
      { type: "invoke", id: "16", proc: "kv.watch", payload: { k: "foo" } },
      { type: "invoke", id: "17", proc: "kv.set", payload: { k: "foo", v: 45 } },
      { type: "wait", ms: 500 }, 
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
      { id: "6", status: "ok", payload: 44 },
      { id: "2", status: "ok", payload: 45 },
      { id: "4", status: "ok", payload: 45 },
      { id: "6", status: "ok", payload: 45 },
      { id: "7", status: "ok", payload: 45 },

      { id: "2", status: "err", payload: "UNEXPECTED_DISCONNECT" },
      { id: "4", status: "err", payload: "UNEXPECTED_DISCONNECT" },
      { id: "6", status: "err", payload: "UNEXPECTED_DISCONNECT" },

      { id: "11", status: "ok", payload: 42 },
      { id: "12", status: "ok", payload: 42 },
      { id: "12", status: "ok", payload: 43 },
      { id: "13", status: "ok", payload: 43 },
      { id: "14", status: "ok", payload: 43 },
      { id: "12", status: "ok", payload: 44 },
      { id: "14", status: "ok", payload: 44 },
      { id: "15", status: "ok", payload: 44 },
      { id: "16", status: "ok", payload: 44 },
      { id: "12", status: "ok", payload: 45 },
      { id: "14", status: "ok", payload: 45 },
      { id: "16", status: "ok", payload: 45 },
      { id: "17", status: "ok", payload: 45 },
    ],
  },

  client2: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "bar", v: 12 } },
      { type: "wait", ms: SESSION_DISCONNECT_MS }, 
      { type: "invoke", id: "2", proc: "kv.watch", payload: { k: "bar" } },
      { type: "invoke", id: "3", proc: "kv.set", payload: { k: "bar", v: 13 } },
      { type: "wait", ms: WS_DISCONNECT_PERIOD_MS }, 
      { type: "invoke", id: "4", proc: "kv.watch", payload: { k: "bar" } },
      { type: "invoke", id: "5", proc: "kv.set", payload: { k: "bar", v: 14 } },
      { type: "invoke", id: "6", proc: "kv.watch", payload: { k: "bar" } },
      { type: "invoke", id: "7", proc: "kv.set", payload: { k: "bar", v: 15 } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      { type: "wait", ms: SESSION_DISCONNECT_MS }, 
      { type: "connect_network" },
      { type: "invoke", id: "11", proc: "kv.set", payload: { k: "bar", v: 12 } },
      { type: "wait", ms: SESSION_DISCONNECT_MS }, 
      { type: "invoke", id: "12", proc: "kv.watch", payload: { k: "bar" } },
      { type: "invoke", id: "13", proc: "kv.set", payload: { k: "bar", v: 13 } },
      { type: "disconnect_network" },
      { type: "wait", ms: WS_DISCONNECT_PERIOD_MS }, 
      { type: "connect_network" },
      { type: "invoke", id: "14", proc: "kv.watch", payload: { k: "bar" } },
      { type: "invoke", id: "15", proc: "kv.set", payload: { k: "bar", v: 14 } },
      { type: "wait", ms: SESSION_DISCONNECT_MS }, 
      { type: "invoke", id: "16", proc: "kv.watch", payload: { k: "bar" } },
      { type: "invoke", id: "17", proc: "kv.set", payload: { k: "bar", v: 15 } },
      { type: "wait", ms: 500 }, 
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 12 },
      { id: "2", status: "ok", payload: 12 },
      { id: "2", status: "ok", payload: 13 },
      { id: "3", status: "ok", payload: 13 },
      { id: "4", status: "ok", payload: 13 },
      { id: "2", status: "ok", payload: 14 },
      { id: "4", status: "ok", payload: 14 },
      { id: "5", status: "ok", payload: 14 },
      { id: "6", status: "ok", payload: 14 },
      { id: "2", status: "ok", payload: 15 },
      { id: "4", status: "ok", payload: 15 },
      { id: "6", status: "ok", payload: 15 },
      { id: "7", status: "ok", payload: 15 },

      { id: "2", status: "err", payload: "UNEXPECTED_DISCONNECT" },
      { id: "4", status: "err", payload: "UNEXPECTED_DISCONNECT" },
      { id: "6", status: "err", payload: "UNEXPECTED_DISCONNECT" },

      { id: "11", status: "ok", payload: 12 },
      { id: "12", status: "ok", payload: 12 },
      { id: "12", status: "ok", payload: 13 },
      { id: "13", status: "ok", payload: 13 },
      { id: "14", status: "ok", payload: 13 },
      { id: "12", status: "ok", payload: 14 },
      { id: "14", status: "ok", payload: 14 },
      { id: "15", status: "ok", payload: 14 },
      { id: "16", status: "ok", payload: 14 },
      { id: "12", status: "ok", payload: 15 },
      { id: "14", status: "ok", payload: 15 },
      { id: "16", status: "ok", payload: 15 },
      { id: "17", status: "ok", payload: 15 },
    ],
  },
}


export default {
  SurvivesTransientNetworkBlips,
  ShortConnectionDisconnectTest,
  SurvivesLongSessionIdle,
  SessionDisconnectTest,
  ShouldNotSendBufferAfterSessionDisconnect,
  BufferedMessagesShouldTakePrecedenceOverNewMessages,
  MessageOrderingPreservedDuringDisconnect,
  BuffersWhileDisconnectedTest,
  SubscriptionDisconnectTest,
  SubscriptionReconnectTest,
  TwoClientDisconnectTest,
  RepeatedConnectReconnectTest,
  WatchDuringDisconnect,
  ShortDisconnectMultipleTimes,
  DisconnectMultipleTimes,
  ComplexSituation,
};
