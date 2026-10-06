# 可回查的主题资产来源

`sources/` 只保存资产与证据，不注册主题或修改 DOM。目录外的 `packs.mjs`、`themes/index.jsx` 与 `runtime.mjs` 已实际注册 Codex、Grok Build、Cursor Agent 对话、Pi Coding Agent、ZCode 五主题，按真实会话挂载并共享独占外观协调。五主题明暗、切换与实拍已核对，范围见 [验证记录](verification.md)。

所有文件位于 `src/client/themes/sources/`，`index.json` 记录每份文件的大小与 SHA-256。公开源码快照带许可文本；闭源 Cursor 没有复制 bundle 片段、图标或截图像素。`extract.py` 可以在断网环境下从保留的源码快照重新提取 Grok/ZCode JSON。

| 产品 | 有效来源 | 本次可确认的范围 |
|---|---|---|
| Codex | OMD 既有 `bundled/codex-desktop.json`，完整字节复制 | 资产复制一致性；DSH 挂载与本轮实拍独立核对，不冒充 OpenAI 官方 UI 源码 |
| Grok Build | 官方 GrokNight/GrokDay Rust 源码，固定 commit | 两套 canonical RGB 色板、各 58 个颜色角色及 Markdown 字重 |
| ZCode | 官方 styles.css/useTheme.ts，固定 commit；Tailwind 4.2.2 | 默认基础层及 ZAI 明暗共四套，各 144 个颜色 token；变量引用与透明度完整保留 |
| Cursor | 官方 IDE/Agents Window 文档与 Desktop demo；CLI 证据单独保留 | 桌面 Agent 区域/输入/工具布局适配，颜色沿用宿主；无官方固定 RGB 声明，见 [cursor-theme.md](cursor-theme.md) |
| Pi Coding Agent | 官方 earendil-works/pi v1.0.2 固定源码与 MIT 许可 | 固定 dark/light 各 59 个 token，使用上游 OKHSL 转换；HTML 导出背景与动态终端 canvas 分开记录，详见 [pi-theme.md](pi-theme.md) |

## Codex：完整复制既有 OMD 纯资产

源路径：`/Users/mac/Projects/trisoul_x/src/client/skins/bundled/codex-desktop.json`。目标 `sources/codex-desktop.json` 与源内容完整一致，资产 ID `codex-desktop`，版本 `1.0.1`，SHA-256：

`6aba58372949773c374aee7350446367ae5f3660865afde0d6d79efe275ee4db`

`codex-desktop.provenance.json` 记录读取时的 OMD Git HEAD、源绝对路径与 hash。历史来源没有声明 SPDX license，因此保留原 `source.license: null` 记录；权利持有人于 2026-10-06 另明确授权所复制的 OMD Codex 主题与共享布局自有部分以 Apache-2.0 开源，当前 provenance 以 `redistributionLicense` 和 `authorization` 独立记录该授权。没有发明 OpenAI 许可或声称来自官方客户端源码。OMD 的原始 light/dark/common token、CSS 和 layout 数据均保留，未加载其后端、运行时控制器或副作用代码。

## Grok Build：数字声明优先于注释

固定官方源码 [2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8](https://github.com/xai-org/grok-build/tree/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8)，SOURCE_REV `559751fdcec02d413e4c57c8832ab275e4f44980`。

- [GrokNight](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager-render/src/theme/groknight.rs)，原始 SHA-256 `c58f35789fad4a1fec3d978673ba9dfd273e7c9e94fa731f975ca297527b5681`。
- [GrokDay](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager-render/src/theme/grokday.rs)，原始 SHA-256 `2a4bffc5c6bc49deb1c06761aa7a3e6372cc4b0225a3ffaf434ed77913a4d882`。

两个本地源码文件与固定官方 raw 文件逐字节比较一致。`grok-build.json` 保留 palette 的 `rawName/rawValue/sourceLine`、每个原生角色的原表达式、引用的 palette 名和六位 browser hex。颜色从 `rgb(...)` 或 `Color::Rgb(...)` 的数字转换；例如 Night `text_primary` 实际为 `#e1e1e1`，没有沿用文件顶部旧注释提到的不同前景色。`bg_base=#141414`，`bg_terminal=#0a0a0a` 也保留为不同原生角色，没有合并成一个“背景”。

第一方许可 Apache-2.0。`licenses/grok-build-LICENSE.txt` 与完整原始 `THIRD-PARTY-NOTICES` 随资产保留。通知中明确 GrokNight 借用 Tokyo Night accent hex，列出 Folke Lemaitre、tokyonight.nvim 的 Apache-2.0 与原 VS Code palette 的 MIT lineage；没有删掉这些归属。Markdown 的 BOLD/empty modifier 单独记录为 font-weight 数据，不伪装成颜色。

这份数据是 canonical truecolor：终端启动时会按 256/16 色能力量化。它不证明网页具有相同的终端字符网格、ANSI 行为、dock、队列或交互布局。

## ZCode：正确保留 CSS 颜色空间与真实主题选择

固定官方源码 [29628c9acdb81b703bbd4080c207a0e7ce5e276e](https://github.com/zai-org/ZCode/tree/29628c9acdb81b703bbd4080c207a0e7ce5e276e)。[styles.css](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/packages/ui/src/styles.css) 原始 SHA-256 `22d5b58e44cdebdbe7154c418ee05fef6dde689e384f0dd590d4057739487be7`，本地快照与官方 raw 逐字节相同。

`zcode.json` 的四套 variant 分别对应 `@theme`、`.dark`、`.theme-zai-light`、`.theme-zai-dark`。每个 token 保留原 CSS 名、原值、源码行、直接依赖、继承来源 selector 与解析后的 browser CSS 值。Tailwind 版本来自同 commit 的 `pnpm-lock.yaml`：`4.2.2`；保留的 `theme.css` 还与 [官方 v4.2.2 文件](https://github.com/tailwindlabs/tailwindcss/blob/v4.2.2/packages/tailwindcss/theme.css) 完整比较一致。

解析只递归替换 `var(--...)`，不把 OKLCH 强行剪裁成 RGB，也不丢掉 `color-mix(in oklab, ..., transparent)` 的色彩空间或 alpha。例如基础 light 背景保持 `oklch(98.5% 0 0)`，半透明背景保持完整的 `color-mix` 表达式。四套各 144 个颜色 token 均无未解析引用。`browserValue` 是可用于现代浏览器的原生 CSS 颜色表达式，**不是实拍像素值或已执行浏览器 gamut 转换的 hex**。

真实选择须看 [useTheme.ts](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/packages/ui/src/useTheme.ts)：旧 light/dark 偏好被归一化为 zai-light/zai-dark，默认 zai-dark；system 也选择相应 ZAI 主题。zai-dark 同时添加 `.dark` 和 `.theme-zai-dark`，解析按该实际层叠顺序保存。`nativeSelection` 记录源快照/hash，并标明实际产品 light→`zaiLight`、dark→`zaiDark`。因此当前产品默认不能误用基础 sky 品牌层：ZAI light 背景 `#f8f8f8`、brand `#000000`；ZAI dark 背景 `#161616`、brand `#ffffff`。

ZCode 第一方 Apache-2.0、Tailwind MIT，各自原始 LICENSE 随快照保留。没有复制 window chrome、native terminal 功能、focus 禁用规则或整份 CSS 到当前页面；原 CSS 快照只作提取证据，不能直接作为 renderer 的全局样式引入。

## Cursor：桌面 Agent 与 CLI 局部证据分开

[官方 Agents Window 文档](https://cursor.com/docs/agent/agents-window)、[Desktop demo](https://cursor.com/product) 与 [IDE 主题帮助](https://cursor.com/help/customization/themes) 的本轮来源记录在 `cursor/agent-window.json`。当前主题「Cursor · Agent 对话」适配对话/工具摘要、底部 mode/model 输入及右侧文件/计划关系，使用比例字体；颜色继承当前 DSH 是适配选择，不能外推为 Agents Window 与 IDE 主题自动同步。尺寸为适配参数，没有提取闭源 token。

[官方 CLI 页面](https://cursor.com/cli) 于 2026-10-05 获取，其 demo 可观察到 Agent 身份、目录/分支上下文、输入、模型信息和命令/文件/shell 提示的区域关系。这是 CLI demo；它不证明 Cursor IDE Agents Window 的布局或精确 token。`cursor.json` 记录这些事实和链接，light/dark tokens 均为空。

已下载官方 CLI `2026.10.01-e373342`（darwin arm64），compressed archive SHA-256 `629e51de43a0b7fb3b86f5ebc7e579f7df7df941b39f29e82945cde750145afc`。实际已执行的隔离版本查询和 ACP 初始化只证明运行时版本/协议，没有经过认证的交互 TUI 色彩测量。没有从闭源 bundle 提取配色或图标，也没有把宣传页壁纸、网站背景或品牌强调色当作 CLI token。

CLI 快照中未验证的精确颜色/几何仍明确为空；桌面主题不以此为布局依据，也不把猜测 palette 标作原生还原。另有固定版本未登录首屏的 ANSI 量测，见 [cursor-theme.md](cursor-theme.md)；不能推算完整产品主题。

## 验证与交付边界

主题来源回归检查 hash、角色、颜色转换、映射与共存。原版 DSH 安装、五主题实拍/明暗/模式/reload 及真实模型代表性任务另有实际执行证据；来源测试不替代这些结果，也不证明原厂视觉或模型等价。范围见 [verification.md](verification.md)。
