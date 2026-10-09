# Codex 深度预设

本预设使用 DSH 选择的模型、API、工具循环和会话；不会运行 Codex 官方客户端。行为底稿来自 OpenAI 官方开源源码，完整原文保留在 `src/presets/codex/sources/`。`prompt.mjs` 已实现完整模板的条件适配和原生压缩提示词导出，宿主运行装配及交互验收以插件实际实现为准。

## 来源与生效层

- 固定仓库：[openai/codex，c1382380de69521303b416720a52f42d51af6248](https://github.com/openai/codex/tree/c1382380de69521303b416720a52f42d51af6248)，正式 tag `rust-v0.162.0`，版本 `0.162.0`，Apache-2.0。官方 LICENSE 原文已保存。
- 当前底稿：[models-manager/models.json](https://github.com/openai/codex/blob/c1382380de69521303b416720a52f42d51af6248/codex-rs/models-manager/models.json) 中 `gpt-6-astra.model_messages.instructions_template`，完整 21,420 字符；按 JSON 字符串解码后保存为 `sources/instructions_template.md`，未概括重写。模型目录仅确定提示词出处，不强制 DSH 使用该模型。
- 同一对象的 `persistent_instructions`、模式、审批和多代理动态文本完整留在 `model-messages.json`。它们是独立条件层，不全部注入主提示词。`persistent_instructions.md` 要求异步用户消息、唤醒描述、等待与长期跟进，并含固定截止日；没有对应实现时不启用。
- `fallback-prompt.md` 是源码回退提示词；`core/gpt-5.2-codex_prompt.md` 是旧模型文本，不能因为文件名包含 Codex 就把它当作当前模板。
- `buildCompactionPrompt()` 导出 `compact.md` 的完整官方指令，供 DSH 原生 compaction-basic 的现有摘要调用使用；压缩引擎、事务与工具配对仍由 DSH 负责。`compact-summary-prefix.md`、`review-rubric.md` 留作比较资料，不自动切换会话结构或要求 JSON 交稿。
- 每个文件的来源 URL、提取 selector、字节数和 SHA-256 在 `sources/source.json`。`models.json` 保留整个固定上游文件，便于核对提取结果及后续升级差异。

本次以正式 `rust-v0.162.0` 更新完整保存文件，主模板只变化消息授权这一句：允许用户明确指令，或明确调用的 skill/plugin 所授权的消息操作；后一种情况在最终答复列出名称和链接。DSH 仅把新句中的 `final channel` 原位改为 `final answer`，其余已审阅适配保留。持久模板、压缩指令、review rubric 和 fallback 原文不变。独立 Default 模式条件文本删去两句旧指导，`instructions_variables` 字段移除；这些条件层仍只保存，不自动注入。源码的模型人格 fallback 整理及计划指令文件移动已保留为来源证据，不复制原厂模型选择或运行器。

## 行为与宿主适配

| 原生行为依据 | DSH 移植要求 | 实际边界 |
| --- | --- | --- |
| 完整主模板的 autonomy/persistence、权限与用户协作段落 | 保留已授权工作连续完成、合理判断确认边界、随新消息调整任务、进度消息和自包含交付 | 不能新增审批门，也不能用提示词绕过 DSH 的权限 |
| 主模板的 `rg`、并行独立读取、依赖操作顺序、准确测试和 PR 写作 | 用当前实际工具调用形式替换 `functions.exec` 等名称；保留判断边界与措辞强度 | 没有通用 JS 编排工具时使用宿主原生工具批次，不能声称存在隔离 V8 |
| `functions.request_user_input_async` 条件指导 | 只在实际存在的提问工具下保留异步等待契约 | 普通问答不能假装为仍可工作的 pending question |
| Skills、AGENTS.md 和连接器按需加载 | 使用宿主已提供的技能目录、文件读取与工具 schema；保留用户指令优先 | 不伪造 Codex 插件安装、ChatGPT 账号或工具发现服务 |
| [官方 AGENTS.md 指南](https://learn.chatgpt.com/docs/agent-configuration/agents-md)的目录作用域 | 按工作目录与目标文件读取适用的父级及更深层指令 | 指令文件不是全仓库无条件扫描清单 |
| [官方 prompting guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide)的模型提示词、工具与压缩配合 | 保留完整底稿，减少重复宿主说明；工具名称与真实 schema 配套 | 官方模型训练、远端压缩和模型表现不能由预设复制 |
| 源码 `update_plan_instructions.rs` | 无计划工具时不注入声明；有计划工具时装配对应真实用法 | 普通推理计划与可见计划状态区分，不强制简单任务建表 |
| Markdown 文件链接与输出规则 | 用 DSH 真正支持的文件引用格式；保留代码/文件可追溯交付 | 原生 Codex 深链和 app 指令不是 DSH 能力 |

## 已接入能力与边界

本轮原版 DSH 安装执行已核对真实工具、原生停止/恢复、Plan/Ask guard、后台 job schema 与文件变化；官方摘要指令在实际 `/compact` 请求与原生事务中核对。Codex Web 明暗/模式/reload 及修复后右栏标题已实拍检查，真实 `space-bunny-free` clamp 任务也完成且原测试不动。共享原生 Plan 审阅按钮闭环已在 Cursor 会话中实点核对，见 [验证记录](../verification.md)。工作树、子代理、MCP、浏览器和审批沿用 DSH 已配置能力，不能借预设扩大权限或启动官方客户端。

主题只能承担外观；Codex 原生桌面的任务管理、云执行、账号额度、专有 API、编辑器和产物生命周期是不同能力。已有主题资产及 CLI 源码证据不等于桌面实拍或点击验收。

## 审阅与运行中的接手

[官方 Code review](https://learn.chatgpt.com/docs/code-review) 明确区分工作树、暂存区、提交、分支和 Last turn，并支持文件/块暂存或撤回及行级反馈。OMAA 已增加真实 Git 审阅面板：Unstaged 比较工作树与索引，Staged 比较索引与 HEAD，Commit 查看指定提交，Branch 比较已提交的分支差异；后两种范围不混入当前未提交修改，也不提供写操作。Last turn 直接打开 DSH 原生回合审阅，继续使用原生并排/统一 diff、文件选择和预览。

工作树范围的暂存/撤回、暂存区的取消暂存按后端实际能力提供文件或块操作，仅停止运行的执行模式可用。所有 Git 进程使用原生 subprocess/sandbox，读取强制 read-only，写入使用边界时重新解析的宿主权限；子目录/linked worktree 的 Git 索引在许可根外时不提供暂存按钮。路径按字面量处理，非 UTF-8/二进制/过大/不安全文件不提供文本写操作；块操作不连带执行位改动，新文件遵循 Git attributes。每次提交携带观察到的比较 revision，仓库或会话状态变化时拒绝并要求刷新，不自动重试写操作。外部编辑与实际 Git 写入之间仍存在操作边界窗口，不声称跨所有外部进程的原子锁。点击原/新行号可填写意见；明确发送后，原生 `beginSubmission` / `prompt` 将范围、revision、文件、侧别和行号连同原话提交到同一会话，模型仍需检查当前文件。

`test/git-review-browser.test.mjs` 已在实际打包安装的 DSH 完成文件/块暂存、取消暂存、块/文件撤回、Commit/Branch 只读、Last turn 原生导航，以及行级反馈进入实际模型请求的点击核验；用真实 Git 索引、工作树和文件字节核对结果。状态隔离和冲突回归见 `test/git-review-state.test.mjs`，后端边界见 `test/git-review.test.mjs`。实拍在本地 `.cache/codex-git-review.png`、`codex-line-feedback.png`、`codex-git-reverted.png`，不是发行资产。

行级意见可立即发送，或先加入会话草稿再统一提交。切换文件/比较范围保留原 scope/ref/revision/path/side/line；草稿可编辑、单条删除，最多 50 条、单条 4000 UTF-8 字节、合计 60000 字节。批量发送只产生一个原生会话请求，要求读取当前文件后处理原位置意见；失败保留，宿主接受后仅清理对应已发送版本。草稿按会话隔离，只保存在当前应用内存，重载不保证保留；没有独立模型队列或审阅日志。`test/git-feedback-batch-browser.test.mjs` 已实点两文件批注收集及一次提交，实际 provider 请求和原生 journal 只有一份汇总任务，接受后清空对应草稿；主模型看过实拍。

当前行级意见使用同一会话的明确后续消息，未实现原厂跨刷新保留的多条批注队列、外部编辑器指定行跳转或 PR 批注同步；不把此闭环外推为这些能力。

[官方 Queue / Steer 说明](https://developers.openai.com/blog/mastering-codex-remote-for-engineering) 区分下一回合追加任务与运行中调整方向。OMAA 沿用 DSH 原生输入、队列和停止动作；停止当前运行不会自动删除已排队的任务，后续任务仍按宿主语义继续。不能把关闭面板、切主题或文字「已停止」当作取消执行。

## 原文适配记录

运行文本从固定模板生成；每处替换或条件剥离须有旧文、新文和宿主契约理由，并核对实际装配结果。来源文本保持只读，升级应更新固定版本与哈希，再审阅文字和行为差异。

`adaptation.json` 记录适配职责、原因及审阅用工具配置，`adaptation.diff` 保存该配置下实际 `buildPrompt` 返回值与原文的统一差异。没有额外静态提示词副本；运行时直接从完整来源生成。无工具/完整工具、Windows shell、三种模式的生成检查不代替真实模型行为或桌面交互验收。
