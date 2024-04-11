import asyncio
import os
import os.path
import subprocess
from typing import Any, AsyncIterator

from websockets.server import serve

import river

from protos import service_pb2, service_pb2_grpc, service_river
from typing import AsyncIterator, Callable, Dict, Generic, TypeVar
import logging


T = TypeVar("T")


class Observable(Generic[T]):
    def __init__(self, initial_value: T):
        self.value = initial_value
        self.listeners = set()

    def get(self) -> T:
        return self.value

    async def set(self, value: T):
        new_value = value
        self.value = new_value
        for listener in self.listeners:
            await listener(new_value)

    async def observe(self, listener: Callable[[T], None]):
        self.listeners.add(listener)
        await listener(self.get())  # Initial call for the current value
        return lambda: self.listeners.remove(listener)


class kvServicer(service_pb2_grpc.kvServicer):

    def __init__(self):
        self.kv: Dict[str, Observable[int]] = {}

    async def set(
        self, request: service_pb2.KVRequest, context: Any
    ) -> service_pb2.KVResponse:
        key, value = request.k, request.v
        if key not in self.kv:
            self.kv[key] = Observable(value)
        else:
            await self.kv[key].set(value)
        # wait slightly to let the watch response be sent first
        await asyncio.sleep(0.1)
        return service_pb2.KVResponse(v=self.kv[key].get())

    async def watch(
        self, request: service_pb2.KVRequest, context: Any
    ) -> AsyncIterator[service_pb2.KVResponse]:
        key = request.k
        value = request.v
        if key not in self.kv:
            self.kv[key] = Observable(value)
        observable = self.kv[key]

        queue = asyncio.Queue()

        async def listener(value):
            await queue.put(value)

        unsubscribe = await observable.observe(listener)
        try:
            while True:
                value = await queue.get()
                yield service_pb2.KVResponse(v=value)
        finally:
            unsubscribe()


class uploadServicer(service_pb2_grpc.uploadServicer):

    async def send(
        self, request_iterator: AsyncIterator[service_pb2.UploadInput], context
    ) -> service_pb2.UploadOutput:
        doc = ""
        async for request in request_iterator:
            if request.part == "EOF":
                break
            doc += request.part
        return service_pb2.UploadOutput(doc=doc)


async def start_server() -> None:
    logging.error("started server")

    kv_servicer = kvServicer()
    upload_servicer = uploadServicer()
    server = river.Server()
    service_river.add_kvServicer_to_server(kv_servicer, server)  # type: ignore
    service_river.add_uploadServicer_to_server(upload_servicer, server)  # type: ignore
    done: asyncio.Future[None] = asyncio.Future()
    started: asyncio.Future[None] = asyncio.Future()

    async def _serve() -> None:
        async with serve(server.serve, "0.0.0.0", 8080):
            started.set_result(None)
            logging.error("started test")
            await done

    async with asyncio.TaskGroup() as tg:
        tg.create_task(_serve())


if __name__ == "__main__":
    asyncio.run(start_server())
