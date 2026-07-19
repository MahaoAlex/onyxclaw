# Alibaba Cloud ACS disposable validation stack

详细设计和安全边界见 [阿里云 ACS Agent Sandbox 对接设计](../../docs/alibaba-acs-design.md)。

## 一次性账号前置动作

1. 开通 Alibaba Cloud ACS Agent Sandbox 服务；
2. 授权 `AliyunCSManagedAgentSandboxRole`；
3. 准备一个可由 ACS 拉取的 OnyxClaw 镜像；
4. 安装 Terraform 1.6+ 或 OpenTofu、kubectl。本机不需要 Docker，正式镜像由
   GitHub Actions 构建。

## 发布镜像

合并待发布代码后，创建并推送一个 SemVer tag：

```bash
git tag -a v0.1.0 -m "release v0.1.0"
git push origin main
git push origin v0.1.0
```

`.github/workflows/release-openclaw-image.yml` 会在 GitHub 托管的 AMD64 Runner 上：

1. 从官方 OpenClaw 镜像构建派生镜像；
2. 一次构建同时推送 `ghcr.io/mahaoalex/onyxclaw-openclaw:v0.1.0` 并导出 OCI archive；
3. 创建同名 GitHub Release；
4. 附加压缩 OCI archive、registry manifest、`image-reference.txt` 和 SHA-256 校验和；
5. 在 `image-reference.txt` 和 Release Notes 中记录不可变的 `image@sha256:...`。

外部 Actions 固定到具体提交 SHA；构建同时生成 Software Bill of Materials（SBOM，软件
物料清单）和 provenance（构建来源证明）。Release 单个附件必须小于 GitHub 的 2 GiB
限制，工作流会在上传前校验。

首次发布后检查 GHCR Package 可见性。ACS 直接拉取时，Package 必须为 Public；否则需
给 SandboxSet 配置 GHCR image pull secret，或将 Release 镜像镜像到同地域 Alibaba
Cloud Container Registry（ACR）。当前第一轮采用 Public GHCR，避免在 Sandbox 中分发
GitHub Personal Access Token（PAT，个人访问令牌）。`v0.1.0` 已通过匿名 Registry
manifest 请求验证为可拉取。

正式验证必须从 Release 的 `image-reference.txt` 复制 digest 固定 URI：

```bash
export ONYXCLAW_OPENCLAW_IMAGE='ghcr.io/mahaoalex/onyxclaw-openclaw:v0.1.0@sha256:<DIGEST>'
```

## 配置

复制 `terraform.tfvars.example` 为 `terraform.tfvars`。真实 Secret 只通过环境变量传递：

```bash
export ALIBABA_CLOUD_ACCESS_KEY_ID='...'
export ALIBABA_CLOUD_ACCESS_KEY_SECRET='...'
export ALIBABA_CLOUD_REGION='cn-hangzhou'
export TF_VAR_e2b_domain='sandbox.example.com'
export TF_VAR_sandbox_admin_api_key='...'
export ONYXCLAW_OPENCLAW_IMAGE='<REGISTRY>/onyxclaw-openclaw@sha256:<DIGEST>'
export ONYXCLAW_ACS_ACCOUNT_READY='true'
export ONYXCLAW_WARM_POOL_REPLICAS='2'
```

本机实操可以直接填写仓库根目录下已被 Git 忽略的 `.env.alicloud.local`，然后运行：

```bash
npm run iac:alicloud:local -- plan
npm run iac:alicloud:local -- deploy
npm run iac:alicloud:local -- destroy
```

`TF_VAR_sandbox_admin_api_key` 会存在 Terraform state 中。请使用受控、加密的远端
Backend；不要提交本地 state。

默认不创建 Sandbox Manager 的公网 ALB。云内 APP 使用集群内 Service；macOS 联调
使用 `kubectl port-forward`。只有准备好域名和证书后，才设置
`create_default_alb=true` 与 `sandbox_manager_tls=true`。

当前验证镜像位于 Public GHCR，集群可直接匿名拉取，因此不安装
`managed-aliyun-acr-credential-helper`，也不要求无关的 `AliyunCSManagedAcrRole`。
若后续切换到同账号 ACR 私有镜像，再显式增加该 addon 和服务角色授权；私有 GHCR、
跨账号或跨地域镜像需要额外配置。

ACS profile 集群会随集群生命周期提供 `acs-virtual-node`。它不作为独立
`alicloud_cs_kubernetes_addon` 资源重复安装；云端验收只检查并按需升级其版本。

## 部署和清理

```bash
npm run iac:alicloud -- plan
npm run iac:alicloud -- deploy
npm run iac:alicloud -- destroy
```

`deploy` 创建网络、ACS、组件和 `SandboxSet/onyxclaw`。`destroy` 先删除预热池，再
销毁 Terraform 栈并移除本地生成的 kubeconfig。默认配置会产生按量费用，联调完成后
立即执行清理。
