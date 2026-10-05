# Cursor 项目规则

`src/cursor-rules.mjs` 实际读取当前工作区 `.cursor/rules/**/*.mdc` 和旧根 `.cursorrules`，仅由 Cursor composition 挂载。模型、工具循环、会话仍由 DSH 承载。

字段优先级按 [Cursor 官方 Rules 文档](https://cursor.com/docs/rules)（2026-10-05 核对）：`alwaysApply:true` 自动包含；否则 globs 只匹配实际在上下文的文件；无 globs、有 description 的规则先提供描述供 Agent 选择；两者都无则必须明确提名。`.md` 不作为 MDC 规则。本文实现不访问 Cursor 全局/团队规则或账户。

```js
const { automatic, available } = await loadCursorRules({
  cwd: '/absolute/workspace',
  paths: ['src/component.tsx'],
  requested: ['architecture'],
});
```

automatic 元素 `{name,content,reason}` 的 reason 为 alwaysApply/glob/requested；available 只含 Agent Requested 的 `{name,description}`，不会暴露尚未选择的规则正文。嵌套名称为相对 `.cursor/rules` 的路径去掉 `.mdc`；明确请求接受 name、filename、`@name`，basename 只有唯一时可用。旧 `.cursorrules` 按纯文本总是应用。

frontmatter 使用 js-yaml 的 JSON_SCHEMA；支持 boolean、quoted/plain descriptions、多行 description、globs 字符串/数组。多个 glob 按逗号分隔，同时保留 `{a,b}` 和字符类内的逗号；匹配采用 Node >=22.19 `path.matchesGlob`。兼容 Cursor 常见未加引号的 `**/*.ts` glob；不执行 YAML tag、命令或规则正文中的 `@file` 引用。

插件在实际 `system-prompt/assemble` middleware 重新读取文件并准备该 agent 的 WeakMap 缓存，然后原位替换本次 assembly 中 `omaa:cursor-rules` 的 text；保留其它 section 与 `interpolate:false`，规则里的 `{{...}}` 仍是字面内容。DSH 顺序是 inbox claimed → assemble → pre-step，section.text 又在 middleware 之前求值；因此不能仅靠 pre-step 或缓存更新，首请求 always/manual 以及 read 后紧接的请求都直接使用本次返回的规则文本。`agent/inbox/claimed` 只记录真实用户提名，供同一次 assemble 消费；不新增 user 消息注入层、不改已有工具 schema。规则编辑、删除在下一次请求装配时反映。

成功的 tools/result 对 read/edit/write 捕获真实 arguments.file_path，保存最近 256 条路径；按工作区规范化后触发 glob，不扫描源文件树。外部路径和解析到工作区外的 symlink 路径不会触发。用户明确的 `@ruleName` 可加载手动规则；`cursor_rule({name})` 只接受已发现名称，工具结果仅确认“下一 step 请求”，下次装配才应用正文。该工具也可供 Agent 从描述目录选择规则。

当前 DSH 文件上传 attachment 只有存储 ID、显示名、bytes，显示名明确不是路径；它不会被猜成工作区文件。只有实际 path-backed 文件 part 明确提供 file_path 时才可作为路径输入，普通上传需后续真实 read/edit/write 对工作区文件操作才能触发对应 globs。没有读取或推测 IDE 开放文件。

只扫描 rules 子树，最多 512 个目录项、128 条规则、12 层、单文件 32KiB、读入总量 256KiB、最终规则 context 64KiB。拒绝 `.cursor`/rules/规则文件 symlink，拒绝硬链接与非普通文件；开启文件时使用 O_NOFOLLOW、检查 inode/dev 和真实工作区范围，定长读取防止文件增长绕过预算。不存在规则目录是正常空结果；解析错误、权限/读取失败、超预算则抛出错误，插件会清除本次规则缓存并明确显示“规则未应用”，不会带旧正文冒充成功。

针对性测试：`node --test test/cursor-rules.test.mjs`。覆盖字段优先级、根/嵌套 glob、YAML/旧规则、手动选择、修改刷新、literal 插值保护、描述正文隔离、scope 隔离、路径逃逸、符号/硬链接、预算及失败提示；必要时序回归按真实 assemble-before-pre-step 顺序核验首请求 always/用户 manual、read 后下一请求 glob 和当前请求更新。宿主真实 composition 接线和 provider payload 另由主代理验证。
