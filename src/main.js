const { app, BrowserWindow, ipcMain, shell, dialog, utilityProcess } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Readable } = require('stream');

// msmc ships with node-fetch, which hits "Premature close" errors inside
// Electron. Swap the cached node-fetch module for the native fetch before
// msmc is loaded, so all of its HTTP calls go through undici instead.
const nodeFetchPath = require.resolve('node-fetch');
const nativeFetch = (...args) => globalThis.fetch(...args);
nativeFetch.default = nativeFetch;
require.cache[nodeFetchPath] = {
  id: nodeFetchPath,
  filename: nodeFetchPath,
  loaded: true,
  exports: nativeFetch
};

const { Auth } = require('msmc');
const { fabric, forge, quilt } = require('tomate-loaders');
const AdmZip = require('adm-zip');

// Rebrand migration (Feather -> Orbital): reuse the existing game folder and
// launcher data so nothing re-downloads and the user stays signed in.
const OLD_GAME_ROOT = path.join(app.getPath('appData'), '.featherlauncher');
const GAME_ROOT = path.join(app.getPath('appData'), '.orbitallauncher');
try {
  if (fs.existsSync(OLD_GAME_ROOT) && !fs.existsSync(GAME_ROOT)) {
    fs.renameSync(OLD_GAME_ROOT, GAME_ROOT);
  }
} catch (err) {
  console.warn('[migrate] could not rename game folder:', err.message);
}
try {
  const ud = app.getPath('userData');
  if (!fs.existsSync(path.join(ud, 'profiles.json'))) {
    for (const oldName of ['Feather Launcher', 'feather-launcher']) {
      const old = path.join(app.getPath('appData'), oldName);
      if (!fs.existsSync(old)) continue;
      fs.mkdirSync(ud, { recursive: true });
      for (const f of ['settings.json', 'auth.json', 'profiles.json', 'modmeta.json']) {
        if (!fs.existsSync(path.join(ud, f)) && fs.existsSync(path.join(old, f))) {
          fs.copyFileSync(path.join(old, f), path.join(ud, f));
        }
      }
      break;
    }
  }
} catch (err) {
  console.warn('[migrate] could not copy launcher data:', err.message);
}

const MODRINTH = 'https://api.modrinth.com/v2';
const MODRINTH_UA = 'orbital-launcher/1.0.0 (local desktop app)';
// Community proxy of the official CurseForge API (keyless). Forge profiles
// browse CurseForge, where the Forge mod ecosystem lives.
const CF = 'https://api.curse.tools/v1/cf';
const CF_TYPE = { 1: 'release', 2: 'beta', 3: 'alpha' };

let win = null;
let token = null; // active msmc Minecraft token
let gameRunning = false;

// Last-resort logging: anything that slips every handler still lands in the
// log file instead of silently killing the process.
process.on('uncaughtException', (err) => console.error('[main] uncaught:', err));
process.on('unhandledRejection', (err) => console.error('[main] unhandled rejection:', err));

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const authFile = () => path.join(app.getPath('userData'), 'auth.json');
const profilesFile = () => path.join(app.getPath('userData'), 'profiles.json');
const profileModsDir = (id) => path.join(GAME_ROOT, 'profiles', id, 'mods');
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- helpers ----------

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function profileOf(mcToken) {
  return { name: mcToken.profile.name, uuid: mcToken.profile.id };
}

// Network failures surface as cryptic fetch/undici errors ("fetch failed",
// ENOTFOUND...). Translate them into something a person can act on; the raw
// error still goes to the log.
function isNetworkError(err) {
  const m = String((err && err.cause && err.cause.message) || (err && err.message) || err);
  return /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR|fetch failed|network/i.test(m);
}

function serviceName(url) {
  try {
    const h = new URL(url).hostname;
    if (h.includes('modrinth')) return 'Modrinth';
    if (h.includes('curse') || h.includes('forgecdn')) return 'CurseForge';
    if (h.includes('mojang') || h.includes('minecraftservices') || h.includes('minecraft.net')) return 'Mojang';
    if (h.includes('adoptium')) return 'the Java download service';
    if (h.includes('bangbang93')) return 'the OptiFine mirror';
    if (h.includes('fabricmc')) return 'Fabric';
    if (h.includes('minecraftforge')) return 'Forge';
    return h;
  } catch {
    return 'the server';
  }
}

async function fetchJson(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...opts,
      headers: { 'User-Agent': MODRINTH_UA, ...(opts.headers || {}) }
    });
  } catch (err) {
    console.warn('[net]', url, String((err && err.message) || err));
    if (isNetworkError(err)) throw new Error(`Can't reach ${serviceName(url)} — check your internet connection and try again.`);
    throw err;
  }
  if (!res.ok) {
    console.warn('[net]', res.status, url);
    throw new Error(`${serviceName(url)} returned an error (HTTP ${res.status}). Try again in a moment.`);
  }
  return res.json();
}

async function downloadFile(url, dest, onProgress) {
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': MODRINTH_UA } });
  } catch (err) {
    console.warn('[net]', url, String((err && err.message) || err));
    if (isNetworkError(err)) throw new Error(`Download failed — can't reach ${serviceName(url)}. Check your internet connection.`);
    throw err;
  }
  if (!res.ok) throw new Error(`Download from ${serviceName(url)} failed (HTTP ${res.status}). Try again in a moment.`);
  const total = Number(res.headers.get('content-length')) || 0;
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  // Write to a temp name and rename on success — an interrupted download must
  // never leave a half-written file that later passes "already installed"
  // existence checks.
  const tmp = `${dest}.part`;
  try {
    await new Promise((resolve, reject) => {
      const rs = Readable.fromWeb(res.body);
      const ws = fs.createWriteStream(tmp);
      let done = 0;
      if (onProgress && total) {
        rs.on('data', (c) => {
          done += c.length;
          onProgress(done / total);
        });
      }
      rs.on('error', reject);
      ws.on('error', reject);
      ws.on('finish', resolve);
      rs.pipe(ws);
    });
    await fsp.rename(tmp, dest);
  } catch (err) {
    await fsp.unlink(tmp).catch(() => {});
    throw err;
  }
}

// ---------- Java runtime (auto-downloaded from Adoptium) ----------

// The version manifest is cached in memory and on disk (30 min TTL). When the
// network is down an expired disk copy is still used, so version lists and
// profile creation keep working offline.
const manifestCacheFile = () => path.join(app.getPath('userData'), 'manifest-cache.json');
const MANIFEST_TTL = 30 * 60 * 1000;

let versionManifestCache = null;
async function getVersionManifest() {
  if (versionManifestCache) return versionManifestCache;
  const disk = readJson(manifestCacheFile(), null);
  if (disk && disk.data && Date.now() - disk.at < MANIFEST_TTL) {
    versionManifestCache = disk.data;
    return versionManifestCache;
  }
  try {
    versionManifestCache = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
    writeJson(manifestCacheFile(), { at: Date.now(), data: versionManifestCache });
  } catch (err) {
    if (disk && disk.data) {
      console.warn('[manifest] fetch failed, using stale disk cache:', err.message);
      versionManifestCache = disk.data;
    } else {
      throw err;
    }
  }
  return versionManifestCache;
}

// Mojang's per-version metadata declares the exact Java major it needs.
// A version's requirement never changes, so resolved answers are cached
// forever — repeat launches skip the metadata round-trip entirely.
const javaMajorCacheFile = () => path.join(app.getPath('userData'), 'java-major-cache.json');

async function javaMajorFor(mcVersion) {
  const cached = readJson(javaMajorCacheFile(), {})[mcVersion];
  if (cached) return cached;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const manifest = await getVersionManifest();
      const entry = manifest.versions.find((v) => v.id === mcVersion);
      if (!entry) break; // unknown id — use heuristic
      const meta = await fetchJson(entry.url);
      if (meta.javaVersion && meta.javaVersion.majorVersion) {
        const major = adoptiumMajor(meta.javaVersion.majorVersion);
        const cache = readJson(javaMajorCacheFile(), {});
        cache[mcVersion] = major;
        writeJson(javaMajorCacheFile(), cache);
        return major;
      }
      break;
    } catch (err) {
      versionManifestCache = null; // may be a stale/partial response
      console.warn(`[java] metadata fetch failed (attempt ${attempt + 1}):`, err.message);
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  // Fallback heuristic. Legacy "1.x" ids: modern from 1.17 up. Anything on
  // the newer "YY.x" scheme (26.2, ...) is always a current Java.
  const parts = mcVersion.split('.');
  if (parts[0] === '1') {
    const minor = parseInt(parts[1], 10) || 0;
    return minor >= 17 ? 21 : 8;
  }
  return 25;
}

// Adoptium only ships LTS builds — round the requirement up to one.
function adoptiumMajor(required) {
  for (const lts of [8, 11, 17, 21, 25]) {
    if (required <= lts) return lts;
  }
  return required;
}

function findJavaw(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir)) {
    const candidate = path.join(dir, entry, 'bin', 'javaw.exe');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function ensureJava(mcVersion) {
  const major = await javaMajorFor(mcVersion);
  const runtimeDir = path.join(GAME_ROOT, 'runtime', `java${major}`);
  const existing = findJavaw(runtimeDir);
  if (existing) return existing;

  send('launch:status', { stage: 'java', percent: 0, message: `Downloading Java ${major}...` });
  const api = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?os=windows&architecture=x64&image_type=jre&vendor=eclipse`;
  const assets = await fetchJson(api);
  if (!Array.isArray(assets) || !assets.length) throw new Error(`No Java ${major} build found`);
  const link = assets[0].binary.package.link;

  const zipPath = path.join(GAME_ROOT, 'runtime', `java${major}.zip`);
  await downloadFile(link, zipPath, (p) =>
    send('launch:status', { stage: 'java', percent: Math.round(p * 100), message: `Downloading Java ${major}... ${Math.round(p * 100)}%` })
  );
  send('launch:status', { stage: 'java', percent: 100, message: `Extracting Java ${major}...` });
  // async extraction — the sync variant blocks the whole UI for seconds
  await new Promise((resolve, reject) =>
    new AdmZip(zipPath).extractAllToAsync(runtimeDir, true, false, (err) => (err ? reject(err) : resolve()))
  );
  await fsp.unlink(zipPath).catch(() => {});

  const javaw = findJavaw(runtimeDir);
  if (!javaw) throw new Error('Java extraction failed');
  return javaw;
}

// ---------- window ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 680,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0b0e14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
  win.webContents.on('console-message', (e, level, message, line, sourceId) => {
    // Electron changed this event's shape; support both old and new forms.
    if (e && e.message !== undefined) {
      console.log(`[renderer:${e.level}] ${e.message} (${path.basename(e.sourceId || '')}:${e.lineNumber})`);
    } else {
      console.log(`[renderer:${level}] ${message} (${path.basename(sourceId || '')}:${line})`);
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});
app.on('window-all-closed', () => app.quit());

// ---------- auto-update (GitHub releases via electron-updater) ----------

let updateState = 'idle'; // idle | checking | available | downloading | ready | none | error

function setupAutoUpdater() {
  let autoUpdater = null;
  // The updater only functions in the installed (packaged) app; in dev the
  // handlers still exist but report "dev mode" so the UI never hangs.
  if (app.isPackaged) {
    try {
      ({ autoUpdater } = require('electron-updater'));
      autoUpdater.autoDownload = false;
      autoUpdater.allowPrerelease = true;
      autoUpdater.autoInstallOnAppQuit = true;

      autoUpdater.on('update-available', (info) => {
        updateState = 'available';
        send('update:available', { version: info.version });
      });
      autoUpdater.on('update-not-available', () => { updateState = 'none'; send('update:none', {}); });
      autoUpdater.on('download-progress', (p) => send('update:progress', { percent: Math.round(p.percent) }));
      autoUpdater.on('update-downloaded', () => { updateState = 'ready'; send('update:ready', {}); });
      autoUpdater.on('error', (err) => {
        updateState = 'error';
        console.log('[updater]', err && err.message);
        send('update:error', { message: String(err && err.message || err) });
      });

      setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000);
    } catch (e) {
      console.log('[updater] init failed:', e.message);
    }
  }

  ipcMain.handle('update:check', async () => {
    if (!autoUpdater) return { dev: true };
    try { await autoUpdater.checkForUpdates(); return { ok: true }; }
    catch (e) { return { error: String(e.message || e) }; }
  });
  ipcMain.handle('update:download', async () => { if (autoUpdater) autoUpdater.downloadUpdate(); return true; });
  ipcMain.handle('update:install', () => { if (autoUpdater) autoUpdater.quitAndInstall(); });
}

// window controls act on whichever window sent them (main or logs window)
ipcMain.on('win:minimize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.minimize();
});
ipcMain.on('win:maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) (w.isMaximized() ? w.unmaximize() : w.maximize());
});
ipcMain.on('win:close', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.close();
});

// ---------- game log window (Feather-style live logs + system stats) ----------

let logWin = null;

function openLogWindow() {
  if (logWin && !logWin.isDestroyed()) {
    logWin.show();
    logWin.focus();
    return;
  }
  logWin = new BrowserWindow({
    width: 780,
    height: 520,
    minWidth: 520,
    minHeight: 320,
    frame: false,
    backgroundColor: '#0b0e14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  logWin.loadFile(path.join(__dirname, 'renderer', 'logs.html'));
  logWin.setMenuBarVisibility(false);
  logWin.on('closed', () => {
    logWin = null;
    stopStats();
  });
  startStats();
}

function sendLogLine(line) {
  if (logWin && !logWin.isDestroyed()) logWin.webContents.send('game:log', line);
}
function resetLogWindow() {
  if (logWin && !logWin.isDestroyed()) logWin.webContents.send('game:log-reset');
}
function setLogState(state, code) {
  if (logWin && !logWin.isDestroyed()) logWin.webContents.send('game:state', { state, code });
}

// System CPU% is computed from os.cpus() deltas — no child processes, no deps.
let statsTimer = null;
let lastCpuTimes = null;

function cpuPercent() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    for (const k in c.times) total += c.times[k];
    idle += c.times.idle;
  }
  let pct = 0;
  if (lastCpuTimes) {
    const dTotal = total - lastCpuTimes.total;
    const dIdle = idle - lastCpuTimes.idle;
    pct = dTotal > 0 ? Math.round((1 - dIdle / dTotal) * 100) : 0;
  }
  lastCpuTimes = { idle, total };
  return pct;
}

function startStats() {
  if (statsTimer) return;
  lastCpuTimes = null;
  cpuPercent(); // prime the delta
  statsTimer = setInterval(() => {
    if (!logWin || logWin.isDestroyed()) return stopStats();
    logWin.webContents.send('game:stats', {
      cpu: cpuPercent(),
      memUsed: os.totalmem() - os.freemem(),
      memTotal: os.totalmem()
    });
  }, 2000);
}
function stopStats() {
  if (statsTimer) {
    clearInterval(statsTimer);
    statsTimer = null;
  }
}

ipcMain.on('logs:open', () => openLogWindow());

// ---------- auth ----------

async function getMinecraftWithRetry(xbox) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const mc = await xbox.getMinecraft();
      // A successful call can still hand back an incomplete profile (empty
      // name/id) when Mojang's profile service hiccups — that's what causes
      // the "default skin, no name" account chip. Treat it as retry-worthy.
      if (mc && mc.profile && mc.profile.name && mc.profile.id) return mc;
      lastErr = new Error('Incomplete Minecraft profile');
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw lastErr;
}

ipcMain.handle('auth:login', async () => {
  const authManager = new Auth('select_account');
  try {
    const xbox = await authManager.launch('electron');
    token = await getMinecraftWithRetry(xbox);
    writeJson(authFile(), { refresh: xbox.save() });
    return profileOf(token);
  } catch (err) {
    const msg = String(err && (err.message || err));
    if (msg.includes('closed') || msg.includes('cancelled')) return null; // user closed the popup
    throw new Error(friendlyAuthError(msg));
  }
});

function friendlyAuthError(msg) {
  if (msg.includes('minecraft.profile') || msg.includes('does not own'))
    return 'This Microsoft account does not own Minecraft: Java Edition.';
  return 'Sign-in failed: ' + msg;
}

ipcMain.handle('auth:restore', async () => {
  const saved = readJson(authFile(), null);
  if (!saved || !saved.refresh) return null;
  try {
    const authManager = new Auth('select_account');
    const xbox = await authManager.refresh(saved.refresh);
    token = await getMinecraftWithRetry(xbox);
    writeJson(authFile(), { refresh: xbox.save() });
    return profileOf(token);
  } catch {
    return null; // silent — user just signs in again
  }
});

ipcMain.handle('auth:logout', async () => {
  token = null;
  await fsp.unlink(authFile()).catch(() => {});
  return true;
});

// ---------- skins (Mojang profile API, bearer = Minecraft access token) ----------

const MC_API = 'https://api.minecraftservices.com/minecraft/profile';

function mcAuthHeaders() {
  if (!token) throw new Error('Not signed in');
  return { Authorization: `Bearer ${token.mcToken}` };
}

function mcErr(action, status) {
  if (status === 429) return `${action} failed — Mojang is rate-limiting skin changes. Wait a minute and try again.`;
  if (status === 401) return `${action} failed — your session expired. Sign out and back in.`;
  return `${action} failed (${status})`;
}

// Cached so variant switches and "save current" don't re-hit Mojang every
// time (their skin endpoints are aggressively rate-limited).
let skinCache = null; // { name, uuid, skinUrl, variant, skinData }

async function fetchSkinProfile() {
  const res = await fetch(MC_API, { headers: mcAuthHeaders() });
  if (!res.ok) throw new Error(mcErr('Profile fetch', res.status));
  const data = await res.json();
  const active = (data.skins || []).find((s) => s.state === 'ACTIVE') || (data.skins || [])[0];
  return { name: data.name, uuid: data.id, skinUrl: active ? active.url : null, variant: active ? active.variant.toLowerCase() : 'classic' };
}

ipcMain.handle('skin:get', async () => {
  const profile = await fetchSkinProfile();
  let dataUrl = null;
  if (profile.skinUrl) {
    // textures.minecraft.net has no CORS headers; fetch here and hand the
    // renderer a data: URL so the 3D canvas isn't tainted.
    const res = await fetch(profile.skinUrl);
    if (res.ok) dataUrl = `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  }
  skinCache = { ...profile, skinData: dataUrl };
  return skinCache;
});

ipcMain.handle('skin:pickFile', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose a Minecraft skin',
    filters: [{ name: 'Skin PNG', extensions: ['png'] }],
    properties: ['openFile']
  });
  return result.canceled ? null : result.filePaths[0];
});

async function uploadSkinBuffer(buf, variant) {
  if (buf.length > 24576) throw new Error('Skin file too large — must be a 64x64 (or 64x32) PNG');
  const form = new FormData();
  form.append('variant', variant === 'slim' ? 'slim' : 'classic');
  form.append('file', new Blob([buf], { type: 'image/png' }), 'skin.png');
  const res = await fetch(`${MC_API}/skins`, { method: 'POST', headers: mcAuthHeaders(), body: form });
  if (!res.ok) throw new Error(mcErr('Skin upload', res.status));
  // Refresh the cache from the bytes we just uploaded, no extra API call.
  skinCache = {
    ...(skinCache || {}),
    variant,
    skinData: `data:image/png;base64,${buf.toString('base64')}`
  };
}

ipcMain.handle('skin:upload', async (_e, { filePath, variant }) => {
  const buf = await fsp.readFile(filePath);
  await uploadSkinBuffer(buf, variant);
  await addSkinToLib(buf, variant).catch(() => {});
  return true;
});

// ---------- saved skin library (local, userData/skins) ----------

const skinsDir = () => path.join(app.getPath('userData'), 'skins');
const skinsFile = () => path.join(app.getPath('userData'), 'skins.json');

async function addSkinToLib(buf, variant) {
  const hash = crypto.createHash('sha1').update(buf).digest('hex');
  const lib = readJson(skinsFile(), { skins: [] });
  if (lib.skins.some((s) => s.id === hash)) return;
  await fsp.mkdir(skinsDir(), { recursive: true });
  await fsp.writeFile(path.join(skinsDir(), `${hash}.png`), buf);
  lib.skins.push({ id: hash, variant, added: Date.now() });
  writeJson(skinsFile(), lib);
}

ipcMain.handle('skins:list', async () => {
  const lib = readJson(skinsFile(), { skins: [] });
  const out = [];
  for (const s of lib.skins) {
    try {
      const buf = await fsp.readFile(path.join(skinsDir(), `${s.id}.png`));
      out.push({ ...s, dataUrl: `data:image/png;base64,${buf.toString('base64')}` });
    } catch {}
  }
  return out.sort((a, b) => b.added - a.added);
});

ipcMain.handle('skins:saveCurrent', async () => {
  // Prefer the cached skin bytes (no network); only fetch if we somehow
  // don't have them yet.
  if (skinCache && skinCache.skinData) {
    const buf = Buffer.from(skinCache.skinData.split(',')[1], 'base64');
    await addSkinToLib(buf, skinCache.variant);
    return true;
  }
  const profile = await fetchSkinProfile();
  if (!profile.skinUrl) throw new Error('No current skin to save');
  const res = await fetch(profile.skinUrl);
  if (!res.ok) throw new Error('Could not download current skin');
  await addSkinToLib(Buffer.from(await res.arrayBuffer()), profile.variant);
  return true;
});

ipcMain.handle('skins:apply', async (_e, id) => {
  const lib = readJson(skinsFile(), { skins: [] });
  const s = lib.skins.find((x) => x.id === id);
  if (!s) throw new Error('Saved skin not found');
  const buf = await fsp.readFile(path.join(skinsDir(), `${s.id}.png`));
  await uploadSkinBuffer(buf, s.variant);
  return true;
});

ipcMain.handle('skins:delete', async (_e, id) => {
  const lib = readJson(skinsFile(), { skins: [] });
  lib.skins = lib.skins.filter((x) => x.id !== id);
  writeJson(skinsFile(), lib);
  await fsp.unlink(path.join(skinsDir(), `${path.basename(id)}.png`)).catch(() => {});
  return true;
});

ipcMain.handle('skin:setVariant', async (_e, variant) => {
  variant = variant === 'slim' ? 'slim' : 'classic';
  // Use the cached skin URL; only reach out for the profile if we must.
  let skinUrl = skinCache && skinCache.skinUrl;
  if (!skinUrl) {
    const profile = await fetchSkinProfile();
    skinUrl = profile.skinUrl;
  }
  if (!skinUrl) throw new Error('No current skin to change');
  const res = await fetch(`${MC_API}/skins`, {
    method: 'POST',
    headers: { ...mcAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ variant, url: skinUrl })
  });
  if (!res.ok) throw new Error(mcErr('Model change', res.status));
  if (skinCache) skinCache.variant = variant;
  return true;
});

// ---------- versions & launch ----------

ipcMain.handle('mc:versions', async () => {
  const manifest = await getVersionManifest();
  return {
    latest: manifest.latest.release,
    releases: manifest.versions.filter((v) => v.type === 'release').map((v) => v.id)
  };
});

// Curated version list for profile creation (Lunar-style): only the final
// update of each version line, nothing older than 1.7. Each entry says which
// loaders support it: Vanilla + Forge everywhere, Fabric from 1.16 up.
ipcMain.handle('mc:supportedVersions', async () => {
  const manifest = await getVersionManifest();
  const lines = new Map(); // line key -> newest release id (manifest is newest-first)
  for (const v of manifest.versions) {
    if (v.type !== 'release') continue;
    const parts = v.id.split('.');
    const line = v.id.startsWith('1.') ? `1.${parts[1]}` : parts[0];
    if (!lines.has(line)) lines.set(line, v.id);
  }
  const out = [];
  for (const [line, id] of lines) {
    const legacy = line.startsWith('1.');
    const minor = legacy ? parseInt(line.split('.')[1], 10) || 0 : null;
    if (legacy && minor < 7) continue; // 1.7 is the launcher's floor
    const loaders = ['vanilla', 'forge'];
    if (!legacy || minor >= 16) loaders.push('fabric');
    out.push({ id, line, loaders });
  }
  return { latest: manifest.latest.release, versions: out };
});

// Advanced mode: the complete catalog per loader. Vanilla = every release;
// Fabric/Forge = releases each loader's own metadata says it supports.
// Loader support lists change rarely — cached on disk for a day, and the two
// loader lookups run in parallel.
const allVersionsFile = () => path.join(app.getPath('userData'), 'allversions-cache.json');
const ALLVERSIONS_TTL = 24 * 60 * 60 * 1000;

let allVersionsCache = null;

ipcMain.handle('mc:allVersions', async () => {
  if (allVersionsCache) return allVersionsCache;
  const disk = readJson(allVersionsFile(), null);
  if (disk && disk.data && Date.now() - disk.at < ALLVERSIONS_TTL) {
    allVersionsCache = disk.data;
    return allVersionsCache;
  }

  const manifest = await getVersionManifest();
  const releases = manifest.versions.filter((v) => v.type === 'release').map((v) => v.id);

  const [fabricList, forgeList] = await Promise.all([
    fabric.listSupportedVersions() // meta.fabricmc.net
      .then((supported) => {
        const set = new Set(supported.filter((v) => v.stable).map((v) => v.version));
        return releases.filter((id) => set.has(id));
      })
      .catch((e) => {
        console.warn('[versions] fabric list failed:', e.message);
        return (disk && disk.data && disk.data.fabric) || [];
      }),
    forge.listSupportedVersions() // forge maven metadata
      .then((supported) => {
        const set = new Set(supported.map((v) => v.version));
        return releases.filter((id) => set.has(id));
      })
      .catch((e) => {
        console.warn('[versions] forge list failed:', e.message);
        return (disk && disk.data && disk.data.forge) || [];
      })
  ]);

  allVersionsCache = { vanilla: releases, fabric: fabricList, forge: forgeList };
  writeJson(allVersionsFile(), { at: Date.now(), data: allVersionsCache });
  return allVersionsCache;
});

// Modern Forge (1.13+/26.x) needs its installer processors to run once per
// version — they generate the patched Minecraft jar that MLC can't produce
// ("Could not find .forge_patched_minecraft" otherwise). Legacy Forge (<=1.12)
// has no processors and no headless installer; MLC handles it directly.
async function ensureForgeInstalled(version, installerPath, javaPath) {
  const legacy = version.startsWith('1.') && (parseInt(version.split('.')[1], 10) || 0) <= 12;
  if (legacy) return;
  const marker = path.join(GAME_ROOT, `.forge-installed-${version}`);
  if (fs.existsSync(marker)) return;

  send('launch:status', { stage: 'prepare', percent: 0, message: 'Installing Forge (one-time, takes a minute)...' });
  const stub = path.join(GAME_ROOT, 'launcher_profiles.json');
  if (!fs.existsSync(stub)) writeJson(stub, { profiles: {} }); // installer requires it

  const javaExe = javaPath.replace(/javaw\.exe$/i, 'java.exe');
  await new Promise((resolve, reject) => {
    const p = spawn(javaExe, ['-jar', installerPath, '--installClient', GAME_ROOT], { cwd: GAME_ROOT });
    p.stdout.on('data', (d) => console.log('[forge-install]', String(d).trim()));
    p.stderr.on('data', (d) => console.log('[forge-install!]', String(d).trim()));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Forge installer exited with code ${code}`))));
  });
  fs.writeFileSync(marker, 'ok');
  console.log('[forge-install] done for', version);
}

// Recent game/MLC output, kept for crash diagnostics and the Copy Log button.
const GAME_LOG_MAX = 600;
let gameLog = [];
function logGame(line) {
  gameLog.push(line);
  if (gameLog.length > GAME_LOG_MAX) gameLog.splice(0, gameLog.length - GAME_LOG_MAX);
}

// Known crash signatures → plain-English explanations. First match wins;
// ordered so the most specific causes are checked before generic ones.
const CRASH_SIGNATURES = [
  [/Could not reserve enough space|paging file is too small/i,
    "Windows couldn't give Minecraft that much RAM — lower the RAM slider in Settings or close other apps."],
  [/OutOfMemoryError/i,
    'Minecraft ran out of memory. Raise the RAM slider in Settings, or remove memory-hungry mods.'],
  [/DuplicateModsFoundException|Found a duplicate mod|duplicate mods/i,
    "Two copies of the same mod are installed. Open the profile's mod list and remove one."],
  [/Missing or unsupported mandatory dependencies|which is missing|requires .* of (mod|fabric)/i,
    'A mod is missing a dependency (or needs a different version of one). Check the mod list — installing the missing library mod usually fixes it.'],
  [/Incompatible mods? found|does not support Minecraft|Mod .* is not compatible/i,
    "A mod isn't compatible with this Minecraft version. Disable recently added mods and try again."],
  [/Mixin apply failed|MixinApplyError|Mixin transformation .* failed/i,
    'A mod failed to load (Mixin error) — it was probably built for a different Minecraft version. Disable recently added mods.'],
  [/UnsupportedClassVersionError/i,
    'A mod was built for a different Java version — it likely targets a newer Minecraft than this profile.'],
  [/Pixel format not accelerated|GLFW error|Failed to create .*(GL|display)/i,
    'Graphics driver problem — try updating your GPU drivers.'],
  [/trying to load FabricLoaderImpl/i,
    'Fabric failed to start. Try deleting and recreating the profile — if it persists, report this.']
];

function diagnoseCrash() {
  const text = gameLog.join('\n');
  for (const [re, msg] of CRASH_SIGNATURES) {
    if (re.test(text)) return msg;
  }
  return null;
}

ipcMain.handle('diag:gameLog', () => gameLog.join('\n'));

ipcMain.handle('mc:launch', async (_e, { profileId, ram }) => {
  if (!token) throw new Error('Not signed in');
  if (gameRunning) throw new Error('Game is already running');
  gameRunning = true;
  gameLog = [];

  try {
    const data = await ensureProfiles();
    const profile = data.profiles.find((p) => p.id === profileId) || data.profiles[0];
    const version = profile.version;
    const loader = profile.loader;

    send('launch:status', { stage: 'prepare', percent: 0, message: 'Syncing profile mods...' });
    await syncProfileMods(profile);

    const javaPath = await ensureJava(version);
    console.log(`[launch] version=${version} loader=${loader} java=${javaPath}`);

    send('launch:status', { stage: 'prepare', percent: 0, message: 'Preparing game files...' });
    let config;
    if (loader === 'fabric') {
      config = await fabric.getMCLCLaunchConfig({ gameVersion: version, rootPath: GAME_ROOT });
    } else if (loader === 'forge') {
      config = await forge.getMCLCLaunchConfig({ gameVersion: version, rootPath: GAME_ROOT });
      await ensureForgeInstalled(version, config.forge, javaPath);
    } else if (loader === 'quilt') {
      config = await quilt.getMCLCLaunchConfig({ gameVersion: version, rootPath: GAME_ROOT });
    } else {
      config = { root: GAME_ROOT, version: { number: version, type: 'release' } };
    }

    // MLC ignores `arguments.jvm` in custom version JSONs, but modern Fabric
    // profiles need theirs (-DFabricMcEmu=...) or the loader crashes with a
    // "target class loader" error. Pass them through as customArgs.
    let customArgs = [];
    if ((loader === 'fabric' || loader === 'quilt') && config.version && config.version.custom) {
      try {
        const profilePath = path.join(GAME_ROOT, 'versions', config.version.custom, `${config.version.custom}.json`);
        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        const jvmArgs = profile.arguments && profile.arguments.jvm;
        if (Array.isArray(jvmArgs)) customArgs = jvmArgs.filter((a) => typeof a === 'string');
      } catch (err) {
        console.warn('[launch] could not read custom profile jvm args:', err.message);
      }
    }

    const s = currentSettings();
    if (s.javaArgs) customArgs.push(...String(s.javaArgs).split(/\s+/).filter(Boolean));
    const windowOpts = {};
    if (s.fullscreen) windowOpts.fullscreen = true;
    if (!s.fullscreen && Number(s.resW) > 0) windowOpts.width = Number(s.resW);
    if (!s.fullscreen && Number(s.resH) > 0) windowOpts.height = Number(s.resH);

    // The launch itself runs in a utilityProcess (src/launch-worker.js) so
    // MLC's per-launch file verification can never freeze the UI. The
    // modern-Forge classpath fix lives in the worker now.
    if (s.showLogsOnLaunch !== false) openLogWindow();
    resetLogWindow();
    setLogState('launching');

    // Full file verification happens only until a version launches
    // successfully once; after that the marker lets the worker skip
    // re-hashing every asset (official-launcher behavior). A crash before
    // the game even starts removes the marker → next launch re-verifies.
    const verifiedMarker = path.join(GAME_ROOT, `.verified-${(config.version && config.version.custom) || version}`);
    const fastVerify = fs.existsSync(verifiedMarker);

    const worker = utilityProcess.fork(path.join(__dirname, 'launch-worker.js'));
    let started = false;

    worker.on('message', (msg) => {
      if (msg.type === 'debug') {
        console.log('[MLC]', msg.line);
        logGame(`[MLC] ${msg.line}`);
        sendLogLine(`[MLC] ${msg.line}`);
      } else if (msg.type === 'data') {
        const line = String(msg.line).trim();
        if (line) {
          console.log('[game]', line);
          logGame(line);
          sendLogLine(line);
        }
        if (!started) {
          started = true;
          send('launch:status', { stage: 'running', percent: 100, message: 'Game is running' });
          setLogState('running');
          if (s.minimizeOnLaunch && win && !win.isDestroyed()) win.minimize();
          fs.writeFile(verifiedMarker, 'ok', () => {});
        }
      } else if (msg.type === 'progress') {
        // MLC re-verifies every file each launch; existing files are skipped,
        // so after the first launch this phase is a check, not a download.
        const percent = msg.total ? Math.round((msg.task / msg.total) * 100) : 0;
        send('launch:status', { stage: 'download', percent, message: `Checking ${msg.kind}... ${percent}%` });
      } else if (msg.type === 'started') {
        send('launch:status', { stage: 'starting', percent: 100, message: 'Starting Minecraft...' });
      } else if (msg.type === 'error') {
        gameRunning = false;
        console.log('[launch] worker error:', msg.message);
        logGame(`[error] ${msg.message}`);
        sendLogLine(`[error] ${msg.message}`);
        setLogState('crashed');
        send('launch:closed', { code: -1, crashed: true, startedOk: started, diagnosis: msg.message });
      } else if (msg.type === 'close') {
        gameRunning = false;
        console.log('[game] exited with code', msg.code);
        if (s.minimizeOnLaunch && win && !win.isDestroyed() && win.isMinimized()) win.restore();
        const crashed = msg.code !== 0 && msg.code !== null;
        // crash before the game window ever appeared → files may be bad;
        // drop the marker so the next launch does a full verification
        if (crashed && !started) fs.unlink(verifiedMarker, () => {});
        setLogState(crashed ? 'crashed' : 'exited', msg.code);
        send('launch:closed', {
          code: msg.code,
          crashed,
          startedOk: started,
          diagnosis: crashed ? diagnoseCrash() : null
        });
      }
    });
    // safety net: if the worker dies without reporting, unlock the Play button
    worker.on('exit', () => {
      if (gameRunning) {
        gameRunning = false;
        setLogState('exited');
        send('launch:closed', { code: null, crashed: false, startedOk: started, diagnosis: null });
      }
    });

    worker.postMessage({
      opts: {
        ...config,
        authorization: token.mclc(),
        javaPath,
        customArgs,
        memory: { max: `${ram || 4}G`, min: '1G' },
        ...(Object.keys(windowOpts).length ? { window: windowOpts } : {})
      },
      loader,
      forgeInstaller: config.forge || null,
      fastVerify
    });

    return true;
  } catch (err) {
    gameRunning = false;
    throw err;
  }
});

// ---------- profiles ----------

async function ensureProfiles() {
  let data = readJson(profilesFile(), null);
  let dirty = false;

  if (!data || !Array.isArray(data.profiles) || !data.profiles.length) {
    const s = readJson(settingsFile(), {});
    let version = s.lastVersion;
    if (!version) {
      try {
        version = (await getVersionManifest()).latest.release;
      } catch {
        version = '26.2';
      }
    }
    const profile = { id: newId(), name: 'Default', version, loader: s.lastLoader || 'vanilla' };
    data = { profiles: [profile] };
    dirty = true;

    // Migrate any mods installed before profiles existed into the default
    // profile, so nothing the user downloaded disappears.
    const live = path.join(GAME_ROOT, 'mods');
    if (fs.existsSync(live)) {
      const dest = profileModsDir(profile.id);
      await fsp.mkdir(dest, { recursive: true });
      for (const f of await fsp.readdir(live)) {
        if (f.endsWith('.jar')) {
          await fsp.rename(path.join(live, f), path.join(dest, f)).catch(() => {});
        }
      }
    }
  }

  if (!data.premadeSeeded) {
    await seedPremadeProfiles(data);
    data.premadeSeeded = true;
    dirty = true;
  }

  if (dirty) writeJson(profilesFile(), data);
  return data;
}

// Lunar-style starter profiles, created once on first run.
async function seedPremadeProfiles(data) {
  let latest = '26.2';
  try {
    latest = (await getVersionManifest()).latest.release;
  } catch {}

  const premades = [
    { name: 'Latest Release', description: `The newest Minecraft (${latest}) on Fabric`, version: latest, loader: 'fabric' },
    { name: '1.16.5', description: 'The Nether Update on Fabric', version: '1.16.5', loader: 'fabric' },
    { name: '1.12.2', description: 'The modding classic on Forge — OptiFine included', version: '1.12.2', loader: 'forge', optifine: true },
    { name: '1.8.9', description: 'The PvP classic on Forge — OptiFine included', version: '1.8.9', loader: 'forge', optifine: true }
  ];

  for (const pm of premades) {
    if (data.profiles.some((p) => p.name === pm.name)) continue;
    const profile = {
      id: newId(),
      name: pm.name,
      description: pm.description,
      version: pm.version,
      loader: pm.loader,
      premade: true
    };
    data.profiles.push(profile);
    if (pm.optifine) {
      // best-effort, in the background — the profile works without it
      installOptiFine(profile).catch((e) => console.warn('[optifine]', pm.version, e.message));
    }
  }
}

// OptiFine has no official API; BMCLAPI mirrors its builds.
async function installOptiFine(profile) {
  const list = await fetchJson(`https://bmclapi2.bangbang93.com/optifine/${profile.version}`);
  const stable = list.filter((o) => o.filename && !o.filename.startsWith('preview'));
  const pick = (stable.length ? stable : list)[Math.max(0, (stable.length ? stable : list).length - 1)];
  if (!pick) throw new Error('no OptiFine builds found');
  const dest = path.join(profileModsDir(profile.id), pick.filename);
  if (fs.existsSync(dest)) return;
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await downloadFile(`https://bmclapi2.bangbang93.com/optifine/${profile.version}/${pick.type}/${pick.patch}`, dest);
  console.log('[optifine] installed', pick.filename, 'into', profile.name);
}

function saveProfiles(data) {
  writeJson(profilesFile(), data);
}

// The game always loads GAME_ROOT/mods; before each launch it is rebuilt
// from the launching profile's own mods folder.
async function syncProfileMods(profile) {
  const live = path.join(GAME_ROOT, 'mods');
  await fsp.rm(live, { recursive: true, force: true });
  await fsp.mkdir(live, { recursive: true });
  const src = profileModsDir(profile.id);
  if (!fs.existsSync(src)) return;
  for (const f of await fsp.readdir(src)) {
    if (f.endsWith('.jar')) {
      await fsp.copyFile(path.join(src, f), path.join(live, f));
    }
  }
}

ipcMain.handle('profiles:list', async () => {
  const data = await ensureProfiles();
  return { ...data, icons: loadProfileIcons() };
});

ipcMain.handle('profiles:create', async (_e, { name, description, version, loader }) => {
  if (!version) throw new Error('Pick a Minecraft version');
  const data = await ensureProfiles();
  const profile = {
    id: newId(),
    name: (name || '').trim() || `Profile ${data.profiles.length + 1}`,
    description: (description || '').trim(),
    version,
    loader: loader || 'vanilla'
  };
  data.profiles.push(profile);
  saveProfiles(data);
  return profile;
});

ipcMain.handle('profiles:delete', async (_e, id) => {
  const data = await ensureProfiles();
  if (data.profiles.length <= 1) throw new Error('You need at least one profile');
  data.profiles = data.profiles.filter((p) => p.id !== id);
  saveProfiles(data);
  await fsp.rm(path.join(GAME_ROOT, 'profiles', id), { recursive: true, force: true }).catch(() => {});
  await removeIconFiles(id);
  profileIconCache = null;
  return data;
});

// ---------- profile icons ----------
// Optional per-profile image, stored as profile-icons/<id>.<ext> in
// userData. Sent to the renderer as data URLs (cached in memory).

const profileIconsDir = () => path.join(app.getPath('userData'), 'profile-icons');
const ICON_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
let profileIconCache = null; // id -> data url

function loadProfileIcons() {
  if (profileIconCache) return profileIconCache;
  profileIconCache = {};
  try {
    for (const f of fs.readdirSync(profileIconsDir())) {
      const ext = path.extname(f).toLowerCase();
      const mime = ICON_MIME[ext];
      if (!mime) continue;
      const id = path.basename(f, ext);
      profileIconCache[id] = `data:${mime};base64,${fs.readFileSync(path.join(profileIconsDir(), f)).toString('base64')}`;
    }
  } catch {}
  return profileIconCache;
}

async function removeIconFiles(id) {
  try {
    for (const f of await fsp.readdir(profileIconsDir())) {
      if (path.basename(f, path.extname(f)) === id) {
        await fsp.unlink(path.join(profileIconsDir(), f)).catch(() => {});
      }
    }
  } catch {}
}

async function setProfileIcon(id, buf, ext) {
  await fsp.mkdir(profileIconsDir(), { recursive: true });
  await removeIconFiles(id);
  await fsp.writeFile(path.join(profileIconsDir(), `${id}${ext}`), buf);
  profileIconCache = null;
}

function profileIconFile(id) {
  try {
    for (const f of fs.readdirSync(profileIconsDir())) {
      if (path.basename(f, path.extname(f)) === id && ICON_MIME[path.extname(f).toLowerCase()]) {
        return path.join(profileIconsDir(), f);
      }
    }
  } catch {}
  return null;
}

ipcMain.handle('profiles:pickIcon', async (_e, id) => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose a profile image',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const src = result.filePaths[0];
  const stat = await fsp.stat(src);
  if (stat.size > 2 * 1024 * 1024) throw new Error('Image too large — pick one under 2 MB');
  let ext = path.extname(src).toLowerCase();
  if (ext === '.jpeg') ext = '.jpg';
  if (!ICON_MIME[ext]) throw new Error('Pick a PNG, JPG, GIF or WebP image');
  await setProfileIcon(id, await fsp.readFile(src), ext);
  return loadProfileIcons()[id] || null;
});

ipcMain.handle('profiles:removeIcon', async (_e, id) => {
  await removeIconFiles(id);
  profileIconCache = null;
  return true;
});

// ---------- profile import/export ----------
// .orbprofile = a zip holding meta.json (name/description/version/loader)
// plus the profile's mods folder, so a profile can be shared whole.

const PROFILE_EXPORT_FORMAT = 1;

ipcMain.handle('profiles:export', async (_e, id) => {
  const data = await ensureProfiles();
  const profile = data.profiles.find((p) => p.id === id);
  if (!profile) throw new Error('Profile not found');

  const safeName = profile.name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'profile';
  const result = await dialog.showSaveDialog(win, {
    title: 'Export profile',
    defaultPath: `${safeName}.orbprofile`,
    filters: [{ name: 'Orbital profile', extensions: ['orbprofile'] }]
  });
  if (result.canceled || !result.filePath) return null;

  const zip = new AdmZip();
  zip.addFile('meta.json', Buffer.from(JSON.stringify({
    format: PROFILE_EXPORT_FORMAT,
    name: profile.name,
    description: profile.description || '',
    version: profile.version,
    loader: profile.loader
  }, null, 2)));
  const modsDir = profileModsDir(profile.id);
  if (fs.existsSync(modsDir)) {
    for (const f of await fsp.readdir(modsDir)) {
      if (f.endsWith('.jar') || f.endsWith('.jar.disabled')) {
        zip.addLocalFile(path.join(modsDir, f), 'mods');
      }
    }
  }
  const iconPath = profileIconFile(profile.id);
  if (iconPath) {
    zip.addFile(`icon${path.extname(iconPath).toLowerCase()}`, await fsp.readFile(iconPath));
  }
  zip.writeZip(result.filePath);
  return result.filePath;
});

ipcMain.handle('profiles:import', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Import profile',
    filters: [{ name: 'Orbital profile', extensions: ['orbprofile', 'zip'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths[0]) return null;

  let zip, meta;
  try {
    zip = new AdmZip(result.filePaths[0]);
    meta = JSON.parse(zip.readAsText('meta.json'));
  } catch {
    throw new Error("That file isn't a valid Orbital profile export");
  }
  if (!meta || !meta.version || !meta.loader) {
    throw new Error("That file isn't a valid Orbital profile export");
  }

  const data = await ensureProfiles();
  let name = String(meta.name || 'Imported profile').slice(0, 40);
  if (data.profiles.some((p) => p.name === name)) {
    name = `${name.slice(0, 29)} (imported)`;
  }
  const profile = {
    id: newId(),
    name,
    description: String(meta.description || '').slice(0, 140),
    version: String(meta.version),
    loader: ['vanilla', 'fabric', 'forge', 'quilt'].includes(meta.loader) ? meta.loader : 'vanilla'
  };

  const modsDir = profileModsDir(profile.id);
  await fsp.mkdir(modsDir, { recursive: true });
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    // write by basename only — entry names inside a zip are untrusted paths
    const base = path.basename(entry.entryName);
    if (entry.entryName.startsWith('mods/')) {
      if (!base.endsWith('.jar') && !base.endsWith('.jar.disabled')) continue;
      await fsp.writeFile(path.join(modsDir, base), entry.getData());
    } else {
      const m = /^icon(\.(png|jpg|jpeg|gif|webp))$/i.exec(entry.entryName);
      if (m) {
        let ext = m[1].toLowerCase();
        if (ext === '.jpeg') ext = '.jpg';
        await setProfileIcon(profile.id, entry.getData(), ext);
      }
    }
  }

  data.profiles.push(profile);
  saveProfiles(data);
  return profile;
});

// ---------- Modrinth ----------

ipcMain.handle('modrinth:search', async (_e, { query, mcVersion, loader, category, offset }) => {
  if (loader === 'forge') {
    const params = new URLSearchParams({
      gameId: '432',        // Minecraft
      classId: '6',         // Mods
      modLoaderType: '1',   // Forge
      pageSize: '24',
      index: String(offset || 0),
      sortField: '2',       // popularity
      sortOrder: 'desc'
    });
    if (mcVersion) params.set('gameVersion', mcVersion);
    if (query) params.set('searchFilter', query);
    if (category) params.set('categoryId', String(category));
    const data = await fetchJson(`${CF}/mods/search?${params}`);
    return {
      total: (data.pagination && data.pagination.totalCount) || 0,
      hits: (data.data || []).map((m) => ({
        id: m.id,
        slug: m.slug,
        title: m.name,
        description: m.summary,
        icon: m.logo && m.logo.thumbnailUrl,
        downloads: m.downloadCount,
        author: (m.authors && m.authors[0] && m.authors[0].name) || 'unknown'
      }))
    };
  }

  const facets = [['project_type:mod']];
  if (loader && loader !== 'vanilla') facets.push([`categories:${loader}`]);
  if (mcVersion) facets.push([`versions:${mcVersion}`]);
  if (category) facets.push([`categories:${category}`]);
  const url = `${MODRINTH}/search?query=${encodeURIComponent(query || '')}&facets=${encodeURIComponent(JSON.stringify(facets))}&limit=24&offset=${offset || 0}&index=${query ? 'relevance' : 'downloads'}`;
  const data = await fetchJson(url);
  return {
    total: data.total_hits || 0,
    hits: data.hits.map((h) => ({
      id: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      icon: h.icon_url,
      downloads: h.downloads,
      author: h.author
    }))
  };
});

async function installProject(projectId, mcVersion, loader, modsDir, seen, installed, versionId = null) {
  if (seen.has(projectId)) return;
  seen.add(projectId);

  let v;
  if (versionId) {
    v = await fetchJson(`${MODRINTH}/version/${versionId}`);
  } else {
    const url = `${MODRINTH}/project/${projectId}/version?loaders=${encodeURIComponent(JSON.stringify([loader]))}&game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`;
    const versions = await fetchJson(url);
    if (!versions.length) throw new Error(`No compatible version for ${mcVersion} (${loader})`);
    v = versions[0];
  }

  const file = v.files.find((f) => f.primary) || v.files[0];
  const dest = path.join(modsDir, file.filename);
  if (!fs.existsSync(dest)) {
    await downloadFile(file.url, dest);
    installed.push(file.filename);
  }
  await removeOtherVersions(v.project_id || projectId, modsDir, file.filename);

  // required dependencies download in parallel — `seen` is marked
  // synchronously at entry, so overlapping trees never double-install
  const deps = (v.dependencies || []).filter((d) => d.dependency_type === 'required' && d.project_id);
  await Promise.all(deps.map((dep) => installProject(dep.project_id, mcVersion, loader, modsDir, seen, installed)));
}

// A profile should only ever hold one version of a given mod — remove any
// other jars that belong to the same Modrinth project.
async function removeOtherVersions(projectId, modsDir, keepFilename) {
  try {
    const all = await fetchJson(`${MODRINTH}/project/${projectId}/version`);
    const otherNames = new Set();
    for (const v of all) {
      for (const f of v.files || []) otherNames.add(f.filename);
    }
    otherNames.delete(keepFilename);
    for (const f of await fsp.readdir(modsDir)) {
      const base = f.endsWith('.disabled') ? f.slice(0, -'.disabled'.length) : f;
      if (otherNames.has(base)) await fsp.unlink(path.join(modsDir, f)).catch(() => {});
    }
  } catch {
    // cleanup is best-effort; a failed lookup should never block an install
  }
}

// ---------- CurseForge (Forge profiles) ----------

function cfFileUrl(file) {
  // downloadUrl is null when the author opted out of API downloads; the CDN
  // path can be derived from the file id in that case.
  return file.downloadUrl
    || `https://edge.forgecdn.net/files/${Math.floor(file.id / 1000)}/${file.id % 1000}/${encodeURIComponent(file.fileName)}`;
}

async function cfFilesFor(modId, mcVersion) {
  const data = await fetchJson(`${CF}/mods/${modId}/files?gameVersion=${encodeURIComponent(mcVersion)}&modLoaderType=1&pageSize=50&index=0`);
  return data.data || [];
}

async function cfInstallProject(modId, mcVersion, modsDir, seen, installed, fileId = null) {
  if (seen.has(modId)) return;
  seen.add(modId);

  const files = await cfFilesFor(modId, mcVersion);
  let file = fileId ? files.find((f) => f.id === fileId) : files[0];
  if (fileId && !file) {
    file = (await fetchJson(`${CF}/mods/${modId}/files/${fileId}`)).data;
  }
  if (!file) throw new Error(`No compatible CurseForge file for ${mcVersion} (Forge)`);

  const dest = path.join(modsDir, file.fileName);
  if (!fs.existsSync(dest)) {
    await downloadFile(cfFileUrl(file), dest);
    installed.push(file.fileName);
    try {
      // cache metadata so the installed-mods list shows name/icon/description
      const mod = (await fetchJson(`${CF}/mods/${modId}`)).data;
      const hash = await sha1OfFile(dest);
      const cache = readJson(modMetaFile(), {});
      cache[hash] = {
        projectId: modId,
        title: mod.name,
        icon: mod.logo && mod.logo.thumbnailUrl,
        description: mod.summary,
        versionNumber: file.displayName,
        source: 'curseforge'
      };
      writeJson(modMetaFile(), cache);
    } catch {}
  }

  // one version per mod
  const otherNames = new Set(files.map((f) => f.fileName));
  otherNames.delete(file.fileName);
  for (const f of await fsp.readdir(modsDir)) {
    const base = f.endsWith('.disabled') ? f.slice(0, -'.disabled'.length) : f;
    if (otherNames.has(base)) await fsp.unlink(path.join(modsDir, f)).catch(() => {});
  }

  // required dependencies (relationType 3) download in parallel
  const deps = (file.dependencies || []).filter((d) => d.relationType === 3 && d.modId);
  await Promise.all(deps.map((dep) => cfInstallProject(dep.modId, mcVersion, modsDir, seen, installed)));
}

// Map CurseForge's category list onto the launcher's friendly filter labels.
const CF_CATEGORY_LABELS = [
  ['performance', 'Performance'],
  ['utility', 'Utility'],
  ['adventure', 'Adventure'],
  ['technology', 'Technology'],
  ['magic', 'Magic'],
  ['armor', 'Equipment'],
  ['world gen', 'World Gen'],
  ['mobs', 'Mobs'],
  ['food', 'Food'],
  ['cosmetic', 'Decoration'],
  ['storage', 'Storage'],
  ['library', 'Libraries']
];

ipcMain.handle('cf:categories', async () => {
  const data = await fetchJson(`${CF}/categories?gameId=432&classId=6`);
  const cats = data.data || [];
  const out = [];
  for (const [needle, label] of CF_CATEGORY_LABELS) {
    const hit = cats.find((c) => c.name.toLowerCase().includes(needle));
    if (hit) out.push({ id: hit.id, label });
  }
  return out;
});

ipcMain.handle('modrinth:install', async (_e, { projectId, profileId, versionId }) => {
  const data = await ensureProfiles();
  const profile = data.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('Profile not found');
  if (profile.loader === 'vanilla') throw new Error('This profile is Vanilla — mods need Fabric, Forge or Quilt');
  const modsDir = profileModsDir(profile.id);
  await fsp.mkdir(modsDir, { recursive: true });
  const installed = [];
  if (profile.loader === 'forge') {
    await cfInstallProject(Number(projectId), profile.version, modsDir, new Set(), installed, versionId ? Number(versionId) : null);
  } else {
    await installProject(projectId, profile.version, profile.loader, modsDir, new Set(), installed, versionId || null);
  }
  return { installed };
});

ipcMain.handle('modrinth:versions', async (_e, { projectId, profileId }) => {
  const data = await ensureProfiles();
  const profile = data.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('Profile not found');
  const modsDirCf = profileModsDir(profile.id);
  const onDiskCf = fs.existsSync(modsDirCf) ? new Set(await fsp.readdir(modsDirCf)) : new Set();

  if (profile.loader === 'forge') {
    const files = await cfFilesFor(projectId, profile.version);
    return files.map((f) => ({
      id: f.id,
      name: f.displayName,
      versionNumber: f.displayName,
      type: CF_TYPE[f.releaseType] || 'release',
      date: f.fileDate,
      downloads: f.downloadCount,
      filename: f.fileName,
      installed: onDiskCf.has(f.fileName) || onDiskCf.has(`${f.fileName}.disabled`)
    }));
  }

  const url = `${MODRINTH}/project/${projectId}/version?loaders=${encodeURIComponent(JSON.stringify([profile.loader]))}&game_versions=${encodeURIComponent(JSON.stringify([profile.version]))}`;
  const versions = await fetchJson(url);
  const modsDir = profileModsDir(profile.id);
  const onDisk = fs.existsSync(modsDir) ? new Set(await fsp.readdir(modsDir)) : new Set();
  return versions.map((v) => {
    const filename = ((v.files.find((f) => f.primary) || v.files[0]) || {}).filename || '';
    return {
      id: v.id,
      name: v.name,
      versionNumber: v.version_number,
      type: v.version_type,
      date: v.date_published,
      downloads: v.downloads,
      filename,
      installed: onDisk.has(filename) || onDisk.has(`${filename}.disabled`)
    };
  });
});

// ---------- per-profile mods ----------

const modMetaFile = () => path.join(app.getPath('userData'), 'modmeta.json');

function sha1OfFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    fs.createReadStream(file)
      .on('data', (c) => hash.update(c))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

// Identify local jars via Modrinth's hash lookup so the UI can show real
// names, icons and descriptions. Results are cached by sha1 forever.
async function enrichMods(modsDir, rows) {
  const cache = readJson(modMetaFile(), {});
  const need = []; // rows without cached metadata
  for (const row of rows) {
    row.hash = await sha1OfFile(path.join(modsDir, row.name)).catch(() => null);
    if (row.hash && cache[row.hash] !== undefined) row.meta = cache[row.hash];
    else if (row.hash) need.push(row);
  }
  if (need.length) {
    try {
      const byHash = await fetchJson(`${MODRINTH}/version_files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashes: need.map((r) => r.hash), algorithm: 'sha1' })
      });
      const projectIds = [...new Set(Object.values(byHash).map((v) => v.project_id))];
      const projects = projectIds.length
        ? await fetchJson(`${MODRINTH}/projects?ids=${encodeURIComponent(JSON.stringify(projectIds))}`)
        : [];
      const projById = Object.fromEntries(projects.map((p) => [p.id, p]));
      for (const row of need) {
        const v = byHash[row.hash];
        const proj = v && projById[v.project_id];
        row.meta = proj
          ? {
              projectId: proj.id,
              title: proj.title,
              icon: proj.icon_url,
              description: proj.description,
              versionNumber: v.version_number,
              source: 'modrinth'
            }
          : null; // not a Modrinth file — remember that too
        cache[row.hash] = row.meta;
      }
      writeJson(modMetaFile(), cache);
    } catch {
      // offline or API error — rows simply show their filename
    }
  }
}

ipcMain.handle('mods:list', async (_e, profileId, withMeta = false) => {
  const modsDir = profileModsDir(profileId);
  if (!fs.existsSync(modsDir)) return [];
  const files = await fsp.readdir(modsDir);
  const rows = [];
  for (const f of files) {
    const disabled = f.endsWith('.jar.disabled');
    if (!f.endsWith('.jar') && !disabled) continue;
    const stat = await fsp.stat(path.join(modsDir, f));
    rows.push({ name: f, size: stat.size, disabled, meta: null });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  if (withMeta) await enrichMods(modsDir, rows);
  for (const row of rows) delete row.hash;
  return rows;
});

// ---------- mod updates ----------
// A mod row is "updatable" when its source project has a newer file for this
// profile's version+loader. Modrinth supports one batched lookup by file
// hash; CurseForge is checked per-mod in parallel.

async function checkModUpdates(profile) {
  const modsDir = profileModsDir(profile.id);
  if (!fs.existsSync(modsDir)) return [];
  const files = (await fsp.readdir(modsDir)).filter((f) => f.endsWith('.jar') || f.endsWith('.jar.disabled'));
  const cache = readJson(modMetaFile(), {});
  const rows = [];
  for (const f of files) {
    const hash = await sha1OfFile(path.join(modsDir, f)).catch(() => null);
    const meta = (hash && cache[hash]) || null;
    rows.push({
      name: f,
      base: f.replace(/\.disabled$/, ''),
      disabled: f.endsWith('.disabled'),
      hash,
      meta
    });
  }

  const out = [];

  const mr = rows.filter((r) => r.meta && r.meta.source === 'modrinth' && r.hash);
  if (mr.length && profile.loader !== 'vanilla') {
    try {
      const byHash = await fetchJson(`${MODRINTH}/version_files/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hashes: mr.map((r) => r.hash),
          algorithm: 'sha1',
          loaders: [profile.loader],
          game_versions: [profile.version]
        })
      });
      for (const r of mr) {
        const v = byHash[r.hash];
        if (!v || !v.files) continue;
        const file = v.files.find((f) => f.primary) || v.files[0];
        if (!file) continue;
        out.push({
          base: r.base,
          title: r.meta.title,
          projectId: r.meta.projectId,
          source: 'modrinth',
          disabled: r.disabled,
          latestVersionId: v.id,
          latestVersionNumber: v.version_number,
          latestFilename: file.filename,
          updateAvailable: file.filename !== r.base
        });
      }
    } catch (e) {
      console.warn('[updates] modrinth check failed:', e.message);
    }
  }

  const cf = rows.filter((r) => r.meta && r.meta.source === 'curseforge');
  await Promise.all(cf.map(async (r) => {
    try {
      const cfFiles = await cfFilesFor(r.meta.projectId, profile.version);
      const latest = cfFiles[0];
      if (!latest) return;
      out.push({
        base: r.base,
        title: r.meta.title,
        projectId: r.meta.projectId,
        source: 'curseforge',
        disabled: r.disabled,
        latestFileId: latest.id,
        latestVersionNumber: latest.displayName,
        latestFilename: latest.fileName,
        updateAvailable: latest.fileName !== r.base
      });
    } catch (e) {
      console.warn('[updates] curseforge check failed:', r.meta.title, e.message);
    }
  }));

  return out;
}

ipcMain.handle('mods:checkUpdates', async (_e, profileId) => {
  const data = await ensureProfiles();
  const profile = data.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('Profile not found');
  return checkModUpdates(profile);
});

ipcMain.handle('mods:updateAll', async (_e, profileId) => {
  const data = await ensureProfiles();
  const profile = data.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('Profile not found');
  const modsDir = profileModsDir(profile.id);

  const updates = (await checkModUpdates(profile)).filter((u) => u.updateAvailable);
  const results = { updated: [], failed: [] };
  for (const u of updates) {
    try {
      if (u.source === 'curseforge') {
        await cfInstallProject(Number(u.projectId), profile.version, modsDir, new Set(), [], u.latestFileId);
      } else {
        await installProject(u.projectId, profile.version, profile.loader, modsDir, new Set(), [], u.latestVersionId);
      }
      // the install path always writes an enabled jar — restore disabled state
      if (u.disabled) {
        const f = path.join(modsDir, u.latestFilename);
        if (fs.existsSync(f)) await fsp.rename(f, `${f}.disabled`);
      }
      results.updated.push(u.title || u.base);
    } catch (e) {
      results.failed.push({ name: u.title || u.base, error: e.message });
    }
  }
  return results;
});

ipcMain.handle('mods:toggle', async (_e, { profileId, name }) => {
  const modsDir = profileModsDir(profileId);
  const file = path.join(modsDir, path.basename(name));
  if (!fs.existsSync(file)) throw new Error('Mod file not found');
  const target = file.endsWith('.disabled') ? file.slice(0, -'.disabled'.length) : `${file}.disabled`;
  await fsp.rename(file, target);
  return true;
});

ipcMain.handle('mods:remove', async (_e, { profileId, name }) => {
  const file = path.join(profileModsDir(profileId), path.basename(name));
  await fsp.unlink(file).catch(() => {});
  return true;
});

// ---------- settings ----------

const DEFAULT_SETTINGS = {
  ram: 4,
  resW: null,          // game window width (null = Minecraft default)
  resH: null,
  fullscreen: false,
  minimizeOnLaunch: false,
  showLogsOnLaunch: true, // Feather-style live log window on game launch
  javaArgs: '',        // extra JVM args, space-separated
  lastVersion: null,
  lastLoader: 'vanilla',
  lastProfileId: null
};

function currentSettings() {
  return { ...DEFAULT_SETTINGS, ...readJson(settingsFile(), {}) };
}

// Fold of the old "Import Old Data.bat": copies worlds/settings/packs from
// .minecraft into the Orbital game folder. Never overwrites existing files.
ipcMain.handle('data:import', async () => {
  const src = path.join(app.getPath('appData'), '.minecraft');
  if (!fs.existsSync(src)) throw new Error('No .minecraft folder found on this PC');
  const dirs = ['saves', 'resourcepacks', 'shaderpacks', 'screenshots', 'config', 'xaero', 'schematics'];
  const files = ['servers.dat', 'options.txt', 'optionsof.txt', 'optionsshaders.txt'];
  for (const d of dirs) {
    const from = path.join(src, d);
    if (fs.existsSync(from)) {
      await fsp.cp(from, path.join(GAME_ROOT, d), { recursive: true, force: false, errorOnExist: false });
    }
  }
  for (const f of files) {
    const from = path.join(src, f);
    const to = path.join(GAME_ROOT, f);
    if (fs.existsSync(from) && !fs.existsSync(to)) await fsp.copyFile(from, to);
  }
  return true;
});

ipcMain.handle('settings:get', () => ({ ...DEFAULT_SETTINGS, ...readJson(settingsFile(), {}) }));
ipcMain.handle('settings:set', (_e, patch) => {
  const merged = { ...DEFAULT_SETTINGS, ...readJson(settingsFile(), {}), ...patch };
  writeJson(settingsFile(), merged);
  return merged;
});

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('app:openFolder', async (_e, sub) => {
  const dir = sub ? path.join(GAME_ROOT, sub) : GAME_ROOT;
  await fsp.mkdir(dir, { recursive: true });
  shell.openPath(dir);
  return true;
});
