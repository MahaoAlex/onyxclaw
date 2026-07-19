# Phase 1 本机控制台

## 定位

Phase 1 Local Console 只测试当前 macOS 已安装的 OpenClaw，不创建、不连接也不管理 Sandbox。

```text
浏览器（127.0.0.1:3000）
  → 本机 Node BFF
  → WebSocket Simulator / OnyxClaw Channel Plugin
  → 本机 OpenClaw Gateway
  → 本机 Agent
```

## 启动

```bash
npm install
npm test
npm run dev
```

浏览器打开：

```text
http://127.0.0.1:3000
```

服务只监听 loopback。停止服务时按 `Ctrl+C`；如果已进入龙虾模式，服务会尝试禁用测试 Channel 并停止 Simulator。

## 串行的新用户流程

三个步骤不是可自由切换的并列页签，而是由 BFF 强制执行的状态机：

```text
01 龙虾模式 → 02 性格确认 → 03 和龙虾对话
```

- 初始只能操作第 1 步；
- 浏览器刷新后始终回到第 1 步展示，但不会重置 BFF 中的连接和确认状态；
- 如果已经连接，第 1 步显示“继续龙虾模式”，点击后回到服务端记录的后续步骤；
- 连接成功后自动进入第 2 步；
- 未确认性格时，即使直接调用 Chat API 也会被拒绝；
- 点击“确认性格并继续”会保存并校验当前内容，然后自动进入第 3 步；
- 确认后性格页签在当前 BFF 会话中不再展示；
- 首次进入对话窗口时，OpenClaw 会基于刚确认的 `SOUL.md` 主动生成一次问候；
- 断开后再次连接时，已确认用户会直接进入对话步骤。

### 1. 龙虾模式

“进入龙虾模式”自动完成：

1. 检查并按需链接本仓库的 OnyxClaw Channel Plugin；
2. 启动本机 Channel Simulator；
3. 生成本次进程专用的随机 bootstrap token；
4. 配置 `channels.onyxclaw`；
5. 重启本机 Gateway；
6. 等待 Plugin 注册并执行 Gateway probe；
7. 展示 instance、connection ID 和健康状态。

Gateway 重启通常需要 30–40 秒，期间本机其他 Channel 可能短暂中断。“断开并清理”会禁用测试 Channel、再次重启 Gateway，并停止 Simulator，不会停止 OpenClaw 服务本身。

### 2. 性格设定

- 读取 `~/.openclaw/workspace/SOUL.md`；
- 展示文件大小和 SHA-256 摘要；
- 原子写入后重新读取并校验；
- 首次保存前在 BFF 内存中保留原文件快照；
- “恢复本次编辑前版本”按原始字节和文件权限恢复；
- “确认性格并继续”同时完成保存、SHA-256 校验和 onboarding 状态推进。

保存是用户明确发起的持久修改，所以退出控制台不会自动撤销。恢复能力只在当前 BFF 进程存活期间有效。

### 3. 和龙虾对话

- 只有龙虾模式连接成功后才允许发送；
- 新用户只有完成性格确认后才允许发送；
- 每个 BFF 进程使用独立的 OpenClaw 会话，避免历史 smoke 对话污染；
- 首次进入时，BFF 发送一条页面不可见的引导消息，请 OpenClaw 按当前性格说 hello；
- 首次问候会在 BFF 中缓存，刷新或重复进入不会再次调用模型；
- 同一时间只处理一条消息；
- 页面展示回复、往返耗时和 trace ID；
- 消息只经过本机 BFF、Simulator、Plugin 和 Gateway；
- 对话页保留“断开并清理”按钮，不需要返回已完成的设置页。

## 验收

启动 UI 服务后，可运行：

```bash
npm run phase1:smoke
```

Smoke 自动验证：

- UI 和三个页签可加载；
- 龙虾模式和 Gateway probe 成功；
- `SOUL.md` 可读取、写入、校验并逐字节恢复；
- 性格确认门禁和 onboarding 状态推进成功；
- 基于性格的首次问候只生成一次；
- 真实 Channel 文字消息往返成功；
- 测试 Channel 最终被禁用。

2026-07-19 本机实测通过：性格问候耗时约 5,122 ms，随后真实文字回复耗时约
2,502 ms，完整流程结果为 `passed`。自动回归为 32/32 tests passed。

## 本机安全边界

- HTTP 服务默认只绑定 `127.0.0.1`；
- 修改型 API 要求 `X-OnyxClaw-Request: local-ui` 请求头，降低跨站表单触发 localhost 操作的风险；
- bootstrap token 每次随机生成，不进入浏览器、不写入报告；
- 页面不展示 OpenClaw 配置和模型 Provider 密钥；
- BFF 不提供任意命令执行或任意文件路径 API；
- 当前没有登录系统，不应把 `PHASE1_HOST` 改为公网监听地址。

## 当前边界

- 仅支持文字消息，不支持语音和媒体；
- 不保存聊天历史和测试报告数据库；
- 不创建 Sandbox，不调用 E2B API；
- 不包含 Docker 云端部署；
- `SOUL.md` 保存后的性格生效时机由 OpenClaw 的会话加载机制决定。
