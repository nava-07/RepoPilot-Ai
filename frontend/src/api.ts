// Every call goes to the real backend. No mocked data anywhere.
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public hint?: string | null) {
    super(message);
  }
  /** True when the backend has not implemented this endpoint yet. */
  get notImplemented() { return this.status === 404 || this.status === 405; }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "backend_unreachable", "Cannot reach the RepoPilot backend.",
      "Start it with: cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8000");
  }
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch { /* non-JSON error body */ }
    const e = body?.error;
    throw new ApiError(res.status, e?.code ?? "http_error", e?.message ?? body?.detail?.toString?.() ?? `HTTP ${res.status}`, e?.hint);
  }
  return res.json() as Promise<T>;
}
export const post = <T,>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const del = <T,>(path: string) =>
  api<T>(path, { method: "DELETE" });
