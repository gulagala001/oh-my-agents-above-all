import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCursorEditor, locateReviewLine, reviewLineAnchor } from '../src/host/cursor-editor.mjs';

test('review coordinates map intact old/new blocks and refuse deleted or ambiguous lines', () => {
  const diff = { kind: 'text', hunks: [{ oldStart: 4, newStart: 4, lines: [' before', '-removed', '+added', ' after'] }] };
  const anchor = reviewLineAnchor(diff, 'new', 5);
  assert.equal(locateReviewLine('inserted\nheader\nbefore\nadded\nafter\n', anchor), 4);
  assert.throws(() => locateReviewLine('before\nadded\nafter\n', reviewLineAnchor(diff, 'old', 5)), /变化／删除/);
  assert.throws(() => locateReviewLine('before\nadded\nafter\nbefore\nadded\nafter\n', anchor), /多个匹配/);
  assert.equal(locateReviewLine('before\r\nadded\r\nafter\r\n', anchor), 2);
});

test('editor launch validates local paths and permissions, uses one argv target and propagates cancellation', async t => {
  const root = await realpath(await mkdtemp(join(process.env.OMAA_TEST_ROOT_DIR ?? tmpdir(), 'omaa-editor-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace'), bin = join(root, 'bin'); await mkdir(workspace); await mkdir(bin);
  const executable = join(bin, 'code'); await writeFile(executable, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const name = '引号 " ;$(not-executed) : part.txt'; await writeFile(join(workspace, name), 'first\nsecond\n');
  const launches = [], checked = [];
  const editor = createCursorEditor({ platform: 'linux', home: root, env: { PATH: bin, DISPLAY: ':fixture' },
    verifyPath: async path => { checked.push(path); }, run: async (...args) => launches.push(args) });
  assert.deepEqual(await editor.list(), [{ id: 'vscode', name: 'Visual Studio Code' }]);
  const signal = new AbortController().signal;
  const result = await editor.open({ root: workspace, path: name, anchor: { lines: ['second'], offset: 0 }, line: 1 }, signal);
  assert.equal(result.line, 2); assert.equal(result.remapped, true);
  assert.deepEqual(launches[0].slice(0, 2), [executable, ['--goto', join(workspace, name) + ':2:1']]);
  assert.equal(checked.length, 2);
  await assert.rejects(editor.open({ root: workspace, path: '../bin/code' }, signal), /工作目录/);
  await symlink(executable, join(workspace, 'link'));
  await assert.rejects(editor.open({ root: workspace, path: 'link' }, signal), /符号链接/);
  await assert.rejects(editor.open({ root: workspace, path: name, editor: '../../evil' }, signal), /未找到/);
  await assert.rejects(editor.open({ root: workspace, path: name }, AbortSignal.abort(Error('cancelled'))), /cancelled/);
  const denied = createCursorEditor({ platform: 'linux', home: root, env: { PATH: bin, DISPLAY: ':fixture' }, verifyPath: async () => { throw Error('native read denied'); }, run: async () => assert.fail('permission denied must not launch') });
  await assert.rejects(denied.open({ root: workspace, path: name }, signal), /native read denied/);
  assert.equal(launches.length, 1);
  const app = join(root, 'Applications/Visual Studio Code.app');
  const cli = join(app, 'Contents/Resources/app/bin/code');
  await mkdir(join(app, 'Contents/Resources/app/bin'), { recursive: true }); await writeFile(cli, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const mac = createCursorEditor({ platform: 'darwin', home: root, env: {}, verifyPath: async () => {}, run: async (...args) => launches.push(args) });
  await mac.open({ root: workspace, path: name, anchor: { lines: ['second'], offset: 0 } }, signal);
  assert.equal(launches[1][0], cli);
  assert.deepEqual(launches[1][1], ['--goto', join(workspace, name) + ':2:1']);
});
