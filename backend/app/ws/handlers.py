from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.routes.rooms import rooms
from app.ws.manager import manager

router = APIRouter()


@router.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
):
    room_id = room_id.upper()

    player_id = websocket.query_params.get("player_id")

    if not player_id:
        await websocket.close(code=1008)
        return

    room = rooms.get(room_id)

    if room is None:
        await websocket.close(code=1008)
        return

    player = next(
        (player for player in room.players if player.id == player_id),
        None,
    )

    if player is None:
        await websocket.close(code=1008)
        return

    await manager.connect(
        room_id,
        player_id,
        websocket,
    )

    await manager.broadcast(
        room_id,
        {
            "type": "player_connected",
            "player_id": player_id,
            "player_name": player.name,
            "connected_players": len(
                manager.connections.get(room_id, {})
            ),
        },
    )

    try:
        while True:
            message = await websocket.receive_json()

            await manager.broadcast(
                room_id,
                message,
            )

    except WebSocketDisconnect:
        manager.disconnect(room_id, player_id)

        await manager.broadcast(
            room_id,
            {
                "type": "player_disconnected",
                "player_id": player_id,
                "connected_players": len(
                    manager.connections.get(room_id, {})
                ),
            },
        )
