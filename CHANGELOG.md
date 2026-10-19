## 0.16.4（DSH 0.2.1-rc.1 / rc.2） — 2026-10-19

- Ultra 参与智能体共同实现、修复并迭代到任务完成，主智能体负责整合和最终验收。三种子模式共用 OMD 完整质量要求，仅协作方式不同。
- Ultra agents contribute to implementation, fixes and iteration until completion. The main agent owns integration and final verification; all three modes share the complete OMD quality guidance and differ only in collaboration method.

## 0.16.3（DSH 0.2.1-rc.1 / rc.2） — 2026-10-19

### 中文

- Ultra 实质任务默认主动协作；自由仅表示协作方式自由，Agent Team 保持原生团队，主智能体持续推进并负责整合，不固定人数或流程。
- 修复 Pi 分支摘要和 ZCode 历史读取遗漏原生助手消息的问题，并正确保留工具参数与文件记录。
- 修复 Pi 原生 Team 工具装配，子会话隐藏主会话的预设控制。

### English

- Ultra defaults to active collaboration for substantive work. Free leaves the collaboration method open, Team uses native teams, and the main agent continues working and integrates results without a fixed headcount or process.
- Pi branch summaries and ZCode history reads retain native assistant messages, tool arguments and file records correctly.
- Fixes Pi native Team tool assembly and hides main-session preset controls in child sessions.

## 0.16.2（DSH 0.2.1-rc.1 / rc.2） — 2026-10-18

### 中文

本次补丁修复原生 Team 通信与 Ultra 工作方式状态，并与同宿主 OMD 0.18.2 配套。

- Pi 作为真实原生团队成员时，即使未开启 OMD 增强，也可使用团队通信、打断与成员查询工具。
- Ultra 面板分别显示当前生效状态和已保存、下一轮生效的选择，避免运行中的切换被显示为已经生效。
- 状态查询与写后读取等待设置提交；跨工作区转交失败时恢复已保存的 Agent Team 选择，包括原生团队暂不可用的情况。
- 将 ZCode 工作流指导中的中文示例改为英文，继续识别任何语言的明确工作流请求；工具、权限与模式行为不变。
- 可选增强最低要求同一完整宿主版本的 OMD 0.18.2，更新继续限定为 0.18.x 补丁；rc.1／rc.2 使用各自的独立包。五个预设仍可独立使用。

### English

This patch fixes native Team communication and Ultra mode state, paired with OMD 0.18.2 for the same host.

- Pi members of a real native team can communicate, interrupt members and list agents even when OMD enhancements are disabled.
- The Ultra panel distinguishes the active mode from saved settings that take effect next turn, so a change during a running turn is no longer shown as already active.
- State reads and reads after writes wait for committed settings. A failed workspace transfer restores the saved Agent Team choice, including when native teams are temporarily unavailable.
- Workflow guidance now uses English throughout while continuing to recognize explicit workflow requests in any language; tool, permission and mode behavior is unchanged.
- Optional enhancements require OMD 0.18.2 for the exact same host, with updates still limited to 0.18.x patches. Separate rc.1/rc.2 packages are provided; all five presets remain independently usable.

## 0.16.1（DSH 0.2.1-rc.1 / rc.2）

[中文](#zh) | [English](#en)

<a id="zh"></a>

## 中文

本次更新包含自 0.15.4 以来的模式控制与会话转交改进，并把可选 OMD 增强的最低版本提升至已修复预设入口的 0.18.1。0.16.0 保持撤回。

### 新增功能

- 可选 OMD 增强面板提供 Ultra 的 Workflow／Agent Team／自由子模式，替代旧 Pro／Ultracode 名称。
- ZCode 根据所选模式执行：Workflow 沿用工作流约束，Agent Team 使用 DSH 原生团队，自由模式按任务选择直接执行或委派。

### 体验优化

- 工作方式面板订阅实际模式投影，切换后及时更新状态；原生团队未启用时隐藏该选项，保留之前保存的选择。
- 五个预设仍可独立使用；可选 OMD 增强默认关闭，不要求登录对应产品的官方客户端。

### 问题修复

- 跨工作区转交保留已保存的子模式，即使 Ultra 暂时关闭；失败时恢复原来的模式与子模式。
- 修复设置保存与模式切换失败后的状态回退；前后端共同遵循原生 Agent Team 可用性。

### 其他变更

- 可选增强最低要求同一完整宿主版本的 OMD 0.18.1，更新限定为 0.18.x 补丁；提供 rc.1／rc.2 独立包和两种安装方法。

<a id="en"></a>

## English

This release includes mode-control and session-transfer improvements since 0.15.4, and raises the optional OMD enhancement baseline to 0.18.1 with restored preset controls. Version 0.16.0 remains withdrawn.

### New Features

- The optional OMD enhancement panel provides Ultra Workflow, Agent Team and Free submodes, replacing the legacy Pro/Ultracode labels.
- ZCode follows the selected mode: Workflow retains its workflow constraints, Agent Team uses native DSH teams, and Free chooses direct execution or delegation for the task.

### Improvements

- The mode panel follows the actual mode projection and updates promptly. When native teams are disabled, the option is hidden while the saved selection is retained.
- All five presets remain independently usable. Optional OMD enhancements are off by default and do not require signing in to the corresponding official product clients.

### Bug Fixes

- Workspace transfers retain the saved submode even when Ultra is off, and restore the previous mode and submode if the transfer fails.
- Fixes rollback after settings-save or mode-selection failures. Frontend and backend both respect native Agent Team availability.

### Other Changes

- Optional enhancements require OMD 0.18.1 for the exact same host version, with updates limited to 0.18.x patches. Separate rc.1/rc.2 packages and both installation methods are provided.

# 更新记录

## 0.16.0 — 2026-10-18

- 整合 Ultra 的 Workflow／Agent Team／自由子模式，沿用 DSH 原生团队开关，默认自由。
- 改进会话工作台、子会话转交与总览接入，保留真实会话状态与权限。
- 可选 OMD 增强基线更新至同宿主 0.18.0，后续只发现 0.18.x 补丁。
- 分别提供 DSH 0.2.1-rc.1／rc.2 固定插件包；安装说明提供 AI 指令和“添加插件”两种入口，旧 rc.1 发行保留。

## 0.15.4 — 2026-10-17

- 修复 OMD 关于页因 OMAA 发行未附带 OMD 包而无法检查更新的问题，直接从 OMD 官方发行查找对应宿主的包。
- 以 OMD `0.17.3` 为基线发现同宿主 `0.17.x` 的最新补丁，不跨宿主或功能版本更新。
- 保留发行来源、元数据、SHA-256 与 tag 提交核对，以及安装前重新检查、防降级和原生插件事务。
- 分别提供 DSH `0.2.1-rc.1`、`0.2.1-rc.2` 的正式插件 Release，完整宿主前缀保持不变。

## 0.15.3 — 2026-10-17

- 为官方 DSH `0.2.1-rc.1` 和 `0.2.1-rc.2` 分别提供精确 SDK、冻结依赖和完整版本的发行包，配对同宿主 OMD `0.17.3`。
- 整合五产品会话工作台、主题和工作模式，保留 Codex Git 审阅、Cursor 回合变更、Pi 原生历史/扩展与 ZCode 保存工作流/Actor 接口。
- 同步宿主子代理与工作目录接口、固定 Codex/Pi 来源及对应提示适配。
- 安装与下载入口按完整宿主版本固定；公开文件门禁接入打包与 CI。

历史功能与来源见 [产品文档](docs/products/) 和 [来源说明](docs/product-sources.md)。

## 市场同步记录（2026-10-19）

[Awesome DSH Plugin 条目](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/7932)已收录，后续继续沿用同一条目，向共用该数据源的下游不重复投稿。自动发现 topics 已配置；新版同步由各市场独立处理，当前安装请使用[安装指南](docs/install.md)中的固定 Release 地址。
