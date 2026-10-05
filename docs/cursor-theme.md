# Cursor Agent 界面与主题依据

当前成品主题以 **Cursor IDE Agent 对话与 Agents Window** 为产品表面，显示名「Cursor · Agent 对话」。早期 CLI 登录前观测仅保留为局部证据，不再代表完整 Cursor 主题。

## 官方桌面依据与当前适配

[Agents Window 文档](https://cursor.com/docs/agent/agents-window) 明确将 Agent-first 工作空间与 classic IDE 区分，展示切换 IDE、文件搜索和文件预览的官方截图。[官方产品页 Desktop 演示](https://cursor.com/product) 则给出会话/任务导航、对话和 read/search/edit 状态、底部输入及 mode/model 控件、独立计划/文件区域的关系。OMAA 用现有 DSH 会话、工具折叠行、输入、计划和右侧预览承接这些关系，保留原有点击和停止行为。

主题已改为比例字体的正文与控件，代码保留等宽；工具行与输入工具栏紧凑，输入卡片、右侧信息面采用轻量圆角。源码在 `src/client/themes/cursor-agent.css`，由主题运行时按会话挂载。具体宽度、内边距、字重与圆角是 DSH 适配参数，不是提取出的闭源产品 token；不重排原生节点来伪造 IDE。

[Themes and appearance 官方帮助](https://cursor.com/help/customization/themes) 说明 IDE 可选择 Default Light Modern、Default Dark Modern、Cursor Dark 或主题扩展，也可跟随 OS；它明确主题/扩展操作属于 IDE，并指引 Agents Window 用户切回 IDE。这里没有充分依据证明 Agents Window 自动继承 IDE palette。OMAA 沿用当前 DSH 明暗颜色，是为了尊重用户环境的适配选择，不能署名为 Cursor 固定 RGB。

固定日期、页面内容哈希、官方截图 URL/原始尺寸、职责观察及适配取舍保存在 `src/client/themes/sources/cursor/agent-window.json`。没有复制官方网页 CSS、产品二进制、图标、字体或截图作为发行主题资产。已有主题内部 id `cursor-cli` 为兼容已保存会话而保留；对外名称、字体和布局已经改为 Agent 对话。

## CLI 局部证据

结论：固定 Cursor Agent CLI `2026.10.01-e373342` 的未登录界面可证实**终端继承前景/背景与 ANSI 色位**，不能证实一套产品固定 RGB palette。它不是 Cursor IDE；不得把 IDE theme、营销网页或 VS Code 配色当成 CLI 原生主题。

## 官方说明

[官方 CLI changelog](https://cursor.com/docs/cli/changelog) 的 May 7, 2026 条目说明主题跟随终端，终端明暗切换会重绘 CLI。[官方 CLI configuration](https://cursor.com/docs/cli/reference/configuration) 当前公开字段没有 theme/palette 配置，并公开 CURSOR_CONFIG_DIR；这只能说明文档契约，不证明闭源内部完全不存在其它颜色设置。[IDE themes 帮助](https://cursor.com/help/customization/themes) 介绍主题扩展，属于另一个产品表面。

终端控制语义引用 [xterm 官方控制序列](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html)：SGR 39 是默认前景，32/36 分别选择 ANSI 绿色/青色色位，1/2 是加粗/减弱强度，22 清除这些强度属性。色位的实际 RGB、减弱强度表现由终端实现/用户 palette 决定。

## 固定版实际量测

官方 macOS arm64 archive URL、实测 SHA-256 与版本记录于 `src/client/themes/sources/cursor/provenance.json`。量测运行官方 CLI launcher，不复制闭源bundle、图标或主题实现。

使用两套新 config/data 目录、file credential store、环境变量白名单和OS sandbox；拒绝网络、真实 Cursor 配置、Keychains、security/open程序及securityd IPC。保留真实HOME值，不读取或复用真实账号。PTY 为32行×100列，未发送任何登录按键，也未执行模型请求；7秒后由测试终止。

两次分别标记dark/light的PTY环境都输出完全相同的363 bytes，SHA-256为 `4027d49034dc07a0ba947bc214f1e7bf7fb3debf3c6153dc9d0ecb33e2e85c47`。仅出现SGR `0,1,2,22,32,36,39`，没有truecolor或256色RGB选择，没有OSC10/11查询。测量配置中的nominalEmulatorForeground/Background只是预备的终端查询回复值，**本次从未被请求/发送，不能提升为原生颜色**。这不是对登录后动态明暗切换的实测。

清屏后的实际终端行列（从0计数）：

| 原生区域 | 位置 | 原始表现 | 固定RGB |
| --- | --- | --- | --- |
| Cursor Agent 标题 | row15 / col37 | 默认前景，SGR1加粗 | 无 |
| v2026.10.01-e373342 | row16 / col37 | 默认前景，SGR2减弱 | 无 |
| 登录提示 | row17 / col37 | SGR32，ANSI index2 | 无 |
| 启动alias Tip | 清屏前 | SGR36，ANSI index6；最终界面已清除 | 无 |
| 背景 | 整屏 | 没有显式背景SGR，继承终端 | 无 |

原始`.ansi`、控制码观察器、屏幕span数据、量测JSON和来源均在上述cursor新目录。观察器仅支持本次实际出现的CSI/SGR，明确不是完整terminal emulator。2项独立测试校验真实capture hash、角色与位置、无固定RGB和未使用的查询值。

## CLI 事实的适用边界

目标与当前状态见 [计划](plan.md)。下述官方界面量测只作资料，不要求 OMAA 用户安装或登录 Cursor。

CLI 观测只说明前景/背景与 ANSI 色位依赖终端上下文，不能解释 IDE/Agents Window 的正文、工具、计划或输入布局。浏览器没有原用户终端 palette 时，不能声称与 Terminal.app、iTerm 或 Ghostty 像素同色；也不能硬编码猜测的 green/cyan HEX 并署名为 Cursor 固定颜色。

本次没有获得输入框、选择、diff、工具状态或登录后全文布局的固定角色；这些字段应保持未验证/宿主提供，不拿认证前居中登录页代替完整原生代理布局。ACP协商也不等于TUI颜色协议，当前未发现其公布palette字段。官方动态明暗说明可以指导后续终端上下文适配，实际OSC检测/重绘与认证后角色仍待独立验证。

桌面 Agent 主题现在独立注册；CLI 资料仍是局部来源，不能用于宣称桌面功能或视觉已经实测通过。

## 来源复核

复核已有隔离捕获的哈希、控制码与来源，不需要安装或运行官方产品：

```sh
node --test test/cursor-theme-evidence.test.mjs
```

历史 probe 仅采集未登录首屏，不是 OMAA 的执行器或主题安装步骤；config/data 和凭据不进入发行资产。桌面布局的验收使用 OMAA 在实际 DSH 会话中的截图与点击结果。
