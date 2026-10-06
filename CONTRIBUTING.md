# 开发与贡献

OMAA 是 DSH 预设与界面插件。模型/API、工具执行、权限、会话与恢复由 DSH 负责；贡献应保持现有边界，避免另建执行器、调度器或账号登录层。各产品完整来源与适配差异见 [来源资料](docs/product-sources.md)、[架构](docs/architecture.md) 和 [验证记录](docs/verification.md)。

## 本地构建

需要 Node.js `>=22.19`，CI 使用 Node 24 与 pnpm 11.23.0：

```sh
pnpm install --frozen-lockfile
pnpm build
node --test --test-concurrency=1 test/preferences.test.mjs test/appearance-coordinator.test.mjs test/preset-controls.test.mjs test/cursor-rules.test.mjs
node scripts/package.mjs --host-version 0.2.1-alpha.1
node scripts/package.mjs --host-version 0.2.0-rc.2
```

这组轻量检查不调用模型、不需要用户 profile 或浏览器安装。其他行为按改动选择相关回归；涉及真实模型或 UI 时明确记录测试范围，不把构建通过或短任务通过等同于全部产品质量。

源码 `package.json` 绑定 alpha.1 SDK；打包脚本仅在独立副本中绑定目标 SDK/loader。两个宿主共享同一 OMAA 源码，不对源码 manifest 来回改版本。`dist/` 输出 tgz、SHA256 和元数据。

## OMD 兼容附件

固定来源、补丁及维护方法见 [compat/omd](compat/omd/README.md)。准备该目录记载的官方 tag/commit 的源码目录或 tgz 后运行：

```sh
node scripts/package-omd-compat.mjs --base /absolute/path/official-omd-alpha --host-version 0.2.1-alpha.1
node scripts/package-omd-compat.mjs --base /absolute/path/official-omd-rc2 --host-version 0.2.0-rc.2
```

构建依赖来自 **本仓库** 的冻结安装，包括锁定 esbuild；不需要另一个 OMD 工作区的 `node_modules`，也不安装或执行官方 OMD 的全量构建。只重新构建客户端与皮肤，保留对应底稿的 native host factories/vendor。未知基线或内容漂移会拒绝并显示文件差异，应审阅上游契约后更新补丁与哈希。

## GitHub 交付

CI 在单个 Linux runner 上冻结安装、构建、运行上述模块检查，打包双宿主 OMAA，并 checkout 两个固定官方 OMD commit 生成兼容包。它将四套 tgz、SHA256 与元数据上传为 `omaa-release-packages` artifact，避免模型/浏览器测试矩阵。

发行 tag 必须是 `v` 加源码 `package.json` 的完整版本，例如 `v0.2.1-alpha.1.omaa.0.1.2`；同一 tag 下包含 rc.2 和 alpha.1 附件。推送发行 tag 或手动运行 release workflow 会重新执行轻量构建、核对 tag/commit 和附件哈希，再创建 draft GitHub Release。维护者确认附件及安装说明后发布 draft；workflow 不覆盖已存在发行。

版本调整、包名、tag 与说明应一致。提示词变更保留固定原文、适配记录和实际工具契约；不要直接用网络新样本覆盖已审阅材料。

## 材料与隐私

原创贡献采用 Apache-2.0；提交者应有权提供其贡献，不将第三方作品声明为自己所有。保留来源文件旁的许可、声明与固定版本信息，遵循 [许可范围](LICENSING.md) 和 [第三方声明](THIRD_PARTY_NOTICES.md)。各原始材料按其保留的许可使用；不得将根许可解释为替第三方补授许可。Cursor 样本的权利边界须单独处理。

不要提交或发行 API key、凭据、用户 profile、原生会话、未脱敏日志、本地缓存或个人维护文档（AGENTS、PROMPT、Computer Use 交接等）。测试使用隔离临时目录和公开合成材料。问题报告说明实际宿主、插件版本、复现步骤及相关错误即可。
