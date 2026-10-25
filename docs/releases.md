# OMAA 0.17.4 · DSH 0.2.1-rc.3

[中文](#zh-0174) | [English](#en-0174)

<a id="zh-0174"></a>

## 中文

### 问题修复

- 更新发现按完整 DSH 宿主版本选择官方最新发行，移除需要逐个登记功能系列的限制；后续功能版与主版本升级无需修改更新器名单。
- 完整读取双方发行历史的所有分页，修复历史增长后遗漏版本的问题；分页异常或最新同宿主发行缺件时明确报错，避免误报已是最新版。保留固定来源、校验值核对及禁止降级保护。

<a id="en-0174"></a>

## English

### Bug Fixes

- Update discovery selects the newest official release for the exact DSH host without a manually maintained feature-series allowlist. Future feature and major versions require no updater list changes.
- Read every page of both release histories so a growing history cannot hide updates. Repeated pages and missing assets in the newest same-host release produce an explicit error instead of a false up-to-date result. Fixed-source validation, checksum checks, and downgrade protection remain in place.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主为 **DSH 0.2.1-rc.3**；保留原 profile、配置和数据，待任务结束后完整重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve settings and data, then restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMAA 0.17.4](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.3.omaa.0.17.4/oh-my-agents-above-all-0.2.1-rc.3.omaa.0.17.4.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.3.omaa.0.17.4/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-agents-above-all/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-agents-above-all/blob/main/docs/install_EN.md)
