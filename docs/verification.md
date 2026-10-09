# 验证记录

验证针对安装后的实际插件、工具和会话。来源/文本检查、脚本化宿主执行、真实模型任务及 Web 点击分别说明范围；不按测试数量推算产品完成率。以下历史功能记录主要来自 alpha；本轮跨宿主验收单列，不能由历史记录推定所有旧宿主或平台已测。

## 0.15.0 前端候选

五产品保留原设计来源、DSH 对话布局、原生工具与完整工作台，改进预设状态、异步增强就绪、读取／保存失败、窄栏、低动效和工作流导航。官方 a2 Web 已实际执行五产品、Git 审阅反馈、Cursor 检查点／Ask、Pi 分叉与本地扩展、Grok monitor／scheduler、ZCode 图／Actor／产物／Stop／六类工具视图；与 OMD 两种加载顺序完成外观所有权、原生区域标记、侧栏键盘、重载、停止后启停及 CLI 卸载检查。

rc.2／alpha.1 的 0.15 前端基线分别使用对应 SDK 与锁独立构建，非客户端源码／生成文件逐字保留原宿主后端，并实际完成五产品明暗／模式、运行锁定／原生停止／冷重开、Cursor／Pi 代表和与 OMD 两种加载顺序。七个 OMAA 直接 SDK peer 经官方公开解析器核对实际路由和模块路径，无源码链接或版本豁免；不是十个运行中 namespace 的证明。原始 alpha.1 导航失败命令保留：第六行被原生 Show more 折叠，测试在列表异步到达前过早返回。修正等待真实目标行后，同一行为断言完成，没有补造行或降低产品检查。

非 Git 工作区保持原生 `GIT_FAILED` 400；新客户端仅为该诊断添加简短说明和可展开原文，其他错误继续原样显示。实际 a2 Native 已核对诊断逐字、刷新不请求模型、同目录初始化 Git 后恢复 200 并消除错误。旧宿主新微调及最终 OMD 工件继续绑定各自冻结 SHA，不能将基线 trial 结果替代最后组合。

[真实界面截图](frontend-gallery.md)说明宿主、版本、冻结 SHA 与合成模型来源。初次空 HOME 的官方浏览器签名记录单独归因，之后凭据严格逐字相同；临时宿主自然退出、根目录删除，真实 Chrome 全局注册只读哈希不变。macOS CLI Web 不代表真实 Desktop App、Windows、账号或硬件动作；本轮不宣称原生热卸载通过。

## 0.14.1 兼容性整合补丁

部署核对发现 0.14.0 候选未吸收最终兼容性分支的可选增强隔离实现。使用冻结 alpha.1 安装包和真实原生宿主复现：可选工作流模块失败会使基础 Codex 预设创建返回 `agent-preset/invalid`。0.14.1 合并最终兼容性源码与原生冻结工件验证，并保留 REA 新功能。修复后的运行记录必须绑定 0.14.1 的源码、工件 SHA 和实际宿主；下述 0.14.0 结果不能替代该补丁的验收。

## 0.14.0 未发布候选

本轮固定 Codex `0.162.0`／Pi `1.1.0` 来源，并保存 REA 的完整 Evidence、原始 stderr 和工件身份；静态结果不替代运行验收。候选配对 OMD `0.12.0`：alpha 来源提交 `0256ee8998e8881cd2363950eaba19de02ed9236`，rc.2 来源提交 `65917ffa7cabf9b914f6fbb51f8b2ad8daaae581`。完整 payload 来自各提交的隔离快照；旧 `0.10.0` 规则保留原字节。候选没有新 tag／Release。

Mac arm64 隔离官方 CLI Web 的定向回归覆盖：Pi 超过 100 条且超过 4000 字符的完整历史、原生投影、真实图像、不可变观察与冷恢复；Grok 实际进程 monitor、真实 60 秒 scheduler 触发与 rc.2 原生自动化 bundle 启停；ZCode saved typed Actor、Ask 取消、Amend 前缀复用、产物版本、图谱及活动任务卸载／禁用。Cursor 输入区直接打开原生回合 Review，忙碌、旧结果、切会话与卸载边界另有真实 Web 和独立组件检查。

新增 ZCode 保存定义界面经独立对抗审查：非有限数、不安全整数、原始负零材料、损坏／外国同名结果、未知状态名、两种加载顺序的原生低优先级 slot 均有独立断言；实际 UI 包另验读取、参数填写、显式运行和工作台。工作台真实点击覆盖四类看板、两个不可变文件版本的 SHA／预览、Actor 往返、lineage、retune、Stop、原生子进程退出与无迟到写入。每次最终工件的宿主、SHA、截图和清理报告分别冻结；失败尝试保留，不能以旧包通过替代新包证据。

新增本地配对核验入口以完整 40 位 OMAA 源码提交为输入，逐字节检查已提交源码与构建产物、完整文件白名单、宿主／loader manifest、配对 OMD 来源与 payload。重算所有 sidecars 后的篡改、缺失、未知成员与链接仍须拒绝。远端 tag／Release 校验继续保留历史契约；本地入口不宣称远端发行或 CI 已通过。

两宿主原版 DSH 与固定 IUI、未安装 OMD／OMAA 的独立复现确认一项原生限制：卸载旧预设后，Web 复用旧空白会话保存的 `storedPreset` 会失败；默认仍为 `standard`，未指定旧 session id 的新 standard 会话可用。公开 select 在冷激活时失败，同 id 切 standard 冲突，宿主没有可等待完成的 pre-uninstall API。此项没有修复，不计作缺失预设自动恢复通过。会话、草稿和附件不删除或迁移；其他插件、设置及数据保留有各自实际卸载检查，不能由数据保留推断旧缺失预设会话可以续用。

配对 OMD `0.12.0` 的 Loader 在显式移除条目及其已有子条目退出期间临时标记运行条目，防止原生 bundle 重组将全量 effective patch 写入用户 `cordis.yml`。原始 options 保持不变，失败也等待已有清理完成，明确的原生配置写入继续生效。新增保护的验收以最终工件身份及对应真实五预设／IUI／配对安装及卸载报告为准，报告须绑定源码、四份包 SHA、实际宿主与清理结果，较早专项通过不能替代。

真实五预设组合、IUI 和最终配对安装验收以最终候选目录内的报告为准。没有运行的 Desktop、Windows/Linux、真实付费模型／账号、Computer Use 硬件流程和 Claude 原生 helper 不计为本轮通过；Pi 可编辑上下文／会话树、官方终端交互差异仍按产品文档明示。

## 0.13.1 配对兼容补丁

OMAA `0.13.1` 保留 `0.13.0` 的五产品实现，仅更新两宿主的 OMD `0.10.0` 配对基线。alpha.1 固定来源为 `de86711d2341e5239b2d95adde62bf48acf54cef`，rc.2 为 `bb5afae4088183c09e349f98b6bc13a891412be3`。两份官方 tgz 的全部发行文件已逐字节核对对应提交；`integrated-baseline` 配对不重建客户端或修改原 payload，只追加兼容来源记录及 manifest 白名单项。旧 `0.6.1` 与 `0.9.0` 来源仍在运行时审定基线中，历史 tag 继续按其当时的规则核验。

本次分发回归覆盖当前 `0.10.0` 默认、旧 `0.9.0` integrated 包、历史 overlay 与六文件发行、完整 manifest／payload／元数据篡改拒绝、运行时双宿主选包与未知提交拒绝。构建和这些回归证明来源与分发契约；下列 `0.13.0` 原生记录仍为历史证据，不据此宣称新配对已通过 Desktop、Windows、付费模型或 Computer Use 桌面动作验收。最终配对包的原生执行以对应宿主与 tarball SHA 的独立验收报告为准。

## 0.13.0 跨宿主验证范围

macOS arm64／Node 24.18 的原生 CLI Web 已分别运行 DSH `0.2.0-rc.2` 与 `0.2.1-alpha.1`，使用同一个源码 tarball、本地脚本 provider 和隔离 Chrome for Testing。rc.2 实际识别宿主为 rc.2，源码包的 alpha 发布前缀未参与运行时选包。SDK 经原生 PluginPackages 解析，安装无源码链接、override 或版本豁免。

`test/host-compatibility.test.mjs` 已覆盖五预设真实原生读写、客户端 ModuleLoader、明暗主题、设置与模式、停止继续、冷重启、禁用启用和卸载。配对 OMD 分别检查两种安装顺序、增强关闭／开启／关闭、实际 CodeGraph 建索引及联合卸载。原生服务保持共享；OMD 的普通依赖链允许对应宿主同版 schemastery utility 副本，路径和声明单独记录，不能把该例外推广到 DSH 服务或 Cordis。

两宿主另分别通过 `installed-presets`、`installed-pi-start`、`installed-pi-lifecycle`：五套完整请求、实际原生技能、Ask/Plan 写入及命令拦截，Pi 异步启动、冷队列原文、启动次数、超过 2 MiB 的完整结束消息和取消后禁止续跑。首轮失败保留：stock 默认模型须经原生选择器明确选中本地 fixture；冷恢复后第二次启动计数为 2，原测试误写为 1。修正的是测试前提和精确断言，没有删除能力检查。

范围、更新路由、完整发行 manifest、重算 checksum 后的篡改拒绝、npm 跨平台入口及 rc.2 raw-arguments 工具卡片另有针对性回归。CI 对动态代表宿主安装精确官方 CLI，复验同一个源码包、宿主专用附件和配对 OMD；报告绑定宿主、平台与 tarball SHA。发布版 rc.2 `0.12.1` 附件已实际通过独立安装，旧 tag 的 alpha-only 源码则被 rc.2 原生安装器拒绝，不能笼统归因为 rc.2 附件损坏。

本轮没有真实账号／付费模型请求或 Computer Use 桌面动作；macOS CLI Web 不代替 Desktop ASAR、Windows 或所有 provider 的验收。Pi 用户技能正文已通过临时 agentDir 的忽略规则排除，仍可能扫描用户资源路径和 ignore 元数据，不宣称操作系统级文件隔离。具体版本边界见[版本适配](compatibility.md)。

## 历史功能验收

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

本轮 Web 与宿主执行来自 macOS。Windows 文本装配分支有检查，Windows 运行、其他模型/provider、原厂客户端及专有服务没有据此宣称通过。OMAA 包含完整来源、主题与许可，不含 DSH 和原厂运行时；最终大小以实际 `.tgz` 为准。OMAA 0.13.0 配对 OMD 0.9.0 由分宿主固定官方源码构建并核对完整 payload，保留宿主工厂和 vendor，排除本地维护文件；大小以对应附件为准。历史配对 OMD 0.8.1 使用当时的入库补丁。历史 OMAA 0.8.0／兼容 OMD 0.8.1 已实际安装到 Web alpha.1 与桌面 rc.2；后续版本沿用双宿主原生安装和重启路径；原生更新页显示各端实际加载版本。历史安装记录不代表后续任务质量已全部达成。

UI 修复：无项目草稿的设置迁移先启用增强再调用既有 OMD 模式控制器，保留主题、Ask/Plan 和源草稿；原版 Web 的 Pi Pro 源→目标会话迁移已真实执行，目标仍启用 Pro、增强且保持 DSH 外观，未发送模型任务。桌面匹配包经原生安装器更新并重启，原会话和模型已恢复，设置面板实际可打开。保存竞态、同 ID 切预设、主题过渡及窄侧栏通过单个隔离浏览器 fixture 核对；文件恢复／Git 操作／Pi 分叉的失效状态限制及目标迁移失败补偿仅跑了对应模块检查，没有重做五预设长任务矩阵。Pi 本地 settings/package 资源、忽略规则及 native 懒加载完成了同一安装回归。

OMAA 0.6 的 ZCode Actor 增量仅做两项针对性 native 检查：保存后双提问及整个宿主重启后的人类冷续问；后台任务在父会话切换 Ask 后实际停止和子会话收束。真实配置 `opencode-zen/space-bunny-free` 的同一 Actor 读取/回忆短任务已返回正确结构结果。第一次真实尝试返回运行异常，后续一次实际成功；不从该短任务推导稳定率或五预设整体完成。

OMAA 0.7 的 world facade 使用一个 `installed-zcode-world` 原生安装 fixture，覆盖文件/glob、UTF-16 BOM/CRLF、宿主 bundled grep、Git、相对命令路径、非零退出、错误码及超限、workspace-write 和后台 Ask 取消。文件/Git/命令契约已接入；当时 artifact registry、graph amendment 和动态图界面尚未接入。另一个简短真实任务使用已配置 `opencode-zen/space-bunny-free`，实际加载技能并调用 `create_workflow`，正确返回文件内容、glob、Git 分支与 argv 命令结果。此检查不证明所有平台或模型等价；详见 [ZCode 文档](products/zcode.md)。

OMAA 0.8.0 的产物接入由一个最终 `installed-zcode-artifacts` 原生 fixture 核对，本地日志为 `.cache/zcode-artifacts-installed-check.log`。实际覆盖 spec 快照、两个成功版本、工作区后改与整个宿主冷重启后内容不变、四种声明、分页/table upsert、文件过大/逃逸/缺失/primary 的可 catch 失败、跨 session 拒读、非法 spec 的父 run 失败，以及只读查询不追加 native 事件。原生 Domain 只存小 summary，完整数据使用 native content-addressed 附件 refs；没有另建 blob 或改变 journal。此次没有五预设长任务矩阵；该 0.8.0 fixture 的 graph 只提供静态真实数据 JSON，不据此宣称原厂 live graph/amend 或 engine journal/replay 等价。

已配置 `opencode-zen/space-bunny-free` 的一个真实产物任务实际加载技能、执行 `create_workflow`，完成 Chart/Table/primary Markdown 发布；本地 `.cache/zcode-artifacts-live-result.json` 的 `outcome` 保存实际结果。原生 alpha Web UI 实点“查看产物”打开指定 run，原版 ChartView 显示两点图，Table keyed row 折叠为一行/value 3；“打开原生预览”实际读取 native `attachments/v1` 的不可变 `delivery.md`。实拍为 `.cache/zcode-artifact-chart.jpg`、`.cache/zcode-artifact-preview.jpg`。该项仅证明这个模型任务与对应 Web 流程；UI 全面验收和 Desktop/Windows 产物 UI 尚未全面验证，不推定所有模型或原厂客户端等价。

OMAA 0.9.0 的运行图由单个原生 fixture 核对 site × ordinal、phase 出生快照、同一 native child 两问与 world-read 终态；已配置 Space Bunny Free 的短任务返回预期 Actor 回复和文件内容。alpha Web 已实际展开原 Timeline／PhaseList、点击 Actor 打开 continuable child 并返回父会话。证据为 `.cache/zcode-graph-native-check.log`、`.cache/zcode-graph-ui-result.json` 与 timeline／actor 实拍；未知 provider backoff、Desktop/Windows 新图及所有模型不在该项验收范围内。

OMAA 0.9.0 的 `installed-zcode-amend` 单个原生安装 fixture 已通过：整个宿主冷重启后，第一 ask 复用缓存，分歧任务只调用一次 native 模型且新 child 不含旧 poison 后缀；并发相同 world.run 的结果保持准入次序，工作区计数器没有二次效果；ask 失败可 catch 后继续；lineage、跨 session 拒绝、子会话 cold continuation、max_concurrency 升降／不取消在执行 ask 均已实际核对。同时修复未声明 phase 的 ask/world 原生 lossless JSON 传输错误。日志 `.cache/zcode-amend-native-check.log`。原厂完整 journal/replay、半转录续跑、精确工具 effect 分类、原模型 pin 继承与所有模型／平台不在这项证据范围内。

同一已配置 Space Bunny Free 的一次真实 create→amend 任务实际返回 OMAA_AMEND_SEED／OMAA_AMEND_LIVE，API 显示一条 cached node 与正确 resumedFrom／supersededBy。证据 `.cache/zcode-amend-live-verification.json`；原 helper 错把直连模型当成本地 mock server 可捕获请求，判据已明确纠正，不把该不可测请求数当证据。新的 lineage 入口已在隔离 alpha Web fixture 实点：从 Amend 工具卡片“查看产物”打开 Lineage revision，点击“← 前次运行”切到 Lineage original 并更新图，再点击“后续运行 →”恢复 revision 与 Review／Revise／Deliver 三段。实拍 `.cache/zcode-lineage-ui.png`，结果 `.cache/zcode-lineage-ui-result.json`。本次同时修复 Amend 工具卡片缺少产物入口；并发 retune 卡片显示“已调整并发”的接线未做真实操作，不据此宣称 Desktop/Windows 或所有 UI 通过。

## Pi 0.10 启动钩子

一个最终 `installed-pi-start` 原生 alpha fixture 已通过：异步 input 后模板展开、handler 快照串行、可变 options/getSystemPrompt、字面完整 force 的进入/连续替换/退出、自定义消息原生来源、动态工具新增/同名替换/显式 loadout/setActiveTools、逐条 steer 和排队 follow-up 的单次启动、handled 零模型请求、输入/启动回调异常继续，以及原生队列持久后故障冷恢复的字面扩展输入。独立原生资源用例检查 SYSTEM/APPEND、技能、模板和 native inbox 接线；普通 Pi 四种工具配置的提示词字节与前版一致。构建及身份/会话设置快速回归通过。

用例采用脚本 provider，不代替真实模型长期任务；未新增 Desktop/Windows 扩展 UI 全面验收。Pi 的工作模式改为静态“执行（Pi 默认模式）”，不暴露未实现的模式选择。force 由 DSH 原生日志和请求序列首条归一化承载，区别于原厂请求投影；0.10 当时 custom display 仅保留 metadata，0.11 的默认展示核验见下文；完整历史 context/TUI/JSONL 扩展仍有差异。

Pi 自定义消息展示在单个隔离 alpha Web 会话中完成实际点击和明暗实拍：类型标签、Markdown 标题/列表/代码均可见；display:false、details 和 image blocks 不进入默认展示；原生 provider 请求及事件保留隐藏文本与图片。证据 `.cache/pi-display-native-evidence.json`、`.cache/pi-display-ui-result.json` 与明暗截图。过程折叠仍由 DSH 管理，rc.2 本轮只有实际 ASAR 接口核对，未扩桌面/Windows 或五产品矩阵。

## Pi 0.12 生命周期通知

最终唯一 `test/installed-pi-lifecycle.test.mjs` 原生 alpha fixture 通过，body 6819.566 ms、total 11404.65 ms；证据 `.cache/pi-lifecycle-native-evidence.json`。使用单个隔离宿主和 scripted provider，实际核对串行 agent_start/turn_start/agent_end、首请求动态工具与 guard、纯 handler 异常后继续、结束维护等待期间人工新输入使用新的 force、仅结束回调续投保留原 force、超过 2 MiB 的完整中文消息，以及用户取消后通知 signal 已 aborted 且不能续跑。traced Session lookup 和人工输入边界修复包含在本轮实现范围。

agent_end 的 messages 来自当前 scope 实际 append-origin 消息，完整保留 text/image/toolCall/thinking，native-only 块保留结构；api/stopReason 沿用原生 Pi replay 或原生 finish 映射，native usage 保留，不猜 Pi SDK 费用或宣称全部签名全等。双向严格重组的完整消息上限 128 MiB、JSONL frame 上限 2 MiB，超限或完整性失败明确拒绝，不截断为成功。ctx.sessionManager 仍为最多 100 条、每条文本 4000 字符的有界只读视图。

通知适配 DSH 实际 activity/请求 step，一个 step 为一次 provider response 及工具批次；原生 turn/end 入账之后由 idle 同步预占 runMaintenance，whenIdle/teardown 等待结束回调。用户取消后禁止 exec/executeTool/sendUserMessage/UI 问答续跑，notify 与只读查询可用；disposed 不新建结束 maintenance。该停止约束及 native retry、原版低层 run/pre-settle 差异仍保留。

未实现可编辑 turn_end/agent_before_settle、draft/context preview 与完整历史变换、自定义 TUI renderer。rc.2 核心 loop/Session 只做只读字节核对，没有据此宣称 rc.2 真实全 hook、Desktop 全面运行或 Windows 验收。该 fixture 不证明真实模型长期任务质量；发布与部署也须另以实际完成结果核对。
