from dataclasses import dataclass, field


@dataclass
class Player:
    id: str
    name: str
    fleet: list[dict] = field(default_factory=list)
    ready: bool = False


@dataclass
class Room:
    id: str
    players: list[Player] = field(default_factory=list)
    status: str = "waiting"