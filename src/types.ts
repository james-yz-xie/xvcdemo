// ─────────────────────────────────────────────────────────────
// Shared domain types
// ─────────────────────────────────────────────────────────────

/** User-facing generation constraints */
export interface GenerationRequirements {
  taskType?: string;
  style?: string;
  audience?: string;
  constraints?: string;
}

/** POST /api/subtitles */
export interface SubtitlesRequest {
  videoUrl: string;
}

export interface SubtitlesResponse {
  videoId: string;
  subtitles: string;
  source: "live" | "fallback";
}

/** GET /api/generate (SSE) query params */
export interface GenerateQuery {
  videoId: string;
  subtitles: string;
  requirements?: string;
}

/** POST /api/summarize */
export interface SummarizeRequest {
  sessionId: string;
  chapterIndex: number;
}

export interface SummarizeResponse {
  who: string;
  what: string;
  when: string;
  where: string;
  why: string;
  how: string;
}

/** Stored in KV for session recovery */
export interface SessionContext {
  videoId: string;
  subtitles: string;
  requirements?: GenerationRequirements;
  fullArticle: string;
  chapters: Chapter[];
  createdAt: number;
}

export interface Chapter {
  title: string;
  content: string;
}

/** SSE event shapes */
export interface SseChunkEvent {
  type: "chunk";
  text: string;
}

export interface SseDoneEvent {
  type: "done";
  sessionId: string;
  chapters: Chapter[];
}

export interface SseErrorEvent {
  type: "error";
  message: string;
}

export type SseEvent = SseChunkEvent | SseDoneEvent | SseErrorEvent;

// ─────────────────────────────────────────────────────────────
// Hono environment bindings
// ─────────────────────────────────────────────────────────────

export interface Env {
  Bindings: {
    GEMINI_API_KEY: string;
    MOONSHOT_API_KEY: string;
    SESSIONS: KVNamespace;
    ASSETS?: Fetcher;
  };
}
