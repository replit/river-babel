import asyncio
import os
import os.path
import subprocess
from typing import Any, AsyncIterator

from websockets.server import serve

import river

from protos import service_pb2, service_pb2_grpc, service_river
from typing import AsyncIterator, Callable, Dict, Generic, TypeVar


T = TypeVar("T")


class Observable(Generic[T]):
    def __init__(self, initial_value: T):
        self.value = initial_value
        self.listeners = set()

    def get(self) -> T:
        return self.value

    def set(self, tx: Callable[[T], T]):
        new_value = tx(self.value)
        self.value = new_value
        for listener in self.listeners:
            asyncio.run_coroutine_threadsafe(
                listener(new_value), asyncio.get_event_loop()
            )

    async def observe(self, listener: Callable[[T], None]):
        self.listeners.add(listener)
        await listener(self.get())  # Initial call for the current value
        return lambda: self.listeners.remove(listener)


# Reproduce serviceDefs.ts
class TestServicer(service_pb2_grpc.TestServicer):

    def __init__(self):
        self.kv: Dict[str, Observable[int]] = {}

    async def set(
        self, request: service_pb2.KVRequest, context: Any
    ) -> service_pb2.KVResponse:
        key, value = request.key, request.value
        if key not in self.kv:
            self.kv[key] = Observable(value)
        else:
            self.kv[key].set(lambda _: value)
        return service_pb2.KVResponse(v=self.kv[key].get())

    async def watch(
        self, request: service_pb2.KVRequest, context: Any
    ) -> AsyncIterator[service_pb2.KVResponse]:
        key = request.key
        value = request.value
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

    def echo(
        self, request_iterator: Any, context: Any
    ) -> AsyncIterator[service_pb2.EchoOutput]:
        pass

    def upload(
        self, request_iterator: Any, context: Any
    ) -> AsyncIterator[service_pb2.EchoOutput]:
        pass


async def start_server() -> None:
    print("started test")

    test_servicer = TestServicer()
    server = river.Server()
    service_river.add_TestServicer_to_server(test_servicer, server)  # type: ignore
    print("Starting River Server")
    done: asyncio.Future[None] = asyncio.Future()
    started: asyncio.Future[None] = asyncio.Future()

    async def _serve() -> None:
        async with serve(server.serve, "127.0.0.1", 8080):
            started.set_result(None)
            print("server started")
            await done

    async with asyncio.TaskGroup() as tg:
        tg.create_task(_serve())


if __name__ == "__main__":
    asyncio.run(start_server())
