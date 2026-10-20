export const API_URL = (() => {
  if (import.meta.env.DEV) {
    return "/api";
  }

  const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "");

  if (!configuredApiUrl) {
    throw new Error(
      "VITE_API_URL must be set to the production backend URL."
    );
  }

  return configuredApiUrl;
})();

export function getWebSocketUrl(): string {
  const apiUrl = new URL(API_URL, window.location.origin);
  const protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";

  return `${protocol}//${apiUrl.host}`;
}

export async function checkServer(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`);
    return response.ok;
  } catch (error) {
    console.error("Backend connection error:", error);
    return false;
  }
}