// Derived from fixed Apache-2.0 ZCode world-read sources; see THIRD_PARTY_NOTICES.md.
class FileSystemPortError extends Error {
  code;
  path;
  cause;
  constructor(details) {
    super(details.message);
    this.name = "FileSystemPortError";
    this.code = details.code;
    this.path = details.path;
    this.cause = details.cause;
  }
}
function createFileSystemError(details) {
  return new FileSystemPortError(details);
}
function isFileSystemPortError(error) {
  return error instanceof FileSystemPortError;
}
export {
  FileSystemPortError,
  createFileSystemError,
  isFileSystemPortError
};
