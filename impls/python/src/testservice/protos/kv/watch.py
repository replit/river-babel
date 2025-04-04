# Code generated by river.codegen. DO NOT EDIT.
from typing import (
    Literal,
)

from pydantic import BaseModel, TypeAdapter
from replit_river.error_schema import RiverError


class WatchInput(BaseModel):
    k: str


WatchInputTypeAdapter: TypeAdapter[WatchInput] = TypeAdapter(WatchInput)


class WatchOutput(BaseModel):
    v: float


WatchOutputTypeAdapter: TypeAdapter[WatchOutput] = TypeAdapter(WatchOutput)


class WatchErrors(RiverError):
    code: Literal["NOT_FOUND"]
    message: str


WatchErrorsTypeAdapter: TypeAdapter[WatchErrors] = TypeAdapter(WatchErrors)
