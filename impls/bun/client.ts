import { WebSocket } from "ws";
import { WebSocketClientTransport } from "@replit/river/transport/ws/client";
import readline from 'node:readline';
import { createClient, type Server } from "@replit/river";
import type { TransportOptions } from "@replit/river/transport";
import { BinaryCodec } from "@replit/river/codec";
import { bindLogger, log, setLevel } from "@replit/river/logging";
import type { serviceDefs } from "./serviceDefs";

const {
  PORT,
  CLIENT_TRANSPORT_ID,
  SERVER_TRANSPORT_ID,
  HEARTBEAT_MS,
  HEARTBEATS_TO_DEAD,
  SESSION_DISCONNECT_GRACE_MS,
} = process.env as Record<string, string>;
const transportOptions: Partial<TransportOptions> = {
  codec: BinaryCodec,
  heartbeatIntervalMs: parseInt(HEARTBEAT_MS),
  heartbeatsUntilDead: parseInt(HEARTBEATS_TO_DEAD),
  sessionDisconnectGraceMs: parseInt(SESSION_DISCONNECT_GRACE_MS),
}

bindLogger(l => process.stderr.write(l + '\n'), true);
setLevel("debug");

const clientTransport = new WebSocketClientTransport(
  () => Promise.resolve(new WebSocket(`ws://river-server:${PORT}`)),
  CLIENT_TRANSPORT_ID,
  transportOptions,
);

const client = createClient<Server<typeof serviceDefs>>(clientTransport, SERVER_TRANSPORT_ID, true);

// listen for jepsen driver commands
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  const match = line.match(/(?<id>\w+) -- (?:(?<svc>\w+)\.(?<proc>\w+) )?-> ?(?<payload>.*)/);
  if (!match || !match.groups) {
    console.error("FATAL: invalid command", line);
    process.exit(1);
  }

  const { id, svc, proc, payload } = match.groups;
  if (svc === 'kv') {
    if (proc === 'set') {
      const [k, v] = payload.split(' ');
      const res = await client.kv.set.rpc({k, v: parseInt(v)});
      if (res.ok) {
        console.log(`${id} -- ok:${res.payload.v}`);
      } else {
        console.log(`${id} -- err:${res.payload.code}`);
      }
    } else if (proc === "watch") {
      const [res] = await client.kv.watch.subscribe({k: payload});
      (async () => {
        for await (const v of res) {
          if (v.ok) {
            console.log(`${id} -- ok:${v.payload.v}`);
          } else {
            console.log(`${id} -- err:${v.payload.code}`);
          }
        }
      })();
    }
  }
});
