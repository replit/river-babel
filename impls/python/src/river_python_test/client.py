import asyncio
import json
import logging
import os
import re
import sys
from typing import AsyncIterator, Dict

from replit_river import (
    Client,
)
from replit_river.error_schema import RiverError
from .protos.client_schema import (
    KvSetInput,
    KvWatchInput,
    KvWatchOutput,
    RepeatEchoInput,
    RepeatEchoOutput,
    TestCient,
    UploadSendInput,
    UploadSendOutput,
)
from replit_river.transport_options import TransportOptions

# Load environment variables
PORT = os.getenv("PORT")
CLIENT_TRANSPORT_ID = os.getenv("CLIENT_TRANSPORT_ID")
SERVER_TRANSPORT_ID = os.getenv("SERVER_TRANSPORT_ID")
HEARTBEAT_MS = int(os.getenv("HEARTBEAT_MS", "500"))
HEARTBEATS_UNTIL_DEAD = int(os.getenv("HEARTBEATS_UNTIL_DEAD", "2"))
SESSION_DISCONNECT_GRACE_MS = int(os.getenv("SESSION_DISCONNECT_GRACE_MS", "3000"))
RIVER_SERVER = os.getenv("RIVER_SERVER")


logging.basicConfig(
    level=logging.DEBUG,
    format="Python Server %(asctime)s - %(levelname)s - %(message)s",
)


input_streams: Dict[str, asyncio.Queue] = {}
tasks: Dict[str, asyncio.Task] = {}


async def process_commands() -> None:
    logging.error("start python river client")
    uri = f"ws://{RIVER_SERVER}:{PORT}"
    logging.error(
        "Heartbeat: %d ms, Heartbeats to dead: %d, Session disconnect grace: %d ms",
        HEARTBEAT_MS,
        HEARTBEATS_UNTIL_DEAD,
        SESSION_DISCONNECT_GRACE_MS,
    )
    assert CLIENT_TRANSPORT_ID
    assert SERVER_TRANSPORT_ID
    client = Client(
        uri,
        client_id=CLIENT_TRANSPORT_ID,
        server_id=SERVER_TRANSPORT_ID,
        transport_options=TransportOptions(
            heartbeat_ms=HEARTBEAT_MS,
            heartbeats_until_dead=HEARTBEATS_UNTIL_DEAD,
            session_disconnect_grace_ms=SESSION_DISCONNECT_GRACE_MS,
        ),
    )
    test_client = TestCient(client)
    try:
        while True:
            line = await asyncio.get_event_loop().run_in_executor(
                None, sys.stdin.readline
            )
            if not line:
                break

            action = json.loads(line)
            if not action:
                print("FATAL: invalid command", line)
                sys.exit(1)

            # Extract the named groups
            id_ = action["id"]
            payload = action.get("payload")

            # Example handling for a 'kv.set' command
            match action["proc"]:
                case "kv.set":
                    k = payload["k"]
                    v = payload["v"]
                    try:
                        res = await test_client.kv.set(KvSetInput(k=k, v=int(v)))
                        print(f"{id_} -- ok:{res.v}")
                    except Exception:
                        print(f"{id_} -- err:UNEXPECTED_DISCONNECT")
                case "kv.watch":
                    k = payload["k"]
                    tasks[id_] = asyncio.create_task(handle_watch(id_, k, test_client))
                case "repeat.echo":
                    if id_ not in input_streams:
                        input_streams[id_] = asyncio.Queue()
                        tasks[id_] = asyncio.create_task(handle_echo(id_, test_client))
                    else:
                        s = payload["s"]
                        await input_streams[id_].put(s)
                case "upload.send":
                    if id_ not in input_streams:
                        input_streams[id_] = asyncio.Queue()
                        tasks[id_] = asyncio.create_task(
                            handle_upload(id_, test_client)
                        )

                        if payload is not None:
                            # For UploadNoInit
                            await input_streams[id_].put(payload["part"])
                    else:
                        part = payload["part"]
                        await input_streams[id_].put(part)

                        if part == "EOF":
                            # Wait for the upload task to complete once EOF is sent
                            await tasks[id_]
                            tasks.pop(id_, None)  # Cleanup task reference
                            input_streams.pop(id_, None)  # Cleanup queue reference
    finally:
        await client.close()
        for task in tasks.values():
            task.cancel()
            exception = task.exception()
            if exception is not None:
                logging.error("Task raised an exception: {}", exception)
        tasks.clear()


async def handle_watch(
    id_: str,
    k: str,
    test_client: TestCient,
) -> None:
    try:
        async for v in await test_client.kv.watch(KvWatchInput(k=k)):
            if isinstance(v, KvWatchOutput):
                print(f"{id_} -- ok:{v.v}")
            else:
                print(f"{id_} -- err:{v.code}")
    except Exception:
        print(f"{id_} -- err:UNEXPECTED_DISCONNECT")


async def handle_upload(id_: str, test_client: TestCient) -> None:
    async def upload_iterator() -> AsyncIterator[UploadSendInput]:
        while True:
            item = await input_streams[id_].get()
            if item == "EOF":  # Use a special EOF marker to break the loop
                break
            yield UploadSendInput(part=item)

    async def print_result(result: UploadSendOutput | RiverError) -> None:
        if isinstance(result, UploadSendOutput):
            print(f"{id_} -- ok:{result.doc}")
        else:  # Assuming this handles both RiverError and exceptions
            print(f"{id_} -- err:UNEXPECTED_DISCONNECT")
        return

    try:
        result = await test_client.upload.send(upload_iterator())
        await print_result(result)
    except Exception:
        print(f"{id_} -- err:UNEXPECTED_DISCONNECT")


async def handle_echo(id_: str, test_client: TestCient) -> None:
    async def upload_iterator() -> AsyncIterator[RepeatEchoInput]:
        while True:
            item = await input_streams[id_].get()
            if item == "EOF":  # Use a special EOF marker to break the loop
                break
            yield RepeatEchoInput(str=item)

    def print_result(result: RepeatEchoOutput | RiverError) -> None:
        if isinstance(result, RepeatEchoOutput):
            print(f"{id_} -- ok:{result.out}")
        else:  # Assuming this handles both RiverError and exceptions
            print(f"{id_} -- err:{result.code}")

    try:
        async for v in await test_client.repeat.echo(upload_iterator()):
            print_result(v)
    except Exception:
        print(f"{id_} -- err:UNEXPECTED_DISCONNECT")


async def main() -> None:
    await process_commands()


if __name__ == "__main__":
    asyncio.run(main())
