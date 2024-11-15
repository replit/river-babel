poetry run python -m grpc_tools.protoc \
  --proto_path=./src \
  --python_out=./src \
  --mypy_out=./src \
  --grpc_python_out=./src \
  --mypy_grpc_out=./src \
  ./src/river_python_test/protos/service.proto

poetry run python -m river.codegen server --output ./src/protos ./src/river_python_test/protos/service.proto
poetry run python -m river.codegen client --output ./src/protos/client_schema.py --client-name TestCient ./src/schema.json

echo "Completed"
