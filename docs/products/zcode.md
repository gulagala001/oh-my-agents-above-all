# ZCode 深度预设

此预设把固定官方 ZCode 的完整主行为段落与工具使用习惯适配到 DSH。模型/API、工具执行、权限和会话继续由 DSH 承载；不运行官方客户端、不另建模型循环或账户系统。入口为 `src/presets/zcode/prompt.mjs` 的 `product` 与 `buildPrompt({tools,cwd,platform,mode})`，宿主装配及重要行为验证由主代理接线。

## 固定来源与完整装配

官方 [zai-org/ZCode](https://github.com/zai-org/ZCode)，commit `29628c9acdb81b703bbd4080c207a0e7ce5e276e`，根应用版本 3.14.3、CLI core 0.16.9，Apache-2.0。不是泄露样本。来源原文、路径、链接、逐文件 SHA256 和 bytes 保存在 `src/presets/zcode/sources/source.json`；完整 LICENSE 在 `sources/upstream/LICENSE`，未把本地维护约定复制进发行资料。

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

`create_workflow` 接入固定原厂 TypeScript compiler、facade、静态分析、类型结果 schema 合成与 lowering。保留的 69 份纯来源文件与 TypeScript 5.9.3 的 57 份虚拟 ES2022 声明参与构建；不加载原厂 Actor 引擎、模型供应商或客户端。编译器检查脚本及静态调用点，再将控制流交给原生隔离 PTC。执行权限来自宿主沙箱和子代理委派策略，TypeScript 检查本身不是安全隔离。

`agent(name, persona?)` 返回一个角色 Actor，`await actor.ask<T>(instructions)` 使用原厂合成的结果 schema；同一 Actor 的提问串行排队并复用同一个原生 continuable 子会话，不为每次提问另开上下文。类型化结果必须通过实际 `submit_result` 校验，并等原生工具成功结果、外层调用成功及关联回合完成后提交；无类型参数或 T=string 时返回完成后的助手文字。角色原文保存于原生 descriptor，字面模板字符在子会话冷恢复后仍保留。脚本正常返回后，未完成提问被取消并等待原生资源收束；普通提问失败可以 catch 后继续。后台工作使用实际 native job，父会话切到 Ask/Plan、变更权限或停止作业时取消并 drain 对应子会话。

支持 `phase`、`log`、`report`、`args`，返回原厂静态 graph/causality 数据；报告保留原版 256 项及每项 32 KiB 上限。world-read facade 与 artifact registry 尚未接入，相关调用在执行前诊断。自动专家/planner/critic 生成、同一运行的 graph amend、原厂 workflow 审批/动态图界面与原厂运行日志重放仍有差异。修改正在执行的脚本时先停止实际 job，再按修订脚本启动新 run，原有结果可作为 args 传入，不冒充原位修图或原厂工作流重放。

`read_session_context` 读取用户明确引用的原生 session id，使用公开 `sessionController.inspect`，支持冷历史且不激活/修改原会话。原厂相关度评分、中文 query 拆词、tail/chunk 选择、上下文格式及预算函数来自固定完整 `session-context/read-session-context.ts`，在 build 时仅替换 native message/part 边界并编译，不概括重写算法。读取只收集可见用户/助手文本与实际工具结果，忽略系统注入和思维块；历史内容作为背景材料。默认使用当前已配置 DSH 模型做有界提取，大历史按原策略选择最多五块后合成；提取不可用返回有界原文，标明 fallback。原厂 lite 模型路线改为现有 DSH route，原生日志查询和历史层不替换。

## 桌面交互依据与验证范围

官方 desktop context 明确本地 URL、绝对文件链接及 inline code comment 指令。保存的 UI 来源还包括 plan-guidance renderer、edit diff renderer、ToolSummaryRow、create-workflow renderer 和 WorkflowPermissionBlock，可分别回查计划展示、文件差异、工具折叠/状态和 workflow 审批。它们是固定官方源码证据，**不是本轮截图/点击验收**；预设主题已有独立来源，本任务不修改公共界面。

本轮直接检查所有保存原文的 hash、bytes 和固定 Git blob SHA1，装配及摘要保留；原版 DSH 安装后的工具/模式/停止恢复、原生 `/compact`、Web 主题/模式与共享原生 Plan 流程已核对。新增原生 workflow 的实际结构化子代理返回、随包技能 gate、冷会话回查和只读 Git filter 防护通过 `installed-zcode-tools`。已配置 `space-bunny-free` 完成复杂多文件工程，再以同一原生 session 冷恢复、压缩和追加 `--report` 需求，原合同、测试和冻结材料保留，详见 [复杂工程记录](../verification/configured-project.md)。这些代表性证据不证明全部服务、原厂 workflow facade或模型等价。


## 保存与按名复用工作流

`list_saved_workflows`、`read_saved_workflow`、`save_workflow`、`run_saved_workflow` 接入固定官方保存定义契约。项目档在 `cwd/.zcode/workflows/<name>.dwf.ts`，全局档在 `~/.zcode/workflows/<name>.dwf.ts`；同名项目优先，指定 scope 可查另一档。列表只扫描一层，报告坏文件并保留其余定义。名字按原版 1–64 字符与字符集限制；metadata 是原版严格 YAML block comment，正文逐字保留。原版 codec 与参数校验由固定源码生成，metadata 的 Zod 3 record 调用仅适配到宿主 Zod 4。

保存前要求已实际加载 `zcode-workflows` 技能，且用户主动提出或同意保存。inline body 与 script_path 恰好给一个；后者若是保存定义，剥离旧 metadata，采用本次传入 metadata。`facade="zcode"` 使用真实 TypeScript 编译检查并加入 `// @omaa-workflow-facade: zcode` 注释，默认 `facade="native"` 保持原有 JavaScript 语法检查；保存不执行正文。实际保存由同一个 native `write` 执行，保留原生权限、取消、文件观察与 stale-read/CAS；Ask/Plan 不允许保存或运行。读取和列举允许在只读模式下使用。

按名运行先读取一次对应文件，按原版声明检查全部未知／缺失／类型错误并应用默认值，再按保存的 facade 标记调用 `create_workflow` 或原有 native `workflow`。`string/number/boolean/json` 保留原版语义，number 要求有限值，default 与 caller value 共用检查。模型/API、权限、作业和子会话继续由宿主负责；native JavaScript 路径保留既有 run-start/run-end 记录，TypeScript 路径使用 native jobs 和子会话 journal，不生成原厂第二种执行日志。`phases` 的 title/detail/provider/model 信息用于 native JavaScript；Actor 的阶段写在脚本里，默认继承当前 DSH 模型配置。

每文件最多 256 KiB，每目录及目录表最多 256 条，列表累计读取最多 1 MiB。超过限制明确报告，不把静默截断当完整目录。定义档和原生运行记录是不同资料。world-read/artifact facade、graph amend 和专用保存管理界面仍有差异，不靠文件扩展名宣称等价。

`test/installed-saved-workflows.test.mjs` 已在隔离原版 DSH 的实际工具循环中核对保存门、native write、冷启动列举、坏文件诊断、参数默认／错误、native workflow lifecycle 及 Ask 拒写；没有扩五预设长任务矩阵，也不据此推定真实模型工程质量。

TypeScript Actor 的针对性执行：`test/installed-zcode-actors.test.mjs` 已实际核对 typed 保存/按名运行、两次真实 submit_result、同一原生日志、整宿主重启后的字面角色续问；另一个短用例核对后台运行在父会话切到 Ask 后停止并等待 child drain。已配置 Space Bunny Free 的短任务实际读取一次 fact.txt，再在同一 Actor 中只凭历史返回第二个类型化结果，两次正确；它不证明所有模型或复杂编排质量。
