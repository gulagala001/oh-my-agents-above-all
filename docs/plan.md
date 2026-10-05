# OMAA 当前状态与维护方向

OMAA 的原始目标仍在进行中：交付五套可稳定日用、尽可能接近原产品的 DSH 深度预设。当前是可安装初版；不能把完整来源提示词、主题、安装成功或简单任务通过当作最终达成。源码可构建为本地可安装插件，方法见 [README](../README.md)。

已实现完整固定来源与实际工具适配、原生执行/Plan/Ask/压缩、Cursor 规则与文本检查点、五主题与会话设置，以及默认关闭的 OMD CodeGraph/Computer Use 兼容增强。深度补齐已包括 Grok 实时监控/interval scheduler、Pi SYSTEM/模板/项目及祖先深层技能、只读 shell、Cursor 原生审阅/预览、Codex Git 范围/逐块操作/行级反馈，以及 ZCode 实际工作流与会话回查。具体证据与源行为差异见 [验证记录](verification.md) 和产品资料；实现这些能力不等于复制原厂所有服务、扩展或产品运行时。

Pi 已补原生完成回合分叉、parent 树导航与默认关闭的离开分支摘要，实际后端、摘要冷读取和 Web 分叉/切换已核对。分叉使用不同原生 sessionId，共享目录不回滚；原版完整摘要指令经当前模型/API生成有界派生 context capsule，由宿主上下文入账和冷恢复，保留来源 journal，不复制 Pi JSONL 树或另建执行日志。原生 next-turn Inbox 本身每回合只取一条 follow-up，Pi 仅另薄适配 next-step steer，无重复队列机制。

首次同一多文件工程任务在已配置的 `space-bunny-free` 上五套均未完成：四套到达 300 秒时仍有未完成项，ZCode 提前结束且未编辑；首轮没有保留完整原生 journal，不能猜测其结束原因，也不能声称冷恢复通过。保留产物、修正后续安全捕获并针对失败单独诊断；公开需求和验收标准不降低。结果见 [复杂工程记录](verification/configured-project.md)。

后续工作按用户最新要求聚焦实际功能与交付，只做改动必要的检查，不再扩重型任务矩阵。ZCode 复杂工程和同一会话冷恢复/压缩/追加需求已实际通过，其他产品未据此宣称同等长期质量。Pi 分支/摘要与实际 Web 导航已通过针对性核对；Cursor 查找问题已接上实际 Ask 与原生任务提交。旧 OMD 与官方 OMD 0.6.1 缺 OMAA 兼容接口，预设会明确拒绝挂载；使用匹配当前 DSH 的兼容 OMD，或独立 profile。现有 Web alpha.1 与桌面 rc.2 已按用户授权部署兼容包，五预设菜单健康。

维护目标是五种可日常使用的工作方式，继续以固定官方源码、公开界面和实际 DSH 任务评估差异。模型/provider、宿主边界及专有服务不能靠提示词或主题复制。升级先核对来源与工具契约，再修改真正不兼容处；保留完整原文、适配差异和必要回归。

DSH 是唯一模型/工具循环与会话负责人；不恢复外部产品运行时、账号安装器、多魂、投票、固定交稿模板或另一套任务板。简单修改保持轻量，按风险验证；具体边界见 [架构](architecture.md) 和 [增强边界](omd-enhancement-boundary.md)。

兼容交付已转为固定官方 OMD 0.6.1 基线与入库最小补丁，通过 `scripts/package-omd-compat.mjs` 生成对应宿主的 tgz、SHA256 与来源元数据；不把本机缓存 stage 作为源码。正式附件由 GitHub Releases 交付，升级先审阅基线差异，保持对应宿主原生工厂、无项目聊天和 rc.2 草稿恢复。

当前交付要求是在 GitHub 仓库及 Releases 提供可安装成品、来源补丁、两宿主包和维护流程。当前 UI 修复聚焦无项目 Pro/Ultra 首次发送、设置保存竞态、同 ID 切预设残留、主题过渡与窄侧栏。正在运行的用户任务应保持，桌面重载在空闲后进行。

已补 ZCode 项目／全局保存与按名复用工作流，仍由 native write/workflow 和原生日志承载；新增配对 GitHub 更新入口，防止兼容 OMD 被普通 OMD 更新覆盖。

Pi extension-only 回调桥已在源码实现：用户显式指定绝对 TS/JS 文件白名单，默认关闭、不自动运行项目发现文件；guest 由 native subprocess/sandbox 承载，没有另一套 Pi loop/model/账号。源码接入扩展工具与 commands（可在活动回调动态注册与替换）、input/tool_call/tool_result/session_start/session_shutdown、原生 questions/notify、typed/普通 JSON Schema 的固定上游 validator，以及原生附件桥。来源清单与 hash 由 `source.json` 维护。before_agent_start/context 替换、TUI/custom render、appendEntry 等仍明确不支持，具体边界见 [Pi 文档](products/pi.md)。OMAA 0.5 包含扩展入口及活动回调内动态工具、命令与事件注册；失败变更恢复上一份已接纳定义，隔离原生执行检查已通过；不能将源码实现标成安装交付成功，也不把部分 ABI 接入称为完整原版扩展运行时。
