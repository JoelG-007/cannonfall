from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.connections: dict[str, dict[str, WebSocket]] = {}

    async def connect(
        self,
        room_id: str,
        player_id: str,
        websocket: WebSocket,
    ):
        await websocket.accept()

        if room_id not in self.connections:
            self.connections[room_id] = {}

        self.connections[room_id][player_id] = websocket

    def disconnect(self, room_id: str, player_id: str):
        room = self.connections.get(room_id)

        if not room:
            return

        room.pop(player_id, None)

        if not room:
            self.connections.pop(room_id, None)

    async def send_to_player(
        self,
        room_id: str,
        player_id: str,
        message: dict,
    ):
        websocket = self.connections.get(room_id, {}).get(player_id)

        if websocket:
            await websocket.send_json(message)

    async def broadcast(
        self,
        room_id: str,
        message: dict,
    ):
        connections = self.connections.get(room_id, {})

        for websocket in connections.values():
            await websocket.send_json(message)


manager = ConnectionManager()
