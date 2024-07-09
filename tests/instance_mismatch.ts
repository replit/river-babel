import type { Test } from '../src/actions';

const MismatchedClientInstanceDoesntGetResentStaleMessagesFromServer: Test = {
  clients: {
    client: {
      actions: [
        { type: 'invoke', id: '1', proc: 'upload.send', init: {} },
        {
          type: 'invoke',
          id: '1',
          proc: 'upload.send',
          payload: { part: 'abc' },
        },
        { type: 'restart_container' },
        { type: 'invoke', id: '1', proc: 'upload.send', init: {} },
        {
          type: 'invoke',
          id: '1',
          proc: 'upload.send',
          payload: { part: 'def' },
        },
        {
          type: 'invoke',
          id: '1',
          proc: 'upload.send',
          payload: { part: 'EOF' },
        },
      ],
      expectedOutput: [{ id: '1', status: 'ok', payload: 'def' }],
    },
  },
};

const MismatchedServerInstanceDoesntGetResentStaleMessagesFromClient: Test = {
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
        { type: 'sync', label: '1' },
        { type: 'invoke', id: '2', proc: 'upload.send', init: {} },
        {
          type: 'invoke',
          id: '2',
          proc: 'upload.send',
          payload: { part: 'abc' },
        },
        { type: 'wait_response', id: '2' },
        {
          type: 'invoke',
          id: '2',
          proc: 'upload.send',
          payload: { part: 'def' },
        },
        {
          type: 'invoke',
          id: '2',
          proc: 'upload.send',
          payload: { part: 'EOF' },
        },
      ],
      expectedOutput: [
        { id: '1', status: 'ok', payload: 42 },
        { id: '2', status: 'err', payload: 'UNEXPECTED_DISCONNECT' },
      ],
    },
  },
  server: {
    serverActions: [
      { type: 'sync', label: '1' },
      { type: 'restart_container' },
    ],
  },
};

export default {
  MismatchedClientInstanceDoesntGetResentStaleMessagesFromServer,
  MismatchedServerInstanceDoesntGetResentStaleMessagesFromClient,
};
