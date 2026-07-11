const $ = (id) => document.getElementById(id);

$('btn-min').onclick = () => feather.winMinimize();
$('btn-close').onclick = () => feather.winClose();

const pane = $('log-pane');
const MAX_LINES = 2000;
let autoscroll = true;

$('chk-scroll').onchange = () => {
  autoscroll = $('chk-scroll').checked;
  if (autoscroll) pane.scrollTop = pane.scrollHeight;
};

function classify(line) {
  const l = line.toLowerCase();
  if (l.startsWith('[mlc]')) return 'mlc';
  if (l.includes('error') || l.includes('exception') || l.includes('fatal') || l.startsWith('[error]')) return 'err';
  if (l.includes('warn')) return 'warn';
  return '';
}

function append(line) {
  const div = document.createElement('div');
  div.className = `line ${classify(line)}`;
  div.textContent = line;
  pane.appendChild(div);
  while (pane.childElementCount > MAX_LINES) pane.firstChild.remove();
  if (autoscroll) pane.scrollTop = pane.scrollHeight;
}

// seed with whatever already happened before this window opened
feather.getGameLog().then((backlog) => {
  const lines = String(backlog || '').split('\n').filter(Boolean);
  pane.innerHTML = '';
  for (const l of lines) append(l);
}).catch(() => {});

feather.onGameLog(append);
feather.onGameLogReset(() => {
  pane.innerHTML = '';
  setState({ state: 'launching' });
});

const stateEl = $('state');
function setState({ state, code }) {
  stateEl.className = `state ${state}`;
  if (state === 'launching') stateEl.textContent = 'Launching';
  else if (state === 'running') stateEl.textContent = 'Running';
  else if (state === 'crashed') stateEl.textContent = code != null ? `Crashed (${code})` : 'Crashed';
  else stateEl.textContent = code != null ? `Exited (${code})` : 'Exited';
}
feather.onGameState(setState);

const GB = 1073741824;
feather.onGameStats(({ cpu, memUsed, memTotal }) => {
  $('stat-cpu').textContent = `${cpu}%`;
  $('stat-ram').textContent = `${(memUsed / GB).toFixed(1)} / ${(memTotal / GB).toFixed(0)} GB`;
});

$('btn-clear').onclick = () => {
  pane.innerHTML = '';
};

$('btn-copy').onclick = async () => {
  try {
    const log = await feather.getGameLog();
    await navigator.clipboard.writeText(log || '(no game output captured)');
    $('btn-copy').textContent = 'Copied!';
    setTimeout(() => {
      $('btn-copy').textContent = 'Copy';
    }, 1500);
  } catch {}
};
