// Derived from fixed Apache-2.0 ZCode artifact sources at 29628c9; see THIRD_PARTY_NOTICES.md.
import { realpath } from "node:fs/promises";
import { basename } from "node:path";
import {
  isFileSystemPortError
} from "./zcode-fs-contracts.mjs";
import {
  ARTIFACT_CAPS,
  ARTIFACT_ID_PATTERN,
  WorkflowError
} from "./zcode-artifact-shared.mjs";
import { resolveWithinWorkspace, toWorkspaceRelative } from "./zcode-world-read.mjs";
async function executeArtifactPublish(deps, request) {
  assertArtifactId(request);
  const opts = artifactPublishOptions(request);
  const store = requireArtifactStore(deps, request);
  const payload = request.op === "file" ? await readFilePayload(deps, request, opts) : markdownPayload(request);
  const written = await writePayload(store, request, payload);
  return {
    id: request.id,
    kind: request.op,
    version: request.version,
    ...opts.title === void 0 ? {} : { title: opts.title },
    ...opts.description === void 0 ? {} : { description: opts.description },
    // contentType 取**本地算出的**那一个而不是 store 的回执：扩展名表 + `opts.contentType`
    // 覆盖共同决定内容类型，UI 在这个字符串上做 switch 分派；让 store 的归一化（它按
    // 落盘文件名回推类型）成为权威，会让一次分派结果取决于 store 实现。
    contentType: payload.contentType,
    // bytes / uri 取 store 的回执：那是**真正落进 store 的那一份**，也是日后读回来的那一份。
    bytes: written.bytes,
    uri: written.uri,
    ...payload.kind === "binary" ? { sourcePath: payload.sourcePath } : {},
    // 引擎没有时钟（纯核心，可重放），所以发布时刻由这一侧填。发布时刻为必填字段。
    publishedAt: Date.now()
  };
}
function assertArtifactId(request) {
  const { id } = request;
  if (id.length > ARTIFACT_CAPS.maxIdLength || !ARTIFACT_ID_PATTERN.test(id)) {
    throw new WorkflowError(
      "DriverError",
      `artifact.${request.op}: id '${id}' is not a valid artifact id. Use at most ${ARTIFACT_CAPS.maxIdLength} characters from [A-Za-z0-9_.-].`
    );
  }
}
function artifactPublishOptions(request) {
  const raw = request.opts;
  if (raw === void 0) return {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new WorkflowError(
      "DriverError",
      `artifact.${request.op}: opts must be an options object, got ${describeArg(raw)}. Pass an object or omit the argument.`
    );
  }
  const bag = raw;
  const title = optionalText(request, "title", bag.title, ARTIFACT_CAPS.maxTitleLength);
  const description = optionalText(
    request,
    "description",
    bag.description,
    ARTIFACT_CAPS.maxDescriptionLength
  );
  const contentType = request.op === "file" ? optionalContentType(request, bag.contentType) : void 0;
  return {
    ...title === void 0 ? {} : { title },
    ...description === void 0 ? {} : { description },
    ...contentType === void 0 ? {} : { contentType }
  };
}
function optionalText(request, name, value, max) {
  if (value === void 0) return void 0;
  if (typeof value !== "string") {
    throw new WorkflowError(
      "DriverError",
      `artifact.${request.op}: opts.${name} must be a string, got ${describeArg(value)}.`
    );
  }
  if (value.length > max) {
    throw new WorkflowError(
      "ArtifactTooLarge",
      `artifact.${request.op}: opts.${name} is ${value.length} characters, over the cap of ${max}. Shorten it.`
    );
  }
  return value;
}
function optionalContentType(request, value) {
  if (value === void 0) return void 0;
  if (typeof value !== "string") {
    throw new WorkflowError(
      "DriverError",
      `artifact.file: opts.contentType must be a string, got ${describeArg(value)}.`
    );
  }
  if (!CONTENT_TYPE_PATTERN.test(value)) {
    throw new WorkflowError(
      "DriverError",
      `artifact.file: opts.contentType '${value}' is not a bare MIME type such as 'application/pdf'. Drop any parameters ('; charset=...'); the viewer dispatches on the exact string.`
    );
  }
  return value;
}
async function readFilePayload(deps, request, opts) {
  const given = request.path;
  if (typeof given !== "string" || given === "") {
    throw new WorkflowError(
      "DriverError",
      `artifact.file: path must be a non-empty string, got ${describeArg(given)}. Pass the workspace-relative path the subagent wrote.`
    );
  }
  const { real, relative } = await resolveWorkspaceFile(deps, given);
  const bytes = await readCappedBytes(deps, given, real);
  const extension = fileExtension(real);
  return {
    kind: "binary",
    bytes,
    contentType: opts.contentType ?? (extension === void 0 ? void 0 : EXTENSION_CONTENT_TYPES[extension]) ?? // 未列入扩展名表 = 不猜（不做 magic bytes 嗅探）。UI 据此给「下载 / 在工作区
    // 显示」卡而不是渲染一份它读不懂的东西。
    "application/octet-stream",
    ...extension === void 0 ? {} : { extension },
    sourcePath: relative
  };
}
async function resolveWorkspaceFile(deps, given) {
  const resolved = resolveWithinWorkspace(deps.cwd, given);
  if (resolved === void 0) throw outsideWorkspace(given);
  const relative = toWorkspaceRelative(deps.cwd, resolved);
  let realCwd;
  let real;
  try {
    realCwd = await realpath(deps.cwd);
  } catch (cause) {
    throw new WorkflowError(
      "DriverError",
      `artifact.file: cannot resolve the workspace root '${deps.cwd}': ${errorText(cause)}`,
      { cause }
    );
  }
  try {
    real = await realpath(resolved);
  } catch (cause) {
    throw sourceMissing(given, cause);
  }
  if (resolveWithinWorkspace(realCwd, real) === void 0) throw outsideWorkspace(given);
  return { real, relative };
}
async function readCappedBytes(deps, given, path) {
  const cap = ARTIFACT_CAPS.maxFileBytes;
  let result;
  try {
    result = await deps.fileSystemPort.readBinaryFile({ path, maxBytes: cap + 1 });
  } catch (cause) {
    if (isFileSystemPortError(cause)) {
      if (cause.code === "too_large") throw tooLarge(given, cap);
      if (cause.code === "not_found" || cause.code === "is_directory" || cause.code === "not_file") {
        throw sourceMissing(given, cause);
      }
    }
    throw new WorkflowError(
      "DriverError",
      `artifact.file: failed to read '${given}': ${errorText(cause)}`,
      { cause }
    );
  }
  if (result.content.byteLength > cap) throw tooLarge(given, cap);
  return result.content;
}
function markdownPayload(request) {
  const content = request.content;
  if (typeof content !== "string") {
    throw new WorkflowError(
      "DriverError",
      `artifact.markdown: content must be a string, got ${describeArg(content)}.`
    );
  }
  const bytes = Buffer.byteLength(content, "utf8");
  const cap = ARTIFACT_CAPS.maxMarkdownBytes;
  if (bytes > cap) {
    throw new WorkflowError(
      "ArtifactTooLarge",
      `artifact.markdown: content is ${bytes} bytes, over the cap of ${cap} bytes. Shorten it, or write the long content to a workspace file and publish it with artifact.file.`
    );
  }
  return { kind: "text", text: content, contentType: "text/markdown" };
}
function requireArtifactStore(deps, request) {
  const store = deps.artifactStore;
  if (store === void 0) {
    throw new WorkflowError(
      "ArtifactStoreUnavailable",
      `artifact.${request.op}: cannot publish "${request.id}" because this assembly has no artifact store.`
    );
  }
  if (request.op === "file" && store.writeToolResultBinaryArtifact === void 0) {
    throw new WorkflowError(
      "ArtifactStoreUnavailable",
      `artifact.file: cannot publish "${request.id}" because this assembly's artifact store does not support binary writes.`
    );
  }
  const sessionId = deps.parentSessionId;
  if (sessionId === void 0 || sessionId === "") {
    throw new WorkflowError(
      "ArtifactStoreUnavailable",
      `artifact.${request.op}: cannot publish "${request.id}" because the artifact store has no session scope (parent session id not wired).`
    );
  }
  return { store, sessionId };
}
async function writePayload(target, request, payload) {
  const common = {
    sessionId: target.sessionId,
    toolCallId: `${request.runId}:${request.siteId}@${request.ordinal}`,
    toolName: ARTIFACT_TOOL_NAME,
    retention: "project"
  };
  try {
    if (payload.kind === "text") {
      return await target.store.writeToolResultArtifact({
        ...common,
        content: payload.text,
        contentType: payload.contentType
      });
    }
    const writeBinary = target.store.writeToolResultBinaryArtifact;
    if (writeBinary === void 0) {
      throw new WorkflowError(
        "ArtifactStoreUnavailable",
        `artifact.file: cannot publish "${request.id}" because this assembly's artifact store does not support binary writes.`
      );
    }
    return await writeBinary.call(target.store, {
      ...common,
      content: payload.bytes,
      contentType: payload.contentType,
      // 扩展名随字节一起交给 store：它读回时按落盘文件名回推类型，丢了扩展名就等于把一份
      // .xlsx 读成 application/octet-stream。
      ...payload.extension === void 0 ? {} : { extension: payload.extension }
    });
  } catch (cause) {
    if (cause instanceof WorkflowError) throw cause;
    throw new WorkflowError(
      "DriverError",
      `artifact.${request.op}: writing "${request.id}" v${request.version} to the artifact store failed: ${errorText(cause)}`,
      { cause }
    );
  }
}
const ARTIFACT_TOOL_NAME = "CreateWorkflow";
const EXTENSION_CONTENT_TYPES = {
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  gif: "image/gif",
  htm: "text/html",
  html: "text/html",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  json: "application/json",
  markdown: "text/markdown",
  md: "text/markdown",
  pdf: "application/pdf",
  png: "image/png",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  svg: "image/svg+xml",
  txt: "text/plain",
  webp: "image/webp",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};
const CONTENT_TYPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/;
function fileExtension(path) {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return void 0;
  const ext = name.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]+$/.test(ext) ? ext : void 0;
}
function outsideWorkspace(given) {
  return new WorkflowError(
    "ArtifactPathOutsideWorkspace",
    `artifact.file: path '${given}' resolves outside the workspace (symlinks are judged by their real path). Only files inside the workspace can be published.`
  );
}
function sourceMissing(given, cause) {
  return new WorkflowError(
    "ArtifactSourceMissing",
    `artifact.file: '${given}' does not exist or is not a regular file. Confirm the subagent actually wrote it before publishing.`,
    { cause }
  );
}
function tooLarge(given, cap) {
  return new WorkflowError(
    "ArtifactTooLarge",
    `artifact.file: '${given}' is over the cap of ${cap} bytes. Publish a smaller artifact (a summary, a slice, or a compressed version).`
  );
}
function describeArg(value) {
  if (value === void 0) return "undefined";
  if (value === null) return "null";
  return Array.isArray(value) ? "array" : typeof value;
}
function errorText(cause) {
  return cause instanceof Error ? cause.message : String(cause);
}
export {
  executeArtifactPublish
};
