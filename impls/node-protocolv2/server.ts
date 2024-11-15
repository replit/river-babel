/** @format */

import http from 'http';
import { WebSocketServer } from 'ws';
import { WebSocketServerTransport } from 'protocolv2/transport/ws/server';
import { createServer } from 'protocolv2';
import type { TransportOptions } from 'protocolv2/transport';
import { BinaryCodec } from 'protocolv2/codec';
import { serviceDefs } from './serviceDefs';

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

const httpServer = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.end('OK');
    return;
  }
  res.statusCode = 426;
  res.end('Upgrade required');
});
const wss = new WebSocketServer({ server: httpServer });
const transport = new WebSocketServerTransport(
  wss,
  SERVER_TRANSPORT_ID,
  transportOptions,
);
transport.bindLogger(
  (msg, ctx, level) =>
    process.stderr.write(`[${level}]: ${msg}: ${JSON.stringify(ctx)}\n`),
  'debug',
);
export const server = createServer(transport, serviceDefs);
export type ServiceSurface = typeof server;

const startTime = Date.now();
httpServer.listen(parseInt(PORT), () => {
  transport.log?.debug(`server listening on ${PORT}`);
  transport.log?.debug(`server started in ${Date.now() - startTime}ms`);
});
