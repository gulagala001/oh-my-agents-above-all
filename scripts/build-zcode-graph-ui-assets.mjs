import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { transform } from 'esbuild';
import { graphUiPortAsset } from './zcode-graph-ui-pure-ports.mjs';

/**
 * Rebuild the source-derived graph CSS/messages and the explicit DSH Intl bridge.
 * Raw snapshots are always read-only. This module performs no work when imported.
 * Tailwind 4.2.2 and PostCSS 8.5.6 are build tools only; neither ships in client code.
 *
 * CLI (default is read-only verification):
 *   node scripts/build-zcode-graph-ui-assets.mjs --check
 *   node scripts/build-zcode-graph-ui-assets.mjs --write
 *   node scripts/build-zcode-graph-ui-assets.mjs --output-dir /tmp/graph-ui-review
 *
 * With an isolated build-only runtime, without changing project dependencies:
 *   npm install --prefix /tmp/graph-css-tools --no-save --package-lock=false tailwindcss@4.2.2 postcss@8.5.6
 *   node scripts/build-zcode-graph-ui-assets.mjs --check --css-runtime /tmp/graph-css-tools
 */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SNAPSHOTS = path.join(ROOT, 'src/presets/zcode/sources/upstream-3.15.1');
const CLIENT = path.join(ROOT, 'src/client');
const COMMIT = 'aac4755666d09fdcd70272fcf063c077a639015f';
const UI_PREFIX = 'packages/ui/src/';
const WRAPPER = '.omaa-zcode-workflow-graph';
const ENTRIES = ['components/workflow-timeline/WorkflowTimeline.tsx', 'components/workflow-timeline/timeline-model.ts', 'app-shell/WorkflowRunPhaseList.tsx'];
const PINS = [
  {
    "path": "packages/ui/src/app-shell/WorkflowRunFillFrames.tsx",
    "sha256": "98c0ffdb3c3c094da16a347a14a946a7b718d5695db991e51c689d2dbf7ad397",
    "bytes": 5828,
    "gitBlob": "b2d0d5f322dc86f3040feec3adce53e2cd844b5a"
  },
  {
    "path": "packages/ui/src/app-shell/WorkflowRunHoleParts.tsx",
    "sha256": "4ecdf6311a335a685a2adde82fce8b8632944fd14386ea18c461764b9113af5e",
    "bytes": 5219,
    "gitBlob": "6a94632676d664b8553b0485f97c7f32b4afcb65"
  },
  {
    "path": "packages/ui/src/app-shell/WorkflowRunPhaseList.tsx",
    "sha256": "f15eb7855cc6a614ecec7fa17d48609356bab79fcda4556a977ee7cd2233d7d4",
    "bytes": 19775,
    "gitBlob": "e3710ae8bb68391da58ea6ff3045152625aba883"
  },
  {
    "path": "packages/ui/src/app-shell/WorkflowRunPhasePills.tsx",
    "sha256": "3d5d907f4db6855d5af9c541d4749482da59b92d796339001b8f166c1bed244a",
    "bytes": 6448,
    "gitBlob": "ee66808f40a1ba914fa635d545104f64cb82aa97"
  },
  {
    "path": "packages/ui/src/app-shell/WorkflowRunQuestionRow.tsx",
    "sha256": "5abd3d11c607edd3e96690af0d893d1741eff92c7ec1e6ff47b592ae4aae014e",
    "bytes": 3321,
    "gitBlob": "3fa4b0374409dfa21ae0b574f57174e7791f4cbc"
  },
  {
    "path": "packages/ui/src/app-shell/workflowRunQuestions.ts",
    "sha256": "4b4cc5a4e0615d1abd65047dd6229009534a8a00471dcdac330b902c2b22ea59",
    "bytes": 2795,
    "gitBlob": "bd6604ab40324aa81e4f70b15fec3727c633a13f"
  },
  {
    "path": "packages/ui/src/app-shell/workflowRunSpine.ts",
    "sha256": "b95dcb97a153fc7dac945adb247b8561e50092f20da1f1a485953e68070ee8cb",
    "bytes": 7521,
    "gitBlob": "f51b720cfef247453f74ba9e8a5c48de5974451e"
  },
  {
    "path": "packages/ui/src/app-shell/WorkflowRunSpineParts.tsx",
    "sha256": "891ba1a8c18e72c0b86d0b948e9fa58df5e5419e5ffba3219570c4e13956b2b8",
    "bytes": 13620,
    "gitBlob": "0e1ccbffc0aba2acaf629e02d1a6a5e5588b7558"
  },
  {
    "path": "packages/ui/src/chat-input-toolbar/thoughtLevelOptions.ts",
    "sha256": "3b001622afcbdf0c13f2eae1ea5e5eeb97c2424b835fd20935eca7b59f873e73",
    "bytes": 3323,
    "gitBlob": "475bd689341625797b048773ab5dec2977e535ec"
  },
  {
    "path": "packages/ui/src/components/lib/utils.ts",
    "sha256": "b083c2359de5f521e00ead8c39b8c8b68934d0e052b1c83384660614198b810d",
    "bytes": 604,
    "gitBlob": "0f05a8e7a8462cf02b3c7aa29e3043783a4ef599"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/instance-phases.ts",
    "sha256": "b85490e0259dc453edfde9ecee27a0fc8df9e86ffa8656e8b026a4fab4fe30f4",
    "bytes": 3381,
    "gitBlob": "0da0c4a1f1dc9a98bd9602dcac549a3c6c1658cf"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/lane-name.ts",
    "sha256": "aa820c4fc8cddba905f75af8d8d41c43fe771013b36ef186cf0e1aa935b9cf91",
    "bytes": 6207,
    "gitBlob": "4efd4e54289c39c3dda87e8436fa27cc83777279"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/name-pattern.ts",
    "sha256": "905a4e15940bc14eaad7bf103a43c75e37033eb4f1f7e8e668d68afa62403a14",
    "bytes": 1640,
    "gitBlob": "febf12f3b235eae77d7c015af8adbd64505a68fe"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/participant-model.ts",
    "sha256": "c636c52d6383b5d03934b2eb5f781a8ae313b51bda0bd2d3a188e2ae15be0938",
    "bytes": 16497,
    "gitBlob": "ac6ce0c4caa35db31c310a446c585f920ba2c044"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/phase-model.ts",
    "sha256": "74361d3a9d7f491c72264d9443150331941d798a07627586dc1a0c8104897672",
    "bytes": 1854,
    "gitBlob": "cc601eeefa0987b7163365a633a552622748bc98"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/phase-name.ts",
    "sha256": "c3568ad3a1d7c2a7aa4f11b24a6bd3eddb33bbe48457218a89b20bc1a5c2cf4e",
    "bytes": 2814,
    "gitBlob": "70a0a9fbea99b0c7a9877d7102cacbf95e872547"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/run-status-presentation.ts",
    "sha256": "d831877dbaec88fe7250f95fdde97e8ea354693c6bc1b573b7108477e307946b",
    "bytes": 3913,
    "gitBlob": "555c67fb04386bbbe6b4aa21c647da4c565df4fe"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/run-status.ts",
    "sha256": "ff151e56c52e02202c1b5a24d6531a2af173aa1f749db4ef5301eba65c32d330",
    "bytes": 8333,
    "gitBlob": "f7d09d84cd8cf593292d7ce85f3838d60471d2cf"
  },
  {
    "path": "packages/ui/src/components/workflow-graph/types.ts",
    "sha256": "863fca1c28f469509fcf346b27dc16702ed7c1ff4b31de3a1cca5f944a268aad",
    "bytes": 5051,
    "gitBlob": "51043b4e393281ab06634fc55570a610fdc434e6"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/roster-model.ts",
    "sha256": "4a6825c022e4fba86f9da23bd3431725e8d82fc9325c585ed8fdc1fa409d14e4",
    "bytes": 8591,
    "gitBlob": "c9402b15180ef4659db9b531d46854a35f408444"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/stage-lamps.ts",
    "sha256": "fb773773cf2f2271c0e008c4764aa07578b4ca1fd86a754023137bf5c7e19ed2",
    "bytes": 6559,
    "gitBlob": "18497f59af70f8221027a1af3af2b1d35ce5487e"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/station-observation.ts",
    "sha256": "704cbdf0bdc97b27a2daaa785d60bf1782ba9b1150e8716d7b831aa57d0df6fc",
    "bytes": 5552,
    "gitBlob": "8a6d7553a615a9ced3decaf86eb36eeda3df6e84"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/subagent-model-label.ts",
    "sha256": "0e305ba86e3141ea48c4b9c7bc5856eacf596a7f4bc8d91353635c8ed395984d",
    "bytes": 6264,
    "gitBlob": "bbe7eab5fae883fb7924842a5dd3cdae90211c60"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/timeline-bands.ts",
    "sha256": "d347716e1d35b82aec34230d90bc97493920cce665d08d22a2ec1535364323fe",
    "bytes": 15169,
    "gitBlob": "194a1d626cdb68f80e4271230bdfc2747cb0fa13"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/timeline-cache.ts",
    "sha256": "6aee99ea65966b5e1a09c914b4f8c780e127bc9562c7e1eb81e2f61627b5dc17",
    "bytes": 2108,
    "gitBlob": "549ca1935713a063504a3daf55a9a224aca29e1e"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/timeline-frames.ts",
    "sha256": "0ebb444dc9ea5cc7b3ab030c2bda53b2b27a3ead706804a24c8221b5ae97fd06",
    "bytes": 8415,
    "gitBlob": "de083a9981b5ccde6868180a0b3f0d2c8b530c53"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/timeline-geometry.ts",
    "sha256": "2306035f5c3c8f594c5bd386e4d4df023ac1a13f6b598a3e4b619d58424ab331",
    "bytes": 10116,
    "gitBlob": "40528584802448c78ce576766e0052f361e6386f"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/timeline-holes.ts",
    "sha256": "55f174ed51dcdcc0fbf8ae076d8a6ffa512226edb1f0bc26493e0bdf5d96ded1",
    "bytes": 15500,
    "gitBlob": "9ee8822dc5f21ebfaa6d0902cf9ca24c7fe94761"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/timeline-ledge.ts",
    "sha256": "7097dd6656c821b8775f03653c0eaaa2b2af571af388de86f95d237acab3169d",
    "bytes": 8974,
    "gitBlob": "35f49465fa03278b6219170433a0d6fa5def0031"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/timeline-model.ts",
    "sha256": "5c06e1ae6e471a65ecb8e285b12cb75d04d1b5630b9a3b87de9493c5139db7b1",
    "bytes": 20984,
    "gitBlob": "226f04c0036ef778f0f4fc14223b3658f2a006e0"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/timeline-pill-activity.ts",
    "sha256": "8382b6145fc9358c8a6143d94afdfe9188791c62d401b67d4b1471b273a98d54",
    "bytes": 1680,
    "gitBlob": "ae9e80453e9f99ef2a2bd49ae3ba01850fd30d63"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/use-fill-growth.ts",
    "sha256": "1d1dcd57a01ce7723dc08b49a8fdf12f3de858e8013d4259ecff123cd722561c",
    "bytes": 3531,
    "gitBlob": "1bbaf1ac80a175a07a2fa95aa5b31f41fd70589e"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/use-timeline-viewport.ts",
    "sha256": "ae988ec2729c2f783ea39e3d69431f0db026650e92b5742ffa9dd261d0fcf543",
    "bytes": 4080,
    "gitBlob": "af19e2c1cc5d8502639f57fa03ffb9b841b48732"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/use-typewriter.ts",
    "sha256": "315176c8333aca3239cfdd2776251fcc8b078816cd8140cba9386a2d980fc71c",
    "bytes": 5696,
    "gitBlob": "f1417fe2a57c8368379288e35c53f0d6fd01422b"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/workflow-face-motion.ts",
    "sha256": "292c2cad70f9c1a67f7f295da887d665295b489f70f77714b9998479930d947a",
    "bytes": 5977,
    "gitBlob": "2c8858e8bb7185d8b9e5d0494fdf28aca24bb8fb"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowAgentFace.tsx",
    "sha256": "0d3b1db8ae17cc9f0e5daba64fcc068476602040924a6286514dc29d236d013a",
    "bytes": 4495,
    "gitBlob": "82403767d564b2e165de93bd986e480e14302297"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowAgentPill.tsx",
    "sha256": "ccb40ac5c8b663beee63e0b36328568a6b8da330f1d991c036db32ceada00435",
    "bytes": 7879,
    "gitBlob": "73107ebf49a32ff5af40e8669e6f01be217256e5"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowHoleParts.tsx",
    "sha256": "6b26e2a9815bb53d681353c577dc51669d56ae51acd8812760c86624129f6714",
    "bytes": 3867,
    "gitBlob": "eab2083d33805f71ffa1c871ffc8d9b9a8a88cb1"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowMarchLight.tsx",
    "sha256": "1461d599fd47d4ea890a0f0008ec9035d7fa6699c3c7bbbb3c798b01b3e0077d",
    "bytes": 1917,
    "gitBlob": "44ff20e3fba500df3b1085a9a43590ca192aa21b"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowMoreRow.tsx",
    "sha256": "c91917433f68fd0da9924da409d10598d82db5ed5220c43589d37c23e23cf6b4",
    "bytes": 5838,
    "gitBlob": "e6155ffb9f80d78b57658374014f02f174700ea3"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowRoll.tsx",
    "sha256": "26dde7267510ac0cbd3603fa51bfa0fb660c42d82f640396614f94c070da122b",
    "bytes": 4474,
    "gitBlob": "b3f7c9e8cba8804c565eedfb66070f2925650ed4"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowRosterParts.tsx",
    "sha256": "35a3087060d8555496f4deb37ee3fd10217051b01c2531a4270ba3d9a4bab8d5",
    "bytes": 3891,
    "gitBlob": "8c9285aad4ba9d4301a941a4553d075da6a3bdd7"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowStationMeta.tsx",
    "sha256": "73c9369cb680c66f2333f75ea6f929df6876094a598eed83c2d199fa6f907c73",
    "bytes": 1433,
    "gitBlob": "19bfa84edff29f240f5302e326454dfa3379cf8d"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowStreamChevrons.tsx",
    "sha256": "698b62503e475d5070687cf22d669835c18cd54c146bb8a8d1ac44c4593e8c72",
    "bytes": 3784,
    "gitBlob": "f36358e727a88fcc6f068be7cbaacfcbafe4c200"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowTimeline.tsx",
    "sha256": "c17cc7cf089e32922827142a4e675486f4e120e4ebcfcb6ec57e0eb0f1551807",
    "bytes": 21003,
    "gitBlob": "65e20ecdfc440fde7719155b67e42d252efa6d0a"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowTimelineArcs.tsx",
    "sha256": "6b43774997c638ee316eec28a4a387ad929d3bb909624fde62fb3bbddce0f146",
    "bytes": 6834,
    "gitBlob": "533c749c1cadf0802242308efa7dac2e8dc65fb6"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowTimelineFills.tsx",
    "sha256": "d5b87fed9d3acd837f366a5514f276542c82fa8c92e33f99c38a79b71c900af3",
    "bytes": 12124,
    "gitBlob": "63fe8d4e4356980568c0d40ec4e665c32f6cc89a"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowTimelineLedge.tsx",
    "sha256": "a5f57f502ff6e2455b0afa165f1da20541c3c44b47c17c7edb135fe675a2118a",
    "bytes": 10432,
    "gitBlob": "4f5ecc9948b825080fad24136c7fa0bd55c25229"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowTimelineStation.tsx",
    "sha256": "b44cf9aa77855f4e0a57ddd3efbc2ba38d31de5de6e7bf80a5c91b9d32b6114b",
    "bytes": 10917,
    "gitBlob": "5ad16a1c94a84417b46da496734fbbe1743559de"
  },
  {
    "path": "packages/ui/src/components/workflow-timeline/WorkflowTimelineTracks.tsx",
    "sha256": "c3ef089cdfc9ae7408d88eb60fd1e9cb28789f71c689953ae2475a92fde00b14",
    "bytes": 11460,
    "gitBlob": "5829d68864a5cef02c4aa21dfccf87775eaab63b"
  },
  {
    "path": "packages/ui/src/i18n/locales/en-US.ts",
    "sha256": "12400cb26bd09a1af6b4fc2842b0683b2c3e9b4eef69d05c54564e5886f794f3",
    "bytes": 462918,
    "gitBlob": "acdad8a6b7007bb160c0407b120762c6df3e2abc"
  },
  {
    "path": "packages/ui/src/i18n/locales/zh-CN.ts",
    "sha256": "29b5679d744c7a400a3e9f75516d5a3f8086ce8eefe77028bf0fb02c35154cf3",
    "bytes": 464333,
    "gitBlob": "e0f402214e7d20ce7b4080ef6592db7557f60df1"
  },
  {
    "path": "packages/ui/src/lib/zcodeSessionProjection.ts",
    "sha256": "2b030f4c7a267528f323466e05c425dd6317f8baa8af473eb7316e3497703ea4",
    "bytes": 120538,
    "gitBlob": "75a1e9553e8ef8b5a1528865b063f719c5a237ab"
  },
  {
    "path": "packages/ui/src/styles.css",
    "sha256": "793515ed9a255acb0a954446d579d15030d206fe41bbd3c67a7aac857a6f65ef",
    "bytes": 77721,
    "gitBlob": "576042dc764333289143625ecd760822b55861a7"
  },
  {
    "path": "packages/ui/src/v4/composer/modelTriggerDisplay.ts",
    "sha256": "97ff255dfeac23f58e68b0042c3469027f457ccc0a3bf0a87efd480e99e5543e",
    "bytes": 4237,
    "gitBlob": "a30d29770dbc8b21c49695e2ff00b882ea48341d"
  },
  {
    "path": "packages/shared/src/model-selection.ts",
    "sha256": "653a4671723d4a3302e84ba13f29d4d55a17e5e8082b44d54ba1f9087dbd3e44",
    "bytes": 2457,
    "gitBlob": "5f46f4c929ff0d0f63f8cdf1e8cfbf3eab84a522"
  },
  {
    "path": "packages/shared/src/custom-model-value.ts",
    "sha256": "b825ca3b3f32cebf4f1876457c79d683cd37fd5b2a24c20c0547519de3b0b493",
    "bytes": 1501,
    "gitBlob": "47e8582242ea138e2af3197053f6bacf5432c058"
  },
  {
    "path": "packages/shared/src/model-provider-family.ts",
    "sha256": "de6921dc0fce1e776a62010bfcf5488145ea4f4aa86cced5207cf6785f726e71",
    "bytes": 5902,
    "gitBlob": "52ab99c89ed38f6102e83fa691a573479ae2cd55"
  },
  {
    "path": "packages/shared/src/model-provider-types.ts",
    "sha256": "7136b3e33dc7274e747e14f6c66cb4acf908dc6f2d8cf2b28adfc569bee218e8",
    "bytes": 3104,
    "gitBlob": "259ce8e06d127278db0d1aeea8453dfe7aedae5e"
  },
  {
    "path": "packages/shared/src/oauth.ts",
    "sha256": "426441fab7296a7a110523b455dbb3b8b86f291da5b6e3e0127058f63e26841b",
    "bytes": 5644,
    "gitBlob": "3c6bb8bcb7a0cf06e9ebead872c0470ba8f05355"
  },
  {
    "path": "packages/shared/src/zcode-protocol-v4/workflow-runs-holes.ts",
    "sha256": "c302c64a56a350a161f1d6bcda46a9ffca351f496b06e3075db57a10aa16d268",
    "bytes": 9490,
    "gitBlob": "d9758ee6dc1286cfb876b56f6d8683d375bbaf6e"
  }
];

// Reviewed DSH bridge: structural resets precede source utilities; colors follow
// them again so raw theme declarations cannot overwrite host appearance tokens.
const HOST_CSS = `.omaa-zcode-workflow-graph{box-sizing:border-box;min-width:0;width:100%;font-family:inherit;--ui-font-size:14px;--color-foreground:var(--dsw-alias-label-primary);--color-foreground-subtle:var(--dsw-alias-label-secondary);--color-foreground-subtlest:var(--dsw-alias-label-tertiary);--color-foreground-inverse:var(--dsw-alias-bg-base);--color-surface:var(--dsw-alias-bg-layer-1);--color-surface-hover:var(--dsw-alias-interactive-bg-hover);--color-hover:var(--dsw-alias-interactive-bg-hover);--color-background:var(--dsw-alias-bg-base);--color-border:var(--dsw-alias-border-l2);--color-border-hover:var(--dsw-alias-border-l3);--color-ring:var(--dsw-alias-brand-primary);--color-warning:var(--dsw-alias-state-warn-primary);--color-success:var(--dsw-alias-state-success-primary);--color-destructive:var(--dsw-alias-state-error-primary);--color-workflow-trace:var(--dsw-alias-border-l2);--color-workflow-trace-strong:var(--dsw-alias-label-tertiary);--color-interaction-confirmation-surface:var(--dsw-alias-bg-layer-1);--color-interaction-confirmation-foreground:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary);} .omaa-zcode-workflow-graph *,.omaa-zcode-workflow-graph ::before,.omaa-zcode-workflow-graph ::after{box-sizing:border-box;border-width:0;border-style:solid;} .omaa-zcode-workflow-graph button{margin:0;padding:0;background:transparent;color:inherit;font:inherit;cursor:pointer;} .omaa-zcode-workflow-graph svg{display:block;vertical-align:middle;} .omaa-zcode-workflow-graph h4,.omaa-zcode-workflow-graph p{margin:0;font-size:inherit;font-weight:inherit;} .omaa-zcode-workflow-graph .omaa-zcode-phase-pane{display:flex;flex-direction:column;min-height:0;max-height:480px;margin-top:10px;border-top:1px solid var(--dsw-alias-border-l2);overflow:hidden;}
`;
const CSS_HEADER = '/* Generated from fixed Apache-2.0 ZCode aac4755 workflow UI CSS and its exact 49-source Tailwind 4.2.2 utility candidates. Host mapping and scope only; see THIRD_PARTY_NOTICES.md. */\n';

// Keep this host seam visible and reviewable. It mirrors only the original
// formatMessage contract consumed by this graph; DSH still owns language settings.
const INTL_BRIDGE = `import React, { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { zcodeGraphMessages } from './zcode-workflow-graph-messages.mjs';

const GraphIntl = createContext(null);
const hostLocale = () => typeof document === 'undefined' ? 'zh-CN' : document.documentElement.lang || 'zh-CN';
const subscribeLocale = listener => {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  return () => observer.disconnect();
};
const normalizeLocale = locale => /^en(?:-|$)/i.test(locale || '') ? 'en-US' : 'zh-CN';
const instance = locale => ({
  // Same public formatting contract and replacement policy as the original
  // ZCode IntlProvider. Locale settings and service ownership stay with DSH.
  formatMessage({ id }, values) {
    let text = zcodeGraphMessages[locale][id] ?? id;
    if (values) for (const [key, value] of Object.entries(values)) text = text.replaceAll(\`{\${key}}\`, String(value));
    return text;
  },
});

export function ZCodeGraphIntlProvider({ children, locale }) {
  const existing = useSyncExternalStore(subscribeLocale, hostLocale, () => 'zh-CN');
  const language = normalizeLocale(locale || existing);
  const value = useMemo(() => ({ locale: language, intl: instance(language) }), [language]);
  return <GraphIntl.Provider value={value}>{children}</GraphIntl.Provider>;
}

export function useZCodeIntl() {
  const value = useContext(GraphIntl);
  if (!value) throw new Error('ZCode workflow graph requires its locale provider.');
  return value;
}
`;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function verifiedSources() {
  // These UI pins have their own version boundary. The main prompt's older
  // source manifest continues to describe its separately retained snapshots.
  const sources = new Map();
  for (const pin of PINS) {
    const bytes = await readFile(path.join(SNAPSHOTS, pin.path));
    const blob = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
    if (sha256(bytes) !== pin.sha256 || bytes.length !== pin.bytes || blob !== pin.gitBlob)
      throw new Error(`Raw ${COMMIT} source hash/size/blob mismatch: ${pin.path}`);
    sources.set(pin.path, bytes.toString('utf8'));
  }
  return sources;
}

function runtimeClosure(sources) {
  const visited = new Set(), pending = ENTRIES.map(entry => UI_PREFIX + entry);
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    const text = sources.get(file);
    if (text === undefined) throw new Error(`Runtime graph dependency is not a verified snapshot: ${file}`);
    visited.add(file);
    const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    for (const node of parsed.statements) {
      if ((!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) || !node.moduleSpecifier) continue;
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        if (clause?.isTypeOnly || clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.every(element => element.isTypeOnly)) continue;
      } else if (node.isTypeOnly) continue;
      const name = node.moduleSpecifier.text;
      if (['@/i18n/IntlProvider.js', '@/chat-input-toolbar/thoughtLevelOptions.js',
        '@/lib/zcodeSessionProjection.js', '@/v4/composer/modelTriggerDisplay.js'].includes(name)) continue; // selected pure/Intl ports
      if (!name.startsWith('.') && !name.startsWith('@/')) continue; // normal React/icon/class utilities
      const target = name.startsWith('@/') ? UI_PREFIX + name.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(file), name));
      const resolved = [target, target.replace(/\.js$/, '.ts'), target.replace(/\.js$/, '.tsx')].find(candidate => sources.has(candidate));
      if (!resolved) throw new Error(`Unpinned runtime import ${name} in ${file}`);
      pending.push(resolved);
    }
  }
  if (visited.size !== 49) throw new Error(`The fixed graph runtime closure must contain 49 files; got ${visited.size}.`);
  return [...visited].sort();
}

function sourceVocabulary(files, sources) {
  const candidates = new Set(), exactMessages = new Set(), messagePrefixes = new Set();
  const messageKey = /^(chat\.toolCall\.workflow\.|sidePane\.time\.|chat\.toolbar\.thoughtLevel\.value\.)/;
  for (const file of files) {
    const parsed = ts.createSourceFile(file, sources.get(file), ts.ScriptTarget.Latest, true);
    const walk = node => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        for (const token of node.text.split(/\s+/)) if (token) candidates.add(token);
        if (ts.isStringLiteral(node) && messageKey.test(node.text)) exactMessages.add(node.text);
      }
      if (ts.isTemplateExpression(node) && messageKey.test(node.head.text)) messagePrefixes.add(node.head.text);
      ts.forEachChild(node, walk);
    };
    walk(parsed);
  }
  return { candidates, exactMessages, messagePrefixes };
}

function messageAsset(sources, { exactMessages, messagePrefixes }) {
  const dictionaries = {};
  for (const locale of ['zh-CN', 'en-US']) {
    const file = UI_PREFIX + `i18n/locales/${locale}.ts`;
    const parsed = ts.createSourceFile(file, sources.get(file), ts.ScriptTarget.Latest, true);
    const dictionary = {};
    const walk = node => {
      if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name) && ts.isStringLiteral(node.initializer)) {
        const key = node.name.text;
        if (exactMessages.has(key) || [...messagePrefixes].some(prefix => key.startsWith(prefix))) dictionary[key] = node.initializer.text;
      }
      ts.forEachChild(node, walk);
    };
    walk(parsed);
    dictionaries[locale] = dictionary;
  }
  return '// Derived from fixed Apache-2.0 ZCode aac4755 locale entries; see THIRD_PARTY_NOTICES.md.\nexport const zcodeGraphMessages = ' + JSON.stringify(dictionaries, null, 2) + ';\n';
}

function buildRuntime(runtimePath) {
  const request = runtimePath ? createRequire(path.resolve(runtimePath, 'package.json')) : createRequire(import.meta.url);
  for (const [name, expected] of [['tailwindcss', '4.2.2'], ['postcss', '8.5.6']]) {
    let manifest;
    try { manifest = request(`${name}/package.json`); }
    catch { throw new Error(`Missing build-only ${name}@${expected}. Install it as a devDependency or pass --css-runtime with an isolated install; see this script's CLI documentation.`); }
    if (manifest.version !== expected) throw new Error(`Use build-only ${name}@${expected}; found ${manifest.version}.`);
  }
  return { tailwind: request('tailwindcss'), postcss: request('postcss'), themePath: request.resolve('tailwindcss/theme.css') };
}

function scopeRules(tree) {
  tree.walkRules(rule => {
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && /keyframes$/.test(parent.name)) return;
      if (parent.type === 'rule' && parent.selector.includes(WRAPPER)) return;
    }
    if (rule.selector.includes(WRAPPER)) return;
    rule.selector = rule.selector === ':root, :host' ? WRAPPER : rule.selectors.map(selector => `${WRAPPER} ${selector}`).join(', ');
  });
}

function isolateAnimationNames(tree) {
  const names = new Map();
  tree.walkAtRules(/keyframes$/, rule => {
    const name = rule.params;
    const replacement = `omaa-zcode-graph-${name}`;
    names.set(name, replacement); rule.params = replacement;
  });
  tree.walkDecls(declaration => {
    for (const [name, replacement] of names) {
      // A bare animation name is renamed; var(--wf-beat) and blink-time remain
      // original public motion inputs, including JS-written duration properties.
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      declaration.value = declaration.value.replace(new RegExp(`(?<![-\\w])${escaped}(?![-\\w])`, 'g'), replacement);
    }
  });
}

async function cssAsset(sources, candidates, runtimePath) {
  const { tailwind, postcss, themePath } = buildRuntime(runtimePath);
  const source = postcss.parse(sources.get(UI_PREFIX + 'styles.css'));
  const theme = source.nodes.find(node => node.type === 'atrule' && node.name === 'theme');
  const first = source.nodes.findIndex(node => node.type === 'rule' && node.selector === '.wf-rail-march::after');
  const last = source.nodes.findIndex((node, index) => index > first && node.type === 'comment' && node.text.includes('Mention 图标'));
  if (!theme || first < 0 || last < 0) throw new Error('The fixed source theme/workflow style boundaries are missing.');
  const compiled = await tailwind.compile(await readFile(themePath, 'utf8') + theme.toString() + `${WRAPPER}{@tailwind utilities;}`);
  const utility = postcss.parse(compiled.build([...candidates]));
  const workflow = postcss.root({ nodes: source.nodes.slice(first, last).map(node => node.clone()) });
  scopeRules(utility); scopeRules(workflow);
  isolateAnimationNames(utility); isolateAnimationNames(workflow);
  const styles = (utility.toString() + '\n' + workflow.toString()).replaceAll('--tw-', '--omaa-zcode-graph-tw-');
  const trailingHostColors = HOST_CSS.slice(0, HOST_CSS.indexOf(` ${WRAPPER} *`));
  const transformed = await transform(HOST_CSS + styles + '\n' + trailingHostColors, { loader: 'css', target: 'es2022' });
  return CSS_HEADER + transformed.code;
}

export async function generateZCodeGraphUiAssets({ runtimePath } = {}) {
  const sources = await verifiedSources();
  const files = runtimeClosure(sources);
  const vocabulary = sourceVocabulary([...files, UI_PREFIX + 'chat-input-toolbar/thoughtLevelOptions.ts'], sources);
  return new Map([
    ['zcode-workflow-graph.css', await cssAsset(sources, vocabulary.candidates, runtimePath)],
    ['zcode-workflow-graph-messages.mjs', messageAsset(sources, vocabulary)],
    ['zcode-workflow-graph-intl.jsx', INTL_BRIDGE],
    ['zcode-workflow-graph-ports.mjs', graphUiPortAsset(sources)],
  ]);
}

export async function buildZCodeGraphUiAssets({ mode = 'check', outputDir = CLIENT, runtimePath } = {}) {
  if (mode !== 'check' && mode !== 'write') throw new Error('Graph asset mode must be check or write.');
  const assets = await generateZCodeGraphUiAssets({ runtimePath });
  if (mode === 'write') await mkdir(outputDir, { recursive: true });
  const results = [];
  for (const [name, text] of assets) {
    const target = path.resolve(outputDir, name);
    if (mode === 'write') await writeFile(target, text);
    else {
      const existing = await readFile(target, 'utf8');
      if (existing !== text) throw new Error(`Generated graph asset differs: ${target}. Generate with --output-dir for review before --write.`);
    }
    results.push({ path: target, bytes: Buffer.byteLength(text), sha256: sha256(text) });
  }
  return results;
}

async function main(args) {
  let mode = 'check', outputDir = CLIENT, runtimePath;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--check') mode = 'check';
    else if (arg === '--write') mode = 'write';
    else if (arg === '--output-dir') { outputDir = args[++index]; mode = 'write'; if (!outputDir) throw new Error('--output-dir requires a directory.'); }
    else if (arg === '--css-runtime') { runtimePath = args[++index]; if (!runtimePath) throw new Error('--css-runtime requires an install directory.'); }
    else if (arg === '--help') { console.log('Usage: node scripts/build-zcode-graph-ui-assets.mjs [--check | --write | --output-dir DIR] [--css-runtime DIR]\nDefault: read-only --check. CSS build tools: tailwindcss@4.2.2 and postcss@8.5.6, dev-only or isolated install.'); return; }
    else throw new Error(`Unknown option: ${arg}`);
  }
  const results = await buildZCodeGraphUiAssets({ mode, outputDir, runtimePath });
  console.log(`Graph assets ${mode === 'check' ? 'verified' : 'generated'} from fixed ${COMMIT.slice(0, 7)} (${PINS.length} raw sources, 49 runtime files).`);
  for (const result of results) console.log(`${result.bytes} B ${result.sha256} ${result.path}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
