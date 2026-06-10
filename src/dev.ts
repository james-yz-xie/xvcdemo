import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { config } from "dotenv";
import subtitles from "./routes/subtitles";
import generate from "./routes/generate";
import summarize from "./routes/summarize";

config({ path: ".dev.vars" });

const app = new Hono();

// Mock KV for local dev
const kvStore = new Map();
app.use("/*", async (c, next) => {
  c.env = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
    KIMI_API_KEY: process.env.KIMI_API_KEY || "",
    SESSIONS: {
      put: async (key: string, value: string) => { kvStore.set(key, value); },
      get: async (key: string) => kvStore.get(key) || null,
    } as any,
  };
  await next();
});

// CORS
app.use("/*", async (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type");
  if (c.req.method === "OPTIONS") return new Response(null, { status: 204 });
  await next();
});

// Health check
app.get("/health", (c) => c.json({ ok: true }));

// API routes
app.route("/api/subtitles", subtitles);
app.route("/api/generate", generate);
app.route("/api/summarize", summarize);

// Serve static files from public/ (after API routes)
app.use("/*", serveStatic({ root: "./public" }));

const port = 8789;
serve({ fetch: app.fetch, port });
console.log(`Server running at http://localhost:${port}`);
