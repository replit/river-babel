import type { Test } from "../src/actions";

const MismatchedClientInstanceDoesntGetResentStaleMessagesFromServer: Test = {
  clients: {
    client: {
      actions: [
        { type: "invoke", id: "1", proc: "upload.send", init: {} },
        {
          type: "invoke",
          id: "1",
          proc: "upload.send",
          payload: { part: "abc" },
        },
        { type: "restart_container" },
        { type: "invoke", id: "1", proc: "upload.send", init: {} },
        {
          type: "invoke",
          id: "1",
          proc: "upload.send",
          payload: { part: "def" },
        },
        {
          type: "invoke",
          id: "1",
          proc: "upload.send",
          payload: { part: "EOF" },
        },
      ],
      expectedOutput: [{ id: "1", status: "ok", payload: "def" }],
    },
  },
};

const MismatchedServerInstanceDoesntGetResentStaleMessagesFromClient: Test = {
  flaky: true,
  clients: {
    client: {
      actions: [
        { type: "invoke", id: "1", proc: "upload.send", init: {} },
        {
          type: "invoke",
          id: "1",
          proc: "upload.send",
          payload: { part: "abc" },
        },
        { type: "sleep", ms: 3000 },
        {
          type: "invoke",
          id: "1",
          proc: "upload.send",
          payload: { part: "def" },
        },
        {
          type: "invoke",
          id: "1",
          proc: "upload.send",
          payload: { part: "EOF" },
        },
      ],
      expectedOutput: [
        { id: "1", status: "err", payload: "UNEXPECTED_DISCONNECT" },
      ],
    },
  },
  server: {
    serverActions: [{ type: "sleep", ms: 100 }, { type: "restart_container" }],
  },
};

export default {
  MismatchedClientInstanceDoesntGetResentStaleMessagesFromServer,
  MismatchedServerInstanceDoesntGetResentStaleMessagesFromClient,
};
