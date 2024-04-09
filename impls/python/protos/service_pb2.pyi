"""
@generated by mypy-protobuf.  Do not edit manually!
isort:skip_file
import "google/protobuf/timestamp.proto";"""

import builtins
import google.protobuf.descriptor
import google.protobuf.message
import typing

DESCRIPTOR: google.protobuf.descriptor.FileDescriptor

@typing.final
class KVRequest(google.protobuf.message.Message):
    DESCRIPTOR: google.protobuf.descriptor.Descriptor

    KEY_FIELD_NUMBER: builtins.int
    VALUE_FIELD_NUMBER: builtins.int
    key: builtins.str
    value: builtins.int
    def __init__(
        self,
        *,
        key: builtins.str = ...,
        value: builtins.int = ...,
    ) -> None: ...
    def ClearField(self, field_name: typing.Literal["key", b"key", "value", b"value"]) -> None: ...

global___KVRequest = KVRequest

@typing.final
class KVResponse(google.protobuf.message.Message):
    DESCRIPTOR: google.protobuf.descriptor.Descriptor

    V_FIELD_NUMBER: builtins.int
    v: builtins.int
    def __init__(
        self,
        *,
        v: builtins.int = ...,
    ) -> None: ...
    def ClearField(self, field_name: typing.Literal["v", b"v"]) -> None: ...

global___KVResponse = KVResponse

@typing.final
class EchoInput(google.protobuf.message.Message):
    DESCRIPTOR: google.protobuf.descriptor.Descriptor

    STR_FIELD_NUMBER: builtins.int
    str: builtins.str
    def __init__(
        self,
        *,
        str: builtins.str = ...,
    ) -> None: ...
    def ClearField(self, field_name: typing.Literal["str", b"str"]) -> None: ...

global___EchoInput = EchoInput

@typing.final
class EchoOutput(google.protobuf.message.Message):
    DESCRIPTOR: google.protobuf.descriptor.Descriptor

    OUT_FIELD_NUMBER: builtins.int
    out: builtins.str
    def __init__(
        self,
        *,
        out: builtins.str = ...,
    ) -> None: ...
    def ClearField(self, field_name: typing.Literal["out", b"out"]) -> None: ...

global___EchoOutput = EchoOutput

@typing.final
class UploadInput(google.protobuf.message.Message):
    DESCRIPTOR: google.protobuf.descriptor.Descriptor

    PART_FIELD_NUMBER: builtins.int
    part: builtins.str
    def __init__(
        self,
        *,
        part: builtins.str = ...,
    ) -> None: ...
    def ClearField(self, field_name: typing.Literal["part", b"part"]) -> None: ...

global___UploadInput = UploadInput

@typing.final
class UploadOutput(google.protobuf.message.Message):
    DESCRIPTOR: google.protobuf.descriptor.Descriptor

    DOC_FIELD_NUMBER: builtins.int
    doc: builtins.str
    def __init__(
        self,
        *,
        doc: builtins.str = ...,
    ) -> None: ...
    def ClearField(self, field_name: typing.Literal["doc", b"doc"]) -> None: ...

global___UploadOutput = UploadOutput
