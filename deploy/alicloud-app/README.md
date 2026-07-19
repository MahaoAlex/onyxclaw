# Deploy the cloud APP to Alibaba ACS

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

基础 OpenClaw 配置必须包含字符串占位符 `__ONYXCLAW_MODEL_API_KEY__`；APP 在单次
bootstrap 内存中替换它，再通过 E2B Files API 写入 Sandbox。部署清单使用
`{{IMAGE}}` 占位符，发布后替换为固定 digest 的 APP 镜像。

APP 默认只创建 ClusterIP Service。浏览器联调使用：

```bash
kubectl --kubeconfig iac/alicloud-acs/generated/kubeconfig \
  port-forward service/onyxclaw-app 3000:3000
```
