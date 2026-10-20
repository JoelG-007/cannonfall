# CANNONFALL

**A multiplayer naval artillery game built for the college lab.**

Cannonfall started with a simple problem: I wanted to play games during breaks in my college lab, but the lab's ad blocker kept getting in the way of almost everything. Instead of looking for another game to play, I decided to build one myself.

The idea was to create a multiplayer game that could run directly in a browser, without requiring installations or a dedicated gaming setup. What began as a workaround turned into a project involving real-time communication, game state management, backend development, and multiplayer synchronization.

Cannonfall is the result: a browser-based naval combat game where two players deploy their fleets, take turns firing at each other, and try to sink the opponent's ships.

**Play:** https://cannonfall.netlify.app

## Features

- **Multiplayer naval combat** — Play against another player in a shared room.
- **Room-based matchmaking** — Create a room and invite another player using its room code.
- **Fleet placement** — Position ships on the grid before battle.
- **Turn-based combat** — Attack coordinates on your opponent's grid.
- **Battle feedback** — Track hits, misses, and sunk ships.
- **Ready-up system** — Battle begins when both players are ready.
- **Victory and defeat states** — Find out who wins when a fleet is eliminated.
- **Rematches** — Return to fleet placement and fight again.
- **Browser-based gameplay** — No game installation required.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| Real-time communication | WebSockets |
| Frontend hosting | Netlify |
| Backend hosting | Render |
| Version control | Git and GitHub |

## How It Works

1. A player creates a room and receives a room code.
2. Another player joins using that code.
3. Both players place their fleets.
4. Once both players are ready, the backend starts the battle.
5. Players take turns attacking coordinates.
6. The game tracks attack results and determines the winner.
7. Players can request a rematch and return to fleet placement.

HTTP requests handle room operations and game actions, while WebSockets support real-time communication between connected players.

## Running Locally

### Prerequisites

- Node.js and npm
- Python 3.10 or later
- Git

### Clone the repository

```bash
git clone https://github.com/JoelG-007/cannonfall.git
cd cannonfall
```

### Start the backend

```bash
cd backend
python -m venv venv
```

Activate the virtual environment.

**Windows:**

```bash
venv\Scripts\activate
```

**macOS / Linux:**

```bash
source venv/bin/activate
```

Install dependencies and start the server:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The backend should be available at `http://localhost:8000`.

- Health check: `http://localhost:8000/health`
- API documentation: `http://localhost:8000/docs`

### Start the frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

For production, configure `VITE_API_URL` to point to the backend.

## Deployment

Cannonfall uses separate hosting services for the frontend and backend.

- **Frontend:** Netlify
- **Backend:** Render

The production frontend uses this backend URL:

```text
VITE_API_URL=https://cannonfall.onrender.com
```

The backend must allow requests from the deployed frontend origin. WebSocket connections must also reach the backend successfully for multiplayer to work.

## What I Learned

- Building a multiplayer game flow from scratch.
- Managing shared game state between players.
- Implementing real-time communication with WebSockets.
- Connecting a React and TypeScript frontend to a FastAPI backend.
- Handling room creation, player readiness, turn validation, and rematches.
- Debugging CORS, environment variables, and deployment issues.
- Deploying a full-stack application using separate frontend and backend services.

## Future Improvements

Potential improvements include spectator support, reconnection handling, game statistics, and additional naval combat mechanics.

## Author

**Joel Guedes**

Built out of a desire to play a game during college lab breaks and the curiosity to create one instead.
