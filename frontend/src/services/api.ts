const API_URL = import.meta.env.DEV
  ? "/api"
  : import.meta.env.VITE_API_URL ?? "";

export async function checkServer(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`);
    return response.ok;
  } catch (error) {
    console.error("Backend connection error:", error);
    return false;
  }
}