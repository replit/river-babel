import type { Test } from '../src/actions';

// This test is mainly for backwards compatiblity purposes
// see https://github.com/replit/river/pull/236

const UploadNoInit: Test = {
  clients: {
    client: {
      actions: [
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

export default { UploadNoInit };
