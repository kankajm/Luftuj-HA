"""Home Assistant API & WebSocket helpers for Luftujha."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any, Dict

import httpx
import websockets

LOGGER = logging.getLogger(__name__)


class HomeAssistantClient:
    """Simple wrapper around Home Assistant REST and WebSocket APIs."""

    def __init__(self, base_url: str, token: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._http = httpx.AsyncClient(base_url=self._base_url, headers=self._headers)

    @property
    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }

    async def close(self) -> None:
        await self._http.aclose()

    async def fetch_luftator_entities(self) -> list[dict[str, Any]]:
        """Return states for entities starting with `number.luftator_`."""

        response = await self._http.get("/api/states")
        response.raise_for_status()
        payload: list[dict[str, Any]] = response.json()
        return [entity for entity in payload if entity["entity_id"].startswith("number.luftator_")]

    async def set_valve_value(self, entity_id: str, value: float) -> None:
        """Call HA service to set valve value."""

        body = {"entity_id": entity_id, "value": value}
        response = await self._http.post("/api/services/number/set_value", json=body)
        if response.is_error:
            LOGGER.error("Failed to set %s to %s: %s", entity_id, value, response.text)
        response.raise_for_status()

    async def websocket_events(self) -> AsyncIterator[dict[str, Any]]:
        """Yield state change events for luftator numbers via HA WebSocket API."""

        url = self._base_url.replace("http", "ws") + "/api/websocket"
        async for event in self._websocket_listener(url):
            if event.get("type") == "event":
                data = event.get("event", {})
                entity_id = data.get("data", {}).get("entity_id", "")
                if entity_id.startswith("number.luftator_"):
                    yield data

    async def _websocket_listener(self, url: str) -> AsyncIterator[dict[str, Any]]:
        """Handle authentication and event subscription."""

        while True:
            try:
                async with websockets.connect(url) as socket:
                    LOGGER.info("Connected to HA WebSocket")

                    # Receive authentication request
                    auth_message = await socket.recv()
                    auth = json.loads(auth_message)
                    if auth.get("type") != "auth_required":
                        LOGGER.error("Unexpected auth response: %s", auth)
                        return

                    await socket.send(json.dumps({"type": "auth", "access_token": self._token}))
                    auth_ok = json.loads(await socket.recv())
                    if auth_ok.get("type") != "auth_ok":
                        LOGGER.error("Authentication failed: %s", auth_ok)
                        return

                    # Subscribe to state change events
                    await socket.send(
                        json.dumps(
                            {
                                "id": 1,
                                "type": "subscribe_events",
                                "event_type": "state_changed",
                            }
                        )
                    )

                    while True:
                        message = await socket.recv()
                        yield json.loads(message)
            except websockets.ConnectionClosedError as exc:
                LOGGER.warning("HA WebSocket closed: %s", exc)
            except Exception as exc:  # noqa: BLE001
                LOGGER.exception("Error in HA WebSocket listener: %s", exc)

            LOGGER.info("Reconnecting to HA WebSocket in 5 seconds")
            await asyncio.sleep(5)
