const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { Readable } = require('stream');
const { Client } = require('minecraft-launcher-core');

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

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'User-Agent': MODRINTH_UA, ...(opts.headers || {}) }
  });
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.json();
}

async function downloadFile(url, dest, onProgress) {
  const res = await fetch(url, { headers: { 'User-Agent': MODRINTH_UA } });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await new Promise((resolve, reject) => {
    const rs = Readable.fromWeb(res.body);
    const ws = fs.createWriteStream(dest);
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
}

// ---------- Java runtime (auto-downloaded from Adoptium) ----------

let versionManifestCache = null;
async function getVersionManifest() {
  if (!versionManifestCache) {
    versionManifestCache = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
  }
  return versionManifestCache;
}

// Mojang's per-version metadata declares the exact Java major it needs.
async function javaMajorFor(mcVersion) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const manifest = await getVersionManifest();
      const entry = manifest.versions.find((v) => v.id === mcVersion);
      if (!entry) break; // unknown id — use heuristic
      const meta = await fetchJson(entry.url);
      if (meta.javaVersion && meta.javaVersion.majorVersion) {
        return adoptiumMajor(meta.javaVersion.majorVersion);
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
  new AdmZip(zipPath).extractAllTo(runtimeDir, true);
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
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

ipcMain.on('win:minimize', () => win.minimize());
ipcMain.on('win:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
ipcMain.on('win:close', () => win.close());

// ---------- auth ----------

async function getMinecraftWithRetry(xbox) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await xbox.getMinecraft();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 800));
    }
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
let allVersionsCache = null;

ipcMain.handle('mc:allVersions', async () => {
  if (allVersionsCache) return allVersionsCache;
  const manifest = await getVersionManifest();
  const releases = manifest.versions.filter((v) => v.type === 'release').map((v) => v.id);

  let fabricList = [];
  try {
    const supported = await fabric.listSupportedVersions(); // meta.fabricmc.net
    const set = new Set(supported.filter((v) => v.stable).map((v) => v.version));
    fabricList = releases.filter((id) => set.has(id));
  } catch (e) {
    console.warn('[versions] fabric list failed:', e.message);
  }

  let forgeList = [];
  try {
    const supported = await forge.listSupportedVersions(); // forge maven metadata
    const set = new Set(supported.map((v) => v.version));
    forgeList = releases.filter((id) => set.has(id));
  } catch (e) {
    console.warn('[versions] forge list failed:', e.message);
  }

  allVersionsCache = { vanilla: releases, fabric: fabricList, forge: forgeList };
  return allVersionsCache;
});

ipcMain.handle('mc:launch', async (_e, { profileId, ram }) => {
  if (!token) throw new Error('Not signed in');
  if (gameRunning) throw new Error('Game is already running');
  gameRunning = true;

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

    const launcher = new Client();
    let started = false;

    launcher.on('debug', (m) => console.log('[MLC]', m));
    // MLC puts the Forge *installer* jar on the classpath. Modern Forge's
    // bootstrap builds a JPMS module graph from the classpath, and the
    // installer's bundled jopt-simple collides with the real one
    // ("Modules forge and jopt.simple export package joptsimple...").
    // Drop the installer from the classpath for modern Forge only — legacy
    // Forge (LaunchWrapper era, e.g. 1.8.9) has no module system and keeps
    // its original classpath.
    launcher.on('arguments', (args) => {
      if (loader !== 'forge' || !config.forge) return;
      const i = args.indexOf('-cp');
      if (i === -1 || typeof args[i + 1] !== 'string') return;
      const mainClass = String(args[i + 2] || '');
      const modernForge = /minecraftforge\.bootstrap|cpw\.mods/i.test(mainClass);
      if (!modernForge) return;
      const installer = path.normalize(config.forge).toLowerCase();
      const before = args[i + 1].split(';');
      const after = before.filter((p) => path.normalize(p).toLowerCase() !== installer);
      if (after.length !== before.length) {
        args[i + 1] = after.join(';');
        console.log('[launch] removed Forge installer jar from modern Forge classpath');
      }
    });
    launcher.on('data', (d) => {
      const line = String(d).trim();
      if (line) console.log('[game]', line);
    });
    launcher.on('progress', (p) => {
      const percent = p.total ? Math.round((p.task / p.total) * 100) : 0;
      // MLC re-verifies every file each launch; existing files are skipped,
      // so after the first launch this phase is a check, not a download.
      send('launch:status', { stage: 'download', percent, message: `Checking ${p.type}... ${percent}%` });
    });
    launcher.on('data', () => {
      if (!started) {
        started = true;
        send('launch:status', { stage: 'running', percent: 100, message: 'Game is running' });
      }
    });
    launcher.on('close', (code) => {
      gameRunning = false;
      console.log('[game] exited with code', code);
      send('launch:closed', { code });
    });

    await launcher.launch({
      ...config,
      authorization: token.mclc(),
      javaPath,
      customArgs,
      memory: { max: `${ram || 4}G`, min: '1G' }
    });

    send('launch:status', { stage: 'starting', percent: 100, message: 'Starting Minecraft...' });
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

ipcMain.handle('profiles:list', async () => ensureProfiles());

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
  return data;
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

  for (const dep of v.dependencies || []) {
    if (dep.dependency_type === 'required' && dep.project_id) {
      await installProject(dep.project_id, mcVersion, loader, modsDir, seen, installed);
    }
  }
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

  for (const dep of file.dependencies || []) {
    if (dep.relationType === 3 && dep.modId) { // required dependency
      await cfInstallProject(dep.modId, mcVersion, modsDir, seen, installed);
    }
  }
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

const DEFAULT_SETTINGS = { ram: 4, lastVersion: null, lastLoader: 'vanilla', lastProfileId: null };

ipcMain.handle('settings:get', () => ({ ...DEFAULT_SETTINGS, ...readJson(settingsFile(), {}) }));
ipcMain.handle('settings:set', (_e, patch) => {
  const merged = { ...DEFAULT_SETTINGS, ...readJson(settingsFile(), {}), ...patch };
  writeJson(settingsFile(), merged);
  return merged;
});

ipcMain.handle('app:openFolder', async (_e, sub) => {
  const dir = sub ? path.join(GAME_ROOT, sub) : GAME_ROOT;
  await fsp.mkdir(dir, { recursive: true });
  shell.openPath(dir);
  return true;
});
