# Pi Coding Agent 预设来源与适配

固定官方来源：[earendil-works/pi v1.1.0，abe508e1b89912adde45528136c3221eb69acdd7](https://github.com/earendil-works/pi/tree/abe508e1b89912adde45528136c3221eb69acdd7)，MIT。`src/presets/pi/source.json` 维护完整来源文件清单、逐文件 SHA-256、原始路径、固定 URL、许可、工具映射及逐项适配；LICENSE 原文完整保留。

本次正式 `v1.1.0` 更新的是已保存的 prompt、工具、资源及扩展参考文件，主题仍保留 v1.0.2 固定快照。纯 helper 和提示词 renderer 接入 `hiddenTools`：只有可见的已选工具贡献 snippets 和规则；隐藏 read/bash 时保留技能目录，加载提示不点名工具。有原生 grep/glob 时不再提示优先用 shell 搜索。原生扩展 frame 以宿主实际声明为准；`prepareLoadout` 已接入声明描述重写；隐藏声明仍须单独核验，不能仅修改可变提示选项就隐藏原生工具。

| v1.1.0 来源变化 | 本预设实际范围 |
| --- | --- |
| `hiddenTools`、`formatSkillsForPrompt(..., "indirect")` | 固定纯函数和 renderer 已适配；native 声明决定扩展 frame 的可见性，未提供原厂间接执行器。 |
| `disabledBuiltinExtensions` | 仅原厂 loader 的 `builtin:` 扩展禁用规则；OMAA 没有该 loader，继续使用显式本地执行白名单，不提供无效同名开关。 |
| `ToolLoadout.getPromptGuidelines()`、`tool_execution_end.durationMs`、`agent_settled.aborted` | 原始 types/实现完整保存，尚未接成原生扩展事件或 loadout API。 |
| read 的程序化 `structuredContent`、MCP tool pattern 与默认工具 modifiers | 来源保留；工具返回值、MCP 和工具选择继续按 DSH 已实现契约，不宣称原厂 codemode parity。 |
| 完整只读消息历史 | 使用同一个原生不可变观察，提供原始消息与当前投影消息；保留长文本、图片和工具配对。 |
| 可编辑 `context` / `context_with_system` | 在每次原生请求冻结前串行等待，支持完整消息投影、系统分段和工具声明；修改仅作用于本次请求。 |
| `turn_end` / `agent_before_settle` | 已接入串行草稿预览、整批持久提交、上下文删改与压缩、继续决定及最终 settled；原厂树导航与压缩控制回调仍待接入。 |

## 生效文本

真实主提示词来源是 [`core/system-prompt.ts`](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/core/system-prompt.ts)，不是营销介绍或泄露样本。其默认结构为 preamble → tools → rules → docs → 可选 addendum/project_context/skills → cwd → 自定义 sections。工具 snippets 与 guidelines 来自具体 read/bash/edit/write 定义，原版默认四个工具，并按已选工具去重规则。上游 before_agent_start 可改变结构化 sections；section delta 记入 transcript，完整强制 prompt 是不同分支。系统选项归一化与技能渲染使用固定原版纯函数；完整强制 prompt 的原生记录差异见下文。

`prompt.mjs` 的 `buildPrompt({tools,cwd,platform,mode})` 保留完整默认 preamble、工具段组织、read/write 规则、简洁及清楚路径原句、完整文档阅读要求和 cwd 结构。默认组合保留 read/bash/edit/write 四核心，额外提供宿主原生 read_image 和 skill 作为实际能力；Windows 用真实 pwsh 时沿用上游 PowerShell 规则。额外图片工具只在注册 read_image 时明确说明其真实分工。项目 AGENTS.md/CLAUDE.md 和技能正文由 DSH 原生上下文及技能服务承载。

`resources.mjs` 补齐 Pi 约定目录。`cwd/.pi/SYSTEM.md` 优先于用户 `~/.pi/agent/SYSTEM.md`，非空时替换完整默认 persona 段并保留 cwd；`APPEND_SYSTEM.md` 按同一优先级装配 `<addendum>`，不混淆替换与追加。用户目录可由原版 `PI_CODING_AGENT_DIR` 或插件 `agentDir` 指定。文件由宿主 `ctx.fs` 读取；宿主权限、工具 schema、环境与其他系统段仍有效。用户目录规则按原版 `AGENTS.override.md` → `AGENTS.md` → `AGENTS.MD` → `CLAUDE.md` → `CLAUDE.MD` 取第一份，保持原版 project_context 标题和标签。工作区规则继续由宿主注入一次；宿主按仓库根和触及文件发现规则，可同时装配不同候选及 local 文件，尚不等同 Pi 从文件系统根到 cwd 的单候选继承与嵌套 worktree shadow 规则。

用户和项目 `prompts/` 直接子级的 `.md` 成为提示模板；同名按固定 CLI 的 PackageManager 默认优先级选择项目资源，再选择用户资源（同层 first-wins）。上游完整参数语法包括 `$1`、`$@`、`$ARGUMENTS`、`${1:-default}`、`${@:-default}`、`${@:N}`、`${@:N:L}`，引号参数和替换值不递归展开。普通输入、steer 和 queue 在原生 pre-step 中只展开一次，保留用户消息 id/source。启用扩展时依次等待异步 input、模板展开和 before_agent_start，预处理结果缓存后交给原生 pre-step 入账；未启用扩展时保持原有装配。合法宿主命令名在首次资源装配后进入原生斜杠命令列表；其他 Pi 文件名仍可直接输入展开。已有宿主命令优先。每次装配重新读取资源，文件修改在后续请求生效；单文件 64 KiB、资源 256 KiB、128 个模板和单目录 512 个条目有明确上限。

技能目录遵循固定 CLI 的默认入口：当前 cwd 的 `.pi/skills`，从 cwd 向最近含 `.git` 的目录（含该目录）逐层发现 `.agents/skills`；没有仓库则到文件系统根。`.pi/skills` **不向祖先继承**。项目 `.pi` 优先于项目 `.agents`，同类祖先靠近 cwd 的优先；项目默认资源优先于用户 `~/.pi/agent/skills` 和 `~/.agents/skills`。依据固定 [package-manager.ts](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/core/package-manager.ts) 的 collectAncestorAgentsSkillDirs/addAutoDiscoveredResources/resourcePrecedenceRank，而非单独调用 loadSkills(includeDefaults:true) 的顺序。

目录选择经 native FS 有界递归：128 个目录、12 层、2048 个条目，祖先最多 64 层；遇到 `SKILL.md` 即把目录视为一个 bundle，不继续钻进其支持文件。Pi 位置仅根级平铺 Markdown 生效，`.agents` 位置的非根级平铺 Markdown 生效；跳过 dot 目录和 node_modules。所选路径交给同一个 `FileSystemSkillProvider` 的原生 scan/get/watch/缓存/正文加载和资源基址，不另写技能解析器。`roots` 在宿主 d.ts 中是 **private**，这里依赖宿主内部接口，升级 DSH 时须核对该契约。符号链接与特殊文件沿用实际 native FS/provider 行为。宿主默认 `.dsh/skills` 仍保留。

技能发现使用与固定上游相同的 `ignore@7.0.8`，按每个扫描目录的 `.gitignore` → `.ignore` → `.fdignore` 顺序叠加，保留原版 `prefixIgnorePattern`、根相对路径、目录末尾斜杠及 negation 语义。规则仅从各技能资源根向内继承，项目仓库上层 `.gitignore` 不自动影响这些独立资源根；被忽略的目录不进入，被忽略的 `SKILL.md` 不截断后续递归。忽略文件同样走 native FS；权限、取消和预算失败向宿主传播，不绕过权限读取。单份规则 64 KiB、一次选择合计 256 KiB。原生 scan 的输入及结果均限制在选择集合内，避免解析被忽略 bundle 的正文；实际 YAML 解析、正文、资源基址仍由原生 provider 负责。

原生 watcher 继续处理技能和目录变动；它不观察 ignore 文件。Pi 每次系统资源装配比较已发现规则、配置和显式资源路径的 native opaque version（含缺失文件），变动才使该 Pi provider 注册失效并重新发现；规则检查仅 stat，未变化时不重扫技能树、不重读正文。项目信任弹窗属于 Pi 运行时，本预设继续执行宿主已有权限。

`resource-paths.mjs` 读取项目 `cwd/.pi/settings.json` 和用户 `agentDir/settings.json` 的 `skills`、`prompts`、`packages`，其余 Pi 模型、shell、TUI 设置不接管 DSH。精确路径以所属配置目录为基址，支持绝对路径与 `~`；显式技能目录使用 Pi 的根级平铺 Markdown / 深层 SKILL bundle 规则，模板目录允许递归。与默认目录同名时，项目显式设置 → 项目自动目录 → 用户显式设置 → 用户自动目录 → package 的顺序生效。settings 中的 pattern 用于筛选已发现的资源，不自动展开成新资源入口，符合固定 PackageManager 的 plain/pattern 分工。

`packages` 支持已经存在的本地目录，字符串形式或含 `source` 的对象形式；相对 source 同样从配置目录解析，项目声明按解析后的绝对路径覆盖用户的同包声明。包内有 `package.json.pi` 时按其 `skills` / `prompts` 声明发现，没有 manifest 则使用 `skills/` / `prompts/` 约定目录。manifest 的 `*` / `?` glob 经 native FS 有界枚举；dot 路径只能显式列出。manifest 及 package filter 使用固定上游的 `minimatch@10.2.6`，按相对路径、文件名、绝对路径及 SKILL 父目录匹配；`!pattern` 排除、`+path` 精确恢复、`-path` 最终精确排除，filter 不暴露 manifest 已排除的资源。`skills:[]` 或 `prompts:[]` 关闭对应包资源。

例如，项目 `.pi/settings.json` 可写 `{"skills":["../shared-skills"],"prompts":["../review-prompts"],"packages":["../team-pi-package"]}`；原有本地资源无需复制到 OMAA 或安装另一个客户端。所有配置、manifest、资源与规则仍通过 native FS；这个资源发现层不自动执行第三方 JS/TS，也不自动安装包依赖。用户指定的可执行扩展使用下节独立的绝对文件白名单，不能由发现项目或 package 资源推定授权。npm/git/URL 来源明确诊断并跳过；`autoload:false` 跨作用域 delta 尚不支持，涉及同一包的声明整体跳过。主题包、gallery、installer 不在这个资源适配内。原生技能 provider 要求 Markdown；其他显式技能文件格式会诊断并跳过。配置每份 64 KiB、合计 256 KiB；两类配置路径合计 256 条，单列表 128 条；glob/模板扫描限 128 个目录、12 层、2048 个条目，模板单目录仍限 512 条。

DSH edit 为单次 `file_path/old_string/new_string/replace_all`，Pi v1.1.0 原版为 `path/edits[{oldText,newText}]`，多处不重叠修改一次匹配原始文件。四条 edit guidelines 因这一真实差异原位改成宿主单次替换规则，保留唯一匹配、避免大块无关文本及合并相近修改的要求。Pi 的 `PI_*` 会话环境变量说明未装配，因为宿主没有提供它们；原版 2000 行/50KB 截断与临时全文文件也不作为 DSH 的承诺。

文档段原始内容完整保留，将安装目录 getReadmePath/getDocsPath/getExamplesPath 替换为固定 commit 的官方 raw URL；有命令或 web_fetch 工具时才装配，并说明如何取回文档。工具真实 schema 始终由 DSH 提供，主提示词不伪造参数或返回值。

## 同一会话的历史树与压缩

在 **Pi 会话设置 → 分支树 → 当前会话历史树** 选择节点，再点击“切换到历史节点”。下一条输入从该节点继续；原路径仍可随时选回，冷重启后保留。选择用户消息会回到其父节点，并显示可编辑的原输入；“从此处发送”通过原生输入提交。主对话保留按时间排列的原始记录，“当前上下文路径”标示当前模型使用的分支。文件始终共享，树导航不回滚文件。已有“创建并打开新分支”仍创建独立的 DSH 会话。

“附带离开摘要”默认关闭；开启后仅总结离开的路径到共同祖先，使用当前模型，也允许扩展提供摘要。`/tree` 列出节点，`/tree <节点 ID>` 切换；扩展命令中可 `await ctx.navigateTree(id, { summarize, customInstructions, replaceInstructions, label })`。`session_before_tree` 可以取消、提供摘要或修改摘要重点及标签，提交后触发 `session_tree`。`getTree/getEntry/getChildren/getLeafId/getLeafEntry/getLabel` 及带起点的 `getBranch` 使用固定原厂只读树方法；全部原始条目继续由 `getEntries` 返回。

点击“压缩当前分支”或执行 `/compact [摘要重点]`。`session_before_compact` 接收原厂 `prepareCompaction` 生成的 preparation、branchEntries、reason、willRetry 和 signal；可以返回 `{ cancel: true }`，或 `{ compaction: { summary, firstKeptEntryId, tokensBefore, details } }`。没有覆盖时使用原厂选段、提示和文件列表生成摘要。成功后触发 `session_compact`，正常失败触发 `session_compact_failed`；被终止的扩展进程不能保证收到最终通知。回调中的 `ctx.compact({ customInstructions, onComplete, onError })` 共用此路径；工具执行、context 请求改写及会话操作回调内部不允许重入。

用户 Pi 目录和项目 `.pi/settings.json` 的 `compaction.enabled`、`reserveTokens`、`keepRecentTokens` 按项目优先合并。默认开启自动压缩、预留 16384 token、保留最近 20000 token；计数为原厂估算。手动压缩与提供方确认的溢出恢复尽量缩短历史，至少保留安全尾段。自动压力压缩和单次溢出重试使用同一有效分支，其他分支不受影响。

导航、标签和可选摘要由一个 `plugin:omaa/pi-tree` 记录原子保存；压缩沿用 `plugin:omaa/pi-boundary`。回调等待、模型摘要和最终提交之间核对原生会话归属及修订号，工具调用和结果必须完整。进行中可点击“取消树导航或压缩”；取消或无效摘要在提交前不改变分支。原始消息、附件、分支和用量记录不复制或删除。

## 行为与宿主边界

| 产品事实及依据 | DSH 承载与状态 |
| --- | --- |
| 默认核心只有 read/bash/edit/write；README 明确跳过默认 plan mode/subagents。 | 保持精简默认组合。宿主已有权限仍执行；不把宿主计划、子代理或权限机制称为 Pi 原生。 |
| `steer()` 在当前 assistant turn 完成后排入下一次请求，`followUp()` 仅在 agent 原本将停止时开始下一请求。默认两队列均 one-at-a-time，可改 all。依据 agent.ts 与 agent-loop.ts。 | 原生 steer 在整批工具后投递，queue 下一 turn。Pi 默认逐条 steer：公开 pre-step 在原生入账前同步只保留首条 typed steer，其余以原 id/source 经 native Inbox splice 排回；不处理通知或 queue，不替换 loop/伪造事件。组件可配置 all，尚无原厂两队列 UI 控件。已在实际安装中核对两条 steer 分别进入后续请求且各入账一次。宿主先 claim/assemble 再进入 hook，故此更早边界的取消/失败不能承诺原厂剩余输入完全保全；不保证单工具之间插话。 |
| 固定版本工具执行默认 parallel，支持 sequential；两种执行均完成整批后再 drain steer。 | DSH 的执行策略为实际行为依据，不替换 agent loop。**“steer 跳过尚未执行工具”不是这个固定 commit 的契约**。 |
| Extensions 有 input、before_agent_start、context/context_with_system、工具拦截及可请求继续的生命周期事件；before_agent_start 支持结构化系统选项。 | 源码已有显式本地 factory/回调桥，接入工具、commands、input/before_agent_start/agent_start/turn_start/agent_end/tool_call/tool_result 与启动/关闭事件。before_agent_start 的可变选项、串行回调、自定义消息及 force 复用原生请求和入账；context 已接入每次请求前的临时投影，自定义 TUI 未接入；不运行完整 Pi 代理或把任意 Pi npm 包当作 DSH 插件。实际接线检查范围见本文核验记录。 |
| context_with_system 要求首个系统消息位置不变；sections 支持增量更新。 | 宿主系统消息/事件记录负责，before_agent_start 改动进入原生装配；完整 force 使用原生 journal 与请求序列首条归一化。context_with_system 可以修改完整请求；系统 sections 使用固定原厂 helper 折叠，原生日志保留原文。 |
| 常规压缩保留约 20000 最近 token，预留 16384，支持 summary/update、分支摘要和被切开的回合前缀摘要；文件读/改路径单独跟踪。 | `buildCompactionPrompt()` 提供完整常规 SUMMARIZATION_PROMPT。主集成仅替换原生摘要请求最后用户指令；实际阈值、保留尾部和工具配对由 DSH 管理，不声称沿用 Pi 数值。 |
| 不完整 length/error 摘要拒绝持久化；compaction 取消或失败不应提交半份 checkpoint。 | Pi 压缩以原生追加记录整批提交；可选离开分支摘要失败、取消或未完整生成时拒绝创建新分支。同会话树与压缩控制已接入；持久化使用 DSH 日志，不读写原厂 Pi JSONL 文件。 |

以上有源码依据的行为材料完整保留在 `sources/packages/agent/`、`sources/packages/coding-agent/src/core/` 与官方 docs 快照。常规摘要导出逐字提取原始 `SUMMARIZATION_PROMPT`，不混入 UPDATE_SUMMARIZATION_PROMPT 或分支摘要；Pi 摘要专用系统句子保留在 utils.ts 来源，原生 DSH 的摘要请求身份与消息装配仍由宿主负责。

`branches.mjs` 与 Pi 分支面板使用原生 `sessionController.list/inspect/fork`，显示原生 parentSessionId 关系并打开所选会话。只能从已完成的 `turn/end` 位置分叉，要求当前会话空闲且 journal head 仍与界面观察一致；每个分支有不同 sessionId，父分支原始 journal 保留。各分支共享工作目录，切换或分叉不会撤销文件修改。它承载可用的分支导航，不等同 Pi `navigateTree` 在同一个 JSONL 树中移动 leaf。

分叉位置随实际完成点列表校正：所选回合不再可用时回到「当前已完成位置」，不会提交隐藏的旧位置。分支创建成功但原生列表刷新失败时保留已创建 ID，提供直接打开入口，并暂停重复创建；明确刷新列表后可再次创建。导航仍调用原生 `uiWorkspace.openSession`。

“附带离开分支摘要”默认关闭（`withSummary:false`）。显式开启且所选位置之后存在材料时，使用当前会话已配置的模型/API，以来源中的完整 `BRANCH_SUMMARY_PROMPT` 和 `SUMMARIZATION_SYSTEM_PROMPT` 摘要被离开的后缀。只收集用户文本、可见 assistant 文本和工具调用/结果，不收集隐藏 reasoning；工具结果每条最多 2000 字符，按事件片段从最新往前选取，文本预算 100000 字符。读/修改路径分别跟踪，修改过的路径不再列为只读路径。错误、取消、max-tokens、空或超过 32000 字符的摘要拒绝分叉；摘要期间源会话 head 或运行状态变化也拒绝提交。

新摘要及继承摘要组成最多 60000 字符的派生 context capsule，保存在 `DSH_HOME/omaa/pi-branch-context` 的会话 hash 文件，通过原生 `systemPrompt.context` 与单次变量替换装配和入账，原话的花括号保持字面量，冷启动可读取。继续分叉会继承已有 capsule，即使没有请求新增摘要；没有新摘要时不额外调用模型。该资料是有界派生上下文，父 journal 与原生 fork 种子仍是历史依据，不是第二份执行日志。原生 fork 已完成但 capsule 保存失败时返回包含新 sessionId 的明确错误，允许从原生分支列表打开，不能假称跨文件/会话原子提交。

Pi 模型/provider 登录、账号、安装器、独立代理 RPC、原厂 JSONL 树、TUI 和 npm/git package 安装不在预设内启动；本地目录 package 仅发现技能和模板，用户指定的执行白名单才允许启动扩展回调 guest。模型/API、工具循环、权限、会话、日志、停止/恢复都使用 DSH。常规 `/compact` 与可选 branch summary 各自使用准确原文，不能混称同一个摘要分支。

本地扩展的接口和每次请求的上下文见 [Pi 本地扩展](pi-extensions.md)。
