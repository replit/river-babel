import asyncio
import os
import os.path
import subprocess
from typing import Any, AsyncIterator

from websockets.server import serve

import river

from river.server import test_pb2, test_pb2_grpc, test_river


# Reproduce serviceDefs.ts
class TestServicer(test_pb2_grpc.TestServicer):
    async def rpc(self, msg: Any, context: Any) -> test_pb2.RpcResponse:
        return test_pb2.RpcResponse(payload=msg.string)

    async def stream(
        self, msgStream: Any, context: Any
    ) -> AsyncIterator[test_pb2.StreamResponse]:
        async for msg in msgStream:
            yield test_pb2.StreamResponse(payload=msg.payload)


async def start_server() -> None:
    print("started test")

    test_servicer = TestServicer()
    server = river.Server()
    test_river.add_TestServicer_to_server(test_servicer, server)  # type: ignore
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
