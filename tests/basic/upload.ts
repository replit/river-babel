import type { Test } from '../../src/actions';

const UploadSendTest: Test = {
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
      expectedOutput: [{ id: '1', status: 'ok', payload: 'abcdef' }],
    },
  },
};

export default { UploadSendTest };
