import type { Test } from "../src/actions";

export const RepeatEchoTest: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "repeat.echo", init: {} },
      { type: "invoke", id: "1", proc: "repeat.echo", payload: { s: "hello" } },
      { type: "invoke", id: "1", proc: "repeat.echo", payload: { s: "world" } },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: "hello" },
      { id: "1", status: "ok", payload: "world" },
    ],
  },
};

export const RepeatEchoPrefixTest: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "repeat.echo_prefix", init: { prefix: "prefix: " } },
      { type: "invoke", id: "1", proc: "repeat.echo_prefix", payload: { str: "hello" } },
      { type: "invoke", id: "1", proc: "repeat.echo_prefix", payload: { str: "world" } },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: "prefix: hello" },
      { id: "1", status: "ok", payload: "prefix: world" },
    ],
  },
};
