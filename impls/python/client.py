import asyncio
import os
import sys
from river.error_schema import RiverError
from websockets import connect
from river import (
    Client,
)
from protos.client_schema import (
    TestCient,
    KvSetInput,
    KvWatchInput,
    UploadSendInput,
    UploadSendOutput,
)
import logging
import re
from typing import Dict, AsyncIterator

# Load environment variables
PORT = os.getenv("PORT")
CLIENT_TRANSPORT_ID = os.getenv("CLIENT_TRANSPORT_ID")
SERVER_TRANSPORT_ID = os.getenv("SERVER_TRANSPORT_ID")
HEARTBEAT_MS = int(os.getenv("HEARTBEAT_MS", "0"))
HEARTBEATS_TO_DEAD = int(os.getenv("HEARTBEATS_TO_DEAD", "0"))
SESSION_DISCONNECT_GRACE_MS = int(os.getenv("SESSION_DISCONNECT_GRACE_MS", "0"))

input_streams: Dict[str, asyncio.Queue] = {}
upload_tasks: Dict[str, asyncio.Task] = {}


async def process_commands():
    logging.error("start python river client")
    uri = f"ws://river-server:{PORT}"
    async with connect(uri) as websocket:
        client = Client(websocket, use_prefix_bytes=False)
        test_client = TestCient(client)
        # Assuming service definitions are set up correctly within the Client instance
        # and that it implements methods similarly named to the TypeScript example
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
            logging.error("###" * 50)
            logging.error(f"line : {line}")
            logging.error("###" * 50)

            pattern = r"(?P<id>\w+) -- (?P<svc>\w+)\.(?P<proc>\w+) -> ?(?P<payload>.*)"

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
                k, v = payload.split(" ")
                if proc == "set":
                    try:
                        res = await test_client.kv.set(KvSetInput(k=k, v=int(v)))
                        print(f"{id_} -- ok:{res.v}")
                    except Exception as e:
                        print(f"{id_} -- err:{e}")
                elif proc == "watch":
                    res = await test_client.kv.watch(KvWatchInput(k=payload))
                    async for v in res:
                        print(f"{id_} -- ok:{v.v}")
            elif svc == "repeat":
                if proc == "echo":
                    print(f"{id_} -- ok:{payload}")
            elif svc == "upload":
                if proc == "send":
                    if id_ not in input_streams:
                        input_streams[id_] = asyncio.Queue()
                        upload_tasks[id_] = asyncio.create_task(
                            handle_upload(id_, test_client)
                        )
                    else:
                        await input_streams[id_].put(payload)

                        if payload == "EOF":
                            # Wait for the upload task to complete once EOF is sent
                            await upload_tasks[id_]
                            upload_tasks.pop(id_, None)  # Cleanup task reference
                            input_streams.pop(id_, None)  # Cleanup queue reference


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


async def main():
    await process_commands()


if __name__ == "__main__":
    asyncio.run(main())
