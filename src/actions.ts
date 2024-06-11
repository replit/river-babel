// driver actions for each container
export type CommonAction =
  | {
      type: "sleep";
      ms: number;
    }
  | {
      type: "restart_container";
    }
  | {
      type: "connect_network";
    }
  | {
      type: "disconnect_network";
    }
  | {
      type: "pause_container";
    }
  | {
      type: "unpause_container";
    };

export type ClientAction =
  | CommonAction
  | InvokeAction
  | {
      type: "wait_response";
      id: string;
      // If status/payload are set, only match the message if the payload of the response matches them.
      status?: "ok" | "err";
      payload?: string;
      timeout?: number;
    };

export type ServerAction = CommonAction;

export type InvokeAction =
  | {
      type: "invoke";
      id: string;
      // rpc
      proc: "kv.set";
      payload: { k: string; v: number };
    }
  | {
      type: "invoke";
      id: string;
      // subscription
      proc: "kv.watch";
      payload: { k: string };
    }
  | {
      type: "invoke";
      id: string;
      // stream init
      proc: "repeat.echo";
      init: {};
    }
  | {
      type: "invoke";
      id: string;
      // stream payload
      proc: "repeat.echo";
      payload: { s: string };
    }
  | {
      type: "invoke";
      id: string;
      // stream init
      proc: "repeat.echo_prefix";
      init: { prefix: string };
    }
  | {
      type: "invoke";
      id: string;
      // stream payload
      proc: "repeat.echo_prefix";
      payload: { str: string };
    }
  | {
      type: "invoke";
      id: string;
      // upload init
      proc: "upload.send";
      init: {};
    }
  | {
      type: "invoke";
      id: string;
      // upload payload
      proc: "upload.send";
      payload: { part: string };
    };

export function serializeInvokeAction(action: InvokeAction) {
  let payload: string = "";
  if (action.proc === "kv.set") {
    payload = `${action.payload.k} ${action.payload.v}`;
  } else if (action.proc === "kv.watch") {
    payload = action.payload.k;
  } else if (action.proc === "repeat.echo") {
    if ("init" in action) {
      payload = "";
    } else {
      payload = action.payload.s;
    }
  } else if (action.proc === "repeat.echo_prefix") {
    if ("init" in action) {
      payload = action.init.prefix;
    } else {
      payload = action.payload.str;
    }
  } else if (action.proc === "upload.send") {
    if ("init" in action) {
      payload = "";
    } else {
      payload = action.payload.part;
    }
  }

  const serialized = `${action.id} -- ${action.proc} -> ${payload}`;
  return serialized;
}

export type ExpectedOutputEntry = {
  id: string;
  status: "ok" | "err";
  payload: unknown;
};

export function serializeExpectedOutputEntry(entry: ExpectedOutputEntry) {
  return `${entry.id} -- ${entry.status}:${entry.payload}`;
}

export type Test = {
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
  flaky?: boolean;
};
