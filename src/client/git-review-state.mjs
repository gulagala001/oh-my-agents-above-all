export function gitReviewErrorHint(code, message) {
  // Match the native Git diagnostic, not arbitrary transport or Git failures.
  if (code === 'GIT_FAILED' && /^fatal: not a git repository(?: \(or any of the parent directories\))?(?::|$)/.test(message)) {
    return '当前目录不属于 Git 仓库；选择仓库后审阅。';
  }
  return null;
}
