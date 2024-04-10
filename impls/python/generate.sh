poetry run python -m grpc_tools.protoc \
--proto_path=./protos/ \
--python_out=./protos/ \
--mypy_out=./protos/ \
--grpc_python_out=./protos/ \
--mypy_grpc_out=./protos/ \
./protos/service.proto

poetry run python -m river.codegen server --output ./protos ./protos/service.proto 
poetry run python -m river.codegen client --output ./protos/client_schema.py --client-name TestCient ../../schema.json