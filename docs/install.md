# 安装、更新与卸载

OMAA 使用 DSH 已配置的模型、工具、权限与会话，无需登录五个产品的官方客户端。OMAA **0.17.0** 精确匹配 DSH **0.2.1-rc.3**；rc.1 继续使用已有 OMAA **0.16.5**。独立使用 OMAA 不需要 OMD；可选增强配对同宿主 OMD **0.100.0**。[功能边界](compatibility.md) · [更新记录](../CHANGELOG.md)

<a id="ai"></a>
## 方法一：复制给 AI 安装

把下面整段复制给能操作你电脑或服务器的 AI：

```text
请帮我安装或更新 OMAA（Oh My Agents Above All）。先读取
https://github.com/gulagala001/oh-my-agents-above-all/blob/main/docs/install.md
确认实际使用的是 DSH 桌面版还是 Web 版、完整宿主版本、profile、DSH_HOME 和数据目录。
使用本页匹配该宿主的固定 GitHub Release 包，通过 DSH 原生插件管理器安装；不要安装同名 npm 包或混用宿主版本。
先备份现有配置，保留会话、模型配置、第三方插件和数据，不强制中断正在执行的任务。
DSH 0.2.1-rc.3 使用 OMAA 0.17.3；DSH 0.2.1-rc.1 使用已有 OMAA 0.16.5。
我已有 OMD 时保留它；需要可选增强时按同一宿主的 OMD 安装说明配对。不要为了装插件自行升级或替换宿主。
完成后只重启实际更新的实例，确认已安装版本和插件入口，告诉我结果。
```

<a id="gui"></a>
## 方法二：在“添加插件”中安装

1. 打开 DSH 左侧 **插件**，点击右上角 **＋ 添加插件**。
2. 根据实际 DSH 完整版本，复制下方对应地址，粘贴进包名／GitHub 仓库／本地路径输入框。
3. 点击 **安装**。任务结束后重启对应实例，保留原 profile 和数据目录。

**DSH 0.2.1-rc.3 → OMAA 0.17.3：**

```text
https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.3.omaa.0.17.3/oh-my-agents-above-all-0.2.1-rc.3.omaa.0.17.3.tgz
```

**DSH 0.2.1-rc.1 → OMAA 0.16.5：**

```text
https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.1.omaa.0.16.5/oh-my-agents-above-all-0.2.1-rc.1.omaa.0.16.5.tgz
```

[rc.3 发行与校验文件](https://github.com/gulagala001/oh-my-agents-above-all/releases/tag/v0.2.1-rc.3.omaa.0.17.3) · [rc.1 发行与校验文件](https://github.com/gulagala001/oh-my-agents-above-all/releases/tag/v0.2.1-rc.1.omaa.0.16.5) · [可选 OMD 增强安装](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)

0.17.0 安装后只加载基座，全部预设默认关闭；在 **设置 → OMAA → 代理预设** 中分别开启 Codex、Grok Build、Cursor、Pi 或 ZCode，开启后再到新会话选择。升级保留已明确保存的预设选择。

开关保存在当前 `DSH_HOME/omaa/presets.json`，重启沿用明确保存的选择。开启预设不会改变 DSH 默认预设。关闭时保留会话、检查点、记忆和个人设置；有运行中或排队的相关任务时拒绝关闭，等待任务结束后可重试。关闭后的旧预设会话需重新开启对应预设才能继续执行，历史仍由宿主保留。若该预设已被手动设为 DSH 默认，先在「Agent 预设」选择其他默认值，再关闭。

更新沿用同一安装入口；不要根据 GitHub latest 混用不同宿主包。

<details>
<summary>可选：Web／CLI 安装</summary>

使用正在运行实例对应的 DSH 命令、profile 和 DSH_HOME。例如 rc.3 的 web profile：

```sh
dsh plugin --profile web add https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.3.omaa.0.17.3/oh-my-agents-above-all-0.2.1-rc.3.omaa.0.17.3.tgz
```

需要校验时，在发行页下载同名 `.sha256` 与 `.metadata.json`。macOS/Linux 可用 `shasum -a 256 -c`，Windows 可用 `Get-FileHash -Algorithm SHA256`。

</details>

## 卸载

Desktop 在原生插件管理器移除；Web/CLI 使用安装时的 profile：

```sh
dsh plugin --profile web remove oh-my-agents-above-all
```

卸载不会删除 DSH 会话和工作区。插件偏好、文本检查点、Pi 派生分支上下文及保存的扩展白名单位于 `DSH_HOME/omaa`，不会自动清空；原生会话 journal 由宿主管理。
