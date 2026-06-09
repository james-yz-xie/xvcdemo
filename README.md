# AI 视频文章生成器 — XVC Take-home

基于 YouTube 字幕，使用 Gemini AI 生成中文视频对话内容文章。

🔗 **在线演示**: https://xvc-interview.xielingjiang.workers.dev

## 快速开始

```bash
npm install
npm run dev      # 本地开发
npm run deploy   # 部署到 Cloudflare
```

## 功能特性

- **YouTube 字幕提取**: 自动解析视频字幕，支持硬编码备选字幕
- **流式文章生成**: Gemini 流式输出，实时渲染到页面
- **生成要求自定义**: 支持任务类型、输出风格、目标受众、约束条件
- **章节级 5W1H 总结**: 点击章节标题旁的按钮，基于服务端上下文生成结构化总结

## 技术实现

### 1. YouTube 字幕获取

从 YouTube 页面 HTML 中提取 `ytInitialPlayerResponse`，解析 `captionTracks` 获取字幕 URL，再 fetch 字幕 XML 并解析为纯文本。如果遇到验证码/反爬，自动回退到硬编码的备选字幕（PRD 示例视频）。

生产环境如需代理，可通过 Cloudflare Worker 的 TCP Socket 连接 webshare.io 代理发起请求。

### 2. Gemini 流式输出

使用 `TransformStream` 在 Worker 中实现可靠的 chunked transfer。后端流式调用 Gemini API，每收到一个 chunk 立即推送给前端。前端通过 `fetch` + `ReadableStream` 逐段读取并实时渲染 markdown。

### 3. 生成要求影响输出

用户可选输入的任务类型、风格、受众、约束条件被解析为 JSON，拼接到 prompt 的 `## 用户生成要求` 区块中，直接影响 Gemini 的生成行为。

### 4. 5W1H 总结实现

- 文章生成完成后，服务端解析章节结构，将完整上下文（字幕、生成参数、完整文章、章节列表）存入 Cloudflare KV，TTL 24 小时
- 5W1H 请求仅携带 `sessionId` 和 `chapterIndex`，服务端从 KV 读取上下文后调用 Gemini 生成 JSON 格式的 5W1H 总结
- 前端不重新提交文章内容，符合 PRD 约束

### 5. 工程取舍

| 决策 | 原因 |
|------|------|
| 单文件 HTML 前端 | 零构建、简洁、部署即走 |
| KV 存储 | 配置极简，对笔试场景足够 |
| Hono 框架 | 轻量、类型安全、Cloudflare 官方推荐 |
| 硬编码备选字幕 | 保证功能稳定，不因 YouTube 反爬而挂 |

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/subtitles` | POST | 提取 YouTube 字幕 |
| `/api/generate` | POST | 流式生成文章 |
| `/api/summarize` | POST | 生成章节 5W1H 总结 |

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
   ```

4. 部署:
   ```bash
   npm run deploy
   ```
