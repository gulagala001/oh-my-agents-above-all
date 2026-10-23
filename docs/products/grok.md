# Grok Build 预设来源与适配

固定官方来源：[xai-org/grok-build，2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8](https://github.com/xai-org/grok-build/tree/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8)，Apache-2.0。源码快照不是此前二进制 `1.0.46` 的等价证明。`src/presets/grok/source.json` 保存 58 个完整来源文件、逐文件 SHA-256、原始路径、固定 URL、许可、工具映射及逐项适配；上游 LICENSE 原文随快照保存。

## 生效文本

默认生产入口是 [`templates/prompt.md`](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-agent/templates/prompt.md)。`PromptContext::render_with_renderer` 在 Extend + Primary + TemplateOverride::None 使用这个模板；`apply_patch_prompt.md` 是另一种可选 profile，不能把它当默认 Grok。子代理另用完整 `subagent_prompt.md`。三份模板、上下文装配、第一条用户消息装配及工具文本均完整保存于 `sources/`。

`prompt.mjs` 的 `buildPrompt({tools,cwd,platform,mode})` 渲染固定原版条件模板，保留危险操作、完整任务推进、沟通、格式及临时文件段落的英文原句和顺序。只替换实际宿主身份、用户请求封装和工具不兼容处。工具名称只按实际注册的 Set 注入，缺少对应工具时不宣称存在。`monitor` 条件段在真实 scoped 工具存在时保留原文。Grok 磁盘记忆、安装目录文档、Grok 专用自动完成提醒及浏览器验证分支未装配。

工具使用不是靠主提示词推断：官方 Rust `description_template`、`DESCRIPTION_FULL` 与字段 schema 是原始依据。DSH 的 `read` 使用 `file_path/offset/limit`，`edit` 使用 `file_path/old_string/new_string/replace_all`，`write` 使用 `file_path/content`。原版 edit 精确匹配与消除歧义句子保留；创建文件改用真实 write。DSH 文本读取与单独 read_image 不能声称支持上游 PDF/PPTX、每十行箭头锚点或整份指令文件读取特例。任务、提问、计划及后台输出规则在实际工具存在时装配。

## 行为与宿主边界

| 产品事实及依据 | DSH 承载与状态 |
| --- | --- |
| `todo_write` 用于 3 步及以上任务，单步略过；列表实时显示。依据 todo/mod.rs。 | 使用 DSH 原生 todo_write 和会话状态；不移植 Grok workspace todo 存储。 |
| `enter_plan_mode` 面向真实方案歧义；上游请求批准并种子化计划文件。计划中只允许计划文件编辑，`ask_user_question` 澄清，`exit_plan_mode` 提交批准。依据 plan_mode.rs 与 [官方计划文档](https://docs.x.ai/build/features/plan-mode)。 | 使用原生 planMode 状态、记录和评审。提示词仅在 enter/exit 两工具都注册时引用；DSH exit 接受 `plan` Markdown，按返回批准或继续规划。无上游计划文件承诺。宿主权限继续独立执行。 |
| 问题工具会等待用户响应，可提供选择与推荐项。依据 ask_user_question/mod.rs。 | 原生 ask_user_question 承载；保留推荐项优先原句。自动 Other、预览、multi-select 等依赖宿主 UI，不由提示词承诺。 |
| 独立 prompt-queue 保存队列项、优先级、运行项、combined texts；TUI 支持编辑、排序和 send-now/interjection。默认 Enter queue，follow_up_behavior=steer 可在安全间隙注入。send-now 停止当前 turn，保留后台任务与其余队列，作为下一 turn 投递。依据 xai-prompt-queue、session/prompt_queue.rs、键盘指南及 PTY 回归。 | Grok 会话输入框上方使用实际 DSH rc.2 QueueDock：支持上移／下移、保留附件的文本编辑、移除、插话与立即发送，并显示等待回复／权限及等待插话状态。排序与编辑写入原生 inbox，重启可恢复；旧编辑拒绝覆盖新内容。立即发送取消当前回合、保留其余队列与后台作业，由原生循环继续。DSH 每轮取一条排队消息，插话在整批工具后送达；使用按钮而非复制 TUI 双 Enter 键位。 |
| 后台命令、subagent 输出和停止可共用上游输出工具；默认 toolset 包含 monitor，以 stdout 行通知状态变化。 | `monitor.mjs` 经原生 tools.execute 调用后台 bash/pwsh，保留所有 guard/权限和同一 jobs 生命周期。绝对 offset 的 stdout 观察不消耗 job_output 的 cursor；事件用合法原生 tool-jobs notice 在 running 时 inject、idle 时 followup。job_list/job_output/job_kill 操作同一实际作业，间隔调度由 `scheduler.mjs` 接入原生 schedule 服务。 |
| memory 是实验性显式或 managed config 开关；`MemoryConfig` legacy 解析 `.default(false)`，v2 独立 enabled gate，支持 record_only/shadow/active rollout。 | 默认关闭符合固定源码；未启动自动捕获、Dream、磁盘 topic index 或原厂 memory 服务。未来显式启用必须实现真实目录和写保护，不能只启用 prompt 分支。 |
| 首条用户消息包含 user_info、规则/技能/MCP；更深 AGENTS.md 优先。 | 宿主的环境、技能及项目上下文注入负责，避免再次扫描/拼接一份独立长期日志。 |
| 默认会话 full-replace 压缩使用 code_compaction 的九节完整摘要；Chat step-level/intra 提示词是其他分支。 | `buildCompactionPrompt()` 提供准确会话摘要来源；仅供原生 purpose:compaction 的最后一条用户指令替换。保留宿主最近尾部、完整事务及工具配对，未移植上游执行器。 |

`buildCompactionPrompt()` 保留九节原文，只适配 DSH 保留近期上下文而非“仅原始查询+摘要”的事实，并将“已看到完整会话”改为实际本次摘要提供的材料。`source.json` 明列来源和变化。其他 compaction/intra/inter 模板仅作为完整研究材料保留，不误装成同一套运行契约。

Monitor 保存完整上游工具说明及 line processor/rate limiter 来源。`timeout_ms` 默认 10 小时，`persistent` 或原版 `timeout_ms:0` 直到停止或会话销毁；宿主原生进程由同一 job 取消，后台超时不只是退订。stdout 空行忽略、单行 UTF-8 字节限 500、批次限 3000、部分行缓冲限 1 MiB，200ms 合批；令牌容量 10、每 2 秒补一个，连续限流超过 30 秒会停掉进程并通知。最后部分行在正常完成时发送；普通结束由已有 job 服务唯一通知，用户取消与 owner teardown 不增加重复事件。原生输出 ring 可提前丢弃字节，此时事件明确报告 gap。后台作业为宿主进程内生命周期，重启不会冒称恢复原厂 monitor。

`scheduler.mjs` 提供 `scheduler_create/list/delete/output`。在 **设置 → OMAA** 开启 Grok，并启用宿主自动任务服务后，直接在 Grok 会话中提出定时工作；例如“每 5 分钟检查构建结果”。模型调用 `scheduler_create`，返回持久任务 ID。修改时使用同一 `task_id` 与新的 `interval` 或 `prompt`，删除使用 `scheduler_delete`。interval 使用整数 `s/m/h/d`，最低 60 秒；每会话最多创建 50 个当前活跃任务，列表保留真实任务 ID、下次时间和完成状态。

间隔修改保留创建或上次实际派发的时间锚点；如果修改后的目标已经到期，则从本次修改时刻再等一个新间隔，避免补跑旧次数。prompt 单独修改保留下次时间，并让下一次执行从新子任务线程开始；只改间隔继续使用已有线程。创建时显式指定 `fire_immediately:true` 可立即执行一次，默认仍等待首个间隔；`recurring:false` 提供延迟一次执行，不能同时要求立即执行。`durable:true` 跨会话任务不在当前范围。

每次派发通过原生受控子任务执行，原生提醒收据、子任务接纳和最终完成分别记录。重复任务从创建起七天到期，即使第一次执行设在八天后也会按时移除提醒；删除任务或到期不终止已经接纳的子任务。冷恢复保留已确认记录，未知持久化结果暂停执行并要求检查，不自动重复派发或删除。普通原生提醒单独标识，其他会话的任务不进入当前列表。

间隔修改与到期清理由固定 DSH `0.2.1-rc.2` 的同一原生调度队列承载。薄适配核验安装模块 SHA-256 和实际方法身份，再在原队列内比较完整记录并写入；它使用了宿主内部 FIFO／domain 接口，升级宿主须重新核验，不能只放宽版本声明。并发编辑改变内容或规则时拒绝旧操作；不替换调度服务，不增加第二套派发计时器。原生提醒和 Grok 归属记录是两个持久写入，部分失败保留未知状态，不能宣称跨域原子提交。

官方服务、模型表现、账号、Grok CLI/TUI、MCP 安装、独立内存索引与云端 media 等能力不由本预设提供。模型/API、原生工具循环、权限、会话、日志、恢复、压缩事务均属于 DSH。相关官方资料可从 [CLI 参考](https://docs.x.ai/build/cli/reference) 与完整固定源码回查。

## 核验范围

已核对固定源码的生产模板、计划状态和队列库与官方 raw 网络字节一致；所有保存文件有 hash。已直接运行 buildPrompt 检查空工具、常见工具、Windows pwsh、计划工具缺失与启用分支，确保没有未解析模板和幽灵工具指令；常规摘要导出可由来源逐字重生。实际 DSH UI、权限、重启与用户计划评审属于主集成验收，源码核验不能替代真实交互验证。

`test/installed-behaviors.test.mjs` 已通过真实原版 DSH CLI 安装后的手动 `/compact`：实际 provider 的最后用户指令完整等于 Grok Structured 会话摘要适配，`compaction/start/summary/end` 使用同一原生事务 ID，系统消息与 turn 边界保留，后续模型请求读取 checkpoint。此项没有移植或调用 Grok 官方运行时。

`test/installed-grok-monitor.test.mjs` 通过原版 CLI 隔离安装：实际模型收到 stdout 各事件及完成部分行一次，原生 job_output 仍完整读到输出；job_kill 后状态 killed，延迟写文件没有发生；deadline 实际取消进程，Ask 拒绝启动，Pi 不暴露 monitor。`test/grok-monitor.test.mjs` 核对持续超限的停止决策及已注册作业后的 late-cancel 精确取消一次。测试只用 loopback，没有执行 Grok 客户端或真实账号。

`test/grok-schedule-transactions-native.test.mjs` 使用隔离原生宿主检查间隔修改、真实子任务请求、续跑、冷恢复、并发编辑、取消和七天到期。受控日期用来覆盖到期边界；派发、存储、原生 inbox 和子任务均为实际执行。既有 `test/grok-native-core.test.mjs` 保留真实时钟的分钟派发路径。两者使用本地合成 provider，不证明真实模型质量或 Grok 官方账号行为。

## 当前源码的文档与调度工具

在 **设置 → OMAA** 开启 Grok 后，进入 Grok 会话，直接说明需要读取的文件和 PDF 页码。`read_document` 读取 PPTX 文字／演讲备注、PDF 页面图片或 PDF 文本；`read_grok_image` 读取 PNG、JPEG、WebP、GIF、TIFF、BMP 和 ICO。图片作为原生附件显示在工具结果中，并随后续模型请求发送，冷重启后继续可用。

- PDF 默认为页面图片；例如读取 `report.pdf` 的第 2、4 页，参数是 `file_path: "report.pdf", pages: "2,4"`。要求文字时加 `format: "text"`。省略页码最多读取 10 页，明确选择最多 20 页；图片还受宿主的每条消息上限约束。
- PPTX 包含幻灯片文字和对应演讲备注。文本输出使用 UTF-8 字节分页；继续时同时提交返回的 `nextOffset` 和 `textSha256`，分别作为 `offset` 与 `text_sha256`。文件、页码选择或完整提取文字变化时拒绝旧游标，应从零开始。
- GIF、TIFF、ICO 读取第一帧／页；按固定 Grok 压缩规则转成宿主可接受的 PNG、JPEG 或 WebP，最多 768 KiB Base64、1,048,576 像素和单边 2000 像素。需要当前模型声明支持图片输入。

PDF 文本使用随包 PDFium WASM，BMP／ICO 使用随包 ImageMagick WASM，无需预装 Poppler 或 ImageMagick 命令。WASM 在独立 worker 中只接收经过原生文件权限检查的字节；超时、取消和异常等待 worker 退出。每个 WASM 内存上限为 512 MiB，文本提取上限 8 MiB，单个输入上限 50 MiB。PDF 页面渲染仍使用已声明的 LibreOffice kit／PDFium 和 Sharp；依赖自身的当前平台组件须正常安装。格式、字体、颜色、提取顺序可能与原厂引擎不同。

监控保留有界输出、UTF-8 边界和丢失通知，并只停止实际归属的作业。调度记录区分创建、派发、子任务完成和过期；续跑核对已有记录，不把未知结果自动重试为成功。

## 当前源码的队列入口

在 **设置 → OMAA** 开启 Grok 后，进入 Grok 会话。任务执行期间提交的消息显示在输入框上方；多条消息可展开，使用上移／下移调整相邻用户消息，编辑、移除或插话。**立即发送（停止当前回合）** 将所选消息作为下一轮输入，保留其他排队消息；正在等待用户回复或权限时也可显式取消该回合并接手。后台通知和问题回复不可作为用户消息编辑或排序。

编辑保留原始图片及文件引用，发生并发修改会保留草稿并显示冲突。队列状态直接来自持久化的原生 inbox，没有另一份浏览器队列。原生排队组件、附件预览、InlineEditor 和样式固定到 DSH rc.2；快照、许可、原包哈希和必要适配见 `src/client/sources/grok-queue/source.json` 与 `scripts/build-grok-queue.mjs`。
