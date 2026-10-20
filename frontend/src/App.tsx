
import { useCallback, useEffect, useState } from "react";
import ShipPlacement from "./components/ShipPlacement";
import BattleScreen from "./components/BattleScreen";
import anchorEmblem from "./assets/anchor-emblem.png";

type Player = {
  id: string;
  name: string;
  ready?: boolean;
};

type Room = {
  id: string;
  room_id?: string;
  players: Player[];
  status: string;
};

type RoomResponse = {
  room_id?: string;
  id?: string;
  player_id?: string;
  player?: Player;
  players?: Player[];
  status?: string;
  detail?: string;
};

type PlacedShip = {
  id: string;
  name: string;
  length: number;
  cells: number[];
  horizontal: boolean;
};

async function readResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(
      `Server returned an empty response (HTTP ${response.status}).`
    );
  }

  let data: T;

  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Server returned invalid JSON (HTTP ${response.status}): ${text.slice(0, 200)}`
    );
  }

  if (!response.ok) {
    const errorData = data as { detail?: string };
    throw new Error(
      errorData.detail ?? `Request failed (HTTP ${response.status}).`
    );
  }

  return data;
}

function App() {
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [backendConnected, setBackendConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [placingShips, setPlacingShips] = useState(false);
  const [fleetReady, setFleetReady] = useState(false);

  // Poll backend health so the indicator reflects connected/disconnected state.
  useEffect(() => {
    let cancelled = false;

    const checkBackend = async () => {
      try {
        const response = await fetch("/health", { cache: "no-store" });
        if (!cancelled) setBackendConnected(response.ok);
      } catch {
        if (!cancelled) setBackendConnected(false);
      }
    };

    void checkBackend();
    const timer = window.setInterval(() => void checkBackend(), 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Retrieve the latest room information.
  const refreshRoom = useCallback(async (id: string) => {
    const response = await fetch(
      `/rooms/${encodeURIComponent(id)}`,
      { cache: "no-store" }
    );

    const data = await readResponse<RoomResponse>(response);
    const returnedId = data.room_id ?? data.id ?? id;

    setRoom({
      id: returnedId,
      room_id: returnedId,
      players: data.players ?? [],
      status: data.status ?? "waiting",
    });

    setBackendConnected(true);
  }, []);

  // Poll the room while in the lobby.
  // BattleScreen handles its own game-state polling.
  useEffect(() => {
    if (!room?.id || placingShips || room.status === "playing") {
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      try {
        await refreshRoom(room.id);

        if (!cancelled) {
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not refresh the room."
          );
        }
      }
    };

    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [room?.id, room?.status, placingShips, refreshRoom]);

  async function createRoom() {
    if (!playerName.trim()) {
      setError("Enter your name first.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          player_name: playerName.trim(),
        }),
      });

      const data = await readResponse<RoomResponse>(response);

      const id = data.room_id ?? data.id;
      const newPlayerId = data.player_id ?? data.player?.id;

      if (!id || !newPlayerId) {
        throw new Error(
          "The server did not return the room code and player ID."
        );
      }

      setRoomCode(id);
      setPlayerId(newPlayerId);
      setFleetReady(false);
      setPlacingShips(false);

      await refreshRoom(id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong creating the room."
      );
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom() {
    if (!playerName.trim()) {
      setError("Enter your name first.");
      return;
    }

    const id = roomCode.trim().toUpperCase();

    if (!id) {
      setError("Enter a room code.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/rooms/${encodeURIComponent(id)}/join`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            player_name: playerName.trim(),
          }),
        }
      );

      const data = await readResponse<RoomResponse>(response);

      const returnedId = data.room_id ?? data.id ?? id;
      const newPlayerId = data.player_id ?? data.player?.id;

      if (!newPlayerId) {
        throw new Error(
          "The server did not return your player ID."
        );
      }

      setPlayerId(newPlayerId);
      setRoomCode(returnedId);
      setFleetReady(false);
      setPlacingShips(false);

      await refreshRoom(returnedId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong joining the room."
      );
    } finally {
      setLoading(false);
    }
  }

  async function leaveRoom() {
    if (!room || !playerId) {
      setRoom(null);
      setPlayerId("");
      setRoomCode("");
      setError("");
      setPlacingShips(false);
      setFleetReady(false);
      return;
    }

    setError("");

    try {
      const response = await fetch(
        `/rooms/${encodeURIComponent(room.id)}/leave`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ player_id: playerId }),
        }
      );

      const data = (await response.json().catch(() => ({}))) as {
        detail?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.detail ?? data.message ?? "Could not leave the room."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not leave the room. Please try again."
      );
      return;
    }

    setRoom(null);
    setPlayerId("");
    setRoomCode("");
    setPlacingShips(false);
    setFleetReady(false);
  }

  // Submit the player's fleet to the backend.
  async function handleFleetReady(
    ships: PlacedShip[]
  ): Promise<void> {
    if (!room || !playerId) {
      throw new Error(
        "Your room or player ID is missing. Please leave and rejoin."
      );
    }

    const response = await fetch(
      `/rooms/${encodeURIComponent(room.id)}/fleet`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          player_id: playerId,
          ships,
        }),
      }
    );

    await readResponse<{
      detail?: string;
      status?: string;
      message?: string;
      ready?: boolean;
      opponent_ready?: boolean;
    }>(response);

    setFleetReady(true);
    setPlacingShips(false);
    setError("");

    await refreshRoom(room.id);
  }

  // Return to the lobby if the battle screen calls onExit.
  function handleBattleExit() {
    setError("");
    setPlacingShips(false);
    setFleetReady(false);
    setRoom(null);
    setPlayerId("");
    setRoomCode("");
  }

  // Show the battle screen when both fleets have been submitted.
  if (room?.status === "playing" && playerId) {
    return (
      <BattleScreen
        roomId={room.id}
        playerId={playerId}
        playerName={playerName}
        onExit={handleBattleExit}
        onRematchReady={() => {
          setFleetReady(false);
          setPlacingShips(true);
          void refreshRoom(room.id);
        }}
      />
    );
  }

  // Ship placement screen.
  if (placingShips && room) {
    const opponent = room.players.find(
      (player) => player.id !== playerId
    );

    return (
      <ShipPlacement
        playerName={playerName}
        opponentName={opponent?.name ?? "Waiting for opponent"}
        onBack={() => setPlacingShips(false)}
        onReady={handleFleetReady}
      />
    );
  }

  // Main lobby and room interface.
  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <img src={anchorEmblem} alt="Cannonfall engraved anchor emblem" />
          </span>
          <span className="brand-wordmark">CANNONFALL</span>
        </div>

        <div
          className={`server-status ${backendConnected ? "is-connected" : "is-disconnected"}`}
          role="status"
          aria-live="polite"
        >
          <span className={`status-dot ${backendConnected ? "online" : "offline"}`} />
          <span className="server-status-copy">
            <strong>{backendConnected ? "SERVER CONNECTED" : "SERVER DISCONNECTED"}</strong>
            <small>{backendConnected ? "ONLINE · READY" : "OFFLINE · RETRYING"}</small>
          </span>
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">MULTIPLAYER NAVAL WARFARE</p>
        <h1>
          COMMAND
          <br />
          THE <span>SEAS.</span>
        </h1>
        <p className="subtitle">
          Assemble your fleet. Take aim. Outmanoeuvre your opponent.
        </p>
      </section>

      {!room ? (
        <section className="lobby-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">COMMAND CENTER</p>
              <h2>Enter the battle</h2>
            </div>
            <span className="radar">◎</span>
          </div>

          <label htmlFor="playerName">CALLSIGN</label>
          <input
            id="playerName"
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            placeholder="Enter your captain name"
            maxLength={20}
          />

          <button
            className="primary-button"
            onClick={() => void createRoom()}
            disabled={loading || !backendConnected}
          >
            {loading ? "PLEASE WAIT..." : "＋ CREATE NEW ROOM"}
          </button>

          <div className="separator">
            <span />
            <p>OR JOIN YOUR CREW</p>
            <span />
          </div>

          <label htmlFor="roomCode">ROOM CODE</label>
          <div className="join-row">
            <input
              id="roomCode"
              value={roomCode}
              onChange={(event) =>
                setRoomCode(event.target.value.toUpperCase())
              }
              placeholder="ENTER CODE"
              maxLength={10}
            />

            <button
              className="secondary-button"
              onClick={() => void joinRoom()}
              disabled={loading || !backendConnected}
            >
              JOIN
            </button>
          </div>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <p className="card-footer">
            TWO CAPTAINS. ONE OCEAN. ONLY ONE VICTOR.
          </p>
        </section>
      ) : (
        <section className="lobby-card room-card">
          <p className="eyebrow">MULTIPLAYER LOBBY</p>
          <h2>Room ready</h2>

          <p className="room-code-label">SHARE THIS ROOM CODE</p>

          <button
            className="room-code"
            onClick={() => {
              void navigator.clipboard
                .writeText(room.id)
                .catch(() => {
                  setError(
                    "Could not copy the room code. Please copy it manually."
                  );
                });
            }}
            title="Copy room code"
          >
            {room.id} <span>⧉</span>
          </button>

          <p className="player-count">
            {room.players.length} / 2 CAPTAINS
          </p>

          <div className="player-list">
            {[0, 1].map((slot) => {
              const player = room.players[slot];

              return (
                <div className="player-slot" key={slot}>
                  <span className="player-avatar">
                    {player
                      ? player.name.charAt(0).toUpperCase()
                      : "?"}
                  </span>

                  <div>
                    <strong>
                      {player?.name ?? "Awaiting captain..."}
                    </strong>
                    <p>
                      {player
                        ? player.id === playerId
                          ? "YOU · CONNECTED"
                          : "OPPONENT · CONNECTED"
                        : "SLOT OPEN"}
                    </p>
                  </div>

                  <span
                    className={`status-dot ${player ? "online" : ""}`}
                  />
                </div>
              );
            })}
          </div>

          <div className="waiting-message">
            {room.status === "playing"
              ? "Both fleets are ready! Battle is beginning..."
              : room.players.length < 2
                ? "Waiting for your opponent to join..."
                : room.players.every((player) => player.ready)
                  ? "Both fleets are ready!"
                  : room.players.some((player) => player.ready)
                    ? "One fleet is ready. Waiting for the other captain..."
                    : "Both captains are here. Deploy your fleets!"}
          </div>

          <button
            className="primary-button"
            onClick={() => setPlacingShips(true)}
            disabled={
              room.players.length < 2 ||
              fleetReady ||
              room.status === "playing"
            }
          >
            {fleetReady
              ? "FLEET DEPLOYED"
              : "DEPLOY YOUR FLEET →"}
          </button>

          {fleetReady && (
            <p className="waiting-message">
              Your fleet has been submitted. Waiting for the other captain.
            </p>
          )}

          <button
            className="secondary-button leave-button"
            onClick={leaveRoom}
          >
            LEAVE ROOM
          </button>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </section>
      )}

      <footer className="page-footer creator-footer">
        <div className="creator-credit">
          <span className="credit-rule" />
          <p>DEVELOPED BY <strong>JOEL GUEDES</strong></p>
          <span className="credit-rule" />
        </div>
        <p className="creator-quote">
          Whatever I've done, I did it for love, I did it for fun, Couldn't get enough...
        </p>
        <span className="creator-heart" aria-hidden="true">♥</span>
      </footer>
    </main>
  );
}

export default App;