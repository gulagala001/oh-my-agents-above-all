# Cursor 文件 checkpoints

`src/checkpoints.mjs` 在 DSH 原生工具和会话上提供有界文件恢复：捕获 Cursor 会话实际 `write`/`edit` 触及的工作区 UTF-8 文本文件，按原生 turn/callId 关联首个修改前和最后一个工具执行后的精确字节。恢复只修改这些文件，保留用户消息、工具结果和其他原生会话事件。模块不创建 Git 仓库、仓库索引、全仓扫描、另一份执行历史或自定义 Session 事件。

## 原生来源与必要补充

核对版本：`@deepseek-ai/dsh-workspace-changes@0.2.1-alpha.1`，来自 [官方 DSH 仓库](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/deliverables/workspace-changes)，MIT。本次安装包 `lib/index.js` SHA-256 为 `ec7bde02794f32faa654c796144deab8c3bda40229019db49a96fb51d220690f`；实际类型在同包 `lib/types/types.d.ts`，包版本由 lockfile 固定。

原生 `workspaceChanges` 只有 `summary(sessionId, seq)` 和 `diff(sessionId, seq, index, signal)`；`workspace/changes` 事件只存 turn。TurnRecorder 私有目录保存 Git 快照或文件副本，公开 diff 返回三行上下文 hunks 与 before/after 是否存在，不公开原始字节、完整哈希或 restore。`compareText()` 会补终止换行，不能从 hunks 精确反推 BOM、CRLF、终止换行或任意原始字节。私有 Git 对象目录不属于仓库对象库，summary 中的 tree ID 也不等于可从仓库直接读取的完整快照。

原生 diff review 继续通过上述服务读取，每 turn 使用最新宣布 seq，沿用原生对 shell 改动、忽略文件、二进制、oversized 等的覆盖与限制；Session dispose 或宿主重启后，旧原生 diff sidecar 不再可用。OMAA 仅为可恢复的文件补充精确字节和小元数据，以支持冷恢复；不扫描、读取或依赖原生私有临时目录。

## 捕获与保存

`tools/execute` around hook 在原生 body 开始前读取 baseline，await 原生 next 结束后，在 finally 读取实际 after。固定 DSH 的 `dispatchToolBody()` 明确等待已启动 body quiescence 后才将结果标为 ABORTED，因此取消/失败但已发生写入也会按实际 after 记录，不把 error 视为“没有改动”。连续调用同一 turn 的同一文件保留首个 baseline 和最新 after；两个调用之间出现不匹配内容则标为 intervening change，拒绝自动恢复。

字节不做字符串或换行归一化。合法 UTF-8 的 BOM、CRLF、无终止换行、空文件均按 SHA-256 内容寻址保存；带 NUL 或非法 UTF-8 视为二进制，明确不提供恢复。每文件最多 2 MiB，每 turn 最多 64 个文件，最多保留 32 turns，引用内容合计最多 64 MiB；超限和不完整捕获标为不可恢复。元数据上限 512 KiB。只清理本 Session 私有 content 目录中不再引用的哈希内容，不清理工作区文件。

目录由主集成提供的 `ctx.omaa.checkpointDirectory` 指定，预期位于 `DSH_HOME/omaa/checkpoints`。每 Session 使用 ID 的 SHA-256 子目录，内含一个 `checkpoint.json` 和 content-addressed `content/`；私有目录与内容链接拒绝符号链接。元数据绑定 Session ID、canonical workspace、目录身份、turn、相对路径、callIds、before/after 内容 hash、字节数、权限及文件/父目录身份。保存使用临时文件再 rename；没有增加原生会话事件。

## 恢复契约

接口由用户明确点击触发，不是模型工具，也不绕过原生工具 sandbox/批准能力。恢复要求 Session idle；每个被选文件必须属于该 checkpoint 捕获范围。

恢复先对整组选中文件预检：当前 bytes、mode、inode 和父目录身份必须匹配记录的 after，baseline 内容文件必须通过 hash/size 校验，目标与父目录不得为 symlink，目标不得为 hardlink，路径必须在绑定工作区内。已有手工修改、同内容但 inode 被替换、目录替换、根目录替换、损坏或越界元数据都拒绝写入。之后每个文件临写前再次核对；完整 bytes 通过相邻临时文件恢复，保留原 mode；原本不存在的新文件在确认 after 完全匹配后删除；原本存在但 after 不存在的文件通过排他的创建恢复，不覆盖新出现的文件。

成功返回 `ok/restored/changed/notRestored/conflicts/partial`。全组预检不通过时没有文件发生恢复；途中失败则返回实际已完成恢复、确已执行文件变更、剩余文件和具体错误，不声称跨文件原子性。已确认恢复记录支持幂等重试。恢复旧 turn 时当前文件仍须匹配那个 turn 的 after；后续工具或手工修改不会被强行覆盖。

当前覆盖是实际 `write`/`edit` 触及的工作区文本文件。shell-only 文件变更、工作区外路径、二进制、超大文件、额外目录结构和未捕获文件不提供此精确恢复能力，仍可由原生 review 显示其实际可用 diff。删除的父目录不会由文件恢复伪造回来。

## 主集成接口

```js
const store = createCheckpointStore(directory, { workspaceChanges, isIdle });
store.install(cursorScope);
await store.inspect(session.id, session, { turn, seq, index, signal });
await store.restore(session.id, session, { turn, paths, signal });
```

`apply(ctx)` 使用 `ctx.omaa.checkpoints ??=` 只初始化共享 facade 一次，每个 Cursor scope 仅安装自身的 hook/系统段，重复 install 同一 scope 不重复注册。`inspect` 组合精确字节记录和原生 review；给 seq/index 时只通过原生 diff 服务读取比较，不用存储恢复逻辑替代原生 review。默认缺少 isIdle 时拒绝恢复，主 API 仍需先 resolveAgent 并检查 idle、认证和明确恢复请求。

恢复后 metadata 更新 `restoredAt/lastRestoredPaths`。scope 的 `deployment:cursor-restored-files` 系统段 order 15 注入实际事实：用户已恢复哪些文件、会话消息仍保留、早前 assistant 结论可能描述旧内容、后续编辑前重新读取。路径用字面 JSON 与 XML 转义，冷启动 assembly 前按需加载元数据；没有伪造用户消息或重排首个系统消息，原生 filesystem observation cache 没有被篡改。

## 并发边界与核验

模块内部按 Session 和文件串行化捕获/恢复。portable Node filesystem 没有原始 bytes 的 compare-and-swap，也无法强制不合作外部进程遵守锁；最后内容检查与 rename/unlink 系统调用之间仍存在很短的外部竞态窗口。DSH `writeText` 的 version guard 会进行文本归一化，不能用于精确 bytes 恢复，因此没有虚构原子 CAS。跨文件恢复的非原子性通过结构化实际结果处理；内部竞态细节留在开发说明，用户界面只展示实际恢复、冲突或失败。

针对性 Node 文件执行覆盖精确字节与 mode 往返、冷加载、新文件删除、多次修改和 late-cancel after、整组预检、手工内容/inode/父目录/工作区替换、symlink/hardlink、二进制/超限/越界、坏 hash/外来元数据、部分恢复、私有 content 链接防越界及 Cursor scope 隔离。入口：`node --test test/checkpoints.test.mjs`。这些直接文件测试不替代主集成的原生 DSH capture、API/按钮、冷恢复和冲突往返；后者由主模型完成重要验证。
