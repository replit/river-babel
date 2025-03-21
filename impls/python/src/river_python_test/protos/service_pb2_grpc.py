# Generated by the gRPC Python protocol compiler plugin. DO NOT EDIT!
"""Client and server classes corresponding to protobuf-defined services."""
import grpc

from river_python_test.protos import (
    service_pb2 as river__python__test_dot_protos_dot_service__pb2,
)


class kvStub(object):
    """Missing associated documentation comment in .proto file."""

    def __init__(self, channel):
        """Constructor.

        Args:
            channel: A grpc.Channel.
        """
        self.set = channel.unary_unary(
            "/replit.river.test.kv/set",
            request_serializer=river__python__test_dot_protos_dot_service__pb2.KVRequest.SerializeToString,
            response_deserializer=river__python__test_dot_protos_dot_service__pb2.KVResponse.FromString,
        )
        self.watch = channel.unary_stream(
            "/replit.river.test.kv/watch",
            request_serializer=river__python__test_dot_protos_dot_service__pb2.KVRequest.SerializeToString,
            response_deserializer=river__python__test_dot_protos_dot_service__pb2.KVResponse.FromString,
        )


class kvServicer(object):
    """Missing associated documentation comment in .proto file."""

    def set(self, request, context):
        """Missing associated documentation comment in .proto file."""
        context.set_code(grpc.StatusCode.UNIMPLEMENTED)
        context.set_details("Method not implemented!")
        raise NotImplementedError("Method not implemented!")

    def watch(self, request, context):
        """Missing associated documentation comment in .proto file."""
        context.set_code(grpc.StatusCode.UNIMPLEMENTED)
        context.set_details("Method not implemented!")
        raise NotImplementedError("Method not implemented!")


def add_kvServicer_to_server(servicer, server):
    rpc_method_handlers = {
        "set": grpc.unary_unary_rpc_method_handler(
            servicer.set,
            request_deserializer=river__python__test_dot_protos_dot_service__pb2.KVRequest.FromString,
            response_serializer=river__python__test_dot_protos_dot_service__pb2.KVResponse.SerializeToString,
        ),
        "watch": grpc.unary_stream_rpc_method_handler(
            servicer.watch,
            request_deserializer=river__python__test_dot_protos_dot_service__pb2.KVRequest.FromString,
            response_serializer=river__python__test_dot_protos_dot_service__pb2.KVResponse.SerializeToString,
        ),
    }
    generic_handler = grpc.method_handlers_generic_handler(
        "replit.river.test.kv", rpc_method_handlers
    )
    server.add_generic_rpc_handlers((generic_handler,))


# This class is part of an EXPERIMENTAL API.
class kv(object):
    """Missing associated documentation comment in .proto file."""

    @staticmethod
    def set(
        request,
        target,
        options=(),
        channel_credentials=None,
        call_credentials=None,
        insecure=False,
        compression=None,
        wait_for_ready=None,
        timeout=None,
        metadata=None,
    ):
        return grpc.experimental.unary_unary(
            request,
            target,
            "/replit.river.test.kv/set",
            river__python__test_dot_protos_dot_service__pb2.KVRequest.SerializeToString,
            river__python__test_dot_protos_dot_service__pb2.KVResponse.FromString,
            options,
            channel_credentials,
            insecure,
            call_credentials,
            compression,
            wait_for_ready,
            timeout,
            metadata,
        )

    @staticmethod
    def watch(
        request,
        target,
        options=(),
        channel_credentials=None,
        call_credentials=None,
        insecure=False,
        compression=None,
        wait_for_ready=None,
        timeout=None,
        metadata=None,
    ):
        return grpc.experimental.unary_stream(
            request,
            target,
            "/replit.river.test.kv/watch",
            river__python__test_dot_protos_dot_service__pb2.KVRequest.SerializeToString,
            river__python__test_dot_protos_dot_service__pb2.KVResponse.FromString,
            options,
            channel_credentials,
            insecure,
            call_credentials,
            compression,
            wait_for_ready,
            timeout,
            metadata,
        )


class repeatStub(object):
    """Missing associated documentation comment in .proto file."""

    def __init__(self, channel):
        """Constructor.

        Args:
            channel: A grpc.Channel.
        """
        self.echo = channel.stream_stream(
            "/replit.river.test.repeat/echo",
            request_serializer=river__python__test_dot_protos_dot_service__pb2.EchoInput.SerializeToString,
            response_deserializer=river__python__test_dot_protos_dot_service__pb2.EchoOutput.FromString,
        )


class repeatServicer(object):
    """Missing associated documentation comment in .proto file."""

    def echo(self, request_iterator, context):
        """Missing associated documentation comment in .proto file."""
        context.set_code(grpc.StatusCode.UNIMPLEMENTED)
        context.set_details("Method not implemented!")
        raise NotImplementedError("Method not implemented!")


def add_repeatServicer_to_server(servicer, server):
    rpc_method_handlers = {
        "echo": grpc.stream_stream_rpc_method_handler(
            servicer.echo,
            request_deserializer=river__python__test_dot_protos_dot_service__pb2.EchoInput.FromString,
            response_serializer=river__python__test_dot_protos_dot_service__pb2.EchoOutput.SerializeToString,
        ),
    }
    generic_handler = grpc.method_handlers_generic_handler(
        "replit.river.test.repeat", rpc_method_handlers
    )
    server.add_generic_rpc_handlers((generic_handler,))


# This class is part of an EXPERIMENTAL API.
class repeat(object):
    """Missing associated documentation comment in .proto file."""

    @staticmethod
    def echo(
        request_iterator,
        target,
        options=(),
        channel_credentials=None,
        call_credentials=None,
        insecure=False,
        compression=None,
        wait_for_ready=None,
        timeout=None,
        metadata=None,
    ):
        return grpc.experimental.stream_stream(
            request_iterator,
            target,
            "/replit.river.test.repeat/echo",
            river__python__test_dot_protos_dot_service__pb2.EchoInput.SerializeToString,
            river__python__test_dot_protos_dot_service__pb2.EchoOutput.FromString,
            options,
            channel_credentials,
            insecure,
            call_credentials,
            compression,
            wait_for_ready,
            timeout,
            metadata,
        )


class uploadStub(object):
    """Missing associated documentation comment in .proto file."""

    def __init__(self, channel):
        """Constructor.

        Args:
            channel: A grpc.Channel.
        """
        self.send = channel.stream_unary(
            "/replit.river.test.upload/send",
            request_serializer=river__python__test_dot_protos_dot_service__pb2.UploadInput.SerializeToString,
            response_deserializer=river__python__test_dot_protos_dot_service__pb2.UploadOutput.FromString,
        )


class uploadServicer(object):
    """Missing associated documentation comment in .proto file."""

    def send(self, request_iterator, context):
        """Missing associated documentation comment in .proto file."""
        context.set_code(grpc.StatusCode.UNIMPLEMENTED)
        context.set_details("Method not implemented!")
        raise NotImplementedError("Method not implemented!")


def add_uploadServicer_to_server(servicer, server):
    rpc_method_handlers = {
        "send": grpc.stream_unary_rpc_method_handler(
            servicer.send,
            request_deserializer=river__python__test_dot_protos_dot_service__pb2.UploadInput.FromString,
            response_serializer=river__python__test_dot_protos_dot_service__pb2.UploadOutput.SerializeToString,
        ),
    }
    generic_handler = grpc.method_handlers_generic_handler(
        "replit.river.test.upload", rpc_method_handlers
    )
    server.add_generic_rpc_handlers((generic_handler,))


# This class is part of an EXPERIMENTAL API.
class upload(object):
    """Missing associated documentation comment in .proto file."""

    @staticmethod
    def send(
        request_iterator,
        target,
        options=(),
        channel_credentials=None,
        call_credentials=None,
        insecure=False,
        compression=None,
        wait_for_ready=None,
        timeout=None,
        metadata=None,
    ):
        return grpc.experimental.stream_unary(
            request_iterator,
            target,
            "/replit.river.test.upload/send",
            river__python__test_dot_protos_dot_service__pb2.UploadInput.SerializeToString,
            river__python__test_dot_protos_dot_service__pb2.UploadOutput.FromString,
            options,
            channel_credentials,
            insecure,
            call_credentials,
            compression,
            wait_for_ready,
            timeout,
            metadata,
        )
