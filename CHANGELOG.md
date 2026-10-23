# OMAA 0.17.0 · DSH 0.2.1-rc.2

[中文](#zh-0170) | [English](#en-0170)

<a id="zh-0170"></a>

## 中文

### 新增功能

- Codex 与 Cursor 提供持久行批注、工作区／暂存／提交／分支及原生回合审阅、单条或批量反馈续改，以及本机编辑器精确行定位。
- Grok 提供队列编辑、排序和立即发送，PDF／文档／演示与图片转换，以及保留相位的定时任务修改、到期和冷恢复。
- Pi 提供扩展上下文与系统消息投影、持久边界草稿和生命周期事件、同会话历史树、历史输入编辑续发及手动／自动压缩。
- ZCode 提供原厂 Actor 工作流、项目／Agent 记忆、受限技能与 MCP 配置、原生模型钉住、子任务恢复和结果预算、可修改的日历与有限次数调度。

### 体验优化

- 安装后只加载设置基座，五个预设默认关闭，按需开启；设置采用宿主原生布局，各预设保留自身会话状态与权限。

### 问题修复

- 区分批注已保存、已发送与已解决状态，保存期间延后刷新；拒绝过期或无法唯一映射的编辑器跳转，保留原始会话记录、附件与用量。

### 其他变更

- 本版新增能力精确匹配 DSH 0.2.1-rc.2；rc.1 继续使用已有 0.16.5 固定发行包。

<a id="en-0170"></a>

## English

### New Features

- Adds durable line comments, workspace/staged/commit/branch and native-turn review, individual or batch feedback continuation, and precise local-editor navigation for Codex and Cursor.
- Adds Grok queue editing, reordering and send-now controls, PDF/document/presentation and image conversion, plus phase-preserving schedule updates, expiry and cold recovery.
- Adds Pi extension context and system-message projection, durable boundary drafts and lifecycle events, an in-session history tree, edited historical-input continuation and manual/automatic compaction.
- Adds ZCode Actor workflows, project/agent memory, restricted skills and MCP profiles, native model pins, child-task recovery and result budgets, and editable calendar schedules with finite dispatch counts.

### Improvements

- Loads only the settings base on installation, with all five presets off by default and enabled on demand; settings use the native layout while each preset retains its own conversation state and permissions.

### Bug Fixes

- Separates saved, sent and resolved review states and delays refresh during saves; rejects stale or ambiguous editor targets while retaining original conversation records, attachments and usage.

### Other Changes

- The capabilities in this release target DSH 0.2.1-rc.2 exactly; rc.1 continues to use its existing fixed 0.16.5 release.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [OMAA 0.17.0](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.2.omaa.0.17.0/oh-my-agents-above-all-0.2.1-rc.2.omaa.0.17.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.2.omaa.0.17.0/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-agents-above-all/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-agents-above-all/blob/main/README_EN.md)

---

# OMAA 0.16.5 · DSH 0.2.1-rc.1 / 0.2.1-rc.2

[中文](#zh-0165) | [English](#en-0165)

<a id="zh-0165"></a>

## 中文

### 问题修复

- 修复主题来源校验，并同步人格编辑与会话人设的协作行为。

### 其他变更

- 完善从源码生成 Pi 辅助模块的构建流程，更新插件标识与双语安装说明；可选增强配对及更新检查使用当前 0.99 系列。

<a id="en-0165"></a>

## English

### Bug Fixes

- Fixes theme provenance checks and synchronizes personality editing with per-conversation choices.

### Other Changes

- Improves Pi helper generation from source and updates plugin identities and bilingual installation documentation; optional enhancement pairing and update checks target the current 0.99 series.

## 安装 / Installation

在 **插件 → 添加插件** 安装与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待当前任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.1 | [OMAA 0.16.5](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.1.omaa.0.16.5/oh-my-agents-above-all-0.2.1-rc.1.omaa.0.16.5.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.1.omaa.0.16.5/SHA256SUMS) |
| 0.2.1-rc.2 | [OMAA 0.16.5](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.2.omaa.0.16.5/oh-my-agents-above-all-0.2.1-rc.2.omaa.0.16.5.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.2.omaa.0.16.5/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-agents-above-all/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-agents-above-all/blob/main/README_EN.md)

---

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

## 0.14.1

本候选修复 REA 升级与最终兼容性分支整合时的遗漏。五个基础预设独立启动；可选 OMD 初始化失败、依赖等待或桥接缺失时，基础工具与原生工作流仍可用。增强只在所属作用域完成安装后登记，停用与卸载会清除登记。工作流按实际 provider 在原生与 OMD 实现间切换，等待当前执行、后台任务和维护结束；失败时回退原生实现。

Codex 右栏入口保留原槽位条目的配置、存储、语言和子声明。Pi 资源与 steering 服务按预设隔离。REA 0.14.0 的固定 Codex/Pi 来源、完整只读 Pi 历史、隐藏工具适配、Cursor 回合改动入口与 ZCode 保存定义继续保留。

## 0.14.0

配对 OMD `0.12.0`，DSH 回归代表为 `0.2.0-rc.2` 与 `0.2.1-alpha.1`。当前没有新 tag／Release；公开安装仍为 OMAA `0.13.1`／OMD `0.10.0`。

- Codex 固定来源更新到 `0.162.0`，技能／插件明确授权的消息入口保持原生权限和最终来源说明。
- Pi 固定来源更新到 `1.1.0`，隐藏工具与提示 helpers 按实际原生可见性生成；扩展获得单次不可变观察的完整消息历史、原生投影、真实图像和冷恢复。仅只读消息历史，不扩张到任意会话树或上下文写回。
- Cursor 输入区显示真实回合改动和文件数，复用原生 Review；忙碌、会话切换、旧响应、卸载均按实际生命周期处理。
- ZCode 保存、列表、读取、运行工具卡可查看定义、填写参数并显式发送原生运行请求；缺省值、false、0、空字符串和 JSON 保留语义。拒绝非有限数与不安全整数，原始数字材料保留；Ask 不运行。卡片以原生低优先级注册，损坏／外国同名结果保留原文，不接管其业务语义。
- Grok 的现有 monitor、真实 interval scheduler、取消与恢复重新验收；rc.2 原生「自动化任务」bundle 未启用时不显示 scheduler 工具，启用后复用原生服务。

| 宿主 | OMAA 候选文件 | 配对 OMD 文件 |
| --- | --- | --- |
| `0.2.0-rc.2` | `oh-my-agents-above-all-0.2.0-rc.2.omaa.0.14.0.tgz` | `trisoul_x-0.2.0-rc.2.omd.0.12.0.tgz` |
| `0.2.1-alpha.1` | `oh-my-agents-above-all-0.2.1-alpha.1.omaa.0.14.0.tgz` | `trisoul_x-0.2.1-alpha.1.omd.0.12.0.tgz` |

已知原生宿主限制：两宿主原版 DSH 与固定 IUI、未安装 OMD／OMAA 的独立复现确认，卸载旧预设后，Web 复用旧空白会话的 `storedPreset` 会失败；默认仍为 `standard`，未指定旧 session id 的新标准会话可用。公开 select 在冷激活时失败，同 id 切 standard 冲突，宿主没有可等待完成的 pre-uninstall API。本候选没有修复原生宿主，不宣称缺失预设自动恢复通过，不删除或迁移会话、草稿和附件。其他卸载后的数据与第三方插件保留按各自真实报告核对。

配对 OMD 的 Loader 在显式移除条目及其已有子条目退出期间临时标记运行条目，防止 bundle 重组将全量 effective patch 误写入 `cordis.yml`。原始 options 保持不变，失败也等待已有清理完成，显式原生配置写入继续生效。新增保护的验收以最终工件身份及对应真实五预设／IUI／配对卸载报告为准，较早结果不能替代。

历史功能与来源见 [产品文档](docs/products/) 和 [来源说明](docs/product-sources.md)。

## 市场同步记录（2026-10-19）

[Awesome DSH Plugin 条目](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/7932)已收录，后续继续沿用同一条目，向共用该数据源的下游不重复投稿。自动发现 topics 已配置；新版同步由各市场独立处理，当前安装请使用[安装指南](docs/install.md)中的固定 Release 地址。
