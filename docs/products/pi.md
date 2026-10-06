# Pi Coding Agent 预设来源与适配

固定官方来源：[earendil-works/pi v1.0.2，cd32f7725fdbddbaecdff5b1e68491563394e0ca](https://github.com/earendil-works/pi/tree/cd32f7725fdbddbaecdff5b1e68491563394e0ca)，MIT。`src/presets/pi/source.json` 维护完整来源文件清单、逐文件 SHA-256、原始路径、固定 URL、许可、工具映射及逐项适配；LICENSE 原文完整保留。

## 生效文本

真实主提示词来源是 [`core/system-prompt.ts`](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/coding-agent/src/core/system-prompt.ts)，不是营销介绍或泄露样本。其默认结构为 preamble → tools → rules → docs → 可选 addendum/project_context/skills → cwd → 自定义 sections。工具 snippets 与 guidelines 来自具体 read/bash/edit/write 定义，原版默认四个工具，并按已选工具去重规则。上游 before_agent_start 可改变结构化 sections；section delta 记入 transcript，完整强制 prompt 是不同分支。OMAA 0.10.0 已接入该回调，系统选项归一化与技能渲染使用固定原版纯函数；完整强制 prompt 的原生记录差异见下文。

`prompt.mjs` 的 `buildPrompt({tools,cwd,platform,mode})` 保留完整默认 preamble、工具段组织、read/write 规则、简洁及清楚路径原句、完整文档阅读要求和 cwd 结构。默认组合保留 read/bash/edit/write 四核心，额外提供宿主原生 read_image 和 skill 作为实际能力；Windows 用真实 pwsh 时沿用上游 PowerShell 规则。额外图片工具只在注册 read_image 时明确说明其真实分工。项目 AGENTS.md/CLAUDE.md 和技能正文由 DSH 原生上下文及技能服务承载。

`resources.mjs` 补齐 Pi 约定目录。`cwd/.pi/SYSTEM.md` 优先于用户 `~/.pi/agent/SYSTEM.md`，非空时替换完整默认 persona 段并保留 cwd；`APPEND_SYSTEM.md` 按同一优先级装配 `<addendum>`，不混淆替换与追加。用户目录可由原版 `PI_CODING_AGENT_DIR` 或插件 `agentDir` 指定。文件由宿主 `ctx.fs` 读取；宿主权限、工具 schema、环境与其他系统段仍有效。用户目录规则按原版 `AGENTS.override.md` → `AGENTS.md` → `AGENTS.MD` → `CLAUDE.md` → `CLAUDE.MD` 取第一份，保持原版 project_context 标题和标签。工作区规则继续由宿主注入一次；宿主按仓库根和触及文件发现规则，可同时装配不同候选及 local 文件，尚不等同 Pi 从文件系统根到 cwd 的单候选继承与嵌套 worktree shadow 规则。

用户和项目 `prompts/` 直接子级的 `.md` 成为提示模板；同名按固定 CLI 的 PackageManager 默认优先级选择项目资源，再选择用户资源（同层 first-wins）。上游完整参数语法包括 `$1`、`$@`、`$ARGUMENTS`、`${1:-default}`、`${@:-default}`、`${@:N}`、`${@:N:L}`，引号参数和替换值不递归展开。普通输入、steer 和 queue 在原生 pre-step 中只展开一次，保留用户消息 id/source。启用扩展时依次等待异步 input、模板展开和 before_agent_start，预处理结果缓存后交给原生 pre-step 入账；未启用扩展时保持原有装配。合法宿主命令名在首次资源装配后进入原生斜杠命令列表；其他 Pi 文件名仍可直接输入展开。已有宿主命令优先。每次装配重新读取资源，文件修改在后续请求生效；单文件 64 KiB、资源 256 KiB、128 个模板和单目录 512 个条目有明确上限。

技能目录遵循固定 CLI 的默认入口：当前 cwd 的 `.pi/skills`，从 cwd 向最近含 `.git` 的目录（含该目录）逐层发现 `.agents/skills`；没有仓库则到文件系统根。`.pi/skills` **不向祖先继承**。项目 `.pi` 优先于项目 `.agents`，同类祖先靠近 cwd 的优先；项目默认资源优先于用户 `~/.pi/agent/skills` 和 `~/.agents/skills`。依据固定 [package-manager.ts](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/coding-agent/src/core/package-manager.ts) 的 collectAncestorAgentsSkillDirs/addAutoDiscoveredResources/resourcePrecedenceRank，而非单独调用 loadSkills(includeDefaults:true) 的顺序。

目录选择经 native FS 有界递归：128 个目录、12 层、2048 个条目，祖先最多 64 层；遇到 `SKILL.md` 即把目录视为一个 bundle，不继续钻进其支持文件。Pi 位置仅根级平铺 Markdown 生效，`.agents` 位置的非根级平铺 Markdown 生效；跳过 dot 目录和 node_modules。所选路径交给同一个 `FileSystemSkillProvider` 的原生 scan/get/watch/缓存/正文加载和资源基址，不另写技能解析器。`roots` 在宿主 d.ts 中是 **private**，这里是固定 0.2.1-alpha.1 的内部扩展，不宣称公共 API；升级须核对该契约。符号链接与特殊文件沿用实际 native FS/provider 行为。宿主默认 `.dsh/skills` 仍保留。

技能发现使用与固定上游相同的 `ignore@7.0.8`，按每个扫描目录的 `.gitignore` → `.ignore` → `.fdignore` 顺序叠加，保留原版 `prefixIgnorePattern`、根相对路径、目录末尾斜杠及 negation 语义。规则仅从各技能资源根向内继承，项目仓库上层 `.gitignore` 不自动影响这些独立资源根；被忽略的目录不进入，被忽略的 `SKILL.md` 不截断后续递归。忽略文件同样走 native FS；权限、取消和预算失败向宿主传播，不绕过权限读取。单份规则 64 KiB、一次选择合计 256 KiB。原生 scan 的输入及结果均限制在选择集合内，避免解析被忽略 bundle 的正文；实际 YAML 解析、正文、资源基址仍由原生 provider 负责。

原生 watcher 继续处理技能和目录变动；它不观察 ignore 文件。Pi 每次系统资源装配比较已发现规则、配置和显式资源路径的 native opaque version（含缺失文件），变动才使该 Pi provider 注册失效并重新发现；规则检查仅 stat，未变化时不重扫技能树、不重读正文。项目信任弹窗属于 Pi 运行时，本预设继续执行宿主已有权限。

`resource-paths.mjs` 读取项目 `cwd/.pi/settings.json` 和用户 `agentDir/settings.json` 的 `skills`、`prompts`、`packages`，其余 Pi 模型、shell、TUI 设置不接管 DSH。精确路径以所属配置目录为基址，支持绝对路径与 `~`；显式技能目录使用 Pi 的根级平铺 Markdown / 深层 SKILL bundle 规则，模板目录允许递归。与默认目录同名时，项目显式设置 → 项目自动目录 → 用户显式设置 → 用户自动目录 → package 的顺序生效。settings 中的 pattern 用于筛选已发现的资源，不自动展开成新资源入口，符合固定 PackageManager 的 plain/pattern 分工。

`packages` 支持已经存在的本地目录，字符串形式或含 `source` 的对象形式；相对 source 同样从配置目录解析，项目声明按解析后的绝对路径覆盖用户的同包声明。包内有 `package.json.pi` 时按其 `skills` / `prompts` 声明发现，没有 manifest 则使用 `skills/` / `prompts/` 约定目录。manifest 的 `*` / `?` glob 经 native FS 有界枚举；dot 路径只能显式列出。manifest 及 package filter 使用固定上游的 `minimatch@10.2.6`，按相对路径、文件名、绝对路径及 SKILL 父目录匹配；`!pattern` 排除、`+path` 精确恢复、`-path` 最终精确排除，filter 不暴露 manifest 已排除的资源。`skills:[]` 或 `prompts:[]` 关闭对应包资源。

例如，项目 `.pi/settings.json` 可写 `{"skills":["../shared-skills"],"prompts":["../review-prompts"],"packages":["../team-pi-package"]}`；原有本地资源无需复制到 OMAA 或安装另一个客户端。所有配置、manifest、资源与规则仍通过 native FS；这个资源发现层不自动执行第三方 JS/TS，也不自动安装包依赖。用户指定的可执行扩展使用下节独立的绝对文件白名单，不能由发现项目或 package 资源推定授权。npm/git/URL 来源明确诊断并跳过；`autoload:false` 跨作用域 delta 尚不支持，涉及同一包的声明整体跳过。主题包、gallery、installer 不在这个资源适配内。原生技能 provider 要求 Markdown；其他显式技能文件格式会诊断并跳过。配置每份 64 KiB、合计 256 KiB；两类配置路径合计 256 条，单列表 128 条；glob/模板扫描限 128 个目录、12 层、2048 个条目，模板单目录仍限 512 条。

DSH edit 为单次 `file_path/old_string/new_string/replace_all`，Pi v1.0.2 原版为 `path/edits[{oldText,newText}]`，多处不重叠修改一次匹配原始文件。四条 edit guidelines 因这一真实差异原位改成宿主单次替换规则，保留唯一匹配、避免大块无关文本及合并相近修改的要求。Pi 的 `PI_*` 会话环境变量说明未装配，因为宿主没有提供它们；原版 2000 行/50KB 截断与临时全文文件也不作为 DSH 的承诺。

文档段原始内容完整保留，将安装目录 getReadmePath/getDocsPath/getExamplesPath 替换为固定 commit 的官方 raw URL；有命令或 web_fetch 工具时才装配，并说明如何取回文档。工具真实 schema 始终由 DSH 提供，主提示词不伪造参数或返回值。

## 用户指定的本地扩展

`extensions.mjs`、`extensions/guest.mjs` 与 `extensions/pi-api.mjs` 已实现扩展 factory/回调桥。默认白名单为空；全局设置「Pi 本地扩展」仅保存用户明确填写的绝对 TS/JS 文件路径，不自动运行 `.pi`、package manifest 或扫描目录里发现的扩展。配置使用 revision 冲突检查，运行中的 Pi 任务拒绝切换；「清空并停用」清除白名单。当前上限为 32 个文件，每个入口最多 256 KiB。配置位于 `DSH_HOME/omaa/pi-extensions.json`。

guest 只由 DSH 的原生 `subprocess` 启动并按当前 `sandboxPolicy` / `sandbox` 约束，加载本地 default factory 与扩展回调；它没有 Pi 的 agent loop、模型/provider、账号、输入驱动或另一份会话日志。扩展工具执行与嵌套工具调用走同一原生工具注册、执行、权限及结果入账；`pi.exec` 同样使用原生 subprocess/sandbox。回调会核对当前权限，策略不一致时拒绝调用；原生 sandbox 模式变化事件撤销旧进程，后续按当前权限重新加载。

源码已接入的范围：

- 加载阶段及活动回调内的 `registerTool`、`registerCommand` 和 `on`，以及 `input`、`before_agent_start`、`tool_call`、`tool_result`、`session_start`、`session_shutdown`。斜杠命令注册在当前 Pi 的原生命令服务中；活动回调中的动态变更等待宿主 ACK 后完成；同一文件同名工具或命令替换，跨文件同名取第一个扩展。订阅返回的取消函数也可在活动回调内使用。注册表通过原生工具和命令服务更新，已经发出的模型请求不追改；新声明、snippets 和 guidelines 在下一次原生装配中生效，before_agent_start 内的变更可进入尚未发出的首个请求。宿主拒绝某次变更时恢复上一份已接纳定义，发起回调明确失败。
- TypeBox typed schema 与普通 JSON Schema 的工具参数使用固定上游的完整 `validateToolArguments` 校验，保留其转换和错误行为；validator 原文和来源由 `source.json` 维护，不导入 Pi 模型或代理运行时。
- `input` 支持异步 continue/handled/transform，保留原生消息身份和附件；`tool_call` 可阻止工具，不能改写已经入账的工具参数或模拟整批 terminate。`tool_result` 可替换受支持的 text/image 内容，不任意改写错误状态、details 或 structuredContent。
- `ctx.ui.select`、`confirm`、`input` 接入原生 userQuestions；`notify` 经活动 Pi 输入区的原生通知展示，按会话 cursor/ID 去重，未启用扩展时暂停读取，不伪造 assistant 消息。
- `getActiveTools` / `setActiveTools`、只读工具/命令目录和有界会话视图，以及回调内的 `sendUserMessage`、`exec` 和工具回调中的 `ctx.executeTool`。消息继续使用原生 steer/follow-up；`sendUserMessage` 的输入来源、streaming 和默认关闭的 `expandPromptTemplates` 保存到原生 `source.pi.input`，排队及冷恢复保留输入来源与展开选择。`executeTool` 不作为任意回调中的额外执行入口。
- native attachment 桥将 Pi image 的 data/mimeType 转为原生已接纳附件，反向读取原生图片供回调使用；工具结果、输入变换和扩展投递复用附件服务，输入变换保留未改动的原生文件附件。

`before_agent_start` 对当前订阅快照按顺序等待回调，暴露可变 `systemPromptOptions` 和反映前序改动的 `ctx.getSystemPrompt()`；支持返回自定义消息及完整 `systemPrompt`。回调显式编辑 `selectedTools` 时使用该列表，否则采用最新 `setActiveTools`，同步新工具 snippets/guidelines。每次运行只触发一次，系统选项及 force 在后续工具步骤、steer 和排队 follow-up 中保持，回到 idle 后清空。自定义消息以原生 user/context 消息入账，`source.kind` 为 `pi-extension`，保留 `customType`、`display` 和 `details`。OMAA 0.11.0 新增该已接纳批次的默认消息展示，具体范围见下文。

默认自定义消息展示依据固定原版 [`core/messages.ts`](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/coding-agent/src/core/messages.ts) 和 [`components/custom-message.ts`](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/coding-agent/src/modes/interactive/components/custom-message.ts)。原版 `convertToLlm` 将 custom 消息投影为 user，**不检查 `display`**；`display:false` 是显示选择，仍进入模型上下文。OMAA 使用原生 `uiConversation` 自有 Event 与 keyed Chat renderer，显示 `[customType]` 和原生 Markdown，采用固定 Pi palette 的明暗 `customMessageBg/Text/Label` 颜色。内容数组只提取 text 并以换行拼接，与原版默认组件一致，不展示 image blocks 或 `details`；字符串直接作为 Markdown。`display:false` 将该展示节点隐藏，原生 journal 和模型消息不变；只接管 append-origin 消息，模型替换投影不会重复显示。

消息沿用 DSH 过程分组，可随原生过程折叠；位置不等同原版 TUI 的独立消息行。Event 的 match 使用 rc.2 与 alpha.1 共用的函数形式，因为 rc.2 不支持 alpha 的 match table。该适配仅覆盖 `before_agent_start` 返回的已接纳批次，未增加唤醒 inbox 或 `sendMessage`，也不支持 `registerMessageRenderer` / 自定义 TUI 组件。原版 renderer 可获得完整 message、expanded/outputPad 和 theme，返回自有组件或回退默认展示；此接口没有移植。已在一个隔离的原生 alpha Web 会话中实际展开过程，核对类型标签、Markdown 标题/列表/代码、隐藏材料不显示，以及明暗主题切换。实际 provider 请求与原生事件仍保留隐藏文本和图片附件。桌面 rc.2 已只读核对同一事件与 renderer 接口，不据此宣称完整桌面或 Windows UI 验收。

完整 force 经 DSH 原生 journal 和 `startsRequestSeries` 首条系统消息归一化进入实际请求；原版 Pi force 仅作请求投影、不记入 transcript，两者记录语义不同。

尚不支持 `context` / `context_with_system` 完整历史替换、自定义 TUI/组件渲染、`sendMessage`、`appendEntry`、写入/切换原厂 JSONL 树及扩展压缩。工具的 `prepareArguments` / `prepareLoadout`、`constrainedSampling` / `renderShell`、未接入的 exposure、`sendUserMessage` 的扩展命令/技能分派、额外自定义 AbortSignal 和嵌套工具的 onUpdate 等接口明确拒绝；guest 收到的部分更新不被伪造成 DSH 日志或流式结果。其余未接入 API 也报不支持，不做空壳成功。现有只读 sessionManager 是有界原生日志投影，不等于完整 Pi SessionManager。

OMAA 0.5 已包含此扩展入口及动态注册，隔离原生执行检查已通过。before_agent_start 与异步输入链从 0.10.0 起提供，旧版本安装不包含它们。它不代表任意 Pi 扩展、完整 TUI、依赖安装或原厂运行时均可直接使用；旧安装包也不能由本文推定已经包含这些入口。

## 行为与宿主边界

| 产品事实及依据 | DSH 承载与状态 |
| --- | --- |
| 默认核心只有 read/bash/edit/write；README 明确跳过默认 plan mode/subagents。 | 保持精简默认组合。宿主已有权限仍执行；不把宿主计划、子代理或权限机制称为 Pi 原生。 |
| `steer()` 在当前 assistant turn 完成后排入下一次请求，`followUp()` 仅在 agent 原本将停止时开始下一请求。默认两队列均 one-at-a-time，可改 all。依据 agent.ts 与 agent-loop.ts。 | 原生 steer 在整批工具后投递，queue 下一 turn。Pi 默认逐条 steer：公开 pre-step 在原生入账前同步只保留首条 typed steer，其余以原 id/source 经 native Inbox splice 排回；不处理通知或 queue，不替换 loop/伪造事件。组件可配置 all，尚无原厂两队列 UI 控件。已在实际安装中核对两条 steer 分别进入后续请求且各入账一次。宿主先 claim/assemble 再进入 hook，故此更早边界的取消/失败不能承诺原厂剩余输入完全保全；不保证单工具之间插话。 |
| 固定版本工具执行默认 parallel，支持 sequential；两种执行均完成整批后再 drain steer。 | DSH 的执行策略为实际行为依据，不替换 agent loop。**“steer 跳过尚未执行工具”不是这个固定 commit 的契约**。 |
| Extensions 有 input、before_agent_start、context/context_with_system、工具拦截及可请求继续的生命周期事件；before_agent_start 支持结构化系统选项。 | 源码已有显式本地 factory/回调桥，接入工具、commands、input/before_agent_start/tool_call/tool_result 与启动/关闭事件。before_agent_start 的可变选项、串行回调、自定义消息及 force 复用原生请求和入账；context 完整历史替换及自定义 TUI 未接入；不运行完整 Pi 代理或把任意 Pi npm 包当作 DSH 插件。实际接线检查范围见本文核验记录。 |
| context_with_system 要求首个系统消息位置不变；sections 支持增量更新。 | 宿主系统消息/事件记录负责，before_agent_start 改动进入原生装配；完整 force 使用原生 journal 与请求序列首条归一化。context_with_system 完整历史替换未接入，不建立平行日志。 |
| 常规压缩保留约 20000 最近 token，预留 16384，支持 summary/update、分支摘要和被切开的回合前缀摘要；文件读/改路径单独跟踪。 | `buildCompactionPrompt()` 提供完整常规 SUMMARIZATION_PROMPT。主集成仅替换原生摘要请求最后用户指令；实际阈值、保留尾部和工具配对由 DSH 管理，不声称沿用 Pi 数值。 |
| 不完整 length/error 摘要拒绝持久化；compaction 取消或失败不应提交半份 checkpoint。 | 常规压缩依赖原生 DSH 事务；可选离开分支摘要失败、取消或未完整生成时拒绝创建新分支。未移植 Pi JSONL 树存储、扩展自定义压缩或原厂队列恢复。 |

以上有源码依据的行为材料完整保留在 `sources/packages/agent/`、`sources/packages/coding-agent/src/core/` 与官方 docs 快照。常规摘要导出逐字提取原始 `SUMMARIZATION_PROMPT`，不混入 UPDATE_SUMMARIZATION_PROMPT 或分支摘要；Pi 摘要专用系统句子保留在 utils.ts 来源，原生 DSH 的摘要请求身份与消息装配仍由宿主负责。

`branches.mjs` 与 Pi 分支面板使用原生 `sessionController.list/inspect/fork`，显示原生 parentSessionId 关系并打开所选会话。只能从已完成的 `turn/end` 位置分叉，要求当前会话空闲且 journal head 仍与界面观察一致；每个分支有不同 sessionId，父分支原始 journal 保留。各分支共享工作目录，切换或分叉不会撤销文件修改。它承载可用的分支导航，不等同 Pi `navigateTree` 在同一个 JSONL 树中移动 leaf。

分叉位置随实际完成点列表校正：所选回合不再可用时回到「当前已完成位置」，不会提交隐藏的旧位置。分支创建成功但原生列表刷新失败时保留已创建 ID，提供直接打开入口，并暂停重复创建；明确刷新列表后可再次创建。导航仍调用原生 `uiWorkspace.openSession`。

“附带离开分支摘要”默认关闭（`withSummary:false`）。显式开启且所选位置之后存在材料时，使用当前会话已配置的模型/API，以来源中的完整 `BRANCH_SUMMARY_PROMPT` 和 `SUMMARIZATION_SYSTEM_PROMPT` 摘要被离开的后缀。只收集用户文本、可见 assistant 文本和工具调用/结果，不收集隐藏 reasoning；工具结果每条最多 2000 字符，按事件片段从最新往前选取，文本预算 100000 字符。读/修改路径分别跟踪，修改过的路径不再列为只读路径。错误、取消、max-tokens、空或超过 32000 字符的摘要拒绝分叉；摘要期间源会话 head 或运行状态变化也拒绝提交。

新摘要及继承摘要组成最多 60000 字符的派生 context capsule，保存在 `DSH_HOME/omaa/pi-branch-context` 的会话 hash 文件，通过原生 `systemPrompt.context` 与单次变量替换装配和入账，原话的花括号保持字面量，冷启动可读取。继续分叉会继承已有 capsule，即使没有请求新增摘要；没有新摘要时不额外调用模型。该资料是有界派生上下文，父 journal 与原生 fork 种子仍是历史依据，不是第二份执行日志。原生 fork 已完成但 capsule 保存失败时返回包含新 sessionId 的明确错误，允许从原生分支列表打开，不能假称跨文件/会话原子提交。

Pi 模型/provider 登录、账号、安装器、独立代理 RPC、原厂 JSONL 树、TUI 和 npm/git package 安装不在预设内启动；本地目录 package 仅发现技能和模板，用户指定的执行白名单才允许启动扩展回调 guest。模型/API、工具循环、权限、会话、日志、停止/恢复都使用 DSH。常规 `/compact` 与可选 branch summary 各自使用准确原文，不能混称同一个摘要分支。完整原生体验的队列、扩展和分支差异按实际接线验收，不能由一份短 prompt 视为完成。

## 核验范围

已核对固定 system-prompt.ts、agent-loop.ts 与 edit.ts 和官方 raw 网络字节一致；所有保存文件有 hash。已直接运行 buildPrompt 检查无工具、四核心、Windows pwsh、可选图片及额外计划工具输入分支；Pi 不会因为宿主注册额外工具就追加计划/子代理纪律。摘要可由原始常量逐字重生。未实测的队列、扩展和客户端行为没有计为通过。

`test/installed-behaviors.test.mjs` 用隔离 DSH_HOME、真实原版 CLI 安装包与 loopback 模型，验证 Pi 手动 `/compact` 的实际 provider 最后一条用户指令逐字等于完整 SUMMARIZATION_PROMPT；原生压缩事务成功闭合，保留系统消息与 turn 边界，并在后续请求读取 checkpoint。两项真实 read 工具的批次及 steer/queue 投递也通过实际请求和原生事件核对。它们验证宿主执行语义，不证明 Pi TUI、扩展包或全部会话分支等价。

`test/installed-pi-resources.test.mjs` 用原版 CLI 隔离安装与 loopback 实际请求核对项目/用户 SYSTEM 和 APPEND 优先级与回退、默认完整 persona 恢复、模板参数及只展开一次、原生模板命令、steer/queue 输入、默认 CLI project-first 模板/技能碰撞和懒加载正文；全局 override 规则按优先级选中，工作区原生规则仅出现一次；普通 DSH 不注入 Pi 资源。深层 SKILL 正文、祖先 `.agents` 发现、git root 截止、不继承祖先 `.pi` 及默认 CLI 项目优先也通过实际 provider 请求与工具返回核对。技能目录表由原生 tool-skill 的 user/system-reminder 投递，未另造系统提示词或会话事件。

`test/pi-skill-discovery.test.mjs` 覆盖三种 ignore 文件叠加、negation、不能越过已忽略父目录、双星号、子目录规则范围、被忽略 SKILL 后继续扫描、bundle 停止、平铺 Markdown 差异和独立资源根隔离；规则刷新检查使用 native 文件版本，只做 stat，并检查新增、编辑、删除与取消。本地 settings、manifest glob、package filter、默认约定目录、项目覆盖同一用户包、远端跳过与配置更新也有针对性回归。

同一 `installed-pi-resources` 回归已核对实际请求中的 ignore 隐藏/否定恢复、外部规则修改后的原生替换目录表、settings 和 manifest 包技能的懒加载目录与正文、两类本地模板的实际展开及原生命令注册。该资源发现回归没有配置执行白名单，包中故意会抛错的 extension 文件未被自动载入；这与本轮用户指定扩展桥的原生验收是不同范围，不代表完整 Pi 扩展 API 已适配。

`test/installed-pi-steering.test.mjs` 核对默认两条 typed steer 分别进入请求、保留原身份、各入账一次并排空原生待队列，未增加第二日志或队列执行器。

`test/installed-pi-branches.test.mjs` 已核对真实安装的前缀分叉、仅所选位置之后的摘要材料、当前模型、源 journal 不变、摘要冷读取及原话中的字面量花括号。`test/pi-branches-browser.test.mjs` 实点分叉、原生 child 导航、保留父分支和切回，默认关闭摘要不额外调用模型。主模型看过分支树实拍。脚本化 provider 验证接线与生命周期，不证明所有真实模型都能生成同等质量的摘要。

`test/installed-pi-extensions.test.mjs` 在一个隔离的官方 Web DSH 中载入原版 hello、protected-paths、input-transform 文件，核对实际工具内容/details 入账、.env 拒写、嵌套原生 read、原生图片附件、输入转换/handled、斜杠命令、完全权限切换为 workspace-write 后的直接文件写入约束、冷恢复、其它预设隔离与清空停用。没有调用外部模型或改用户现场配置；这证明所测契约，不覆盖所有 Pi 扩展 API 或桌面全部执行分支。问答复用已核对的两宿主原生 schema；基本超时可取消问答，尚没有原厂 TUI 倒计时。执行白名单只作用于 Pi 根会话，增强生成的子代理不加载这些扩展。

`test/installed-pi-dynamic-extensions.test.mjs` 定向核对原生首次装配前的启动回调注册、工具同名替换和增补、动态斜杠命令、输入事件取消订阅，以及原生 output schema 拒绝后的工具/回调恢复。会话设置显示原生标题或工作目录名，内部 session ID 仅在悬停信息中显示。

`test/installed-pi-start.test.mjs` 的定向范围包括异步 input 后模板展开、串行 start 回调与前序系统快照、自定义消息元数据、工具/steer/排队 follow-up 的单次 start、force 与 idle 重置、回调异常后继续、动态工具显式选择及 setActiveTools、扩展投递默认不展开模板和冷恢复来源。该 fixture 不覆盖完整历史替换、Pi TUI 或全部第三方扩展；一个最终原生 alpha 用例已通过；使用脚本 provider，不据此声明全部扩展或真实模型长期质量。冷故障用例等待原生 JSONL 的 200 ms 批处理落盘窗口，排队恢复后仍保留默认不展开的字面输入；恢复期间排入同一 activity 的消息不误判为新启动钩子，回到 idle 后才开启下一次 hook。
