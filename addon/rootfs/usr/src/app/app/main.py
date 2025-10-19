"""FastAPI entrypoint for the Luftujha Home Assistant add-on."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

import contextlib

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .ha_client import HomeAssistantClient
from .settings import get_log_level, get_ha_base_url, get_ha_token

LOGGER = logging.getLogger(__name__)


def configure_logging() -> None:
    """Configure global logging based on add-on options."""

    level_name = get_log_level().upper()
    logging.basicConfig(level=getattr(logging, level_name, logging.INFO))
    LOGGER.info("Logging configured at %s", level_name)


class ValveManager:
    """Tracks valve states and handles HA interactions."""

    def __init__(self, client: HomeAssistantClient) -> None:
        self._client = client
        self._lock = asyncio.Lock()
        self._valves: dict[str, dict[str, Any]] = {}
        self._connections: set[WebSocket] = set()
        self._events_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        await self.refresh()
        self._events_task = asyncio.create_task(self._consume_events())

    async def stop(self) -> None:
        if self._events_task:
            self._events_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._events_task
        await self._client.close()

    async def refresh(self) -> None:
        async with self._lock:
            entities = await self._client.fetch_luftator_entities()
            self._valves = {entity["entity_id"]: entity for entity in entities}
        await self._broadcast({"type": "snapshot", "payload": list(self._valves.values())})

    async def set_value(self, entity_id: str, value: float) -> dict[str, Any]:
        async with self._lock:
            if entity_id not in self._valves:
                raise KeyError(entity_id)
        await self._client.set_valve_value(entity_id, value)
        return {"entity_id": entity_id, "value": value}

    async def get_snapshot(self) -> list[dict[str, Any]]:
        async with self._lock:
            return list(self._valves.values())

    async def register(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.add(websocket)
        await websocket.send_json({"type": "snapshot", "payload": await self.get_snapshot()})

    async def unregister(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)

    async def _consume_events(self) -> None:
        async for event in self._client.websocket_events():
            entity_id = event.get("data", {}).get("entity_id")
            new_state = event.get("data", {}).get("new_state")
            if not entity_id or not new_state:
                continue
            async with self._lock:
                self._valves[entity_id] = new_state
            await self._broadcast({"type": "update", "payload": new_state})

    async def _broadcast(self, message: dict[str, Any]) -> None:
        dead: set[WebSocket] = set()
        for connection in self._connections:
            try:
                await connection.send_json(message)
            except Exception:  # noqa: BLE001
                dead.add(connection)
        for connection in dead:
            await self.unregister(connection)


def create_app() -> FastAPI:
    configure_logging()

    base_url = get_ha_base_url() or "http://supervisor/core"
    token = get_ha_token()
    if not token:
        raise RuntimeError("Missing Home Assistant token. Set HA_TOKEN for local development or ensure SUPERVISOR_TOKEN is provided.")

    LOGGER.info("Connecting to Home Assistant at %s", base_url)

    client = HomeAssistantClient(base_url, token)
    manager = ValveManager(client)

    app = FastAPI(title="Luftujha Add-on API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    static_root = os.getenv("STATIC_ROOT", "/usr/share/luftujha/www")
    if os.path.isdir(static_root):
        app.mount("/", StaticFiles(directory=static_root, html=True), name="static")

    @app.on_event("startup")
    async def _startup() -> None:  # pragma: no cover
        await manager.start()

    @app.on_event("shutdown")
    async def _shutdown() -> None:  # pragma: no cover
        await manager.stop()

    async def get_manager() -> ValveManager:
        return manager

    @app.get("/api/valves")
    async def list_valves(manager: ValveManager = Depends(get_manager)) -> JSONResponse:
        snapshot = await manager.get_snapshot()
        return JSONResponse(snapshot)

    @app.post("/api/valves/{entity_id}")
    async def set_valve(
        entity_id: str,
        payload: dict[str, Any],
        manager: ValveManager = Depends(get_manager),
    ) -> JSONResponse:
        value = payload.get("value")
        if value is None:
            raise HTTPException(status_code=400, detail="Missing 'value' in payload")
        try:
            result = await manager.set_value(entity_id, float(value))
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=f"Unknown entity: {entity_id}") from exc
        return JSONResponse(result)

    @app.websocket("/ws/valves")
    async def websocket_endpoint(websocket: WebSocket, manager: ValveManager = Depends(get_manager)) -> None:
        await manager.register(websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            await manager.unregister(websocket)

    return app


app = create_app()
