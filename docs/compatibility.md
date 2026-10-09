# 宿主版本适配

[项目介绍](../README.md) · [安装与更新](install.md) · [验证范围](verification.md)

OMAA 与 OMD、相关插件按宿主 API 和能力边界持续适配。关键版本用于回归验收；支持范围会随官方接口、实际用户环境和验证结果调整。

## 本版宿主范围

当前未发布候选 OMAA `0.14.0` 提供同一源码入口的有界宿主适配。源码的 DSH 兼容约束为 `>=0.2.0-rc.2 <=0.2.1-alpha.1`，loader 为 `>=1.0.5 <=1.0.6-alpha.1`。当前实际宿主回归代表为 `0.2.0-rc.2` 和 `0.2.1-alpha.1`；区间声明不表示每个版本均有单独运行记录，也不承诺范围外或未来宿主兼容。

同一源码包在安装后通过宿主原生运行时解析 SDK，更新检查按实际运行宿主选择附件。源码版本的宿主前缀记录构建来源，不替代运行宿主识别。专用发行附件继续保留对应宿主的完整版本前缀。正式版宿主使用 `-omaa`／`-omd`，预发行宿主使用 `.omaa`／`.omd`。

当前候选尚无 tag／Release。已公开版本的 tag 为 `v0.2.1-alpha.1.omaa.0.13.1`；已公开版 rc.2 与 alpha.1 从同一 Release 选择对应宿主的 OMAA `0.13.1` 与配对 OMD `0.10.0`，完整文件名及 metadata 见[安装指南](install.md)。主 tag 的 alpha 前缀不要求 rc.2 用户升级 DSH。

## OMD 与其他插件

独立 OMAA 不要求 OMD。同 profile 的 OMD 需要提供增强、工作流组合与外观协调接口；这些能力须按实际接口检查，不能从 OMD 版本大小推断。缺桥接的旧 OMD 仍会明确阻止预设挂载；请安装当前宿主对应的兼容 OMD 或使用独立 profile。无需为此更换 DSH 宿主。

当前候选配对 OMD `0.12.0`，采用[固定双宿主源码基线](../compat/omd/README.md)。两端源码 commit 分别绑定宿主 SDK、工厂、vendor、客户端与锁文件；`integrated-baseline` 完整校验固定提交快照的发行 payload，只追加配对来源元数据。候选没有公开 source tag，规则明确记录 `sourceTag:null`；历史 `0.10.0` 规则与来源保留原字节。

OMAA `0.14.0` 更新固定 Codex／Pi 来源与工具提示适配，保留完整 Pi 原生消息历史，新增 Cursor 回合改动入口和 ZCode 保存定义的读取／参数填写／运行入口。OMD `0.12.0` 包含 REA 开发调查流程、真实执行证据身份、CU 下载／PTC 文件预览、主题对比度和固定推荐插件核验。候选安装使用本地对应包，不能通过未来 tag URL 获取。
新功能与修复要核对当前支持范围。真实接口缺失的功能明确限制；推荐插件按自己的兼容声明和运行证据判断，不能因 OMAA 通过就认定所有插件可用。

## 维护与验收

范围、loader 约束和代表宿主集中在 `src/host/compatibility.json`；`validationHosts` 是可调整的构建与回归样本。范围内非代表宿主的专用打包需显式 `--host-cli`，核对真实 CLI 与 loader，不能猜测 SDK 版本。

原生回归使用隔离 DSH_HOME、本地模拟模型和实际 tarball，检查 SDK 共享、无版本豁免、五预设工具回合、设置、明暗主题、模式切换、停止、冷重启、启停及卸载。配对 OMD 另验两种安装顺序和增强开关。实际执行的范围与局限见[验证记录](verification.md)；打包成功、模拟模型和条件跳过不代替真实使用验收。

显式原生矩阵入口：

```sh
OMAA_HOST_MATRIX=1 \
OMAA_HOST_CLI=/absolute/path/dsh/lib/bin.js \
OMAA_HOST_VERSION=0.2.0-rc.2 \
OMAA_HOST_PACKAGE=/absolute/path/candidate.tgz \
OMAA_HOST_BROWSER=/absolute/path/chromium \
node --test test/host-compatibility.test.mjs
```

可额外设置 `OMAA_HOST_OMD_PACKAGE` 验证配对共存，`OMAA_HOST_REPORT` 保存证据。未启用矩阵时明确跳过；启用却缺必需参数会失败。CI 对代表宿主分别启动精确官方 CLI，验证同一源码包及对应专用附件。已发布资产的包内 manifest、来源与 SHA 校验在准备／发布阶段执行；原生更新 API 没有下载内容 SHA 参数，更新时的元数据检查不能称为下载字节校验。

## 历史发行

OMAA `v0.2.1-alpha.1.omaa.0.13.0` 配对两宿主的官方 OMD `0.9.0`，采用当时固定来源的 `integrated-baseline` 规则；原 tag、附件及其验证契约保持原样。

OMAA `v0.2.1-alpha.1.omaa.0.12.1` 为历史发行，含 rc.2／alpha 专用附件并配对 OMD `0.8.1`；该旧 tag 的源码入口只声明 alpha。原 tag 继续按其当时的白名单、补丁和来源校验。当前不单独开展 `0.1.7` 回移，历史发行保留；这不是永久支持下限。
