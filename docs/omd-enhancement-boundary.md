# OMD 兼容增强边界

OMAA 可独立运行，OMD 不是必装依赖。每个预设的增强默认关闭；安装并启用提供 `installOmaaEnhancement` 接口的兼容 Oh My DSH 后，设置中才能开启。

该兼容接口在本次 OMD 源码中实现。检测到 OMD 已安装但没有该接口时，OMAA 预设会明确拒绝挂载，并说明更新或使用独立 DSH profile。旧 `0.3.0` 包固定于 DSH `0.2.0-rc.2`，还会全局注册 Computer Use、接管主题及部分宿主组件；仅把增强开关灰掉不能解决这些冲突。应使用匹配 DSH `0.2.1-alpha.1` 且提供 scoped 增强与外观协调接口的 OMD，不能根据包名猜测支持。现有用户 profile 未自动更新。

增强分为基础能力与可选高级工作方式。基础增强复用 **CodeGraph** 与 **Computer Use** 的兼容工具，并保留工具所需的实际说明；默认关闭，单独开启不强制工作流编排。模型/API、权限、取消、工具结果和附件仍由 DSH 与对应工具负责。关闭时增强工具从装配中移除，执行 guard 也拒绝调用。

高级工作方式通过 `enhancementWorkMode: off | pro | ultracode` 选择，分别对应关闭、Pro 和 Ultra。它复用 OMD 同一 `UltracodeControl`、模式持久化和全局 hooks，保持当前 provider/model，选择该模型最高可用 reasoning effort；不另建模型路由或控制器。选择非 `off` 自动开启基础增强，关闭增强同时关闭高级方式。Ask/Plan 不启动 Pro/Ultra 工作流；恢复执行后可继续保存的方式。ZCode 将已激活高级方式视作用户持续授权，但仍加载 `zcode-workflows` 技能。

Pi 普通会话保持精简工具：delegation/jobs 不进入模型工具装配，执行 guard 同样拒绝调用。开启兼容 OMD 增强后出现工作流支持；这是用户选择的增强，不作为 Pi 原厂默认子代理能力。

工作流通过 OMAA 自己的 delegation Group 隔离。没有 OMD 时使用 native engine/tool；有兼容 OMD 时使用其公开 composition descriptor，仅启用 OMD host engine/tool 和已在 root 注册的唯一 `omd-workflow` provider。原 native 两行保留为 disabled 依赖解析参考，不同时运行两套 engine，也不为每个预设重注册 provider。安装或卸载 OMD 后须重载对应 profile，让 composition 重新选择；不承诺无重载热切换。

产品预设继续使用自己的完整来源提示词和原生 DSH 压缩。高级方式只补充相应工作流指引与模式提醒，不注入 OMD 整套主提示词或 CC persona，不挂载 OMD 主代理，不接入 ContextPipeline、Dream、OMD todo/verify/BT。原生 `todo_write` 仍是预设已有工具，与 OMD 提醒/证据链不同。

主题与增强独立。共享外观协调器负责同一前台的独占与释放；检测到不提供协调接口的旧 OMD 样式时暂停主题接管并提示更新。`omdAvailable` 表示兼容增强接口可用，不是所有 OMD 功能已接入的声明。

基础工具与高级工作方式使用 OMD 已安装的实现与配置，不另建模型执行层。高级方式的后端接线不等于所有共存、开关、恢复或卸载场景已通过验收；具体实际检查范围见 [验证记录](verification.md)。
