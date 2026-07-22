# OnyxClaw 当前实现工作总结

本文记录截至 2026 年 7 月的项目实现范围、交付物、验证状态和后续边界，作为阶段性
交接与后续 Provider 扩展的入口。

## 1. 当前结论

项目已经完成文本对话场景的本地与阿里云 ACS 基础闭环：

```text
进入龙虾模式
  → 创建/连接 Sandbox
  → 编辑并确认 SOUL.md
  → 启动 OpenClaw Gateway
  → Channel 注册并建立连接
  → 首次 hello
  → 连续对话
  → kill/reset 清理单个 Sandbox
```

本地模式、云端 Provider 配置、ACS 基础设施、OpenClaw 镜像、云端 APP、Channel、
Bootstrap Saga、E2B SDK 操作和 UI 可观测面板均已有代码与自动化测试。

## 2. 已实现能力

### 2.1 本地 OpenClaw 验证

- OnyxClaw Channel Plugin 和 WebSocket Platform Simulator；
- bootstrap 注册、session 重连、heartbeat、delivery receipt 和事件去重；
- 两轮消息、Gateway 重启、token 轮换和 `SOUL.md` 恢复；
- 本地 Phase 1 Web UI：龙虾模式、性格设定和对话龙虾；
- 新用户串行引导和基于性格的首次问候；
- 本地 smoke 与 JSON 验证报告。

### 2.2 云 Provider 抽象

- Provider Profile 和 `ProviderRegistry`；
- HTTPS/WSS、VPC 私网例外、绝对路径和 timeout 校验；
- Sandbox、模型和 Channel Secret 的独立环境变量映射；
- 浏览器只获得 Provider ID、展示名称、协议和 capability；
- 统一 Adapter 契约：create、connect、command、file read/write 和 kill；
- 分阶段错误、Secret 脱敏和失败补偿。

### 2.3 阿里云 ACS

- VPC、双 vSwitch、NAT/SNAT 和 ACS profile 集群 IaC；
- Agent Sandbox Controller、Sandbox Manager 和 SandboxSet 预热池；
- Private Protocol、E2B Python SDK 和 `kruise-agents` patch；
- `Sandbox.create/connect/kill`、`commands.run`、`files.read/write`；
- OpenClaw 自定义镜像、envd 权限边界和 Gateway 降权启动；
- 杭州同地域 ACR 镜像同步和 digest 固定部署；
- E2B smoke、真实 Sandbox、模型和 Channel 端到端验证；
- 可重复执行的 deploy/destroy 脚本。完整基础设施清理仍需在本阶段结束时显式执行。

### 2.4 云端 APP/BFF

- 新用户先领取 Sandbox，再确认 SOUL 并完成 bootstrap；
- 已有用户按 Sandbox ID connect；
- 一次性 Channel bootstrap token；
- `ALLOCATING → BOOTSTRAPPING → GATEWAY_READY → CHANNEL_READY → READY`；
- Gateway 和 Channel 双就绪闸门；
- 任一步失败时撤销 token 并 kill 半初始化 Sandbox；
- 首次 hello、文本对话、重置新用户和资源回收。

### 2.5 UI 和可观测

- 刷新后可在龙虾模式和对话龙虾之间切换；
- 页签移除数字编号；
- 首次回复后输入框固定可见；
- 不同页签切换时手机比例保持稳定；
- Sandbox Service 调用总数、成功、执行中和失败概要；
- 失败 API 聚合和失败行高亮；
- running/succeeded/failed 均展示操作详情：命令、路径、模板或 Sandbox ID；
- 命令中的 key、token、password 和 secret 自动脱敏。

## 3. 构建与发布

### OpenClaw Sandbox 镜像

- 当前阶段版本：`v0.1.3`；
- GitHub Actions 构建并推送 GHCR；
- GitHub Release 保存 OCI archive、manifest、digest 和 checksums；
- ACS 使用镜像到杭州 ACR 后的不可变 digest。

### 云端 APP 镜像

- 当前阶段版本：`app-v0.3.6`；
- GHCR 与杭州 ACR 均使用不可变 digest；
- GitHub Release 包含可由 Docker 24.x 直接加载的
  `onyxclaw-app-app-v0.3.6-linux-amd64-docker.tar.gz`；
- Release 同时保存 image manifest、image reference、release notes 和 SHA-256 校验和。

## 4. 验证状态

- `npm test`：96 项测试通过；
- 本地 Phase 0/Phase 1 OpenClaw 验证通过；
- ACS E2B create、command、file 和 kill smoke 通过；
- ACS OpenClaw bootstrap、Channel、首次 hello 和对话闭环通过；
- `app-v0.3.6` ACS Deployment 滚动发布后达到 `1/1 Ready`；
- GitHub Release 的 APP Docker tar.gz 已确认上传成功；
- UI 在 1440×800 验证页签切换尺寸变化为 0，聊天输入框可见。

## 5. 当前边界

以下内容不属于当前已经闭环的基础功能，后续生产化时应单独规划：

- pause/resume 后的内存、进程和 Channel 跨重启恢复验证；
- BFF 业务状态持久化和多副本一致性；
- 公网生产入口、正式 DNS、TLS、WAF 和访问控制；
- 模型与 Channel 的企业级私网出口策略；
- 大文件预签名传输、logs、metrics、events 和 volumes；
- 用户、租户、计费、配额和成本治理；
- 语音输入输出；
- 长期运行、故障注入、容量和灾难恢复测试。

## 6. 文档导航

- [本地 Phase 0](./phase0-local.md)
- [本地 Phase 1](./phase1-local.md)
- [云 Provider 配置](./provider-config.md)
- [云厂商 Sandbox Provider 对接指南](./cloud-sandbox-provider-onboarding.md)
- [阿里云 ACS 对接设计](./alibaba-acs-design.md)
- [阿里云 ACS IaC 操作说明](../iac/alicloud-acs/README.md)

## 7. 阶段交接建议

1. 把 `app-v0.3.6` 和 `v0.1.3` 作为当前阶段基线；
2. 后续新增 Provider 时遵循统一 Adapter 和 Provider Profile，不在 APP 内增加厂商分支；
3. 生产化前优先补状态持久化、pause/resume、正式入口和安全审计；
4. 若当前 ACS 验证环境不再使用，执行 IaC destroy 并检查 NAT、VPC、ACS、SandboxSet
   和 Sandbox 无遗留；
5. 清理后保存脱敏验收报告、Release digest 和 checksums，不保留运行时凭据。
