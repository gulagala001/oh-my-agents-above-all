# Cursor 深度预设

本预设移植 Cursor coding agent 的工作方式到 DSH 的模型、API、工具循环与会话。研究范围包含 Agent、计划、规则、工具和交互，不以 CLI 未登录首屏代替整个产品。已固定完整公开提示词样本与官方行为依据；`prompt.mjs` 已实现完整样本的条件工具适配与模式文本。实际能力以插件实现及验收为准。

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

Agent/Ask/Plan 权限、计划 Markdown 审阅、文件差异 review 和 [checkpoint 恢复](checkpoints.md) 使用真实 DSH 状态与工具；本轮原版安装与 Web 已核对实际 write 卡片、恢复按钮、精确字节冷恢复、冲突和认证/预设 guard；共享原生 Plan 审阅按钮闭环已在 Cursor 会话中实点核对，见 [验证记录](../verification.md)。原生 `session/prompt` 的 steer/queue 已在 Pi 预设的两项 read 工具真实批次中验证：steer 在两项结果之后投递到当前 turn，queue 在该 turn 完成后开始下一 turn。产品界面的独立快捷键和复杂队列控件不由这个 API 验证推定等价。

当前不宣称复制专有 Instant Grep、代码索引/语义检索、Composer 模型、编辑器光标/打开文件、云代理/项目协调器或 Cursor 账号服务。用户上下文只取 DSH 已提供的工作目录、附件与明确授权内容。计划生成不能隐藏修改代码，checkpoint 恢复应明确只恢复已记录文件变化并保留消息。

## 审阅、预览和继续修改

[官方审阅流程](https://cursor.com/learn/reviewing-testing) 包含观察修改、停止并调整方向，以及任务完成后的 Review / Find Issues。OMAA 的检查点面板已直接打开 DSH 原生回合审阅器，提供文件选择、行号、并排/统一比较和长行折行；不再另画简化文本 diff。文件旁的「预览当前文件」打开原生文档预览，比较记录与当前文件明确分开；恢复删除的新文件不提供误导性的预览按钮。

导航和恢复在执行时核对当前会话及 Cursor 预设，导航使用 `sidebarRight.openResourceIn` 的明确会话目标。运行中可选择已加载的完成回合、查看原生记录比较或预览当前文件；恢复和 Find Issues 仍须先停止。面板不增加轮询，不将旧回合比较称为实时编辑 diff。切换会话后保留的旧回调会拒绝操作。历史比较失效时面板照实提示，恢复仍按已捕获字节及冲突检查执行。`test/checkpoint-browser.test.mjs` 已在实际打包安装的 DSH 验证：两文件审阅、文件选择、并排/统一和折行按钮、原生打开文件、当前预览、恢复后的磁盘字节和预览更新，以及切换到 Codex 后没有 Cursor 恢复控制。恢复后回合比较仍显示原回合记录，不伪装成当前内容。定向竞态回归另见 `test/checkpoint-navigation.test.mjs`。实拍在本地 `.cache/cursor-native-review.png`、`cursor-current-preview.png` 和 `cursor-restored-review.png`，不是发行资产。

检查点的「查找本回合问题」与「查找此文件问题」进入实际只读 Ask 模式，把所选回合、原生事件位置及文件目标经原生会话提交给当前模型。检查读取当前文件并参考本回合记录，明确文件可能已经变化；不直接把旧 diff 当作当前内容。检查后保持 Ask，用户切回执行模式可继续修复，停止/继续仍用宿主入口。迟到或跨会话回调拒绝提交，模式未真正生效时不发起检查。

DSH 的回合差异并不等于 Cursor 的实时编辑器 diff 或全分支审阅；该面板尚未提供原厂行级批注和分支 scope。Find Issues 使用 DSH 当前模型与真实读取工具，缺陷发现质量依赖实际模型与材料，没有接入 Cursor 专有审阅服务。

## 原文适配记录

运行文本以完整样本作底稿，保留原句、英语和组织方式，只原位修正工具或宿主事实不兼容处。每项修改应记录旧文、新文、理由并验证最终装配，样本本身保持不变。官方资料的新能力可指导功能实现，不倒推样本真实捕获版本。

`adaptation.json` 记录适配职责与真实契约理由，`adaptation.diff` 是指定工具配置下实际生成文本对原文的差异。Cursor 没有可靠完整摘要提示词来源，`buildCompactionPrompt()` 返回 `undefined`，沿用 DSH 原生压缩。模式提示词按当前真实状态和已注册 enter/exit 工具生成，不把文本声明当作模式执行。

真实原生 `/compact` 已验证 Cursor 保留固定 DSH 版本的完整摘要指令，完成同一 native `compaction/start` → `summary` → `end` 事务，保留首个系统消息与原生 turn 边界，后续模型请求可读取生成的 checkpoint。其余有完整公开来源的预设按各自摘要文本路由；不会为 Cursor 编写无来源的“原生摘要”。

内置主题现在标为「Cursor · Agent 对话」，依据 [官方 Agents Window](https://cursor.com/docs/agent/agents-window) 与 [桌面公开演示](https://cursor.com/product) 适配左会话导航、中心对话和工具摘要、底部输入及模式/模型控件、右侧文件/计划预览的关系，采用比例字体、紧凑工具行与圆角输入。DSH 保留自己的真实节点、停止、模式和文件工具；这里的尺寸是适配参数，未声称取得闭源界面的像素或主题 token。

[官方 themes and appearance](https://cursor.com/help/customization/themes) 明确 IDE 支持用户选择明暗主题和跟随 OS，并区分了 IDE 的扩展/主题操作与 Agents Window。OMAA 的颜色继续沿用当前 DSH 明暗主题，这是适配选择，不能外推为 Agents Window 自动继承 IDE 配色。来源元数据在 `sources/cursor/agent-window.json`；CLI 首屏证据单独保留在 `sources/cursor/provenance.json`，不再作为桌面主题的依据。已有会话的内部主题 id `cursor-cli` 保留兼容，名称与实际布局已改为 Agent 对话。
