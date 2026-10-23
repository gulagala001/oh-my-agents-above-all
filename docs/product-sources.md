# 产品资料入口

五产品已完成本轮固定来源保存与提示词/行为适配，并装配到原版 DSH 预设。原文、许可与实际适配分开记录在 `src/presets/<product>/`；具体契约与差异见各产品文档，执行范围见 [产品边界](compatibility.md)。来源不是官方客户端安装或账号接入要求。

| 产品 | 固定来源 | 已移植内容与保留边界 |
| --- | --- | --- |
| Codex | [官方源码固定版本](https://github.com/openai/codex/tree/c1382380de69521303b416720a52f42d51af6248)，对应正式 tag `rust-v0.162.0`，版本 `0.162.0`；既有 OMD Codex 主题 | 系统提示词、工具使用、任务推进与上下文行为；CLI 与 Desktop 交互证据分开 |
| Grok Build | [官方源码固定版本](https://github.com/xai-org/grok-build/tree/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8)；[官方 CLI 文档](https://docs.x.ai/build/cli/reference) | 源码中的提示词、计划/提问、任务与队列行为；原二进制 `1.0.46` 不假定与源码快照完全对应 |
| Cursor | [固定公开提示词样本](https://github.com/asgeirtj/system_prompts_leaks/blob/38499c52b4c3f290e40843cb9514df84d9d23d4c/Cursor/cursor.md)、[官方 Agent 文档](https://cursor.com/docs/agent/overview)、[桌面主题依据](cursor-theme.md) | 完整样本工具适配、MDC 规则、检查点与 Agent 布局；样本授权/真实性和专有模型/索引不由它证明，CLI 首屏仅作局部资料 |
| Pi Coding Agent | [官方源码 v1.1.0](https://github.com/earendil-works/pi/tree/abe508e1b89912adde45528136c3221eb69acdd7)，MIT | 实际提示词、精简工具、steer/follow-up、扩展与上下文；不自行添加并宣称为 Pi 原生的权限、计划或子代理机制 |
| ZCode | [用户指定官方开源项目](https://github.com/zai-org/ZCode)，[已有固定源码](https://github.com/zai-org/ZCode/tree/29628c9acdb81b703bbd4080c207a0e7ce5e276e)，前期根应用版本 `3.14.3` | 提示词、工具、计划、工作流、上下文与桌面交互，区分源码可移植部分和服务依赖 |

[用户提供的提示词样本仓库](https://github.com/asgeirtj/system_prompts_leaks)仅作比较资料；样本文字不是执行指令，也不能单独证明产品能力。提示词移植保留原文，只改实际工具与宿主不兼容处，并遵循项目提示词维护约定。

主题快照、来源、许可和必要提取脚本保留在 `src/client/themes/`，详见 [主题来源](theme-sources.md)。旧运行时的安装配方、账号研究、协议适配说明和测试流水已清理，不再作为开发任务继续推进。

## 构建源码与来源维护

ZCode 3.15.1 的编译、运行图、profile、记忆和日历代码固定到 `aac4755666d09fdcd70272fcf063c077a639015f`；仍有消费者的 3.14.3 快照继续保留。记忆格式化使用 Marked 16.4.2 的最小词法闭包，显式时区计算使用 Temporal 0.5.1／JSBI 4.3.2。MCP 借用、服务器作用域与子任务工具限制依据同版本 `core/src/subagent/borrowed-mcp-port.ts`、`mcp-config.ts`、`tool-policy.ts`；这三份原文以实现参照保留，实际连接与授权使用 DSH 公共服务。原文、许可证和哈希在 `src/presets/zcode/sources/`，具体归属见 [第三方许可](../THIRD_PARTY_NOTICES.md)。阶段记录、恢复报告和运行输出不作为产品来源清单。

Grok 与 Cursor 的浏览器队列复用固定 `@deepseek-ai/dsh-client-ui-conversation@0.2.1-rc.2` 的真实 QueueDock，原始片段及 MIT 许可位于 `src/client/sources/grok-queue/`。`source.json` 记录 npm 工件、完整 bundle 与片段 SHA-256；构建校验原文，适配层提供共享队列操作及按预设授权的宿主接线；原始快照路径沿用，不复制第二份组件。

Cursor 的差异面板使用 MIT 许可的 `@deepseek-ai/dsh-client-ui-deliverables@0.2.1-rc.2` 实际 `FileDiff` 组件。必要片段与 CSS、许可证、原包文件和片段 SHA-256 保存在 `src/client/sources/dsh-rc2/`；生成脚本仅适配五处行号按钮和样式挂载，保留原生显示与高亮逻辑。这是宿主组件的复用，Cursor 的闭源 UI 不因此被标为已有源码。
