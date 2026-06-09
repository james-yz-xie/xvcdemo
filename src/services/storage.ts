// ─────────────────────────────────────────────────────────────
// KV storage for session contexts
// ─────────────────────────────────────────────────────────────

import type { SessionContext } from "../types";

const TTL_SECONDS = 86400; // 24 hours
const KEY_PREFIX = "session:";

function key(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

export async function saveSession(
  kv: KVNamespace,
  sessionId: string,
  ctx: SessionContext
): Promise<void> {
  await kv.put(key(sessionId), JSON.stringify(ctx), {
    expirationTtl: TTL_SECONDS,
  });
}

export async function getSession(
  kv: KVNamespace,
  sessionId: string
): Promise<SessionContext | null> {
  const raw = await kv.get(key(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionContext;
  } catch {
    return null;
  }
}

export async function deleteSession(
  kv: KVNamespace,
  sessionId: string
): Promise<void> {
  await kv.delete(key(sessionId));
}
