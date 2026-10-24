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

本轮原版 DSH 安装执行已核对真实工具、原生停止/恢复、Plan/Ask guard、后台 job schema 与文件变化；官方摘要指令在实际 `/compact` 请求与原生事务中核对。Codex Web 明暗/模式/reload 及修复后右栏标题已实拍检查，真实 `space-bunny-free` clamp 任务也完成且原测试不动。共享原生 Plan 审阅按钮闭环已在 Cursor 会话中实点核对，见 [产品边界](../compatibility.md)。工作树、子代理、MCP、浏览器和审批沿用 DSH 已配置能力，不能借预设扩大权限或启动官方客户端。

主题只能承担外观；Codex 原生桌面的任务管理、云执行、账号额度、专有 API、编辑器和产物生命周期是不同能力。已有主题资产及 CLI 源码证据不等于桌面实拍或点击验收。

## 审阅与运行中的接手

[官方 Code review](https://learn.chatgpt.com/docs/code-review) 明确区分工作树、暂存区、提交、分支和 Last turn，并支持文件/块暂存或撤回及行级反馈。OMAA 已增加真实 Git 审阅面板：Unstaged 比较工作树与索引，Staged 比较索引与 HEAD，Commit 查看指定提交，Branch 比较已提交的分支差异；后两种范围不混入当前未提交修改，也不提供写操作。Last turn 在同一面板列出宿主仍可提供的会话回合，直接读取原生 workspaceChanges 的摘要和差异；独立启用 Codex 即可使用。全部范围采用固定 rc.2 原生 FileDiff 的并排／统一、高亮和折行。

暂存区和历史比较的正文、文件类型及 2 MiB 大小限制以所选 Git 版本为准；当前工作区后来变成二进制、大文件或链接，不改变已暂存或已提交的文本。取消暂存仅改索引，保留当前文件。合并提交比较其第一父提交；固定提交的批注与已阅状态不因无关工作区或索引编辑失效。Git 的路径前缀、相对路径和行标记显示偏好不改变审阅及块操作。

工作树范围的暂存/撤回、暂存区的取消暂存按后端实际能力提供文件或块操作，仅停止运行的执行模式可用。所有 Git 进程使用原生 subprocess/sandbox，读取强制 read-only，写入使用边界时重新解析的宿主权限；子目录/linked worktree 的 Git 索引在许可根外时不提供暂存按钮。路径按字面量处理，非 UTF-8/二进制/过大/不安全文件不提供文本写操作；块操作不连带执行位改动，新文件遵循 Git attributes。每次提交携带观察到的比较 revision，所选比较或会话写入状态变化时拒绝并要求刷新，不自动重试写操作。外部编辑与实际 Git 写入之间仍存在操作边界窗口，不声称跨所有外部进程的原子锁。点击原/新行号可填写意见；明确发送后，原生 sessionController.prompt 将范围、revision、文件、侧别、行号与原行材料连同意见提交到同一会话，模型仍需检查当前文件。

在会话输入区点击「Codex 预设设置」，进入「代码审阅」。点击原／新行号填写意见，选择「保存批注」或「发送此条并继续修改」；已保存的多文件意见可「批量反馈并继续修改」。切换文件、比较范围、页面重载和宿主重启都保留已保存批注及原 scope/ref/revision/root/path/side/line。待发送最多 50 条，单条 4000 UTF-8 字节、整批 60000 字节；全部历史最多 200 条，可删除不用的记录。未点击保存的文本仍属于当前窗口编辑内容。

批注按会话保存在本地私有目录，使用 revision 防止另一窗口覆盖。批量发送只形成一个原生会话请求；发送前保存请求 ID，刷新从原生 inbox／会话日志核对接纳，明确重试复用原 ID。「已发送」仅表示宿主已接纳，保留原意见；「已解决」由用户在检查实际修改后标记，也可重新打开。已阅文件标记绑定比较 revision，所选比较变化后不沿用旧版本的已阅状态。查找范围／文件问题先切到原生只读问答模式；反馈续改确认执行模式后才提交，运行中、计划模式或有待发队列时拒绝冲突提交。停止沿用会话原生停止入口。

在文件头、选中行或已保存批注点击编辑器按钮，可打开本机 Cursor、VS Code 或 VS Code Insiders。编辑器选择按浏览器来源保存；首次安装的编辑器先完成自身初始化。目标必须通过当前会话目录、宿主文件映射、UTF-8 普通文件及当前字节核验；逐参数传入 `--goto`，不执行客户端提供的程序或 shell 文本。已保存行用唯一周围上下文映射当前位置；旧行已删除、改写或存在重复匹配时拒绝跳转。启动回执仅表示已发出打开请求，不代替编辑器实际选择状态。

这些增量目前只在本地源码，尚未包含在已发行的 0.16.5 包中。PR 批注同步、原厂账号／云端审阅和专有 IDE 服务仍不在范围内。原生回合比较受宿主保留期约束，批注持久化不延长该保留期；已保存批注仍可独立查看和发送。此链路在 macOS／DSH rc.2 的隔离宿主核对，其他宿主与平台需分别验证；本地合成模型请求证明执行接线，不代表真实模型的审阅质量。

[官方 Queue / Steer 说明](https://developers.openai.com/blog/mastering-codex-remote-for-engineering) 区分下一回合追加任务与运行中调整方向。OMAA 沿用 DSH 原生输入、队列和停止动作；停止当前运行不会自动删除已排队的任务，后续任务仍按宿主语义继续。不能把关闭面板、切主题或文字「已停止」当作取消执行。

## 原文适配记录

运行文本从固定模板生成；每处替换或条件剥离须有旧文、新文和宿主契约理由，并核对实际装配结果。来源文本保持只读，升级应更新固定版本与哈希，再审阅文字和行为差异。

`adaptation.json` 记录适配职责、原因及审阅用工具配置，`adaptation.diff` 保存该配置下实际 `buildPrompt` 返回值与原文的统一差异。没有额外静态提示词副本；运行时直接从完整来源生成。无工具/完整工具、Windows shell、三种模式的生成检查不代替真实模型行为或桌面交互验收。
