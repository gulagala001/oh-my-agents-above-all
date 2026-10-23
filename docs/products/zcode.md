# ZCode 深度预设

此预设把固定官方 ZCode 的完整主行为段落与工具使用习惯适配到 DSH。模型/API、工具执行、权限和会话继续由 DSH 承载；不运行官方客户端、不另建模型循环或账户系统。入口为 `src/presets/zcode/prompt.mjs` 的 `product` 与 `buildPrompt({tools,cwd,platform,mode})`，宿主装配及重要行为验证由主代理接线。

## 固定来源与完整装配

官方来源为 [zai-org/ZCode](https://github.com/zai-org/ZCode)，Apache-2.0。当前工作流编译器、运行图、记忆与 profile 解析固定到 3.15.1／`aac4755666d09fdcd70272fcf063c077a639015f`；仍使用的早期提示与 UI 辅助源码保留在 3.14.3／`29628c9acdb81b703bbd4080c207a0e7ce5e276e` 快照中。具体入口、原文、逐文件哈希、许可证及适配说明见 `src/presets/zcode/sources/source.json` 与 `build-inputs.json`。宿主 SDK 精确绑定 DSH `0.2.1-rc.2`。

真正入口是 [context/builder.ts](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/apps/zcode-cli/packages/core/src/context/builder.ts)，不是单独的身份句。默认交互主代理依次构造：CLI prefix、identity、desktop（仅 zcode_desktop surface）、dynamic behavior、session guidance、memory/environment/output style/context management/git；技能、用户与项目资料、日期另作 meta-user attachment。工具说明经模型请求的 tools 字段提供，不镜像到 system。

`sources/upstream/` 原样保存完整 context builders、相关工具描述所在实现、工具动态合同与顺序、compact、子代理、workflow 和桌面 renderer 依据。`sources/main-static-sections.md` 是固定版本默认无 output-style 的五个静态段实际函数输出；包括 prefix/identity/desktop/dynamic/context，7341 字符，不是人工缩写 persona。它不伪造会话生成的 cwd、模型、技能或用户资料；那些完整 builder 原文同样保留。`texts.mjs` 保存这些原函数输出，供适配层原位替换。

## 生效文本的具体适配

`buildPrompt` 保留原生身份、安全段、沟通段顺序、代码风格、实际结果报告、自主推进、讨论与行动的区别以及上下文压缩后继续工作的完整段落。

| 原位置 | DSH 适配 |
| --- | --- |
| identity Harness 的 terminal 展示 | 改为 conversation；文件引用改绝对 Markdown 链接。 |
| identity 的原生 hooks 说明 | 改为实际工具执行结果与用户指令的处理，不宣称官方 hook 输出通道。 |
| desktop Files & URLs | 保留原句组织；标题改 Conversation Context。 |
| desktop Inline Code Comments | 当前全部移除；DSH 尚无已确认 `::code-comment` renderer，不能指导生成不可用指令。 |
| dynamic 授权作用范围 | 保留难撤销/外发操作的授权要求，改清楚同一范围内持续有效的用户授权，避免无故重复确认。 |
| context 用户不能中途回答的假设 | 改为不依赖实时观看；保留已有信息足够时不问空确认。DSH 有真实提问工具时仍能解决决定性信息缺口。 |
| session guidance | 只按 live tools Set 注入实际 read/edit/write/read_image/glob/grep/bash/pwsh/job/todo/ask/skill/subagent/web 名称；不复制官方 schema。 |
| Environment | 只写宿主传入的 cwd/platform/mode，不假造 Git、OS version、模型和账号。 |

工具行为依据包括 Read/Edit/Write 的先读现有内容、精确匹配/局部修改、专用搜索优先、Bash 的用户明确授权后 commit/push、AskUserQuestion 的决定性阻塞边界，以及 Agent 的独立任务与避免重复探索。Read 的图片/视频合一、行号/默认行数、文件状态跟踪、编辑成功后绝不再读等不能直接当作 DSH 合同；只保留真实工具可用的行为。Bash 工作目录持久化、后台退出主动唤醒、timeout 毫秒上限和 shell profile 不照搬。TodoWrite 原生 priority/full-list 字段改遵循宿主 todo_write schema/reset。

## 计划、上下文与工作流边界

原生 [plan-mode-prompts.ts](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/apps/zcode-cli/packages/core/src/tool/handlers/plan-mode-prompts.ts) 包含完整 EnterPlanMode/ExitPlanMode 描述及用户审批流。仅当 live Set 同时包含 `enter_plan_mode/exit_plan_mode` 才装配完整 Enter/Exit 段落，按实际 Set 替换探索/提问/子代理工具名。保留原生进入前用户 consent：通过真实 ask_user_question 征求，用户已经请求/选择 Plan 则不重复问；准确说明 DSH enter 是空参数请求切模式，实际状态在下一次 accepted host step 生效，本身没有第二审批框。退出以 `{plan:string}` 提交完整计划且以 Markdown # 标题开头，真实审阅为 Approve/Keep planning，批准后下一 host step 退出。只读限制由主代理的实际工具 guard 实现，不靠提示词代替。没有工具时不注入；`mode` 本身只显示宿主实际模式，不另建计划引擎。

原生 compact/prompt.ts 有独立 `<analysis>/<summary>` 后台摘要模板，policy/microcompact/rounds 还有自动触发与工具结果整理。`buildCompactionPrompt()` 返回完整默认摘要指令，保留九节、示例、用户原话/安全约束及当前工作连续性。原生 preamble/trailer 中“analysis 块后跟 summary”改为仅 summary；“wrap your analysis...In your analysis process”原位改为检查事实覆盖；示例的 `[Your thought process...]` analysis 块删除。用户没有要求外显思维，摘要仅保存可复核事实和继续工作所需材料。另将原生工具枚举和“工具被拒绝导致失败”措辞改为本次请求直接依据已提供对话。主代理仅在 DSH 唯一 compaction-basic 的 `purpose:'compaction'` 请求末条 user 摘要指令接入，保留事务/工具配对；不注入 main，不接原生 formatter/REPL reset/suppress-followup，也不启动第二条压缩管道。generic Context management 段仍保留原文连续工作要求。

ZCode 的显式 workflow 已接入实际 DSH `workflow-ptc` 和原生子代理/作业生命周期。保留用户明确点名才启动、任务很小也尊重其工具选择的原要求；不在普通任务自动套固定团队。先用真实 `skill` 加载随包的 `zcode-workflows`，工具 guard 根据原生成功调用拒绝未加载时的脚本。脚本支持原生 JavaScript 控制流、独立并发、阶段、日志和 schema 中间结果；子代理以实际 `structured_output` 返回值，父代理收到真实值或失败，不用文本假报成功。子代理身份和证据段按真实读者/工具契约适配。复用 DSH 模型/API、沙箱与唯一执行器，没有另建官方账户或 workflow engine。

`create_workflow` 接入固定原厂 TypeScript compiler、facade、静态分析、类型结果 schema 合成与 lowering。固定的 3.15.1 纯源码与 TypeScript 5.9.3 的虚拟 ES2022 声明参与构建；不加载原厂 Actor 引擎、模型供应商或客户端。编译器检查脚本及静态调用点，再将控制流交给原生隔离 PTC。执行权限来自宿主沙箱和子代理委派策略，TypeScript 检查本身不是安全隔离。

`agent(name, persona?)` 返回一个角色 Actor，`await actor.ask<T>(instructions)` 使用原厂合成的结果 schema；同一 Actor 的提问串行排队并复用同一个原生 continuable 子会话，不为每次提问另开上下文。类型化结果必须通过实际 `submit_result` 校验，并等原生工具成功结果、外层调用成功及关联回合完成后提交；无类型参数或 T=string 时返回完成后的助手文字。角色原文保存于宿主会话中的插件记录，历史 descriptor 仍可读取，字面模板字符在子会话冷恢复后仍保留。脚本正常返回后，未完成提问被取消并等待原生资源收束；普通提问失败可以 catch 后继续。后台工作使用实际 native job，父会话切到 Ask/Plan、变更权限或停止作业时取消并 drain 对应子会话。

支持 `phase`、`log`、`report`、`args`，返回原厂静态 graph/causality 数据；报告保留原版 256 项及每项 32 KiB 上限。0.7 接入文件／Git／world，0.8 接入产物；0.9.0 接入下述运行图和 successor-run Amend。自动专家/planner/critic、原厂审批、完整模型网络状态与运行日志重放仍有差异。

类型化子任务采用固定 3.15.1 的结果归一化与修复规则：原值不符合 schema 且是字符串时仅解码一次 JSON；前三次无效提交允许修复，第四次以 `ValidationFailed` 结束该 ask。模型结束回合但未交结果时，在同一子会话中补问一次，再次漏交返回 `ResultNotSubmitted`。脚本可以 catch 这两类失败并继续其他工作；预算按 ask 重置，补交不重新占用并发名额，也不重置提问预算。同一 Actor 的并发 ask 按 FIFO 处理并保留此前工具结果，独立 Actor 的任务上下文互不混入。

入口仍为加载 `zcode-workflows` 后调用 `create_workflow`／`run_saved_workflow`，工作流卡片和右侧运行面板显示实际修复、补交及回合／工具进度。已完成的补交交换保存原始接纳消息、补交消息与两个原生回合边界；`resume_workflow` 冷恢复不重跑已确认的读文件、修复或补交，`amend_workflow` 后续任务继承完整的已完成前缀。停止补交中的后台作业会中断并收束真实子会话；只有完整核验、仍允许导入的已取消交换能作为修订上下文，结果不明时拒绝自动重跑。

### OMAA 0.7.0 的 world facade

TypeScript 路径支持 `files.glob(pattern)`、`files.read(path)`、`files.grep(pattern, glob?)`，以及 `git.changedFiles(base?)`、`git.diff(base?, path?)`、`git.status()`、`git.log(count?)`、`world.run(cmd, args?, opts?)`。`world.run` 的 cmd 必须是原厂编译器可收集的字面命令；动态命令在编译时诊断，执行时再次核对已声明集合。args 是字符串数组，opts 可指定正整数 `timeoutMs`。命令直接按 argv 执行；非零退出返回 `{exitCode, stdout, stderr}`，超时、驱动失败和超限才抛出错误，脚本可 catch 其 `code`。

来源与适配分开：world 接入新增六份固定原文来自同一 `29628c9`，当时来源清单共 166 份。`scripts/build-zcode-world.mjs` 从 bootstrap 的两个 world-read 实现、纯 WorkflowError、filesystem port、FS matcher/search helpers 与 text-metadata 生成 `lib/zcode-*` 纯模块。参数元数、结果形状、caps、Git argv 和 NUL/porcelain-v2 解析、glob/grep 匹配、编码检测与 BOM/CRLF 处理保留原文算法。读取支持原版 UTF-8、UTF-16LE 及 GB2312/GBK/GB18030 检测，按原算法识别 BOM 并规范文本换行。中文旧编码解码依赖固定 MIT `iconv-lite 0.7.2`。

`world.mjs` 接原生观测与执行端口：文件经 `ctx.fs` 读取，命令经 `ctx.subprocess`、`ctx.sandbox` 和当前 session policy 执行，停止及模式/权限变化沿用 native workflow 生命周期。Git 与 grep 使用只读 sandbox policy；`world.run` 使用当前原生权限。grep 通过对应宿主的公开 `resolveRgPath` 解析官方 bundled ripgrep，包括桌面 asar/unpacked 路径，不要求用户安装系统 `rg`。这里不运行原厂 NodeFs adapter、Actor engine、账户或第二套执行循环。

原版限制明确拒绝而不截断成功结果：glob 最多 2000 文件；grep 最多 2000 条且序列化结果最多 256 KiB；Git diff 最多 512 KiB；Git log 默认 20 条、最多 100 条；world.run 的 stdout/stderr 各最多 256 KiB，默认超时 300000 ms，显式 timeout 不做上限钳制。Git 其它文本输出另受适配端口 4 MiB 限制。参数与越界错误保留 `DriverError`，结果超限使用 `WorldReadCapExceeded`；原生权限与沙箱负责实际访问边界，类型检查和词法路径校验本身不替代隔离。

执行使用 DSH 的工具、权限、作业与子会话生命周期。`resume_workflow` 可在同一 run 上恢复具有预先持久化执行记录的中断任务，复用已确认结果，避免重复发布报告与产物；外部命令结果不明、Actor 尚未确认完成或运行参数不一致时拒绝恢复。修改脚本或参数使用 `amend_workflow` 创建关联后继。

`read_session_context` 读取用户明确引用的原生 session id，使用公开 `sessionController.inspect`，支持冷历史且不激活/修改原会话。原厂相关度评分、中文 query 拆词、tail/chunk 选择、上下文格式及预算函数来自固定完整 `session-context/read-session-context.ts`，在 build 时仅替换 native message/part 边界并编译，不概括重写算法。读取只收集可见用户/助手文本与实际工具结果，忽略系统注入和思维块；历史内容作为背景材料。默认使用当前已配置 DSH 模型做有界提取，大历史按原策略选择最多五块后合成；提取不可用返回有界原文，标明 fallback。原厂 lite 模型路线改为现有 DSH route，原生日志查询和历史层不替换。

## 桌面交互依据与验证范围

官方 desktop context 明确本地 URL、绝对文件链接及 inline code comment 指令。保存的 UI 来源还包括 plan-guidance renderer、edit diff renderer、ToolSummaryRow、create-workflow renderer 和 WorkflowPermissionBlock，可分别回查计划展示、文件差异、工具折叠/状态和 workflow 审批。它们是固定官方源码证据，**来源本身不是截图/点击验收**；预设主题已有独立来源，新增产物界面的实际 Web 验证见下节。

工具与模式的行为以实际宿主为准；完整原厂客户端、云服务、账户体系和内部执行引擎不作为此预设的运行依赖。


## OMAA 0.8.0 的工作流产物

来源仍固定在 ZCode `29628c9`：新增 17 份原始 bytes 快照，包含发布、spec/primary 校验、UI preset 与图表依据。`scripts/build-zcode-artifacts.mjs` 派生七个纯模块，保留原厂 validator、JSON probe、parse/fold/palette 算法；宿主存储、授权和界面接线另作适配，不导入原厂 engine 或第二种 journal。

`await artifact.file(id, path, opts?)` 与 `await artifact.markdown(id, content, opts?)` 发布不可变快照并返回 `{id, version}`。文件过大、越界、缺失、primary 冲突等失败可在脚本中 catch。原厂上限为每 run 32 个 ID、每 ID 16 个成功版本、文件 20 MiB、Markdown 256 KiB；primary 按原版 sticky 规则保留。文件来源受原生 workspace root 与 realpath 边界约束；工作区后续修改不会改变已经发布的内容。

`artifact.chart/table/metrics/board(id, spec)` 是四种顶层声明，随后用 `report(item, id)` 发送对应数据。声明在调用时保存 spec 快照，之后修改调用者对象不会改变它；非法 spec 或报告合同错误会使父 run 失败，不以脚本 catch 掩盖成功。report 使用原厂 JSON 可序列化检查，每 run 最多 256 项、每项 32 KiB；UI 按原厂 fold 处理报告，支持分页与 table key upsert。

原生 Domain `omaa_zcode_workflows` 仅保存小 summary。完整 metadata、成功版本与报告使用 DSH 原生 content-addressed 文件附件 refs，不建立自己的 blob 存储，不改 native journal 格式。读取按当前 session、run、version 授权，跨 session 请求拒绝；整个宿主冷启动后只读查找仍能取回原快照，不激活原会话、不追加 native 事件。文件通过 `fileHostPath` 指向不可变快照，沿用原生 Text/Markdown/文档预览。

独立“工作流产物”右栏可从工具结果“查看产物”进入，按 run 导航并请求真实 native Stop。可见时读取采用单飞、pending 重读及过期响应过滤。Chart 保留完整原厂 ChartView，使用固定 Recharts 3.8.0，以 lazy 和局部错误边界加载；Table/Metrics/Board 使用原 parse/fold/palette 并适配 DSH CSS。0.8.0 的 graph 只展示真实静态 graph/causality JSON；0.9.0 新增下述原版运行投影与 Amend，仍不提供原厂 engine journal/replay。

### OMAA 0.9.0 的原版运行投影与时间线

当前 Timeline 与 WorkflowRunPhaseList 使用固定 3.15.1 的真实组件、样式与中英 locale。`scripts/build-zcode-run-projection.mjs` 校验固定来源并派生运行投影；可见图、Actor 进度、日志与状态来自实际宿主执行记录。

### OMAA 0.9.0 的修订与完成前缀缓存

`amend_workflow` 的 `run_id` 必须属于当前 session。`script` 与 `path` 二选一，均省略则读取归档正文；省略 name、args、max_concurrency 沿用原值。先编译及核对归属／可读缓存，成功后才停止前驱、等待原生任务收束并创建 successor。旧、新运行分别保存 `supersededBy`、`resumedFrom`，右栏提供前次／后续入口。同 run 仅 `run_id + max_concurrency` retune：限制 live ask，同时保留 Actor FIFO；降低上限不取消已有任务。

缓存使用固定原 `ImportedActorState`、`ImportedWorldQueue` 与 persona/hash 函数，按唯一有效 Actor 名、原 persona 及连续 instruction hash 匹配。匿名／改 persona／首次分歧不复活后缀结果。首次 live ask 继承到最后命中任务的精确 native canonical event offset，不拼摘要，不复制旧 run 后半段；native manager 建新 descriptor、真实 parent 与当前权限。每个结果存 native immutable attachment，完整执行事实独立于有界 UI。失败 ask 截断可导入前缀，脚本 catch 后仍能继续 live ask。

world 按 `{op,args}` 与准入出现顺序复用；cached world.run 不再执行效果。live world.run 关闭导入窗口；read/glob/grep/read_image/skill 只记 native dispatch，其它缺少 effect 分类的工具保守关闭，不当作原厂精确按入参分类。关闭后仅 `worldToolCalls === 0` 的缓存 ask 可命中。Actor 的模型选择按角色显式模型、本次运行 `subagent_model`、导入前缀内最后一次实际请求、父会话当前模型的顺序确定；模型与思考档位由原生会话保留，已丢弃后缀中的模型选择不参与恢复。pending ask 会取消，不继承半转录；同 run 恢复按上述持久化记录与已确认结果边界执行。旧 0.8 run 无任务缓存，在停前驱前拒绝 Amend。

未声明 phase 的 ask/world 现已避免把 undefined 带入原生 lossless JSON 传输，修复无 phase 的正常调用失败。

## 保存与按名复用工作流

`list_saved_workflows`、`read_saved_workflow`、`save_workflow`、`run_saved_workflow` 接入固定官方保存定义契约。项目档在 `cwd/.zcode/workflows/<name>.dwf.ts`，全局档在 `~/.zcode/workflows/<name>.dwf.ts`；同名项目优先，指定 scope 可查另一档。列表只扫描一层，报告坏文件并保留其余定义。名字按原版 1–64 字符与字符集限制；metadata 是原版严格 YAML block comment，正文逐字保留。原版 codec 与参数校验由固定源码生成，metadata 的 Zod 3 record 调用仅适配到宿主 Zod 4。

保存前要求已实际加载 `zcode-workflows` 技能，且用户主动提出或同意保存。inline body 与 script_path 恰好给一个；后者若是保存定义，剥离旧 metadata，采用本次传入 metadata。`facade="zcode"` 使用真实 TypeScript 编译检查并加入 `// @omaa-workflow-facade: zcode` 注释，默认 `facade="native"` 保持原有 JavaScript 语法检查；保存不执行正文。实际保存由同一个 native `write` 执行，保留原生权限、取消、文件观察与 stale-read/CAS；Ask/Plan 不允许保存或运行。读取和列举允许在只读模式下使用。

按名运行先读取一次对应文件，按原版声明检查全部未知／缺失／类型错误并应用默认值，再按保存的 facade 标记调用 `create_workflow` 或原有 native `workflow`。`string/number/boolean/json` 保留原版语义，number 要求有限值，default 与 caller value 共用检查。模型/API、权限、作业和子会话继续由宿主负责；native JavaScript 路径保留既有 run-start/run-end 记录，TypeScript 路径使用 native jobs 和子会话 journal，不生成原厂第二种执行日志。`phases` 的 title/detail/provider/model 信息用于 native JavaScript；Actor 的阶段写在脚本里，默认继承当前 DSH 模型配置。

原生保存工具结果卡展示项目／全局来源、源文件与坏定义诊断；读取卡展示实际 facade、声明参数、必填状态和默认值。可勾选并填写 string／number／boolean／json 参数，显式 false、0 和空字符串均保留；未传入的参数由运行时最新定义应用默认值。“读取定义”和“发送运行请求”提交到当前 ZCode 会话，沿用原生工具循环和权限；Ask／Plan 可读，运行按钮仅在执行模式可用。切会话、离开当前对话或会话繁忙时不从旧回调发送；已提交只显示请求已接受，实际 ZCode Actor 运行结果返回后可打开对应运行与产物。原生 JavaScript 运行显示其真实结果和 runId，其运行记录由宿主管理，不提供不适用的 ZCode 产物工作台跳转。旧卡片不保证保存文件仍未改变，后端每次运行重新读取并校验当前定义。

填写界面拒绝非有限数字和超出安全范围的显式整数；校验后的 number／json 字面材料保留在用户请求中，包括 `-0` 和科学计数写法，string／boolean 正常编码。默认值继续省略并交给当前后端定义处理，不扩展任意精度计算契约。六个 ZCode 工具结果卡采用宿主公共槽位的低优先级注册，默认优先级的同名第三方结果卡保持优先；不兼容的结果结构只显示原始文本，不提供读取、运行或产物跳转按钮。

每文件最多 256 KiB，每目录及目录表最多 256 条，列表累计读取最多 1 MiB。超过限制明确报告，不把静默截断当完整目录。定义档和原生运行记录是不同资料。文件/Git/world.run facade 在 OMAA 0.7.0 接入；0.8.0 已接入产物；0.9.0 已接入上述 Amend；完整 journal/replay 和独立保存管理页面仍有差异，不靠文件扩展名宣称等价。

`test/installed-saved-workflows.test.mjs` 已在隔离原版 DSH 的实际工具循环中核对保存门、native write、冷启动列举、坏文件诊断、参数默认／错误、native workflow lifecycle 及 Ask 拒写；没有扩五预设长任务矩阵，也不据此推定真实模型工程质量。

TypeScript Actor 的针对性执行：`test/installed-zcode-actors.test.mjs` 已实际核对 typed 保存/按名运行、两次真实 submit_result、同一原生日志、整宿主重启后的字面角色续问；另一个短用例核对后台运行在父会话切到 Ask 后停止并等待 child drain。已配置 Space Bunny Free 的短任务实际读取一次 fact.txt，再在同一 Actor 中只凭历史返回第二个类型化结果，两次正确；它不证明所有模型或复杂编排质量。

## 当前源码的工作入口

- 保存定义支持编辑、移动、删除和参数填写；提交前重新校验文件版本、会话归属与执行模式。
- `list_workflow_runs`／`get_workflow_run` 查看运行、日志和原始脚本；`fill_workflow` 填入运行中等待的代码空位，先提交有效源码再继续执行。`eval_workflow_snippet` 执行有界片段。
- 在会话设置中显式选择已有项目记忆目录后，读取其 `MEMORY.md`；Agent 目录与 Agent 记忆分别配置。设置不会自动创建目录。
- `zcode_agent` 列出或运行本地 profile；人格原文与工具限制随原生子会话保留。支持的工具、技能、默认／计划权限按实际宿主校验，未知字段会给出诊断。非空 `skills` 在启动前选定受限原生预设，模型只能发现和加载选定的本地技能；原生计划模式、人格原文与父会话指令快照仍生效。宿主重启后，技能目录可只读查看，父会话用原生 `send_message` 继续同一个子会话；技能来源改变时明确拒绝加载，不悄悄换成新正文。`model: provider/model` 与 `thoughtLevel` 选择实际目录中的模型和档位，宿主重启后保留；无效选择明确拒绝，不回退到父模型。`mcpServers` 指定已有的受管 MCP 连接，省略时继承受管目录，`[]` 禁用 MCP。子会话只借用已选工具，结束不会关闭父连接；冷恢复重新核对连接声明与启动工具 schema，发生变化时拒绝续跑。
- `cron_create`／`cron_list`／`cron_update`／`cron_delete` 使用宿主调度；日历规则要求显式时区，有限次数与逻辑日历链保留持久记录。已受理、已派发和任务完成分别记录。
- `list_models` 读取真实模型目录；`todo_read` 读取当前待办；`read_pdf` 使用已有受限转换器读取 PDF。实际权限、工具能力与转换器可用性继续由宿主决定。

### Agent profile 的模型与 MCP 配置

在会话设置中选择已有 Agent 目录，或将定义放在项目 `.zcode/agents/`，再通过 `zcode_agent` 指定 profile。使用 `list_models` 读取宿主的真实 provider/model 与可选档位。例：

```yaml
---
name: researcher
description: Read files and selected MCP notes
model: my-provider/my-model
thoughtLevel: high
tools: Read, mcp__notes__*
disallowedTools: mcp__notes__private_note
mcpServers: [notes]
skills: research-guide
injectAgentsMd: false
---
Read the task materials and report the findings with source references.
```

请替换示例模型、档位、技能与服务器名。非空 `skills` 自动保留 `Skill` 入口，除非明确禁用；工具声明和实际执行使用同一限制。`tools` 支持实际宿主 MCP 公共工具名、`mcp`／`mcp__*` 和 `mcp__服务器名__*`；不从公共工具名反推服务器归属。原厂规则忽略项目 profile 的 `permissionMode`，需要原生计划模式时使用设置中显式选定的 Agent 目录。

MCP 连接由管理员在该 DSH profile 的 Cordis 配置中明确使用 `oh-my-agents-above-all/zcode-owned-mcp-client` 注册，配置字段与同版本 `@deepseek-ai/dsh-mcp-client` 相同。一个服务器只注册一次；启用 ZCode 后其归属服务可用。OMAA 不自动替换其他 MCP 插件，不启动第二条连接。普通文件工具与已选 MCP 工具可以共同使用；未选服务器、非受管 MCP、原生服务器级资源工具及未选服务器的指令不会进入该子会话。计划模式与宿主审批仍能拒绝已声明的工具。

profile 的连接名、公共 schema、声明摘要与工具限制随原生会话保存，原始地址、凭据和进程环境不写入该记录。父会话通过原生 `send_message` 继续同一个子会话；连接消失、声明／schema 改变或注册被替换时拒绝旧绑定，需要重新启动 profile。MCP 记录最大 512 KiB，最多选 64 个服务器；不截断后声称完整。

这些源码增量尚未单独发行；固定安装入口继续对应已发布版本。
