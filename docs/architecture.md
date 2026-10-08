# OMAA 架构

OMAA 是 DSH 预设与界面插件。`cordis.patch.yml` 由构建脚本生成，注册五个宿主 `agent-preset`；DSH 负责模型/API、原生 agent loop、权限、工具执行、停止、会话与文件交付。

## 提示词与工具

`src/presets/<product>/` 保存固定版本原文、来源元数据和适配模块。`src/preset-agent.mjs` 把 `buildPrompt({tools,cwd,platform,mode})` 的结果装配到宿主 persona section；实际工具 schema 来自 DSH，模块按已注册能力生成说明，不沿用其它产品的旧参数。

五预设有各自文本与工具组合。Pi 保持精简文件/shell 与图片能力，也复用宿主技能目录与读取工具；其余按需复用搜索、任务、提问、网络、后台 job 和子代理。文件指令和技能由原生 DSH 服务承载。Plan 使用原生 `planMode` 服务与批准流程，Ask 由实际工具 guard 限定读取/搜索/提问，不靠提示词声称只读。

Plan/Ask 的 shell 使用 preset 私有 `sandboxPolicy` 代理，逐调用只收紧为 read-only；公开 loader Group 等待 provider 后再加载会提前捕获策略的 native fs/shell，标准 DSH 的策略不变。delegation Group 隔离 `workflowEngine`：独立 DSH 使用 native PTC engine，兼容 OMD 存在时使用其 composition descriptor，禁用 native engine/tool 参考行，只启用 OMD host engine/tool，复用全局唯一 `omd-workflow` provider。disabled 参考行仅保留宿主依赖解析，避免 Symbol/WeakMap 身份分裂；不运行第二 engine。结果/子代理/作业仍属于同一宿主。ZCode 随包 SDK 技能和原生历史回查仅薄适配，Pro/Ultra 激活作为持续工作流授权时仍加载 `zcode-workflows`。Grok monitor 与 scheduler 分别观察/调用原生 jobs 与 schedule 服务，不建第二调度或执行层。

Pi 模板、SYSTEM/APPEND、规则和技能目录由实际 filesystem 与原生 provider 加载；根选择扩展显式依赖固定宿主内部 `roots`，升级须核对该边界。默认逐条 steer 通过公开 pre-step mutable message payload 与 Inbox splice 保留原 id/source，仅调整本步接受顺序；不替换 loop。宿主在 pre-step 之前先 claim/assemble，取消在该更早边界的差异见 Pi 文档。

可靠的产品摘要指令仅替换 DSH 原生 `purpose: compaction` 请求的最后一条摘要指令。压缩引擎、模型请求、事务、工具配对和日志仍属于 DSH；没有可靠摘要原文的产品沿用宿主默认指令。Cursor 的 MDC 附加与按需规则工具见 [规则契约](products/cursor-rules.md)。

## 状态与恢复

消息、工具、计划模式和执行恢复使用 DSH 日志。宿主当前拒绝未知自定义 journal 事件，主题、基础增强和执行/Ask 偏好由 `src/host/preferences.mjs` 在 `DSH_HOME/omaa/preferences/` 按会话原子保存，文件名使用会话 ID 的 hash；多个 profile 不互相覆盖其它会话的记录。高级工作方式复用 OMD 的模式持久化，不另存一份 OMAA 高级状态或执行历史。

Cursor 文件检查点补充保存受支持文件工具调用前后的实际字节与边界信息，位于 `DSH_HOME/omaa/checkpoints`。查看复用原生变更信息，恢复要求会话空闲并核对文件/目录身份、当前内容及冲突，保留消息；shell 任意副作用不视为可恢复快照。限制见 [检查点契约](products/checkpoints.md)。

Pi 分支服务只调用原生 `sessionController.list/inspect/fork`，原生 parent 关系和不同 sessionId 构成界面树；可选位置限定为已完成回合，空闲及 journal head 检查保护分叉。所有分支共享目录，切换不回滚文件。`withSummary` 默认关闭；开启后用当前会话模型/API及完整 Pi 分支摘要指令总结所选位置之后的后缀，隐藏 reasoning 不入材料，工具结果限 2000 字符、尾部材料预算 100000 字符。不完整摘要拒绝创建分支。有界 60000 字符的继承/新增摘要 capsule 位于 `DSH_HOME/omaa/pi-branch-context`，通过原生 `systemPrompt.context` 入账并可冷读取；源 journal 保留，没有第二执行日志或 Pi 树运行时。具体差异见 [Pi 契约](products/pi.md)。

`/omaa/api/session` 提供带宿主认证的设置与运行状态，`/omaa/api/checkpoints` 提供 Cursor 检查点查看/恢复。前端订阅真实 mounted 会话和宿主列表/原生计划变化，打开设置时刷新，POST 返回实际保存状态；没有独立轮询中枢。

读取、保存及读取失败期间禁用会话设置；保存中的下拉显示本次选择，失败回退已确认值。保存期间到达的原生状态变化在保存后合并刷新，回包保留当前运行和模式等待限制。同一会话切换预设时立即清除旧设置；窄设置栏按自身宽度换行。

`/omaa/api/git-review` 提供 Codex 四种 Git 比较与明确文件/块操作；实际 native subprocess/sandbox、字面路径、内容 revision 和当前工作模式共同保护写入。Last turn 复用原生 Review，行反馈走原生会话提交，不造审阅日志或另一个执行器。

`/omaa/api/pi-branches` 复用宿主认证，GET 读取当前 Pi 原生分支族与完成点，POST 在 revision 核对后调用原生 fork；分支面板打开同一宿主会话。摘要 checkbox 默认未选，不会因查看或切换分支自动调用模型。

## 外观与增强

五主题通过共享 appearance coordinator 独占前台颜色与布局，释放时恢复此前外观。Cursor 桌面 Agent 布局与 CLI 证据分开；颜色继承当前 DSH 是适配选择。主题、模型、预设和增强开关分别负责自己的状态。

草稿进入正式会话时，目标列表明确显示相同预设才会在读取期间保留已确认的主题；目标 API 返回后立即使用目标主题。未挂载会话、普通 DSH、不同或缺失预设及读取失败会释放主题。旧设置不会挂接到新会话，读取期间不可修改会话设置；紧凑入口仅按目标原生预设显示产品名。

兼容 OMD 通过共享 installer 把 CodeGraph 与 Computer Use 注册到当前预设 scope，构成默认关闭的基础增强。开启条件与执行 guard 同时检查；Pi 普通会话还隐藏并拒绝 delegation/jobs，开启增强后才提供工作流支持。基础增强不强制编排。

`/omaa/api/session` 的 `enhancementWorkMode` 接受 `off | pro | ultracode`。非 `off` 自动开启增强；关闭增强同时把高级方式设为 `off`。OMAA 通过兼容 facade 复用 OMD 同一 `UltracodeControl`、持久化和全局 hooks，保持当前 provider/model，并选择该模型最高可用 reasoning effort。Ask/Plan 不启动 Pro/Ultra 工作流，回到执行模式可继续已保存方式。产品仍使用自己的提示词、压缩与工具循环；不额外挂载 OMD 主代理或 CC persona、ContextPipeline、Dream、todo/verify/BT 链。

composition 在 profile 加载时选择。OMD 动态安装或卸载后须重载 profile；不承诺无重载热换 engine。接线状态与验收范围见 [增强边界](omd-enhancement-boundary.md) 和 [验证记录](verification.md)。

## 兼容包生产

OMAA 自身继续使用 `scripts/package.mjs` 从同一源码绑定 rc.2／alpha.1 宿主。配对 OMD `0.10.0` 已把 OMAA 薄桥接整合到官方源码；两端固定 commit 各自包含对应宿主的原生 SDK、工厂、vendor 和锁文件。`scripts/package-omd-compat.mjs` 根据审定规则选择 `integrated-baseline` 模式，核对完整 manifest、发行白名单及全部文件哈希，保留原客户端、`lib/host`、`vendor` 和发行说明，仅追加兼容来源记录。输入与输出的 OMD 完整版本必须相同。历史 tag 的 overlay 模式仍按原补丁和来源哈希核验。

构建输出包含宿主前缀版本、tgz、SHA256 与来源元数据，供 GitHub Releases 附件交付。未知上游版本、漂移内容或补丁冲突均明确停止；不从另一个工作区整包复制，也不自动修改用户安装。审阅来源并更新对应规则后才接受新基线。

## 维护上游版本

1. 固定新 commit，更新对应 `sources` 原文及来源元数据，先阅读逐项差异与许可；不从网络自动覆盖正在使用的提示词。
2. 只在对应产品的 `prompt.mjs` 修改真实宿主不兼容处，同步该产品适配记录。`pnpm prompts:inspect` 输出完整审阅文本与 hash 到本地 `.cache/prompt-review`；这份工具清单是审阅样例，运行时始终取实际注册 schema。
3. 按变化复查已安装 DSH 的实际请求和相关行为；涉及 UI 再看截图与点击。宿主升级先核对工具、scope、会话及压缩契约，再同步 package 版本与清单。模型/API 配置由宿主维护。

无项目草稿进入原生工作区时，由兼容 OMD 调用 OMAA 的设置迁移接口。后端从源会话读取增强、主题和工作模式，先启用增强再调用既有 OMD Pro/Ultra 模型控制器，并恢复 Ask/Plan；原生模型、权限与草稿提交仍由宿主负责。仅空闲未发送的目标可接收迁移；目标手动修改后拒绝覆盖，失败保留源草稿，重复请求通过私有迁移收据识别。新建草稿也可继承已有源会话设置，不复制消息或执行日志。

OMD 人格／初始身份兼容与工具增强独立。每次装配读取同一 OMD `personalityText(config)`，只替换五套默认 persona 的开头身份，不复制设置或修改原厂来源文件；字符串按字面插入。空身份移除预设内建身份文字，子代理保留各自职责。Pi 自定义 SYSTEM.md 原文保留，OMD 身份放在它之前；未安装 OMD 时保持独立预设原文。原生系统消息位置和更新生命周期继续由 DSH 管理。


ZCode TypeScript 工作流的纯编译器由固定原文在 build 时生成。脚本先经原厂 analyze/typecheck、site table、schema 合成和 lowering，再由隔离 native ptcRuntime 运行；没有原厂引擎、provider 或独立模型循环。Actor 以 native continuable childId 持久存在，重复 ask 排队且每次声明实际 submit_result，成功结果和关联回合结束共同决定提交。原生 descriptor 保存 literal persona，长期装配 hook 保证冷恢复；脚本正常返回会取消遗留 ask 并等待 drain。背景执行和停止通过原生 jobs，父权限/Ask/Plan 变化会主动取消。定义档的 facade marker 决定 TypeScript 或既有 JavaScript 路由；运行图是独立显示投影，不冒充原厂 journal/replay；修订缓存的执行事实见下文。

## OMAA 0.9.0 的 ZCode 运行投影与修订

OMAA 0.9.0 用严格固定 41 文件 closure 派生 `lib/zcode-run-projection.mjs`，仅包含三类 bounds 显示投影与原 workflowRuns reducer。真实 native site×ordinal、phase/birth、child accepted receipt、队列/dispatch/settled 事实由 `run-progress.mjs` 注入；未知 provider backoff 不推断。原版 Timeline/RunPhaseList 的 37 份 UI 代码、样式和中英 locale 完整保留，不是 ReactFlow，也不运行原 engine。单个 native graph fixture 与 alpha Web 点击已通过；不据此宣称所有平台或完整原厂运行态等价。

OMAA 0.9.0 接入 `amend_workflow`：run 必须属于当前 session；先编译及核对归属／可读缓存，再停止并等待前驱结算，创建带 `resumedFrom`／`supersededBy` 的 successor。原 `ImportedActorState`、`ImportedWorldQueue`、persona/hash 算法从固定原文构建；完整结果存 native immutable attachment，metadata 保存连续 Actor 完成前缀、native canonical event offset、world 准入序号及关闭事实，独立于有界 display。首次 live 分歧通过专用 continuity provider 继承旧 Actor 的精确 completed event prefix；native manager 追加新 descriptor、真实 parent、当前委派权限并负责冷恢复。失败 ask 封住可导入前缀，不阻断脚本 catch 后的后续 live ask。

`run_id + max_concurrency` 调整同一 live run，上限仅限制 live ask，Actor FIFO 与 native 容量分别生效；降低上限不取消已接受任务。重复 world 按准入顺序匹配，cached world.run 不再次执行效果；live world.run 关闭导入窗口，native 文件观察只记 dispatch，缺少真实 effect 分类的工具在进入管线时保守关闭。这不冒充原厂精确按入参的 mutating-tool 分类。在飞半转录续跑、same-run journal/replay 与原模型 pin 继承仍有差异；新任务使用当前 DSH 模型/API。旧 0.8 metadata 没有任务缓存，预检拒绝并保留旧 run。单个原生 fixture 已核对重启、复用、分歧前缀／poison 排除、world 顺序／不重放、失败后继续、跨 session 拒绝、cold continuation 与并发升降。

图 CSS 与消息桥由 `scripts/build-zcode-graph-ui-assets.mjs` 可重复生成：默认 `--check` 只读核对，`--write` 重建，`--output-dir DIR` 可先生成到审阅目录。它固定核对 40 份原源与 commit、37 个 UI 代码依赖、原 Tailwind utility/wf 样式和实际消费 locale 键，明确保留 DSH 颜色/reset/Intl 桥。Tailwind 4.2.2 与 PostCSS 8.5.6 仅为锁定构建依赖，运行包没有这些依赖。主 build 使用相同 check 入口，三份产物已逐字节复现。
