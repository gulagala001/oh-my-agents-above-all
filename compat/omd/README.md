# OMD 配对附件

当前未发布 OMAA `0.14.1` 候选配对 OMD `0.12.0`。两宿主 OMD 延续已整合的 OMAA 薄桥接；`integrated-baseline` 按固定源码提交的完整发行 payload 核验，只追加 `omaa-compat.json` 与 manifest 白名单项。

| DSH 宿主 | 未发布 OMD 基线 | 审定规则 |
| --- | --- | --- |
| `0.2.1-alpha.1` | `0.2.1-alpha.1.omd.0.12.0` | [alpha-0-12.json](alpha-0-12.json) |
| `0.2.0-rc.2` | `0.2.0-rc.2.omd.0.12.0` | [rc2-0-12.json](rc2-0-12.json) |

规则绑定完整 `sourceCommit`、manifest SHA、SDK、工厂、vendor、客户端、发行白名单与每文件 SHA。候选未发布，`sourceTag:null` 不冒充存在的发行 tag；[alpha.json](alpha.json)／[rc2.json](rc2.json) 保留兼容性工程的 `0.11.0` 未发行基线；公开 `0.10.0` 来源和规则按对应历史 tag 回查，当前配对不借用这些旧规则。

先从规则中的固定 commit 生成隔离 `git archive` 源码快照，再运行 `npm pack --ignore-scripts`。不可从混入未提交文件的工作树重新计算规则并声称来源已绑定。使用对应 tgz 构建：

```sh
pnpm install --frozen-lockfile
node scripts/package-omd-compat.mjs --base /absolute/path/committed-alpha.tgz --host-version 0.2.1-alpha.1 --omd-version 0.12.0
node scripts/package-omd-compat.mjs --base /absolute/path/committed-rc2.tgz --host-version 0.2.0-rc.2 --omd-version 0.12.0
```

省略 `--omd-version` 时从当前宿主审定基线完整版本推导。输入／输出版本必须等于该基线；未知文件、内容漂移、链接、SDK／manifest 差异均停止，不重建或放宽原生工厂。`.npmignore` 排除内部模拟器、测试和维护文件；配对构建器只接收实际发行包，不接收整棵源码。

输出默认 `dist/`，可用 `--out-dir` 指定新目录。完成或失败后均清理临时 staging，不改输入包和用户 profile。准备配对附件后，本地 `verify-release.mjs --source-commit <OMAA完整提交> --assets <目录>` 校验四包十二附件；该入口不执行远端发行验证。公开发布前必须先让固定源码实际可获取，再审定真实 source tag 与完整 tag／Release 契约。

来源 metadata、包内兼容记录与 overlay SHA 精确绑定规则原始字节，完整 payload 不可通过重新计算 sidecars 绕过。OMD 更新在 OMAA 启用时委托同一配对服务，OMAA 禁用时暂停，卸载后恢复独立路径。安装仍使用宿主原生插件管理器。

## 历史发行模式

历史 OMAA `v0.2.1-alpha.1.omaa.0.13.0` 配对两宿主的官方 OMD `0.9.0`，使用当时的 `integrated-baseline` 规则。原 tag 的 manifest、逐文件 SHA 与附件继续按其固定来源核验，不借用当前候选 `0.12.0` 的规则。

历史 OMAA `v0.2.1-alpha.1.omaa.0.12.1` 配对 OMD `0.8.1`，以两端官方 `0.6.1` 为底稿，通过审定 overlay 添加桥接。旧 tag 保存当时的 `alpha.patch`、`rc2.patch`、additions、基线及修改后文件 SHA；幂等校验静态回查该 tag 的规则，不借用本版基线，也不执行 tag 中的代码。历史来源如下：

| DSH 宿主 | 历史官方 OMD 底稿 | 固定 commit |
| --- | --- | --- |
| `0.2.1-alpha.1` | `0.2.1-alpha.1.omd.0.6.1` | `95fbfc4428834e98a033fb4724b990a8796bd2d5` |
| `0.2.0-rc.2` | `0.2.0-rc.2.omd.0.6.1` | `d29b75c98a0f6575af5880497c4d970125eeedf2` |

升级基线时，先审阅固定新 commit 与官方包的实际差异，再更新对应规则和 payload SHA，运行打包与原生验收。未知版本、同版本内容漂移、新文件或冲突均明确停止。此目录不保存用户配置、凭据、本地维护文件或缓存。
