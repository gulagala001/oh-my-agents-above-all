<a name="readme-top"></a>

<h1 align="center">Oh My Agents Above All</h1>

<p align="center"><strong>Five distinct agent workflows inside DSH.</strong><br>DeepSeek Harness plugin</p>

<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong></p>

<p align="center">
  <a href="https://github.com/gulagala001/oh-my-agents-above-all/releases/tag/v0.2.1-rc.2.omaa.0.17.0"><img alt="OMAA 0.17.0" src="https://img.shields.io/badge/release-OMAA%200.17.0-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/oh-my-agents-above-all/releases"><img alt="GitHub total downloads" src="https://img.shields.io/github/downloads/gulagala001/oh-my-agents-above-all/total?style=flat-square&amp;label=GitHub%20downloads&amp;color=0969da"></a>
  <a href="#readme-install"><img alt="DSH 0.2.1-rc.2" src="https://img.shields.io/badge/DSH-0.2.1--rc.2-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/oh-my-agents-above-all/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/gulagala001/oh-my-agents-above-all?style=flat-square&amp;color=0969da"></a>
</p>

<p align="center"><a href="#readme-install"><strong>Get started</strong></a> · <a href="docs/frontend-workbench.md">Docs</a> · <a href="https://github.com/gulagala001/oh-my-agents-above-all/issues">Report an issue</a></p>

<p align="center"><a href="docs/images/frontend-015/codex-light.png"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/frontend-015/codex-dark.png"><img src="docs/images/frontend-015/codex-light.png" alt="Codex 预设在 DSH 中的实际界面 / Codex preset in DSH" width="880"></picture></a></p>

<a name="readme-install"></a>

## Quick start

**Required environment：** DSH **0.2.1-rc.2**, Node.js **22.19+**.

Uses your existing DSH models and credentials. Presets adapt source prompts, workflows and themes; they do not provide the original products’ accounts or proprietary cloud services.

### 1. Install

Open **Plugins → Add plugin** in the DSH instance you use, then paste:

```text
https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.2.omaa.0.17.0/oh-my-agents-above-all-0.2.1-rc.2.omaa.0.17.0.tgz
```

Wait for active tasks to finish, then follow the host’s activation/restart prompt. Keep your existing profile and data. See the [installation guide](docs/install.md) · [SHA256SUMS](https://github.com/gulagala001/oh-my-agents-above-all/releases/download/v0.2.1-rc.2.omaa.0.17.0/SHA256SUMS).

### 2. Try this first

All presets start disabled. Open **Settings → OMAA** and enable only the presets you want, then select one when creating a conversation. The host default remains unchanged; with every preset off, conversations, tools and appearance retain their native behavior.

Create a conversation, select **Codex · OMAA** or another preset, and ask:

```text
Read this project’s README and directory structure without modifying files. List what needs checking before development.
```

**Success looks like：** The conversation uses the selected preset and theme, returning actual project information through DSH tools.

## Five workflows, one DSH environment

OMAA provides independent source prompts, workflows and light/dark themes for Codex, Grok Build, Cursor, Pi Coding Agent and ZCode. DSH supplies the model, native tool loop, conversations and permissions. The five original clients are not required.

| Preset | Focus and capabilities |
| --- | --- |
| **Codex** | Sustained code work, actual Git ranges, file/hunk operations, durable comments, editor navigation and review follow-through. |
| **Grok Build** | Planning and execution, live stdout monitoring and native interval scheduling. |
| **Cursor** | MDC/project rules, Ask/Plan, file checkpoints, multi-scope review, persistent line comments, exact local-editor navigation and batch feedback to continue editing. |
| **Pi** | Minimal default tools, SYSTEM/templates/rules, sequential steering, native branch navigation, extension drafts, settlement continuation and message events. |
| **ZCode** | Saved workflows, TypeScript Actors, static execution graphs, file/Git/command facades and artifact panels. |

Themes can follow the preset, use another preset’s theme or return to native DSH. Light/dark preference follows the host. Each preset retains its own behavior; see the [product documentation](docs/products/) for details.

## Review changes and keep working

The Codex preset exposes Unstaged, Staged, Commit, Branch and Last turn comparisons. Stage, unstage or revert files/hunks, save comments across restarts, open exact lines in a local editor, and send one or multiple comments for follow-up edits. Reviewed, submitted and resolved states remain distinct. Host permissions apply and stale comparisons are rejected.

Cursor's code review panel covers the working tree, index, commits, branches and recorded turns. Line comments retain context for exact navigation in Cursor or VS Code, persist locally and can be submitted together for the same conversation to continue editing. Checkpoints check conflicts before restoring and retain messages; they are not whole-workspace snapshots of arbitrary shell actions. Pi branches use the native conversation tree and share the directory; switching branches does not roll back files.

[Workbench usage](docs/frontend-workbench.md) · [Actual preset screenshots](docs/frontend-gallery.md)

## Compatibility and source boundaries

Dedicated builds are available for DSH rc.1 and rc.2; the primary installation above targets rc.2. Do not mix the packages. Presets are not the complete original product runtimes and do not include proprietary cloud agents, official accounts or every private API.

Pi’s local extension allowlist starts empty and accepts explicitly selected absolute paths. See [Pi documentation](docs/products/pi.md) for supported APIs. ZCode workflows use DSH models, isolated execution, permissions and native child conversations; they do not claim the original product’s complete journal/replay implementation.

## FAQ

<details>
<summary>Why did the model stay the same after changing presets?</summary>

A preset changes the workflow and appearance. DSH’s model picker controls the actual model. Select one with the required tool and input capabilities.

</details>

<details>
<summary>Can I use the original products’ accounts or cloud features?</summary>

OMAA uses DSH models and credentials; it does not log into or proxy the five official clients. Consult each preset’s documentation for available features.

</details>

<details>
<summary>Will updating or uninstalling delete conversations?</summary>

Retain the profile and data directory when updating. Uninstalling does not actively delete DSH conversations or workspace files. Preferences, checkpoints and the Pi extension allowlist remain under `DSH_HOME/omaa`. [Installation and maintenance](docs/install.md)

</details>

## Contributing and licensing

[Contributing](CONTRIBUTING.md) · [Architecture](docs/architecture.md) · [Source materials](docs/product-sources.md)

Original code uses [Apache-2.0](LICENSE). Third-party code and materials retain their own terms and attribution, including the limitations around Cursor samples. See [LICENSING.md](LICENSING.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Documentation and support

| I want to | Where to go |
| --- | --- |
| Install, update or remove | [Installation guide](docs/install.md) |
| Learn the features and limits | [Documentation](docs/frontend-workbench.md) |
| Read release changes | [Releases](https://github.com/gulagala001/oh-my-agents-above-all/releases) |
| Report a problem | [Issues](https://github.com/gulagala001/oh-my-agents-above-all/issues) |

For a bug report, include the full DSH and plugin versions, the entry point, minimal reproduction steps, and expected versus actual behavior. Remove private data before sharing logs or screenshots.

<p align="center"><a href="#readme-top">Back to top</a> · <a href="https://github.com/gulagala001/oh-my-agents-above-all/releases">Versions and downloads</a> · <a href="https://github.com/gulagala001/oh-my-agents-above-all/issues">Feedback</a></p>

[Documentation structure and contributing](docs/documentation.md)
