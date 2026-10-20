import random
import string

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.room import Player, Room

router = APIRouter(prefix="/rooms", tags=["rooms"])

rooms: dict[str, Room] = {}
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


class RematchRequest(BaseModel):
    player_id: str


class ForfeitRequest(BaseModel):
    player_id: str


class LeaveRoomRequest(BaseModel):
    player_id: str


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
    """Initialize a fresh match for the two players."""
    game_states[room.id] = {
        "current_turn": room.players[0].id,
        "winner": None,
        "attacks": [],
        "rematch_votes": [],
        "finish_reason": None,
        "forfeited_by": None,
        "forfeiter_name": None,
        "departed_player": None,
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


def get_sunk_ships(
    player: Player,
    state: dict,
    attacker_id: str,
) -> list[str]:
    """Return ship names sunk by the specified attacker."""
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
    player_name = request.player_name.strip()

    if not player_name:
        raise HTTPException(status_code=400, detail="Enter your name.")

    room_id = generate_room_id()
    player = Player(id="player-1", name=player_name)
    room = Room(id=room_id, players=[player])

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
        raise HTTPException(status_code=409, detail="Room is full")

    if room.status in ("playing", "finished"):
        raise HTTPException(
            status_code=409,
            detail="This game has already started.",
        )

    player_name = request.player_name.strip()

    if not player_name:
        raise HTTPException(status_code=400, detail="Enter your name.")

    used_ids = {captain.id for captain in room.players}
    available_ids = ["player-1", "player-2"]
    player_id = next(pid for pid in available_ids if pid not in used_ids)
    player = Player(id=player_id, name=player_name)
    room.players.append(player)

    # A replacement player joining a waiting room starts a fresh deployment.
    for captain in room.players:
        captain.fleet = []
        captain.ready = False
    room.status = "ready"
    if len(room.players) == 2:
        initialize_game(room)

    return {
        "room_id": room.id,
        "player_id": player.id,
        "status": room.status,
    }


@router.post("/{room_id}/fleet")
async def submit_fleet(room_id: str, request: SubmitFleetRequest):
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

    # Support Pydantic v1 and v2.
    player.fleet = [
        ship.model_dump() if hasattr(ship, "model_dump") else ship.dict()
        for ship in request.ships
    ]
    player.ready = True

    if all(captain.ready for captain in room.players):
        room.status = "playing"
        initialize_game(room)

    return {
        "room_id": room.id,
        "player_id": player.id,
        "ready": player.ready,
        "opponent_ready": all(
            captain.ready
            for captain in room.players
            if captain.id != player.id
        ),
        "status": room.status,
        "message": (
            "Battle can begin!"
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
        (captain for captain in room.players if captain.id != player.id),
        None,
    )
    if opponent is None:
        departed = state.get("departed_player")
        if departed is not None:
            opponent = Player(
                id=departed["id"],
                name=departed["name"],
                fleet=departed.get("fleet", []),
                ready=departed.get("ready", False),
            )
    if opponent is None:
        raise HTTPException(
            status_code=409,
            detail="Your opponent is no longer in this room.",
        )

    own_shots = get_player_shots(state, player.id)
    incoming_shots = get_incoming_shots(state, player.id)

    own_fleet = [
        {
            **ship,
            "hits": sorted(
                set(ship["cells"]).intersection(
                    attack["cell"]
                    for attack in incoming_shots
                    if attack["result"] == "hit"
                )
            ),
        }
        for ship in player.fleet
    ]

    votes = state.get("rematch_votes", [])

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
        "finish_reason": state.get("finish_reason"),
        "forfeited_by": state.get("forfeited_by"),
        "forfeiter_name": state.get("forfeiter_name"),
        "opponent_left": not any(
            captain.id == opponent.id for captain in room.players
        ),
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
        "rematch_requested": player.id in votes,
        "opponent_rematch_requested": opponent.id in votes,
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
        captain for captain in room.players if captain.id != player.id
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

    sunk_ships = get_sunk_ships(opponent, state, player.id)

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
        state["finish_reason"] = "fleet_destroyed"
        room.status = "finished"
        message = "Victory! You sank the entire enemy fleet."
    else:
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


@router.post("/{room_id}/forfeit")
async def forfeit_battle(room_id: str, request: ForfeitRequest):
    """Finish the active battle without removing either player from the room."""
    room = find_room(room_id)
    player = find_player(room, request.player_id)
    state = get_game_state(room)

    if room.status != "playing" or state.get("winner") is not None:
        raise HTTPException(
            status_code=409,
            detail="This battle is no longer active.",
        )

    opponent = next(
        captain for captain in room.players if captain.id != player.id
    )

    state["winner"] = opponent.id
    state["finish_reason"] = "forfeit"
    state["forfeited_by"] = player.id
    state["forfeiter_name"] = player.name
    room.status = "finished"

    return {
        "room_id": room.id,
        "status": room.status,
        "winner": opponent.id,
        "finish_reason": "forfeit",
        "forfeited_by": player.id,
        "forfeiter_name": player.name,
        "message": f"{player.name} forfeited. {opponent.name} wins!",
    }


@router.post("/{room_id}/leave")
async def leave_room(room_id: str, request: LeaveRoomRequest):
    """Remove a player only when they explicitly choose to leave the room."""
    room = find_room(room_id)
    player = find_player(room, request.player_id)

    if room.status == "playing":
        raise HTTPException(
            status_code=409,
            detail="Forfeit the active battle before leaving the room.",
        )

    state = game_states.get(room.id)
    opponent = next(
        (captain for captain in room.players if captain.id != player.id),
        None,
    )

    if state is not None:
        state["departed_player"] = {
            "id": player.id,
            "name": player.name,
            "fleet": list(player.fleet),
            "ready": player.ready,
        }
        # A player who leaves cannot retain a rematch vote.
        state["rematch_votes"] = [
            vote for vote in state.get("rematch_votes", [])
            if vote != player.id
        ]

    room.players.remove(player)

    if opponent is None:
        rooms.pop(room.id, None)
        game_states.pop(room.id, None)
        return {"room_id": room.id, "status": "closed", "message": "Room closed."}

    # Keep the remaining player's finished screen visible, but allow a new
    # player to join and start a fresh deployment in this room.
    room.status = "waiting"

    return {
        "room_id": room.id,
        "status": room.status,
        "message": f"{player.name} left the room.",
    }



@router.post("/{room_id}/rematch")
async def request_rematch(room_id: str, request: RematchRequest):
    """Record a rematch vote and reset the match after both players agree."""
    room = find_room(room_id)
    player = find_player(room, request.player_id)

    if room.status != "finished":
        raise HTTPException(
            status_code=409,
            detail="A rematch can only be requested after the battle ends.",
        )

    if len(room.players) != 2:
        raise HTTPException(
            status_code=409,
            detail="Your opponent left the room. Wait for another player to join.",
        )

    state = get_game_state(room)

    if state["winner"] is None:
        raise HTTPException(
            status_code=409,
            detail="The current battle has not finished.",
        )

    # Record this player's rematch vote.
    votes = state.setdefault("rematch_votes", [])
    if player.id not in votes:
        votes.append(player.id)

    # Wait until both players have accepted.
    all_agreed = all(captain.id in votes for captain in room.players)
    if not all_agreed:
        return {
            "room_id": room.id,
            "status": room.status,
            "accepted": True,
            "rematch_started": False,
            "message": "Rematch requested. Waiting for the other captain.",
        }

    # Both players agreed: clear old fleets and require new ship placement.
    for captain in room.players:
        captain.fleet = []
        captain.ready = False

    room.status = "ready"
    initialize_game(room)

    return {
        "room_id": room.id,
        "status": room.status,
        "accepted": True,
        "rematch_started": False,
        "message": "Both captains agreed. Deploy your fleets again!",
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
