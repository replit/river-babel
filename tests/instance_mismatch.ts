import type { Test } from "../src/actions";

const MismatchedClientInstanceDoesntGetResentStaleMessagesFromServer: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "upload.send", init: {} },
      { type: "invoke", id: "1", proc: "upload.send", payload: { part: "abc" } },
      { type: "restart_container" },
      { type: "invoke", id: "1", proc: "upload.send", init: {} },
      { type: "invoke", id: "1", proc: "upload.send", payload: { part: "def" } },
      { type: "invoke", id: "1", proc: "upload.send", payload: { part: "EOF" } },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: "def" },
    ],
  }
}

const MismatchedServerInstanceDoesntGetResentStaleMessagesFromClient: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "upload.send", init: {} },
      { type: "invoke", id: "1", proc: "upload.send", payload: { part: "abc" } },
      { type: "wait", ms: 3000 },
      { type: "invoke", id: "1", proc: "upload.send", payload: { part: "def" } },
      { type: "invoke", id: "1", proc: "upload.send", payload: { part: "EOF" } },
    ],
    expectedOutput: [
      { id: "1", status: "err", payload: "UNEXPECTED_DISCONNECT" },
    ],
  },
  server: {
    serverActions: [
      { type: "wait", ms: 100 },
      { type: "restart_container" },
    ]
  }
}

export default {
  MismatchedClientInstanceDoesntGetResentStaleMessagesFromServer,
  MismatchedServerInstanceDoesntGetResentStaleMessagesFromClient
}