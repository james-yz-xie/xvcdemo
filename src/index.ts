import { Hono } from "hono";
import type { Env } from "./types";
import subtitles from "./routes/subtitles";
import generate from "./routes/generate";
import summarize from "./routes/summarize";

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

// Serve frontend
app.get("/", async (c) => {
  const asset = await c.env.ASSETS?.fetch(c.req.url);
  if (asset) return asset;

  // Fallback: serve inline HTML for local dev without Workers Sites
  return c.html(INDEX_HTML);
});

export default app;

// ─── Inline fallback HTML for dev ───────────────────────────

const INDEX_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 视频文章生成器</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Serif+SC:wght@400;600;700&display=swap');
    body { font-family: 'Inter', 'Noto Serif SC', sans-serif; }
    .article-body { font-family: 'Noto Serif SC', serif; line-height: 1.8; }
    .article-body h2 { font-family: 'Inter', sans-serif; }
    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .typing-cursor::after { content: '|'; animation: blink 1s infinite; }
    @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
    .chapter-section { position: relative; }
    .chapter-btn {
      opacity: 0;
      transition: opacity 0.2s;
    }
    .chapter-section:hover .chapter-btn { opacity: 1; }
    .spinner {
      border: 2px solid #e5e7eb;
      border-top-color: #3b82f6;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body class="bg-slate-50 min-h-screen">
  <div class="max-w-3xl mx-auto px-6 py-12">
    <!-- Header -->
    <header class="mb-10">
      <h1 class="text-3xl font-bold text-slate-900 mb-2">AI 视频文章生成器</h1>
      <p class="text-slate-500">输入 YouTube 视频链接，AI 将基于字幕生成中文对话文章</p>
    </header>

    <!-- Input Form -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1.5">YouTube 视频链接</label>
          <input
            id="videoUrl"
            type="text"
            placeholder="https://www.youtube.com/watch?v=..."
            class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm"
            value="https://www.youtube.com/watch?v=xRh2sVcNXQ8"
          >
          <div class="mt-2 flex gap-2">
            <button onclick="document.getElementById('videoUrl').value='https://www.youtube.com/watch?v=xRh2sVcNXQ8'" class="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded px-2 py-1 transition">
              📄 PRD 示例（硬编码字幕）
            </button>
            <button onclick="document.getElementById('videoUrl').value='https://www.youtube.com/watch?v=dQw4w9WgXcQ'" class="text-xs bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 rounded px-2 py-1 transition">
              🌐 其他视频（实时提取）
            </button>
          </div>
        </div>

        <details class="group">
          <summary class="text-sm font-medium text-slate-600 cursor-pointer hover:text-slate-900 select-none list-none flex items-center gap-1.5">
            <svg class="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            生成要求（可选）
          </summary>
          <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <input id="reqTask" type="text" placeholder="任务类型，如：深度分析" class="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
            <input id="reqStyle" type="text" placeholder="输出风格，如：正式、轻松" class="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
            <input id="reqAudience" type="text" placeholder="目标受众，如：投资人" class="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
            <input id="reqConstraints" type="text" placeholder="约束条件，如：聚焦商业模式" class="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
          </div>
        </details>

        <button
          id="generateBtn"
          onclick="startGeneration()"
          class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition flex items-center justify-center gap-2"
        >
          <span id="btnText">开始生成</span>
          <div id="btnSpinner" class="spinner hidden"></div>
        </button>
      </div>
    </div>

    <!-- Subtitle Info -->
    <div id="subtitleInfo" class="hidden mb-4 text-sm text-slate-500 flex items-center gap-2">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      <span id="subtitleSource"></span>
    </div>

    <!-- Article Output -->
    <div id="article" class="hidden bg-white rounded-xl shadow-sm border border-slate-200">
      <div class="p-6">
        <div id="articleContent" class="article-body text-slate-800 text-[15px]"></div>
        <div id="typingIndicator" class="hidden mt-2 text-blue-500 text-sm typing-cursor">生成中</div>
      </div>
    </div>
  </div>

  <script>
    const API_BASE = location.origin;
    let sessionId = null;
    let chapters = [];

    async function startGeneration() {
      const url = document.getElementById('videoUrl').value.trim();
      const btn = document.getElementById('generateBtn');
      const btnText = document.getElementById('btnText');
      const btnSpinner = document.getElementById('btnSpinner');
      const article = document.getElementById('article');
      const content = document.getElementById('articleContent');
      const indicator = document.getElementById('typingIndicator');

      if (!url) { alert('请输入 YouTube 链接'); return; }

      // Reset UI
      btn.disabled = true;
      btnText.textContent = '提取字幕中...';
      btnSpinner.classList.remove('hidden');
      article.classList.add('hidden');
      content.innerHTML = '';
      sessionId = null;
      chapters = [];

      try {
        // Step 1: Extract subtitles
        const subRes = await fetch(API_BASE + '/api/subtitles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: url })
        });
        const subData = await subRes.json();

        if (!subRes.ok) throw new Error(subData.error || '字幕提取失败');

        // Show subtitle source
        const info = document.getElementById('subtitleInfo');
        const source = document.getElementById('subtitleSource');
        info.classList.remove('hidden');
        source.textContent = subData.source === 'live'
          ? '已获取在线字幕'
          : '使用备选字幕（YouTube 提取受限）';

        // Build requirements
        const reqs = {};
        const task = document.getElementById('reqTask').value.trim();
        const style = document.getElementById('reqStyle').value.trim();
        const audience = document.getElementById('reqAudience').value.trim();
        const constraints = document.getElementById('reqConstraints').value.trim();
        if (task) reqs.taskType = task;
        if (style) reqs.style = style;
        if (audience) reqs.audience = audience;
        if (constraints) reqs.constraints = constraints;

        btnText.textContent = 'AI 生成中...';
        article.classList.remove('hidden');
        indicator.classList.remove('hidden');

        // Step 2: Stream generation
        const genRes = await fetch(API_BASE + '/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: subData.videoId,
            subtitles: subData.subtitles,
            requirements: Object.keys(reqs).length > 0 ? JSON.stringify(reqs) : undefined
          })
        });

        const reader = genRes.body.getReader();
        const decoder = new TextDecoder();
        let rawText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          rawText += chunk;

          // Parse session marker
          const sessionMatch = rawText.match(/<!--SESSION:([a-f0-9-]+)-->/);
          if (sessionMatch) {
            sessionId = sessionMatch[1];
            rawText = rawText.replace(/<!--SESSION:[a-f0-9-]+-->/, '');
          }

          // Parse error marker
          const errMatch = rawText.match(/<!--ERROR:(.+?)-->/);
          if (errMatch) {
            throw new Error(errMatch[1]);
          }

          // Render markdown (strip markers first)
          const displayText = rawText.replace(/<!--.*?-->/gs, '');
          content.innerHTML = marked.parse(displayText);

          // Scroll to bottom
          content.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }

        indicator.classList.add('hidden');

        // Add 5W1H buttons to each chapter heading
        add5w1hButtons(content);

      } catch (err) {
        indicator.classList.add('hidden');
        content.innerHTML = \`<div class="text-red-600 text-sm">错误: \${err.message}</div>\`;
        article.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btnText.textContent = '开始生成';
        btnSpinner.classList.add('hidden');
      }
    }

    function add5w1hButtons(container) {
      const headings = container.querySelectorAll('h2');
      headings.forEach((h2, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'chapter-section flex items-center gap-3 mb-2';

        h2.parentNode.insertBefore(wrapper, h2);
        wrapper.appendChild(h2);

        const btn = document.createElement('button');
        btn.className = 'chapter-btn text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-2 py-0.5 transition';
        btn.textContent = '5W1H';
        btn.onclick = () => toggle5w1h(idx, wrapper);
        wrapper.appendChild(btn);

        // Create placeholder for 5W1H content
        const panel = document.createElement('div');
        panel.id = \`5w1h-\${idx}\`;
        panel.className = 'hidden mt-3 mb-6 bg-slate-50 rounded-lg border border-slate-200 overflow-hidden';
        wrapper.parentNode.insertBefore(panel, wrapper.nextSibling);
      });
    }

    async function toggle5w1h(chapterIndex, wrapper) {
      const panel = document.getElementById(\`5w1h-\${chapterIndex}\`);
      if (!sessionId) return;

      if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        panel.innerHTML = '<div class="p-4 flex items-center gap-2 text-sm text-slate-500"><div class="spinner"></div> 生成总结中...</div>';

        try {
          const res = await fetch(API_BASE + '/api/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, chapterIndex })
          });
          const data = await res.json();

          if (!res.ok) throw new Error(data.error || '总结失败');

          panel.innerHTML = render5w1hTable(data);
        } catch (err) {
          panel.innerHTML = \`<div class="p-4 text-red-600 text-sm">\${err.message}</div>\`;
        }
      } else {
        panel.classList.add('hidden');
      }
    }

    function render5w1hTable(data) {
      const rows = [
        { key: 'Who', value: data.who, icon: '👤' },
        { key: 'What', value: data.what, icon: '💡' },
        { key: 'When', value: data.when, icon: '📅' },
        { key: 'Where', value: data.where, icon: '🌍' },
        { key: 'Why', value: data.why, icon: '❓' },
        { key: 'How', value: data.how, icon: '⚙️' },
      ];

      return \`
        <div class="fade-in">
          <table class="w-full text-sm">
            <tbody>
              \${rows.map(r => \`
                <tr class="border-b border-slate-200 last:border-0">
                  <td class="w-20 py-3 px-4 font-semibold text-slate-700 bg-slate-100/50">\${r.icon} \${r.key}</td>
                  <td class="py-3 px-4 text-slate-800">\${r.value}</td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
      \`;
    }
  </script>
</body>
</html>`;
