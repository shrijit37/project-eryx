"use client";

/** Shared auth service (better-auth). Same cookie for every *.shrijit.tech app. */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.shrijit.tech";

type AuthError = { code?: string; message?: string; status?: string } | null | undefined;

async function call<T>(
  path: string,
  body: unknown,
  method: "POST" | "GET" = "POST",
): Promise<{ data: T | null; error: AuthError }> {
  const res = await fetch(`${AUTH_URL}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
  const payload = res.ok ? await res.json().catch(() => null) : await res.json().catch(() => null);
  if (!res.ok) return { data: null, error: (payload as { message?: string }) ?? { message: res.statusText } };
  return { data: payload as T, error: null };
}

export type SessionUser = { id: string; email: string; name?: string | null };

export function getSession() {
  return call<{ user: SessionUser }>("/api/auth/get-session", null, "GET");
}

export function signInWithEmail(input: { email: string; password: string }) {
  return call<{ user: SessionUser }>("/api/auth/sign-in/email", input);
}

export function signUpWithEmail(input: { email: string; password: string; name: string }) {
  return call<{ user: SessionUser }>("/api/auth/sign-up/email", input);
}

export function signInWithProviderRedirect(input: {
  provider: "google" | "github";
  callbackURL: string;
}) {
  return call<{ url: string }>("/api/auth/sign-in/social", input);
}

export function signOut() {
  return call<{ success: boolean }>("/api/auth/sign-out", {});
}