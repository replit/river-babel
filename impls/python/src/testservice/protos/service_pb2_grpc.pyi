"""
@generated by mypy-protobuf.  Do not edit manually!
isort:skip_file
import "google/protobuf/timestamp.proto";"""

import abc
import collections.abc
import typing

import grpc
import grpc.aio

import testservice.protos.service_pb2

_T = typing.TypeVar("_T")

# class _MaybeAsyncIterator(collections.abc.AsyncIterator[_T], collections.abc.Iterator[_T], metaclass=abc.ABCMeta): ...  # noqa: E501
_MaybeAsyncIterator = collections.abc.AsyncIterator[_T] | collections.abc.Iterator[_T]

class _ServicerContext(grpc.ServicerContext, grpc.aio.ServicerContext):  # type: ignore[misc, type-arg]
    ...

class kvStub:
    def __init__(
        self, channel: typing.Union[grpc.Channel, grpc.aio.Channel]
    ) -> None: ...  # noqa: E501
    set: grpc.UnaryUnaryMultiCallable

    watch: grpc.UnaryStreamMultiCallable

class kvAsyncStub:
    set: grpc.aio.UnaryUnaryMultiCallable

    watch: grpc.aio.UnaryStreamMultiCallable

class kvServicer(metaclass=abc.ABCMeta):
    @abc.abstractmethod
    def set(
        self,
        request: testservice.protos.service_pb2.KVRequest,
        context: _ServicerContext,
    ) -> typing.Union[
        testservice.protos.service_pb2.KVResponse,
        collections.abc.Awaitable[testservice.protos.service_pb2.KVResponse],
    ]: ...  # noqa: E501
    @abc.abstractmethod
    def watch(
        self,
        request: testservice.protos.service_pb2.KVRequest,
        context: _ServicerContext,
    ) -> typing.Union[
        collections.abc.Iterator[testservice.protos.service_pb2.KVResponse],
        collections.abc.AsyncIterator[testservice.protos.service_pb2.KVResponse],
    ]: ...  # noqa: E501

def add_kvServicer_to_server(
    servicer: kvServicer, server: typing.Union[grpc.Server, grpc.aio.Server]
) -> None: ...  # noqa: E501

class repeatStub:
    def __init__(
        self, channel: typing.Union[grpc.Channel, grpc.aio.Channel]
    ) -> None: ...  # noqa: E501
    echo: grpc.StreamStreamMultiCallable

class repeatAsyncStub:
    echo: grpc.aio.StreamStreamMultiCallable

class repeatServicer(metaclass=abc.ABCMeta):
    @abc.abstractmethod
    def echo(
        self,
        request_iterator: _MaybeAsyncIterator[testservice.protos.service_pb2.EchoInput],
        context: _ServicerContext,
    ) -> typing.Union[
        collections.abc.Iterator[testservice.protos.service_pb2.EchoOutput],
        collections.abc.AsyncIterator[testservice.protos.service_pb2.EchoOutput],
    ]: ...  # noqa: E501

def add_repeatServicer_to_server(
    servicer: repeatServicer, server: typing.Union[grpc.Server, grpc.aio.Server]
) -> None: ...  # noqa: E501

class uploadStub:
    def __init__(
        self, channel: typing.Union[grpc.Channel, grpc.aio.Channel]
    ) -> None: ...  # noqa: E501
    send: grpc.StreamUnaryMultiCallable

class uploadAsyncStub:
    send: grpc.aio.StreamUnaryMultiCallable

class uploadServicer(metaclass=abc.ABCMeta):
    @abc.abstractmethod
    def send(
        self,
        request_iterator: _MaybeAsyncIterator[
            testservice.protos.service_pb2.UploadInput
        ],  # noqa: E501
        context: _ServicerContext,
    ) -> typing.Union[
        testservice.protos.service_pb2.UploadOutput,
        collections.abc.Awaitable[testservice.protos.service_pb2.UploadOutput],
    ]: ...  # noqa: E501

def add_uploadServicer_to_server(
    servicer: uploadServicer, server: typing.Union[grpc.Server, grpc.aio.Server]
) -> None: ...  # noqa: E501
