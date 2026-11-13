# 儿童摄影特色版工作台

儿童摄影特色版生成与编辑工作台，包含 PWA 界面、第三方 OpenAI 兼容服务配置、参考款式选择、图片生成与局部编辑流程。

## 本仓库内容

网页源码位于 `ui/`，运行 `bash scripts/build.sh` 会生成 `dist/` 静态站点目录。站点需通过 HTTPS 或 localhost 运行，以启用 PWA 与 Service Worker。

## 参考图片

为了保护儿童肖像隐私，80 张参考版图片未上传到本仓库。应用的参考款式图库需要在本地的 `ui/refs/` 中提供 `01.jpg` 至 `80.jpg` 后才能完整运行。请勿在未获授权时把儿童照片提交到 GitHub。

AI 服务的 Base URL、Key 和模型配置由使用者在浏览器中填写，不应提交 API Key。
