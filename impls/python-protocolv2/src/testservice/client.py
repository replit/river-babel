import asyncio
import json
import logging
import os
import sys
from datetime import timedelta
from typing import Any, AsyncGenerator, AsyncIterable, AsyncIterator, Dict

from replit_river import RiverError
from replit_river.error_schema import RiverError  # noqa: F811
from replit_river.transport_options import TransportOptions, UriAndMetadata
from replit_river.v2 import Client

from testservice.protos import TestCient
from testservice.protos.kv.set import SetInit
from testservice.protos.kv.watch import WatchInit, WatchOutput
from testservice.protos.repeat.echo import EchoInit, EchoInput, EchoOutput
from testservice.protos.upload.send import SendInit, SendInput, SendOutput

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
    format="Python Client %(asctime)s - %(levelname)s - %(message)s",
)


input_streams: Dict[str, asyncio.Queue] = {}
tasks: Dict[str, asyncio.Task] = {}


async def asyncly_emit(
    actions: list[dict[Any, Any]],
) -> AsyncGenerator[tuple[str, Any], None]:  # noqa: E501
    for action in actions:
        line = json.dumps(action)
        yield line, action
    await asyncio.sleep(5)


async def read_from_stdin() -> AsyncGenerator[tuple[str, Any], None]:
    while True:
        line = await asyncio.get_event_loop().run_in_executor(None, sys.stdin.readline)

        # We're done
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

        yield line, action


async def process_commands(static_actions: list[dict[Any, Any]] | None) -> None:
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
        if static_actions:
            actions = asyncly_emit(static_actions)
        else:
            actions = read_from_stdin()

        async for line, action in actions:
            if not line:
                break

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
                            SetInit(k=k, v=int(v)), timedelta(seconds=60)
                        )
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
                        tasks[id_] = asyncio.create_task(
                            handle_echo(id_, action["init"], test_client)
                        )  # noqa: E501
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
            while not task.done():
                await asyncio.sleep(0.1)
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
        async for v in await test_client.kv.watch(WatchInit(k=k)):
            if isinstance(v, WatchOutput):
                print(f"{id_} -- ok:{v.v:.0f}")  # TODO: See `note:numbers` above
            else:
                print(f"{id_} -- err:{v.code}")
    except Exception:
        print(f"{id_} -- err:UNEXPECTED_DISCONNECT")


async def handle_upload(id_: str, test_client: TestCient) -> None:
    async def upload_iterator() -> AsyncIterator[SendInput]:
        while stream := input_streams.get(id_):
            item = await stream.get()
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
        init = SendInit(part=await input_streams[id_].get())
        result = await test_client.upload.send(init, upload_iterator())
        await print_result(result)
    except Exception:
        print(f"{id_} -- err:UNEXPECTED_DISCONNECT")


async def handle_echo(id_: str, init: Any, test_client: TestCient) -> None:
    def print_result(result: EchoOutput | RiverError) -> None:
        if isinstance(result, EchoOutput):
            print(f"{id_} -- ok:{result.out}")
        else:  # Assuming this handles both RiverError and exceptions
            print(f"{id_} -- err:{result.code}")

    async def serve_inputs() -> AsyncIterable[EchoInput]:
        while inputs := input_streams.get(id_):
            yield EchoInput(str=await inputs.get())

    try:
        async for v in await test_client.repeat.echo(EchoInit(**init), serve_inputs()):
            print_result(v)
    except Exception:
        print(f"{id_} -- err:UNEXPECTED_DISCONNECT")


async def main() -> None:
    # static_actions = [
    #     {"type":"invoke","id":"1","proc":"repeat.echo","init":{}},
    #     {"type":"invoke","id":"1","proc":"repeat.echo","payload":{"s":"hello"}},
    #     {"type":"invoke","id":"1","proc":"repeat.echo","payload":{"s":"world"}},
    # ]
    # await process_commands(static_actions)
    await process_commands(None)


if __name__ == "__main__":
    asyncio.run(main())
