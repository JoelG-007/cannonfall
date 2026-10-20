# CANNONFALL

<p align="center">
  <strong>A multiplayer naval artillery game built for the college lab.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/WebSockets-Real--time-6C5CE7?style=flat" alt="WebSockets" />
  <img src="https://img.shields.io/badge/Status-Live-2EA44F?style=flat" alt="Live" />
</p>

<p align="center">
  <a href="https://cannonfall.netlify.app">
    <img src="https://img.shields.io/badge/PLAY%20LIVE-Enter%20the%20Battle-84CC16?style=for-the-badge&logoColor=white" alt="Play Cannonfall Live" />
  </a>
</p>

Cannonfall started with a simple problem: I wanted to play games during breaks in my college lab but the lab's ad blocker kept getting in the way of almost everything. Instead of looking for another game to play, I decided to build one myself.

The idea was to create a multiplayer game that could run directly in a browser, without requiring installations or a dedicated gaming setup. What began as a workaround turned into a project involving real-time communication, game state management, backend development and multiplayer synchronization.

Cannonfall is the result: a browser-based naval combat game where two players deploy their fleets, take turns firing at each other and try to sink the opponent's ships.

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
- Learning firsthand why frontend and backend developers need separate teams.

## Future Improvements

Potential improvements include spectator support, reconnection handling, game statistics and additional naval combat mechanics.

## Author

**Joel Guedes**

Built out of a desire to play a game during college lab breaks and the curiosity to create one instead.
