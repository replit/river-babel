import type { ClientAction, ExpectedOutputEntry, Test } from '../src/actions';
import { WS_DISCONNECT_PERIOD_MS, SESSION_DISCONNECT_MS } from './constants';

const SurvivesTransientNetworkBlips: Test = {
  clients: {
    client: {
      actions: [
        {
          type: 'invoke',
          id: '1',
          proc: 'kv.set',
          payload: { k: 'foo', v: 42 },
        },
        { type: 'wait_response', id: '1' },
        { type: 'disconnect_network' },
        { type: 'connect_network' },
        {
          type: 'invoke',
          id: '2',
          proc: 'kv.set',
          payload: { k: 'abc', v: 43 },
        },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 43 },
      ],
    },
  },
};

const ShortConnectionDisconnectTest: Test = {
  clients: {
    client: {
      actions: [
        {
          type: 'invoke',
          id: '1',
          proc: 'kv.set',
          payload: { k: 'foo', v: 42 },
        },
        { type: 'wait_response', id: '1' },
        { type: 'disconnect_network' },
        { type: 'sleep', ms: WS_DISCONNECT_PERIOD_MS },
        { type: 'connect_network' },
        {
          type: 'invoke',
          id: '2',
          proc: 'kv.set',
          payload: { k: 'foo', v: 43 },
        },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 43 },
      ],
    },
  },
};

const SessionDisconnectTest: Test = {
  flaky: true,
  clients: {
    client: {
      actions: [
        {
          type: 'invoke',
          id: '1',
          proc: 'kv.set',
          payload: { k: 'foo', v: 42 },
        },
        { type: 'wait_response', id: '1' },
        { type: 'disconnect_network' },
        { type: 'sleep', ms: SESSION_DISCONNECT_MS },
        { type: 'connect_network' },
        {
          type: 'invoke',
          id: '2',
          proc: 'kv.set',
          payload: { k: 'foo', v: 43 },
        },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 43 },
      ],
    },
  },
};

const SurvivesLongSessionIdle: Test = {
  clients: {
    client: {
      actions: [
        {
          type: 'invoke',
          id: '1',
          proc: 'kv.set',
          payload: { k: 'foo', v: 42 },
        },
        { type: 'wait_response', id: '1' },
        { type: 'sleep', ms: 10000 },
        {
          type: 'invoke',
          id: '2',
          proc: 'kv.set',
          payload: { k: 'abc', v: 43 },
        },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 43 },
      ],
    },
  },
};

const ShouldNotSendBufferAfterSessionDisconnect: Test = {
  flaky: true,
  clients: {
    client: {
      actions: [
        {
          type: 'invoke',
          id: '1',
          proc: 'kv.set',
          payload: { k: 'foo', v: 42 },
        },
        { type: 'invoke', id: '2', proc: 'kv.watch', payload: { k: 'foo' } },
        { type: 'wait_response', id: '2' },
        { type: 'disconnect_network' },
        {
          type: 'invoke',
          id: '3',
          proc: 'kv.set',
          payload: { k: 'foo', v: 43 },
        },
        { type: 'sleep', ms: SESSION_DISCONNECT_MS },
        { type: 'connect_network' },
        { type: 'invoke', id: '4', proc: 'kv.watch', payload: { k: 'foo' } },
        {
          type: 'invoke',
          id: '5',
          proc: 'kv.set',
          payload: { k: 'foo', v: 44 },
        },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 42 },
        { id: '2', status: 'err', payload: 'UNEXPECTED_DISCONNECT' },
        { id: '3', status: 'err', payload: 'UNEXPECTED_DISCONNECT' },
        { id: '4', status: 'ok', payload: 42 }, // watch should return the current value (43 should not be buffered)
        { id: '4', status: 'ok', payload: 44 },
        { id: '5', status: 'ok', payload: 44 },
      ],
    },
  },
};

const BufferedMessagesShouldTakePrecedenceOverNewMessages: Test = {
  clients: {
    client: {
      actions: [
        { type: 'sleep', ms: 500 },
        { type: 'disconnect_network' },
        { type: 'invoke', id: '1', proc: 'repeat.echo', init: {} },
        {
          type: 'invoke',
          id: '1',
          proc: 'repeat.echo',
          payload: { s: 'hello' },
        },
        { type: 'connect_network' },
        {
          type: 'invoke',
          id: '1',
          proc: 'repeat.echo',
          payload: { s: 'world' },
        },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 'hello' },
        { id: '1', status: 'ok', payload: 'world' },
      ],
    },
  },
};

const MessageOrderingPreservedDuringDisconnect: Test = {
  clients: {
    client: {
      actions: [
        {
          type: 'invoke',
          id: '1',
          proc: 'kv.set',
          payload: { k: 'foo', v: 42 },
        },
        { type: 'wait_response', id: '1' },
        { type: 'disconnect_network' },

        {
          type: 'invoke',
          id: '2',
          proc: 'kv.set',
          payload: { k: 'foo', v: 0 },
        },
        {
          type: 'invoke',
          id: '3',
          proc: 'kv.set',
          payload: { k: 'foo', v: 1 },
        },
        {
          type: 'invoke',
          id: '4',
          proc: 'kv.set',
          payload: { k: 'foo', v: 2 },
        },
        {
          type: 'invoke',
          id: '5',
          proc: 'kv.set',
          payload: { k: 'foo', v: 3 },
        },
        {
          type: 'invoke',
          id: '6',
          proc: 'kv.set',
          payload: { k: 'foo', v: 4 },
        },
        {
          type: 'invoke',
          id: '7',
          proc: 'kv.set',
          payload: { k: 'foo', v: 5 },
        },
        {
          type: 'invoke',
          id: '8',
          proc: 'kv.set',
          payload: { k: 'foo', v: 6 },
        },
        {
          type: 'invoke',
          id: '9',
          proc: 'kv.set',
          payload: { k: 'foo', v: 7 },
        },
        {
          type: 'invoke',
          id: '10',
          proc: 'kv.set',
          payload: { k: 'foo', v: 8 },
        },
        {
          type: 'invoke',
          id: '11',
          proc: 'kv.set',
          payload: { k: 'foo', v: 9 },
        },

        { type: 'sleep', ms: WS_DISCONNECT_PERIOD_MS },
        { type: 'connect_network' },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 0 },
        { id: '3', status: 'ok', payload: 1 },
        { id: '4', status: 'ok', payload: 2 },
        { id: '5', status: 'ok', payload: 3 },
        { id: '6', status: 'ok', payload: 4 },
        { id: '7', status: 'ok', payload: 5 },
        { id: '8', status: 'ok', payload: 6 },
        { id: '9', status: 'ok', payload: 7 },
        { id: '10', status: 'ok', payload: 8 },
        { id: '11', status: 'ok', payload: 9 },
      ],
    },
  },
};

const BuffersWhileDisconnectedTest: Test = {
  flaky: true,
  clients: {
    client: {
      actions: [
        {
          type: 'invoke',
          id: '1',
          proc: 'kv.set',
          payload: { k: 'foo', v: 42 },
        },
        { type: 'disconnect_network' },
        {
          type: 'invoke',
          id: '2',
          proc: 'kv.set',
          payload: { k: 'foo', v: 43 },
        },
        {
          type: 'invoke',
          id: '3',
          proc: 'kv.set',
          payload: { k: 'abc', v: 1 },
        },
        { type: 'connect_network' },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 43 },
        { id: '3', status: 'ok', payload: 1 },
      ],
    },
  },
};

const SubscriptionDisconnectTest: Test = {
  clients: {
    client: {
      actions: [
        {
          type: 'invoke',
          id: '1',
          proc: 'kv.set',
          payload: { k: 'foo', v: 42 },
        },
        { type: 'invoke', id: '2', proc: 'kv.watch', payload: { k: 'foo' } },
        { type: 'wait_response', id: '2' },
        { type: 'disconnect_network' },
        {
          type: 'invoke',
          id: '3',
          proc: 'kv.set',
          payload: { k: 'abc', v: 1 },
        },
        {
          type: 'invoke',
          id: '4',
          proc: 'kv.set',
          payload: { k: 'foo', v: 43 },
        },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 42 }, // watch should return the current value
      ],
    },
  },
};

const SubscriptionReconnectTest: Test = {
  clients: {
    client: {
      actions: [
        {
          type: 'invoke',
          id: '1',
          proc: 'kv.set',
          payload: { k: 'foo', v: 42 },
        },
        { type: 'invoke', id: '2', proc: 'kv.watch', payload: { k: 'foo' } },
        { type: 'wait_response', id: '2' },
        { type: 'disconnect_network' },
        { type: 'sleep', ms: 500 },
        {
          type: 'invoke',
          id: '3',
          proc: 'kv.set',
          payload: { k: 'abc', v: 1 },
        },
        { type: 'connect_network' },
        {
          type: 'invoke',
          id: '4',
          proc: 'kv.set',
          payload: { k: 'foo', v: 43 },
        },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 42 }, // watch should return the current value
        { id: '3', status: 'ok', payload: 1 },
        { id: '2', status: 'ok', payload: 43 },
        { id: '4', status: 'ok', payload: 43 },
      ],
    },
  },
};

const TwoClientDisconnectTest: Test = {
  unordered: true,
  clients: {
    client1: {
      actions: [
        {
          type: 'invoke',
          id: '1',
          proc: 'kv.set',
          payload: { k: 'foo', v: 42 },
        },
        { type: 'invoke', id: '2', proc: 'kv.watch', payload: { k: 'foo' } },
        { type: 'wait_response', id: '2' },
        { type: 'sync', label: '2' },
        { type: 'disconnect_network' },
        {
          type: 'invoke',
          id: '3',
          proc: 'kv.set',
          payload: { k: 'foo', v: 1 },
        },
        { type: 'sync', label: '6' },
        { type: 'connect_network' },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 46 },
        { id: '2', status: 'ok', payload: 1 },
        { id: '3', status: 'ok', payload: 1 },
      ],
    },
    client2: {
      actions: [
        { type: 'sync', label: '2' },
        { type: 'invoke', id: '5', proc: 'kv.watch', payload: { k: 'foo' } },
        {
          type: 'invoke',
          id: '6',
          proc: 'kv.set',
          payload: { k: 'foo', v: 46 },
        },
        { type: 'wait_response', id: '6' },
        { type: 'sync', label: '6' },
      ],
      expectedOutput: [
        { id: '5', status: 'ok', payload: 42 },
        { id: '5', status: 'ok', payload: 46 },
        { id: '6', status: 'ok', payload: 46 },
        { id: '5', status: 'ok', payload: 1 },
      ],
    },
  },
};

const RepeatedConnectReconnectTest: Test = {
  clients: {
    client: {
      actions: [
        {
          type: 'invoke',
          id: '1',
          proc: 'kv.set',
          payload: { k: 'foo', v: 42 },
        },
        {
          type: 'invoke',
          id: '2',
          proc: 'kv.set',
          payload: { k: 'foo', v: 43 },
        },
        {
          type: 'invoke',
          id: '3',
          proc: 'kv.set',
          payload: { k: 'foo', v: 44 },
        },
        { type: 'wait_response', id: '3' },
        { type: 'disconnect_network' },
        { type: 'sleep', ms: 500 },
        { type: 'connect_network' },
        {
          type: 'invoke',
          id: '4',
          proc: 'kv.set',
          payload: { k: 'foo', v: 45 },
        },
        {
          type: 'invoke',
          id: '5',
          proc: 'kv.set',
          payload: { k: 'foo', v: 46 },
        },
        {
          type: 'invoke',
          id: '6',
          proc: 'kv.set',
          payload: { k: 'foo', v: 47 },
        },
        { type: 'disconnect_network' },
        { type: 'sleep', ms: 500 },
        { type: 'connect_network' },
        {
          type: 'invoke',
          id: '7',
          proc: 'kv.set',
          payload: { k: 'foo', v: 48 },
        },
        {
          type: 'invoke',
          id: '8',
          proc: 'kv.set',
          payload: { k: 'foo', v: 49 },
        },
        {
          type: 'invoke',
          id: '9',
          proc: 'kv.set',
          payload: { k: 'foo', v: 50 },
        },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 43 },
        { id: '3', status: 'ok', payload: 44 },
        { id: '4', status: 'ok', payload: 45 },
        { id: '5', status: 'ok', payload: 46 },
        { id: '6', status: 'ok', payload: 47 },
        { id: '7', status: 'ok', payload: 48 },
        { id: '8', status: 'ok', payload: 49 },
        { id: '9', status: 'ok', payload: 50 },
      ],
    },
  },
};

const WatchDuringDisconnect: Test = {
  unordered: true,
  clients: {
    client: {
      actions: [
        {
          type: 'invoke',
          id: '1',
          proc: 'kv.set',
          payload: { k: 'foo', v: 42 },
        },
        { type: 'wait_response', id: '1' },
        { type: 'disconnect_network' },
        { type: 'invoke', id: '2', proc: 'kv.watch', payload: { k: 'foo' } },
        { type: 'sleep', ms: WS_DISCONNECT_PERIOD_MS },
        { type: 'connect_network' },
        {
          type: 'invoke',
          id: '3',
          proc: 'kv.set',
          payload: { k: 'foo', v: 43 },
        },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 43 },
        { id: '3', status: 'ok', payload: 43 },
      ],
    },
  },
};

const ShortDisconnectMultipleTimes: Test = {
  clients: {
    client: {
      actions: [
        {
          type: 'invoke',
          id: '1',
          proc: 'kv.set',
          payload: { k: 'foo', v: 42 },
        },
        { type: 'invoke', id: '2', proc: 'kv.watch', payload: { k: 'foo' } },
        { type: 'wait_response', id: '2' },
        { type: 'disconnect_network' },
        { type: 'invoke', id: '3', proc: 'kv.watch', payload: { k: 'foo' } },
        { type: 'sleep', ms: WS_DISCONNECT_PERIOD_MS },
        { type: 'connect_network' },
        { type: 'sleep', ms: 500 },
        { type: 'disconnect_network' },
        { type: 'sleep', ms: WS_DISCONNECT_PERIOD_MS },
        { type: 'connect_network' },
        {
          type: 'invoke',
          id: '4',
          proc: 'kv.set',
          payload: { k: 'foo', v: 43 },
        },
        { type: 'wait_response', id: '4' },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 42 },
        { id: '3', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 43 },
        { id: '3', status: 'ok', payload: 43 },
        { id: '4', status: 'ok', payload: 43 },
      ],
    },
  },
};

const DisconnectMultipleTimes: Test = {
  flaky: true,
  clients: {
    client: {
      actions: [
        {
          type: 'invoke',
          id: '1',
          proc: 'kv.set',
          payload: { k: 'foo', v: 42 },
        },
        { type: 'wait_response', id: '1' },
        { type: 'disconnect_network' },
        { type: 'sleep', ms: SESSION_DISCONNECT_MS },
        { type: 'connect_network' },
        {
          type: 'invoke',
          id: '2',
          proc: 'kv.set',
          payload: { k: 'foo', v: 43 },
        },
        { type: 'wait_response', id: '2' },
        { type: 'disconnect_network' },
        { type: 'sleep', ms: SESSION_DISCONNECT_MS },
        { type: 'connect_network' },
        {
          type: 'invoke',
          id: '3',
          proc: 'kv.set',
          payload: { k: 'foo', v: 44 },
        },
        { type: 'wait_response', id: '3' },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 42 },
        // TODO: what should be the behavior here?
        { id: '2', status: 'ok', payload: 43 },
        { id: '3', status: 'ok', payload: 44 },
      ],
    },
  },
};

const ComplexSituation: Test = {
  flaky: true,
  clients: {
    client1: {
      actions: [
        {
          type: 'invoke',
          id: '1',
          proc: 'kv.set',
          payload: { k: 'foo', v: 42 },
        },
        { type: 'sleep', ms: SESSION_DISCONNECT_MS },
        { type: 'invoke', id: '2', proc: 'kv.watch', payload: { k: 'foo' } },
        {
          type: 'invoke',
          id: '3',
          proc: 'kv.set',
          payload: { k: 'foo', v: 43 },
        },
        { type: 'sleep', ms: WS_DISCONNECT_PERIOD_MS },
        { type: 'invoke', id: '4', proc: 'kv.watch', payload: { k: 'foo' } },
        {
          type: 'invoke',
          id: '5',
          proc: 'kv.set',
          payload: { k: 'foo', v: 44 },
        },
        { type: 'sleep', ms: SESSION_DISCONNECT_MS },
        { type: 'invoke', id: '6', proc: 'kv.watch', payload: { k: 'foo' } },
        {
          type: 'invoke',
          id: '7',
          proc: 'kv.set',
          payload: { k: 'foo', v: 45 },
        },
        { type: 'wait_response', id: '7' },
        { type: 'disconnect_network' },
        { type: 'sleep', ms: SESSION_DISCONNECT_MS },
        { type: 'connect_network' },
        {
          type: 'invoke',
          id: '11',
          proc: 'kv.set',
          payload: { k: 'foo', v: 42 },
        },
        { type: 'sleep', ms: SESSION_DISCONNECT_MS },
        { type: 'invoke', id: '12', proc: 'kv.watch', payload: { k: 'foo' } },
        {
          type: 'invoke',
          id: '13',
          proc: 'kv.set',
          payload: { k: 'foo', v: 43 },
        },
        { type: 'disconnect_network' },
        { type: 'sleep', ms: WS_DISCONNECT_PERIOD_MS },
        { type: 'connect_network' },
        { type: 'invoke', id: '14', proc: 'kv.watch', payload: { k: 'foo' } },
        {
          type: 'invoke',
          id: '15',
          proc: 'kv.set',
          payload: { k: 'foo', v: 44 },
        },
        { type: 'sleep', ms: SESSION_DISCONNECT_MS },
        { type: 'invoke', id: '16', proc: 'kv.watch', payload: { k: 'foo' } },
        {
          type: 'invoke',
          id: '17',
          proc: 'kv.set',
          payload: { k: 'foo', v: 45 },
        },
        { type: 'wait_response', id: '17' },
      ],

      expectedOutput: [
        { id: '1', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 42 },
        { id: '2', status: 'ok', payload: 43 },
        { id: '3', status: 'ok', payload: 43 },
        { id: '4', status: 'ok', payload: 43 },
        { id: '2', status: 'ok', payload: 44 },
        { id: '4', status: 'ok', payload: 44 },
        { id: '5', status: 'ok', payload: 44 },
        { id: '6', status: 'ok', payload: 44 },
        { id: '2', status: 'ok', payload: 45 },
        { id: '4', status: 'ok', payload: 45 },
        { id: '6', status: 'ok', payload: 45 },
        { id: '7', status: 'ok', payload: 45 },

        { id: '2', status: 'err', payload: 'UNEXPECTED_DISCONNECT' },
        { id: '4', status: 'err', payload: 'UNEXPECTED_DISCONNECT' },
        { id: '6', status: 'err', payload: 'UNEXPECTED_DISCONNECT' },

        { id: '11', status: 'ok', payload: 42 },
        { id: '12', status: 'ok', payload: 42 },
        { id: '12', status: 'ok', payload: 43 },
        { id: '13', status: 'ok', payload: 43 },
        { id: '14', status: 'ok', payload: 43 },
        { id: '12', status: 'ok', payload: 44 },
        { id: '14', status: 'ok', payload: 44 },
        { id: '15', status: 'ok', payload: 44 },
        { id: '16', status: 'ok', payload: 44 },
        { id: '12', status: 'ok', payload: 45 },
        { id: '14', status: 'ok', payload: 45 },
        { id: '16', status: 'ok', payload: 45 },
        { id: '17', status: 'ok', payload: 45 },
      ],
    },

    client2: {
      actions: [
        {
          type: 'invoke',
          id: '1',
          proc: 'kv.set',
          payload: { k: 'bar', v: 12 },
        },
        { type: 'sleep', ms: SESSION_DISCONNECT_MS },
        { type: 'invoke', id: '2', proc: 'kv.watch', payload: { k: 'bar' } },
        {
          type: 'invoke',
          id: '3',
          proc: 'kv.set',
          payload: { k: 'bar', v: 13 },
        },
        { type: 'sleep', ms: WS_DISCONNECT_PERIOD_MS },
        { type: 'invoke', id: '4', proc: 'kv.watch', payload: { k: 'bar' } },
        {
          type: 'invoke',
          id: '5',
          proc: 'kv.set',
          payload: { k: 'bar', v: 14 },
        },
        { type: 'invoke', id: '6', proc: 'kv.watch', payload: { k: 'bar' } },
        {
          type: 'invoke',
          id: '7',
          proc: 'kv.set',
          payload: { k: 'bar', v: 15 },
        },
        { type: 'wait_response', id: '7' },
        { type: 'disconnect_network' },
        { type: 'sleep', ms: SESSION_DISCONNECT_MS },
        { type: 'connect_network' },
        {
          type: 'invoke',
          id: '11',
          proc: 'kv.set',
          payload: { k: 'bar', v: 12 },
        },
        { type: 'sleep', ms: SESSION_DISCONNECT_MS },
        { type: 'invoke', id: '12', proc: 'kv.watch', payload: { k: 'bar' } },
        {
          type: 'invoke',
          id: '13',
          proc: 'kv.set',
          payload: { k: 'bar', v: 13 },
        },
        { type: 'disconnect_network' },
        { type: 'sleep', ms: WS_DISCONNECT_PERIOD_MS },
        { type: 'connect_network' },
        { type: 'invoke', id: '14', proc: 'kv.watch', payload: { k: 'bar' } },
        {
          type: 'invoke',
          id: '15',
          proc: 'kv.set',
          payload: { k: 'bar', v: 14 },
        },
        { type: 'sleep', ms: SESSION_DISCONNECT_MS },
        { type: 'invoke', id: '16', proc: 'kv.watch', payload: { k: 'bar' } },
        {
          type: 'invoke',
          id: '17',
          proc: 'kv.set',
          payload: { k: 'bar', v: 15 },
        },
        { type: 'wait_response', id: '17' },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 12 },
        { id: '2', status: 'ok', payload: 12 },
        { id: '2', status: 'ok', payload: 13 },
        { id: '3', status: 'ok', payload: 13 },
        { id: '4', status: 'ok', payload: 13 },
        { id: '2', status: 'ok', payload: 14 },
        { id: '4', status: 'ok', payload: 14 },
        { id: '5', status: 'ok', payload: 14 },
        { id: '6', status: 'ok', payload: 14 },
        { id: '2', status: 'ok', payload: 15 },
        { id: '4', status: 'ok', payload: 15 },
        { id: '6', status: 'ok', payload: 15 },
        { id: '7', status: 'ok', payload: 15 },

        { id: '2', status: 'err', payload: 'UNEXPECTED_DISCONNECT' },
        { id: '4', status: 'err', payload: 'UNEXPECTED_DISCONNECT' },
        { id: '6', status: 'err', payload: 'UNEXPECTED_DISCONNECT' },

        { id: '11', status: 'ok', payload: 12 },
        { id: '12', status: 'ok', payload: 12 },
        { id: '12', status: 'ok', payload: 13 },
        { id: '13', status: 'ok', payload: 13 },
        { id: '14', status: 'ok', payload: 13 },
        { id: '12', status: 'ok', payload: 14 },
        { id: '14', status: 'ok', payload: 14 },
        { id: '15', status: 'ok', payload: 14 },
        { id: '16', status: 'ok', payload: 14 },
        { id: '12', status: 'ok', payload: 15 },
        { id: '14', status: 'ok', payload: 15 },
        { id: '16', status: 'ok', payload: 15 },
        { id: '17', status: 'ok', payload: 15 },
      ],
    },
  },
};

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
