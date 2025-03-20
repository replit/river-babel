import { WebSocket } from 'ws';
import { WebSocketClientTransport } from '@replit/river/transport/ws/client';
import readline from 'node:readline';
import { createClient, type Server } from '@replit/river';
import type { TransportOptions } from '@replit/river/transport';
import { BinaryCodec } from '@replit/river/codec';
import type { serviceDefs } from './serviceDefs';
import type { Pushable } from 'it-pushable';
import assert from 'node:assert';

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

const handles = new Map<string, Pushable<unknown>>();
for await (const line of rl) {
  const { id, init, payload, proc } = (() => {
    try {
      return JSON.parse(line);
    } catch (e: any) {
      // Sometimes docker injects this into the stream:
      // {"hijack":true,"stream":true,"stdin":true,"stdout":true,"stderr":true}{"type": "invoke", ...
      const match = e.message.match(/line (\d*) column (\d*)/);
      if (!!match) {
        const offset = parseInt(match['2'], 10);
        const first = JSON.parse(line.substring(0, offset));
        assert(
          'hijack' in first,
          'The only syntax errors that we expect are that Docker jams stuff into the stream',
        );
        return JSON.parse(line.substring(offset));
      } else {
        throw `Here we are: ${e}`;
      }
    }
  })();

  switch (proc) {
    case 'kv.set': {
      const { k, v } = payload;
      const res = await client.kv.set.rpc({ k, v: parseInt(v) });
      if (res.ok) {
        console.log(`${id} -- ok:${res.payload.v}`);
      } else {
        console.log(`${id} -- err:${res.payload.code}`);
      }
      break;
    }
    case 'kv.watch': {
      const { k } = payload;
      const [res] = await client.kv.watch.subscribe({ k });
      (async () => {
        for await (const v of res) {
          if (v.ok) {
            console.log(`${id} -- ok:${v.payload.v}`);
          } else {
            console.log(`${id} -- err:${v.payload.code}`);
          }
        }
      })();
      break;
    }
    case 'repeat.echo': {
      if (!handles.has(id)) {
        // init
        const [input, output] = await client.repeat.echo.stream();
        (async () => {
          for await (const v of output) {
            if (v.ok) {
              console.log(`${id} -- ok:${v.payload.out}`);
            } else {
              console.log(`${id} -- err:${v.payload.code}`);
            }
          }
        })();

        handles.set(id, input);
      } else {
        const { s } = payload;
        handles.get(id)!.push({ str: s });
      }
      break;
    }
    case 'repeat.echo_prefix': {
      if (!handles.has(id)) {
        assert(
          init !== undefined,
          'Expected to find "init" in the first message',
        );
        const [input, output] = await client.repeat.echo_prefix.stream({
          prefix: init.prefix,
        });
        (async () => {
          for await (const v of output) {
            if (v.ok) {
              console.log(`${id} -- ok:${v.payload.out}`);
            } else {
              console.log(`${id} -- err:${v.payload.code}`);
            }
          }
        })();

        handles.set(id, input);
      } else {
        const { str } = payload;
        handles.get(id)!.push({ str });
      }
      break;
    }
    case 'upload.send': {
      if (!handles.has(id)) {
        const [input, res] = await client.upload.send.upload();

        if (!!payload && 'part' in payload) {
          // For UploadNoInit
          input.push({ part: payload.part });
        }

        handles.set(id, input);

        (async () => {
          const final = await res;
          if (final.ok) {
            console.log(`${id} -- ok:${final.payload.doc}`);
          } else {
            console.log(`${id} -- err:${final.payload.code}`);
          }
        })();
      } else {
        const { part } = payload;
        handles.get(id)!.push({ part });
      }
      break;
    }
  }
}
