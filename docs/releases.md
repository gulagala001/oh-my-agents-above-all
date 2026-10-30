# OMAA 0.17.7 · DSH 0.2.1-rc.5

[中文](#zh-0177) | [English](#en-0177)

<a id="zh-0177"></a>

## 中文

### 问题修复

- 修复 Chromium 返回零时区偏移时的发送失败，统一转换为宿主接受的 UTC；独立安装与共装均可使用。

### 其他变更

- 精确适配 DSH **0.2.1-rc.5**，同步匹配的 SDK、构建输入和完整依赖锁。每份安装包仅用于对应宿主。

<a id="en-0177"></a>

## English

### Other Changes

- Target DSH **0.2.1-rc.5** exactly with matching SDK, build inputs and complete dependency locks. Each package is specific to its host.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.5**。在 **插件 → 添加插件** 中使用下方固定包。保留 profile、配置与会话，按宿主提示在任务结束后重新加载。

The exact host is **DSH 0.2.1-rc.5**. Use the fixed package below in **Plugins → Add plugin**. Preserve profiles, configuration and conversations; reload after active tasks finish if requested.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.5 | [OMAA 0.17.7](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.5.omaa.0.17.7/oh-my-agents-above-all-0.2.1-rc.5.omaa.0.17.7.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.5.omaa.0.17.7/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-agents-above-all/blob/main/docs/install.md)

---

# OMAA 0.17.6 · DSH 0.2.1-rc.3

[中文](#zh-0176) | [English](#en-0176)

<a id="zh-0176"></a>

## 中文

### 问题修复

- 设置行根据可用空间换行，避免控件挤窄说明文字；长内容、窄面板和底部状态操作保持在面板内。

<a id="en-0176"></a>

## English

### Bug Fixes

- Normalize Chromium’s zero-offset time zone to the host-supported UTC value, restoring message submission in standalone and shared installations.
- Settings rows wrap according to available space instead of compressing descriptions. Long content and footer actions stay within narrow panels.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主为 **DSH 0.2.1-rc.3**；保留原 profile、配置和会话，待任务结束后完整重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and conversations, then restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMAA 0.17.6](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.3.omaa.0.17.6/oh-my-agents-above-all-0.2.1-rc.3.omaa.0.17.6.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.3.omaa.0.17.6/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-agents-above-all/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-agents-above-all/blob/main/docs/install_EN.md)
