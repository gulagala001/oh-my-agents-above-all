import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

// Prefer the caller's explicit binary; otherwise retain Playwright's bundled
// browser, with an installed Linux Chromium as an offline fallback.
export function browserExecutable() {
  if (process.env.OMAA_TEST_BROWSER_EXECUTABLE) return process.env.OMAA_TEST_BROWSER_EXECUTABLE;
  const bundled = chromium.executablePath();
  if (existsSync(bundled)) return bundled;
  if (existsSync('/usr/bin/chromium')) return '/usr/bin/chromium';
  return bundled;
}
export function launchChromium(options = {}) {
  return chromium.launch({ executablePath: browserExecutable(), ...options });
}
