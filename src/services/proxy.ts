// ─────────────────────────────────────────────────────────────
// ScraperAPI proxy for bypassing YouTube anti-bot
// https://www.scraperapi.com/
// ─────────────────────────────────────────────────────────────

const SCRAPERAPI_BASE = "https://api.scraperapi.com";

/** Fetch a URL through ScraperAPI proxy */
export async function fetchViaProxy(
  url: string,
  init: RequestInit = {},
  apiKey?: string
): Promise<Response> {
  const key = apiKey ?? getScraperApiKeyFromEnv();
  if (!key) {
    throw new Error("ScraperAPI key not configured. Set SCRAPERAPI_KEY env var.");
  }

  const proxyUrl = new URL(SCRAPERAPI_BASE);
  proxyUrl.searchParams.set("api_key", key);
  proxyUrl.searchParams.set("url", url);

  return fetch(proxyUrl.toString(), {
    method: init.method ?? "GET",
    headers: init.headers,
    body: init.body,
  });
}

function getScraperApiKeyFromEnv(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (typeof process !== "undefined" ? (process.env as any).SCRAPERAPI_KEY : undefined);
  } catch {
    return undefined;
  }
}
