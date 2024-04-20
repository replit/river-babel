import type { Test } from "../src/actions";

const ComplexInterleavingAllProcedures: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "kv.set", payload: { k: "foo", v: 42 } },
      { type: "invoke", id: "2", proc: "kv.watch", payload: { k: "foo" } },
      { type: "invoke", id: "3", proc: "repeat.echo", init: {} },
      { type: "invoke", id: "3", proc: "repeat.echo", payload: { s: "hello" } },
      { type: "invoke", id: "4", proc: "upload.send", init: {} },
      { type: "invoke", id: "4", proc: "upload.send", payload: { part: "abc" } },
      { type: "invoke", id: "3", proc: "repeat.echo", payload: { s: "world" } },
      { type: "invoke", id: "4", proc: "upload.send", payload: { part: "def" } },
      { type: "invoke", id: "5", proc: "kv.set", payload: { k: "foo", v: 1 } },
      { type: "invoke", id: "4", proc: "upload.send", payload: { part: "EOF" } },
    ],
    expectedOutput: [
      { id: "1", status: "ok", payload: 42 },
      { id: "2", status: "ok", payload: 42 },
      { id: "3", status: "ok", payload: "hello" },
      { id: "3", status: "ok", payload: "world" },
      { id: "2", status: "ok", payload: 1 },
      { id: "5", status: "ok", payload: 1 },
      { id: "4", status: "ok", payload: "abcdef" },
    ],
  }
}

export default { ComplexInterleavingAllProcedures };