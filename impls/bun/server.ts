import http from "http";
import { WebSocketServer } from "ws";
import { WebSocketServerTransport } from "@replit/river/transport/ws/server";
import { createServer } from "@replit/river";
import type { TransportOptions } from "@replit/river/transport";
import { BinaryCodec } from "@replit/river/codec";
import { bindLogger } from "@replit/river/logging";
import { serviceDefs } from "./serviceDefs";

const {
  PORT,
  SERVER_TRANSPORT_ID,
  HEARTBEAT_MS,
  HEARTBEATS_UNTIL_DEAD,
  SESSION_DISCONNECT_GRACE_MS,
} = process.env as Record<string, string>;
const transportOptions: Partial<TransportOptions> = {
  codec: BinaryCodec,
  heartbeatIntervalMs: parseInt(HEARTBEAT_MS),
  heartbeatsUntilDead: parseInt(HEARTBEATS_UNTIL_DEAD),
  sessionDisconnectGraceMs: parseInt(SESSION_DISCONNECT_GRACE_MS),
};

bindLogger(
  (msg, ctx, level) =>
    process.stderr.write(`[${level}]: ${msg}: ${JSON.stringify(ctx)}\n`),
  "debug",
);

const httpServer = http.createServer();
const wss = new WebSocketServer({ server: httpServer });
const transport = new WebSocketServerTransport(
  wss,
  SERVER_TRANSPORT_ID,
  transportOptions,
);
export const server = createServer(transport, serviceDefs);
export type ServiceSurface = typeof server;

httpServer.listen(parseInt(PORT));
