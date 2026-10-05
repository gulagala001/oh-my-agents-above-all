# OMD 兼容附件

此目录把 OMAA 所需的 OMD 接口维护为可审阅、可重复打包的最小补丁。输入为官方 OMD `0.6.1`，输出为对应宿主 `omd.0.7.1`（可用 `--omd-version` 指定后续三段版本）；OMAA 自身仍由 `scripts/package.mjs` 打包。发行附件交付 tgz、SHA256 和来源元数据，安装使用宿主原生插件入口。

| DSH 宿主 | 官方 OMD 基线 | 固定 commit | 补丁 |
| --- | --- | --- | --- |
| `0.2.1-alpha.1` | `0.2.1-alpha.1.omd.0.6.1` | `95fbfc4428834e98a033fb4724b990a8796bd2d5` | `alpha.patch` |
| `0.2.0-rc.2` | `0.2.0-rc.2.omd.0.6.1` | `d29b75c98a0f6575af5880497c4d970125eeedf2` | `rc2.patch` |

基线来自 [OMD 源码与发行](https://github.com/gulagala001/oh-my-dsh)。准备对应 tag 的官方 tgz，或该 commit 的源码目录：

```sh
pnpm install --frozen-lockfile
node scripts/package-omd-compat.mjs --base /absolute/path/official-alpha.tgz --host-version 0.2.1-alpha.1
node scripts/package-omd-compat.mjs --base /absolute/path/official-rc2-directory --host-version 0.2.0-rc.2
```

输出默认进入 `dist/`；`--out-dir` 可指定其他目录。构建只在临时目录复制发行白名单，完成或失败后清理临时目录，不改变输入包和用户 profile。需本地 Node、npm、git、tar 及本仓库锁定的 esbuild；不会自动下载或执行其他产品客户端。

`*.json` 记录基线 manifest 与完整发行文件哈希、补丁哈希、修改后文件哈希；`*.patch` 只改桥接接线、Ultracode 装配状态、CodeGraph 挂载顺序、外观 ownership 和 OMAA 草稿设置迁移，`additions/` 保存 enhancement/coordinator 两个独立薄模块。原模型请求和工具说明沿用底稿。保留两端各自 projectless、native inject、transferOptimizer，以及 rc.2 的 legacy draft recovery。

脚本只重建 browser client 与皮肤 JSON，构建前后核对 `lib/host`、`vendor`；不导入会连带执行 `build-host.mjs` 的官方 `build.mjs`。因此 rc.2 的原生 workflow factories 不会被 alpha 工厂覆盖。包内新增 `omaa-compat.json` 记录来源，package 版本与 release manifest 同步。

上游升级时，从固定新 commit/官方包开始，审阅当前补丁涉及的契约和上游差异，更新对应补丁、完整基线及修改后哈希，再运行打包和相关行为检查。未知版本、同版本内容漂移、新文件或冲突会指出文件并停止；不能改版本号绕过核对。此目录不保存用户配置、凭据、本地维护文件或缓存。
