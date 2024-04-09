import logging
import traceback
from typing import Dict, Mapping, Tuple

import nanoid  # type: ignore
from websockets.exceptions import ConnectionClosedError
from websockets.server import WebSocketServerProtocol

from river.transport import Transport, TransportManager

from .rpc import (
    GenericRpcHandler,
)


class Server(object):
    def __init__(self) -> None:
        self._handlers: Dict[Tuple[str, str], Tuple[str, GenericRpcHandler]] = {}
        self._server_instance_id = nanoid.generate()
        self._transport_manager = TransportManager()

    def add_rpc_handlers(
        self,
        rpc_handlers: Mapping[Tuple[str, str], Tuple[str, GenericRpcHandler]],
    ) -> None:
        self._handlers.update(rpc_handlers)

    async def serve(self, websocket: WebSocketServerProtocol) -> None:
        logging.debug("got a client")
        transport = Transport(
            self._server_instance_id, self._handlers, websocket, self._transport_manager
        )
        try:
            await transport.serve()
        except ConnectionClosedError as e:
            logging.error(f"ConnectionClosedError" * 50)
            logging.error(e)
            logging.error(f"ConnectionClosedError" * 50)
        except Exception as e:
            logging.error(
                f"River transport error in server {self._server_instance_id}: {e}"
            )
        finally:
            traceback.print_exc()
            logging.error("###" * 20)
            logging.error(
                f"Closing transport, _client_instance_id : {transport._client_instance_id}"
            )
            logging.error("###" * 20)
            if transport:
                await transport.close()
