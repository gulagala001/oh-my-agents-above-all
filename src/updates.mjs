import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { splitReleaseVersion as parseRelease, compareFeatures, alignedVersion, supportsHostVersion, validationHosts } from './host/compatibility.mjs';

const REPO = 'gulagala001/oh-my-agents-above-all';
export const RELEASES_URL = `https://github.com/${REPO}/releases`;
const API = `https://api.github.com/repos/${REPO}`;
const OMD_REPO = 'gulagala001/oh-my-dsh';
const OMD_BRIDGE = JSON.parse(readFileSync(new URL('./host/compatibility.json', import.meta.url), 'utf8')).omdBridge;
const PACKAGE = { omaa: 'oh-my-agents-above-all', omd: 'oh-my-dsh' };
const RUNNING_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const fail = message => Object.assign(new Error(message), { statusCode: 409 });
export function splitReleaseVersion(version, product = 'omaa') {
  try { return parseRelease(version, product); }
  catch { throw fail('发行版本或 DSH 宿主格式无效'); }
}
function compare(left, right, product) {
  const a = splitReleaseVersion(left, product), b = splitReleaseVersion(right, product);
  if (a.host !== b.host && product === 'omd') throw fail('发行与当前 DSH 宿主不匹配');
  return compareFeatures(left, right, product);
}
function published(release) {
  if (!release || release.draft !== false || !release.published_at || !Array.isArray(release.assets)) throw fail('GitHub 发行尚未发布或附件无效');
  const version = release.tag_name?.replace(/^v/, '');
  splitReleaseVersion(version);
  if (release.tag_name !== `v${version}` || release.html_url !== `${RELEASES_URL}/tag/${release.tag_name}`) throw fail('GitHub 发行来源或 tag 无效');
  return version;
}
function asset(release, filename, repository = REPO) {
  const found = release.assets.filter(row => row.name === filename && row.state === 'uploaded');
  const expected = `https://github.com/${repository}/releases/download/${release.tag_name}/${filename}`;
  if (found.length !== 1 || found[0].browser_download_url !== expected) throw fail(`发行缺少匹配附件：${filename}`);
  return expected;
}
async function boundedText(response, limit) {
  if (!response.ok) { await response.body?.cancel(); throw fail(`GitHub 更新检查失败（HTTP ${response.status}）`); }
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw fail('GitHub 更新资料过大'); }
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body ?? []) {
    bytes += chunk.byteLength;
    if (bytes > limit) { await response.body?.cancel().catch(() => {}); throw fail('GitHub 更新资料过大'); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Only discover public release metadata here. Package download, installation,
// profile transactions and cancellation remain the native plugin manager's job.
export function createUpdates({ currentVersion = RUNNING_VERSION, hostVersion = splitReleaseVersion(currentVersion).host, getManager, getOmdVersion = () => null,
  isRunning = () => false, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  if (!supportsHostVersion(hostVersion)) throw fail('当前 DSH 尚未在兼容范围内验证');
  const shutdown = new AbortController();
  let pair = null, checkedAt = null, checkError = '', checking = null, job = null, closed = false;
  let currentOmdVersion = getOmdVersion(), state = { phase: 'idle', target: null, targetVersion: null, error: '', installed: [] };
  const request = url => fetchImpl(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'OhMyAgentsAboveAll-Updates' },
    signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(10000)]), redirect: 'follow',
  });
  const read = async (url, limit = 1024 * 1024) => JSON.parse(await boundedText(await request(url), limit));
  const readText = async (url, limit = 65536) => boundedText(await request(url), limit);
  async function readPackage(release, product, version) {
    if (splitReleaseVersion(version, product).host !== hostVersion) throw fail('发行附件与当前宿主不匹配');
    const filename = `${PACKAGE[product]}-${version}.tgz`;
    const url = asset(release, filename);
    const metadata = await read(asset(release, `${filename}.metadata.json`), 65536);
    asset(release, `${filename}.sha256`);
    if (metadata.name !== PACKAGE[product] || metadata.version !== version || metadata.hostVersion !== hostVersion || metadata.filename !== filename || !/^[a-f0-9]{64}$/.test(metadata.sha256)) throw fail('发行附件元数据与目标包不一致');
    const baselines = validationHosts.find(row => row.version === hostVersion)?.omdBaselines ?? [];
    if (product === 'omd' && (!baselines.some(row => metadata.baseVersion === row.version && metadata.sourceCommit === row.commit) || metadata.nativeHostFactories !== 'preserved' || !/^[a-f0-9]{64}$/.test(metadata.overlaySha256))) throw fail('兼容 OMD 来源尚未受支持，请先审阅新的官方基线');
    return { version, url, sha256: metadata.sha256, filename };
  }
  async function currentOfficialOmd() {
    const baseline = alignedVersion(hostVersion, 'omd', OMD_BRIDGE.featureVersion);
    let version = baseline, release;
    if (OMD_BRIDGE.updatePolicy === 'patch') {
      const reviewed = [OMD_BRIDGE.featureVersion, ...(OMD_BRIDGE.reviewedFeatures?.[hostVersion] ?? [])]
        .map(feature => splitReleaseVersion(alignedVersion(hostVersion, 'omd', feature), 'omd').feature);
      // Release order is not version order. Finish a bounded scan before
      // reporting the newest patch from explicitly reviewed feature series.
      for (let page = 1; page <= 5; page++) {
        const rows = await read(`https://api.github.com/repos/${OMD_REPO}/releases?per_page=30&page=${page}`);
        if (!Array.isArray(rows) || rows.length > 30) throw fail('官方 OMD 发行列表无效');
        for (const row of rows) {
          if (row.draft !== false || !row.published_at) continue;
          let candidate;
          try { candidate = splitReleaseVersion(row.tag_name?.replace(/^v/, ''), 'omd'); } catch { continue; }
          if (candidate.host !== hostVersion || !reviewed.some(minimum => candidate.feature[0] === minimum[0]
            && candidate.feature[1] === minimum[1] && candidate.feature[2] >= minimum[2])) continue;
          const next = row.tag_name.replace(/^v/, '');
          if (!release || compare(next, version, 'omd') > 0) { version = next; release = row; }
        }
        if (rows.length < 30) break;
        if (page === 5) throw fail('官方 OMD 发行列表过长，尚未确认最新兼容版本');
      }
      if (!release) throw fail('尚未找到已发布且匹配当前宿主的官方 OMD 补丁');
    } else {
      release = await read(`https://api.github.com/repos/${OMD_REPO}/releases/tags/v${version}`);
    }
    const tag = `v${version}`;
    if (release.draft !== false || !release.published_at || release.tag_name !== tag
      || release.html_url !== `https://github.com/${OMD_REPO}/releases/tag/${tag}` || !Array.isArray(release.assets)) throw fail('官方 OMD 发行来源或 tag 无效');
    const filename = `${PACKAGE.omd}-${version}.tgz`, url = asset(release, filename, OMD_REPO);
    const metadata = await read(asset(release, 'metadata.json', OMD_REPO), 65536);
    const sumsUrl = asset(release, 'SHA256SUMS', OMD_REPO);
    if (metadata.schema !== 1 || metadata.name !== PACKAGE.omd || metadata.version !== version || metadata.hostVersion !== hostVersion
      || metadata.file !== filename || !/^[a-f0-9]{64}$/.test(metadata.sha256) || !/^[a-f0-9]{40}$/.test(metadata.sourceCommit)) throw fail('官方 OMD 元数据与目标包不一致');
    const sums = await readText(sumsUrl);
    const matches = sums.split(/\r?\n/).filter(line => line === `${metadata.sha256}  ${filename}`);
    if (matches.length !== 1) throw fail('官方 OMD checksum 与元数据不一致');
    let object = (await read(`https://api.github.com/repos/${OMD_REPO}/git/ref/tags/${tag}`)).object;
    const seen = new Set();
    while (object?.type === 'tag') {
      if (!/^[a-f0-9]{40}$/.test(object.sha) || seen.has(object.sha) || seen.size >= 8) throw fail('官方 OMD tag 链无效');
      seen.add(object.sha);
      object = (await read(`https://api.github.com/repos/${OMD_REPO}/git/tags/${object.sha}`)).object;
    }
    if (object?.type !== 'commit' || object.sha !== metadata.sourceCommit) throw fail('官方 OMD tag 与来源提交不一致');
    return { version, url, sha256: metadata.sha256, filename, checksumsUrl: sumsUrl, releaseNotesUrl: release.html_url };
  }
  async function inventory() {
    const manager = getManager?.();
    if (!manager) throw fail('原生插件管理尚未加载，请稍后重试');
    const bundles = await manager.listBundles();
    const omaa = bundles.find(row => row.name === PACKAGE.omaa), omd = bundles.find(row => row.name === PACKAGE.omd && row.installed);
    if (!currentOmdVersion && omd?.version) currentOmdVersion = getOmdVersion() ?? omd.version;
    if (currentOmdVersion && splitReleaseVersion(currentOmdVersion, 'omd').host !== hostVersion) throw fail('当前 OMD 与 DSH 宿主不匹配，请通过原安装方式修复');
    return { manager, omaa, omd };
  }
  const newer = (left, right, product) => { try { return compare(left, right, product) > 0; } catch { return false; } };
  const snapshot = () => ({ ...state, installed: [...state.installed], currentVersion, hostVersion,
    currentOmdVersion, latestVersion: pair?.omaa.version ?? null, latestOmdVersion: pair?.omd?.version ?? null,
    releaseTag: pair?.tag ?? null, releaseNotesUrl: pair?.url ?? RELEASES_URL, checkedAt,
    error: state.error || checkError, checking: Boolean(checking), stale: Boolean(checkError && checkedAt),
    updateAvailable: Boolean(pair && newer(pair.omaa.version, currentVersion, 'omaa')),
    omdUpdateAvailable: Boolean(pair?.omd && currentOmdVersion && newer(pair.omd.version, currentOmdVersion, 'omd')),
  });
  async function check(force = false) {
    if (checking) return checking;
    if (closed) throw fail('更新服务已停止，请重启 DSH');
    if (!force && checkedAt !== null && now() - checkedAt < 5 * 60 * 1000) return snapshot();
    checking = (async () => {
      try {
        const { omd } = await inventory();
        const rows = await read(`${API}/releases?per_page=30`);
        if (!Array.isArray(rows) || rows.length > 30) throw fail('GitHub 发行列表无效');
        const eligible = rows.filter(row => {
          try { published(row); return true; } catch { return false; }
        }).sort((a, b) => compareFeatures(a.tag_name.slice(1), b.tag_name.slice(1)));
        // A main tag may use alpha while carrying the rc.2 artifact. Preserve
        // that shared OMAA suffix and choose only the current host's package.
        const release = eligible.findLast(row => {
          const feature = published(row) && splitReleaseVersion(row.tag_name.slice(1)).feature.join('.');
          const filename = `${PACKAGE.omaa}-${alignedVersion(hostVersion, 'omaa', feature)}.tgz`;
          return row.assets.some(item => item.name === filename && item.state === 'uploaded');
        });
        if (!release) throw fail('尚未找到已发布且受支持的 OMAA 发行');
        const feature = splitReleaseVersion(published(release)).feature.join('.');
        const omaa = await readPackage(release, 'omaa', alignedVersion(hostVersion, 'omaa', feature));
        const omdNames = release.assets.map(row => row.name).filter(name => {
          if (!name.startsWith(`${PACKAGE.omd}-`) || !name.endsWith('.tgz')) return false;
          try { return splitReleaseVersion(name.slice(PACKAGE.omd.length + 1, -4), 'omd').host === hostVersion; } catch { return false; }
        });
        const official = omd && OMD_BRIDGE?.officialHosts?.includes(hostVersion) && OMD_BRIDGE?.featureVersion;
        if (!official && omdNames.length > 1) throw fail('发行有多份兼容 OMD，无法确认配对版本');
        if (omd && !official && omdNames.length !== 1) throw fail('最新发行缺少当前宿主的配对兼容 OMD');
        const compat = official ? await currentOfficialOmd() : omdNames.length ? await readPackage(release, 'omd', omdNames[0].slice(PACKAGE.omd.length + 1, -4)) : null;
        pair = { omaa, omd: compat, tag: release.tag_name, url: release.html_url };
        checkedAt = now(); checkError = '';
      } catch (error) { checkError = error.message; }
      return snapshot();
    })().finally(() => { checking = null; });
    return checking;
  }
  async function status() {
    const view = snapshot();
    try {
      const { omaa, omd } = await inventory();
      let reason = '';
      if (!omaa?.installed || omaa.readOnlyReason) reason = '此 OMAA 安装由宿主管理，请通过原安装方式更新';
      else if (omaa.version !== currentVersion || (omd && omd.version !== currentOmdVersion)) reason = '安装版本已改变，请先重启当前 DSH';
      else if (omd?.readOnlyReason) reason = '当前 OMD 由宿主管理，请通过原安装方式更新';
      else if (pair && compare(currentVersion, pair.omaa.version, 'omaa') > 0) reason = '当前 OMAA 高于已发布的配对版本，请确认对应兼容发行';
      else if (omd && pair?.omd && compare(omd.version, pair.omd.version, 'omd') > 0) reason = '当前 OMD 高于已发布的配对版本，请确认对应兼容发行';
      else if (isRunning()) reason = '有任务正在运行，请先结束任务再更新';
      else if (job) reason = '更新正在进行，请稍候';
      else if (closed) reason = '更新服务已停止，请重启 DSH';
      return { ...snapshot(), available: !reason && !checkError && checkedAt !== null, blockedReason: reason,
        omdInstalled: Boolean(omd), restartRequired: Boolean(state.installed.length || (omaa?.version && omaa.version !== currentVersion) || (omd?.version && currentOmdVersion && omd.version !== currentOmdVersion)),
      };
    } catch (error) { return { ...view, available: false, blockedReason: error.message }; }
  }
  async function installOne(product, candidate, previous, manager) {
    if (closed || isRunning()) throw fail('更新已停止或有任务正在运行');
    const requestId = randomUUID();
    state = { ...state, phase: 'installing', requestId, installing: product };
    const result = await manager.installBundle(candidate.url, { enabled: previous.enabled, requestId });
    if (!['applied', 'restart-required'].includes(result.application) || result.bundle !== PACKAGE[product]) throw fail(result.pendingBuilds?.length ? '安装脚本需要授权，请在原生插件页面处理' : result.packageResult?.output?.slice(-1000) || result.error?.message || '原生插件安装未成功');
    const installed = (await manager.listBundles()).find(row => row.name === PACKAGE[product]);
    if (!installed?.installed || installed.version !== candidate.version) throw fail('原生安装结果与目标版本不一致，请到插件页面检查');
    state = { ...state, installed: [...state.installed, { product, version: installed.version }], requestId: null };
  }
  function start(target, version) {
    if (!['omaa', 'omd'].includes(target)) throw fail('更新目标无效');
    splitReleaseVersion(version, target);
    if (closed || job) throw fail('更新已停止或正在进行');
    state = { phase: 'checking', target, targetVersion: version, error: '', installed: [] };
    job = (async () => {
      await check(true);
      if (checkError || !pair) throw fail(checkError || '无法确认已发布的配对发行');
      const selected = pair;
      const wanted = selected[target];
      const current = target === 'omaa' ? currentVersion : currentOmdVersion;
      if (!wanted || !current || wanted.version !== version || compare(wanted.version, current, target) <= 0) throw fail('目标发行已改变，请重新检查更新');
      const { manager, omaa, omd } = await inventory();
      if (!omaa?.installed || omaa.readOnlyReason || omaa.version !== currentVersion || (omd && (omd.readOnlyReason || omd.version !== currentOmdVersion))) throw fail('安装状态已改变，请先重启或检查原生插件页面');
      if (compare(currentVersion, selected.omaa.version, 'omaa') > 0) throw fail('当前 OMAA 高于配对附件，请先确认对应兼容发行；不会降级或混装');
      if (omd && selected.omd && compare(selected.omd.version, omd.version, 'omd') < 0) throw fail('当前 OMD 高于配对附件，请先确认对应兼容发行；不会降级或混装');
      if (isRunning()) throw fail('有任务正在运行，请先结束任务再更新');
      // The explicit action updates one published pair. Each package uses the
      // native transaction; a partial success remains visible and needs restart.
      if (omd && selected.omd && compare(selected.omd.version, omd.version, 'omd') > 0) await installOne('omd', selected.omd, omd, manager);
      if (compare(selected.omaa.version, currentVersion, 'omaa') > 0) await installOne('omaa', selected.omaa, omaa, manager);
      state = { ...state, phase: 'restart-required', requestId: null };
    })().catch(error => { state = { ...state, phase: 'failed', error: error.message, requestId: null }; }).finally(() => { job = null; });
    return job;
  }
  function omdVersionSnapshot() {
    const view = snapshot(), update = view.omdUpdateAvailable;
    return { currentVersion: currentOmdVersion, hostVersion, latestVersion: pair?.omd?.version ?? null,
      status: checkError || !pair?.omd || !currentOmdVersion ? 'unknown' : update ? 'update' : compare(currentOmdVersion, pair.omd.version, 'omd') > 0 ? 'ahead' : 'current',
      severity: update ? 'normal' : 'none', checkedAt, stale: view.stale, error: checkError || null,
      releaseNotesUrl: pair?.omd?.releaseNotesUrl ?? pair?.url ?? RELEASES_URL, currentRelease: null,
      releases: update ? [{ version: pair.omd.version, title: 'OMAA 配对兼容更新', notes: [
        `与 OMAA ${pair.omaa.version} 配对；保留当前 DSH ${hostVersion}。`,
        '更新同时安装此配对中需要更新的 OMD／OMAA，完成后重启当前 DSH。',
      ] }] : [],
    };
  }
  const omdUpdateSnapshot = () => ({ ...state, targetVersion: state.installed.find(row => row.product === 'omd')?.version ?? pair?.omd?.version ?? currentOmdVersion });
  return { check, status, snapshot, start,
    progress({ requestId, phase }) { if (job && requestId === state.requestId && ['installing', 'applying'].includes(phase)) state = { ...state, phase }; },
    omdVersionSnapshot, async omdVersionCheck(force) { await check(force); return omdVersionSnapshot(); }, omdUpdateSnapshot,
    async omdUpdateStatus() { const view = await status(); return { ...omdUpdateSnapshot(), available: view.available && view.omdUpdateAvailable, blockedReason: view.blockedReason || view.error, installed: view.installed }; },
    close() { closed = true; shutdown.abort(); if (state.requestId) void getManager?.()?.cancelInstall(state.requestId).catch(() => {}); },
  };
}
