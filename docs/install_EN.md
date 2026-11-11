# Install OMAA

[简体中文](install.md) · [Back to README](../README_EN.md)

Requires DSH **0.2.2-rc.2** and Node.js **24.9.0+**.

## Install in DSH

Open **Plugins → Add plugin** and paste:

```text
https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.2-rc.2.omaa.0.17.11/oh-my-agents-above-all-0.2.2-rc.2.omaa.0.17.11.tgz
```

When your current task finishes, enable the plugin or restart DSH when prompted. Checksums: [SHA256SUMS](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.2-rc.2.omaa.0.17.11/SHA256SUMS).

## Install from the command line

Use the CLI that belongs to the same DSH, replacing `web` with your profile (`desktop` for the desktop app):

```bash
dsh plugin --profile web add "https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.2-rc.2.omaa.0.17.11/oh-my-agents-above-all-0.2.2-rc.2.omaa.0.17.11.tgz"
```

OMAA works on its own without OMD. If you also use OMD, pick [OMD](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md) for the same DSH version. For other DSH versions, find the matching package on [Releases](https://github.com/gulagala001/oh-my-agents-above-all/releases); do not mix packages built for different versions.

## Turning presets on and off

All presets start off after installing. Turn on the ones you want in **Settings → OMAA**. Your choice is saved in `DSH_HOME/omaa/presets.json` and kept after restarts.

Turning a preset off keeps sessions, checkpoints and personal settings. You cannot turn it off while one of its tasks is running or queued; try again when the task finishes. Old sessions that used the preset need it turned back on to continue. If you made a preset the DSH default, choose another default in **Agent presets** before turning it off.

## Ask the AI to install it

You can also send this to the AI in DSH and let it do the install:

```text
Install OMAA into the DSH profile I am using now:
https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.2-rc.2.omaa.0.17.11/oh-my-agents-above-all-0.2.2-rc.2.omaa.0.17.11.tgz
First check that DSH is 0.2.2-rc.2 and Node.js is 24.9.0 or later.
Keep my settings, conversations, model settings and other plugins, and do not upgrade DSH. Before restarting, make sure no task is running.
Afterwards, confirm that Settings → OMAA opens.
```

## Upgrade and roll back

Back up your profile and `DSH_HOME/omaa`, then install the new package over the old one. DSH itself does not need to change. If the upgrade fails, your data is untouched; send the first error to [Issues](https://github.com/gulagala001/oh-my-agents-above-all/issues).

To go back, install the previous package. Rolling back only replaces the code; data written by the newer version stays.

## Uninstall

Remove it on the Plugins page, or run:

```bash
dsh plugin --profile web remove oh-my-agents-above-all
```

Then restart DSH. Preferences, file checkpoints, Pi branch context and the extension allowlist live in `DSH_HOME/omaa` and stay; delete it by hand if you no longer need it. DSH conversations and workspace files are not affected.
