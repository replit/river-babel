#!/usr/bin/env bash

set -ex

REPO_ROOT_DIR="$(git rev-parse --show-toplevel)"

cd "${REPO_ROOT_DIR}/impls/python"

rm -rf \
  src/river_python_test/protos/*pb2* \
  src/river_python_test/protos/service_river.py \
  || true
git clean -fdx src/river_python_test/protos/ || true

mkdir -p src/river_python_test/protos

uv run python -m grpc_tools.protoc \
  --proto_path="${REPO_ROOT_DIR}/protos" \
  --python_out=./src \
  --mypy_out=./src \
  --grpc_python_out=./src \
  --mypy_grpc_out=./src \
  "${REPO_ROOT_DIR}/protos/testservice/protos/service.proto"

uv run python -m replit_river.codegen \
  server \
    --module testservice.protos \
    --output ./src/testservice/protos \
    "${REPO_ROOT_DIR}/protos/testservice/protos/service.proto"

uv run python -m replit_river.codegen \
  client \
    --output ./src/testservice/protos \
    --client-name TestCient \
    "${REPO_ROOT_DIR}/schema.json"

"${REPO_ROOT_DIR}/scripts/patch-grpc.sh" "$(pwd)"

if ! uv run ruff check --fix; then
  uv run ruff check --add-noqa
fi

uv run ruff format
uv run pyright .

echo "Completed"
