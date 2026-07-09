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

  // Modrinth
  searchMods: (opts) => ipcRenderer.invoke('modrinth:search', opts),
  installMod: (opts) => ipcRenderer.invoke('modrinth:install', opts),
  getModVersions: (opts) => ipcRenderer.invoke('modrinth:versions', opts),
  getForgeCategories: () => ipcRenderer.invoke('cf:categories'),
  listMods: (profileId, withMeta) => ipcRenderer.invoke('mods:list', profileId, withMeta),
  toggleMod: (opts) => ipcRenderer.invoke('mods:toggle', opts),
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
