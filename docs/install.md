# 安装、更新与卸载

OMAA 使用 DSH 已配置的模型、工具、权限与会话，无需登录五个产品的官方客户端。当前 OMAA **0.16.4** 匹配 DSH **0.2.1-rc.2**；rc.1 提供对应 OMAA 0.16.4。独立使用 OMAA 不需要 OMD；可选增强配对同宿主 OMD **0.18.4**。[功能边界](compatibility.md) · [更新记录](../CHANGELOG.md)

<a id="ai"></a>
## 方法一：复制给 AI 安装

把下面整段复制给能操作你电脑或服务器的 AI：

```text
请帮我安装或更新 OMAA（Oh My Agents Above All）。先读取
https://github.com/gulagala001/oh-my-agents-above-all/blob/main/docs/install.md
确认实际使用的是 DSH 桌面版还是 Web 版、完整宿主版本、profile、DSH_HOME 和数据目录。
使用本页匹配该宿主的固定 GitHub Release 包，通过 DSH 原生插件管理器安装；不要安装同名 npm 包或混用宿主版本。
先备份现有配置，保留会话、模型配置、第三方插件和数据，不强制中断正在执行的任务。
DSH 0.2.1-rc.2 使用 OMAA 0.16.4；DSH 0.2.1-rc.1 使用对应 OMAA 0.16.4。
我已有 OMD 时保留它；需要可选增强时按同一宿主的 OMD 安装说明配对。不要为了装插件自行升级或替换宿主。
完成后只重启实际更新的实例，确认已安装版本和插件入口，告诉我结果。
```

<a id="gui"></a>
## 方法二：在“添加插件”中安装

1. 打开 DSH 左侧 **插件**，点击右上角 **＋ 添加插件**。
2. 根据实际 DSH 完整版本，复制下方对应地址，粘贴进包名／GitHub 仓库／本地路径输入框。
3. 点击 **安装**。任务结束后重启对应实例，保留原 profile 和数据目录。

**DSH 0.2.1-rc.2 → OMAA 0.16.4：**

```text
https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.2.omaa.0.16.4/oh-my-agents-above-all-0.2.1-rc.2.omaa.0.16.4.tgz
```

**DSH 0.2.1-rc.1 → OMAA 0.16.4：**

```text
https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.1.omaa.0.16.4/oh-my-agents-above-all-0.2.1-rc.1.omaa.0.16.4.tgz
```

[rc.2 发行与校验文件](https://github.com/gulagala001/oh-my-agents-above-all/releases/tag/v0.2.1-rc.2.omaa.0.16.4) · [rc.1 发行与校验文件](https://github.com/gulagala001/oh-my-agents-above-all/releases/tag/v0.2.1-rc.1.omaa.0.16.4) · [可选 OMD 增强安装](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)

安装后在新会话中选择带有 `· OMAA` 的产品预设。更新沿用同一安装入口；不要根据 GitHub latest 混用不同宿主包。

<details>
<summary>可选：Web／CLI 安装</summary>

使用正在运行实例对应的 DSH 命令、profile 和 DSH_HOME。例如 rc.2 的 web profile：

```sh
dsh plugin --profile web add https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.2.omaa.0.16.4/oh-my-agents-above-all-0.2.1-rc.2.omaa.0.16.4.tgz
```

需要校验时，在发行页下载同名 `.sha256` 与 `.metadata.json`。macOS/Linux 可用 `shasum -a 256 -c`，Windows 可用 `Get-FileHash -Algorithm SHA256`。

</details>

## 卸载

Desktop 在原生插件管理器移除；Web/CLI 使用安装时的 profile：

```sh
dsh plugin --profile web remove oh-my-agents-above-all
```

卸载不会删除 DSH 会话和工作区。插件偏好、文本检查点、Pi 派生分支上下文及保存的扩展白名单位于 `DSH_HOME/omaa`，不会自动清空；原生会话 journal 由宿主管理。
