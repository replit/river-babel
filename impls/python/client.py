import asyncio
import os
import sys
from websockets import connect
from river import (
    Client,
)
from protos.client_schema import TestCient, KvSetInput
import logging
import re

# Load environment variables
PORT = os.getenv("PORT")
CLIENT_TRANSPORT_ID = os.getenv("CLIENT_TRANSPORT_ID")
SERVER_TRANSPORT_ID = os.getenv("SERVER_TRANSPORT_ID")
HEARTBEAT_MS = int(os.getenv("HEARTBEAT_MS", "0"))
HEARTBEATS_TO_DEAD = int(os.getenv("HEARTBEATS_TO_DEAD", "0"))
SESSION_DISCONNECT_GRACE_MS = int(os.getenv("SESSION_DISCONNECT_GRACE_MS", "0"))


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
            if svc == "kv" and proc == "set":
                k, v = payload.split(" ")
                try:
                    res = await test_client.kv.set(KvSetInput(k=k, v=int(v)))
                    logging.error("###" * 50)
                    logging.error(f"{id_} -- ok:{res.v}")
                    logging.error("###" * 50)
                    print(f"{id_} -- ok:{res.v}")
                except Exception as e:
                    print(f"{id_} -- err:{e}")


async def main():
    await process_commands()


if __name__ == "__main__":
    asyncio.run(main())
