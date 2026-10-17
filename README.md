# Oh My Agents Above All

![OMAA — 五种代理工作方式，运行在 DSH 上](assets/marketing/omaa-workspace-2026-10-10.png)

上图为品牌插画，不是产品界面；五产品的真实 DSH Web 实拍见[界面截图](docs/frontend-gallery.md)。

OMAA 是 DSH 插件，提供 **Codex、Grok Build、Cursor、Pi Coding Agent、ZCode** 五个独立深度预设。使用 DSH 已配置的模型/API、原生工具循环、权限与会话，装配完整来源提示词及产品适配，并提供各自的明暗主题。不需要安装或登录五个官方客户端。

当前版本为 **OMAA 0.15.3**，分别提供官方 DSH **0.2.1-rc.1** 与 **0.2.1-rc.2** 的独立构建。请选择与正在运行的完整宿主版本相同的包。Node.js 要求 `>=22.19`；可选增强以同宿主的 OMD `0.17.3` 为基线，更新限定在 `0.17.x` 补丁范围。

| DSH 宿主 | OMAA 固定发行 | 配对 OMD |
| --- | --- | --- |
| `0.2.1-rc.1` | [0.2.1-rc.1.omaa.0.15.3](https://github.com/gulagala001/oh-my-agents-above-all/releases/tag/v0.2.1-rc.1.omaa.0.15.3) | [0.2.1-rc.1.omd.0.17.3](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.1.omd.0.17.3) |
| `0.2.1-rc.2` | [0.2.1-rc.2.omaa.0.15.3](https://github.com/gulagala001/oh-my-agents-above-all/releases/tag/v0.2.1-rc.2.omaa.0.15.3) | [0.2.1-rc.2.omd.0.17.3](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.2.omd.0.17.3) |

[安装与更新](docs/install.md) · [版本适配与产品边界](docs/compatibility.md) · [会话工作台](docs/frontend-workbench.md) · [更新记录](CHANGELOG.md)

## 安装与使用

从上表的固定发行页下载对应 `.tgz` 与 `.sha256`，核对 SHA-256 后通过 DSH 原生插件管理器安装。独立使用 OMAA 只需一个包；需要增强时，在同一个 profile 安装对应 OMD。以下为 DSH `0.2.1-rc.2`、`web` profile 的例子，路径替换为实际位置：

```sh
dsh plugin --profile web add file:/absolute/path/oh-my-agents-above-all-0.2.1-rc.2.omaa.0.15.3.tgz
```

DSH Desktop 可直接使用原生插件管理器；CLI 安装应选桌面实际使用的相同宿主与 profile。安装后重载对应 profile，继续使用原有模型/provider 配置。

在新会话中选择 `Codex · OMAA`、`Grok Build · OMAA`、`Cursor · OMAA`、`Pi Coding Agent · OMAA` 或 `ZCode · OMAA`。输入区预设按钮可打开右侧设置，通用设置中只保留一个「Oh My Agents Above All」入口，版本更新与 Pi 本地扩展在该页折叠区。

- 工作模式：除 Pi 的精简默认模式外，支持执行、只读 Ask 和原生 Plan 审阅/批准流程。
- 身份：与 OMD 共存时沿用其人格／身份设置，修改开头身份文字；默认、内置、自定义及关闭均生效，不依赖工具增强开关。产品行为与主题继续由所选预设负责。
- 主题：跟随产品、指定另一套主题、恢复 DSH 外观或使用兼容 OMD 外观；明暗设置与宿主同步。
- Cursor：加载适用的 MDC/项目规则，提供已记录文件变更的检查点查看与恢复。恢复会核对冲突并保留消息；它不是任意 shell 操作的全工作区快照。
- Cursor 审阅：可针对本回合或单个文件“查找问题”，进入实际只读问答模式，由当前模型检查变更；切回执行模式后继续修复。
- Codex：查看 Unstaged、Staged、Commit、Branch 和 Last turn；按文件或块暂存、取消暂存、撤回，选定代码行后立即发送反馈，或收集多文件批注一次提交。操作遵守宿主权限并拒绝过期比较。
- Grok Build：实时 stdout 监控与原生 interval 定时任务，使用同一作业/会话生命周期。
- Pi：加载 SYSTEM/APPEND、用户与项目规则、提示模板，以及项目/祖先 `.agents` 和深层技能资源；默认逐条 steer。Pi 分支面板可打开原生 parent 树、从已完成回合创建新会话，按需勾选离开分支摘要（默认关闭，使用当前模型）。分支共享目录，切换不回滚文件。
- Pi 本地扩展：源码已实现用户明确指定绝对 TS/JS 文件的执行白名单，默认空、不自动运行项目发现文件。只在 DSH 原生 subprocess/sandbox 中运行扩展 factory 与回调，接入工具、命令、异步输入/工具事件、原生问答、通知及附件；0.10.0 补齐输入后模板展开与 `before_agent_start`，支持可变系统选项、串行回调、自定义消息及运行内 force；0.11.0 补齐自定义消息的类型、Markdown、明暗颜色和隐藏显示；0.12.0 增加串行 `agent_start` / `turn_start` / `agent_end` 通知、完整结束消息及严格分帧，并修复取消通知和人工新输入的 force 边界。模型、工具循环与账号仍由 DSH 负责。OMAA 0.5 提供该扩展入口及活动回调内的动态工具、命令、事件注册；使用方法与未支持 API 见 [Pi 文档](docs/products/pi.md)。
- ZCode：项目／全局保存工作流、按名列举及复用、参数声明与默认值。用户明确点名工作流，或启用 Pro/Ultra 后，使用实际工作流与结构化子代理结果，仍先加载 `zcode-workflows` 技能；按用户引用的 session id 回查原生历史，可使用当前已配置模型提取上下文。
- OMD 增强：默认关闭；基础增强提供 CodeGraph 和 Computer Use，可另选 Pro 或 Ultra 工作方式。高级方式复用 OMD 控制与持久化，使用当前模型最高可用 reasoning effort，保留 provider/model；开启高级方式自动开启增强，关闭增强同时关闭高级方式。Ask/Plan 暂停高级编排，恢复执行后可继续。主题选择独立。

运行中的会话先使用原生停止入口，再修改预设设置。文件、diff、工具结果、附件和继续工作仍使用 DSH 的现有界面与生命周期。

OMAA 0.6 提供 **ZCode TypeScript Actor 工作流**：固定原厂编译器、静态分析、schema 合成与 lowering 在执行前检查脚本，再交给 DSH 隔离 PTC 运行。`agent(name, persona)` 创建 Actor；同一 Actor 的多次 `ask<T>` 按 FIFO 复用持久原生 child，typed 结果通过 `submit_result` 校验，并在原生工具结果成功后提交。停止与收尾使用原生 jobs、取消及 child drain。保存时选择 `facade="zcode"`，复用时按保存的标记恢复该入口；已有 `facade="native"` JavaScript 工作流继续保留。

该适配输出真实静态 graph/causality 数据。OMAA 0.7.0 接入 `files.glob/read/grep`、`git.changedFiles/diff/status/log` 与字面命令 `world.run`：参数、限制、Git argv/解析、匹配及文本编码算法来自固定 ZCode 原文；执行复用 DSH 原生文件、subprocess、sandbox、当前权限与会话。grep 使用对应宿主官方 bundled ripgrep，支持桌面 asar 路径，不依赖系统 `rg`。超限明确拒绝，不返回截断成功；`world.run` 非零退出码作为正常结果返回，错误的 `code` 可在脚本中 catch。

Pi 普通会话保持精简工具，不显示或允许调用 delegation/jobs；开启 OMD 增强后可使用工作流支持。基础增强不强制工作流编排。工作流控制器按公开 provider 与 bridge 生命周期在原生／OMD engine 间切换，等待当前执行、后台作业与维护结束；增强失败释放自有分支并保留基础预设。

## 五个预设的差异

| 预设 | 当前移植重点 | 明确差异 |
| --- | --- | --- |
| Codex | 官方完整指令/压缩、连续推进、真实 Git 范围与块操作、行反馈、桌面布局 | DSH 选择实际模型；未启用官方 persistent/cloud/app 专有运行层 |
| Grok Build | 官方条件主提示词、计划/提问/任务、实时监控、interval 调度、独立主题 | 原生作业/会话；无跨会话 durable、即时首 fire 或原厂七天 TTL |
| Cursor | 完整公开样本适配、MDC 规则、Plan/Ask、文件检查点、IDE/Agent 对话布局 | 样本非官方公开源码；专有 Instant Grep、Composer、云代理与 IDE 上下文不等同于宿主能力 |
| Pi | 完整默认 preamble、精简工具、SYSTEM/模板/规则/深层技能、逐条 steer、原生分支导航/可选离开摘要与主题；显式本地扩展桥，before_agent_start、自定义消息默认展示及三个生命周期通知 | 不加入默认计划/子代理；扩展仅支持已接入的 API，可编辑 turn_end/agent_before_settle 与完整历史变换仍未接入，不运行完整 Pi 代理/TUI；不同原生 sessionId 共享目录，同树日志和更早取消边界仍有差异 |
| ZCode | 完整上下文、原生计划、保存/复用工作流、冷历史回查与主题；原厂 TS 编译/Actor facade及静态图；文件/Git/world.run facade；不可变产物及独立右栏；0.9.0 提供 Timeline/PhaseList 与 successor-run Amend、缓存和并发调整 | DSH 模型、隔离 PTC 与持久原生 child；命令按当前原生权限执行，无原厂 journal/replay、逐条 Bash 审批；新图只投影真实执行事实；不继承半转录或原模型 pin，不提供原厂 same-run journal/replay |

来源原文与实际适配分开保存，详细依据见 [产品资料](docs/product-sources.md) 和 [产品文档](docs/products/)。Cursor 配色沿用当前 DSH，桌面布局参考官方公开界面；没有把 CLI 登录前颜色当作整个 Cursor 的主题。

## 从源码构建、卸载

```sh
pnpm install --frozen-lockfile
pnpm build
node scripts/package.mjs
```

`pnpm build` 生成预设注册清单、Web 客户端、ZCode 纯编译器 bundle 及 world/产物纯模块；TypeScript `5.9.3` 的 57 份 ES2022 标准库声明在构建时嵌入，编译脚本不读取工作区文件。`node scripts/package.mjs` 在 `dist` 生成当前宿主版本的 `.tgz`、SHA256 和元数据。其他宿主必须在独立依赖锁与对应原生 SDK 下完整构建，再使用 `--host-version` 选择发行身份；该参数本身不会重建 SDK，不能将 a2 依赖或宿主工厂改名用于 rc.2／alpha.1。打包只复制发行白名单到独立 staging，并在副本内绑定对应宿主 SDK 和 loader，不改变源码 `package.json`；应先完成源码构建。卸载使用安装时的 profile：

```sh
dsh plugin --profile web remove oh-my-agents-above-all
```

卸载插件不会删除 DSH 会话和工作区文件。插件偏好、文件检查点、有界 Pi 分支派生上下文及已保存的 Pi 扩展白名单保存在 `DSH_HOME/omaa`（默认 `~/.dsh/omaa`），不自动清除；原生会话 journal 仍由 DSH 管理。

## 开源许可

OMAA 原创代码采用 [Apache-2.0](LICENSE)，允许按许可条款商业使用、修改和再分发。第三方代码与材料保留各自许可和署名；适用范围与 Cursor 样本的授权边界见 [许可说明](LICENSING.md)。

[架构](docs/architecture.md) · [OMD 增强边界](docs/omd-enhancement-boundary.md) · [主题来源](docs/theme-sources.md) · [第三方声明](THIRD_PARTY_NOTICES.md)

[安装与更新](docs/install.md) · [贡献](CONTRIBUTING.md)
