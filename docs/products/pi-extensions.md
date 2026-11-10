# Pi 本地扩展

[Pi 预设](pi.md) · [架构](../architecture.md)

入口在 **设置 → OMAA → Pi 本地扩展**：加入你明确授权的 TS/JS 文件后，在 Pi 会话里使用它的事件和斜杠命令。

## 用户指定的本地扩展

`extensions.mjs`、`extensions/guest.mjs` 与 `extensions/pi-api.mjs` 已实现扩展 factory/回调桥。默认白名单为空；全局设置「Oh My Agents Above All」中的「Pi 本地扩展」仅保存用户明确填写的绝对 TS/JS 文件路径，不自动运行 `.pi`、package manifest 或扫描目录里发现的扩展。配置使用 revision 冲突检查，运行中的 Pi 任务拒绝切换；「清空并停用」清除白名单。当前上限为 32 个文件，每个入口最多 256 KiB。配置位于 `DSH_HOME/omaa/pi-extensions.json`。

guest 只由 DSH 的原生 `subprocess` 启动并按当前 `sandboxPolicy` / `sandbox` 约束，加载本地 default factory 与扩展回调；它没有 Pi 的 agent loop、模型/provider、账号、输入驱动或另一份会话日志。扩展工具执行与嵌套工具调用走同一原生工具注册、执行、权限及结果入账；`pi.exec` 同样使用原生 subprocess/sandbox。回调会核对当前权限，策略不一致时拒绝调用；原生 sandbox 模式变化事件撤销旧进程，后续按当前权限重新加载。

源码已接入的范围：

- 加载阶段及活动回调内的 `registerTool`、`registerCommand` 和 `on`，以及 `input`、`before_agent_start`、`agent_start`、`turn_start`、`turn_end`、`agent_end`、`agent_before_settle`、`agent_settled`、`message_start/update/end`、`tool_execution_start/update/end`、`tool_call`、`tool_result`、`session_start`、`session_shutdown`、`context` 和 `context_with_system`。斜杠命令注册在当前 Pi 的原生命令服务中；活动回调中的动态变更等待宿主 ACK 后完成；同一文件同名工具或命令替换，跨文件同名取第一个扩展。订阅返回的取消函数也可在活动回调内使用。注册表通过原生工具和命令服务更新，已经发出的模型请求不追改；新声明、snippets 和 guidelines 在下一次原生装配中生效，before_agent_start 内的变更可进入尚未发出的首个请求。宿主拒绝某次变更时恢复上一份已接纳定义，发起回调明确失败。
- TypeBox typed schema 与普通 JSON Schema 的工具参数使用固定上游的完整 `validateToolArguments` 校验，保留其转换和错误行为；validator 原文和来源由 `source.json` 维护，不导入 Pi 模型或代理运行时。
- `input` 支持异步 continue/handled/transform，保留原生消息身份和附件；`tool_call` 可阻止工具，不能改写已经入账的工具参数或模拟整批 terminate。`tool_result` 可替换受支持的 text/image 内容，不任意改写错误状态、details 或 structuredContent。
- `ctx.ui.select`、`confirm`、`input` 接入原生 userQuestions；`notify` 经活动 Pi 输入区的原生通知展示，按会话 cursor/ID 去重，未启用扩展时暂停读取，不伪造 assistant 消息。
- `getActiveTools` / `setActiveTools`、只读工具/命令目录和有界会话视图，以及回调内的 `sendUserMessage`、`sendMessage`、`appendEntry`、`exec` 和工具回调中的 `ctx.executeTool`。消息继续使用原生 steer/follow-up；`sendUserMessage` 的输入来源、streaming 和默认关闭的 `expandPromptTemplates` 保存到原生 `source.pi.input`，排队及冷恢复保留输入来源与展开选择。`executeTool` 不作为任意回调中的额外执行入口。
- native attachment 桥将 Pi image 的 data/mimeType 转为原生已接纳附件，反向读取原生图片供回调使用；工具结果、输入变换和扩展投递复用附件服务，输入变换保留未改动的原生文件附件。

`before_agent_start` 对当前订阅快照按顺序等待回调，暴露可变 `systemPromptOptions` 和反映前序改动的 `ctx.getSystemPrompt()`；支持返回自定义消息及完整 `systemPrompt`。回调显式编辑 `selectedTools` 时使用该列表，否则采用最新 `setActiveTools`，同步新工具 snippets/guidelines。每次运行只触发一次，系统选项及 force 在后续工具步骤、steer 和排队 follow-up 中保持，回到 idle 后清空。自定义消息以原生 user/context 消息入账，`source.kind` 为 `pi-extension`，保留 `customType`、`display` 和 `details`。

默认自定义消息展示依据固定原版 [`core/messages.ts`](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/core/messages.ts) 和 [`components/custom-message.ts`](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/modes/interactive/components/custom-message.ts)。原版 `convertToLlm` 将 custom 消息投影为 user，**不检查 `display`**；`display:false` 是显示选择，仍进入模型上下文。OMAA 使用原生 `uiConversation` 自有 Event 与 keyed Chat renderer，显示 `[customType]` 和原生 Markdown，采用固定 Pi palette 的明暗 `customMessageBg/Text/Label` 颜色。内容数组只提取 text 并以换行拼接，与原版默认组件一致，不展示 image blocks 或 `details`；字符串直接作为 Markdown。`display:false` 将该展示节点隐藏，原生 journal 和模型消息不变；只接管 append-origin 消息，模型替换投影不会重复显示。

消息沿用 DSH 过程分组，可随原生过程折叠；位置不等同原版 TUI 的独立消息行。Event 的 match 使用函数形式。该展示复用于 `before_agent_start` 和 `sendMessage` 已接纳的消息；不支持 `registerMessageRenderer` / 自定义 TUI 组件。原版 renderer 可获得完整 message、expanded/outputPad 和 theme，返回自有组件或回退默认展示；此接口没有移植。已在一个隔离的原生 alpha Web 会话中实际展开过程，核对类型标签、Markdown 标题/列表/代码、隐藏材料不显示，以及明暗主题切换。实际 provider 请求与原生事件仍保留隐藏文本和图片附件。

支持串行等待的 `agent_start`、`turn_start` 与 `agent_end` 通知，普通 handler 异常报告后继续后续 handler。`agent_start` 仅含 type；`turn_start` 含从 0 开始的 turnIndex 和分发时 timestamp；`agent_end` 含 messages。适配按 DSH 实际 activity 与请求 step 工作，一个 step 包含一次 provider response 及其工具批次，不能把原生用户 turn 当作 Pi turn。开始通知中的工具注册和 active tools 修改在发出模型请求前重新装配并进入原生 guard；接入新边界事件的扩展在原生 turn 停止前串行完成结束与收尾，界面维持运行状态并可停止；仅订阅旧通知的扩展保留 idle 预占 `runMaintenance` 路径。原生 `whenIdle` 和 teardown 等待对应回调。结束通知单独续投保持已接纳活动的 force；维护等待期间新的人工输入开启自己的 before_agent_start/force。原版低层 prompt/continue run、自动 retry 与 pre-settle 边界仍有差异，不宣称完全等价。

结束通知的 messages 来自当前 scope 实际 append-origin user/assistant/tool-result 消息，保留完整 text/image/toolCall/thinking；原生专有块保留原有结构，图片经原生附件服务转换。Pi replay 有原始 api/stopReason 时沿用，否则按原生 finish reason 映射；native usage 保留并提供对应 token 字段，不猜费用，不声称 Pi SDK 成本或全部签名完全一致。

`ctx.sessionManager.getEntries()` 读取当前会话原始日志中的全部已支持消息及 `appendEntry` 自定义条目，`getBranch()` 读取同一个不可变观察的当前投影，遵循宿主的替换、删除及注册投影顺序。二者取消原有 100 条消息和每条 4000 字符截断，保留完整文本、thinking、真实附件图片、原生专有块及工具身份；`argumentsRaw` 保留原始工具参数字符串，避免将 JavaScript 数值精度当作原话。getter 返回独立副本，回调中的修改不能写回宿主。日志仅由原生服务维护，重启后仍从原生日志和附件恢复。这个视图覆盖 DSH user/assistant/tool-result 消息及 Pi 自定义条目，不包括原厂 Pi 的全部 JSONL entry 或任意可写 SessionManager；同一会话的分支树由下述追加式导航记录承载；传输总量仍受下文 128 MiB 限制，超过时明确失败。

用户取消后的结束通知暴露已 aborted 的 `ctx.signal`；宿主拒绝 `exec`、`executeTool`、`sendUserMessage` 和 UI 问答续跑，通知与只读查询仍可用。disposed 不新建结束 maintenance。这个停止限制属于 OMAA 原生适配，原版上述事件本身未定义这一停止通知信号与 API 禁止组合。可编辑 `turn_end` / `agent_before_settle` 现在使用下文的草稿协议；取消时不提交未确认草稿，也不由扩展重新唤醒任务。回调等待期间的取消先尝试在一秒内通知 `agent_settled(aborted:true)`，随后终止原 guest；阻塞进程本身的扩展不能保证收到通知。

双向 guest 传输通过 `extensions/wire.mjs` 严格分帧重组，完整 JSON 消息上限 128 MiB，每个 JSONL frame 上限 2 MiB；2 MiB 是 frame 预算，不是完整事件预算。序号、字节数、base64、UTF-8 和完整性检查失败会明确拒绝，不截断内容；注册描述仍有单独预算。

完整 force 经 DSH 原生 journal 和 `startsRequestSeries` 首条系统消息归一化进入实际请求；原版 Pi force 仅作请求投影、不记入 transcript，两者记录语义不同。

同会话树导航与 `session_before_compact` / `session_before_tree` 控制已接通。原厂 JSONL 文件导入/写入、自定义 TUI/组件渲染不在此适配中。工具的 `prepareArguments`、`prepareLoadout.hiddenDeclarations`、`constrainedSampling` / `renderShell`、未接入的 exposure、`sendUserMessage` 的扩展命令/技能分派、额外自定义 AbortSignal 和嵌套工具的 onUpdate 等接口明确拒绝；扩展工具的部分更新发送 `tool_execution_update` 通知，不伪造成 DSH 日志或原生流式工具结果。其余未接入 API 也报不支持，不做空壳成功。现有只读 sessionManager 是完整的已支持原生消息视图，不等于完整 Pi SessionManager。

OMAA 0.5 已包含此扩展入口及动态注册，隔离原生执行检查已通过。before_agent_start 与异步输入链从 0.10.0 起提供，旧版本安装不包含它们。它不代表任意 Pi 扩展、完整 TUI、依赖安装或原厂运行时均可直接使用；旧安装包也不能由本文推定已经包含这些入口。

## 每次请求的上下文与扩展消息

`context` 先获得去掉 system 的会话副本，支持原位修改或返回 `{ messages }`；多个 handler 串行运行。删减或重排会话时，固定 Pi 原厂 helper 恢复系统提示和工具声明。随后 `context_with_system` 获得完整副本，可替换系统提示、修改 `sections`、删除／修改当前已启用工具的声明。删除首条 system 会按原厂行为提示并采用结果；不会偷偷补回已删除的提示。系统 section 的增删按原厂纯函数折叠后交给宿主。工具声明不能启用原生 active loadout 之外的工具；权限与参数执行校验继续由宿主负责。

这两个回调在每次请求（包含工具后的下一次请求与原生重试）冻结前等待完成。临时消息不会覆盖用户原文、模型回复或工具日志；下次请求重新从原生历史构造。未改动的模型消息沿用原生身份、附件和签名，改动的消息重新构造；图片通过原生附件服务处理。缺失或拆散工具配对、无效内容、取消与会话失效在发出请求前拒绝；普通 handler 异常记录后继续后续 handler。这里不提供 provider payload/header 拦截。

`pi.sendMessage({ customType, content, display, details? }, options?)` 使用同一原生自定义消息展示。空闲且未设 `triggerTurn` 时只追加消息；`triggerTurn:true` 通过原生 inbox 开启任务。运行中默认 steer，`deliverAs:'followUp'` 使用后续队列；`triggerTurn:false` 等整批工具结果入账后追加，避免拆开工具配对。`deliverAs:'nextTurn'` 等下一次用户输入再接入，不单独唤醒。等待消息记录在原生插件记录中，冷重启后仍会投递，已入账 ID 不重复投递。`display:false` 仅隐藏界面展示，内容仍送入模型。

`pi.appendEntry(customType, data)` 保存不进入模型上下文的插件自定义条目，后续回调与冷恢复可通过 `ctx.sessionManager.getEntries()` / `getBranch()` 读取。当前桥接可 `await pi.appendEntry(...)` 等待宿主确认并刷新当前回调快照；不等待时，回调结束前仍会排空已发出的写入，但同步 getter 可能仍看到之前的快照。条目与待投递消息使用 DSH 的 `appendPluginRecord`，不写未知必需事件；其他宿主读取器保留并跳过这些记录，格式迁移遵循宿主对插件记录的保留规则。

宿主接线锁定当前 DSH 版本的实际模块与方法哈希，只在 Pi Agent 实例上安装由原生源码生成的 `step` / `buildRequest` / `turn` 适配层。工具调度、流、重试、inbox、会话及权限沿用同一原生实例；不改变其他预设或共享服务。构建校验来源与适配点，运行时再核对实际方法，未匹配宿主拒绝加载。同会话分支树及扩展压缩回调使用下文的原生追加日志适配。

`turn_end` 在实际 assistant 回复及整批工具结果入账后触发，包含 `messageEntryId`、`toolResultEntryIds` 和从零开始的 `turnIndex`。`agent_before_settle` 在原生运行停止前触发；`agent_end` 回调中新排队的输入先执行完，再进入最终收尾。只有没有后续输入／继续请求时才发送 `agent_settled`，取消带 `aborted:true`。这些新增边界沿原生取消信号等待，设置和停止入口仍可反映活动状态。

两个边界按固定 runner 的顺序传递 `{ entries, continue, context, outcome }`。后续 handler 可以看到前序草稿投影，也可返回整份替代草稿。`context` 包含 `contextEntries`、`contextMessages`、`llmMessages`、`pendingMessages` 和 `canContinue`。支持四类草稿：`custom` 保存状态、`custom_message` 追加可见／隐藏消息、`context_edit` 以 `{ content }` 改写或用 `null` 移除本分支条目的模型内容、`compaction` 保存 summary 并从 `firstKeptEntryId` 保留后缀（`null` 仅保留摘要及后续条目）。继续决定必须有可运行上下文，不能从单独 assistant 末尾空转。

例如，扩展可以在 `turn_end` 返回 `{ entries: [{ type: 'custom_message', customType: 'review', content: '请继续处理尚未完成的检查。', display: true }], continue: true }`。实际扩展须以持久状态或上下文条件控制这一分支，避免每回合无条件重复。

最终草稿经完整投影和工具配对校验后，以单个原生 `plugin:omaa/pi-boundary` 记录保存。原始消息保留；Pi 的后续请求先应用持久草稿，再运行临时 context 回调。可见消息用已有 Pi 默认组件展示，原生消息 ID 是展示回执，部分展示写入失败后只补缺失回执。无效最终批次和提交前取消都不提交草稿。原厂 `session-manager.ts` 的纯投影函数及 `messages.ts` 转换函数由固定源码直接生成，未启动另一套 SessionManager 或文件日志。最新系统提示与工具声明继续由宿主装配；未修改的图片、卸载标记和消息身份保留。Pi 的 `/compact`、自动压力压缩和溢出恢复共用当前分支投影，包含已提交的 context_edit 和 compaction 草稿；当前系统与工具仍由宿主装配。其他预设继续使用自己的压缩后端。

`message_start/update/end` 读取原生消息与真实流块，提供文本、思考及工具调用的开始／增量／结束通知；`tool_execution_start/end` 围绕原生工具执行并报告实际经过的毫秒数，扩展工具 `onUpdate` 进入 `tool_execution_update`。通知 handler 的异常会报告后继续后续 handler，原生工具权限与最终结果仍由宿主管理。
