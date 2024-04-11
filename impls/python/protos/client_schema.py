# Code generated by river.codegen. DO NOT EDIT.
from collections.abc import AsyncIterable, AsyncIterator
import datetime
import logging
from typing import Any, Dict, List, Literal, Optional, Mapping, Union, Tuple

from pydantic import BaseModel, Field, parse_obj_as
from replit_river.error_schema import RiverError

import replit_river as river


class KvSetInput(BaseModel):
    k: str
    v: int


class KvSetOutput(BaseModel):
    v: int


class KvWatchInput(BaseModel):
    k: str


class KvWatchOutput(BaseModel):
    v: int


class KvWatchErrors(RiverError):
    code: Literal["NOT_FOUND"]
    message: str


class KvService:
    def __init__(self, client: river.Client):
        self.client = client

    async def set(
        self,
        input: KvSetInput,
    ) -> KvSetOutput:
        return await self.client.send_rpc(
            "kv",
            "set",
            input,
            lambda x: x.model_dump(by_alias=True),
            lambda x: parse_obj_as(KvSetOutput, x),  # type: ignore[arg-type]
            lambda x: parse_obj_as(RiverError, x),  # type: ignore[arg-type]
        )

    async def watch(
        self,
        input: KvWatchInput,
    ) -> AsyncIterator[Union[KvWatchOutput, KvWatchErrors]]:
        return self.client.send_subscription(
            "kv",
            "watch",
            input,
            lambda x: x.model_dump(by_alias=True),
            lambda x: parse_obj_as(KvWatchOutput, x),  # type: ignore[arg-type]
            lambda x: parse_obj_as(KvWatchErrors, x),  # type: ignore[arg-type]
        )


class RepeatEchoInput(BaseModel):
    str: str


class RepeatEchoOutput(BaseModel):
    out: str


class RepeatEcho_PrefixInit(BaseModel):
    prefix: str


class RepeatEcho_PrefixInput(BaseModel):
    str: str


class RepeatEcho_PrefixOutput(BaseModel):
    out: str


class RepeatService:
    def __init__(self, client: river.Client):
        self.client = client

    async def echo(
        self,
        inputStream: AsyncIterable[RepeatEchoInput],
    ) -> AsyncIterator[Union[RepeatEchoOutput, RiverError]]:
        return self.client.send_stream(
            "repeat",
            "echo",
            None,
            inputStream,
            None,
            lambda x: x.model_dump(by_alias=True),
            lambda x: parse_obj_as(RepeatEchoOutput, x),  # type: ignore[arg-type]
            lambda x: parse_obj_as(RiverError, x),  # type: ignore[arg-type]
        )

    async def echo_prefix(
        self,
        init: RepeatEcho_PrefixInit,
        inputStream: AsyncIterable[RepeatEcho_PrefixInput],
    ) -> AsyncIterator[Union[RepeatEcho_PrefixOutput, RiverError]]:
        return self.client.send_stream(
            "repeat",
            "echo_prefix",
            init,
            inputStream,
            lambda x: parse_obj_as(RepeatEcho_PrefixInit, x),
            lambda x: x.model_dump(by_alias=True),
            lambda x: parse_obj_as(RepeatEcho_PrefixOutput, x),  # type: ignore[arg-type]
            lambda x: parse_obj_as(RiverError, x),  # type: ignore[arg-type]
        )


UploadSendInputPart = Union[str, Literal["EOF"]]


class UploadSendInput(BaseModel):
    part: UploadSendInputPart


class UploadSendOutput(BaseModel):
    doc: str


class UploadService:
    def __init__(self, client: river.Client):
        self.client = client

    async def send(
        self,
        inputStream: AsyncIterable[UploadSendInput],
    ) -> Union[UploadSendOutput, RiverError]:
        return await self.client.send_upload(
            "upload",
            "send",
            None,
            inputStream,
            None,
            lambda x: x.model_dump(by_alias=True),
            lambda x: parse_obj_as(UploadSendOutput, x),  # type: ignore[arg-type]
            lambda x: parse_obj_as(RiverError, x),  # type: ignore[arg-type]
        )


class TestCient:
    def __init__(self, client: river.Client):
        self.kv = KvService(client)
        self.repeat = RepeatService(client)
        self.upload = UploadService(client)
