# OMAA 架构

OMAA 是 DSH 预设与界面插件。`cordis.patch.yml` 由构建脚本生成，只注册安装基座。`src/host/preset-activation.mjs` 按设置中的明确选择加载 `src/runtime.mjs`，并通过原生 registry 注册 `src/host/preset-definitions.mjs` 中对应的预设；全部关闭时释放运行服务与前端接管。DSH 负责模型/API、原生 agent loop、权限、工具执行、停止、会话与文件交付。

## 提示词与工具

`src/presets/<product>/` 保存固定版本原文、来源元数据和适配模块。`src/preset-agent.mjs` 把 `buildPrompt({tools,cwd,platform,mode})` 的结果装配到宿主 persona section；实际工具 schema 来自 DSH，模块按已注册能力生成说明，不沿用其它产品的旧参数。

五预设有各自文本与工具组合。Pi 保持精简文件/shell 与图片能力，也复用宿主技能目录与读取工具；其余按需复用搜索、任务、提问、网络、后台 job 和子代理。文件指令和技能由原生 DSH 服务承载。Plan 使用原生 `planMode` 服务与批准流程，Ask 由实际工具 guard 限定读取/搜索/提问，不靠提示词声称只读。

Plan/Ask 的 shell 使用 preset 私有 `sandboxPolicy` 代理，逐调用只收紧为 read-only；公开 loader Group 等待 provider 后再加载会提前捕获策略的 native fs/shell，标准 DSH 的策略不变。delegation Group 隔离 `workflowEngine`：独立 DSH 使用 native PTC engine，兼容 OMD 存在时使用其 composition descriptor，禁用 native engine/tool 参考行，只启用 OMD host engine/tool，复用全局唯一 `omd-workflow` provider。disabled 参考行仅保留宿主依赖解析，避免 Symbol/WeakMap 身份分裂；不运行第二 engine。结果/子代理/作业仍属于同一宿主。ZCode 随包 SDK 技能和原生历史回查仅薄适配，Pro/Ultra 激活作为持续工作流授权时仍加载 `zcode-workflows`。Grok monitor 与 scheduler 分别使用原生 jobs 与 Schedule。`host/grok-schedule-transaction.mjs` 为间隔改动和条件删除加入固定 rc.2 的原生 Schedule FIFO，保留同一 task domain、派发计时器、收据和变更通知。构建及运行时核对固定模块 SHA-256，运行时还核对实际服务和方法身份；这是显式内部接口依赖，不替换共享服务。原生与归属记录分别持久化，写入未知时保留执行隔离。

Pi 模板、SYSTEM/APPEND、规则和技能目录由实际 filesystem 与原生 provider 加载；根选择扩展显式依赖固定宿主内部 `roots`，升级须核对该边界。默认逐条 steer 通过公开 pre-step mutable message payload 与 Inbox splice 保留原 id/source，仅调整本步接受顺序。宿主在 pre-step 之前先 claim/assemble，取消在该更早边界的差异见 Pi 文档。

Pi 的 context/system 回调通过 `host/pi-loop.mjs` 作用于拥有该扩展的原生 Agent。`build-pi-loop.mjs` 校验固定 rc.2 模块、原方法与许可，提取原生 step、turn、请求构造和工具／流辅助代码，增加冻结前的异步投影、消息通知与停止前收尾边界；实际 registry、dispatcher、preparedCall 和日志仍来自原实例。其他预设及共享服务不变。工具列表变化同步记录 native request header，消息改写为单次请求副本；后续请求重新由原始 surface 生成。原厂 Pi 1.1.0 transcript/text helper 原样保留在 `sources/npm-pi-ai/`，同一构建校验哈希后生成纯 helper。普通 context 的系统恢复和 full-system 回调顺序遵循固定 runner。

Pi 自定义条目与尚未投递的消息使用原生 `appendPluginRecord` 的 `plugin:omaa/pi-entry` / `plugin:omaa/pi-pending-message`，原生日志负责冷恢复与分叉继承。非触发消息在整批工具完成后进入 surface；nextTurn 在下一次用户输入接纳，同一消息 ID 的 user/message 是消费凭据。条目不进入模型上下文；自定义消息复用现有原生事件与 Pi 默认 renderer。插件记录允许未知读取器保留并跳过，不能用于改变宿主已存在事件的解释。

Pi 边界草稿使用单个 `plugin:omaa/pi-boundary` 记录保存，原厂纯投影函数由固定 `session-manager.ts`／`messages.ts` 构建为 `lib/pi-session-projection.mjs`。后续 Pi 请求和预览应用该记录，可见消息原生副本仅为带条目 ID 的展示回执。新生命周期在原生 turn 结束／下一次调度判定之间等待，继续使用同一 inbox；续跑的空隐藏调度回执不进入模型。取消撤销未提交批次，并在有界通知后关闭 guest。此持久投影属于 Pi 请求边界，未改写共享原生日志解释器；Pi 同会话树通过 plugin:omaa/pi-tree 原子保存叶子、摘要与标签；压缩从同一有效路径准备材料并沿用 boundary 事务。原始表面与用量不复制，前端树面板展示活动路径。

除 Pi 使用原厂分支投影和扩展控制的独立压缩策略外，可靠的产品摘要指令仅替换 DSH 原生 `purpose: compaction` 请求的最后一条摘要指令。压缩引擎、模型请求、事务、工具配对和日志仍属于 DSH；没有可靠摘要原文的产品沿用宿主默认指令。Cursor 的 MDC 附加与按需规则工具见 [规则契约](products/cursor-rules.md)。

## 状态与恢复

启用列表保存在 `DSH_HOME/omaa/presets.json`，默认为空。`/omaa-base/api/presets` 使用宿主认证、修订号和串行写入；活动任务、排队任务及仍作为宿主默认值的预设不能直接停用。关闭不改写会话或删除个人设置，旧会话再次执行前须重新开启对应预设。设置页调用原生预设菜单的读取动作刷新列表，保留默认值和选择逻辑；其他窗口通过同源通知和重新聚焦读取最新状态。

消息、工具、计划模式和执行恢复使用 DSH 日志。宿主当前拒绝未知自定义 journal 事件，主题、基础增强和执行/Ask 偏好由 `src/host/preferences.mjs` 在 `DSH_HOME/omaa/preferences/` 按会话原子保存，文件名使用会话 ID 的 hash；多个 profile 不互相覆盖其它会话的记录。高级工作方式复用 OMD 的模式持久化，不另存一份 OMAA 高级状态或执行历史。

Cursor 文件检查点补充保存受支持文件工具调用前后的实际字节与边界信息，位于 `DSH_HOME/omaa/checkpoints`。查看复用原生变更信息，恢复要求会话空闲并核对文件/目录身份、当前内容及冲突，保留消息；shell 任意副作用不视为可恢复快照。限制见 [检查点契约](products/checkpoints.md)。

Pi 跨会话分叉服务调用原生 `sessionController.list/inspect/fork`，原生 parent 关系和不同 sessionId 构成界面树；可选位置限定为已完成回合，空闲及 journal head 检查保护分叉。所有分支共享目录，切换不回滚文件。`withSummary` 默认关闭；开启后用当前会话模型/API及完整 Pi 分支摘要指令总结所选位置之后的后缀，隐藏 reasoning 不入材料，工具结果限 2000 字符、尾部材料预算 100000 字符。不完整摘要拒绝创建分支。有界 60000 字符的继承/新增摘要 capsule 位于 `DSH_HOME/omaa/pi-branch-context`，通过原生 `systemPrompt.context` 入账并可冷读取；源 journal 保留，没有第二执行日志。同会话树另用原生插件记录保存导航，不写原厂 JSONL 文件。具体差异见 [Pi 契约](products/pi.md)。

`/omaa/api/session` 提供带宿主认证的设置与运行状态，`/omaa/api/checkpoints` 提供 Cursor 检查点查看/恢复。前端订阅真实 mounted 会话和宿主列表/原生计划变化，打开设置时刷新，POST 返回实际保存状态；没有独立轮询中枢。

读取、保存及读取失败期间禁用会话设置；保存中的下拉显示本次选择，失败回退已确认值。保存期间到达的原生状态变化在保存后合并刷新，回包保留当前运行和模式等待限制。同一会话切换预设时立即清除旧设置；窄设置栏按自身宽度换行。

`/omaa/api/git-review` 提供 Codex 四种 Git 比较与明确文件/块操作；实际 native subprocess/sandbox、字面路径、内容 revision 和当前工作模式共同保护写入。Last turn 复用原生 Review，行反馈走原生会话提交，不造审阅日志或另一个执行器。

`/omaa/api/pi-branches` 复用宿主认证，GET 读取当前 Pi 原生分支族、完成点与同会话树，POST 在 revision 核对后调用原生 fork 或执行同会话 navigate/compact；分支面板打开同一宿主会话。摘要 checkbox 默认未选，不会因查看或切换分支自动调用模型。

ZCode profile 使用原生 continuable 子会话保存人格、模型和工具限制。`profile-mcp.mjs` 在原生创建事件中核对父子归属并记录 MCP 准入，冷恢复重新核对相同声明摘要与公共 schema；`host/zcode-mcp-ownership.mjs` 只借用管理员明确组合的 native client，连接、重连和资源释放仍由父实例负责。工具过滤、MCP 指令范围及普通文件工具共同受宿主 guard 约束。未受管实例不通过名字推定归属，凭据不进入子会话记录。

工作流 Amend／恢复从实际继承前缀内的最后一个 `request/header` 读取模型与思考档位；角色显式选择与本次运行选择仍优先。冷恢复不会被父会话后来选定的模型覆盖，也不采用已丢弃任务后缀的路由。

## 外观与增强

五主题通过共享 appearance coordinator 独占前台颜色与布局，释放时恢复此前外观。Cursor 桌面 Agent 布局与 CLI 证据分开；颜色继承当前 DSH 是适配选择。主题、模型、预设和增强开关分别负责自己的状态。

草稿进入正式会话时，目标列表明确显示相同预设才会在读取期间保留已确认的主题；目标 API 返回后立即使用目标主题。未挂载会话、普通 DSH、不同或缺失预设及读取失败会释放主题。旧设置不会挂接到新会话，读取期间不可修改会话设置；紧凑入口仅按目标原生预设显示产品名。

兼容 OMD 通过共享 installer 把 CodeGraph 与 Computer Use 注册到当前预设 scope，构成默认关闭的基础增强。开启条件与执行 guard 同时检查；Pi 普通会话还隐藏并拒绝 delegation/jobs，开启增强后才提供工作流支持。基础增强不强制编排。

`/omaa/api/session` 的 `enhancementWorkMode` 接受 `off | ultra`，`enhancementWorkSubmode` 接受 `workflow | team | free`。开启 Ultra 需要兼容增强、可用的工作方式接口与空闲执行模式；关闭增强同时关闭高级方式。Ask／Plan 不启动 Ultra；模式与 provider、model 继续沿用宿主会话。运行时行为和使用条件见[兼容说明](compatibility.md)。

composition 在 profile 加载时选择。OMD 动态安装或卸载后须重载 profile；不承诺无重载热换 engine。接线状态见 [增强边界](omd-enhancement-boundary.md) 和 [产品边界](compatibility.md)。

## 分宿主构建

当前 rc.1 与 rc.2 各自使用精确官方 SDK、冻结依赖与宿主组件；包、源码 tag 和生成配置保持完整宿主版本一致。OMD `0.18.4` 由主项目独立构建，OMAA 不生成或修改该包。历史 overlay 和 integrated-baseline 规则仅用于对应旧发行的来源核对。

## 维护上游版本

无项目草稿进入原生工作区时，由兼容 OMD 调用 OMAA 的设置迁移接口。后端从源会话读取增强、主题和工作模式，先启用增强再调用既有 OMD Pro/Ultra 模型控制器，并恢复 Ask/Plan；原生模型、权限与草稿提交仍由宿主负责。仅空闲未发送的目标可接收迁移；目标手动修改后拒绝覆盖，失败保留源草稿，重复请求通过私有迁移收据识别。新建草稿也可继承已有源会话设置，不复制消息或执行日志。

OMD 人格／初始身份兼容与工具增强独立。每次装配读取同一 OMD `personalityText(config)`，只替换五套默认 persona 的开头身份，不复制设置或修改原厂来源文件；字符串按字面插入。空身份移除预设内建身份文字，子代理保留各自职责。Pi 自定义 SYSTEM.md 原文保留，OMD 身份放在它之前；未安装 OMD 时保持独立预设原文。原生系统消息位置和更新生命周期继续由 DSH 管理。


ZCode TypeScript 工作流的纯编译器由固定原文在 build 时生成。脚本先经原厂 analyze/typecheck、site table、schema 合成和 lowering，再由隔离 native ptcRuntime 运行；没有原厂引擎、provider 或独立模型循环。Actor 以 native continuable childId 持久存在，重复 ask 排队且每次声明实际 submit_result，成功结果和关联回合结束共同决定提交。原生 descriptor 保存 literal persona，长期装配 hook 保证冷恢复；脚本正常返回会取消遗留 ask 并等待 drain。背景执行和停止通过原生 jobs，父权限/Ask/Plan 变化会主动取消。定义档的 facade marker 决定 TypeScript 或既有 JavaScript 路由；运行图是独立显示投影，不冒充原厂 journal/replay；修订缓存的执行事实见下文。

`build-zcode-compiler.mjs` 同时从固定 `scheduler-submit.ts`、预算常量与提示辅助函数生成 `zcode-ask-protocol.mjs`。原函数负责单次 JSON 解码、三次修复和一次补交的决定；`actors.mjs` 负责真实工具结果、原生回合收束与接纳收据，成功的原函数判定本身不提交结果。rc.2 仅在成功工具回执上保留 `concludeTurn`，因此预算耗尽返回明确的 `recorded:false` 回执后，以原错误码拒绝 ask。补交仍占同一个并发名额并复用同一个 child，进度交给已有原厂 reducer／组件。

多回合交换使用 v2 accepted-ask／chapter 的有界 continuation 字段，旧 v1 记录仍可读取。最初的 replay carry 引用保持不变；补交的接纳事实追加到候选，完成章记录最终边界。活跃完成、冷 replay 与取消后的 carry 都核对原生消息 ID、发送者、精确补交正文及回合边界，拒绝插入的其他任务；原生准备阶段的 snapshot／catalog／instructions 保留为上下文。回合终止、失败后的前缀封闭、权限和外部效果检查仍由相同路径负责。

## OMAA 0.9.0 的 ZCode 运行投影与修订

OMAA 0.9.0 接入 `amend_workflow`：run 必须属于当前 session；先编译及核对归属／可读缓存，再停止并等待前驱结算，创建带 `resumedFrom`／`supersededBy` 的 successor。原 `ImportedActorState`、`ImportedWorldQueue`、persona/hash 算法从固定原文构建；完整结果存 native immutable attachment，metadata 保存连续 Actor 完成前缀、native canonical event offset、world 准入序号及关闭事实，独立于有界 display。首次 live 分歧通过专用 continuity provider 继承旧 Actor 的精确 completed event prefix；native manager 追加新 descriptor、真实 parent、当前委派权限并负责冷恢复。失败 ask 封住可导入前缀，不阻断脚本 catch 后的后续 live ask。

图 CSS 与消息桥由 `scripts/build-zcode-graph-ui-assets.mjs` 可重复生成：默认 `--check` 只读核对，`--write` 重建，`--output-dir DIR` 可先生成到审阅目录。它固定核对 40 份原源与 commit、37 个 UI 代码依赖、原 Tailwind utility/wf 样式和实际消费 locale 键，明确保留 DSH 颜色/reset/Intl 桥。Tailwind 4.2.2 与 PostCSS 8.5.6 仅为锁定构建依赖，运行包没有这些依赖。主 build 使用相同 check 入口，三份产物已逐字节复现。

ZCode Cron 的定义、累计派发与原生消息收据保存在同一个类型化域。修改沿会话串行队列执行，先接纳已落盘的提醒，再保存待更新状态，最后用完整原生记录比较更新载体。逻辑日历使用稳定 ID 和逐版本 occurrence；规则变更保留旧提示快照及累计次数，未确认状态冷启动后停止继续创建。有限 cron 保留已派发次数并支持降低／提高上限、改为无限循环及向逻辑间隔迁移；旧原生任务转换时核对完整派发历史。定时器、会话恢复、inbox 与模型执行仍全部属于 DSH。日历计算与规则等价比较复用固定原厂源码，Temporal 仅绑定明确时区；生产代码不修改全局时钟或时区。

Grok 文档工具先通过原生 fs 解析、授权与限量读取，再将字节传给专用转换 worker。PDF 文本使用固定 PDFium WASM，BMP／ICO 使用固定 ImageMagick WASM；构建从锁定依赖打包 JS 与 WASM，只降低线性内存最大页数，校验全部引擎输入与许可哈希。没有宿主文件路径、网络 URL、命令或 delegate 输入，ImageMagick 只允许 BMP／ICO／PNG coder。60 秒预算和取消均等待 worker 退出，再返回成功或原生错误。文字沿既有完整内容哈希分页，图片沿既有附件保存与原生工具渲染。构建不下载转换器，执行时不安装或回退到外部命令。

Cursor 审阅的编辑器入口仍在认证 `/omaa/api/cursor-review` 中。`kind=editors` 只列固定编辑器身份，`action=open-editor` 校验真实比较或已保存批注及当前工作目录，经原生 composed filesystem 验证本机路径后，匹配唯一行上下文并以独立 argv 交给已检测的程序。新批注的可选 `anchor` 与原记录原子保存，旧记录可在原比较仍在时补取；不会修改原批注位置。该操作不启动模型、不更改运行模式，连接断开与插件卸载取消尚未发出的请求。
