// driver actions for each container
export type CommonAction =
  | {
      type: 'sync';
      label: string;
      timeout?: number;
    }
  | {
      type: 'sleep';
      ms: number;
    }
  | {
      type: 'restart_container';
    }
  | {
      type: 'connect_network';
    }
  | {
      type: 'disconnect_network';
    }
  | {
      type: 'pause_container';
    }
  | {
      type: 'unpause_container';
    };

export type ClientAction =
  | CommonAction
  | InvokeAction
  | {
      type: 'wait_response';
      id: string;
      // If status/payload are set, only match the message if the payload of the response matches them.
      status?: 'ok' | 'err';
      payload?: string;
      timeout?: number;
    };

export type ServerAction = CommonAction;

export type InvokeAction =
  | {
      type: 'invoke';
      id: string;
      // rpc
      proc: 'kv.set';
      payload: { k: string; v: number };
    }
  | {
      type: 'invoke';
      id: string;
      // subscription
      proc: 'kv.watch';
      payload: { k: string };
    }
  | {
      type: 'invoke';
      id: string;
      // stream init
      proc: 'repeat.echo';
      init: Record<symbol, void>;
    }
  | {
      type: 'invoke';
      id: string;
      // stream payload
      proc: 'repeat.echo';
      payload: { s: string };
    }
  | {
      type: 'invoke';
      id: string;
      // stream init
      proc: 'repeat.echo_prefix';
      init: { prefix: string };
    }
  | {
      type: 'invoke';
      id: string;
      // stream payload
      proc: 'repeat.echo_prefix';
      payload: { str: string };
    }
  | {
      type: 'invoke';
      id: string;
      // upload init
      proc: 'upload.send';
      init: Record<symbol, void>;
    }
  | {
      type: 'invoke';
      id: string;
      // upload payload
      proc: 'upload.send';
      payload: { part: string };
    };

export interface ExpectedOutputEntry {
  id: string;
  status: 'ok' | 'err';
  payload: unknown;
}

export function serializeExpectedOutputEntry(entry: ExpectedOutputEntry) {
  return `${entry.id} -- ${entry.status}:${entry.payload}`;
}

export interface Test {
  clients: Record<
    string,
    {
      actions: ClientAction[];
      expectedOutput: ExpectedOutputEntry[];
    }
  >;
  server?: {
    serverActions: ServerAction[];
  };
  // Flaky means that failing a test case won't mark the test suite as failed.
  flaky?: boolean;
  // Unordered means that prior to diffing the output, it will be sorted lexicographically.
  // Useful for tests that have inherent racy output.
  unordered?: boolean;
}
