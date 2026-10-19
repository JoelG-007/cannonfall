
import { useEffect, useState } from "react";
import "./ShipPlacement.css";

export type PlacedShip = {
  id: string;
  name: string;
  length: number;
  cells: number[];
  horizontal: boolean;
};

type ShipDefinition = {
  id: string;
  name: string;
  length: number;
};

type ShipPlacementProps = {
  playerName?: string;
  opponentName?: string;
  onReady?: (ships: PlacedShip[]) => void | Promise<void>;
  onBack?: () => void;
};

const GRID_SIZE = 10;

const SHIP_DEFINITIONS: ShipDefinition[] = [
  { id: "carrier", name: "Carrier", length: 5 },
  { id: "battleship", name: "Battleship", length: 4 },
  { id: "cruiser", name: "Cruiser", length: 3 },
  { id: "submarine", name: "Submarine", length: 3 },
  { id: "destroyer", name: "Destroyer", length: 2 },
];

const LETTERS = "ABCDEFGHIJ".split("");

function ShipPlacement({
  playerName = "You",
  opponentName = "Waiting for opponent",
  onReady,
  onBack,
}: ShipPlacementProps) {
  const [placedShips, setPlacedShips] = useState<PlacedShip[]>([]);
  const [selectedShipId, setSelectedShipId] = useState<string | null>(
    "carrier",
  );
  const [horizontal, setHorizontal] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);

  const selectedShip = SHIP_DEFINITIONS.find(
    (ship) => ship.id === selectedShipId,
  );

  const occupiedCells = new Set(placedShips.flatMap((ship) => ship.cells));

  const rotateShip = () => {
    setHorizontal((current) => !current);
    setError("");
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "r" || !selectedShipId) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      event.preventDefault();
      setHorizontal((current) => !current);
      setError("");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedShipId]);

  const getShipCells = (
    startCell: number,
    length: number,
    isHorizontal: boolean,
  ): number[] | null => {
    const row = Math.floor(startCell / GRID_SIZE);
    const column = startCell % GRID_SIZE;

    if (isHorizontal && column + length > GRID_SIZE) {
      return null;
    }

    if (!isHorizontal && row + length > GRID_SIZE) {
      return null;
    }

    return Array.from({ length }, (_, index) =>
      isHorizontal
        ? row * GRID_SIZE + column + index
        : (row + index) * GRID_SIZE + column,
    );
  };

  const placeShip = (cell: number) => {
    if (!selectedShip) {
      setError("Select a ship from your fleet first.");
      return;
    }

    const cells = getShipCells(
      cell,
      selectedShip.length,
      horizontal,
    );

    if (!cells) {
      setError(
        "This ship would extend beyond the edge. Choose another starting cell.",
      );
      return;
    }

    const occupiedByOtherShips = new Set(
      placedShips
        .filter((ship) => ship.id !== selectedShip.id)
        .flatMap((ship) => ship.cells),
    );

    if (cells.some((shipCell) => occupiedByOtherShips.has(shipCell))) {
      setError("Ships cannot overlap. Choose another position.");
      return;
    }

    const newShip: PlacedShip = {
      id: selectedShip.id,
      name: selectedShip.name,
      length: selectedShip.length,
      cells,
      horizontal,
    };

    setPlacedShips((currentShips) => [
      ...currentShips.filter((ship) => ship.id !== selectedShip.id),
      newShip,
    ]);

    setError("");

    const nextShip = SHIP_DEFINITIONS.find(
      (ship) =>
        ship.id !== selectedShip.id &&
        !placedShips.some((placed) => placed.id === ship.id),
    );

    if (nextShip) {
      setSelectedShipId(nextShip.id);
    } else {
      setSelectedShipId(null);
    }
  };

  const selectShip = (ship: ShipDefinition) => {
    const existingShip = placedShips.find(
      (placed) => placed.id === ship.id,
    );

    if (existingShip) {
      setPlacedShips((currentShips) =>
        currentShips.filter((placed) => placed.id !== ship.id),
      );
      setHorizontal(existingShip.horizontal);
    }

    setSelectedShipId(ship.id);
    setError("");
  };

  const resetFleet = () => {
    setPlacedShips([]);
    setSelectedShipId("carrier");
    setHorizontal(true);
    setError("");
  };

  const fleetComplete =
    placedShips.length === SHIP_DEFINITIONS.length;

  const renderGrid = (isOpponent: boolean) => {
    const cells = Array.from(
      { length: GRID_SIZE * GRID_SIZE },
      (_, index) => index,
    );

    return (
      <div className="board-frame">
        <div className="board-axis board-column-axis">
          {LETTERS.map((letter) => (
            <span key={letter}>{letter}</span>
          ))}
        </div>

        <div className="board-body">
          <div className="board-axis board-row-axis">
            {cells
              .filter((cell) => cell % GRID_SIZE === 0)
              .map((cell) => (
                <span key={cell}>
                  {Math.floor(cell / GRID_SIZE) + 1}
                </span>
              ))}
          </div>

          <div
            className={`ocean-grid ${
              isOpponent ? "enemy-grid" : "own-grid"
            }`}
            onMouseLeave={() => setHoveredCell(null)}
            onContextMenu={(event) => {
              if (!isOpponent) event.preventDefault();
            }}
          >
            {cells.map((cell) => {
              const ship = isOpponent
                ? undefined
                : placedShips.find((placed) =>
                    placed.cells.includes(cell),
                  );

              const isOccupied = Boolean(ship);
              const previewCells = hoveredCell !== null && selectedShip
                ? getShipCells(hoveredCell, selectedShip.length, horizontal)
                : null;
              const previewOverlaps = previewCells?.some((previewCell) =>
                occupiedCells.has(previewCell) && !placedShips.some((placed) =>
                  placed.id === selectedShip?.id && placed.cells.includes(previewCell),
                ),
              ) ?? false;
              const isPreviewCell = !isOpponent && Boolean(previewCells?.includes(cell));
              const previewIsValid = Boolean(previewCells) && !previewOverlaps;

              return (
                <button
                  key={cell}
                  type="button"
                  className={`ocean-cell ${
                    isOccupied ? "occupied" : ""
                  } ${isPreviewCell ? (previewIsValid ? "ship-preview" : "ship-preview-invalid") : ""}`}
                  onMouseEnter={() => {
                    if (!isOpponent) setHoveredCell(cell);
                  }}
                  onClick={() => {
                    if (!isOpponent) placeShip(cell);
                  }}
                  onContextMenu={(event) => {
                    if (!isOpponent) {
                      event.preventDefault();
                      rotateShip();
                    }
                  }}
                  disabled={isOpponent || !selectedShipId}
                  aria-label={
                    isOpponent
                      ? `Opponent grid cell ${LETTERS[cell % 10]}${Math.floor(cell / 10) + 1}`
                      : `Your grid cell ${LETTERS[cell % 10]}${Math.floor(cell / 10) + 1}${isOccupied ? `, ${ship?.name}` : ""}`
                  }
                  title={
                    isOccupied
                      ? ship?.name
                      : `${LETTERS[cell % 10]}${Math.floor(cell / 10) + 1}`
                  }
                >
                  {isOccupied && <span className="ship-cell-mark" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="placement-screen">
      <header className="placement-header">
        <button
          type="button"
          className="placement-back"
          onClick={onBack}
        >
          ← BACK TO LOBBY
        </button>

        <div className="placement-brand">CANNONFALL</div>

        <div className="placement-captain">
          CAPTAIN: <strong>{playerName}</strong>
        </div>
      </header>

      <section className="placement-intro">
        <p className="placement-eyebrow">PHASE 01 · FLEET DEPLOYMENT</p>
        <h1>Position your fleet.</h1>
        <p>
          Place every vessel on your ocean grid. Keep your fleet
          within the boundaries and avoid overlapping ships.
        </p>
      </section>

      <section className="battle-boards">
        <article className="ocean-panel own-panel">
          <div className="board-title-row">
            <div className="board-identity">
              <span className="territory-marker blue-marker" />
              <div>
                <p className="placement-eyebrow">YOUR TERRITORY</p>
                <h2>{playerName}</h2>
              </div>
            </div>

            <span className="board-count">
              {placedShips.length}/{SHIP_DEFINITIONS.length} SHIPS
            </span>
          </div>

          {renderGrid(false)}

          <p className="board-caption own-caption">
            SELECT A SHIP · HOVER TO PREVIEW · RIGHT-CLICK OR PRESS R TO ROTATE
          </p>
        </article>

        <article className="ocean-panel enemy-panel">
          <div className="board-title-row">
            <div className="board-identity">
              <span className="territory-marker red-marker" />
              <div>
                <p className="placement-eyebrow">OPPONENT TERRITORY</p>
                <h2>{opponentName}</h2>
              </div>
            </div>

            <span className="enemy-status">ENEMY WATERS</span>
          </div>

          {renderGrid(true)}

          <p className="board-caption enemy-caption">
            OPPONENT SHIPS WILL BE HIDDEN DURING BATTLE
          </p>
        </article>
      </section>

      <section className="fleet-panel">
        <div className="fleet-heading">
          <div>
            <p className="placement-eyebrow">YOUR ARMADA</p>
            <h2>Fleet manifest</h2>
          </div>

          <span className="fleet-progress">
            {fleetComplete ? "FLEET READY" : "AWAITING DEPLOYMENT"}
          </span>
        </div>

        <div className="fleet-list">
          {SHIP_DEFINITIONS.map((ship) => {
            const placed = placedShips.find(
              (item) => item.id === ship.id,
            );
            const selected = selectedShipId === ship.id;

            return (
              <button
                type="button"
                key={ship.id}
                className={`fleet-item fleet-select ${
                  selected ? "fleet-selected" : ""
                } ${placed ? "fleet-placed" : ""}`}
                onClick={() => selectShip(ship)}
              >
                <span className="fleet-symbol">
                  {placed ? "✓" : "▰"}
                </span>

                <span className="fleet-name">
                  <strong>{ship.name}</strong>
                  <span>
                    {ship.length} cells
                    {placed ? " · Deployed" : ""}
                  </span>
                </span>

                <span className="fleet-state">
                  {placed ? "READY" : selected ? "SELECTED" : "PLACE"}
                </span>

                <span className="ship-length-preview">
                  {Array.from({ length: ship.length }, (_, index) => (
                    <span key={index} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <div className="fleet-controls">
          <div className="orientation-control">
            <span>ORIENTATION</span>
            <span className="orientation-value">{horizontal ? "HORIZONTAL" : "VERTICAL"}</span>
            <button
              type="button"
              className="rotate-ship-button"
              onClick={rotateShip}
              aria-label="Rotate selected ship"
              title="Rotate ship (R)"
              disabled={!selectedShipId}
            >
              ↻
            </button>
            <span className="rotate-hint">Right-click or press R</span>
          </div>

          <button
            type="button"
            className="reset-fleet"
            onClick={resetFleet}
          >
            RESET FLEET
          </button>
        </div>

        {error && (
          <p className="placement-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="ready-fleet"
          disabled={!fleetComplete || submitting}
          onClick={async () => {
            if (!fleetComplete || submitting) return;

            setSubmitting(true);
            setError("");

            try {
              await onReady?.(placedShips);
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Could not submit your fleet. Please try again.",
              );
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {submitting
            ? "SAVING FLEET..."
            : fleetComplete
              ? "CONFIRM FLEET & RETURN TO LOBBY →"
              : `DEPLOY ALL SHIPS · ${placedShips.length}/${SHIP_DEFINITIONS.length}`}
        </button>

        <p className="fleet-footer">
          YOUR FLEET WILL BE SAVED TO THE SERVER WHEN YOU CONFIRM.
        </p>
      </section>
    </main>
  );
}

export default ShipPlacement;
