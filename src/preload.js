const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('feather', {
  // Auth
  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  restore: () => ipcRenderer.invoke('auth:restore'),

  // Game
  getVersions: () => ipcRenderer.invoke('mc:versions'),
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

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  openFolder: (sub) => ipcRenderer.invoke('app:openFolder', sub),

  // Window controls
  winMinimize: () => ipcRenderer.send('win:minimize'),
  winMaximize: () => ipcRenderer.send('win:maximize'),
  winClose: () => ipcRenderer.send('win:close')
});
