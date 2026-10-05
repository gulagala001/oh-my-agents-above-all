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
| 独立 prompt-queue 保存队列项、优先级、运行项、combined texts；TUI 支持编辑、排序和 send-now/interjection。默认 Enter queue，follow_up_behavior=steer 可在安全间隙注入。send-now 停止当前 turn，保留后台任务与其余队列，作为下一 turn 投递。依据 xai-prompt-queue、session/prompt_queue.rs、键盘指南及 PTY 回归。 | 原生 steer/queue、队列 edit/remove/steer 和保留 inbox 的停止入口承载基本接手。DSH queue 逐 turn 取一条，steer 在整批工具后进入当前 turn；Grok 双 Enter/send-now 键位、排序和 blocked-wait 特例没有独立 UI 适配。 |
| 后台命令、subagent 输出和停止可共用上游输出工具；默认 toolset 包含 monitor，以 stdout 行通知状态变化。 | `monitor.mjs` 经原生 tools.execute 调用后台 bash/pwsh，保留所有 guard/权限和同一 jobs 生命周期。绝对 offset 的 stdout 观察不消耗 job_output 的 cursor；事件用合法原生 tool-jobs notice 在 running 时 inject、idle 时 followup。job_list/job_output/job_kill 操作同一实际作业，间隔调度由 `scheduler.mjs` 接入原生 schedule 服务。 |
| memory 是实验性显式或 managed config 开关；`MemoryConfig` legacy 解析 `.default(false)`，v2 独立 enabled gate，支持 record_only/shadow/active rollout。 | 默认关闭符合固定源码；未启动自动捕获、Dream、磁盘 topic index 或原厂 memory 服务。未来显式启用必须实现真实目录和写保护，不能只启用 prompt 分支。 |
| 首条用户消息包含 user_info、规则/技能/MCP；更深 AGENTS.md 优先。 | 宿主的环境、技能及项目上下文注入负责，避免再次扫描/拼接一份独立长期日志。 |
| 默认会话 full-replace 压缩使用 code_compaction 的九节完整摘要；Chat step-level/intra 提示词是其他分支。 | `buildCompactionPrompt()` 提供准确会话摘要来源；仅供原生 purpose:compaction 的最后一条用户指令替换。保留宿主最近尾部、完整事务及工具配对，未移植上游执行器。 |

`buildCompactionPrompt()` 保留九节原文，只适配 DSH 保留近期上下文而非“仅原始查询+摘要”的事实，并将“已看到完整会话”改为实际本次摘要提供的材料。`source.json` 明列来源和变化。其他 compaction/intra/inter 模板仅作为完整研究材料保留，不误装成同一套运行契约。

Monitor 保存完整上游工具说明及 line processor/rate limiter 来源。`timeout_ms` 默认 10 小时，`persistent` 或原版 `timeout_ms:0` 直到停止或会话销毁；宿主原生进程由同一 job 取消，后台超时不只是退订。stdout 空行忽略、单行 UTF-8 字节限 500、批次限 3000、部分行缓冲限 1 MiB，200ms 合批；令牌容量 10、每 2 秒补一个，连续限流超过 30 秒会停掉进程并通知。最后部分行在正常完成时发送；普通结束由已有 job 服务唯一通知，用户取消与 owner teardown 不增加重复事件。原生输出 ring 可提前丢弃字节，此时事件明确报告 gap。后台作业为宿主进程内生命周期，重启不会冒称恢复原厂 monitor。

`scheduler.mjs` 补齐默认 toolset 的 `scheduler_create/list/delete`，遵循宿主原生自动任务开关：服务关闭时仅不挂载这些定时工具，Grok 主预设继续可用；用户启用原生开关后再按需挂载，不改写用户设置。固定源码已使用 interval，**不是 cron**：整数 `s/m/h/d`，正数且最低 60 秒，保持上游低值 clamp。创建与列表/删除直接使用原生 schedule；原生到期投递与持久化均由 DSH 负责。`task_id` 更新保留 id，prompt 或同 interval 更新带完整 expected record 做并发核对，保持 next fire。改变 interval 会使宿主重新锚定时间，适配明确拒绝，让用户显式删除并重建；未知 id 不偷偷创建任务。创建最多 50 个当前会话活跃任务，适配器同时创建按会话串行核对上限。

创建 `durable:true` 或 `fire_immediately:true` 明确报不支持；没有新 timer、手工 followup 或伪造 delivery history。上游的七天 TTL 无原生字段，当前能力为直到删除、重启继续绑定原会话，不假称跨会话 durable；字段在 task_id 更新时按原版忽略。原版隐藏 `recurring:false` 分支实际拒绝一次性任务，预设按授权额外提供宿主 `after_seconds` 一次性提醒并在工具说明中明确。列表只返回原生可得字段，不猜 createdAt。原厂调度用独立子代理和周期性的 transcript chain 重置；这里实际使用宿主当前会话的提醒投递，不启动另一执行循环。

官方服务、模型表现、账号、Grok CLI/TUI、MCP 安装、独立内存索引与云端 media 等能力不由本预设提供。模型/API、原生工具循环、权限、会话、日志、恢复、压缩事务均属于 DSH。相关官方资料可从 [CLI 参考](https://docs.x.ai/build/cli/reference) 与完整固定源码回查。

## 核验范围

已核对固定源码的生产模板、计划状态和队列库与官方 raw 网络字节一致；所有保存文件有 hash。已直接运行 buildPrompt 检查空工具、常见工具、Windows pwsh、计划工具缺失与启用分支，确保没有未解析模板和幽灵工具指令；常规摘要导出可由来源逐字重生。实际 DSH UI、权限、重启与用户计划评审属于主集成验收，源码核验不能替代真实交互验证。

`test/installed-behaviors.test.mjs` 已通过真实原版 DSH CLI 安装后的手动 `/compact`：实际 provider 的最后用户指令完整等于 Grok Structured 会话摘要适配，`compaction/start/summary/end` 使用同一原生事务 ID，系统消息与 turn 边界保留，后续模型请求读取 checkpoint。此项没有移植或调用 Grok 官方运行时。

`test/installed-grok-monitor.test.mjs` 通过原版 CLI 隔离安装：实际模型收到 stdout 各事件及完成部分行一次，原生 job_output 仍完整读到输出；job_kill 后状态 killed，延迟写文件没有发生；deadline 实际取消进程，Ask 拒绝启动，Pi 不暴露 monitor。`test/grok-monitor.test.mjs` 核对持续超限的停止决策及已注册作业后的 late-cancel 精确取消一次。测试只用 loopback，没有执行 Grok 客户端或真实账号。

`test/installed-grok-scheduler.test.mjs` 通过原版隔离安装：native catalog 的 id 与 next target、同间隔 prompt 更新保相位、拒绝项不改任务、冷重启恢复、**真实等待 60 秒首轮到期**、合法 schedule 源消息和原生 write 实际生成更新后的文件、next target 前移、列表/删除及一次性 native after 记录均核对。Pi 没有这些工具。测试同时确认独立子进程 `node --test` 真正执行并写出 marker，不受外层 Node runner 的递归跳过环境影响。未实测 Grok 原厂 durable/subagent scheduler，不宣称等价。
