# OMAA 0.17.3 · DSH 0.2.1-rc.3

[中文](#zh-0173) | [English](#en-0173)

<a id="zh-0173"></a>

## 中文

### 问题修复

- 修复预设、子作用域和冷启动下 grep／glob 无法执行，以及工作流搜索、共装共享和重载清理问题。
- 修复 ZCode 原生会话工具的同名注册冲突。
- 更新检查识别经过审定的同宿主新功能版本，保留补丁排序、来源校验和禁止降级保护。

<a id="en-0173"></a>

## English

### Bug Fixes

- Fixes grep/glob execution in preset and child scopes and during cold startup, including workflow search, shared installations and reload cleanup.
- Fixes colliding registrations for native ZCode session tools.
- Discovers explicitly reviewed feature series for the same host while preserving numeric patch ordering, source validation and downgrade protection.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主为 **DSH 0.2.1-rc.3**；保留原 profile、配置与数据，待任务结束后完整重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve settings and data, then restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMAA 0.17.3](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.3.omaa.0.17.3/oh-my-agents-above-all-0.2.1-rc.3.omaa.0.17.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.3.omaa.0.17.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-agents-above-all/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-agents-above-all/blob/main/docs/install_EN.md)
