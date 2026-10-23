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
