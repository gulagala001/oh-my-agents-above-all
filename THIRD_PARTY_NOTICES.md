# Third-party notices

OMAA retains pinned prompt/source material and theme references, with its own host adaptation code. Original text and adaptation are recorded separately. It uses the installed DSH model, tool loop and session services; it does not bundle the five official product runtimes.

- **OpenAI Codex:** official source is pinned to `openai/codex` commit `3d2ee51ca2d5db578f328aa75e20aa22c0197c9a`, Apache-2.0. Complete model instructions and source references are under `src/presets/codex/sources/`, including `LICENSE`; `source.json` records selectors and hashes. `adaptation.json` and `adaptation.diff` record host changes. This license does not label the OMD-derived desktop theme as official OpenAI UI source.
- **Grok Build:** prompt, behavioral source and derived palettes are pinned to `xai-org/grok-build` commit `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8`, Apache-2.0. The prompt manifest is `src/presets/grok/source.json`, with `sources/LICENSE`. Complete upstream theme notices and palette attribution remain in `src/client/themes/sources/licenses/grok-build-THIRD-PARTY-NOTICES.txt`; the theme license is alongside it.
- **Pi Coding Agent:** prompt, agent and theme references are pinned to `earendil-works/pi` v1.0.2, commit `cd32f7725fdbddbaecdff5b1e68491563394e0ca`, MIT. Original licenses are at `src/presets/pi/sources/LICENSE` and `src/client/themes/sources/pi/LICENSE`; color-conversion notices remain in retained upstream files.
- **ZCode:** prompt/context and theme source are pinned to `zai-org/ZCode` commit `29628c9acdb81b703bbd4080c207a0e7ce5e276e`, Apache-2.0. Licenses remain at `src/presets/zcode/sources/upstream/LICENSE` and `src/client/themes/sources/licenses/zcode-LICENSE.txt`. The source also retains 69 original compiler/analysis/schema/lowering/facade and build files, including the dependency-free JSON hash helper. Their original bytes, SHA256 and official Git blob SHA-1 are recorded in `src/presets/zcode/sources/source.json`; `scripts/build-zcode-compiler.mjs` derives `lib/zcode-workflow-compiler.mjs` from the pure export closure. The original workflow engine, Actor scheduler, provider/account runtime and client are not included in that bundle. Native PTC/continuable-child integration is OMAA adaptation code.
- **TypeScript 5.9.3:** Copyright (c) Microsoft Corporation. All rights reserved. Licensed under Apache-2.0. The compiler remains an external `typescript` dependency, retaining the package's `LICENSE.txt` and `ThirdPartyNoticeText.txt`. The ZCode derived compiler bundle embeds the exact 57-file ES2022 declaration closure at build time; each declaration's original copyright and license header remains in its text. The complete Apache-2.0 license text is also retained at [the source license](src/presets/zcode/sources/upstream/LICENSE). No generated declaration module is written into the original ZCode snapshots.
- **ZCode world sources:** six further original files from the same fixed `29628c9` provide world-read dispatch, Git argv/parsers, the pure WorkflowError, filesystem contracts, matcher/search helpers and text encoding metadata; the world integration brought the ZCode source manifest to 166 files before the artifact additions described below. `scripts/build-zcode-world.mjs` derives the pure world, filesystem helper/contract and text-metadata modules under `lib/`; named pure declarations are extracted without bundling the original NodeFs adapter or workflow engine. Native filesystem/subprocess/sandbox/current-session integration, including host-public bundled ripgrep resolution, is OMAA adaptation code. It does not include the original workflow journal/replay; the separately retained development graph display sources are described below. The Apache-2.0 license remains at `src/presets/zcode/sources/upstream/LICENSE`.
- **ZCode artifact sources:** 17 further original-byte snapshots from the same pinned `29628c9` retain publish/spec/primary contracts and preset/chart UI references. `scripts/build-zcode-artifacts.mjs` derives seven pure modules, retaining original validators, JSON probe, parse/fold and palette algorithms. The original full ChartView and chart leaves use pinned Recharts 3.8.0 and are loaded with a lazy host boundary; Table/Metrics/Board presentation uses DSH CSS. Native Domain summaries, content-addressed attachment refs, session/run/version authorization and workflow panels are OMAA adaptation code; no original engine journal/replay or Amend execution runtime is bundled. The fixed Apache-2.0 license remains at `src/presets/zcode/sources/upstream/LICENSE`.
- **ZCode import-cache sources:** two further original-byte snapshots from pinned `29628c9` retain `engine/imported-cache.ts` and `engine/engine.ts`. `scripts/build-zcode-import-cache.mjs` derives `lib/zcode-import-cache.mjs` with the complete imported Actor/world consumption algorithms and only the original `normalizePersona` declaration from the engine snapshot. The existing artifact shared module supplies the fixed canonical JSON/hash implementation; original engine execution, IO, scheduler and provider/account implementations are not bundled. SHA256, original Git blob SHA-1 and byte counts are recorded in `src/presets/zcode/sources/source.json`. The Apache-2.0 license remains at `src/presets/zcode/sources/upstream/LICENSE`.
- **ZCode Amend reference sources:** nine fixed `29628c9` original sources retain the Amend handler/retune/source/resolve/description, contracts/run port and bootstrap import/submission references. Two existing handler snapshots are reused; seven additional original-byte snapshots are retained. `src/presets/zcode/sources/source.json` records official commit URLs, SHA256, Git blob SHA-1 and byte counts; the snapshots are source references and do not bundle the original execution runtime. The Apache-2.0 license remains at `src/presets/zcode/sources/upstream/LICENSE`.
- **ZCode development run display sources:** the fixed `29628c9` graph groups retain a 41-file strict display/reducer closure and 40 UI source/style/Chinese-English locale entries, including 37 original UI code files. Existing paths are deduplicated in the source manifest. `scripts/build-zcode-run-projection.mjs` derives bounded display projections and the original workflowRuns reducer in `lib/zcode-run-projection.mjs`; no original engine is bundled. Timeline/WorkflowRunPhaseList are retained upstream components, not ReactFlow. Native site/ordinal/phase/birth/accepted-receipt/queue/dispatch/settled observations are host adaptations. Tailwind 4.2.2 generates source CSS in a temporary build; it is not a runtime dependency. These are unreleased development sources with final native fixture and browser verification pending.
- **lucide-react 1.17.0:** the installed package is ISC, Copyright (c) 2026 Lucide Icons and Contributors, with the included Feather-derived icons separately retaining MIT, Copyright (c) 2013-present Cole Bemis. The complete exact installed `node_modules/lucide-react/LICENSE` is reproduced below. It is a production dependency; its upstream peer range supports React 18.
- **Recharts 3.8.0, clsx 2.1.1 and tailwind-merge 3.5.0:** MIT-licensed dependencies used by the retained artifact chart presentation. Their exact installed package licenses are reproduced below; original dependency notices remain in the packages.
- **iconv-lite 0.7.2:** MIT, Copyright (c) 2011 Alexander Shtuchkin. Used by the fixed ZCode text-metadata helpers for legacy Chinese encoding support. It remains an external dependency with its original `node_modules/iconv-lite/LICENSE`; the complete license text is reproduced below so the notice is retained in the OMAA source/package documentation.
- **Cursor prompt sample:** the user-designated comparison repository `asgeirtj/system_prompts_leaks` is pinned to commit `38499c52b4c3f290e40843cb9514df84d9d23d4c`. Its CC0-1.0 license and README are preserved under `src/presets/cursor/sources/`. This records the repository declaration; it does not establish capture authenticity, original product build, or the publisher's authority to license underlying Cursor product text. The complete sample, metadata and adaptation remain separate.
- **Cursor interface references:** official IDE/Agents Window documentation and public Desktop observations are recorded in `src/client/themes/sources/cursor/agent-window.json`. Historical logged-out CLI observations remain separately scoped. Host color inheritance is an adaptation choice; no proprietary product bundle, marketing CSS, fonts, icons or official screenshots are redistributed as theme assets, and no fixed native RGB palette is claimed.
- **Oh My DSH:** the Codex theme and shared layout/mapping snapshot were copied with the user's authorization. Provenance is in `src/client/themes/sources/codex-desktop.provenance.json` and `src/client/themes/shared/provenance.json`. These are OMD assets; the recorded source has no declared SPDX license. Optional enhancements reuse the separately installed OMD implementation rather than copying its whole runtime into this package.
- **Tailwind CSS:** the fixed 4.2.2 theme reference retains its MIT license at `src/client/themes/sources/licenses/tailwindcss-LICENSE.txt`.
- **DSH:** host packages are version-pinned to `0.2.1-alpha.1` from the MIT-licensed `deepseek-ai/deepseek-harness` project. They remain host dependencies; OMAA does not ship a modified DSH loop.

See [product sources](docs/product-sources.md), [theme sources](docs/theme-sources.md) and per-product manifests for file paths, hashes and scope. Original licenses and notices remain beside retained material.

## iconv-lite 0.7.2 — MIT license

```text
Copyright (c) 2011 Alexander Shtuchkin

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## recharts 3.8.0 - MIT license

Original package file: `node_modules/recharts/LICENSE`.

```text
The MIT License (MIT)

Copyright (c) 2015-present recharts

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## clsx 2.1.1 - MIT license

Original package file: `node_modules/clsx/license`.

```text
MIT License

Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## tailwind-merge 3.5.0 - MIT license

Original package file: `node_modules/tailwind-merge/LICENSE.md`.

```text
MIT License

Copyright (c) 2021 Dany Castillo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## lucide-react 1.17.0 - ISC and Feather-derived MIT notices

```text
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
