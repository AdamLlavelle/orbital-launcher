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
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, ms);
}

function cleanError(err) {
  return String(err && err.message ? err.message : err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

// Shimmering placeholder rows shown while a list loads — same geometry as the
// real cards so nothing jumps when content lands.
function showSkeletons(el, count) {
  el.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const sk = document.createElement('div');
    sk.className = 'sk-item';
    sk.innerHTML =
      '<div class="skeleton sk-icon"></div>' +
      '<div class="sk-lines">' +
      '<div class="skeleton sk-line w60"></div>' +
      '<div class="skeleton sk-line w90"></div>' +
      '<div class="skeleton sk-line w35"></div>' +
      '</div>';
    el.appendChild(sk);
  }
}

// Inline error block with an optional Retry button — used wherever a list
// would otherwise silently stay empty or stuck on "Loading...".
function errorNote(message, retry) {
  const wrap = document.createElement('div');
  wrap.className = 'error-note';
  const p = document.createElement('p');
  p.textContent = message;
  wrap.appendChild(p);
  if (retry) {
    const b = document.createElement('button');
    b.className = 'ghost-button';
    b.textContent = 'Retry';
    b.onclick = retry;
    wrap.appendChild(b);
  }
  return wrap;
}

// ---------- connectivity ----------
window.addEventListener('offline', () =>
  toast("You're offline — browsing and installing won't work until you reconnect.", 'error', 6000));
window.addEventListener('online', () => toast('Back online', 'success'));

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

$('account-chip').onclick = () => openSkinEditor();

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
  loadAvatar(avatar, state.profile.uuid);
  $('account-chip').title = state.profile.name;
}

// mc-heads.net is a third-party service that occasionally fails; retry a
// couple times with a cache-buster before giving up so the chip isn't blank.
function loadAvatar(img, uuid, attempt = 0) {
  img.onerror = () => {
    if (attempt < 3) setTimeout(() => loadAvatar(img, uuid, attempt + 1), 1200 * (attempt + 1));
  };
  img.src = `https://mc-heads.net/avatar/${uuid}/64${attempt ? `?r=${attempt}` : ''}`;
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
  state.icons = data.icons || {};
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
    if (state.icons && state.icons[p.id]) {
      const icon = document.createElement('img');
      icon.className = 'profile-option-icon';
      icon.src = state.icons[p.id];
      opt.appendChild(icon);
    }
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
    if (state.icons && state.icons[p.id]) {
      const icon = document.createElement('img');
      icon.className = 'profile-card-icon';
      icon.src = state.icons[p.id];
      top.appendChild(icon);
    }
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
      }).catch(() => {}); // count is cosmetic — never break the card over it
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
// update info per mod, keyed by base filename (without .disabled) — filled
// by the automatic check that runs when a profile's detail view opens
let modUpdates = null;
let updatesCheckedFor = null; // profile id the current modUpdates belongs to

function resetUpdateState() {
  modUpdates = null;
  updatesCheckedFor = null;
  $('mod-update-status').classList.add('hidden');
  const btn = $('btn-update-all');
  btn.classList.add('hidden');
  btn.disabled = false;
  btn.textContent = 'Update all';
}

function renderUpdateStatus() {
  const status = $('mod-update-status');
  const btn = $('btn-update-all');
  const n = modUpdates ? Object.values(modUpdates).filter((u) => u.updateAvailable).length : 0;
  status.classList.remove('hidden');
  if (n) {
    status.textContent = `${n} update${n === 1 ? '' : 's'} available`;
    status.classList.add('avail');
    btn.classList.remove('hidden');
  } else {
    status.textContent = '✓ Up to date';
    status.classList.remove('avail');
    btn.classList.add('hidden');
  }
}

// Kicks off the background update check the first time a profile's mods are
// listed; later list refreshes (toggle/remove) reuse the cached result.
async function maybeAutoCheckUpdates(p, mods) {
  const status = $('mod-update-status');
  if (p.loader === 'vanilla' || !mods.length) {
    status.classList.add('hidden');
    $('btn-update-all').classList.add('hidden');
    return;
  }
  if (updatesCheckedFor === p.id && modUpdates) {
    renderUpdateStatus();
    return;
  }
  updatesCheckedFor = p.id;
  status.classList.remove('hidden', 'avail');
  status.textContent = 'Checking for updates...';
  $('btn-update-all').classList.add('hidden');
  try {
    const updates = await feather.checkModUpdates(p.id);
    if (state.viewProfile !== p || updatesCheckedFor !== p.id) return;
    modUpdates = Object.fromEntries(updates.map((u) => [u.base, u]));
    renderUpdateStatus();
    if (updates.some((u) => u.updateAvailable)) loadInstalledMods(); // paint row badges
  } catch {
    // quiet failure — the status chip just disappears; reopening retries
    if (state.viewProfile === p) {
      status.classList.add('hidden');
      updatesCheckedFor = null;
    }
  }
}

function openProfileDetail(profile) {
  state.viewProfile = profile;
  resetUpdateState();
  closeDrawer();
  $('profiles-view').classList.add('hidden');
  $('browse-view').classList.add('hidden');
  $('profile-detail-view').classList.remove('hidden');

  $('detail-name').textContent = profile.name;
  renderDetailIcon(profile);
  const badge = $('detail-badge');
  badge.className = `loader-badge ${profile.loader}`;
  badge.textContent = profile.loader;
  $('detail-version').textContent = `Minecraft ${profile.version}`;
  const descEl = $('detail-desc');
  descEl.textContent = profile.description || '';
  descEl.classList.toggle('hidden', !profile.description);
  const playBtnDetail = $('detail-play');
  playBtnDetail.disabled = false;
  playBtnDetail.title = '';
  loadInstalledMods();
}

// --- profile image (click = set/change, ✕ chip or right-click = remove) ---
function renderDetailIcon(profile) {
  const el = $('detail-icon');
  const url = state.icons && state.icons[profile.id];
  el.innerHTML = '';
  el.classList.toggle('has-image', !!url);
  $('detail-icon-remove').classList.toggle('hidden', !url);
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    el.appendChild(img);
    el.title = 'Click to change image';
  } else {
    el.textContent = '+';
    el.title = 'Add a profile image';
  }
}

$('detail-icon').onclick = async () => {
  const p = state.viewProfile;
  if (!p) return;
  try {
    const dataUrl = await feather.pickProfileIcon(p.id);
    if (dataUrl) {
      state.icons[p.id] = dataUrl;
      renderDetailIcon(p);
      renderProfilesPage();
      renderProfileDropdown();
      toast('Profile image set', 'success');
    }
  } catch (err) {
    toast(cleanError(err), 'error', 6000);
  }
};

async function removeDetailIcon() {
  const p = state.viewProfile;
  if (!p || !(state.icons && state.icons[p.id])) return;
  try {
    await feather.removeProfileIcon(p.id);
    delete state.icons[p.id];
    renderDetailIcon(p);
    renderProfilesPage();
    renderProfileDropdown();
    toast('Profile image removed', 'success');
  } catch (err) {
    toast(cleanError(err), 'error');
  }
}

$('detail-icon-remove').onclick = removeDetailIcon;
$('detail-icon').oncontextmenu = (e) => {
  e.preventDefault();
  removeDetailIcon();
};

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
$('detail-export').onclick = async () => {
  const p = state.viewProfile;
  if (!p) return;
  const btn = $('detail-export');
  btn.disabled = true;
  btn.textContent = 'Exporting...';
  try {
    const file = await feather.exportProfile(p.id);
    if (file) toast(`Exported "${p.name}"`, 'success');
  } catch (err) {
    toast(cleanError(err), 'error', 6000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Export';
  }
};

$('btn-import-profile').onclick = async () => {
  const btn = $('btn-import-profile');
  btn.disabled = true;
  btn.textContent = 'Importing...';
  try {
    const p = await feather.importProfile();
    if (p) {
      await loadProfiles();
      toast(`Imported "${p.name}"`, 'success');
    }
  } catch (err) {
    toast(cleanError(err), 'error', 6000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Import';
  }
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
let wizardIconData = null;    // data URL picked in step 1, applied after create

function renderWizardIcon() {
  const el = $('np-icon');
  el.innerHTML = '';
  el.classList.toggle('has-image', !!wizardIconData);
  $('np-icon-remove').classList.toggle('hidden', !wizardIconData);
  if (wizardIconData) {
    const img = document.createElement('img');
    img.src = wizardIconData;
    el.appendChild(img);
    el.title = 'Click to change image';
  } else {
    el.textContent = '+';
    el.title = 'Add a profile image';
  }
}

$('np-icon').onclick = async () => {
  try {
    const dataUrl = await feather.pickIconFile();
    if (dataUrl) {
      wizardIconData = dataUrl;
      renderWizardIcon();
    }
  } catch (err) {
    toast(cleanError(err), 'error', 6000);
  }
};

$('np-icon-remove').onclick = () => {
  wizardIconData = null;
  renderWizardIcon();
};

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
  wizardIconData = null;
  renderWizardIcon();
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
    } catch (err) {
      // stays null so the next wizard open retries instead of caching failure
      toast(cleanError(err), 'error');
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
  if (!advancedMode && !supportedVersions) {
    // the fetch failed when the wizard opened — offer an in-place retry
    list.appendChild(errorNote("Couldn't load the version list.", async () => {
      try {
        const { versions } = await feather.getSupportedVersions();
        supportedVersions = versions;
      } catch (err) {
        toast(cleanError(err), 'error');
      }
      renderVersionOptions();
    }));
    return;
  }
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
    if (wizardIconData) {
      await feather.setProfileIconData({ id: created.id, dataUrl: wizardIconData }).catch(() => {});
    }
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
  showSkeletons(resultsEl, 6);
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
    resultsEl.appendChild(errorNote(cleanError(err), fetchModPage));
    renderPager(0);
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
  showSkeletons(listEl, 4);
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
    listEl.appendChild(errorNote(cleanError(err), () => openVersionDrawer(hit)));
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
  showSkeletons(listEl, 3);
  let mods;
  try {
    mods = await feather.listMods(p.id, true); // with Modrinth metadata
  } catch (err) {
    if (state.viewProfile !== p) return;
    listEl.innerHTML = '';
    listEl.appendChild(errorNote(cleanError(err), loadInstalledMods));
    return;
  }
  if (state.viewProfile !== p) return; // user navigated away meanwhile
  $('installed-title').textContent = `Installed mods (${mods.length})`;
  maybeAutoCheckUpdates(p, mods);
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
    const upd = modUpdates && modUpdates[mod.name.replace(/\.disabled$/, '')];
    if (upd && upd.updateAvailable) {
      const badge = document.createElement('span');
      badge.className = 'update-badge';
      badge.textContent = `Update → ${upd.latestVersionNumber}`;
      badge.title = 'A newer version is available — use Update all above';
      titleRow.appendChild(badge);
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
      try {
        await feather.removeMod({ profileId: p.id, name: mod.name });
        toast(`Removed ${titleText.textContent}`, 'success');
      } catch (err) {
        toast(cleanError(err), 'error');
      }
      loadInstalledMods();
      renderProfilesPage();
    };

    controls.append(switchLabel, trash);
    row.append(icon, info, controls);
    listEl.appendChild(row);
  }
}

$('btn-update-all').onclick = async () => {
  const p = state.viewProfile;
  if (!p) return;
  const btn = $('btn-update-all');
  btn.disabled = true;
  btn.textContent = 'Updating...';
  try {
    const res = await feather.updateAllMods(p.id);
    if (res.updated.length) {
      toast(`Updated ${res.updated.length} mod${res.updated.length === 1 ? '' : 's'}`, 'success');
    }
    if (res.failed.length) {
      toast(`Couldn't update ${res.failed.map((f) => f.name).join(', ')}`, 'error', 7000);
    }
    resetUpdateState();
    loadInstalledMods(); // triggers a fresh auto-check → "Up to date"
    renderProfilesPage();
  } catch (err) {
    toast(cleanError(err), 'error', 6000);
    btn.disabled = false;
    btn.textContent = 'Update all';
  }
};

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

function updatePlayAvailability() {
  if (state.launching || state.running) return;
  playBtn.disabled = false;
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

feather.onLaunchClosed(({ code, crashed, startedOk, diagnosis }) => {
  resetPlayButton();
  if (!crashed) return;
  $('crash-title').textContent = startedOk ? 'Minecraft crashed' : "Minecraft couldn't start";
  $('crash-desc').textContent = diagnosis
    || `Minecraft exited unexpectedly (code ${code}). Copy the log for details — it usually names the mod at fault.`;
  $('crash-card').classList.remove('hidden');
});

const hideCrashCard = () => $('crash-card').classList.add('hidden');
$('crash-ok').onclick = hideCrashCard;
$('crash-dismiss').onclick = hideCrashCard;
$('crash-copy').onclick = async () => {
  try {
    const log = await feather.getGameLog();
    await navigator.clipboard.writeText(log || '(no game output captured)');
    toast('Game log copied to clipboard', 'success');
  } catch (err) {
    toast(cleanError(err), 'error');
  }
};

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

// game/launcher settings inputs → saved on change
function saveSetting(patch) {
  Object.assign(state.settings, patch);
  feather.setSettings(patch);
}
$('set-resw').onchange = () => saveSetting({ resW: Number($('set-resw').value) || null });
$('set-resh').onchange = () => saveSetting({ resH: Number($('set-resh').value) || null });
$('set-fullscreen').onchange = () => saveSetting({ fullscreen: $('set-fullscreen').checked });
$('set-minimize').onchange = () => saveSetting({ minimizeOnLaunch: $('set-minimize').checked });
$('set-showlogs').onchange = () => saveSetting({ showLogsOnLaunch: $('set-showlogs').checked });
$('set-javaargs').onchange = () => saveSetting({ javaArgs: $('set-javaargs').value.trim() });

$('btn-import-data').onclick = async () => {
  const btn = $('btn-import-data');
  btn.disabled = true;
  btn.textContent = 'Importing...';
  try {
    await feather.importOldData();
    toast('Imported worlds, servers, settings and packs from .minecraft', 'success');
  } catch (err) {
    toast(cleanError(err), 'error', 6000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Import';
  }
};

function bindSettingsInputs() {
  const s = state.settings;
  $('set-resw').value = s.resW || '';
  $('set-resh').value = s.resH || '';
  $('set-fullscreen').checked = !!s.fullscreen;
  $('set-minimize').checked = !!s.minimizeOnLaunch;
  $('set-showlogs').checked = s.showLogsOnLaunch !== false;
  $('set-javaargs').value = s.javaArgs || '';
}

// ---------- skin editor ----------
let skinViewer = null;
let skinVariant = 'classic';
let lastSkinData = null; // data URL of the currently loaded skin (for local model swaps)

function skinStatus(msg) {
  $('skin-status').textContent = msg || '';
}

async function openSkinEditor() {
  if (!state.profile) return;
  $('skin-overlay').classList.remove('hidden');
  if (!skinViewer) {
    skinViewer = new skinview3d.SkinViewer({
      canvas: $('skin-canvas'),
      width: 300,
      height: 440
    });
    skinViewer.animation = new skinview3d.WalkingAnimation();
    skinViewer.animation.speed = 0.55;
    skinViewer.autoRotate = true;
    skinViewer.autoRotateSpeed = 0.35;
    skinViewer.zoom = 0.85;
  }
  await refreshSkin();
  renderSkinLib();
}

// face thumbnail: base face (8,8,8,8) + hat overlay (40,8,8,8)
function faceThumb(dataUrl) {
  const c = document.createElement('canvas');
  c.width = 104;
  c.height = 104;
  const img = new Image();
  img.onload = () => {
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 8, 8, 8, 8, 0, 0, 104, 104);
    g.drawImage(img, 40, 8, 8, 8, 0, 0, 104, 104);
  };
  img.src = dataUrl;
  return c;
}

async function renderSkinLib() {
  const lib = $('skin-lib');
  let skins;
  try {
    skins = await feather.listSavedSkins();
  } catch (err) {
    lib.innerHTML = '';
    lib.appendChild(errorNote(cleanError(err), renderSkinLib));
    return;
  }
  lib.innerHTML = '';
  if (!skins.length) {
    lib.innerHTML = '<p class="skin-hint">No saved skins yet — upload one or hit Save Current Skin.</p>';
    return;
  }
  for (const s of skins) {
    const item = document.createElement('div');
    item.className = 'skin-item';
    item.title = `Apply this skin (${s.variant})`;
    item.appendChild(faceThumb(s.dataUrl));
    const del = document.createElement('button');
    del.className = 'skin-del';
    del.textContent = '✕';
    del.title = 'Remove from saved skins';
    del.onclick = async (e) => {
      e.stopPropagation();
      try {
        await feather.deleteSavedSkin(s.id);
      } catch (err) {
        toast(cleanError(err), 'error');
      }
      renderSkinLib();
    };
    item.appendChild(del);
    item.onclick = async () => {
      skinStatus('Applying skin...');
      try {
        await feather.applySavedSkin(s.id);
        await refreshSkin();
        skinStatus('Skin applied!');
      } catch (err) {
        skinStatus('');
        toast(cleanError(err), 'error', 6000);
      }
    };
    lib.appendChild(item);
  }
}

$('skin-save-current').onclick = async () => {
  skinStatus('Saving current skin...');
  try {
    await feather.saveCurrentSkin();
    await renderSkinLib();
    skinStatus('Saved.');
  } catch (err) {
    skinStatus('');
    toast(cleanError(err), 'error');
  }
};

function syncVariantPills() {
  document.querySelectorAll('#skin-variant-pills .pill').forEach((p) => {
    p.classList.toggle('active', p.dataset.variant === skinVariant);
  });
}

async function refreshSkin() {
  skinStatus('');
  $('skin-sub').textContent = 'Loading your skin...';
  try {
    const skin = await feather.getSkin();
    skinVariant = skin.variant;
    lastSkinData = skin.skinData || null;
    syncVariantPills();
    if (lastSkinData) {
      await skinViewer.loadSkin(lastSkinData, { model: skinVariant === 'slim' ? 'slim' : 'default' });
    }
    $('skin-sub').textContent = `${skin.name} · drag to rotate`;
  } catch (err) {
    $('skin-sub').textContent = 'Could not load skin';
    toast(cleanError(err), 'error');
  }
}

$('skin-close').onclick = () => $('skin-overlay').classList.add('hidden');
$('skin-overlay').onclick = (e) => {
  if (e.target === $('skin-overlay')) $('skin-overlay').classList.add('hidden');
};

let variantBusy = false;
document.querySelectorAll('#skin-variant-pills .pill').forEach((pill) => {
  pill.onclick = async () => {
    const next = pill.dataset.variant;
    if (next === skinVariant || variantBusy) return;
    variantBusy = true;
    const prev = skinVariant;
    skinVariant = next;
    syncVariantPills(); // optimistic
    skinStatus('Switching model...');
    // The skin bytes don't change — just re-render the 3D model locally,
    // no network needed for the preview.
    if (lastSkinData) {
      try { await skinViewer.loadSkin(lastSkinData, { model: next === 'slim' ? 'slim' : 'default' }); } catch {}
    }
    try {
      await feather.setSkinVariant(next);
      skinStatus('Model updated.');
    } catch (err) {
      skinVariant = prev; // roll back on failure
      syncVariantPills();
      if (lastSkinData) {
        try { await skinViewer.loadSkin(lastSkinData, { model: prev === 'slim' ? 'slim' : 'default' }); } catch {}
      }
      skinStatus('');
      toast(cleanError(err), 'error', 6000);
    } finally {
      variantBusy = false;
    }
  };
});

$('skin-upload').onclick = async () => {
  const file = await feather.pickSkinFile();
  if (!file) return;
  const btn = $('skin-upload');
  btn.disabled = true;
  skinStatus('Uploading skin...');
  try {
    await feather.uploadSkin({ filePath: file, variant: skinVariant });
    await refreshSkin();
    renderSkinLib();
    skinStatus('Skin updated! (Your in-launcher avatar may take a while to refresh.)');
    toast('Skin uploaded to your Minecraft account', 'success');
  } catch (err) {
    skinStatus('');
    toast(cleanError(err), 'error', 7000);
  } finally {
    btn.disabled = false;
  }
};

// ---------- auto-update ----------
let updateReady = false;
let updateChecking = false;

function showUpdateCard() { $('update-card').classList.remove('hidden'); }
function hideUpdateCard() { $('update-card').classList.add('hidden'); }

feather.onUpdateAvailable(({ version }) => {
  updateChecking = false;
  $('update-title').textContent = `Update available — ${version}`;
  $('update-desc').textContent = 'A newer version of Orbital is ready to install.';
  $('update-progress-wrap').classList.add('hidden');
  $('update-actions').classList.remove('hidden');
  $('update-now').textContent = 'Update';
  $('update-now').disabled = false;
  showUpdateCard();
});

feather.onUpdateProgress(({ percent }) => {
  $('update-progress-wrap').classList.remove('hidden');
  $('update-progress-bar').style.width = `${percent}%`;
  $('update-desc').textContent = `Downloading update... ${percent}%`;
});

feather.onUpdateReady(() => {
  updateReady = true;
  $('update-title').textContent = 'Update ready';
  $('update-desc').textContent = 'Restart Orbital to finish installing.';
  $('update-progress-wrap').classList.add('hidden');
  $('update-actions').classList.remove('hidden');
  $('update-now').textContent = 'Restart Now';
  $('update-now').disabled = false;
  showUpdateCard();
});

feather.onUpdateNone(() => {
  updateChecking = false;
  if (manualCheck) {
    toast('You’re on the latest version', 'success');
    manualCheck = false;
  }
});

feather.onUpdateError(({ message }) => {
  updateChecking = false;
  if (manualCheck) {
    toast('Update check failed: ' + message, 'error');
    manualCheck = false;
  }
});

$('update-now').onclick = () => {
  if (updateReady) {
    feather.installUpdate();
    return;
  }
  $('update-now').disabled = true;
  $('update-actions').classList.add('hidden');
  $('update-progress-wrap').classList.remove('hidden');
  $('update-desc').textContent = 'Starting download...';
  feather.downloadUpdate();
};
$('update-later').onclick = hideUpdateCard;
$('update-dismiss').onclick = hideUpdateCard;

// manual check from Settings
let manualCheck = false;
const checkBtn = $('btn-check-update');
if (checkBtn) {
  checkBtn.onclick = async () => {
    manualCheck = true;
    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking...';
    try {
      const res = await feather.checkUpdate();
      if (res && res.dev) {
        manualCheck = false;
        toast('Updates only work in the installed app, not the dev build', 'info');
      } else if (res && res.error) {
        manualCheck = false;
        toast('Update check failed: ' + res.error, 'error');
      }
      // otherwise the update:available / update:none events handle the result
    } catch (err) {
      manualCheck = false;
      toast('Update check failed', 'error');
    } finally {
      checkBtn.disabled = false;
      checkBtn.textContent = 'Check for Updates';
    }
  };
}

// ---------- init ----------
async function boot() {
  state.settings = await feather.getSettings();
  ramSlider.value = state.settings.ram;
  $('ram-value').textContent = `${state.settings.ram} GB`;
  bindSettingsInputs();
  state.selectedProfileId = state.settings.lastProfileId;

  // Profiles and the Microsoft session refresh don't depend on each other —
  // loading them in parallel shaves the slow network hop off perceived boot.
  const [, profile] = await Promise.all([loadProfiles(), feather.restore()]);
  if (profile) {
    state.profile = profile;
    showApp();
  } else {
    showLogin();
  }
}

(async function init() {
  feather.getAppVersion().then((v) => { $('version-badge').textContent = `v${v}`; }).catch(() => {});
  $('boot-retry').onclick = async () => {
    $('boot-error').classList.add('hidden');
    try {
      await boot();
    } catch (err) {
      $('boot-error-msg').textContent = cleanError(err);
      $('boot-error').classList.remove('hidden');
    }
  };
  try {
    await boot();
  } catch (err) {
    // Without this, a single startup failure = permanent blank window.
    console.error('boot failed:', err);
    $('boot-error-msg').textContent = cleanError(err);
    $('boot-error').classList.remove('hidden');
  }
})();
