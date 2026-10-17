# 安装、更新与卸载

OMAA 使用 DSH 已配置的模型/API、工具循环、权限与会话。无需安装或登录五个产品的官方客户端。[功能边界](compatibility.md) · [更新记录](../CHANGELOG.md)

## 选择宿主对应的发行

| DSH 宿主 | OMAA 固定发行 | 配对 OMD |
| --- | --- | --- |
| `0.2.1-rc.1` | [0.2.1-rc.1.omaa.0.15.4](https://github.com/gulagala001/oh-my-agents-above-all/releases/tag/v0.2.1-rc.1.omaa.0.15.4) | [0.2.1-rc.1.omd.0.17.4](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.1.omd.0.17.4) |
| `0.2.1-rc.2` | [0.2.1-rc.2.omaa.0.15.4](https://github.com/gulagala001/oh-my-agents-above-all/releases/tag/v0.2.1-rc.2.omaa.0.15.4) | [0.2.1-rc.2.omd.0.17.4](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.2.omd.0.17.4) |


每个发行页包含一个对应宿主的 `.tgz`、`.sha256` 和公开元数据。完整包版本必须与宿主前缀一致；不要将 rc.1 包用于 rc.2，或依据 GitHub 的 latest 选包。

## 安装

在 macOS/Linux 下载目录运行 `shasum -a 256 -c <包名>.tgz.sha256`；Windows 可使用 `Get-FileHash <包名>.tgz -Algorithm SHA256` 与 checksum 比较。

Desktop 使用原生插件管理器添加下载的本地包。Web/CLI 在实际使用的 profile 中安装，例如 DSH `0.2.1-rc.2`：

```sh
dsh plugin --profile web add file:/absolute/path/oh-my-agents-above-all-0.2.1-rc.2.omaa.0.15.4.tgz
```

对应 rc.1 将文件替换为 `oh-my-agents-above-all-0.2.1-rc.1.omaa.0.15.4.tgz`。需要 OMD 增强时，先添加同一宿主的 `trisoul_x-<DSH版本>.omd.0.17.4.tgz`，再添加 OMAA。独立使用 OMAA 无需 OMD。

安装与启动应使用同一个 profile。安装完成后重载该 profile，新会话中选择带有 `· OMAA` 的产品预设；原有模型/provider 配置继续生效。

## 更新

下载同宿主的新版本并通过同一原生入口更新。跨宿主升级时同时替换 OMD/OMAA 等插件为对应版本，保留各自精确 SDK 与依赖，不混用不同宿主的工件。历史发行继续保留；旧 alpha 或 `0.2.0-rc.2` 请选择其原发行说明中的包。

## 卸载

Desktop 在原生插件管理器移除；Web/CLI 使用安装时的 profile：

```sh
dsh plugin --profile web remove oh-my-agents-above-all
```

卸载不会删除 DSH 会话和工作区。插件偏好、文本检查点、Pi 派生分支上下文及保存的扩展白名单位于 `DSH_HOME/omaa`，不会自动清空；原生会话 journal 由宿主管理。
