import asyncio
import logging
import os
import re
import sys
from typing import AsyncIterator, Dict

from replit_river import (
    Client,
)
from websockets import connect

from protos.client_schema import (
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
HEARTBEAT_MS = int(os.getenv("HEARTBEAT_MS", "1000"))
HEARTBEATS_TO_DEAD = int(os.getenv("HEARTBEATS_TO_DEAD", "2"))
SESSION_DISCONNECT_GRACE_MS = int(os.getenv("SESSION_DISCONNECT_GRACE_MS", "5000"))

input_streams: Dict[str, asyncio.Queue] = {}
tasks: Dict[str, asyncio.Task] = {}


async def process_commands():
    logging.error("start python river client")
    uri = f"ws://river-server:{PORT}"
    async with connect(uri) as websocket:
        client = Client(
            websocket,
            client_id=CLIENT_TRANSPORT_ID,
            server_id=SERVER_TRANSPORT_ID,
            transport_options=TransportOptions(
                heartbeat_ms=HEARTBEAT_MS,
                heartbeats_until_dead=HEARTBEATS_TO_DEAD,
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
                # sometimes the line is like this
                # {"hijack":true,"stream":true,"stdin":true,"stdout":true,"stderr":true}1 -- upload.send ->
                if "}" in line:
                    line = line[line.index("}") + 1 :]

                pattern = (
                    r"(?P<id>\w+) -- (?P<svc>\w+)\.(?P<proc>\w+) -> ?(?P<payload>.*)"
                )

                # Perform the match
                match = re.match(pattern, line)

                # Check if the match was successful and if groups are present
                if not match:
                    print("FATAL: invalid command", line)
                    sys.exit(1)

                # Extract the named groups
                id_ = match.group("id")
                svc = match.group("svc")
                proc = match.group("proc")
                payload = match.group("payload")

                # Example handling for a 'kv.set' command
                if svc == "kv":
                    if proc == "set":
                        k, v = payload.split(" ")
                        try:
                            res = await test_client.kv.set(KvSetInput(k=k, v=int(v)))
                            print(f"{id_} -- ok:{res.v}")
                        except Exception as e:
                            print(f"{id_} -- err:{e}")
                    elif proc == "watch":
                        k = payload
                        tasks[id_] = asyncio.create_task(
                            handle_watch(id_, k, test_client)
                        )
                elif svc == "repeat":
                    if proc == "echo":
                        if id_ not in input_streams:
                            input_streams[id_] = asyncio.Queue()
                            tasks[id_] = asyncio.create_task(
                                handle_echo(id_, test_client)
                            )
                        else:
                            await input_streams[id_].put(payload)
                elif svc == "upload":
                    if proc == "send":
                        if id_ not in input_streams:
                            input_streams[id_] = asyncio.Queue()
                            tasks[id_] = asyncio.create_task(
                                handle_upload(id_, test_client)
                            )
                        else:
                            await input_streams[id_].put(payload)

                            if payload == "EOF":
                                # Wait for the upload task to complete once EOF is sent
                                await tasks[id_]
                                tasks.pop(id_, None)  # Cleanup task reference
                                input_streams.pop(id_, None)  # Cleanup queue reference
        finally:
            for task in tasks.values():
                task.cancel()
            tasks.clear()


async def handle_watch(
    id_: str,
    k: str,
    test_client: TestCient,
):
    try:
        async for v in await test_client.kv.watch(KvWatchInput(k=k)):
            if isinstance(v, KvWatchOutput):
                print(f"{id_} -- ok:{v.v}")
            else:
                print(f"{id_} -- err:{v.code}")
    except Exception as e:
        print(f"{id_} -- err:{e}")


async def handle_upload(id_: str, test_client: TestCient):

    async def upload_iterator() -> AsyncIterator[str]:
        while True:
            item = await input_streams[id_].get()
            if item == "EOF":  # Use a special EOF marker to break the loop
                break
            yield UploadSendInput(part=item)

    async def print_result(result):
        if isinstance(result, UploadSendOutput):
            print(f"{id_} -- ok:{result.doc}")
        else:  # Assuming this handles both RiverError and exceptions
            print(f"{id_} -- err:{result.message}")

    try:
        result = await test_client.upload.send(upload_iterator())
        await print_result(result)
    except Exception as e:
        print(f"{id_} -- err:{e}")


async def handle_echo(id_: str, test_client: TestCient):

    async def upload_iterator() -> AsyncIterator[str]:
        while True:
            item = await input_streams[id_].get()
            if item == "EOF":  # Use a special EOF marker to break the loop
                break
            yield RepeatEchoInput(str=item)

    def print_result(result):
        if isinstance(result, RepeatEchoOutput):
            print(f"{id_} -- ok:{result.out}")
        else:  # Assuming this handles both RiverError and exceptions
            print(f"{id_} -- err:{result.code}")

    try:
        async for v in await test_client.repeat.echo(upload_iterator()):
            print_result(v)
    except Exception as e:
        print(f"{id_} -- err:{e}")


async def main():
    await process_commands()


if __name__ == "__main__":
    asyncio.run(main())
