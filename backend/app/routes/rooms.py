
import random
import string

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.room import Player, Room

router = APIRouter(prefix="/rooms", tags=["rooms"])

rooms: dict[str, Room] = {}

# In-memory combat state, keyed by room ID.
game_states: dict[str, dict] = {}


class CreateRoomRequest(BaseModel):
    player_name: str


class JoinRoomRequest(BaseModel):
    player_name: str


class FleetShip(BaseModel):
    id: str
    name: str
    length: int
    cells: list[int]
    horizontal: bool


class SubmitFleetRequest(BaseModel):
    player_id: str
    ships: list[FleetShip]


class FireRequest(BaseModel):
    player_id: str
    cell: int = Field(ge=0, lt=100)


SHIP_LENGTHS = {
    "carrier": 5,
    "battleship": 4,
    "cruiser": 3,
    "submarine": 3,
    "destroyer": 2,
}


def generate_room_id() -> str:
    characters = string.ascii_uppercase + string.digits

    while True:
        room_id = "".join(random.choices(characters, k=6))

        if room_id not in rooms:
            return room_id


def find_room(room_id: str) -> Room:
    room = rooms.get(room_id.upper())

    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")

    return room


def find_player(room: Room, player_id: str) -> Player:
    player = next(
        (p for p in room.players if p.id == player_id),
        None,
    )

    if player is None:
        raise HTTPException(status_code=404, detail="Player not found")

    return player


def validate_fleet(ships: list[FleetShip]) -> None:
    if len(ships) != len(SHIP_LENGTHS):
        raise HTTPException(
            status_code=400,
            detail="Your fleet must contain exactly five ships.",
        )

    ship_ids = [ship.id for ship in ships]

    if len(set(ship_ids)) != len(ship_ids):
        raise HTTPException(
            status_code=400,
            detail="Duplicate ships are not allowed.",
        )

    if set(ship_ids) != set(SHIP_LENGTHS):
        raise HTTPException(
            status_code=400,
            detail="The fleet must contain the five standard ships.",
        )

    occupied_cells = set()

    for ship in ships:
        if ship.length != SHIP_LENGTHS[ship.id]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid length for {ship.name}.",
            )

        if len(ship.cells) != ship.length:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid number of cells for {ship.name}.",
            )

        if len(set(ship.cells)) != len(ship.cells):
            raise HTTPException(
                status_code=400,
                detail=f"{ship.name} contains duplicate cells.",
            )

        if any(cell < 0 or cell >= 100 for cell in ship.cells):
            raise HTTPException(
                status_code=400,
                detail=f"{ship.name} is outside the board.",
            )

        cells = sorted(ship.cells)
        start = cells[0]
        row = start // 10
        column = start % 10

        if ship.horizontal:
            if column + ship.length > 10:
                raise HTTPException(
                    status_code=400,
                    detail=f"{ship.name} extends beyond the board.",
                )

            expected_cells = [
                row * 10 + column + i
                for i in range(ship.length)
            ]
        else:
            if row + ship.length > 10:
                raise HTTPException(
                    status_code=400,
                    detail=f"{ship.name} extends beyond the board.",
                )

            if any(cell % 10 != column for cell in cells):
                raise HTTPException(
                    status_code=400,
                    detail=f"{ship.name} must occupy one column.",
                )

            expected_cells = [
                (row + i) * 10 + column
                for i in range(ship.length)
            ]

        if cells != expected_cells:
            raise HTTPException(
                status_code=400,
                detail=f"{ship.name} must occupy consecutive cells.",
            )

        if occupied_cells.intersection(ship.cells):
            raise HTTPException(
                status_code=400,
                detail="Ships cannot overlap.",
            )

        occupied_cells.update(ship.cells)


def initialize_game(room: Room) -> None:
    """Initialize combat when both players have submitted fleets."""
    game_states[room.id] = {
        "current_turn": room.players[0].id,
        "winner": None,
        "attacks": [],
    }


def get_game_state(room: Room) -> dict:
    state = game_states.get(room.id)

    if state is None:
        raise HTTPException(
            status_code=409,
            detail="The battle has not started. Both players must submit fleets.",
        )

    return state


def get_player_shots(state: dict, player_id: str) -> list[dict]:
    return [
        attack
        for attack in state["attacks"]
        if attack["attacker_id"] == player_id
    ]


def get_incoming_shots(state: dict, player_id: str) -> list[dict]:
    return [
        attack
        for attack in state["attacks"]
        if attack["target_id"] == player_id
    ]


def get_sunk_ships(player: Player, state: dict, attacker_id: str) -> list[str]:
    """Return names of this player's ships sunk by the specified attacker."""
    attacker_shots = {
        attack["cell"]
        for attack in state["attacks"]
        if attack["attacker_id"] == attacker_id
        and attack["target_id"] == player.id
        and attack["result"] == "hit"
    }

    sunk = []

    for ship in player.fleet:
        if set(ship["cells"]).issubset(attacker_shots):
            sunk.append(ship["name"])

    return sunk


@router.post("")
async def create_room(request: CreateRoomRequest):
    room_id = generate_room_id()

    player = Player(
        id="player-1",
        name=request.player_name.strip(),
    )

    room = Room(
        id=room_id,
        players=[player],
    )

    rooms[room_id] = room

    return {
        "room_id": room_id,
        "player_id": player.id,
        "status": room.status,
    }


@router.post("/{room_id}/join")
async def join_room(room_id: str, request: JoinRoomRequest):
    room = find_room(room_id)

    if len(room.players) >= 2:
        raise HTTPException(
            status_code=409,
            detail="Room is full",
        )

    if room.status in ("playing", "finished"):
        raise HTTPException(
            status_code=409,
            detail="This game has already started.",
        )

    player = Player(
        id="player-2",
        name=request.player_name.strip(),
    )

    room.players.append(player)
    room.status = "ready"

    return {
        "room_id": room.id,
        "player_id": player.id,
        "status": room.status,
    }


@router.post("/{room_id}/fleet")
async def submit_fleet(
    room_id: str,
    request: SubmitFleetRequest,
):
    room = find_room(room_id)

    if len(room.players) != 2:
        raise HTTPException(
            status_code=409,
            detail="Waiting for the second player to join.",
        )

    if room.status in ("playing", "finished"):
        raise HTTPException(
            status_code=409,
            detail="Fleet placement is closed because the battle has started.",
        )

    player = find_player(room, request.player_id)

    validate_fleet(request.ships)

    # Support both Pydantic v1 and v2.
    player.fleet = [
        ship.model_dump() if hasattr(ship, "model_dump") else ship.dict()
        for ship in request.ships
    ]
    player.ready = True

    if all(p.ready for p in room.players):
        room.status = "playing"
        initialize_game(room)

    return {
        "room_id": room.id,
        "player_id": player.id,
        "ready": player.ready,
        "opponent_ready": all(
            p.ready for p in room.players if p.id != player.id
        ),
        "status": room.status,
        "message": (
            "Both fleets are ready. Battle can begin!"
            if room.status == "playing"
            else "Fleet saved. Waiting for your opponent."
        ),
    }


@router.get("/{room_id}/game")
async def get_game(room_id: str, player_id: str):
    """Return the private board view for one player."""
    room = find_room(room_id)
    player = find_player(room, player_id)
    state = get_game_state(room)

    opponent = next(
        p for p in room.players if p.id != player.id
    )

    own_shots = get_player_shots(state, player.id)
    incoming_shots = get_incoming_shots(state, player.id)

    # Only expose the player's own fleet, never the opponent's fleet.
    own_fleet = [
        {
            **ship,
            "hits": sorted(
                set(ship["cells"]).intersection(
                    attack["cell"] for attack in incoming_shots
                    if attack["result"] == "hit"
                )
            ),
        }
        for ship in player.fleet
    ]

    return {
        "room_id": room.id,
        "status": room.status,
        "player_id": player.id,
        "player_name": player.name,
        "opponent": {
            "id": opponent.id,
            "name": opponent.name,
        },
        "current_turn": state["current_turn"],
        "your_turn": state["current_turn"] == player.id,
        "winner": state["winner"],
        "your_fleet": own_fleet,
        "your_shots": [
            {
                "cell": attack["cell"],
                "result": attack["result"],
                "sunk_ship": attack.get("sunk_ship"),
            }
            for attack in own_shots
        ],
        "incoming_shots": [
            {
                "cell": attack["cell"],
                "result": attack["result"],
            }
            for attack in incoming_shots
        ],
        "your_sunk_ships": get_sunk_ships(
            player, state, opponent.id
        ),
        "opponent_sunk_ships": get_sunk_ships(
            opponent, state, player.id
        ),
        "shots_taken": len(own_shots),
    }


@router.post("/{room_id}/fire")
async def fire_at_cell(room_id: str, request: FireRequest):
    """Fire at a cell numbered 0-99 on the opponent's board."""
    room = find_room(room_id)
    player = find_player(room, request.player_id)
    state = get_game_state(room)

    if room.status != "playing" or state["winner"] is not None:
        raise HTTPException(
            status_code=409,
            detail="This battle is not currently active.",
        )

    if state["current_turn"] != player.id:
        raise HTTPException(
            status_code=409,
            detail="It is not your turn.",
        )

    opponent = next(
        p for p in room.players if p.id != player.id
    )

    previous_shots = get_player_shots(state, player.id)

    if any(attack["cell"] == request.cell for attack in previous_shots):
        raise HTTPException(
            status_code=409,
            detail="You have already fired at this cell.",
        )

    hit_ship = next(
        (
            ship
            for ship in opponent.fleet
            if request.cell in ship["cells"]
        ),
        None,
    )

    result = "hit" if hit_ship else "miss"

    attack = {
        "attacker_id": player.id,
        "target_id": opponent.id,
        "cell": request.cell,
        "result": result,
        "sunk_ship": None,
    }

    state["attacks"].append(attack)

    sunk_ships = get_sunk_ships(
        opponent, state, player.id
    )

    if hit_ship and set(hit_ship["cells"]).issubset(
        {
            item["cell"]
            for item in get_player_shots(state, player.id)
            if item["result"] == "hit"
        }
    ):
        attack["sunk_ship"] = hit_ship["name"]

    if len(sunk_ships) == len(SHIP_LENGTHS):
        state["winner"] = player.id
        room.status = "finished"
        message = "Victory! You sank the entire enemy fleet."
    else:
        # Standard Battleship rules: each shot uses up the player's turn.
        state["current_turn"] = opponent.id

        if attack["sunk_ship"]:
            message = f"Hit! You sank the enemy {attack['sunk_ship']}."
        elif result == "hit":
            message = "Direct hit!"
        else:
            message = "Miss. Your opponent's turn."

    return {
        "room_id": room.id,
        "attacker_id": player.id,
        "target_id": opponent.id,
        "cell": request.cell,
        "result": result,
        "sunk_ship": attack["sunk_ship"],
        "current_turn": state["current_turn"],
        "winner": state["winner"],
        "status": room.status,
        "message": message,
    }


@router.get("/{room_id}")
async def get_room(room_id: str):
    room = find_room(room_id)

    return {
        "room_id": room.id,
        "players": [
            {
                "id": player.id,
                "name": player.name,
                "ready": player.ready,
            }
            for player in room.players
        ],
        "status": room.status,
    }
