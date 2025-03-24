#!/usr/bin/env bash

uv run python -m grpc_tools.protoc \
  --proto_path=../../protos \
  --python_out=./src \
  --mypy_out=./src \
  --grpc_python_out=./src \
  --mypy_grpc_out=./src \
  ../../protos/river_python_test/protos/service.proto

uv run python -m replit_river.codegen server --output ./src/river_python_test/protos ./src/river_python_test/protos/service.proto
uv run python -m replit_river.codegen client --output ./src/river_python_test/protos/client_schema.py --client-name TestCient ../../schema.json

echo "Completed"
