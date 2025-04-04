check-runner:
	npx tsc --noEmit
	npx eslint
	npx prettier --check src index.ts

format:
	npx prettier --write \
		src index.ts eslint.config.mjs tests \
		impls/node \
		impls/node-protocolv2

	uv run --directory impls/python ruff format .

check-node-v1:
	cd impls/node && \
	npm ci && \
	npx tsc --noEmit && \
	npx eslint && \
	npx prettier --check .

check-node-v2:
	cd impls/node-protocolv2 && \
	npm ci && \
	npx tsc --noEmit && \
	npx eslint && \
	npx prettier --check .

check-python:
	uv run --directory impls/python pyright .

schema.json:
	npm run dump

codegen-python: schema.json
	cd impls/python; \
	./generate_client.sh

codegen-python-v2:
	cd impls/python-protocolv2; \
	./generate_client.sh

start-node-protocolv2:
	cd impls/node-protocolv2 && \
		npm ci && \
		HEARTBEAT_MS=500 PORT=9887 SERVER_TRANSPORT_ID=server \
		npm run --silent start:server
