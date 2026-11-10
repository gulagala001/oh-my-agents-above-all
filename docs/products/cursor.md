# Cursor 深度预设

本预设移植 Cursor coding agent 的工作方式到 DSH 的模型、API、工具循环与会话。研究范围包含 Agent、计划、规则、工具和交互，不以 CLI 未登录首屏代替整个产品。已固定完整公开提示词样本与官方行为依据；`prompt.mjs` 已实现完整样本的条件工具适配与模式文本。

## 提示词与许可来源

完整样本保存在 `src/presets/cursor/sources/cursor-agent-sample.md`，来自用户指定的 [asgeirtj/system_prompts_leaks](https://github.com/asgeirtj/system_prompts_leaks/blob/38499c52b4c3f290e40843cb9514df84d9d23d4c/Cursor/cursor.md)，固定 commit `38499c52b4c3f290e40843cb9514df84d9d23d4c`，Git blob `f6951fa520e3e37f0ce09ab47ee564818769d034`，18,113 字节。没有把样本拆成几段泛化提示词。

样本仓库 LICENSE 是 CC0-1.0，原文和 README 已保存；这只记录该仓库的声明，不能据此认定仓库作者有权许可 Cursor 原产品文本。原始发布者、捕获构建版本和真实性未独立确认。样本可作为文本比较与适配来源，不能单独证明 Cursor 现有能力。所有文件 SHA-256、来源和边界见 `sources/source.json`。

## 官方产品行为依据

- [Agent Overview](https://cursor.com/docs/agent/overview)：coding agent 将模型、指令和工具结合；支持文件、命令、网络、浏览器等工具。文件 checkpoint 与会话消息分开；队列和 steering 在不同产品表面有不同快捷键，应复用 DSH 的实际控件和安全边界。
- [Plan Mode](https://cursor.com/docs/agent/plan-mode)：先研究和澄清、生成可审阅 Markdown 计划，再由用户切换到构建。简单任务仍可直接 Agent；不能把每次复杂任务都改成强制审批。
- [Rules](https://cursor.com/docs/rules)：`.cursor/rules/*.mdc` 用 `alwaysApply`、`description`、`globs` 选择总是、相关、文件匹配或手动附加；普通 `.md` 不是 MDC 规则。嵌套 AGENTS.md 遵循目录作用域，深层优先。规则系统与自动记忆不同。
- [Search](https://cursor.com/docs/agent/tools/search)：具体符号优先精确查找；专有 Instant Grep 的索引实现不能由 rg 别名复制。Explore 用独立上下文汇总宽范围探索，是否委派须由 DSH 实际子代理契约与用户指令决定。

## 样本职责与真实不适配点

| 原样本段落 | 应保留的工作方式 | 宿主适配点 |
| --- | --- | --- |
| 身份、`system-communication`、用户查询 | 以当前用户任务为目标、附件作为按需上下文 | 去除 Cursor IDE 身份事实、`{model_name}`/`<user_query>` 等未提供占位，不能声称有编辑器游标和 edit history |
| `tone_and_style`、`making_code_changes`、禁止思考写进代码 | 专业直接交流，改前读文件，修自己引入的问题，注释解释真实意图 | 用真实读写工具名替换 Read；文件链接服从 DSH 渲染 |
| `tool_calling` 和各文件工具 | 优先专门文件工具，准确标准调用，不把命令输出当聊天通道 | 若 DSH 只有 shell，就保留实际回退方式；不禁用唯一可用文件读写能力 |
| `citing_code` | 引用确切已有代码位置，提出的新代码用语言代码块 | `startLine:endLine:filepath` 需要宿主渲染实现；否则原位用可点击文件链接和标准代码块 |
| `terminal_files_information`、Shell、AwaitShell | 先检查已有长进程、独立操作并行、持续观察真实后台结果 | Cursor terminals 文本目录与 stateful shell 不适用于无此功能的 DSH；以宿主 job id、cwd 和输出契约替换 |
| `task_management` | 复杂任务有可见进度，完成前检查实际任务状态 | todo_write/TodoWrite 的名字、字段和状态以真实 schema 为准 |
| `mcp_file_system` | 调用前核对真实 schema、按需发现工具 | 不伪造 descriptor filesystem、CallMcpTool 或 mcp_auth；只用 DSH 已连接工具 |
| `mode_selection`、SwitchMode | 在设计、实现和排障之间选择合适工作方式 | Plan/Ask 是真实权限或模式状态，工具必须守边界；没有 SwitchMode 就不宣称已切换 |
| SemanticSearch、GenerateImage、Task 等 | 按问题选择工具、必要探索与真实视觉验证 | 专有语义搜索、图像生成和官方子代理类型不能空壳改名；工具存在才保留说明 |
| Git、skills、agent transcripts | 安全的版本控制、按需技能与历史查阅 | 保留当前 DSH 提供的账号工具和会话读取，不硬编码 gh、JSONL 位置或编造 UUID 入口 |

## 已接入能力与边界

scoped MDC 规则已在真实安装的 DSH 验证：首个模型请求即包含 alwaysApply 和用户 `@manual` 明确选择的规则；成功 `read` 后下一请求加入匹配文件的 glob 规则；Agent Requested 先只列说明，调用原生注册的 `cursor_rule` 后下一请求才加入正文。`{{literal}}` 原文不会插值。入口为 `test/installed-behaviors.test.mjs`，不是只模拟提示词字符串的单元测试。

Agent/Ask/Plan 权限、计划 Markdown 审阅、文件差异 review 和 [checkpoint 恢复](#cursor-文件-checkpoints) 使用真实 DSH 状态与工具。原生 `session/prompt` 的 steer/queue 已在 Pi 预设的两项 read 工具真实批次中验证：steer 在两项结果之后投递到当前 turn，queue 在该 turn 完成后开始下一 turn。当前源码另已接入下述真实队列控件；原厂各界面的专属快捷键不由这个 API 验证推定等价。

当前不宣称复制专有 Instant Grep、代码索引/语义检索、Composer 模型、编辑器光标/打开文件、云代理/项目协调器或 Cursor 账号服务。用户上下文只取 DSH 已提供的工作目录、附件与明确授权内容。计划生成不能隐藏修改代码，checkpoint 恢复应明确只恢复已记录文件变化并保留消息。

## 审阅、预览和继续修改

[官方审阅流程](https://cursor.com/learn/reviewing-testing) 包含观察修改、停止并调整方向，以及任务完成后的 Review / Find Issues。OMAA 的检查点面板已直接打开 DSH 原生回合审阅器，提供文件选择、行号、并排/统一比较和长行折行；不再另画简化文本 diff。文件旁的「预览当前文件」打开原生文档预览，比较记录与当前文件明确分开；恢复删除的新文件不提供误导性的预览按钮。

Cursor 输入工具栏还提供紧凑的「回合 N 改动 · N 个文件」入口，打开同一 DSH 原生审阅资源。它仅在当前会话设置已确认且停止运行后，显示最新仍有原生比较的回合；文件数来自该回合实际 `summary.files`，不代表实时编辑器或全分支累计改动。读取期间显示读取状态，失败可重新读取；无可用比较、运行中、切换产品或会话时隐藏，并取消迟到的读取结果。

检查点的「查找本回合问题」与「查找此文件问题」进入实际只读 Ask 模式，把所选回合、原生事件位置及文件目标经原生会话提交给当前模型。检查读取当前文件并参考本回合记录，明确文件可能已经变化；不直接把旧 diff 当作当前内容。检查后保持 Ask，用户切回执行模式可继续修复，停止/继续仍用宿主入口。迟到或跨会话回调拒绝提交，模式未真正生效时不发起检查。

输入工具栏的「代码审阅」打开独立审阅面板；预设设置也提供同一入口，检查点旁的「批注本回合」直接选择对应记录。面板支持全部未提交、未暂存、已暂存、单次提交、分支已提交和会话回合六种范围。全部未提交比较 HEAD 与当前工作区，包含未跟踪文件；分支范围比较所选基准的 merge-base 与 HEAD，明确不混入尚未提交的内容。分支与提交引用可自行指定，文件列表、实际增删行数和已阅标记随比较版本更新。 已暂存、单次提交与分支范围的类型和大小读取所选 Git 对象，当前工作区文件不会覆盖历史判断；固定提交的比较和已保存行批注可在工作区继续编辑后使用。合并提交以第一父提交为比较基准。

差异显示使用 DSH `0.2.1-rc.2` 的实际 `FileDiff` 组件与样式，保留原生语法高亮、并排／统一视图、同步滚动、折行和行数上限；适配层仅为行号增加键盘可访问的批注按钮。固定片段、包哈希和 MIT 许可保存在 `src/client/sources/dsh-rc2/`，构建校验原文后生成适配模块。没有把自行绘制的 diff 称为 Cursor 原厂组件。

点击原／新文件行号可保存批注。记录包含工作目录、比较范围与版本、文件、侧别、行号和原行文本，保存在 `DSH_HOME/omaa/cursor-reviews/`，刷新、会话切换和宿主冷重启后可继续。跨文件批注可编辑、删除、标为解决或重新打开；已发送记录保留历史，解决由用户确认。原生回合差异仍受宿主保留期限制，冷重启后可能无法重新打开；此时保留批注的确切原位置与行文本，不用当前文件伪造旧比较。最多保存 200 条记录，其中待发送最多 50 条、单条 4000 字节、单批 60000 字节；并发窗口用版本校验拒绝覆盖。

「批量反馈并继续修改」在用户明确点击后切入实际执行模式，通过原生会话一次提交全部待发送批注。接纳前先保存原生请求编号，断线重试沿用该编号并核对真实队列／会话记录；刷新只恢复记录，不自动启动任务。「已发送」表示宿主接纳，不代表模型已经修复。范围／文件的 Find Issues 则切入真实 Ask 模式只读检查。运行中或计划模式待处理时不接纳新的审阅任务。

输入框上方使用 DSH rc.2 的真实 QueueDock，支持排队消息上移／下移、保留附件编辑、移除、插话及立即发送。插话在当前工具批次结束后送达；立即发送取消当前回合并保留其他队列项。等待回答或权限时，队列仍显示在原生面板上方；消息使用原生持久 inbox，重启可恢复，并发旧编辑会被拒绝。控件使用可键盘访问的原生按钮，未复制原厂各界面的专用快捷键。

「本机编辑器」可选择已检测到的 Cursor、Visual Studio Code 或 Insiders，选择保存在当前浏览器。文件头的「在编辑器打开」打开当前文件；点击比较行号后选择「在编辑器定位此行」，或点击已保存批注的「在编辑器定位」，把核对后的文件、行与列交给编辑器。采用 [VS Code 的 `--goto` 契约](https://code.visualstudio.com/docs/configure/command-line) 和固定参数，不执行可编辑命令。

批注保存行及周围上下文，宿主冷重启或文件在前方新增行后，可按唯一匹配重新定位；已删除、改写或有多个匹配的位置会提示重新选择。旧批注没有上下文时需要原比较仍可读取。原行无法映射时不会改跳邻近行，也不打开伪造的历史文件。只打开当前会话工作目录内、经宿主本机映射核验的 UTF-8 普通文件，拒绝链接和超过 2 MiB 的文件。未安装编辑器时保留原生预览并给出安装／命令行入口提示；SSH、WSL 或无桌面的 Linux 不提供本机定位。macOS／Linux 从标准安装位置或绝对 PATH 检测，Windows 使用已知应用安装目录。界面回执表示启动请求已接纳，不能检查用户编辑器中尚未保存的缓冲区。Find Issues 使用 DSH 当前模型与真实读取工具，缺陷发现质量依赖实际模型与材料，没有接入 Cursor 专有审阅服务。

## 原文适配记录

运行文本以完整样本作底稿，保留原句、英语和组织方式，只原位修正工具或宿主事实不兼容处。每项修改应记录旧文、新文、理由并验证最终装配，样本本身保持不变。官方资料的新能力可指导功能实现，不倒推样本真实捕获版本。

`adaptation.json` 记录适配职责与真实契约理由，`adaptation.diff` 是指定工具配置下实际生成文本对原文的差异。Cursor 没有可靠完整摘要提示词来源，`buildCompactionPrompt()` 返回 `undefined`，沿用 DSH 原生压缩。模式提示词按当前真实状态和已注册 enter/exit 工具生成，不把文本声明当作模式执行。

真实原生 `/compact` 已验证 Cursor 保留固定 DSH 版本的完整摘要指令，完成同一 native `compaction/start` → `summary` → `end` 事务，保留首个系统消息与原生 turn 边界，后续模型请求可读取生成的 checkpoint。其余有完整公开来源的预设按各自摘要文本路由；不会为 Cursor 编写无来源的“原生摘要”。

内置主题现在标为「Cursor · Agent 对话」，依据 [官方 Agents Window](https://cursor.com/docs/agent/agents-window) 与 [桌面公开演示](https://cursor.com/product) 适配左会话导航、中心对话和工具摘要、底部输入及模式/模型控件、右侧文件/计划预览的关系，采用比例字体、紧凑工具行与圆角输入。DSH 保留自己的真实节点、停止、模式和文件工具；这里的尺寸是适配参数，未声称取得闭源界面的像素或主题 token。

[官方 themes and appearance](https://cursor.com/help/customization/themes) 明确 IDE 支持用户选择明暗主题和跟随 OS，并区分了 IDE 的扩展/主题操作与 Agents Window。OMAA 的颜色继续沿用当前 DSH 明暗主题，这是适配选择，不能外推为 Agents Window 自动继承 IDE 配色。来源元数据在 `sources/cursor/agent-window.json`；CLI 首屏证据单独保留在 `sources/cursor/provenance.json`，不再作为桌面主题的依据。已有会话的内部主题 id `cursor-cli` 保留兼容，名称与实际布局已改为 Agent 对话。

## Cursor 项目规则

`src/cursor-rules.mjs` 实际读取当前工作区 `.cursor/rules/**/*.mdc` 和旧根 `.cursorrules`，仅由 Cursor composition 挂载。模型、工具循环、会话仍由 DSH 承载。

字段优先级按 [Cursor 官方 Rules 文档](https://cursor.com/docs/rules)（2026-10-05 核对）：`alwaysApply:true` 自动包含；否则 globs 只匹配实际在上下文的文件；无 globs、有 description 的规则先提供描述供 Agent 选择；两者都无则必须明确提名。`.md` 不作为 MDC 规则。本文实现不访问 Cursor 全局/团队规则或账户。

```js
const { automatic, available } = await loadCursorRules({
  cwd: '/absolute/workspace',
  paths: ['src/component.tsx'],
  requested: ['architecture'],
});
```

automatic 元素 `{name,content,reason}` 的 reason 为 alwaysApply/glob/requested；available 只含 Agent Requested 的 `{name,description}`，不会暴露尚未选择的规则正文。嵌套名称为相对 `.cursor/rules` 的路径去掉 `.mdc`；明确请求接受 name、filename、`@name`，basename 只有唯一时可用。旧 `.cursorrules` 按纯文本总是应用。

frontmatter 使用 js-yaml 的 JSON_SCHEMA；支持 boolean、quoted/plain descriptions、多行 description、globs 字符串/数组。多个 glob 按逗号分隔，同时保留 `{a,b}` 和字符类内的逗号；匹配采用 Node >=24.9.0 `path.matchesGlob`。兼容 Cursor 常见未加引号的 `**/*.ts` glob；不执行 YAML tag、命令或规则正文中的 `@file` 引用。

插件在实际 `system-prompt/assemble` middleware 重新读取文件并准备该 agent 的 WeakMap 缓存，然后原位替换本次 assembly 中 `omaa:cursor-rules` 的 text；保留其它 section 与 `interpolate:false`，规则里的 `{{...}}` 仍是字面内容。DSH 顺序是 inbox claimed → assemble → pre-step，section.text 又在 middleware 之前求值；因此不能仅靠 pre-step 或缓存更新，首请求 always/manual 以及 read 后紧接的请求都直接使用本次返回的规则文本。`agent/inbox/claimed` 只记录真实用户提名，供同一次 assemble 消费；不新增 user 消息注入层、不改已有工具 schema。规则编辑、删除在下一次请求装配时反映。

成功的 tools/result 对 read/edit/write 捕获真实 arguments.file_path，保存最近 256 条路径；按工作区规范化后触发 glob，不扫描源文件树。外部路径和解析到工作区外的 symlink 路径不会触发。用户明确的 `@ruleName` 可加载手动规则；`cursor_rule({name})` 只接受已发现名称，工具结果仅确认“下一 step 请求”，下次装配才应用正文。该工具也可供 Agent 从描述目录选择规则。

当前 DSH 文件上传 attachment 只有存储 ID、显示名、bytes，显示名明确不是路径；它不会被猜成工作区文件。只有实际 path-backed 文件 part 明确提供 file_path 时才可作为路径输入，普通上传需后续真实 read/edit/write 对工作区文件操作才能触发对应 globs。没有读取或推测 IDE 开放文件。

只扫描 rules 子树，最多 512 个目录项、128 条规则、12 层、单文件 32KiB、读入总量 256KiB、最终规则 context 64KiB。拒绝 `.cursor`/rules/规则文件 symlink，拒绝硬链接与非普通文件；开启文件时使用 O_NOFOLLOW、检查 inode/dev 和真实工作区范围，定长读取防止文件增长绕过预算。不存在规则目录是正常空结果；解析错误、权限/读取失败、超预算则抛出错误，插件会清除本次规则缓存并明确显示“规则未应用”，不会带旧正文冒充成功。

针对性测试：`node --test test/cursor-rules.test.mjs`。覆盖字段优先级、根/嵌套 glob、YAML/旧规则、手动选择、修改刷新、literal 插值保护、描述正文隔离、scope 隔离、路径逃逸、符号/硬链接、预算及失败提示；必要时序回归按真实 assemble-before-pre-step 顺序核验首请求 always/用户 manual、read 后下一请求 glob 和当前请求更新。宿主真实 composition 接线和 provider payload 另由主代理验证。

## Cursor 文件 checkpoints

检查点面板提供「刷新检查点」入口。读取失败时明确显示失败并允许重试；刷新中暂停操作，成功后保留仍有效的回合选择。文件预览继续打开当前会话的原生文件资源，不替换回合比较或停止/恢复语义。

`src/checkpoints.mjs` 在 DSH 原生工具和会话上提供有界文件恢复：捕获 Cursor 会话实际 `write`/`edit` 触及的工作区 UTF-8 文本文件，按原生 turn/callId 关联首个修改前和最后一个工具执行后的精确字节。恢复只修改这些文件，保留用户消息、工具结果和其他原生会话事件。模块不创建 Git 仓库、仓库索引、全仓扫描、另一份执行历史或自定义 Session 事件。

### 原生来源与必要补充

核对版本：`@deepseek-ai/dsh-workspace-changes@0.2.1-alpha.1`，来自 [官方 DSH 仓库](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/deliverables/workspace-changes)，MIT。本次安装包 `lib/index.js` SHA-256 为 `ec7bde02794f32faa654c796144deab8c3bda40229019db49a96fb51d220690f`；实际类型在同包 `lib/types/types.d.ts`，包版本由 lockfile 固定。

原生 `workspaceChanges` 只有 `summary(sessionId, seq)` 和 `diff(sessionId, seq, index, signal)`；`workspace/changes` 事件只存 turn。TurnRecorder 私有目录保存 Git 快照或文件副本，公开 diff 返回三行上下文 hunks 与 before/after 是否存在，不公开原始字节、完整哈希或 restore。`compareText()` 会补终止换行，不能从 hunks 精确反推 BOM、CRLF、终止换行或任意原始字节。私有 Git 对象目录不属于仓库对象库，summary 中的 tree ID 也不等于可从仓库直接读取的完整快照。

原生 diff review 继续通过上述服务读取，每 turn 使用最新宣布 seq，沿用原生对 shell 改动、忽略文件、二进制、oversized 等的覆盖与限制；Session dispose 或宿主重启后，旧原生 diff sidecar 不再可用。OMAA 仅为可恢复的文件补充精确字节和小元数据，以支持冷恢复；不扫描、读取或依赖原生私有临时目录。

### 捕获与保存

`tools/execute` around hook 在原生 body 开始前读取 baseline，await 原生 next 结束后，在 finally 读取实际 after。固定 DSH 的 `dispatchToolBody()` 明确等待已启动 body quiescence 后才将结果标为 ABORTED，因此取消/失败但已发生写入也会按实际 after 记录，不把 error 视为“没有改动”。连续调用同一 turn 的同一文件保留首个 baseline 和最新 after；两个调用之间出现不匹配内容则标为 intervening change，拒绝自动恢复。

字节不做字符串或换行归一化。合法 UTF-8 的 BOM、CRLF、无终止换行、空文件均按 SHA-256 内容寻址保存；带 NUL 或非法 UTF-8 视为二进制，明确不提供恢复。每文件最多 2 MiB，每 turn 最多 64 个文件，最多保留 32 turns，引用内容合计最多 64 MiB；超限和不完整捕获标为不可恢复。元数据上限 512 KiB。只清理本 Session 私有 content 目录中不再引用的哈希内容，不清理工作区文件。

目录由主集成提供的 `ctx.omaa.checkpointDirectory` 指定，预期位于 `DSH_HOME/omaa/checkpoints`。每 Session 使用 ID 的 SHA-256 子目录，内含一个 `checkpoint.json` 和 content-addressed `content/`；私有目录与内容链接拒绝符号链接。元数据绑定 Session ID、canonical workspace、目录身份、turn、相对路径、callIds、before/after 内容 hash、字节数、权限及文件/父目录身份。保存使用临时文件再 rename；没有增加原生会话事件。

### 恢复契约

接口由用户明确点击触发，不是模型工具，也不绕过原生工具 sandbox/批准能力。恢复要求 Session idle；每个被选文件必须属于该 checkpoint 捕获范围。

恢复先对整组选中文件预检：当前 bytes、mode、inode 和父目录身份必须匹配记录的 after，baseline 内容文件必须通过 hash/size 校验，目标与父目录不得为 symlink，目标不得为 hardlink，路径必须在绑定工作区内。已有手工修改、同内容但 inode 被替换、目录替换、根目录替换、损坏或越界元数据都拒绝写入。之后每个文件临写前再次核对；完整 bytes 通过相邻临时文件恢复，保留原 mode；原本不存在的新文件在确认 after 完全匹配后删除；原本存在但 after 不存在的文件通过排他的创建恢复，不覆盖新出现的文件。

成功返回 `ok/restored/changed/notRestored/conflicts/partial`。全组预检不通过时没有文件发生恢复；途中失败则返回实际已完成恢复、确已执行文件变更、剩余文件和具体错误，不声称跨文件原子性。已确认恢复记录支持幂等重试。恢复旧 turn 时当前文件仍须匹配那个 turn 的 after；后续工具或手工修改不会被强行覆盖。

当前覆盖是实际 `write`/`edit` 触及的工作区文本文件。shell-only 文件变更、工作区外路径、二进制、超大文件、额外目录结构和未捕获文件不提供此精确恢复能力，仍可由原生 review 显示其实际可用 diff。删除的父目录不会由文件恢复伪造回来。

### 主集成接口

```js
const store = createCheckpointStore(directory, { workspaceChanges, isIdle });
store.install(cursorScope);
await store.inspect(session.id, session, { turn, seq, index, signal });
await store.restore(session.id, session, { turn, paths, signal });
```

`apply(ctx)` 使用 `ctx.omaa.checkpoints ??=` 只初始化共享 共享接口 一次，每个 Cursor scope 仅安装自身的 hook/系统段，重复 install 同一 scope 不重复注册。`inspect` 组合精确字节记录和原生 review；给 seq/index 时只通过原生 diff 服务读取比较，不用存储恢复逻辑替代原生 review。默认缺少 isIdle 时拒绝恢复，主 API 仍需先 resolveAgent 并检查 idle、认证和明确恢复请求。

恢复后 metadata 更新 `restoredAt/lastRestoredPaths`。scope 的 `deployment:cursor-restored-files` 系统段 order 15 注入实际事实：用户已恢复哪些文件、会话消息仍保留、早前 assistant 结论可能描述旧内容、后续编辑前重新读取。路径用字面 JSON 与 XML 转义，冷启动 assembly 前按需加载元数据；没有伪造用户消息或重排首个系统消息，原生 filesystem observation cache 没有被篡改。

### 并发边界与核验

模块内部按 Session 和文件串行化捕获/恢复。portable Node filesystem 没有原始 bytes 的 compare-and-swap，也无法强制不合作外部进程遵守锁；最后内容检查与 rename/unlink 系统调用之间仍存在很短的外部竞态窗口。DSH `writeText` 的 version guard 会进行文本归一化，不能用于精确 bytes 恢复，因此没有虚构原子 CAS。跨文件恢复的非原子性通过结构化实际结果处理；内部竞态细节留在开发说明，用户界面只展示实际恢复、冲突或失败。

针对性 Node 文件执行覆盖精确字节与 mode 往返、冷加载、新文件删除、多次修改和 late-cancel after、整组预检、手工内容/inode/父目录/工作区替换、symlink/hardlink、二进制/超限/越界、坏 hash/外来元数据、部分恢复、私有 content 链接防越界及 Cursor scope 隔离。入口：`node --test test/checkpoints.test.mjs`。这些直接文件测试不替代主集成的原生 DSH capture、API/按钮、冷恢复和冲突往返；后者由主模型完成重要验证。
