
import { Fragment, useCallback, useEffect, useState } from "react";

type Ship = {
  id?: string;
  name?: string;
  length?: number;
  cells: number[];
  horizontal?: boolean;
  hits?: number[];
};

type Shot = {
  cell: number;
  result?: string;
  sunk_ship?: string | null;
  attacker_id?: string;
  target_id?: string;
  player_id?: string;
};

type GameState = {
  room_id?: string;
  status?: string;
  player_id?: string;
  player_name?: string;
  opponent?: {
    id?: string;
    name?: string;
  };
  opponent_id?: string;
  opponent_name?: string;
  current_turn?: string;
  your_turn?: boolean;
  winner?: string | null;
  your_fleet?: Ship[];
  your_shots?: Shot[];
  incoming_shots?: Shot[];
  your_sunk_ships?: string[];
  opponent_sunk_ships?: string[];
  shots_taken?: number;
};

type FireResponse = {
  result?: string;
  message?: string;
  sunk_ship?: string | null;
  winner?: string | null;
  current_turn?: string;
  status?: string;
};

type Props = {
  roomId: string;
  playerId: string;
  playerName?: string;
  onExit?: () => void;
};

function normalizeShots(value: unknown): Shot[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): Shot | null => {
      if (typeof item === "number" && Number.isInteger(item)) {
        return { cell: item };
      }

      if (
        item &&
        typeof item === "object" &&
        "cell" in item &&
        typeof item.cell === "number"
      ) {
        return item as Shot;
      }

      return null;
    })
    .filter((shot): shot is Shot => shot !== null);
}

function normalizeShips(value: unknown): Ship[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (ship): ship is Ship =>
      typeof ship === "object" &&
      ship !== null &&
      "cells" in ship &&
      Array.isArray(ship.cells)
  );
}

function normalizeShipNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (name): name is string => typeof name === "string"
  );
}

function cellLabel(cell: number): string {
  const row = Math.floor(cell / 10);
  const column = cell % 10;

  return `${String.fromCharCode(65 + row)}${column + 1}`;
}

function isHit(result?: string): boolean {
  return (
    typeof result === "string" &&
    result.toLowerCase().includes("hit")
  );
}

function isMiss(result?: string): boolean {
  return (
    typeof result === "string" &&
    result.toLowerCase().includes("miss")
  );
}

export default function BattleScreen({
  roomId,
  playerId,
  playerName,
  onExit,
}: Props) {
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [firing, setFiring] = useState(false);
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadGame = useCallback(async () => {
    try {
      const response = await fetch(
        `/rooms/${roomId}/game?player_id=${encodeURIComponent(playerId)}`
      );

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to load the game.");
      }

      const data = (await response.json()) as GameState;

      setGame(data);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to the game server."
      );
    } finally {
      setLoading(false);
    }
  }, [roomId, playerId]);

  // Poll the server so both players see new shots and turn changes.
  useEffect(() => {
    let cancelled = false;
    let requestInProgress = false;

    const fetchGame = async () => {
      if (requestInProgress || cancelled) return;

      requestInProgress = true;

      try {
        const response = await fetch(
          `/rooms/${roomId}/game?player_id=${encodeURIComponent(playerId)}`
        );

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Unable to load the game.");
        }

        const data = (await response.json()) as GameState;

        if (!cancelled) {
          setGame(data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to connect to the game server."
          );
        }
      } finally {
        requestInProgress = false;

        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchGame();

    const interval = window.setInterval(() => {
      void fetchGame();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [roomId, playerId]);

  const ownShips = normalizeShips(game?.your_fleet);
  const incomingShots = normalizeShots(game?.incoming_shots);
  const outgoingShots = normalizeShots(game?.your_shots);

  const ownSunkShips = normalizeShipNames(game?.your_sunk_ships);
  const enemySunkShips = normalizeShipNames(game?.opponent_sunk_ships);

  const opponentName =
    game?.opponent?.name ?? game?.opponent_name ?? "Opponent";

  const myTurn = game?.your_turn === true;

  const finished =
    Boolean(game?.winner) || game?.status === "finished";

  const iWon = game?.winner === playerId;

  const ownShipsRemaining = Math.max(0, 5 - ownSunkShips.length);
  const enemyShipsRemaining = Math.max(0, 5 - enemySunkShips.length);

  const ownShipCells = new Set<number>(
    ownShips.flatMap((ship) => ship.cells)
  );

  const incomingShotMap = new Map<number, Shot>(
    incomingShots.map((shot) => [shot.cell, shot])
  );

  const outgoingShotMap = new Map<number, Shot>(
    outgoingShots.map((shot) => [shot.cell, shot])
  );

  const ownHitCells = new Set<number>(
    ownShips.flatMap((ship) => ship.hits ?? [])
  );

  // Fallback if the backend does not populate each ship's hits array.
  for (const shot of incomingShots) {
    if (isHit(shot.result) && ownShipCells.has(shot.cell)) {
      ownHitCells.add(shot.cell);
    }
  }

  const fireAt = async (cell: number) => {
    if (!game || firing || finished || !myTurn) return;

    if (outgoingShotMap.has(cell)) {
      setNotice(`${cellLabel(cell)} has already been targeted.`);
      return;
    }

    setFiring(true);
    setSelectedCell(cell);
    setNotice("");
    setError("");

    try {
      const response = await fetch(`/rooms/${roomId}/fire`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          player_id: playerId,
          cell,
        }),
      });

      const data = (await response.json()) as FireResponse;

      if (!response.ok) {
        throw new Error(data.message || "The shot could not be fired.");
      }

      const location = cellLabel(cell);
      const result = data.result?.toLowerCase() ?? "";

      if (result.includes("hit")) {
        setNotice(
          data.sunk_ship
            ? `DIRECT HIT at ${location}. ${data.sunk_ship} has been sunk!`
            : `DIRECT HIT at ${location}.`
        );
      } else if (result.includes("miss")) {
        setNotice(`SHOT MISSED at ${location}.`);
      } else {
        setNotice(data.message || `Shot fired at ${location}.`);
      }

      if (data.winner) {
        setNotice(
          data.winner === playerId
            ? "VICTORY — the enemy fleet has been destroyed."
            : "DEFEAT — your fleet has been destroyed."
        );
      }

      await loadGame();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred while firing."
      );

      await loadGame();
    } finally {
      setFiring(false);
    }
  };

  const renderOwnCell = (cell: number) => {
    const shot = incomingShotMap.get(cell);
    const hasShip = ownShipCells.has(cell);

    const wasHit =
      ownHitCells.has(cell) ||
      (shot !== undefined && isHit(shot.result));

    const wasMiss = shot !== undefined && isMiss(shot.result);

    let className = "battle-cell own-cell";

    if (hasShip) className += " ship-cell";

    if (wasHit) {
      className += " hit-cell";
    } else if (wasMiss) {
      className += " miss-cell";
    }

    const label = [
      cellLabel(cell),
      hasShip ? "ship" : "water",
      wasHit ? "hit" : "",
      wasMiss ? "miss" : "",
    ]
      .filter(Boolean)
      .join(", ");

    return (
      <button
        key={cell}
        type="button"
        className={className}
        aria-label={label}
        title={label}
        disabled
      >
        {wasHit ? "✕" : wasMiss ? "•" : hasShip ? "■" : ""}
      </button>
    );
  };

  const renderEnemyCell = (cell: number) => {
    const shot = outgoingShotMap.get(cell);
    const alreadyTargeted = Boolean(shot);

    let className = "battle-cell enemy-cell";

    if (shot && isHit(shot.result)) {
      className += " hit-cell";
    } else if (shot && isMiss(shot.result)) {
      className += " miss-cell";
    }

    if (selectedCell === cell) {
      className += " selected-cell";
    }

    const disabled =
      loading || firing || finished || !myTurn || alreadyTargeted;

    const label = shot
      ? `${cellLabel(cell)}: ${shot.result ?? "targeted"}`
      : `${cellLabel(cell)}: ${disabled ? "unavailable" : "fire here"}`;

    return (
      <button
        key={cell}
        type="button"
        className={className}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => void fireAt(cell)}
      >
        {shot && isHit(shot.result)
          ? "✕"
          : shot && isMiss(shot.result)
            ? "•"
            : ""}
      </button>
    );
  };

  // Correct grid structure: a coordinate corner, 10 column labels,
  // then 10 rows with one row label and exactly 10 cells each.
  const renderBoard = (kind: "own" | "enemy") => (
    <div className="battle-grid-layout">
      <span
        className="battle-coordinate-corner"
        aria-hidden="true"
      />

      {Array.from({ length: 10 }, (_, column) => (
        <span
          className="battle-column-label"
          key={`column-${column}`}
          aria-hidden="true"
        >
          {column + 1}
        </span>
      ))}

      {Array.from({ length: 10 }, (_, row) => (
        <Fragment key={`row-${row}`}>
          <span className="battle-row-label" aria-hidden="true">
            {String.fromCharCode(65 + row)}
          </span>

          {Array.from({ length: 10 }, (_, column) => {
            const cell = row * 10 + column;

            return kind === "own"
              ? renderOwnCell(cell)
              : renderEnemyCell(cell);
          })}
        </Fragment>
      ))}
    </div>
  );

  if (loading && !game) {
    return (
      <main className="battle-screen">
        <div className="battle-loading">
          <p className="eyebrow">CANNONFALL COMMAND CENTER</p>
          <h1>Establishing battlefield...</h1>
          <p>Connecting to the fleet command server.</p>

          {error && (
            <p className="battle-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="battle-screen">
        <div className="battle-loading">
          <p className="eyebrow">CONNECTION ERROR</p>
          <h1>Battlefield unavailable</h1>
          <p>{error || "The game state could not be loaded."}</p>

          <button
            type="button"
            className="battle-action-button"
            onClick={() => void loadGame()}
          >
            Retry connection
          </button>

          {onExit && (
            <button
              type="button"
              className="battle-action-button secondary"
              onClick={onExit}
            >
              Return to command center
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="battle-screen">
      <header className="battle-header">
        <div>
          <p className="eyebrow">CANNONFALL // NAVAL OPERATIONS</p>
          <h1>Command the Seas</h1>
          <p className="battle-subtitle">
            Room: <strong>{roomId}</strong>
            {" · "}
            Commander:{" "}
            <strong>{playerName || game.player_name || "Player"}</strong>
          </p>
        </div>

        <div className="battle-header-actions">
          <span
            className={`battle-status ${
              finished
                ? "finished"
                : myTurn
                  ? "your-turn"
                  : "waiting-turn"
            }`}
          >
            {finished
              ? "MISSION COMPLETE"
              : myTurn
                ? "YOUR TURN"
                : "ENEMY TURN"}
          </span>

          {onExit && (
            <button
              type="button"
              className="battle-action-button secondary"
              onClick={onExit}
            >
              Exit battle
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="battle-notice error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="battle-notice" role="status">
          {notice}
        </div>
      )}

      <section className="battle-stats">
        <div className="battle-stat">
          <span className="battle-stat-label">YOUR FLEET</span>
          <strong>{ownShipsRemaining}/5</strong>
          <span>ships remaining</span>
        </div>

        <div className="battle-stat">
          <span className="battle-stat-label">ENEMY FLEET</span>
          <strong>{enemyShipsRemaining}/5</strong>
          <span>ships remaining</span>
        </div>

        <div className="battle-stat">
          <span className="battle-stat-label">BATTLE STATUS</span>
          <strong>
            {finished ? "ENDED" : myTurn ? "ENGAGE" : "STANDBY"}
          </strong>
          <span>
            {finished
              ? "Final results"
              : myTurn
                ? "Select a target"
                : "Awaiting enemy fire"}
          </span>
        </div>
      </section>

      <section className="battle-boards">
        <article className="battle-board-panel">
          <div className="battle-board-heading">
            <div>
              <p className="eyebrow">FRIENDLY WATERS</p>
              <h2>Your Fleet</h2>
            </div>

            <span className="battle-board-count">
              {ownShipsRemaining} ACTIVE
            </span>
          </div>

          <p className="battle-board-description">
            Your deployed ships and incoming enemy fire.
          </p>

          {renderBoard("own")}

          <div className="battle-sunk-list">
            <span className="battle-stat-label">LOST SHIPS</span>

            {ownSunkShips.length > 0 ? (
              <ul>
                {ownSunkShips.map((ship) => (
                  <li key={ship}>{ship}</li>
                ))}
              </ul>
            ) : (
              <p>No ships sunk.</p>
            )}
          </div>
        </article>

        <article className="battle-board-panel enemy-board-panel">
          <div className="battle-board-heading">
            <div>
              <p className="eyebrow">HOSTILE WATERS</p>
              <h2>{opponentName}</h2>
            </div>

            <span className="battle-board-count">
              {enemyShipsRemaining} ACTIVE
            </span>
          </div>

          <p className="battle-board-description">
            {finished
              ? "Engagement complete."
              : myTurn
                ? "Select a coordinate to fire your cannons."
                : "Enemy is preparing its next move."}
          </p>

          {renderBoard("enemy")}

          <div className="battle-sunk-list">
            <span className="battle-stat-label">
              ENEMY SHIPS DESTROYED
            </span>

            {enemySunkShips.length > 0 ? (
              <ul>
                {enemySunkShips.map((ship) => (
                  <li key={ship}>{ship}</li>
                ))}
              </ul>
            ) : (
              <p>No enemy ships sunk yet.</p>
            )}
          </div>
        </article>
      </section>

      <section className="battle-legend">
        <span className="battle-legend-item">
          <span className="legend-symbol ship-symbol">■</span>
          Friendly ship
        </span>

        <span className="battle-legend-item">
          <span className="legend-symbol hit-symbol">✕</span>
          Hit
        </span>

        <span className="battle-legend-item">
          <span className="legend-symbol miss-symbol">•</span>
          Miss
        </span>

        <span className="battle-legend-item">
          <span className="legend-symbol water-symbol" />
          Untargeted water
        </span>
      </section>

      <footer className="battle-footer">
        <span>CANNONFALL COMMAND CENTER</span>
        <span>
          {finished
            ? "ENGAGEMENT CLOSED"
            : firing
              ? "FIRING CANNONS..."
              : myTurn
                ? "AWAITING COMMAND"
                : "MONITORING ENEMY MOVEMENT"}
        </span>
      </footer>

      {/* Centered full-screen victory / defeat overlay */}
      {finished && (
        <div
          className={`battle-outcome-overlay ${
            iWon ? "victory-overlay" : "defeat-overlay"
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="battle-outcome-title"
        >
          <div className="battle-outcome-card">
            <p className="eyebrow">CANNONFALL // FINAL REPORT</p>

            <div className="battle-outcome-divider" />

            <h2 id="battle-outcome-title">
              {iWon ? "VICTORY" : "DEFEAT"}
            </h2>

            <p className="battle-outcome-message">
              {iWon
                ? "Enemy fleet eliminated. The seas are yours."
                : "Your fleet has been eliminated. Mission over."}
            </p>

            <span className="battle-outcome-status">
              ENGAGEMENT CONCLUDED
            </span>

            {onExit && (
              <button
                type="button"
                className="battle-action-button outcome-exit-button"
                onClick={onExit}
              >
                Return to command center
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
