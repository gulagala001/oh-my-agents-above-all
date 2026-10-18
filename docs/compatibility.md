# 版本适配与产品边界

[项目介绍](../README.md) · [安装与更新](install.md)

当前 OMAA `0.16.1` 匹配 DSH `0.2.1-rc.2`，DSH `0.2.1-rc.1` 提供对应 OMAA `0.16.1`。两版均匹配 Cordis `4.0.5`、Schemastery `3.18.5`、Loader `1.0.6`，每套保留自己的依赖锁、宿主组件与生成配置。主分支默认 rc.2；rc.1 tag 保存对应的源码和冻结输入。包名、manifest 和下载入口使用完整宿主版本。

可选增强以同宿主的 OMD `0.18.1` 为兼容基线。更新检查从 OMD 官方仓库选择同一完整 DSH 宿主的 `0.18.x` 补丁，最低为 `0.18.1`（两个宿主分别提供匹配构建）；不跨功能版本或宿主版本安装。OMD 无需作为附件重复发布到 OMAA 仓库。基础五预设可独立运行；增强提供 OMD 的工具与工作方式，主题和身份沿用所选配置。工作流按实际 provider 切换，启停等待当前执行与清理。OMD 动态安装或卸载后重载 profile。

## 功能范围

- 模型/API、权限、原生工具循环、停止恢复、会话和文件来自 DSH。五产品预设提供来源提示、已接入行为和各自主题，不启动原厂专有客户端或账号服务。
- Codex 的云端、persistent runtime 和专有应用机制不包含在预设中。
- Grok monitor 与 interval 调度使用宿主作业/会话生命周期，没有跨会话 durable 和原厂七天 TTL。
- Cursor 的 MDC 规则与变更检查点适用于已记录的文件变更；不是任意 shell 的完整工作区快照。Composer、云代理和专有 IDE 上下文不包含在内。
- Pi 使用精简默认模式、资源、steer 与原生会话分支；本地扩展须显式白名单。完整 TUI、自定义 renderer 和可编辑历史变换仍有差异。
- ZCode 的 TypeScript Actor、保存工作流、产物与 Amend 通过 DSH 隔离 PTC 和原生 child 实现；没有原厂 journal/replay、逐条 Bash 审批或半转录续跑。
- Computer Use 来自可选 OMD/OpenCU；系统授权、平台能力和操作边界遵循相应插件说明。

宿主升级请先查看对应完整版本的发行。历史 alpha 与 `0.2.0-rc.2` 附件保留原入口；它们不表示新构建兼容旧宿主。Windows/Linux 与 macOS 的原生平台能力依 DSH 和所用工具而异，不以主题相同推定系统能力相同。
