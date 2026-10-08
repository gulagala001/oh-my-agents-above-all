# OMD 配对附件

本版 OMAA `0.13.0` 配对 OMD `0.9.0`。OMD 官方分宿主源码已整合完整 OMAA 薄桥接；这里的审定规则采用 `integrated-baseline` 模式，核对并保留官方发行 payload，输出配对 tgz、SHA256 和来源 metadata。OMAA 自身由 `scripts/package.mjs` 打包，安装仍使用宿主原生插件入口。

| DSH 宿主 | 官方 OMD 基线 | 审定规则 |
| --- | --- | --- |
| `0.2.1-alpha.1` | `0.2.1-alpha.1.omd.0.9.0` | [alpha.json](alpha.json) |
| `0.2.0-rc.2` | `0.2.0-rc.2.omd.0.9.0` | [rc2.json](rc2.json) |

每个规则中的 `sourceCommit`、`sourceTag` 和文件 SHA 固定绑定该宿主的官方来源。两端各自保留 SDK、工厂、vendor、客户端与锁定来源，完整输入／输出 OMD 版本必须相同。基线来自 [OMD 源码与发行](https://github.com/gulagala001/oh-my-dsh)。

准备对应宿主的官方 `0.9.0` tgz：

```sh
pnpm install --frozen-lockfile
node scripts/package-omd-compat.mjs --base /absolute/path/official-alpha.tgz --host-version 0.2.1-alpha.1 --omd-version 0.9.0
node scripts/package-omd-compat.mjs --base /absolute/path/official-rc2.tgz --host-version 0.2.0-rc.2 --omd-version 0.9.0
```

从源码生产官方输入时，先检出规则中的固定 commit，并运行 `npm pack --ignore-scripts`，再把所得官方 tgz 交给配对构建器。源码树包含内部模拟器和测试材料，官方 pack 按已审定的 `.npmignore` 排除；配对构建器严格拒绝把这些额外源码文件当作发行 payload。CI 与 tag 发行复用这一条路径。

输出默认进入 `dist/`，`--out-dir` 可指定其他目录。构建只在临时目录处理官方发行白名单，完成或失败后清理临时目录，保持输入包和用户 profile。需要本地 Node、npm、git、tar 及本仓库锁定依赖；不会自动下载或执行其他产品客户端。

`*.json` 记录完整 manifest SHA、官方发行文件白名单与逐文件 SHA。`integrated-baseline` 明确声明 `patch:null`、空字节 SHA、空 additions/patchedFiles；构建保留原客户端、皮肤、发行说明、`lib/host` 和 `vendor`，仅追加 `omaa-compat.json` 与其 manifest 白名单项。来源 metadata、包内兼容记录及 overlay SHA 精确绑定规则原始字节；准备和发布校验还复核包内完整 payload，不能靠重算外部 sidecars 接受内容漂移。

OMD 的版本检查／更新在 OMAA 启用时委托给同一配对发行服务；OMAA 禁用但仍安装时暂停这条路径，卸载后恢复原独立更新方式。安装后重载当前 profile。

## 历史补丁模式

历史 OMAA `v0.2.1-alpha.1.omaa.0.12.1` 配对 OMD `0.8.1`，以两端官方 `0.6.1` 为底稿，通过审定 overlay 添加桥接。旧 tag 保存当时的 `alpha.patch`、`rc2.patch`、additions、基线及修改后文件 SHA；幂等校验静态回查该 tag 的规则，不借用本版基线，也不执行 tag 中的代码。历史来源如下：

| DSH 宿主 | 历史官方 OMD 底稿 | 固定 commit |
| --- | --- | --- |
| `0.2.1-alpha.1` | `0.2.1-alpha.1.omd.0.6.1` | `95fbfc4428834e98a033fb4724b990a8796bd2d5` |
| `0.2.0-rc.2` | `0.2.0-rc.2.omd.0.6.1` | `d29b75c98a0f6575af5880497c4d970125eeedf2` |

升级基线时，先审阅固定新 commit 与官方包的实际差异，再更新对应规则和 payload SHA，运行打包与原生验收。未知版本、同版本内容漂移、新文件或冲突均明确停止。此目录不保存用户配置、凭据、本地维护文件或缓存。
