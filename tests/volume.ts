import type { ClientAction, ExpectedOutputEntry, Test } from '../src/actions';

const MANY = 5000;
const ManyRpcs: Test = {
  clients: {
    client: {
      actions: [
        ...Array.from(
          { length: MANY },
          (_, i): ClientAction => ({
            type: 'invoke',
            id: (i + 1).toString(),
            proc: 'kv.set',
            payload: { k: 'foo', v: i },
          }),
        ),
        { type: 'wait_response', id: MANY.toString(), timeout: 30000 },
      ],
      expectedOutput: Array.from({ length: MANY }, (_, i) => ({
        id: (i + 1).toString(),
        status: 'ok',
        payload: i,
      })),
    },
  },
};

const ManyStreams: Test = {
  clients: {
    client: {
      actions: [
        { type: 'invoke', id: '1', proc: 'repeat.echo', init: {} },
        ...Array.from(
          { length: MANY },
          (_, i): ClientAction => ({
            type: 'invoke',
            id: '1',
            proc: 'repeat.echo',
            payload: { s: (i + 1).toString() },
          }),
        ),
        {
          type: 'wait_response',
          id: '1',
          status: 'ok',
          payload: MANY.toString(),
          timeout: 30000,
        },
      ],
      expectedOutput: [
        ...Array.from(
          { length: MANY },
          (_, i): ExpectedOutputEntry => ({
            id: '1',
            status: 'ok',
            payload: (i + 1).toString(),
          }),
        ),
      ],
    },
  },
};

export default { ManyRpcs, ManyStreams };
