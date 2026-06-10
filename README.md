# AI 视频文章生成器 — XVC Take-home

基于 YouTube 字幕，使用大语言模型生成中文视频对话内容文章，支持章节级 5W1H 总结。

🔥 **在线演示**: https://xvc-interview.xielingjiang.workers.dev

## 快速开始

```bash
npm install
npm run dev      # 本地开发 http://localhost:8789
npm run deploy   # 部署到 Cloudflare Workers
```

本地开发时，创建 `.dev.vars` 文件配置 API Key：

```
GEMINI_API_KEY=your_gemini_key
KIMI_API_KEY=your_kimi_key
```

## 功能特性

- **YouTube 字幕提取**: 自动解析视频字幕，支持硬编码备选字幕
- **多模型文章生成**: 支持 Gemini、Kimi、LM Studio（本地）三种模型
- **流式实时输出**: 文章逐字显示，无需等待全部生成完成
- **生成要求自定义**: 任务类型、输出风格、目标受众、约束条件直接影响生成结果
- **章节级 5W1H 总结**: 点击章节标题旁的按钮，生成结构化总结
- **双模式运行**: Demo 模式使用预生成文章，AI 模式调用真实模型

## 技术实现

### 1. YouTube 字幕获取

实现位于 `src/services/youtube.ts`：

1. 从 YouTube 页面 HTML 中提取 `ytInitialPlayerResponse` JSON
2. 解析 `captions.playerCaptionsTracklistRenderer.captionTracks` 获取字幕 URL
3. Fetch 字幕 XML（通常是 TTML 或 SBV 格式）
4. 通过正则去除 XML 标签和时间戳，合并为纯文本段落

由于 YouTube 反爬机制，直接请求经常返回验证码页面。因此实现了**硬编码备选字幕**机制：当自动提取失败时，自动回退到 `src/data/subtitles.ts` 中预置的 PRD 示例视频字幕，保证功能稳定可用。

```typescript
// src/services/youtube.ts
const playerResponse = extractYtInitialPlayerResponse(html);
const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
const subtitleUrl = tracks.find(t => t.languageCode === 'zh' || t.languageCode === 'en')?.baseUrl;
```

### 2. 流式输出实现

#### 云端模型（Gemini / Kimi）

后端 `src/routes/generate.ts` 调用 `src/services/llm.ts` 的流式 API，通过 `TransformStream` 将 chunk 实时转发给前端：

```typescript
const stream = new TransformStream();
const writer = stream.writable.getWriter();

for await (const chunk of streamLLM(prompt, apiKey, model)) {
  await writer.write(encoder.encode(chunk.text));
}
writer.close();
return c.body(stream.readable);
```

前端使用 `fetch` + `ReadableStream.getReader()` 逐段读取：

```javascript
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  rawText += decoder.decode(value, { stream: true });
  content.innerHTML = marked.parse(rawText, { async: false });
}
```

#### LM Studio 本地模型

前端直接调用 `http://localhost:1234/v1/chat/completions`，绕过服务端，减少延迟。通过 SSE 协议解析每个 `data:` 帧，实时更新 DOM。

### 3. 生成要求影响输出

用户在界面输入的任务类型、风格、受众、约束条件被收集为 JSON：

```javascript
const reqs = {};
if (task) reqs.taskType = task;
if (style) reqs.style = style;
if (audience) reqs.audience = audience;
if (constraints) reqs.constraints = constraints;
```

Prompt 构建器 `src/prompts/article.ts` 将其格式化为 `## 用户生成要求` 区块，并放在 prompt 最前面、用严厉措辞强调必须遵守：

```
你是一位资深中文科技内容编辑。请严格根据以下要求撰写文章。

## 用户生成要求（必须严格遵守，违者视为不合格）
- 任务类型：...
- 输出风格：...
- 目标受众：...
- 约束条件：...

## 字幕内容
...

## 输出要求
1. ...
7. 如果上方存在「用户生成要求」，你必须在内容中明确体现这些要求，不能忽略。
```

### 4. 章节级 5W1H 总结

#### 文章结构解析

文章生成后，前端 `add5w1hButtons()` 为每个 `h2` 章节标题旁插入 5W1H 按钮：

```javascript
const headings = container.querySelectorAll('h2');
headings.forEach((h2, idx) => {
  // 包装 h2 并插入按钮
  // 在每个 wrapper 后插入隐藏的 panel
});
```

点击按钮时，`toggle5w1h()` 计算当前章节内容（两个 `h2` 之间的段落），然后请求服务端。

#### 云端模型流程

1. 生成文章时，服务端将 `fullArticle` 和 `chapters` 数组存入 Cloudflare KV，TTL 24 小时
2. 5W1H 请求仅携带 `sessionId` 和 `chapterIndex`
3. 服务端 `src/routes/summarize.ts` 从 KV 读取上下文，调用 LLM 生成 JSON
4. 返回 `{ who, what, when, where, why, how }` 结构化数据

#### LM Studio 本地流程

LM Studio 完全走前端直连 `http://localhost:1234/v1/chat/completions`，无需服务端 session。5W1H 总结时，前端直接构造 prompt 并调用本地模型，解析返回的 JSON：

```javascript
data = await callLMStudio5w1h(
  document.getElementById('articleContent').textContent,
  title,
  chapterContent.trim()
);
```

#### Prompt 设计

`src/prompts/summary.ts` 严格要求纯 JSON 输出，禁止 markdown 代码块：

```
1. 请只输出一个纯 JSON 对象，不要包含 markdown 代码块标记...
2. JSON 必须严格符合以下格式，键名必须是 who/what/when/where/why/how...
3. 每个字段简洁凝练，一句话概括，不超过 80 字。
4. 如果某个维度没有体现，填写"未明确提及"，但不能省略该字段。
```

服务端使用三层解析策略容错：先匹配 ```json 代码块，再匹配第一个 `{}`，最后尝试全文解析。

## 系统架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户浏览器 (Frontend)                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │  YouTube URL    │  │  生成要求表单    │  │  章节级 5W1H 按钮            │  │
│  │  字幕提取控制    │  │  模型选择       │  │  (点击展开总结面板)          │  │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────────────────┘  │
│           │                    │                                             │
│           ▼                    ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     public/index.html (单文件前端)                   │    │
│  │  • 字幕提取: 调用 /api/subtitles                                    │    │
│  │  • 云端生成: 调用 /api/generate (ReadableStream 实时渲染)            │    │
│  │  • 云端 5W1H: 调用 /api/summarize (仅传 sessionId + chapterIndex)   │    │
│  │  • LM Studio 生成: 直连 http://localhost:1234/v1/chat/completions   │    │
│  │  • LM Studio 5W1H:  直连 localhost 构造 prompt 并解析 JSON          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Cloudflare Workers (Backend)                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                           Hono App                                  │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │    │
│  │  │ /api/subtitles│  │ /api/generate │  │ /api/summarize           │  │    │
│  │  │ 字幕提取      │  │ 流式文章生成  │  │ 云端 5W1H 总结           │  │    │
│  │  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │    │
│  │         │                 │                       │                 │    │
│  │         ▼                 ▼                       ▼                 │    │
│  │  ┌─────────────┐   ┌─────────────┐        ┌─────────────┐          │    │
│  │  │ youtube.ts  │   │  llm.ts     │        │ storage.ts  │          │    │
│  │  │ 解析 YouTube│   │ Gemini/Kimi │        │ KV Session  │          │    │
│  │  │ 字幕 XML    │   │ 路由网关    │        │ 上下文缓存  │          │    │
│  │  └─────────────┘   └─────────────┘        └─────────────┘          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────────────────────────────────────┐   │
│  │  Cloudflare KV  │  │ 外部 API                                        │   │
│  │  (SESSIONS)     │  │  • Google Gemini API                            │   │
│  │  存储生成上下文  │  │  • Moonshot Kimi API                            │   │
│  └─────────────────┘  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              本地开发环境                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  npm run dev → tsx src/dev.ts @ http://localhost:8789              │    │
│  │  • 加载 .dev.vars 中的 API Key                                     │    │
│  │  • 使用内存 Map 模拟 Cloudflare KV                                  │    │
│  │  • LM Studio 前端直连 localhost:1234                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 架构要点

1. **前后端分离，但前端极轻**：单文件 HTML + marked.js，零构建步骤
2. **云端模型统一走后端**：避免暴露 API Key，利用 Worker 做流式转发
3. **本地模型完全走前端**：LM Studio 无需公网暴露，延迟最低，不消耗 Cloudflare CPU 时间
4. **5W1H 上下文服务端缓存**：生成文章时存入 KV，总结时只传索引，避免重复上传大文本
5. **字幕提取兜底**：YouTube 反爬时自动回退到硬编码字幕，保证演示稳定性

## 工程架构

```
src/
├── index.ts              # Cloudflare Workers 入口
├── dev.ts                # Node.js 本地开发服务器
├── types.ts              # 共享类型定义
├── prompts/
│   ├── article.ts        # 文章生成 prompt
│   └── summary.ts        # 5W1H prompt
├── routes/
│   ├── subtitles.ts      # YouTube 字幕提取
│   ├── generate.ts       # 流式文章生成
│   └── summarize.ts      # 云端 5W1H
├── services/
│   ├── youtube.ts        # YouTube 字幕解析
│   ├── llm.ts            # Gemini/Kimi 调用
│   ├── storage.ts        # KV 读写
│   └── fallback.ts       # 演示数据兜底
├── data/
│   ├── subtitles.ts      # 备选字幕
│   └── article.ts        # Demo 文章
public/
└── index.html            # 单文件前端
```

## 主要工程取舍

| 决策 | 原因 |
|------|------|
| 单文件 HTML 前端 | 零构建、简洁、部署即走 |
| Hono 框架 | 轻量、类型安全、Cloudflare 官方推荐 |
| Cloudflare KV | 配置极简，对笔试场景足够 |
| 硬编码备选字幕 | 保证功能稳定，不因 YouTube 反爬而挂 |
| 前端直连 LM Studio | 本地模型无需暴露到公网，延迟最低 |
| 服务端缓存上下文 | 5W1H 不重复提交大段文本，符合 PRD 约束 |

## API 端点

### `POST /api/subtitles`

提取 YouTube 视频字幕。

**请求体：**

```json
{
  "videoId": "dQw4w9WgXcQ"
}
```

**响应体：**

```json
{
  "videoId": "dQw4w9WgXcQ",
  "subtitles": "完整字幕文本...",
  "source": "youtube" // 或 "fallback"（硬编码备选）
}
```

---

### `POST /api/generate`

流式生成文章。返回 `text/plain` 流，前端逐段读取渲染。

**请求体：**

```json
{
  "videoId": "dQw4w9WgXcQ",
  "subtitles": "完整字幕文本...",
  "requirements": "{\"style\":\"幽默\",\"audience\":\"投资人\"}",
  "model": "gemini" // 或 "kimi"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `videoId` | string | 是 | YouTube 视频 ID |
| `subtitles` | string | 是 | 提取到的字幕文本 |
| `requirements` | string | 否 | 用户生成要求，JSON 字符串 |
| `model` | string | 否 | 模型选择：`gemini` / `kimi`，默认 `gemini` |

**流式响应：**

普通 chunk 直接返回文本内容。流末尾可能包含以下标记：

- `<!--SESSION:uuid-->` — 服务端生成的 session ID，用于后续 5W1H 查询
- `<!--ERROR:message-->` — 服务端错误信息

---

### `POST /api/summarize`

基于服务端 KV 缓存的上下文，生成指定章节的 5W1H 总结。

**请求体：**

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "chapterIndex": 2,
  "model": "gemini"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sessionId` | string | 是 | `/api/generate` 返回的 session ID |
| `chapterIndex` | number | 是 | 章节索引，从 0 开始 |
| `model` | string | 否 | 模型选择：`gemini` / `kimi`，默认 `gemini` |

**响应体：**

```json
{
  "who": "涉及的人物或主体",
  "what": "核心内容或事件",
  "when": "时间点或时间段",
  "where": "地点、市场或领域",
  "why": "原因或驱动力",
  "how": "实现方式或运作机制"
}
```

> **为什么用 KV？** `/api/generate` 生成文章时把 `fullArticle` + `chapters` 存入 Cloudflare KV（TTL 24 小时）。`/api/summarize` 只接收轻量的 `sessionId` 和 `chapterIndex`，从 KV 读取完整上下文后调用 LLM。这样既符合"不重复提交大文本"的设计约束，又能保护 API Key 不暴露给前端。

## 部署

1. 登录 Cloudflare:
   ```bash
   npx wrangler login
   ```

2. 创建 KV namespace:
   ```bash
   npx wrangler kv:namespace create "SESSIONS"
   ```
   将返回的 ID 填入 `wrangler.toml`。

3. 设置 API Key:
   ```bash
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler secret put KIMI_API_KEY
   ```

4. 部署:
   ```bash
   npm run deploy
   ```

## 获取 API Key

- **Gemini**: [Google AI Studio](https://aistudio.google.com/api-keys)
- **Kimi**: [Moonshot 开放平台](https://platform.moonshot.cn/)
- **LM Studio**: 本地运行后在设置中开启 API 服务器，默认端口 `1234`

> **注意**: Gemini AI Studio 免费 tier 有每日请求限额。如果额度用完，可切换到 Kimi 或 LM Studio。
