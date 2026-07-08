const $ = (id) => document.getElementById(id);

const CATEGORIES = [
  { id: '', label: 'All' },
  { id: 'optimization', label: 'Performance' },
  { id: 'utility', label: 'Utility' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'technology', label: 'Technology' },
  { id: 'magic', label: 'Magic' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'worldgen', label: 'World Gen' },
  { id: 'mobs', label: 'Mobs' },
  { id: 'food', label: 'Food' },
  { id: 'decoration', label: 'Decoration' },
  { id: 'storage', label: 'Storage' },
  { id: 'library', label: 'Libraries' }
];

const state = {
  profile: null,          // signed-in account
  settings: { ram: 4, lastProfileId: null },
  versions: [],
  latestVersion: null,
  profiles: [],
  selectedProfileId: null, // profile used by PLAY
  viewProfile: null,       // profile open in detail/browse views
  activeCategory: '',
  categories: null,        // filter chips for the open browse view
  cfCategories: null,      // cached CurseForge category chips
  modPage: 0,              // 0-based page in Browse Mods
  launching: false,
  running: false
};

// ---------- window controls ----------
$('btn-min').onclick = () => feather.winMinimize();
$('btn-max').onclick = () => feather.winMaximize();
$('btn-close').onclick = () => feather.winClose();

// ---------- toasts ----------
function toast(message, type = 'info', ms = 4200) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function cleanError(err) {
  return String(err && err.message ? err.message : err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

// ---------- navigation ----------
function gotoPage(page) {
  document.querySelectorAll('.nav-tab').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  $(`page-${page}`).classList.add('active');
  if (page === 'profiles') showProfilesView();
}

document.querySelectorAll('.nav-tab').forEach((btn) => {
  btn.onclick = () => gotoPage(btn.dataset.page);
});

$('account-chip').onclick = () => gotoPage('settings');

// ---------- auth ----------
function showLogin() {
  $('login-screen').classList.remove('hidden');
  $('app').classList.add('hidden');
  $('top-nav').classList.add('hidden');
  $('account-chip').classList.add('hidden');
}

function showApp() {
  $('login-screen').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('top-nav').classList.remove('hidden');
  $('account-chip').classList.remove('hidden');
  $('welcome-text').textContent = `Welcome back, ${state.profile.name}`;
  $('settings-account-name').textContent = `Signed in as ${state.profile.name}`;
  $('account-name').textContent = state.profile.name;
  const avatar = $('account-avatar');
  avatar.src = `https://mc-heads.net/avatar/${state.profile.uuid}/64`;
  $('account-chip').title = state.profile.name;
}

$('btn-login').onclick = async () => {
  const btn = $('btn-login');
  const errEl = $('login-error');
  errEl.classList.add('hidden');
  btn.disabled = true;
  try {
    const profile = await feather.login();
    if (profile) {
      state.profile = profile;
      showApp();
    }
  } catch (err) {
    errEl.textContent = cleanError(err);
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
};

$('btn-logout').onclick = async () => {
  await feather.logout();
  state.profile = null;
  showLogin();
};

// ---------- profiles ----------
function selectedProfile() {
  return state.profiles.find((p) => p.id === state.selectedProfileId) || state.profiles[0] || null;
}

function loaderLabel(loader) {
  return loader.charAt(0).toUpperCase() + loader.slice(1);
}

async function loadProfiles() {
  const data = await feather.listProfiles();
  state.profiles = data.profiles;
  if (!state.profiles.find((p) => p.id === state.selectedProfileId)) {
    state.selectedProfileId = state.profiles[0] ? state.profiles[0].id : null;
  }
  renderProfileDropdown();
  renderProfilesPage();
}

function selectProfile(id) {
  state.selectedProfileId = id;
  feather.setSettings({ lastProfileId: id });
  renderProfileDropdown();
  renderProfilesPage();
}

// --- home dropdown ---
const dropdownBtn = $('profile-dropdown-btn');
const dropdownEl = $('profile-dropdown');

dropdownBtn.onclick = (e) => {
  e.stopPropagation();
  dropdownEl.classList.toggle('hidden');
  dropdownBtn.classList.toggle('open', !dropdownEl.classList.contains('hidden'));
};
document.addEventListener('click', () => {
  dropdownEl.classList.add('hidden');
  dropdownBtn.classList.remove('open');
});

function renderProfileDropdown() {
  const current = selectedProfile();
  $('current-profile-name').textContent = current ? current.name : 'No profile';
  $('current-profile-meta').textContent = current ? `${loaderLabel(current.loader)} · ${current.version}` : '';

  dropdownEl.innerHTML = '';
  for (const p of state.profiles) {
    const opt = document.createElement('button');
    opt.className = 'profile-option' + (p.id === state.selectedProfileId ? ' selected' : '');
    const name = document.createElement('span');
    name.textContent = p.name;
    const meta = document.createElement('span');
    meta.className = 'profile-meta';
    meta.textContent = `${loaderLabel(p.loader)} · ${p.version}`;
    opt.append(name, meta);
    opt.onclick = () => selectProfile(p.id);
    dropdownEl.appendChild(opt);
  }
  if (typeof updatePlayAvailability === 'function') updatePlayAvailability();
}

// --- profiles page (list / detail / browse views) ---
function showProfilesView() {
  closeDrawer();
  $('browse-view').classList.add('hidden');
  $('profile-detail-view').classList.add('hidden');
  $('profiles-view').classList.remove('hidden');
  renderProfilesPage();
}

async function renderProfilesPage() {
  const listEl = $('profiles-list');
  listEl.innerHTML = '';
  for (const p of state.profiles) {
    const card = document.createElement('div');
    card.className = 'profile-card' + (p.id === state.selectedProfileId ? ' selected' : '');
    card.onclick = () => openProfileDetail(p);

    const top = document.createElement('div');
    top.className = 'profile-card-top';
    const name = document.createElement('div');
    name.className = 'profile-card-name';
    name.textContent = p.name;
    const badge = document.createElement('span');
    badge.className = `loader-badge ${p.loader}`;
    badge.textContent = p.loader;
    top.append(name, badge);

    if (p.premade) {
      const starter = document.createElement('span');
      starter.className = 'premade-tag';
      starter.textContent = 'Starter';
      starter.title = 'Premade profile that ships with Orbital';
      top.appendChild(starter);
    }
    if (p.id === state.selectedProfileId) {
      const tag = document.createElement('span');
      tag.className = 'active-tag';
      tag.textContent = 'Active';
      tag.title = 'This profile launches when you hit PLAY on the Home tab';
      top.appendChild(tag);
    }

    const info = document.createElement('div');
    info.className = 'profile-card-info';
    const line = (mods) => {
      const base = `Minecraft ${p.version}` + (mods === undefined ? '' : ` · ${mods} mod${mods === 1 ? '' : 's'}`);
      return p.description ? `${p.description}\n${base}` : base;
    };
    info.style.whiteSpace = 'pre-line';
    info.textContent = line();
    if (p.loader !== 'vanilla') {
      feather.listMods(p.id).then((mods) => {
        info.textContent = line(mods.length);
      });
    }

    const actions = document.createElement('div');
    actions.className = 'profile-card-actions';
    const openBtn = document.createElement('button');
    openBtn.className = 'accent-button';
    openBtn.textContent = 'Open';
    openBtn.onclick = (e) => {
      e.stopPropagation();
      openProfileDetail(p);
    };
    actions.append(openBtn);

    card.append(top, info, actions);
    listEl.appendChild(card);
  }
}

// --- profile detail view ---
function openProfileDetail(profile) {
  state.viewProfile = profile;
  closeDrawer();
  $('profiles-view').classList.add('hidden');
  $('browse-view').classList.add('hidden');
  $('profile-detail-view').classList.remove('hidden');

  $('detail-name').textContent = profile.name;
  const badge = $('detail-badge');
  badge.className = `loader-badge ${profile.loader}`;
  badge.textContent = profile.loader;
  $('detail-version').textContent = `Minecraft ${profile.version}`;
  const descEl = $('detail-desc');
  descEl.textContent = profile.description || '';
  descEl.classList.toggle('hidden', !profile.description);
  const playBtnDetail = $('detail-play');
  playBtnDetail.disabled = profile.loader === 'forge';
  playBtnDetail.title = profile.loader === 'forge' ? 'Forge is temporarily disabled — coming back soon' : '';
  loadInstalledMods();
}

$('btn-back-list').onclick = showProfilesView;
$('detail-play').onclick = () => {
  const p = state.viewProfile;
  if (!p) return;
  selectProfile(p.id);   // playing a profile also makes it the active one
  gotoPage('home');
  launchSelected();
};
$('detail-browse').onclick = () => state.viewProfile && openBrowse(state.viewProfile);
$('detail-open-folder').onclick = () => {
  if (state.viewProfile) feather.openFolder(`profiles/${state.viewProfile.id}/mods`);
};
$('detail-delete').onclick = async () => {
  const p = state.viewProfile;
  if (!p) return;
  try {
    await feather.deleteProfile(p.id);
    await loadProfiles();
    toast(`Deleted "${p.name}"`, 'success');
    showProfilesView();
  } catch (err) {
    toast(cleanError(err), 'error');
  }
};

// --- new profile wizard ---
const modal = $('modal-overlay');
let wizardStep = 1;
let wizardLoader = 'fabric';  // pill selected in step 2
let wizardVersion = null;     // version id picked in step 2
let supportedVersions = null; // curated: [{ id, line, loaders }]
let allVersions = null;       // advanced: { vanilla: [], fabric: [], forge: [] }
let advancedMode = false;

function setWizardStep(step) {
  wizardStep = step;
  $('np-step-1').classList.toggle('hidden', step !== 1);
  $('np-step-2').classList.toggle('hidden', step !== 2);
  const rail1 = $('rail-1');
  rail1.classList.toggle('active', step === 1);
  rail1.classList.toggle('done', step === 2);
  rail1.querySelector('.rail-dot').textContent = step === 2 ? '✓' : '1';
  $('rail-2').classList.toggle('active', step === 2);
  $('np-back').classList.toggle('hidden', step === 1);
  $('np-next').classList.toggle('hidden', step === 2);
  $('np-create').classList.toggle('hidden', step === 1);
  $('np-advanced').classList.toggle('hidden', step !== 2);
}

$('rail-1').onclick = () => {
  if (wizardStep === 2) setWizardStep(1); // completed step is clickable
};

// character counters on step 1
function updateWizardPreview() {
  $('np-name-count').textContent = 40 - $('np-name').value.length;
  $('np-desc-count').textContent = 140 - $('np-desc').value.length;
}
$('np-name').addEventListener('input', updateWizardPreview);
$('np-desc').addEventListener('input', updateWizardPreview);

$('btn-new-profile').onclick = async () => {
  $('np-name').value = '';
  $('np-desc').value = '';
  updateWizardPreview();
  wizardVersion = null;
  wizardLoader = 'fabric';
  advancedMode = false;
  $('np-advanced-check').checked = false;
  $('np-advanced').classList.remove('on');
  setWizardStep(1);
  modal.classList.remove('hidden');
  $('np-name').focus();

  if (!supportedVersions) {
    try {
      const { versions } = await feather.getSupportedVersions();
      supportedVersions = versions;
    } catch {
      supportedVersions = [];
      toast('Could not load the version list — check your connection.', 'error');
    }
  }
  renderWizardLoaderPills();
  renderVersionOptions();
};

function renderWizardLoaderPills() {
  document.querySelectorAll('#np-loader-pills .pill').forEach((p) => {
    p.classList.toggle('active', p.dataset.loader === wizardLoader);
  });
}

document.querySelectorAll('#np-loader-pills .pill').forEach((pill) => {
  pill.onclick = () => {
    wizardLoader = pill.dataset.loader;
    wizardVersion = null; // the old pick may not exist under the new loader
    renderWizardLoaderPills();
    renderVersionOptions();
  };
});

const advCheck = $('np-advanced-check');
advCheck.onchange = async () => {
  const wrap = $('np-advanced');
  if (advCheck.checked && !allVersions) {
    wrap.classList.add('loading');
    advCheck.disabled = true;
    try {
      allVersions = await feather.getAllVersions();
    } catch {
      toast('Could not load the full version list — check your connection.', 'error');
      advCheck.checked = false;
      wrap.classList.remove('loading');
      advCheck.disabled = false;
      return;
    }
    wrap.classList.remove('loading');
    advCheck.disabled = false;
  }
  advancedMode = advCheck.checked;
  wrap.classList.toggle('on', advancedMode);
  wizardVersion = null; // the old pick may not exist in the other list
  renderVersionOptions();
};

function renderVersionOptions() {
  const list = $('np-version-list');
  list.innerHTML = '';
  const rows = advancedMode
    ? ((allVersions && allVersions[wizardLoader]) || []).map((id) => ({ id, line: id }))
    : (supportedVersions || []).filter((v) => v.loaders.includes(wizardLoader));
  if (!rows.length) {
    list.innerHTML = '<p class="empty-note" style="padding:12px">No supported versions for this loader.</p>';
    return;
  }
  for (const v of rows) {
    const row = document.createElement('button');
    row.className = 'version-option' + (wizardVersion === v.id ? ' selected' : '');
    const line = document.createElement('span');
    line.className = 'vo-line';
    line.textContent = v.line;
    const full = document.createElement('span');
    full.className = 'vo-id';
    full.textContent = v.id === v.line ? ' ' : v.id;
    row.append(line, full);
    row.onclick = () => {
      wizardVersion = v.id;
      renderVersionOptions();
    };
    list.appendChild(row);
  }
}

$('np-next').onclick = () => setWizardStep(2);
$('np-back').onclick = () => setWizardStep(1);
$('np-close').onclick = () => modal.classList.add('hidden');
modal.onclick = (e) => {
  if (e.target === modal) modal.classList.add('hidden');
};

$('np-create').onclick = async () => {
  if (!wizardVersion) {
    toast('Pick a Minecraft version first', 'error');
    return;
  }
  try {
    const created = await feather.createProfile({
      name: $('np-name').value,
      description: $('np-desc').value,
      version: wizardVersion,
      loader: wizardLoader
    });
    modal.classList.add('hidden');
    await loadProfiles();
    selectProfile(created.id);
    toast(`Created "${created.name}"`, 'success');
  } catch (err) {
    toast(cleanError(err), 'error');
  }
};

// ---------- browse mods ----------
async function openBrowse(profile) {
  state.viewProfile = profile;
  state.activeCategory = '';
  $('profiles-view').classList.add('hidden');
  $('profile-detail-view').classList.add('hidden');
  $('browse-view').classList.remove('hidden');
  const source = profile.loader === 'forge' ? 'CurseForge' : 'Modrinth';
  $('browse-context').textContent = `${profile.name} · ${loaderLabel(profile.loader)} · ${profile.version} · ${source}`;
  $('mod-search').value = '';
  $('mod-search').placeholder = `Search ${source} for mods...`;

  // Forge profiles browse CurseForge, whose categories have their own ids.
  if (profile.loader === 'forge') {
    if (!state.cfCategories) {
      try {
        state.cfCategories = [{ id: '', label: 'All' }, ...(await feather.getForgeCategories())];
      } catch {
        state.cfCategories = [{ id: '', label: 'All' }];
      }
    }
    state.categories = state.cfCategories;
  } else {
    state.categories = CATEGORIES;
  }

  renderCategoryChips();
  searchMods(); // popular mods load immediately
}

$('btn-back-detail').onclick = () => {
  if (state.viewProfile) openProfileDetail(state.viewProfile);
  else showProfilesView();
};

function renderCategoryChips() {
  const row = $('category-filters');
  row.innerHTML = '';
  for (const cat of state.categories || CATEGORIES) {
    const chip = document.createElement('button');
    chip.className = 'cat-chip' + (state.activeCategory === cat.id ? ' active' : '');
    chip.textContent = cat.label;
    chip.onclick = () => {
      state.activeCategory = cat.id;
      renderCategoryChips();
      searchMods();
    };
    row.appendChild(chip);
  }
}

const PAGE_SIZE = 24;

// Fresh search: back to page 1.
function searchMods() {
  state.modPage = 0;
  fetchModPage();
}

async function fetchModPage() {
  const p = state.viewProfile;
  if (!p) return;
  const btn = $('btn-search');
  btn.disabled = true;
  const resultsEl = $('mod-results');
  resultsEl.innerHTML = '<p class="empty-note">Loading mods from Modrinth...</p>';
  try {
    const { total, hits } = await feather.searchMods({
      query: $('mod-search').value.trim(),
      mcVersion: p.version,
      loader: p.loader,
      category: state.activeCategory,
      offset: state.modPage * PAGE_SIZE
    });
    renderResults(hits);
    renderPager(total);
  } catch (err) {
    resultsEl.innerHTML = '';
    renderPager(0);
    toast(cleanError(err), 'error');
  } finally {
    btn.disabled = false;
  }
}

function renderPager(total) {
  const pages = Math.ceil(total / PAGE_SIZE);
  const cur = state.modPage;
  for (const el of [$('pager-top'), $('pager-bottom')]) {
    el.innerHTML = '';
    if (pages <= 1) continue;

    const addBtn = (label, page, opts = {}) => {
      const b = document.createElement('button');
      b.className = 'page-btn' + (opts.current ? ' current' : '');
      b.textContent = label;
      b.disabled = !!opts.disabled || !!opts.current;
      if (!b.disabled) b.onclick = () => goToModPage(page);
      el.appendChild(b);
    };
    const addDots = () => {
      const s = document.createElement('span');
      s.className = 'page-ellipsis';
      s.textContent = '…';
      el.appendChild(s);
    };

    addBtn('‹', cur - 1, { disabled: cur === 0 });

    // window: 1 … cur-1 cur cur+1 … last
    const shown = new Set([0, pages - 1, cur - 1, cur, cur + 1].filter((n) => n >= 0 && n < pages));
    let prev = -1;
    for (let i = 0; i < pages; i++) {
      if (!shown.has(i)) continue;
      if (prev !== -1 && i - prev > 1) addDots();
      addBtn(String(i + 1), i, { current: i === cur });
      prev = i;
    }

    addBtn('›', cur + 1, { disabled: cur >= pages - 1 });
  }
}

function goToModPage(page) {
  state.modPage = page;
  fetchModPage();
  document.querySelector('.content').scrollTop = 0;
}

$('btn-search').onclick = searchMods;
$('mod-search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchMods();
});

function renderResults(hits) {
  const resultsEl = $('mod-results');
  resultsEl.innerHTML = '';
  if (!hits.length) {
    resultsEl.innerHTML = '<p class="empty-note">No mods found for this version/loader/filter.</p>';
    return;
  }
  const p = state.viewProfile;
  const vanilla = p.loader === 'vanilla';
  for (const hit of hits) {
    const card = document.createElement('div');
    card.className = 'mod-card';

    const img = document.createElement('img');
    img.src = hit.icon || '';
    img.onerror = () => (img.style.visibility = 'hidden');

    const info = document.createElement('div');
    info.className = 'mod-info';
    const title = document.createElement('div');
    title.className = 'mod-title';
    title.textContent = hit.title;
    const desc = document.createElement('div');
    desc.className = 'mod-desc';
    desc.textContent = hit.description;
    const meta = document.createElement('div');
    meta.className = 'mod-meta';
    meta.textContent = `by ${hit.author} · ${formatDownloads(hit.downloads)} downloads`;
    info.append(title, desc, meta);

    const actions = document.createElement('div');
    actions.className = 'mod-actions';

    const installBtn = document.createElement('button');
    installBtn.className = 'mod-install';
    installBtn.textContent = 'Install';
    installBtn.disabled = vanilla;
    if (vanilla) installBtn.title = 'This profile is Vanilla — mods need Fabric, Forge or Quilt';
    installBtn.onclick = () => installFromButton(installBtn, hit, null);

    const versionsBtn = document.createElement('button');
    versionsBtn.className = 'versions-btn';
    versionsBtn.textContent = 'Versions';
    versionsBtn.disabled = vanilla;
    versionsBtn.onclick = () => openVersionDrawer(hit);

    actions.append(installBtn, versionsBtn);
    card.append(img, info, actions);
    resultsEl.appendChild(card);
  }
}

// Shared install flow: versionId null = newest compatible version.
async function installFromButton(btn, hit, versionId, onDone) {
  const p = state.viewProfile;
  const prevText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const { installed } = await feather.installMod({ projectId: hit.id, profileId: p.id, versionId });
    btn.textContent = 'Installed';
    btn.classList.add('installed');
    toast(
      installed.length > 1
        ? `Installed ${hit.title} + ${installed.length - 1} dependencies`
        : `Installed ${hit.title}`,
      'success'
    );
    renderProfilesPage();
    if (onDone) onDone();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = prevText;
    toast(cleanError(err), 'error', 6000);
  }
}

// ---------- versions drawer ----------
const drawer = $('version-drawer');
const drawerOverlay = $('drawer-overlay');

function closeDrawer() {
  drawer.classList.remove('open');
  drawerOverlay.classList.add('hidden');
}
$('drawer-close').onclick = closeDrawer;
drawerOverlay.onclick = closeDrawer;

async function openVersionDrawer(hit) {
  const p = state.viewProfile;
  $('drawer-mod-title').textContent = hit.title;
  $('drawer-context').textContent = `${loaderLabel(p.loader)} · ${p.version}`;
  const listEl = $('drawer-list');
  listEl.innerHTML = '<p class="empty-note">Loading versions...</p>';
  drawerOverlay.classList.remove('hidden');
  drawer.classList.add('open');

  try {
    const versions = await feather.getModVersions({ projectId: hit.id, profileId: p.id });
    listEl.innerHTML = '';
    if (!versions.length) {
      listEl.innerHTML = '<p class="empty-note">No compatible versions found.</p>';
      return;
    }
    versions.forEach((v, i) => {
      const row = document.createElement('div');
      row.className = 'version-row';

      const info = document.createElement('div');
      info.className = 'version-info';
      const num = document.createElement('div');
      num.className = 'version-number';
      num.textContent = v.versionNumber + (i === 0 ? '  (newest)' : '');
      const sub = document.createElement('div');
      sub.className = 'version-sub';
      const badge = document.createElement('span');
      badge.className = `type-badge ${v.type}`;
      badge.textContent = v.type;
      sub.appendChild(badge);
      sub.appendChild(document.createTextNode(
        `${new Date(v.date).toLocaleDateString()} · ${formatDownloads(v.downloads)} downloads`
      ));
      info.append(num, sub);

      const installBtn = document.createElement('button');
      installBtn.className = 'mod-install' + (v.installed ? ' installed' : '');
      installBtn.textContent = v.installed ? 'Installed' : 'Install';
      installBtn.disabled = v.installed;
      // Re-render the drawer after installing so the previously installed
      // version flips back to "Install" (it was replaced on disk).
      installBtn.onclick = () => installFromButton(installBtn, hit, v.id, () => openVersionDrawer(hit));

      row.append(info, installBtn);
      listEl.appendChild(row);
    });
  } catch (err) {
    listEl.innerHTML = '';
    toast(cleanError(err), 'error');
  }
}

function formatDownloads(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'k';
  return String(n);
}

const TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

async function loadInstalledMods() {
  const p = state.viewProfile;
  if (!p) return;
  const listEl = $('installed-mods');
  listEl.innerHTML = '<p class="empty-note">Loading mods...</p>';
  const mods = await feather.listMods(p.id, true); // with Modrinth metadata
  if (state.viewProfile !== p) return; // user navigated away meanwhile
  $('installed-title').textContent = `Installed mods (${mods.length})`;
  listEl.innerHTML = '';
  if (!mods.length) {
    listEl.innerHTML = p.loader === 'vanilla'
      ? '<p class="empty-note">This is a Vanilla profile — mods need Fabric, Forge or Quilt.</p>'
      : '<p class="empty-note">No mods installed in this profile yet. Click Browse Mods to add some.</p>';
    return;
  }

  for (const mod of mods) {
    const row = document.createElement('div');
    row.className = 'mod-row' + (mod.disabled ? ' off' : '');

    const icon = document.createElement('img');
    icon.className = 'mod-row-icon';
    if (mod.meta && mod.meta.icon) icon.src = mod.meta.icon;
    else icon.style.visibility = 'hidden';

    const info = document.createElement('div');
    info.className = 'mod-row-info';

    const titleRow = document.createElement('div');
    titleRow.className = 'mod-row-title';
    const titleText = document.createElement('span');
    titleText.className = 'title-text';
    titleText.textContent = mod.meta ? mod.meta.title : mod.name.replace(/\.jar(\.disabled)?$/, '');
    titleRow.appendChild(titleText);
    if (mod.meta) {
      const src = document.createElement('span');
      const cf = mod.meta.source === 'curseforge';
      src.className = 'source-badge' + (cf ? ' cf' : '');
      src.textContent = cf ? 'CurseForge' : 'Modrinth';
      titleRow.appendChild(src);
    }
    if (mod.disabled) {
      const off = document.createElement('span');
      off.className = 'off-badge';
      off.textContent = 'Disabled';
      titleRow.appendChild(off);
    }

    const desc = document.createElement('div');
    desc.className = 'mod-row-desc';
    desc.textContent = mod.meta && mod.meta.description ? mod.meta.description : mod.name;

    const ver = document.createElement('div');
    ver.className = 'mod-row-version';
    ver.textContent = `${mod.meta && mod.meta.versionNumber ? mod.meta.versionNumber + ' · ' : ''}${(mod.size / 1024 / 1024).toFixed(1)} MB`;

    info.append(titleRow, desc, ver);

    const controls = document.createElement('div');
    controls.className = 'mod-row-controls';

    const switchLabel = document.createElement('label');
    switchLabel.className = 'switch';
    switchLabel.title = mod.disabled ? 'Enable mod' : 'Disable mod (kept on disk, skipped at launch)';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !mod.disabled;
    const slider = document.createElement('span');
    slider.className = 'slider';
    switchLabel.append(checkbox, slider);
    checkbox.onchange = async () => {
      try {
        await feather.toggleMod({ profileId: p.id, name: mod.name });
        loadInstalledMods();
      } catch (err) {
        toast(cleanError(err), 'error');
        loadInstalledMods();
      }
    };

    const trash = document.createElement('button');
    trash.className = 'trash-btn';
    trash.title = 'Uninstall mod';
    trash.innerHTML = TRASH_SVG;
    trash.onclick = async () => {
      await feather.removeMod({ profileId: p.id, name: mod.name });
      toast(`Removed ${titleText.textContent}`, 'success');
      loadInstalledMods();
      renderProfilesPage();
    };

    controls.append(switchLabel, trash);
    row.append(icon, info, controls);
    listEl.appendChild(row);
  }
}

// ---------- launching ----------
const playBtn = $('btn-play');
const playLabel = $('play-label');
const playProgress = $('play-progress');
const statusEl = $('launch-status');

async function launchSelected() {
  if (state.launching || state.running) return;
  const p = selectedProfile();
  if (!p) {
    toast('Create a profile first', 'error');
    return;
  }
  if (p.loader === 'forge') {
    toast('Forge is temporarily disabled — coming back soon', 'error');
    return;
  }
  state.launching = true;
  playBtn.disabled = true;
  playLabel.textContent = 'PREPARING';
  try {
    await feather.launch({ profileId: p.id, ram: state.settings.ram });
  } catch (err) {
    toast(cleanError(err), 'error', 7000);
    resetPlayButton();
  }
}

playBtn.onclick = launchSelected;

function resetPlayButton() {
  state.launching = false;
  state.running = false;
  playBtn.disabled = false;
  playLabel.textContent = 'PLAY';
  playProgress.style.width = '0%';
  statusEl.textContent = '';
  updatePlayAvailability();
}

// Forge is temporarily disabled — gray out PLAY when a Forge profile is active.
function updatePlayAvailability() {
  if (state.launching || state.running) return;
  const p = selectedProfile();
  const forgeOff = p && p.loader === 'forge';
  playBtn.disabled = forgeOff;
  statusEl.textContent = forgeOff ? 'Forge profiles are temporarily disabled — coming back soon' : '';
}

feather.onLaunchStatus(({ stage, percent, message }) => {
  statusEl.textContent = message || '';
  playProgress.style.width = `${percent || 0}%`;
  if (stage === 'java') playLabel.textContent = 'JAVA';
  else if (stage === 'download' || stage === 'prepare') playLabel.textContent = 'DOWNLOADING';
  else if (stage === 'starting') playLabel.textContent = 'STARTING';
  else if (stage === 'running') {
    state.launching = false;
    state.running = true;
    playLabel.textContent = 'RUNNING';
    playProgress.style.width = '100%';
  }
});

feather.onLaunchClosed(({ code }) => {
  resetPlayButton();
  if (code && code !== 0) toast(`Minecraft exited with code ${code}`, 'error');
});

// ---------- settings ----------
const ramSlider = $('ram-slider');
ramSlider.oninput = () => {
  $('ram-value').textContent = `${ramSlider.value} GB`;
};
ramSlider.onchange = () => {
  state.settings.ram = Number(ramSlider.value);
  feather.setSettings({ ram: state.settings.ram });
};

$('btn-open-folder').onclick = () => feather.openFolder();

// ---------- init ----------
(async function init() {
  state.settings = await feather.getSettings();
  ramSlider.value = state.settings.ram;
  $('ram-value').textContent = `${state.settings.ram} GB`;
  state.selectedProfileId = state.settings.lastProfileId;

  await loadProfiles();

  const profile = await feather.restore();
  if (profile) {
    state.profile = profile;
    showApp();
  } else {
    showLogin();
  }
})();
