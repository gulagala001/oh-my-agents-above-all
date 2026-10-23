# 开发与贡献

OMAA 是 DSH 预设与界面插件。模型/API、工具执行、权限、会话与恢复由 DSH 负责。[来源资料](docs/product-sources.md) · [架构](docs/architecture.md) · [兼容边界](docs/compatibility.md)

## 本地构建

使用 Node.js `>=22.19` 和 pnpm `11.28.5`：

```sh
pnpm install --frozen-lockfile
pnpm build
npm pack
```

主分支精确绑定 DSH `0.2.1-rc.2` SDK；rc.1 的固定 tag 保存对应源码、组件、生成配置与依赖锁。切换宿主必须使用完整独立构建，不能仅更改包名或放宽 peer。按实际改动选择必要的定点检查，避免无关矩阵。

## 发行

包、tag 与宿主使用完整版本，如 `v0.2.1-rc.2.omaa.0.15.4`。每个 tag 对应一个宿主的 `.tgz`、SHA-256 与公开元数据，下载入口固定到该 tag。可选 OMD 直接从其同宿主发行页获取。

`node scripts/public-files.mjs` 检查 Git 清单，`npm pack` 的 prepack 和 CI 检查实际包清单。归档可另用 `node scripts/public-files.mjs --archive /absolute/path/package.tgz` 检查。安装包仅包含产品源码、生成模块、必要文档、许可及来源；本地计划、真实会话、验收流水、凭据和缓存不公开。

CI 冻结安装当前宿主依赖、构建并检查实际包。tag workflow 仅核对公开清单与版本；附件通过固定发行流程上传，避免旧宿主矩阵重新生成另一套包。

历史 OMD overlay 和 integrated-baseline 的来源核对器保留在 [compat/omd](compat/omd/README.md)，不用于当前 rc.1/rc.2 的主项目独立 OMD 构建。

## 材料与隐私

原创贡献采用 Apache-2.0。保留第三方许可、署名、固定来源与适配说明；Cursor 样本权利边界见 [许可范围](LICENSING.md)。测试保留维护所需的合成 fixture，使用隔离临时目录，不提交真实会话或账号数据。

ZCode 的构建输入保存在 `src/presets/zcode/sources/`：`source.json` 记录产品来源，`build-inputs.json` 记录记忆、profile、日历和子任务结果协议构建输入，以及定时定义／次数生命周期、MCP 借用／子任务工具限制参照的原文和哈希，`temporal.json` 固定 Temporal／JSBI 构建字节。更新源码时同步清单与许可，构建会校验实际输入。`build-zcode-calendar.mjs` 提取原厂日历计算与规则等价函数；宿主接线和持久更新在 calendar-chain／finite-schedule 模块中维护。`build-zcode-compiler.mjs` 还生成纯 ask 协议模块，原生回合与收据适配保持在 `actors.mjs`／`run-cache.mjs` 中。`upstream/` 与 `upstream-3.15.1/` 分别保留仍有消费者的固定版本；不要将临时研究副本放入这些目录。恢复报告、测试流水与历史备份只留本地；公开文件门禁同时禁止 `docs/recovery/` 和交接快照文件。

文档结构、语言对应和页面变更流程见[文档维护规范](docs/documentation.md)，检查命令：`npm run docs:check`。

Grok／Cursor 队列共用的真实宿主组件与许可保存在 `src/client/sources/grok-queue/`。更新时同步 `source.json` 的 npm 版本、原包及片段哈希；只在 `scripts/build-grok-queue.mjs` 维护必要适配。构建检查输入哈希和每个替换点，CI／prepack 已运行该构建；产品用法与来源分别原位维护于 `docs/products/grok.md`、`docs/products/cursor.md` 和 `docs/product-sources.md`。共享接线维护在 `src/host/message-queue.mjs` 与 `src/client/preset-queue.jsx`，不要为各预设另存一份原生 inbox 或组件快照。

Grok 随包转换引擎通过 `scripts/build-grok-documents.mjs` 构建，包含 `build-grok-codecs.mjs`。更新引擎必须同步精确开发依赖、锁文件、`src/presets/grok/codec-sources.json` 和其中指向的原始许可；输入哈希、版本、唯一 WASM 内存及最大页数在构建时核验。产品用法、来源与接线说明分别维护在现有 Grok 产品页、来源页和架构页。引擎仅在构建时打包，转换器运行时不得下载程序或绕过原生文件权限。

Grok 调度事务使用版本锁定的宿主内部 FIFO 薄适配。固定模块及方法哈希只在 `src/presets/grok/source.json` 的 `schedulerAdapter.transactionCompatibility` 维护；`scripts/build.mjs` 与运行时消费同一来源记录。改变宿主版本或实现时须检查原生串行队列、域写入、取消、派发和卸载契约，并运行对应的原生调度主流程。产品用法、兼容边界和内部接线分别原位维护在现有 Grok 产品页、兼容页、架构页与来源页。

Pi 上下文与原生请求边界由 `scripts/build-pi-loop.mjs` 构建。边界投影直接提取固定原厂 `session-manager.ts`／`messages.ts`，在同一构建中核对来源哈希；验证应覆盖草稿串行预览、原生继续／停止、冷恢复和未改动附件身份。固定 npm transcript/text 原文保存在 `src/presets/pi/sources/npm-pi-ai/`；宿主依赖原始模块、方法、helper 与许可哈希统一维护在既有 `src/presets/pi/source.json`。构建经 build／CI／prepack 校验来源及唯一适配点，运行时检查实际方法后只安装到 Pi 实例。升级须核对冻结前的异步边界、原生工具／流／重试和取消，并运行受影响的原生主流程；不得修改已冻结的 llm/stream 请求。使用说明、兼容、架构和来源在现有页面原位维护，不新增验收页面。
