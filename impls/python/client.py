import asyncio
import os
import sys
from websockets import connect
from river import (
    Client,
)

# Load environment variables
PORT = os.getenv("PORT")
CLIENT_TRANSPORT_ID = os.getenv("CLIENT_TRANSPORT_ID")
SERVER_TRANSPORT_ID = os.getenv("SERVER_TRANSPORT_ID")
HEARTBEAT_MS = int(os.getenv("HEARTBEAT_MS", "0"))
HEARTBEATS_TO_DEAD = int(os.getenv("HEARTBEATS_TO_DEAD", "0"))
SESSION_DISCONNECT_GRACE_MS = int(os.getenv("SESSION_DISCONNECT_GRACE_MS", "0"))


async def process_commands():
    uri = f"ws://river-server:{PORT}"
    async with connect(uri) as websocket:
        client = Client(websocket)
        # Assuming service definitions are set up correctly within the Client instance
        # and that it implements methods similarly named to the TypeScript example

        while True:
            line = await asyncio.get_event_loop().run_in_executor(
                None, sys.stdin.readline
            )
            if not line:
                break

            parts = line.strip().split(" -- ")
            if len(parts) < 4:
                print("FATAL: invalid command", line, file=sys.stderr)
                exit(1)

            id_, svc_proc, payload = parts[0], parts[1].split("."), parts[3]
            svc, proc = svc_proc[0], svc_proc[1]

            # Example handling for a 'kv.set' command
            if svc == "kv" and proc == "set":
                k, v = payload.split(" ")
                # Assuming 'kv' is a valid service and 'set' a procedure within it
                # This will likely require adapting to your specific service definitions
                # and client library capabilities
                res = await client.kv.set(k, int(v))
                if res["ok"]:
                    print(f"{id_} -- ok:{res['payload']['v']}")
                else:
                    print(f"{id_} -- err:{res['payload']['code']}")

            # Additional command handling based on svc and proc values follows here...


async def main():
    await process_commands()


if __name__ == "__main__":
    asyncio.run(main())
