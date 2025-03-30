import asyncio
import json
import logging
import os
import sys
from datetime import timedelta
from typing import AsyncIterator, Dict

from replit_river import (
    Client,
    RiverError,
)
from replit_river.error_schema import RiverError  # noqa: F811
from replit_river.transport_options import TransportOptions, UriAndMetadata

from testservice.protos import TestCient
from testservice.protos.kv.set import SetInput
from testservice.protos.kv.watch import WatchInput, WatchOutput
from testservice.protos.repeat.echo import EchoInput, EchoOutput
from testservice.protos.upload.send import SendInput, SendOutput

# TODO: note:numbers
# Unfortunately we've got to work around a difference in interpretation between node
# and python. In node, `number` is a float and that is that.
#
# When rendered to schema.json we also get `"type": "number"`, which means in Python we
# get `float`.
#
# This is fine, except that Node renders 42.0f as `42`, whereas python does `42.0`.
#
# Because of this, where we should have strict equivalence, we now introduce `{v:.0f}`,
# a subtle and unfortunate difference.

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

    async def get_connection_metadata() -> UriAndMetadata[None]:
        return {
            "uri": uri,
            "metadata": None,
        }

    assert CLIENT_TRANSPORT_ID
    assert SERVER_TRANSPORT_ID
    client = Client(
        get_connection_metadata,
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

            try:
                action = json.loads(line)
            except json.JSONDecodeError as e:
                # Sometimes docker injects this into the stream:
                # {"hijack":true,"stream":true,"stdin":true,"stdout":true,"stderr":true}{"type": "invoke", ...  # noqa: E501
                offset = e.colno - 1
                first = json.loads(line[0:offset])
                assert "hijack" in first
                action = json.loads(line[offset:])

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
                        res = await test_client.kv.set(
                            SetInput(k=k, v=int(v)), timedelta(seconds=60)
                        )  # noqa: E501
                        print(
                            f"{id_} -- ok:{res.v:.0f}"
                        )  # TODO: See `note:numbers` above
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
        async for v in await test_client.kv.watch(WatchInput(k=k)):
            if isinstance(v, WatchOutput):
                print(f"{id_} -- ok:{v.v:.0f}")  # TODO: See `note:numbers` above
            else:
                print(f"{id_} -- err:{v.code}")
    except Exception:
        print(f"{id_} -- err:UNEXPECTED_DISCONNECT")


async def handle_upload(id_: str, test_client: TestCient) -> None:
    async def upload_iterator() -> AsyncIterator[SendInput]:
        while True:
            item = await input_streams[id_].get()
            if item == "EOF":  # Use a special EOF marker to break the loop
                break
            yield SendInput(part=item)

    async def print_result(result: SendOutput | RiverError) -> None:
        if isinstance(result, SendOutput):
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
    async def upload_iterator() -> AsyncIterator[EchoInput]:
        while True:
            item = await input_streams[id_].get()
            if item == "EOF":  # Use a special EOF marker to break the loop
                break
            yield EchoInput(str=item)

    def print_result(result: EchoOutput | RiverError) -> None:
        if isinstance(result, EchoOutput):
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
