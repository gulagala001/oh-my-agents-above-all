# 验证记录

验证针对原版 DSH `0.2.1-alpha.1` 中安装后的实际插件、工具和会话。来源/文本检查、脚本化宿主执行、真实模型任务及 Web 点击分别说明范围；不按测试数量推算产品完成率。

| 范围 | 当前证据与状态 |
| --- | --- |
| 原文与装配 | 固定 commit、文件哈希、完整原文和适配模块已落地；条件工具、Windows shell 文本分支和摘要出处有针对性检查 |
| 插件与原生生命周期 | `test/installed-presets.test.mjs` 覆盖 `.tgz` 安装、五预设完整请求、原生文件工具、Plan/Ask guard、停止、冷恢复和卸载后工具/身份还原；Pi 四核心加 read_image/skill，实际加载 fixture 技能正文。job 工具已装配，本轮不把 schema 存在计为所有后台执行场景通过 |
| Web 设置与主题 | 主模型已执行并人工看过五产品实拍，核对 light/dark、原生模式、reload、Cursor 实际 write 卡片及恢复按钮。Codex 右栏标题无遮挡，Cursor 比例字体/Agent 布局已核对；入口 `test/presets-browser.test.mjs`，`.cache/browser-<id>.png` 为本地证据，不是发行资产 |
| Cursor 规则与原生行为 | `test/installed-behaviors.test.mjs` 已实际通过 MDC always/manual、read 后 glob、按需规则及字面量保留；五预设原生 `/compact` 指令路由、事务/工具配对与后续 checkpoint，以及 Pi 真实 read 批次的 steer/queue 投递已核对。边界回归见 `test/cursor-rules.test.mjs` |
| Plan 审阅与提问按钮 | `test/installed-plan.test.mjs` 核对 Ask 经真实工具进入 Plan，实点“要求修改”后保持只读；“同意执行”后模型收到审批结果，下一步写入成功，不残留 Ask 拦截。原生提问等待、选择答案、提交并续跑也通过。未改造第二套审批流 |
| Cursor 文件检查点 | 主模型已通过 `test/installed-checkpoints.test.mjs`：原生 capture/diff、BOM/CRLF/无末尾 LF 字节冷还原、新文件删除、冷启动首请求的恢复事实、手工冲突拒绝、认证/预设 guard；Web 恢复按钮也实际还原文件。底层边界回归见 `test/checkpoints.test.mjs` |
| OMD 增强与共存 | `test/omd-coexist.test.mjs` 核对两种安装顺序、默认关闭/开启/再次关闭、冷恢复和既有 OMD standard 工具/段落保持；实际 bundled CodeGraph 建索引通过。Computer Use schema 与关闭后的真实调用拒绝通过，没有操作用户桌面或重测全部平台输入。共享外观的卸载释放另由 coordinator 回归核对 |
| 实际模型任务 | 五套 clamp 的实际源码修正和外部行为检查通过，原测试未改；原生 shell 曾继承 Node 测试 worker 环境，退出 0 可能为零测试执行，不能把旧运行记录作为原测试成功证据。该环境缺陷已修正。复杂 ZCode 工程、同 session 冷恢复/压缩/追加需求均使用 `opencode-zen/space-bunny-free` 实际完成，详见 [工程记录](verification/configured-project.md)；首轮其他四产品的未完成事实保留，不据此宣称五套长期质量等价 |
| 新深度能力 | Grok monitor/scheduler、Pi SYSTEM/模板/项目及祖先深层技能、Cursor 原生 Review/preview、Codex Git scope/文件块操作/原生行反馈均已做对应真实安装检查。Pi 分叉/离开摘要的原生前缀、源 journal 不变、当前模型和 cold/literal context 由 `installed-pi-branches` 核对，`pi-branches-browser` 实点 native child 导航和切回；Cursor `cursor-find-issues-browser` 实点指定回合检查，实际 Ask 拒绝写入。主模型看过两张新增实拍。Git 文件范围、字节、mode、换行和权限问题已修复，所有进程复用 native subprocess/sandbox；原生 workflow 子代理结构化返回、ZCode 冷历史回查及 Git 只读 filter 防护由 `installed-zcode-tools` 核对。用户要求功能优先，后续不重复整套或扩重型矩阵 |
| 多文件审阅闭环 | `git-feedback-batch-browser` 在实际打包 Web 收集两个文件的行级意见，一次 native 请求同时携带原坐标与原意见、仅一条原生 user/message，宿主接受后清理对应草稿；主模型看过实拍。状态回归核对跨文件/会话保留、失败与迟到接受，未创建第二模型队列 |

`pnpm test` 包含来源回归与已安装宿主测试，实际模型任务需要明确配置才运行。未运行或跳过的测试不计为通过；脚本化 provider 可验证接线与生命周期，不能证明真实模型代码质量。

本轮 Web 与宿主执行来自 macOS。Windows 文本装配分支有检查，Windows 运行、其他模型/provider、原厂客户端及专有服务没有据此宣称通过。OMAA 包含完整来源、主题与许可，不含 DSH 和原厂运行时；最终大小以实际 `.tgz` 为准。兼容 OMD 约 8.2 MB（解包约 18 MB），由固定官方源码及入库补丁构建，保留宿主工厂并排除本地维护文件。当前 OMAA 0.2.0／兼容 OMD 0.7.1 已实际安装到 Web alpha.1 与桌面 rc.2；旧的安装初版记录不代表后续任务质量已全部达成。

UI 修复：无项目草稿的设置迁移先启用增强再调用既有 OMD 模式控制器，保留主题、Ask/Plan 和源草稿；原版 Web 的 Pi Pro 源→目标会话迁移已真实执行，目标仍启用 Pro、增强且保持 DSH 外观，未发送模型任务。桌面匹配包经原生安装器更新并重启，原会话和模型已恢复，设置面板实际可打开。保存竞态、同 ID 切预设、主题过渡及窄侧栏通过单个隔离浏览器 fixture 核对；文件恢复／Git 操作／Pi 分叉的失效状态限制及目标迁移失败补偿仅跑了对应模块检查，没有重做五预设长任务矩阵。Pi 本地 settings/package 资源、忽略规则及 native 懒加载完成了同一安装回归。

OMAA 0.6 的 ZCode Actor 增量仅做两项针对性 native 检查：保存后双提问及整个宿主重启后的人类冷续问；后台任务在父会话切换 Ask 后实际停止和子会话收束。真实配置 `opencode-zen/space-bunny-free` 的同一 Actor 读取/回忆短任务已返回正确结构结果。第一次真实尝试返回运行异常，后续一次实际成功；不从该短任务推导稳定率或五预设整体完成。

OMAA 0.7 的 world facade 使用一个 `installed-zcode-world` 原生安装 fixture，覆盖文件/glob、UTF-16 BOM/CRLF、宿主 bundled grep、Git、相对命令路径、非零退出、错误码及超限、workspace-write 和后台 Ask 取消。文件/Git/命令契约已接入；当时 artifact registry、graph amendment 和动态图界面尚未接入。另一个简短真实任务使用已配置 `opencode-zen/space-bunny-free`，实际加载技能并调用 `create_workflow`，正确返回文件内容、glob、Git 分支与 argv 命令结果。此检查不证明所有平台或模型等价；详见 [ZCode 文档](products/zcode.md)。

OMAA 0.8.0 的产物接入由一个最终 `installed-zcode-artifacts` 原生 fixture 核对，本地日志为 `.cache/zcode-artifacts-installed-check.log`。实际覆盖 spec 快照、两个成功版本、工作区后改与整个宿主冷重启后内容不变、四种声明、分页/table upsert、文件过大/逃逸/缺失/primary 的可 catch 失败、跨 session 拒读、非法 spec 的父 run 失败，以及只读查询不追加 native 事件。原生 Domain 只存小 summary，完整数据使用 native content-addressed 附件 refs；没有另建 blob 或改变 journal。此次没有五预设长任务矩阵；graph 只提供静态真实数据 JSON，不据此宣称原厂 live graph/amend 或 engine journal/replay 等价。

已配置 `opencode-zen/space-bunny-free` 的一个真实产物任务实际加载技能、执行 `create_workflow`，完成 Chart/Table/primary Markdown 发布；本地 `.cache/zcode-artifacts-live-result.json` 的 `outcome` 保存实际结果。原生 alpha Web UI 实点“查看产物”打开指定 run，原版 ChartView 显示两点图，Table keyed row 折叠为一行/value 3；“打开原生预览”实际读取 native `attachments/v1` 的不可变 `delivery.md`。实拍为 `.cache/zcode-artifact-chart.jpg`、`.cache/zcode-artifact-preview.jpg`。该项仅证明这个模型任务与对应 Web 流程；UI 全面验收和 Desktop/Windows 产物 UI 尚未全面验证，不推定所有模型或原厂客户端等价。
