# OMAA 0.17.2 · DSH 0.2.1-rc.3

[中文](#zh-0172) | [English](#en-0172)

<a id="zh-0172"></a>

## 中文

### 问题修复

- 修复基础更新服务未公开注册的问题，无需启用某个预设即可检查版本。
- 修复 rc.3 发行识别；发布前检查实际安装包、版本元数据和校验文件的一致性。

<a id="en-0172"></a>

## English

### Bug Fixes

- Registers the base update service independently of active presets so version checks work without enabling a preset.
- Fixes rc.3 release discovery and validates the package, metadata and checksum attachments before publication.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主为 **DSH 0.2.1-rc.3**；保留原 profile、配置与数据，待任务结束后完整重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve settings and data, then restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMAA 0.17.2](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.3.omaa.0.17.2/oh-my-agents-above-all-0.2.1-rc.3.omaa.0.17.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.3.omaa.0.17.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-agents-above-all/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-agents-above-all/blob/main/docs/install_EN.md)
