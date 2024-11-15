poetry run python -m grpc_tools.protoc \
  --proto_path=./ \
  --python_out=./ \
  --mypy_out=./ \
  --grpc_python_out=./ \
  --mypy_grpc_out=./ \
  ./protos/service.proto

poetry run python -m river.codegen server --output ./protos ./protos/service.proto 
poetry run python -m river.codegen client --output ./protos/client_schema.py --client-name TestCient ./schema.json

echo "Completed"
