// Runs the actual Minecraft launch (minecraft-launcher-core) in an Electron
// utilityProcess so its file verification and download work can never freeze
// the launcher UI. Speaks to main via parentPort messages:
//   in:  { opts, loader, forgeInstaller }
//   out: { type: 'debug'|'data'|'progress'|'started'|'error'|'close', ... }
const path = require('path');
const { Client } = require('minecraft-launcher-core');

const post = (msg) => process.parentPort.postMessage(msg);

process.parentPort.once('message', (e) => {
  const { opts, loader, forgeInstaller } = e.data;
  const launcher = new Client();

  launcher.on('debug', (m) => post({ type: 'debug', line: String(m) }));
  launcher.on('data', (d) => post({ type: 'data', line: String(d) }));
  launcher.on('progress', (p) => post({ type: 'progress', task: p.task, total: p.total, kind: p.type }));

  // MLC puts the Forge *installer* jar on the classpath; modern Forge's JPMS
  // bootstrap chokes on its bundled jopt-simple (split package). Strip it —
  // legacy (LaunchWrapper) Forge keeps its classpath. Same fix as before the
  // worker split; see docs/agent/GOTCHAS.md #9.
  launcher.on('arguments', (args) => {
    if (loader !== 'forge' || !forgeInstaller) return;
    const i = args.indexOf('-cp');
    if (i === -1 || typeof args[i + 1] !== 'string') return;
    const mainClass = String(args[i + 2] || '');
    if (!/minecraftforge\.bootstrap|cpw\.mods/i.test(mainClass)) return;
    const installer = path.normalize(forgeInstaller).toLowerCase();
    const before = args[i + 1].split(';');
    const after = before.filter((p) => path.normalize(p).toLowerCase() !== installer);
    if (after.length !== before.length) {
      args[i + 1] = after.join(';');
      post({ type: 'debug', line: '[worker] removed Forge installer jar from modern Forge classpath' });
    }
  });

  launcher.on('close', (code) => {
    post({ type: 'close', code });
    setTimeout(() => process.exit(0), 150);
  });

  launcher.launch(opts)
    .then((proc) => post({ type: 'started', pid: (proc && proc.pid) || null }))
    .catch((err) => {
      post({ type: 'error', message: String((err && err.message) || err) });
      setTimeout(() => process.exit(0), 150);
    });
});
