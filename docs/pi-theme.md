# Pi Coding Agent 原生主题来源

固定官方来源：`earendil-works/pi` v1.0.2，commit `cd32f7725fdbddbaecdff5b1e68491563394e0ca`，MIT。资产保留在 `src/client/themes/sources/pi/`；`packs.mjs` 的固定明暗映射已由 `themes/index.jsx` 与 `runtime.mjs` 注册并按会话挂载；五主题的明暗切换及实拍已核对。来源目录本身仍只存数据与证据，验证范围见 [验证记录](verification.md)。

官方固定来源：

- [dark.json](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/coding-agent/src/modes/interactive/theme/dark.json)
- [light.json](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/coding-agent/src/modes/interactive/theme/light.json)
- [theme.ts](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/coding-agent/src/modes/interactive/theme/theme.ts)
- [theme-controller.ts](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/coding-agent/src/modes/interactive/theme/theme-controller.ts)
- [Pi TUI colors.ts](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/tui/src/colors.ts)及[oklab.ts](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/tui/src/oklab.ts)
- [LICENSE](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/LICENSE)

## 资产与可复现转换

provenance.json列14项完整上游快照路径、固定commit及逐文件SHA-256，包含官方dark/light、schema、theme/controller/system-theme、user/assistant/tool组件、colors/terminal-colors/oklab及LICENSE。原文JSON的$schema链接虽写main，保持上游原文不修改；实际schema快照按上述commit获取，脚本不访问main。

palette.json有dark/light各59个token（56个UI/角色/Markdown/syntax/thinking色及3个HTML export色），每项包含rawName、rawValue、resolvedValue、browserValue和sourceLine。保留原始OKHSL及变量引用；esbuild编译固定快照中的官方parseColor/colorToHex与oklab算法，将OKHSL转同Pi truecolor的8-bit sRGB hex。没有替换通用RGB近似算法，也不从营销站取色。官方theme.ts的HTML导出本来就将OKHSL转hex，因为CSS不直接支持OKHSL。

```sh
node scripts/extract-pi-theme.mjs
node --test test/pi-theme-source.test.mjs
```

脚本无网络，先验证所有快照hash后转换；生成只写pi/palette.json，不写共享注册。3项source回归全部通过：固定版本/hash/两份MIT notice、完整token覆盖与逐字重生一致、映射候选仅引用实际token。它们验证来源和转换，不能称像素还原或终端/Web实拍验收。

| 原生token | dark browser hex | light browser hex |
|---|---|---|
| text | #dee0e1 | #3b3f41 |
| accent | #a798d7 | #7459b4 |
| error | #ea7f81 | #c8253d |
| userMessageBg | #213b49 | #dfe7ec |
| toolSuccessBg | #254131 | #dee9e1 |
| export.pageBg | #21252c | #efeeee |

LICENSE保留Mario Zechner MIT原文；oklab.ts.txt保留Björn Ottosson 2021 MIT许可和版权完整注释，这是原生颜色数学的独立来源。组件分发须保留这些材料；资产不依赖Pi运行时框架，生产可只读palette+许可+来源metadata，esbuild/上游TS仅用于重生和核验。

## 默认与角色映射候选

**Pi当前默认是system**：theme-controller无设置时生成终端system主题，依赖实际terminal颜色查询；查询未完成时可先灰度，再随终端更新。固定dark/light是明确内置选择，不能拿本palette声称system默认配色完全一致。终端默认背景dark黑/light白只是theme.ts fallback，实际终端提供的背景可不同。

role-candidates.json保留角色映射依据：text/muted对应正文与次要文字；accent/border/borderAccent对应强调和焦点；userMessageBg/Text对应用户材料；thinkingText对应reasoning；toolPending/Success/ErrorBg与toolTitle/Output对应工具状态；toolDiffAdded/Removed/Context对应差异；Markdown链接与代码按mdLink/mdCode。

export.pageBg/cardBg/infoBg属于官方HTML导出专用色，可作为DSH画布/卡片适配候选，但没有证据证明它们是原生终端画布。现有主题数据采用官方 HTML 导出背景角色；后续界面仍需明确终端、导出画布与 DSH 的差异，不宣称与动态终端背景完全相同。

## 终端→DSH几何限制

官方user-message用Markdown自身背景，outputPad默认1个terminal cell、垂直padding1行；assistant-message正文没有填充背景，paddingY=0，thinking颜色独立。tool-execution用Box(1,1)及pending/error/success原生背景，collapsed输出截行后提示原生展开快捷键。终端ANSI truecolor/indexed256量化、行宽、cell字体度量、OSC zones与键盘展开不能等同浏览器像素、卡片圆角、鼠标details、浮动composer、侧栏、文件预览。DSH几何应保留宿主对话结构，并把角色色与真实交互能力作为可验证的适配范围；不声称像素全等。

主题控制与会话保存后续重新接入 DSH；当前保留的主题数据与共存基础不等于完整集成。源码提取不作为截图一致性的证据。
