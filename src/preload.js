const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('feather', {
  // Auth
  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  restore: () => ipcRenderer.invoke('auth:restore'),

  // Game
  getVersions: () => ipcRenderer.invoke('mc:versions'),
  getSupportedVersions: () => ipcRenderer.invoke('mc:supportedVersions'),
  getAllVersions: () => ipcRenderer.invoke('mc:allVersions'),
  launch: (opts) => ipcRenderer.invoke('mc:launch', opts),
  onLaunchStatus: (cb) => ipcRenderer.on('launch:status', (_e, data) => cb(data)),
  onLaunchClosed: (cb) => ipcRenderer.on('launch:closed', (_e, data) => cb(data)),

  // Profiles
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  createProfile: (opts) => ipcRenderer.invoke('profiles:create', opts),
  deleteProfile: (id) => ipcRenderer.invoke('profiles:delete', id),
  exportProfile: (id) => ipcRenderer.invoke('profiles:export', id),
  importProfile: () => ipcRenderer.invoke('profiles:import'),
  pickProfileIcon: (id) => ipcRenderer.invoke('profiles:pickIcon', id),
  removeProfileIcon: (id) => ipcRenderer.invoke('profiles:removeIcon', id),
  pickIconFile: () => ipcRenderer.invoke('icon:pickFile'),
  setProfileIconData: (opts) => ipcRenderer.invoke('profiles:setIconData', opts),

  // Modrinth
  searchMods: (opts) => ipcRenderer.invoke('modrinth:search', opts),
  installMod: (opts) => ipcRenderer.invoke('modrinth:install', opts),
  getModVersions: (opts) => ipcRenderer.invoke('modrinth:versions', opts),
  getModDetails: (opts) => ipcRenderer.invoke('mods:details', opts),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  getForgeCategories: () => ipcRenderer.invoke('cf:categories'),
  listMods: (profileId, withMeta) => ipcRenderer.invoke('mods:list', profileId, withMeta),
  getInstalledProjects: (profileId) => ipcRenderer.invoke('mods:installedProjects', profileId),
  onProfilesChanged: (cb) => ipcRenderer.on('profiles:changed', () => cb()),
  toggleMod: (opts) => ipcRenderer.invoke('mods:toggle', opts),
  checkModUpdates: (profileId) => ipcRenderer.invoke('mods:checkUpdates', profileId),
  updateAllMods: (profileId) => ipcRenderer.invoke('mods:updateAll', profileId),
  removeMod: (opts) => ipcRenderer.invoke('mods:remove', opts),

  // Skins
  getSkin: () => ipcRenderer.invoke('skin:get'),
  pickSkinFile: () => ipcRenderer.invoke('skin:pickFile'),
  uploadSkin: (opts) => ipcRenderer.invoke('skin:upload', opts),
  setSkinVariant: (variant) => ipcRenderer.invoke('skin:setVariant', variant),
  listSavedSkins: () => ipcRenderer.invoke('skins:list'),
  saveCurrentSkin: () => ipcRenderer.invoke('skins:saveCurrent'),
  applySavedSkin: (id) => ipcRenderer.invoke('skins:apply', id),
  deleteSavedSkin: (id) => ipcRenderer.invoke('skins:delete', id),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  openFolder: (sub) => ipcRenderer.invoke('app:openFolder', sub),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getGameLog: () => ipcRenderer.invoke('diag:gameLog'),

  // Game log window
  openLogWindow: () => ipcRenderer.send('logs:open'),
  onGameLog: (cb) => ipcRenderer.on('game:log', (_e, line) => cb(line)),
  onGameLogReset: (cb) => ipcRenderer.on('game:log-reset', () => cb()),
  onGameState: (cb) => ipcRenderer.on('game:state', (_e, d) => cb(d)),
  onGameStats: (cb) => ipcRenderer.on('game:stats', (_e, d) => cb(d)),
  importOldData: () => ipcRenderer.invoke('data:import'),

  // Auto-update
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_e, d) => cb(d)),
  onUpdateProgress: (cb) => ipcRenderer.on('update:progress', (_e, d) => cb(d)),
  onUpdateReady: (cb) => ipcRenderer.on('update:ready', (_e, d) => cb(d)),
  onUpdateNone: (cb) => ipcRenderer.on('update:none', (_e, d) => cb(d)),
  onUpdateError: (cb) => ipcRenderer.on('update:error', (_e, d) => cb(d)),

  // Window controls
  winMinimize: () => ipcRenderer.send('win:minimize'),
  winMaximize: () => ipcRenderer.send('win:maximize'),
  winClose: () => ipcRenderer.send('win:close')
});
