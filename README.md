# river-babel

cross-language test-suite

## running tests

- `npm run start -- --client <impl> --server <impl>`
  - you can see valid impls under `impls` (currently `python` and `node`).
- if you are planning on running python tests, you should clone the `python-river`
  submodule: `git submodule update --init`

## adding a client or server

- assume WebSocket transport + Binary codec
- client should be driven by stdio
- all debug logs should be written to stderr

- Environment variables you should handle:
  - `PORT`
  - `CLIENT_TRANSPORT_ID`
  - `SERVER_TRANSPORT_ID`
  - `HEARTBEAT_MS`
  - `HEARTBEATS_UNTIL_DEAD`
  - `SESSION_DISCONNECT_GRACE_MS`

## workloads

### kv

1. `rpc set(k,v) -> v`
2. `subscribe watch(k) -> updates to v | err if k does not exist`

### repeat

1. `stream echo(s) -> s`
2. `stream echo_prefix(init: prefix, s) -> prefix + s`

### upload

1. `upload send(part) -> total str after EOF received`

## adding clients

- all clients should have their own transport client id describing itself (e.g. `bun-client`)
- should listen on stdio for instructions

simplified instruction DSL

- id is generated per rpc to distinguish responses
- inputs are `id -- svc proc -> ...args`
- outputs are `id -- ok:resp | err:code`

```
# kv
id -- kv.set -> k v
id -- kv.subscribe -> k

# echo
id -- repeat.echo ->
id -- repeat.echo_prefix -> prefix

# upload
id -- upload.send ->

# (meta) push to existing stream
id -- {svc}.{proc} -> payload
```
