// Derived from fixed Apache-2.0 ZCode world-read sources; see THIRD_PARTY_NOTICES.md.
import { StringDecoder } from "node:string_decoder";
import { TextDecoder } from "node:util";
import {
  createFileSystemError
} from "./zcode-fs-contracts.mjs";
import iconv from "iconv-lite";
const UTF8_BOM = [239, 187, 191];
const UTF16LE_BOM = [255, 254];
const LEGACY_CHINESE_ENCODINGS = ["gb2312", "gbk", "gb18030"];
const BINARY_CONTROL_BYTE_THRESHOLD = 0.3;
const MAX_DETECTION_TRAILING_DROP_BYTES = 3;
const NON_TEXT_ENCODINGS = /* @__PURE__ */ new Set(["base64", "base64url", "hex"]);
function detectTextEncoding(buffer, path) {
  if (buffer.length >= 3 && bytesStartWith(buffer, UTF8_BOM)) {
    return "utf8";
  }
  if (buffer.length >= 2 && bytesStartWith(buffer, UTF16LE_BOM)) {
    return "utf16le";
  }
  if (looksLikeBinary(buffer)) {
    throw createUnsupportedTextEncodingError(path);
  }
  if (isValidUtf8(buffer)) {
    return "utf8";
  }
  for (const encoding of LEGACY_CHINESE_ENCODINGS) {
    if (roundTripsWithOptionalTrailingDrop(buffer, encoding)) {
      return encoding;
    }
  }
  throw createUnsupportedTextEncodingError(path);
}
function decodeTextBuffer(request) {
  const encoding = request.encoding ?? detectTextEncoding(request.buffer, request.path);
  return {
    content: decodeBufferWithEncoding(request.buffer, encoding),
    encoding
  };
}
function encodeTextContent(request) {
  const encoding = request.encoding ?? "utf8";
  if (isLegacyChineseEncoding(encoding)) {
    const encoded = iconv.encode(request.content, encoding);
    assertLegacyEncodingRoundTrip({
      decoded: request.content,
      encoded,
      encoding,
      path: request.path
    });
    return encoded;
  }
  return Buffer.from(request.content, encoding);
}
function createStreamingTextDecoder(encoding) {
  if (isLegacyChineseEncoding(encoding)) {
    const decoder2 = iconv.getDecoder(encoding);
    return {
      write(buffer) {
        return decoder2.write(buffer);
      },
      end() {
        return decoder2.end() ?? "";
      }
    };
  }
  const decoder = new StringDecoder(encoding);
  return {
    write(buffer) {
      return decoder.write(buffer);
    },
    end() {
      return decoder.end();
    }
  };
}
function shouldNormalizeLineEndings(encoding) {
  return !NON_TEXT_ENCODINGS.has(normalizeEncodingName(encoding));
}
function decodeBufferWithEncoding(buffer, encoding) {
  if (isLegacyChineseEncoding(encoding)) {
    return iconv.decode(buffer, encoding);
  }
  return buffer.toString(encoding);
}
function assertLegacyEncodingRoundTrip(request) {
  if (iconv.decode(request.encoded, request.encoding) === request.decoded) return;
  throw createFileSystemError({
    code: "unsupported",
    path: request.path,
    message: `Content cannot be encoded as ${request.encoding}${request.path ? `: ${request.path}` : ""}`
  });
}
function roundTripsWithOptionalTrailingDrop(buffer, encoding) {
  if (buffer.length === 0) return true;
  for (let drop = 0; drop <= Math.min(MAX_DETECTION_TRAILING_DROP_BYTES, buffer.length); drop += 1) {
    const candidate = drop === 0 ? buffer : buffer.subarray(0, buffer.length - drop);
    if (candidate.length === 0) continue;
    const decoded = iconv.decode(candidate, encoding);
    const encoded = iconv.encode(decoded, encoding);
    if (encoded.equals(candidate)) return true;
  }
  return false;
}
function isValidUtf8(buffer) {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}
function looksLikeBinary(buffer) {
  if (buffer.length === 0) return false;
  let controlBytes = 0;
  for (const byte of buffer) {
    if (byte === 0) return true;
    if (byte < 9 || byte > 13 && byte < 32) {
      controlBytes += 1;
    }
  }
  return controlBytes / buffer.length > BINARY_CONTROL_BYTE_THRESHOLD;
}
function bytesStartWith(buffer, prefix) {
  return prefix.every((byte, index) => buffer[index] === byte);
}
function isLegacyChineseEncoding(encoding) {
  return LEGACY_CHINESE_ENCODINGS.includes(encoding);
}
function normalizeEncodingName(encoding) {
  return encoding.toLowerCase();
}
function createUnsupportedTextEncodingError(path) {
  return createFileSystemError({
    code: "unsupported",
    path,
    message: `Unsupported or binary text encoding${path ? `: ${path}` : ""}`
  });
}
function detectLineEndings(content) {
  let crlfCount = 0;
  let lfCount = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== "\n") continue;
    if (index > 0 && content[index - 1] === "\r") {
      crlfCount += 1;
    } else {
      lfCount += 1;
    }
  }
  return crlfCount > lfCount ? "CRLF" : "LF";
}
function normalizeLineEndings(content) {
  return content.replaceAll("\r\n", "\n");
}
function applyRequestedLineEndings(content, lineEndings) {
  if (lineEndings === void 0) {
    return content;
  }
  const normalized = normalizeLineEndings(content);
  return lineEndings === "CRLF" ? normalized.split("\n").join("\r\n") : normalized;
}
export {
  applyRequestedLineEndings,
  createStreamingTextDecoder,
  decodeTextBuffer,
  detectLineEndings,
  detectTextEncoding,
  encodeTextContent,
  normalizeLineEndings,
  shouldNormalizeLineEndings
};
