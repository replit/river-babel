/** @format */

import { WebSocket } from 'ws';
import { WebSocketClientTransport } from 'protocolv2/transport/ws/client';
import readline from 'node:readline';
import { createClient, type Result, type Writable } from 'protocolv2';
import type { TransportOptions } from 'protocolv2/transport';
import { BinaryCodec } from 'protocolv2/codec';
import type { serviceDefs } from './serviceDefs';

const {
  PORT,
  CLIENT_TRANSPORT_ID,
  SERVER_TRANSPORT_ID,
  HEARTBEAT_MS,
  HEARTBEATS_UNTIL_DEAD,
  SESSION_DISCONNECT_GRACE_MS,
  RIVER_SERVER,
} = process.env as Record<string, string>;
const transportOptions: Partial<TransportOptions> = {
  codec: BinaryCodec,
  heartbeatIntervalMs: parseInt(HEARTBEAT_MS),
  heartbeatsUntilDead: parseInt(HEARTBEATS_UNTIL_DEAD),
  sessionDisconnectGraceMs: parseInt(SESSION_DISCONNECT_GRACE_MS),
};

const clientTransport = new WebSocketClientTransport(
  () =>
    (async (): Promise<WebSocket> => {
      const ws = new WebSocket(`ws://${RIVER_SERVER}:${PORT}`);
      // Explicitly set an error handler to avoid unhandled exceptions.
      ws.on('error', (err) => {
        console.error(err);
      });
      return ws;
    })(),
  CLIENT_TRANSPORT_ID,
  transportOptions,
);
clientTransport.bindLogger(
  (msg, ctx, level) =>
    process.stderr.write(`[${level}]: ${msg}: ${JSON.stringify(ctx)}\n`),
  'debug',
);

const client = createClient<typeof serviceDefs>(
  clientTransport,
  SERVER_TRANSPORT_ID,
  {
    connectOnInvoke: true,
    eagerlyConnect: true,
  },
);

// listen for jepsen driver commands
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

const handles = new Map<
  // proc ID
  string,
  {
    writer: Writable<unknown>;
    // upload has a finalize function
    finalize?: () => Promise<Result<any, { code: string; message: string }>>;
  }
>();

for await (const line of rl) {
  const match = line.match(
    /(?<id>\w+) -- (?<svc>\w+)\.(?<proc>\w+) -> ?(?<payload>.*)/,
  );
  if (!match || !match.groups) {
    console.error('FATAL: invalid command', line);
    process.exit(1);
  }

  const { id, svc, proc, payload } = match.groups;
  if (svc === 'kv') {
    if (proc === 'set') {
      const [k, v] = payload.split(' ');
      const res = await client.kv.set.rpc({ k, v: parseInt(v) });
      if (res.ok) {
        console.log(`${id} -- ok:${res.payload.v}`);
      } else {
        console.log(`${id} -- err:${res.payload.code}`);
      }
    } else if (proc === 'watch') {
      const res = client.kv.watch.subscribe({ k: payload });
      (async () => {
        for await (const v of res.resReadable) {
          if (v.ok) {
            console.log(`${id} -- ok:${v.payload.v}`);
          } else {
            console.log(`${id} -- err:${v.payload.code}`);
          }
        }
      })();
    }
  } else if (svc === 'repeat') {
    if (proc === 'echo') {
      const handle = handles.get(id);
      if (!handle) {
        const { reqWritable, resReadable } = client.repeat.echo.stream({});
        (async () => {
          for await (const v of resReadable) {
            if (v.ok) {
              console.log(`${id} -- ok:${v.payload.out}`);
            } else {
              console.log(`${id} -- err:${v.payload.code}`);
            }
          }
        })();

        handles.set(id, { writer: reqWritable });
      } else {
        handle.writer.write({ str: payload });
      }
    } else if (proc === 'echo_prefix') {
      const handle = handles.get(id);
      if (!handle) {
        const { reqWritable, resReadable } =
          await client.repeat.echo_prefix.stream({
            prefix: payload,
          });
        (async () => {
          for await (const v of resReadable) {
            if (v.ok) {
              console.log(`${id} -- ok:${v.payload.out}`);
            } else {
              console.log(`${id} -- err:${v.payload.code}`);
            }
          }
        })();

        handles.set(id, { writer: reqWritable });
      } else {
        handle.writer.write({ str: payload });
      }
    }
  } else if (svc === 'upload') {
    if (proc === 'send') {
      const handle = handles.get(id);
      if (!handle) {
        const { reqWritable, finalize } = client.upload.send.upload({});

        if (payload !== '') {
          // For UploadNoInit
          reqWritable.write({ part: payload });
        }

        handles.set(id, { writer: reqWritable, finalize });
      } else {
        if (handle.writer.isWritable()) {
          handle.writer.write({ part: payload });
        }

        if (
          payload === 'EOF' ||
          // the closed condition will always lead to UNEXPECTED_DISCONNECT
          // returned from finalize we do this to match other implementation
          !handle.writer.isWritable()
        ) {
          if (!handle.finalize) {
            throw new Error('Expected upload handle to have a finalizer');
          }

          const final = await handle.finalize();

          if (final.ok) {
            console.log(`${id} -- ok:${final.payload.doc}`);
          } else {
            console.log(`${id} -- err:${final.payload.code}`);
          }
        }
      }
    }
  }
}
