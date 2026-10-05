# Pi Coding Agent 预设来源与适配

固定官方来源：[earendil-works/pi v1.0.2，cd32f7725fdbddbaecdff5b1e68491563394e0ca](https://github.com/earendil-works/pi/tree/cd32f7725fdbddbaecdff5b1e68491563394e0ca)，MIT。`src/presets/pi/source.json` 保存 34 个完整来源文件、逐文件 SHA-256、原始路径、固定 URL、许可、工具映射及逐项适配；LICENSE 原文完整保留。

## 生效文本

真实主提示词来源是 [`core/system-prompt.ts`](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/coding-agent/src/core/system-prompt.ts)，不是营销介绍或泄露样本。其默认结构为 preamble → tools → rules → docs → 可选 addendum/project_context/skills → cwd → 自定义 sections。工具 snippets 与 guidelines 来自具体 read/bash/edit/write 定义，原版默认四个工具，并按已选工具去重规则。before_agent_start 可改变结构化 sections；section delta 记入 transcript，完整强制 prompt 是不同分支。

`prompt.mjs` 的 `buildPrompt({tools,cwd,platform,mode})` 保留完整默认 preamble、工具段组织、read/write 规则、简洁及清楚路径原句、完整文档阅读要求和 cwd 结构。默认组合保留 read/bash/edit/write 四核心，额外提供宿主原生 read_image 和 skill 作为实际能力；Windows 用真实 pwsh 时沿用上游 PowerShell 规则。额外图片工具只在注册 read_image 时明确说明其真实分工。项目 AGENTS.md/CLAUDE.md 和技能正文由 DSH 原生上下文及技能服务承载。

`resources.mjs` 补齐 Pi 约定目录。`cwd/.pi/SYSTEM.md` 优先于用户 `~/.pi/agent/SYSTEM.md`，非空时替换完整默认 persona 段并保留 cwd；`APPEND_SYSTEM.md` 按同一优先级装配 `<addendum>`，不混淆替换与追加。用户目录可由原版 `PI_CODING_AGENT_DIR` 或插件 `agentDir` 指定。文件由宿主 `ctx.fs` 读取；宿主权限、工具 schema、环境与其他系统段仍有效。用户目录规则按原版 `AGENTS.override.md` → `AGENTS.md` → `AGENTS.MD` → `CLAUDE.md` → `CLAUDE.MD` 取第一份，保持原版 project_context 标题和标签。工作区规则继续由宿主注入一次；宿主按仓库根和触及文件发现规则，可同时装配不同候选及 local 文件，尚不等同 Pi 从文件系统根到 cwd 的单候选继承与嵌套 worktree shadow 规则。

用户和项目 `prompts/` 直接子级的 `.md` 成为提示模板；同名按固定 CLI 的 PackageManager 默认优先级选择项目资源，再选择用户资源（同层 first-wins）。上游完整参数语法包括 `$1`、`$@`、`$ARGUMENTS`、`${1:-default}`、`${@:-default}`、`${@:N}`、`${@:N:L}`，引号参数和替换值不递归展开。普通输入、steer 和 queue 在原生 pre-step 中只展开一次，保留用户消息 id/source。合法宿主命令名在首次资源装配后进入原生斜杠命令列表；其他 Pi 文件名仍可直接输入展开。已有宿主命令优先。每次装配重新读取资源，文件修改在后续请求生效；单文件 64 KiB、资源 256 KiB、128 个模板和单目录 512 个条目有明确上限。

技能目录遵循固定 CLI 的默认入口：当前 cwd 的 `.pi/skills`，从 cwd 向最近含 `.git` 的目录（含该目录）逐层发现 `.agents/skills`；没有仓库则到文件系统根。`.pi/skills` **不向祖先继承**。项目 `.pi` 优先于项目 `.agents`，同类祖先靠近 cwd 的优先；项目默认资源优先于用户 `~/.pi/agent/skills` 和 `~/.agents/skills`。依据固定 [package-manager.ts](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/coding-agent/src/core/package-manager.ts) 的 collectAncestorAgentsSkillDirs/addAutoDiscoveredResources/resourcePrecedenceRank，而非单独调用 loadSkills(includeDefaults:true) 的顺序。

目录选择经 native FS 有界递归：128 个目录、12 层、2048 个条目，祖先最多 64 层；遇到 `SKILL.md` 即把目录视为一个 bundle，不继续钻进其支持文件。Pi 位置仅根级平铺 Markdown 生效，`.agents` 位置的非根级平铺 Markdown 生效；跳过 dot 目录和 node_modules。所选路径交给同一个 `FileSystemSkillProvider` 的原生 scan/get/watch/缓存/正文加载和资源基址，不另写技能解析器。`roots` 在宿主 d.ts 中是 **private**，这里是固定 0.2.1-alpha.1 的内部扩展，不宣称公共 API；升级须核对该契约。符号链接与特殊文件沿用实际 native FS/provider 行为。宿主默认 `.dsh/skills` 仍保留。

技能发现使用与固定上游相同的 `ignore@7.0.8`，按每个扫描目录的 `.gitignore` → `.ignore` → `.fdignore` 顺序叠加，保留原版 `prefixIgnorePattern`、根相对路径、目录末尾斜杠及 negation 语义。规则仅从各技能资源根向内继承，项目仓库上层 `.gitignore` 不自动影响这些独立资源根；被忽略的目录不进入，被忽略的 `SKILL.md` 不截断后续递归。忽略文件同样走 native FS；权限、取消和预算失败向宿主传播，不绕过权限读取。单份规则 64 KiB、一次选择合计 256 KiB。原生 scan 的输入及结果均限制在选择集合内，避免解析被忽略 bundle 的正文；实际 YAML 解析、正文、资源基址仍由原生 provider 负责。

原生 watcher 继续处理技能和目录变动；它不观察 ignore 文件。Pi 每次系统资源装配比较已发现规则、配置和显式资源路径的 native opaque version（含缺失文件），变动才使该 Pi provider 注册失效并重新发现；规则检查仅 stat，未变化时不重扫技能树、不重读正文。项目信任弹窗属于 Pi 运行时，本预设继续执行宿主已有权限。

`resource-paths.mjs` 读取项目 `cwd/.pi/settings.json` 和用户 `agentDir/settings.json` 的 `skills`、`prompts`、`packages`，其余 Pi 模型、shell、TUI 设置不接管 DSH。精确路径以所属配置目录为基址，支持绝对路径与 `~`；显式技能目录使用 Pi 的根级平铺 Markdown / 深层 SKILL bundle 规则，模板目录允许递归。与默认目录同名时，项目显式设置 → 项目自动目录 → 用户显式设置 → 用户自动目录 → package 的顺序生效。settings 中的 pattern 用于筛选已发现的资源，不自动展开成新资源入口，符合固定 PackageManager 的 plain/pattern 分工。

`packages` 支持已经存在的本地目录，字符串形式或含 `source` 的对象形式；相对 source 同样从配置目录解析，项目声明按解析后的绝对路径覆盖用户的同包声明。包内有 `package.json.pi` 时按其 `skills` / `prompts` 声明发现，没有 manifest 则使用 `skills/` / `prompts/` 约定目录。manifest 的 `*` / `?` glob 经 native FS 有界枚举；dot 路径只能显式列出。manifest 及 package filter 使用固定上游的 `minimatch@10.2.6`，按相对路径、文件名、绝对路径及 SKILL 父目录匹配；`!pattern` 排除、`+path` 精确恢复、`-path` 最终精确排除，filter 不暴露 manifest 已排除的资源。`skills:[]` 或 `prompts:[]` 关闭对应包资源。

例如，项目 `.pi/settings.json` 可写 `{"skills":["../shared-skills"],"prompts":["../review-prompts"],"packages":["../team-pi-package"]}`；原有本地资源无需复制到 OMAA 或安装另一个客户端。所有配置、manifest、资源与规则仍通过 native FS，第三方 JS/TS extension 完全不载入、不执行，也不自动安装包依赖。npm/git/URL 来源明确诊断并跳过；`autoload:false` 跨作用域 delta 尚不支持，涉及同一包的声明整体跳过。原厂扩展 API、主题包、gallery、installer 不在这个资源适配内。原生技能 provider 要求 Markdown；其他显式技能文件格式会诊断并跳过。配置每份 64 KiB、合计 256 KiB；两类配置路径合计 256 条，单列表 128 条；glob/模板扫描限 128 个目录、12 层、2048 个条目，模板单目录仍限 512 条。

DSH edit 为单次 `file_path/old_string/new_string/replace_all`，Pi v1.0.2 原版为 `path/edits[{oldText,newText}]`，多处不重叠修改一次匹配原始文件。四条 edit guidelines 因这一真实差异原位改成宿主单次替换规则，保留唯一匹配、避免大块无关文本及合并相近修改的要求。Pi 的 `PI_*` 会话环境变量说明未装配，因为宿主没有提供它们；原版 2000 行/50KB 截断与临时全文文件也不作为 DSH 的承诺。

文档段原始内容完整保留，将安装目录 getReadmePath/getDocsPath/getExamplesPath 替换为固定 commit 的官方 raw URL；有命令或 web_fetch 工具时才装配，并说明如何取回文档。工具真实 schema 始终由 DSH 提供，主提示词不伪造参数或返回值。

## 行为与宿主边界

| 产品事实及依据 | DSH 承载与状态 |
| --- | --- |
| 默认核心只有 read/bash/edit/write；README 明确跳过默认 plan mode/subagents。 | 保持精简默认组合。宿主已有权限仍执行；不把宿主计划、子代理或权限机制称为 Pi 原生。 |
| `steer()` 在当前 assistant turn 完成后排入下一次请求，`followUp()` 仅在 agent 原本将停止时开始下一请求。默认两队列均 one-at-a-time，可改 all。依据 agent.ts 与 agent-loop.ts。 | 原生 steer 在整批工具后投递，queue 下一 turn。Pi 默认逐条 steer：公开 pre-step 在原生入账前同步只保留首条 typed steer，其余以原 id/source 经 native Inbox splice 排回；不处理通知或 queue，不替换 loop/伪造事件。组件可配置 all，尚无原厂两队列 UI 控件。已在实际安装中核对两条 steer 分别进入后续请求且各入账一次。宿主先 claim/assemble 再进入 hook，故此更早边界的取消/失败不能承诺原厂剩余输入完全保全；不保证单工具之间插话。 |
| 固定版本工具执行默认 parallel，支持 sequential；两种执行均完成整批后再 drain steer。 | DSH 的执行策略为实际行为依据，不替换 agent loop。**“steer 跳过尚未执行工具”不是这个固定 commit 的契约**。 |
| Extensions 有 input、before_agent_start、context/context_with_system、工具拦截及可请求继续的生命周期事件；before_agent_start 支持结构化系统选项。 | 原生 DSH 插件承担可实现的生命周期扩展。未移植 Pi 扩展 API、运行时或自定义 TUI，不能把 Pi npm 包当可直接运行的宿主插件。 |
| context_with_system 要求首个系统消息位置不变；sections 支持增量更新。 | 宿主系统消息/事件记录负责。预设只供文本段，不建立平行日志或重排消息。 |
| 常规压缩保留约 20000 最近 token，预留 16384，支持 summary/update、分支摘要和被切开的回合前缀摘要；文件读/改路径单独跟踪。 | `buildCompactionPrompt()` 提供完整常规 SUMMARIZATION_PROMPT。主集成仅替换原生摘要请求最后用户指令；实际阈值、保留尾部和工具配对由 DSH 管理，不声称沿用 Pi 数值。 |
| 不完整 length/error 摘要拒绝持久化；compaction 取消或失败不应提交半份 checkpoint。 | 常规压缩依赖原生 DSH 事务；可选离开分支摘要失败、取消或未完整生成时拒绝创建新分支。未移植 Pi JSONL 树存储、扩展自定义压缩或原厂队列恢复。 |

以上有源码依据的行为材料完整保留在 `sources/packages/agent/`、`sources/packages/coding-agent/src/core/` 与官方 docs 快照。常规摘要导出逐字提取原始 `SUMMARIZATION_PROMPT`，不混入 UPDATE_SUMMARIZATION_PROMPT 或分支摘要；Pi 摘要专用系统句子保留在 utils.ts 来源，原生 DSH 的摘要请求身份与消息装配仍由宿主负责。

`branches.mjs` 与 Pi 分支面板使用原生 `sessionController.list/inspect/fork`，显示原生 parentSessionId 关系并打开所选会话。只能从已完成的 `turn/end` 位置分叉，要求当前会话空闲且 journal head 仍与界面观察一致；每个分支有不同 sessionId，父分支原始 journal 保留。各分支共享工作目录，切换或分叉不会撤销文件修改。它承载可用的分支导航，不等同 Pi `navigateTree` 在同一个 JSONL 树中移动 leaf。

分叉位置随实际完成点列表校正：所选回合不再可用时回到「当前已完成位置」，不会提交隐藏的旧位置。分支创建成功但原生列表刷新失败时保留已创建 ID，提供直接打开入口，并暂停重复创建；明确刷新列表后可再次创建。导航仍调用原生 `uiWorkspace.openSession`。

“附带离开分支摘要”默认关闭（`withSummary:false`）。显式开启且所选位置之后存在材料时，使用当前会话已配置的模型/API，以来源中的完整 `BRANCH_SUMMARY_PROMPT` 和 `SUMMARIZATION_SYSTEM_PROMPT` 摘要被离开的后缀。只收集用户文本、可见 assistant 文本和工具调用/结果，不收集隐藏 reasoning；工具结果每条最多 2000 字符，按事件片段从最新往前选取，文本预算 100000 字符。读/修改路径分别跟踪，修改过的路径不再列为只读路径。错误、取消、max-tokens、空或超过 32000 字符的摘要拒绝分叉；摘要期间源会话 head 或运行状态变化也拒绝提交。

新摘要及继承摘要组成最多 60000 字符的派生 context capsule，保存在 `DSH_HOME/omaa/pi-branch-context` 的会话 hash 文件，通过原生 `systemPrompt.context` 与单次变量替换装配和入账，原话的花括号保持字面量，冷启动可读取。继续分叉会继承已有 capsule，即使没有请求新增摘要；没有新摘要时不额外调用模型。该资料是有界派生上下文，父 journal 与原生 fork 种子仍是历史依据，不是第二份执行日志。原生 fork 已完成但 capsule 保存失败时返回包含新 sessionId 的明确错误，允许从原生分支列表打开，不能假称跨文件/会话原子提交。

Pi 模型/provider 登录、账号、安装器、独立 RPC、原厂 JSONL 树、TUI、npm/git package 安装和扩展运行时不在预设内启动；本地目录 package 仅发现技能和模板。模型/API、工具循环、权限、会话、日志、停止/恢复都使用 DSH。常规 `/compact` 与可选 branch summary 各自使用准确原文，不能混称同一个摘要分支。完整原生体验的队列、扩展和分支差异按实际接线验收，不能由一份短 prompt 视为完成。

## 核验范围

已核对固定 system-prompt.ts、agent-loop.ts 与 edit.ts 和官方 raw 网络字节一致；所有保存文件有 hash。已直接运行 buildPrompt 检查无工具、四核心、Windows pwsh、可选图片及额外计划工具输入分支；Pi 不会因为宿主注册额外工具就追加计划/子代理纪律。摘要可由原始常量逐字重生。未实测的队列、扩展和客户端行为没有计为通过。

`test/installed-behaviors.test.mjs` 用隔离 DSH_HOME、真实原版 CLI 安装包与 loopback 模型，验证 Pi 手动 `/compact` 的实际 provider 最后一条用户指令逐字等于完整 SUMMARIZATION_PROMPT；原生压缩事务成功闭合，保留系统消息与 turn 边界，并在后续请求读取 checkpoint。两项真实 read 工具的批次及 steer/queue 投递也通过实际请求和原生事件核对。它们验证宿主执行语义，不证明 Pi TUI、扩展包或全部会话分支等价。

`test/installed-pi-resources.test.mjs` 用原版 CLI 隔离安装与 loopback 实际请求核对项目/用户 SYSTEM 和 APPEND 优先级与回退、默认完整 persona 恢复、模板参数及只展开一次、原生模板命令、steer/queue 输入、默认 CLI project-first 模板/技能碰撞和懒加载正文；全局 override 规则按优先级选中，工作区原生规则仅出现一次；普通 DSH 不注入 Pi 资源。深层 SKILL 正文、祖先 `.agents` 发现、git root 截止、不继承祖先 `.pi` 及默认 CLI 项目优先也通过实际 provider 请求与工具返回核对。技能目录表由原生 tool-skill 的 user/system-reminder 投递，未另造系统提示词或会话事件。

`test/pi-skill-discovery.test.mjs` 覆盖三种 ignore 文件叠加、negation、不能越过已忽略父目录、双星号、子目录规则范围、被忽略 SKILL 后继续扫描、bundle 停止、平铺 Markdown 差异和独立资源根隔离；规则刷新检查使用 native 文件版本，只做 stat，并检查新增、编辑、删除与取消。本地 settings、manifest glob、package filter、默认约定目录、项目覆盖同一用户包、远端跳过与配置更新也有针对性回归。

同一 `installed-pi-resources` 回归已核对实际请求中的 ignore 隐藏/否定恢复、外部规则修改后的原生替换目录表、settings 和 manifest 包技能的懒加载目录与正文、两类本地模板的实际展开及原生命令注册。包中故意会抛错的 extension 文件未被载入执行；这不代表完整 Pi 扩展 API 已适配。

`test/installed-pi-steering.test.mjs` 核对默认两条 typed steer 分别进入请求、保留原身份、各入账一次并排空原生待队列，未增加第二日志或队列执行器。

`test/installed-pi-branches.test.mjs` 已核对真实安装的前缀分叉、仅所选位置之后的摘要材料、当前模型、源 journal 不变、摘要冷读取及原话中的字面量花括号。`test/pi-branches-browser.test.mjs` 实点分叉、原生 child 导航、保留父分支和切回，默认关闭摘要不额外调用模型。主模型看过分支树实拍。脚本化 provider 验证接线与生命周期，不证明所有真实模型都能生成同等质量的摘要。
