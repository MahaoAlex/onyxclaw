# Deploy the cloud APP to Alibaba ACS

OpenClaw 基础配置和 Sandbox `bootstrap_config` 的生成链路见
[阿里云 ACS OpenClaw bootstrap_config 说明](../../docs/alibaba-acs-bootstrap-config.md)。
可复制的基础配置位于
[`examples/openclaw-base-config.example.json`](./examples/openclaw-base-config.example.json)，
运行时成品结构示例位于
[`examples/bootstrap-config.example.json`](./examples/bootstrap-config.example.json)。

镜像包含 Node BFF/UI 和阿里云支持版本的 Python E2B SDK。部署前创建 Secret；不要把真实值
写入 YAML 或 Git：

```bash
kubectl --kubeconfig iac/alicloud-acs/generated/kubeconfig create secret generic \
  onyxclaw-app-secrets \
  --from-literal=e2b-api-key='<MANAGER_RUNTIME_KEY>' \
  --from-literal=model-api-key='<MODEL_API_KEY>' \
  --from-literal=channel-signing-secret='<RANDOM_SECRET>' \
  --from-file=openclaw-base-config-json='./openclaw-base-config.json'
```

`onyxclaw-acr-pull` 是独立的 `kubernetes.io/dockerconfigjson` Secret，由部署执行器使用
`.env.alicloud.local` 中的 ACR 用户名和密码创建，不提交到仓库。

基础 OpenClaw 配置必须包含字符串占位符 `__ONYXCLAW_MODEL_API_KEY__`；APP 在单次
bootstrap 内存中替换它，再通过 E2B Files API 写入 Sandbox。部署清单使用
`{{IMAGE}}` 占位符，发布后替换为固定 digest 的 APP 镜像。

ACS Manager 返回的 Sandbox 访问域名只适用于特定网络解析环境。容器部署清单通过
`E2B_ROUTE_DOMAIN=sandbox-gateway.sandbox-system.svc.cluster.local:7788` 将 E2B
Files/Commands 流量送到集群内 Sandbox Gateway；该值不是密钥，但属于 provider 的
部署级网络配置。

APP 默认只创建 ClusterIP Service。浏览器联调使用：

```bash
kubectl --kubeconfig iac/alicloud-acs/generated/kubeconfig \
  port-forward service/onyxclaw-app 3000:3000
```

云端 BFF 会通过 `/api/ui-config` 只向浏览器暴露运行模式、Provider ID 和展示名称，
不会下发 Endpoint、API Key 或 Channel Secret。同一份前端在云端会自动切换为 ACS 样式：

- 全新用户选择“创建云端 Sandbox”，完成创建后进入 `SOUL.md` 确认；
- 存量用户选择“已有 Sandbox”，输入 Sandbox ID，并可选输入原 OpenClaw Instance ID；
- 手机区域显示 Sandbox/Runtime/Connection 状态；右侧只记录 E2B 兼容的 Sandbox
  Service API、后端对象及耗时，不记录 OpenClaw 与模型交互耗时。
