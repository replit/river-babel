import asyncio
import logging
import os
from typing import Any, AsyncIterator, Callable, Dict, Generic, TypeVar

import replit_river as river

from replit_river.error_schema import RiverError
from replit_river.transport_options import TransportOptions
from websockets.server import serve
from protos import service_pb2, service_pb2_grpc, service_river

PORT = os.getenv("PORT")
CLIENT_TRANSPORT_ID = os.getenv("CLIENT_TRANSPORT_ID")
SERVER_TRANSPORT_ID = os.getenv("SERVER_TRANSPORT_ID")
HEARTBEAT_MS = int(os.getenv("HEARTBEAT_MS", "500"))
HEARTBEATS_UNTIL_DEAD = int(os.getenv("HEARTBEATS_UNTIL_DEAD", "2"))
SESSION_DISCONNECT_GRACE_MS = int(os.getenv("SESSION_DISCONNECT_GRACE_MS", "3000"))

T = TypeVar("T")

logging.basicConfig(
    level=logging.DEBUG,
    format="Python Server %(asctime)s - %(levelname)s - %(message)s",
)


class Observable(Generic[T]):
    def __init__(self, initial_value: T):
        self.value = initial_value
        self.listeners: list = []

    def get(self) -> T:
        return self.value

    async def set(self, value: T):
        new_value = value
        self.value = new_value
        for listener in self.listeners:
            await listener(new_value)

    async def observe(self, listener: Callable[[T], None]):
        self.listeners.append(listener)
        await listener(self.get())  # Initial call for the current value
        return lambda: self.listeners.remove(listener)


class KvServicer(service_pb2_grpc.kvServicer):

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
        # This is a hack to let `watch` return faster than `set`
        # to match the order in test
        await asyncio.sleep(1 / 100_000_000)
        return service_pb2.KVResponse(v=self.kv[key].get())

    async def watch(
        self, request: service_pb2.KVRequest, context: Any
    ) -> AsyncIterator[service_pb2.KVResponse | RiverError]:
        key = request.k
        value = request.v
        if key not in self.kv:
            yield RiverError(code="NOT_FOUND", message=f"Key {key} not found")
            return
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


class UploadServicer(service_pb2_grpc.uploadServicer):

    async def send(
        self, request_iterator: AsyncIterator[service_pb2.UploadInput], context
    ) -> service_pb2.UploadOutput:
        doc = ""
        async for request in request_iterator:
            if request.part == "EOF":
                break
            doc += request.part
        return service_pb2.UploadOutput(doc=doc)


class RepeatServicer(service_pb2_grpc.repeatServicer):

    async def echo(
        self, request_iterator: AsyncIterator[service_pb2.EchoInput], context
    ) -> AsyncIterator[service_pb2.EchoOutput]:
        async for request in request_iterator:
            yield service_pb2.EchoOutput(out=request.str)


async def start_server() -> None:
    logging.info("started server")
    server = river.Server(
        server_id=SERVER_TRANSPORT_ID,
        transport_options=TransportOptions(
            heartbeat_ms=HEARTBEAT_MS,
            heartbeats_until_dead=HEARTBEATS_UNTIL_DEAD,
            session_disconnect_grace_ms=SESSION_DISCONNECT_GRACE_MS,
            buffer_size=5000,
        ),
    )
    kv_servicer = KvServicer()
    service_river.add_kvServicer_to_server(kv_servicer, server)  # type: ignore
    upload_servicer = UploadServicer()
    service_river.add_uploadServicer_to_server(upload_servicer, server)  # type: ignore
    repeat_servicer = RepeatServicer()
    service_river.add_repeatServicer_to_server(repeat_servicer, server)  # type: ignore
    done: asyncio.Future[None] = asyncio.Future()
    started: asyncio.Future[None] = asyncio.Future()

    async def _serve() -> None:
        async with serve(server.serve, "0.0.0.0", 8080):
            started.set_result(None)
            logging.info("started test")
            await done

    async with asyncio.TaskGroup() as tg:
        tg.create_task(_serve())


if __name__ == "__main__":
    asyncio.run(start_server())
