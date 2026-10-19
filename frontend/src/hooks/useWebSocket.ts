import { useCallback, useEffect, useRef, useState } from "react";

function getWebSocketUrl(): string {
  if (!import.meta.env.DEV && import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}

export function useWebSocket(
  roomId: string | null,
  playerId: string | null,
) {
  const socketRef = useRef<WebSocket | null>(null);

  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<unknown>(null);

  useEffect(() => {
    if (!roomId || !playerId) {
      return;
    }

    const socket = new WebSocket(
      `${getWebSocketUrl()}/ws/${roomId}?player_id=${encodeURIComponent(playerId)}`,
    );

    socketRef.current = socket;

    socket.onopen = () => {
      setConnected(true);
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setLastMessage(message);
    };

    socket.onclose = () => {
      setConnected(false);
    };

    socket.onerror = () => {
      setConnected(false);
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [roomId, playerId]);

  const sendMessage = useCallback((message: unknown) => {
    if (
      socketRef.current &&
      socketRef.current.readyState === WebSocket.OPEN
    ) {
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);

  return {
    connected,
    lastMessage,
    sendMessage,
  };
}