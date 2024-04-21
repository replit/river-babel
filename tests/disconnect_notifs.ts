import type { Test } from "../src/actions";
import { SESSION_DISCONNECT_MS } from "./constants";

const RpcDisconnectNotifs: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      // invoking after disconnected should eventually tell us unexpected disconnect
      { type: "invoke", id: "2", proc: "kv.set", payload: { k: "foo", v: 43 } },
      { type: "wait", ms: SESSION_DISCONNECT_MS },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "err", payload: "UNEXPECTED_DISCONNECT" },
    ],
  },
};

const SubscribeDisconnectNotifs: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "invoke", id: "2", proc: "kv.watch", payload: { k: "foo" } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      { type: "wait", ms: SESSION_DISCONNECT_MS },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 42 },
      { id: "2", status: "err", payload: "UNEXPECTED_DISCONNECT" },
    ],
  },
};

const StreamDisconnectNotifs: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "repeat.echo", init: {} },
      { type: "invoke", id: "1", proc: "repeat.echo", payload: { s: "hello" } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      { type: "wait", ms: SESSION_DISCONNECT_MS },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: "hello" },
      { id: "1", status: "err", payload: "UNEXPECTED_DISCONNECT" },
    ],
  },
};

const UploadDisconnectNotifs: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "upload.send", init: {} },
      { type: "invoke", id: "1", proc: "upload.send", payload: { part: "abc" } },
      { type: "invoke", id: "1", proc: "upload.send", payload: { part: "def" } },
      { type: "wait", ms: 500 },
      { type: "disconnect_network" },
      { type: "wait", ms: SESSION_DISCONNECT_MS },
    ],
    expectedOutput: [{ id: "1", status: "err", payload: "UNEXPECTED_DISCONNECT" }],
  },
};

export default {
  RpcDisconnectNotifs, SubscribeDisconnectNotifs, StreamDisconnectNotifs, UploadDisconnectNotifs

};
