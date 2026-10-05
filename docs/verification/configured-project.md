# 配置免费模型的多文件工程验收

2026-10-05，使用用户指定的现有 `opencode-zen/space-bunny-free` 路由，在隔离 DSH home 安装当前 OMAA；没有修改真实 profile、默认模型或凭据。真实源配置与 credentials 文件前后哈希一致。

任务材料：`test/fixtures/configured-project/project/`，零依赖 Node ESM CSV 任务导入工程。README 公开全部 API、CSV、priority、纯 upsert、错误 code/逻辑 record row 与 CLI dry-run 合同；AGENTS 冻结原测试/材料，允许修改 src 和新增测试。原子性缺陷先由原测试实际复现。外部 acceptance 位于工作区外，不靠模型完成声明或任务文本 marker；检查实际 API、冻结输入、CLI 子进程、磁盘字节、原文件哈希及测试结果。

首轮产物保留于 `.cache/configured-project/2026-10-05T10-57-51-254Z/`：总 results.json、每产品 result.json、实际 src/test。模型仍有工作的超时不记成功。原生摘要只保留工具名、调用身份、错误/测试状态和尾部事件类型，不含密钥或模型端点。

| 产品 | 实际结果 |
| --- | --- |
| Codex | CSV/priority/upsert/输入原子性及错误码通过外部检查；CLI dry-run、自己新增测试与最终原生成功测试执行未完成，300 秒超时。 |
| Cursor | CSV 部分实现，业务 upsert/原子性/priority/dry-run 等仍缺，300 秒超时。 |
| Pi | CSV 与 malformed quote 部分实现，业务及 dry-run 仍缺，300 秒超时。 |
| Grok Build | 保留原实现，已有失败测试确实运行；尾部出现 llm/retry/retry-started，300 秒超时，原因尚未证实。 |
| ZCode | 路由正确，读取工程后进行一次 shell 调用；21.7 秒出现首个 turn/end，工程未实现。该次没有保存 end reason，不能将其归因为模型、提示词或后台作业。 |

所有产品的原 AGENTS/README/package/tests/fixtures 哈希均保持。此轮整体没有通过完整工程验收；没有收窄需求、修改评分脚本来通过，也没有自动重跑这些失败产品。

首轮所用旧 installedHost cleanup 删除了临时原生 session journals；收到保留冷状态指示后仍未能及时保存，因此不能声称这五个首轮 session 已经冷恢复。工作区结果与结构化评判依据已经保留。后续测试已将 capture hook 放在 fixture cleanup 前：停止自己创建的 host，逐个解码 native 多帧 zstd journal，精确扫描选中实际 key/baseURL/origin；含受保护数据的 journal/workspace拒绝保存并报告。仅复制原生 session journal 和 workspace，排除 credentials/profile/settings/进程日志，保留实际 sessionId/cwd。该捕获逻辑通过本地安全样本检查；后续同 ZCode session 的真实冷续聊结果见下文。

## ZCode 单产品复现与真实环境缺陷

主模型 working-policy composition 安装通过后，保持原 README/task 不变，ZCode 单独使用 600 秒预算复现。结果通过全部外部工程验收，实际用时约 526.5 秒；原生 turn/end 为 completed，没有 retry。三模块功能、原子错误/逻辑记录行号、CLI dry-run、原文件保护、新增测试及实际测试执行均通过，未由助手补写模型代码。

证据 `.cache/configured-project/2026-10-05T11-17-45-426Z/` 保存 results、native-view、assistant-text、外部验收脚本、生成 src/test，以及完整原压缩 journal 和解码全文。安全快照没有拒绝项，原 session 为 `session-d3cdf070-12f0-4e85-8589-10f5c869ba30`，原 absolute cwd 同时记录在 native/manifest.json；没有复制 credentials/profile/settings，实际 key/baseURL/origin 扫描无命中，真实配置前后未改。此成功是新的一次单产品复现，不冒充首轮五 session 已恢复。

原生工具记录证实一个真实测试环境缺陷：installedHost 继承了外层 Node runner 的 `NODE_TEST_CONTEXT=child-v8`、`NODE_TEST_WORKER_ID=1`，导致工程 `npm test` 里的 `node --test` 报递归调用并跳过文件，零执行也可退出 0。ZCode 实际复现该环境问题，并用清除这两项的环境运行原/新增测试。主模型与 helper 所有者已在后续 child env 移除它们。首次外部 grader 一直使用最小环境，所以它的 API/CLI 判定仍有效；旧 native shell 的退出 0 不能作为真实测试通过证据，也不能据此解释产品提示词或模型性能。

## 同 session 冷恢复追加需求

已准备同一成功 ZCode session 和原 cwd 的独立冷启动：仅重建已由我们删除的临时路径，复制原生 journal，以原生 session controller resolve 激活，禁止 session/create。先调用公开 commands/execute `/compact`，核对事务、首个 system、turn 边界和工具配对，然后以用户追加请求新增 CLI `--report <path>`；normal/dry-run 都写完整 preview JSON，validation error 保持 tasks/report 原字节。原全部公开合同、原测试与冻结材料继续保护，外部 grader 独立检查。此场景已通过真实验收：原 sessionId/cwd 不变，原生 controller 冷恢复与 `/compact` 事务成立，首个 system、原 turn 边界及工具配对保持；追加任务约 211.6 秒，原生 end reason 为 completed。外部验收确认原全部合同继续成立，normal/dry-run 和两种参数顺序的 report 均等于 stdout 完整 preview，validation error 保持已有 tasks/report 原字节且不创建原本不存在的 report。冻结材料与全部既有测试未改，模型新增报告测试，原及新增测试实际通过。

证据：`.cache/configured-project/2026-10-05T11-36-50-814Z-cold-report/`，包含 compaction-view、完整 native-view、assistant-text、results、评判脚本以及原压缩 journal/解码全文和工作区安全快照。snapshot rejected 为空，真实配置/credentials 哈希不变。此后按用户时间优先要求收尾，不再扩题或重跑其余四产品；首轮其他产品未完成的事实仍保留。
