# Code generated by river.codegen. DO NOT EDIT.
import datetime
from typing import Any, Dict, Mapping, Tuple

from google.protobuf import timestamp_pb2
from google.protobuf.wrappers_pb2 import BoolValue

import river

from . import service_pb2, service_pb2_grpc


def _KVRequestEncoder(e: service_pb2.KVRequest) -> Dict[str, Any]:
    d: Dict[str, Any] = {}
    _k = getattr(e, 'k', None)
    if _k is not None:
        d['k'] = _k
    _v = getattr(e, 'v', None)
    if _v is not None:
        d['v'] = _v
    return d


def _KVRequestDecoder(
    d: Mapping[str, Any],
) -> service_pb2.KVRequest:
    m = service_pb2.KVRequest()
    if d is None:
        return m
    if d.get('k') is not None:
        setattr(m, 'k', d['k'])
    if d.get('v') is not None:
        setattr(m, 'v', d['v'])
    return m


def _KVResponseEncoder(e: service_pb2.KVResponse) -> Dict[str, Any]:
    d: Dict[str, Any] = {}
    _v = getattr(e, 'v', None)
    if _v is not None:
        d['v'] = _v
    return d


def _KVResponseDecoder(
    d: Mapping[str, Any],
) -> service_pb2.KVResponse:
    m = service_pb2.KVResponse()
    if d is None:
        return m
    if d.get('v') is not None:
        setattr(m, 'v', d['v'])
    return m


def _EchoInputEncoder(e: service_pb2.EchoInput) -> Dict[str, Any]:
    d: Dict[str, Any] = {}
    _str = getattr(e, 'str', None)
    if _str is not None:
        d['str'] = _str
    return d


def _EchoInputDecoder(
    d: Mapping[str, Any],
) -> service_pb2.EchoInput:
    m = service_pb2.EchoInput()
    if d is None:
        return m
    if d.get('str') is not None:
        setattr(m, 'str', d['str'])
    return m


def _EchoOutputEncoder(e: service_pb2.EchoOutput) -> Dict[str, Any]:
    d: Dict[str, Any] = {}
    _out = getattr(e, 'out', None)
    if _out is not None:
        d['out'] = _out
    return d


def _EchoOutputDecoder(
    d: Mapping[str, Any],
) -> service_pb2.EchoOutput:
    m = service_pb2.EchoOutput()
    if d is None:
        return m
    if d.get('out') is not None:
        setattr(m, 'out', d['out'])
    return m


def _UploadInputEncoder(e: service_pb2.UploadInput) -> Dict[str, Any]:
    d: Dict[str, Any] = {}
    _part = getattr(e, 'part', None)
    if _part is not None:
        d['part'] = _part
    return d


def _UploadInputDecoder(
    d: Mapping[str, Any],
) -> service_pb2.UploadInput:
    m = service_pb2.UploadInput()
    if d is None:
        return m
    if d.get('part') is not None:
        setattr(m, 'part', d['part'])
    return m


def _UploadOutputEncoder(e: service_pb2.UploadOutput) -> Dict[str, Any]:
    d: Dict[str, Any] = {}
    _doc = getattr(e, 'doc', None)
    if _doc is not None:
        d['doc'] = _doc
    return d


def _UploadOutputDecoder(
    d: Mapping[str, Any],
) -> service_pb2.UploadOutput:
    m = service_pb2.UploadOutput()
    if d is None:
        return m
    if d.get('doc') is not None:
        setattr(m, 'doc', d['doc'])
    return m


def add_kvServicer_to_server(
    servicer: service_pb2_grpc.kvServicer,
    server: river.Server,
) -> None:
    rpc_method_handlers: Mapping[
        Tuple[str, str], Tuple[str, river.GenericRpcHandler]
    ] = {
        ('kv', 'set'): (
            'rpc',
            river.rpc_method_handler(
                servicer.set,
                _KVRequestDecoder,
                _KVResponseEncoder,
            ),
        ),
        ('kv', 'watch'): (
            'subscription-stream',
            river.subscription_method_handler(
                servicer.watch,
                _KVRequestDecoder,
                _KVResponseEncoder,
            ),
        ),
    }
    server.add_rpc_handlers(rpc_method_handlers)


def add_repeatServicer_to_server(
    servicer: service_pb2_grpc.repeatServicer,
    server: river.Server,
) -> None:
    rpc_method_handlers: Mapping[
        Tuple[str, str], Tuple[str, river.GenericRpcHandler]
    ] = {
        ('repeat', 'echo'): (
            'stream',
            river.stream_method_handler(
                servicer.echo,
                _EchoInputDecoder,
                _EchoOutputEncoder,
            ),
        ),
    }
    server.add_rpc_handlers(rpc_method_handlers)


def add_uploadServicer_to_server(
    servicer: service_pb2_grpc.uploadServicer,
    server: river.Server,
) -> None:
    rpc_method_handlers: Mapping[
        Tuple[str, str], Tuple[str, river.GenericRpcHandler]
    ] = {
        ('upload', 'send'): (
            'upload-stream',
            river.upload_method_handler(
                servicer.send,
                _UploadInputDecoder,
                _UploadOutputEncoder,
            ),
        ),
    }
    server.add_rpc_handlers(rpc_method_handlers)
