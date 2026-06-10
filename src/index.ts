import { Hono } from "hono";
import type { Env } from "./types";
import subtitles from "./routes/subtitles";
import generate from "./routes/generate";
import summarize from "./routes/summarize";
import summarizeLocal from "./routes/summarize-local";

// ─────────────────────────────────────────────────────────────
// Hono app — XVC AI Article Generator
// ─────────────────────────────────────────────────────────────

const app = new Hono<Env>();

// CORS for local dev / external frontend access
app.use("/*", async (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type");

  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  await next();
});

// Health check
app.get("/health", (c) => c.json({ ok: true }));

// API routes
app.route("/api/subtitles", subtitles);
app.route("/api/generate", generate);
app.route("/api/summarize", summarize);
app.route("/api/summarize-local", summarizeLocal);

// Serve frontend from public/ via [assets] in wrangler.toml
app.get("/", async (c) => {
  const asset = await c.env.ASSETS?.fetch(c.req.url);
  if (asset) return asset;
  return c.text("Assets not configured. Use public/index.html directly.");
});

export default app;
