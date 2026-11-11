# 安装 OMAA

[English](install_EN.md) · [返回首页](../README.md)

需要 DSH **0.2.2-rc.2** 和 Node.js **24.9.0+**。

## 在 DSH 里安装

打开 **插件 → ＋ 添加插件**，粘贴：

```text
https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.2-rc.2.omaa.0.17.11/oh-my-agents-above-all-0.2.2-rc.2.omaa.0.17.11.tgz
```

等手头的任务跑完，按提示启用或重启 DSH。校验文件：[SHA256SUMS](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.2-rc.2.omaa.0.17.11/SHA256SUMS)。

## 用命令行安装

用同一个 DSH 自带的命令行，把 `web` 换成你的 profile（桌面版是 `desktop`）：

```bash
dsh plugin --profile web add "https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.2-rc.2.omaa.0.17.11/oh-my-agents-above-all-0.2.2-rc.2.omaa.0.17.11.tgz"
```

不需要 OMD 也能单独用；同时装了 OMD 的话，请选同一个 DSH 版本的 [OMD](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)。其他 DSH 版本请到 [Releases](https://github.com/gulagala001/oh-my-agents-above-all/releases) 找对应的包，版本不一致的包不要混装。

## 开启和关闭预设

装好后预设全部关闭。到 **设置 → OMAA** 开启想用的预设，选择保存在 `DSH_HOME/omaa/presets.json`，重启后沿用。

关闭预设时会话、检查点和个人设置都保留；这个预设还有任务在跑或排队时不能关，等任务结束再试。关掉后，用这个预设的旧会话要重新开启它才能继续。如果你把某个预设设成了 DSH 的默认预设，先在 **Agent 预设** 里换一个默认，再关闭它。

## 复制给 AI

也可以把下面这段发给 DSH 里的 AI，让它帮你装：

```text
请把 OMAA 安装到我现在用的 DSH profile：
https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.2-rc.2.omaa.0.17.11/oh-my-agents-above-all-0.2.2-rc.2.omaa.0.17.11.tgz
先确认 DSH 是 0.2.2-rc.2、Node.js 是 24.9.0 以上。
保留原来的配置、会话、模型设置和其他插件，不要升级 DSH；需要重启时先确认没有任务在跑。
装好后确认 设置 → OMAA 能打开。
```

## 升级和回退

先备份 profile 和 `DSH_HOME/omaa`，再用新版安装包覆盖安装，DSH 本身不用动。升级失败时原有数据不受影响，把第一条报错发到 [Issues](https://github.com/gulagala001/oh-my-agents-above-all/issues)。

想回到旧版，就装回之前的安装包。回退只换代码，新版写入的数据不会自动撤销。

## 卸载

在插件页移除，或运行：

```bash
dsh plugin --profile web remove oh-my-agents-above-all
```

然后重启 DSH。偏好、文件检查点、Pi 分支上下文和扩展白名单在 `DSH_HOME/omaa` 里，会留着，不需要可以手动删除。DSH 会话和工作区文件不受影响。
