// Derived from exact Apache-2.0 ZCode aac4755 declarations; build-only selection, no application runtime ports.
import { z } from "zod";
/**
 * 留白的站点 id：`hole#` 加 8 位十六进制，键是留白的**名字**，与嵌套深度无关（CLI 的
 * analysis/hole-id.ts 铸造；apps/zcode-cli/packages/dynamic-workflow/docs/analysis.md「Sites」）。
 * id 里不再写嵌套关系：一个留白在哪个留白里面，看它自己的阶段 / 站上的 `fill`。
 */
export const WORKFLOW_HOLE_SITE_ID_PATTERN = /^hole#[0-9a-f]{8}$/u;
/** 用户对后续模型执行的完整选择；不表达已经创建的 Active Model。 */
const modelSelectionSchema = z
    .object({
    providerId: z.string().trim().min(1),
    modelId: z.string().trim().min(1),
    options: z
        .object({
        reasoningLevel: z.string().trim().min(1).optional(),
    })
        .strict()
        .optional(),
})
    .strict();
const ZCODE_MODEL_REASONING_SEPARATOR = "$";
/** 只解析 Picker/legacy 字符串边界；领域状态与协议必须直接保存 ModelSelection。 */
function parseSharedModelSelection(value) {
    const normalized = value.trim();
    const providerSeparatorIndex = normalized.indexOf("/");
    if (providerSeparatorIndex <= 0) {
        throw new Error(`模型选择缺少 Provider: ${normalized}`);
    }
    const providerId = normalized.slice(0, providerSeparatorIndex);
    const rawModelId = normalized.slice(providerSeparatorIndex + 1);
    const reasoningSeparatorIndex = rawModelId.indexOf(ZCODE_MODEL_REASONING_SEPARATOR);
    if (reasoningSeparatorIndex <= 0 || reasoningSeparatorIndex >= rawModelId.length - 1) {
        return modelSelectionSchema.parse({ providerId, modelId: rawModelId });
    }
    return modelSelectionSchema.parse({
        providerId,
        modelId: rawModelId.slice(0, reasoningSeparatorIndex),
        options: { reasoningLevel: rawModelId.slice(reasoningSeparatorIndex + 1) },
    });
}
const CUSTOM_MODEL_VALUE_PREFIX = "custom:";
function safeDecodeUriComponent(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return value;
    }
}
function decodeCustomModelValue(value) {
    if (!value.startsWith(CUSTOM_MODEL_VALUE_PREFIX)) {
        return null;
    }
    const body = value.slice(CUSTOM_MODEL_VALUE_PREFIX.length);
    const separatorIndex = body.indexOf(":");
    if (separatorIndex < 0) {
        return {
            providerId: safeDecodeUriComponent(body),
        };
    }
    const legacyParts = body.split(":");
    if (legacyParts.length >= 3 && legacyParts[0] === "builtin") {
        return {
            providerId: `${legacyParts[0]}:${legacyParts[1]}`,
            modelName: safeDecodeUriComponent(legacyParts.slice(2).join(":")),
        };
    }
    const encodedProviderId = body.slice(0, separatorIndex);
    const encodedModelName = body.slice(separatorIndex + 1);
    return {
        providerId: safeDecodeUriComponent(encodedProviderId),
        modelName: safeDecodeUriComponent(encodedModelName),
    };
}
const BUILTIN_MODEL_PROVIDER_IDS = {
    zaiIndividualCodingPlan: "account:zai-individual-coding-plan",
    zaiTeamCodingPlan: "account:zai-team-coding-plan",
    zaiStartPlan: "account:zai-start-plan",
    bigmodelIndividualCodingPlan: "account:bigmodel-individual-coding-plan",
    bigmodelTeamCodingPlan: "account:bigmodel-team-coding-plan",
    bigmodelStartPlan: "account:bigmodel-start-plan",
};
const MODEL_PROVIDER_FAMILY_SPECS = [
    {
        id: "zai",
        startPlanProviderId: BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan,
        individualCodingPlanProviderId: BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan,
        teamCodingPlanProviderId: BUILTIN_MODEL_PROVIDER_IDS.zaiTeamCodingPlan
    },
    {
        id: "bigmodel",
        startPlanProviderId: BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan,
        individualCodingPlanProviderId: BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan,
        teamCodingPlanProviderId: BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan
    }
];
const MODEL_PROVIDER_FAMILY_ID_BY_PROVIDER_ID = new Map(MODEL_PROVIDER_FAMILY_SPECS.flatMap((spec) => [
    spec.startPlanProviderId,
    spec.individualCodingPlanProviderId,
    spec.teamCodingPlanProviderId,
].map((providerId) => [providerId, spec.id])));
function resolveModelProviderFamilyIdByProviderId(providerId) {
    return MODEL_PROVIDER_FAMILY_ID_BY_PROVIDER_ID.get(providerId) ?? null;
}
export function formatProviderModelLabel(providerId, providerName, modelName) {
    // Z.ai / BigModel 的内置连接名属于产品固定入口，拼进模型文案会重复展示
    // “Coding Plan”等连接信息；切换提示额外通过 formatModelChangeLabel 标明套餐类型。
    if (providerId && resolveModelProviderFamilyIdByProviderId(providerId)) {
        return modelName;
    }
    const normalizedProviderName = providerName?.trim();
    return normalizedProviderName ? `${normalizedProviderName}/${modelName}` : modelName;
}
export function parseModelPickerValue(value) {
    const customModel = decodeCustomModelValue(value);
    if (customModel?.providerId && customModel.modelName) {
        // UI 自定义模型值是展示态 custom:provider:model，
        // ZCode Protocol 必须收到严格的 providerId/modelId 结构。
        return {
            providerId: customModel.providerId,
            modelId: customModel.modelName,
        };
    }
    return parseSharedModelSelection(value);
}
const THOUGHT_LEVEL_LABEL_IDS = {
    disabled: "chat.toolbar.thoughtLevel.value.off",
    false: "chat.toolbar.thoughtLevel.value.off",
    no: "chat.toolbar.thoughtLevel.value.off",
    none: "chat.toolbar.thoughtLevel.value.off",
    nothink: "chat.toolbar.thoughtLevel.value.off",
    "no-think": "chat.toolbar.thoughtLevel.value.off",
    no_think: "chat.toolbar.thoughtLevel.value.off",
    off: "chat.toolbar.thoughtLevel.value.off",
    enable: "chat.toolbar.thoughtLevel.value.on",
    enabled: "chat.toolbar.thoughtLevel.value.on",
    on: "chat.toolbar.thoughtLevel.value.on",
    true: "chat.toolbar.thoughtLevel.value.on",
    low: "chat.toolbar.thoughtLevel.value.low",
    minimal: "chat.toolbar.thoughtLevel.value.minimal",
    medium: "chat.toolbar.thoughtLevel.value.medium",
    high: "chat.toolbar.thoughtLevel.value.high",
    "extra-high": "chat.toolbar.thoughtLevel.value.xhigh",
    extra_high: "chat.toolbar.thoughtLevel.value.xhigh",
    xhigh: "chat.toolbar.thoughtLevel.value.xhigh",
    max: "chat.toolbar.thoughtLevel.value.max",
    ultra: "chat.toolbar.thoughtLevel.value.ultra",
};
function normalizeThoughtLevelText(value) {
    return value.trim().toLowerCase();
}
/**
 * 档位值 → 词条 id；表里没有的值返回 undefined（调用方原样显示 provider 自己的档位名）。
 * 工具条之外也有人要说这个词（工作流的子代理模型），两处必须查同一张表。
 */
export function thoughtLevelLabelId(value) {
    return THOUGHT_LEVEL_LABEL_IDS[normalizeThoughtLevelText(value)];
}
