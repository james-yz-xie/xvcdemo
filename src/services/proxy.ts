// ─────────────────────────────────────────────────────────────
// HTTP proxy via Cloudflare Worker TCP Sockets
// PRD recommendation: webshare.io proxy for YouTube anti-bot
// ─────────────────────────────────────────────────────────────

const PROXY_HOST = "p.webshare.io";
const PROXY_PORT = 80;

interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

/** Fetch a URL through an HTTP CONNECT proxy using Cloudflare TCP Sockets */
export async function fetchViaProxy(
  url: string,
  init: RequestInit = {},
  proxy?: ProxyConfig
): Promise<Response> {
  const target = new URL(url);
  const cfg = proxy ?? {
    host: PROXY_HOST,
    port: PROXY_PORT,
  };

  const socket = connect({ hostname: cfg.host, port: cfg.port });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();

  // Build HTTP CONNECT request
  const connectLine = `CONNECT ${target.host}:443 HTTP/1.1\r\n`;
  const proxyAuth = cfg.username
    ? `Proxy-Authorization: Basic ${btoa(cfg.username + ":" + (cfg.password ?? ""))}\r\n`
    : "";
  const connectRequest =
    connectLine +
    `Host: ${target.host}:443\r\n` +
    proxyAuth +
    `\r\n`;

  await writer.write(new TextEncoder().encode(connectRequest));

  // Read CONNECT response
  const connectResponse = await readHttpResponse(reader);
  if (!connectResponse.statusLine.includes("200")) {
    throw new Error(`Proxy CONNECT failed: ${connectResponse.statusLine}`);
  }

  // Start TLS through the proxy tunnel
  const tlsSocket = socket.startTls({ expectedServerHostname: target.hostname });
  const tlsWriter = tlsSocket.writable.getWriter();
  const tlsReader = tlsSocket.readable.getReader();

  // Build actual HTTP request
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  if (!headers.has("Host")) {
    headers.set("Host", target.host);
  }

  let requestBody = "";
  if (init.body) {
    requestBody = typeof init.body === "string" ? init.body : String(init.body);
    if (!headers.has("Content-Length")) {
      headers.set("Content-Length", String(new TextEncoder().encode(requestBody).length));
    }
  }

  let headerLines = "";
  headers.forEach((value, key) => {
    headerLines += `${key}: ${value}\r\n`;
  });

  const httpRequest =
    `${method} ${target.pathname}${target.search} HTTP/1.1\r\n` +
    headerLines +
    `\r\n` +
    requestBody;

  await tlsWriter.write(new TextEncoder().encode(httpRequest));

  // Read HTTP response
  const response = await readHttpResponse(tlsReader, true);

  // Build a Response object from raw HTTP response
  const body = response.body ? new TextEncoder().encode(response.body) : new Uint8Array();
  return new Response(body, {
    status: parseInt(response.statusLine.split(" ")[1]) || 200,
    headers: response.headers,
  });
}

interface RawHttpResponse {
  statusLine: string;
  headers: Headers;
  body: string;
}

async function readHttpResponse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  readBody = false
): Promise<RawHttpResponse> {
  const decoder = new TextDecoder();
  let buffer = "";
  let headersEnd = -1;

  // Read until headers end (\r\n\r\n)
  while (headersEnd === -1) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    headersEnd = buffer.indexOf("\r\n\r\n");
  }

  const headerPart = buffer.slice(0, headersEnd);
  const bodyStart = buffer.slice(headersEnd + 4);

  const lines = headerPart.split("\r\n");
  const statusLine = lines[0];
  const headers = new Headers();
  for (let i = 1; i < lines.length; i++) {
    const colonIdx = lines[i].indexOf(":");
    if (colonIdx > 0) {
      headers.set(lines[i].slice(0, colonIdx).trim(), lines[i].slice(colonIdx + 1).trim());
    }
  }

  let body = bodyStart;

  if (readBody) {
    const contentLength = parseInt(headers.get("Content-Length") ?? "0");
    const transferEncoding = headers.get("Transfer-Encoding");

    if (transferEncoding === "chunked") {
      body = await readChunkedBody(reader, body, decoder);
    } else if (contentLength > 0) {
      while (body.length < contentLength) {
        const { done, value } = await reader.read();
        if (done) break;
        body += decoder.decode(value, { stream: true });
      }
    }
  }

  return { statusLine, headers, body };
}

async function readChunkedBody(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  initialBody: string,
  decoder: TextDecoder
): Promise<string> {
  let buffer = initialBody;
  let result = "";

  while (true) {
    let crlfIdx = buffer.indexOf("\r\n");
    while (crlfIdx === -1) {
      const { done, value } = await reader.read();
      if (done) return result;
      buffer += decoder.decode(value, { stream: true });
      crlfIdx = buffer.indexOf("\r\n");
    }

    const sizeHex = buffer.slice(0, crlfIdx).trim();
    const chunkSize = parseInt(sizeHex, 16);
    if (chunkSize === 0) break;

    buffer = buffer.slice(crlfIdx + 2);

    while (buffer.length < chunkSize + 2) {
      const { done, value } = await reader.read();
      if (done) return result;
      buffer += decoder.decode(value, { stream: true });
    }

    result += buffer.slice(0, chunkSize);
    buffer = buffer.slice(chunkSize + 2); // skip \r\n after chunk
  }

  return result;
}
