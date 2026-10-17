# 历史 OMD 配对构建规则

本目录保存历史 OMAA 发行使用的 OMD overlay 与 integrated-baseline 固定来源规则，供旧发行的来源核对器使用。规则中的宿主、commit、白名单与 SHA 只适用于对应历史版本。

当前 OMAA `0.15.3` 使用主项目独立构建的同宿主 OMD `0.17.3`，从 [OMD 固定发行](https://github.com/gulagala001/oh-my-dsh/releases) 获取；安装入口见 [安装指南](../../docs/install.md)。本目录不会把历史 OMD 改名为当前版本。

历史规则绑定完整源码 commit、SDK、manifest、宿主工厂、vendor、客户端和逐文件哈希。来源漂移、未知文件、链接、SDK/manifest 差异和补丁冲突都会停止；校验不会覆盖输入工件或用户 profile。
