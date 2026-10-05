# 安装、更新与卸载

OMAA 使用 DSH 已配置的模型/API、原生工具循环、权限和会话。无需安装或登录 Codex、Grok Build、Cursor、Pi、ZCode 的官方客户端；各产品的已实现能力与明确差异见 [验证记录](verification.md) 和 [产品资料](products/)。

从 [GitHub Releases](https://github.com/gulagala001/oh-my-agents-above-all/releases) 下载对应宿主的 `.tgz`、同名 `.sha256` 与 `.metadata.json`。先在 DSH 版本页面确认宿主完整版本；OMD 功能版本 `0.6.1` 与 DSH 宿主版本是不同字段。

| 当前宿主 | OMAA 附件文件名前缀 | 兼容 OMD 附件 |
| --- | --- | --- |
| 桌面 DSH `0.2.0-rc.2` | `oh-my-agents-above-all-0.2.0-rc.2.omaa.` | `trisoul_x-0.2.0-rc.2.omd.0.8.0.tgz` |
| Web／源码 DSH `0.2.1-alpha.1` | `oh-my-agents-above-all-0.2.1-alpha.1.omaa.` | `trisoul_x-0.2.1-alpha.1.omd.0.8.0.tgz` |

发行主 tag 跟随源码 `package.json` 的完整版本（`v<DSH宿主>.omaa.<三段版本>`）；同一发行提供两个宿主附件。选择当前宿主的文件，不因主 tag 含 alpha 前缀而升级现有 rc.2 桌面。

下载后在附件所在目录核对哈希：

```sh
# macOS
shasum -a 256 -c ./*.tgz.sha256
# Linux
sha256sum --check ./*.tgz.sha256
```

Windows 可使用 PowerShell 的 `Get-FileHash .\包名.tgz -Algorithm SHA256`，与同名 `.sha256` 的第一列比较。元数据记录版本、宿主及 SHA256；兼容 OMD 还记录固定上游 commit 与补丁来源。

## DSH Desktop

1. 保持正在使用的桌面应用，打开原生插件管理器。
2. 若已有 OMD 或希望使用 OMD 增强，先选择下载好的 **rc.2 兼容 OMD** tgz 安装；支持 URL 的添加入口也可粘贴该 GitHub Release 附件的直接下载 URL。
3. 同样安装 **rc.2 OMAA** tgz 或附件 URL。
4. 重载当前 profile；必要时退出并重新打开应用。在新聊天的原生预设菜单中选择五个 OMAA 预设。

桌面 profile 与安装生命周期由应用管理。上述步骤不要求更换宿主、模型、provider 或 API 配置。不能用另一个 Web CLI 的 profile 命令替代桌面安装。

## Web／CLI

使用实际正在运行的 profile，以下以 `web` 为例：

```sh
# 已安装 OMD 或需要增强时先安装兼容 OMD；独立使用 OMAA 可跳过这一行。
dsh plugin --profile web add file:/absolute/path/trisoul_x-0.2.1-alpha.1.omd.0.8.0.tgz
dsh plugin --profile web add file:/absolute/path/OMAA.tgz
dsh web
```

将 `OMAA.tgz` 替换为下载文件的完整路径。已有服务应先停止再重启，安装与启动都使用原来的 profile；其他 CLI profile 同理。不要复制别人的 profile、凭据或模型配置。

## 增强与更新

原生设置页的「OMAA 更新」显示运行版本、当前 DSH 对应的公开 GitHub 发行和配对兼容 OMD。检查包含已发布的 prerelease，不依赖 GitHub 的 `latest` 入口；只检查，不会自动安装。需要更新时点击明确的更新按钮，安装通过同一原生 `pluginManager`，保留现有 profile、模型、API 与插件启用状态。没有这个入口的旧版 OMAA，先按上面的桌面／CLI 方法安装本次发行附件。

同 profile 有 OMD 时，按钮按同一发行配对安装需要更新的 OMD／OMAA，完成后重启当前 DSH。任务运行期间暂停安装；如果一个包已安装、后一个失败，会显示已安装的包与错误，先重启再继续处理，不把部分成功当作全部完成。当前运行版本与磁盘安装版本分别显示，不承诺热切换。

兼容 OMD 的原有版本面板在 OMAA 启用时也使用这套配对检查与原生安装，避免直接跟随原 OMD 发行而丢失桥接。OMAA 禁用但仍安装时暂停这条更新路径；卸载 OMAA 后恢复 OMD 原来的独立更新方式。未经审阅的新宿主／OMD 来源或附件差异会明确拒绝，更新不会强升 DSH。


独立使用 OMAA 不需要 OMD。同 profile 已安装 OMD 时，需要它提供 OMAA enhancement/workflow composition 与外观协调接口；官方 OMD `0.6.1` 本身缺这些接口，不能仅按较大的版本号认定兼容。发行中的兼容 OMD 在对应官方 `0.6.1` 底稿上增加薄桥接，保留原生工厂、无项目聊天与 rc.2 草稿恢复，详见 [兼容构建](../compat/omd/README.md)。

OMD 增强默认关闭，基础增强与 Pro/Ultra 在会话设置中启用；Ask/Plan 暂停高级编排。切换主题不改变模型/API。安装、更新或卸载 OMD 后重载当前 profile，重新选择工作流 composition。更新按同样的原生插件安装流程替换对应宿主包，保留 DSH 会话和工作区。

若预设显示 broken 或提示缺少 OMD workflow，先检查实际宿主、两包版本与当前 profile 是否一致，并确认已重载。不要强行安装其他宿主的附件。提问时可提供版本、预设和报错，避免附上 API key、完整 profile 或未脱敏日志。

## 卸载

Desktop 在原生插件管理器中移除 OMAA。Web／CLI 使用安装时的 profile：

```sh
dsh plugin --profile web remove oh-my-agents-above-all
```

卸载不会删除 DSH 会话和工作区。插件偏好、文本检查点和 Pi 派生分支上下文位于 `DSH_HOME/omaa`，不会自动清空；原生会话 journal 仍由宿主管理。需要继续独立使用 OMD 时可保留它。
