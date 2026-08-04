"use client";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const TOKEN_KEY = "eryx_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export async function api<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body.data as T;
}

/** Agent SDK-style client for the arena (uses an agent API key directly). */
export async function agentApi<T = any>(
  apiKey: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...(init.headers as Record<string, string>),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body.data as T;
}
