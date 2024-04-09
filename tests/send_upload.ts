import type { Test } from "../src/actions";

export const UploadSendTest: Test = {
  client: {
    actions: [
      { type: "invoke", id: "1", proc: "upload.send", init: {} },
      { type: "invoke", id: "1", proc: "upload.send", payload: { part: "abc" } },
      { type: "invoke", id: "1", proc: "upload.send", payload: { part: "def" } },
      { type: "invoke", id: "1", proc: "upload.send", payload: { part: "EOF" } },
    ],
    expectedOutput: [{ id: "1", status: "ok", payload: "abcdef" }],
  },
};

