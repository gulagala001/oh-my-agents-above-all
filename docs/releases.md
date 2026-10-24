# OMAA 0.17.1 · DSH 0.2.1-rc.3

[中文](#zh-0171) | [English](#en-0171)

<a id="zh-0171"></a>

## 中文

### 问题修复

- 设置与预设面板使用宿主控件，修复窄栏、长路径和保存状态显示。
- Git 审阅统一使用所选对象、模式和版本，固定提交批注不再被无关工作区编辑阻止。
- Pi 循环与 Grok 调度按完整模块及方法指纹核对 rc.3，保留扩展、压缩、定时修改和恢复能力。

### 其他变更

- 精确适配 DSH 0.2.1-rc.3，同步匹配的 SDK、组件与冻结依赖；每份安装包仅用于对应宿主版本。

<a id="en-0171"></a>

## English

### Bug Fixes

- Uses native controls in settings and preset panels and fixes narrow layouts, long paths and save-state presentation.
- Git review uses the selected object, mode and revision consistently; unrelated workspace edits no longer block comments on fixed commits.
- Verifies the Pi loop and Grok scheduler against exact rc.3 module and method fingerprints, preserving extensions, compaction, schedule edits and recovery.

### Other Changes

- Targets DSH 0.2.1-rc.3 exactly, with matching SDK, components and frozen dependencies; each package is specific to its host version.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主版本为 **DSH 0.2.1-rc.3**；保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMAA 0.17.1](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.3.omaa.0.17.1/oh-my-agents-above-all-0.2.1-rc.3.omaa.0.17.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.3.omaa.0.17.1/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-agents-above-all/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-agents-above-all/blob/main/README_EN.md)
