const { app, BrowserWindow, Tray, Menu, ipcMain, screen, Notification, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { validNote, normalizeNotes, normalizeSettings, reminderDueMs } = require('./lib/app-data');

// ===== SIZE SETTINGS: change these two numbers =====
const SCALE = 0.7;     // Pip's size. 1 = original, 0.7 = 70%, 0.5 = half
const UI_SCALE = 0.8;  // size of the buttons and speech bubble. 1 = original
// ====================================================
const W = Math.round(Math.max(192 * SCALE, 290 * UI_SCALE) + 24);
const H = Math.round(179 * UI_SCALE + 208 * SCALE + 12);
const IS_LINUX = process.platform === 'linux';
const CAN_IGNORE = !IS_LINUX; // mouse click-through with forwarding is not supported on Linux

if (!app.requestSingleInstanceLock()) { app.quit(); }

let pet = null, notesWin = null, tray = null;
let notes = [];
let settings = { x: null, y: null, visible: true };

/* ---------- storage ---------- */
const notesFile = () => path.join(app.getPath('userData'), 'notes.json');
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function writeAtomic(file, data) {
  const tmp = file + '.tmp';
  try {
    fs.writeFileSync(tmp, data, { encoding: 'utf8', mode: 0o600 });
    try {
      fs.renameSync(tmp, file);
    } catch (e) {
      if (process.platform !== 'win32') throw e;
      try { fs.unlinkSync(file); } catch (unlinkError) {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      }
      fs.renameSync(tmp, file);
    }
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') console.error('temporary file cleanup failed', cleanupError);
    }
    console.error('write failed', e);
  }
}
function loadAll() {
  try {
    const parsedNotes = JSON.parse(fs.readFileSync(notesFile(), 'utf8'));
    notes = normalizeNotes(parsedNotes);
  } catch (e) {
    notes = [];
    if (e.code !== 'ENOENT') console.error('notes load failed', e);
  }
  try {
    const parsedSettings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    settings = normalizeSettings(parsedSettings);
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('settings load failed', e);
  }
}
const saveNotes = () => writeAtomic(notesFile(), JSON.stringify(notes));
const saveSettings = () => writeAtomic(settingsFile(), JSON.stringify(settings));

/* ---------- pet window ---------- */
function startPosition() {
  const wa = screen.getPrimaryDisplay().workArea;
  let x = wa.x + wa.width - W - 24, y = wa.y + wa.height - H + 12;
  if (settings.x != null && settings.y != null) {
    const d = screen.getDisplayMatching({ x: settings.x, y: settings.y, width: W, height: H });
    const b = d.workArea;
    if (settings.x + W > b.x && settings.x < b.x + b.width && settings.y + H > b.y && settings.y < b.y + b.height) {
      x = settings.x; y = settings.y;
    }
  }
  return { x, y };
}

function createPet() {
  const { x, y } = startPosition();
  pet = new BrowserWindow({
    width: W, height: H, x, y,
    transparent: true, frame: false, resizable: false, movable: false,
    hasShadow: false, skipTaskbar: true, alwaysOnTop: true, show: false,
    focusable: IS_LINUX,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  pet.setAlwaysOnTop(true, 'screen-saver');
  pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (CAN_IGNORE) pet.setIgnoreMouseEvents(true, { forward: true });
  pet.loadFile(path.join(__dirname, 'pet', 'pet.html'), { query: { s: String(SCALE), u: String(UI_SCALE) } });
  pet.once('ready-to-show', () => {
    if (settings.visible) pet.showInactive();
    if (process.env.PIP_SMOKE_TEST === '1') {
      console.log('PIP_ELECTRON_SMOKE_READY');
      setTimeout(() => app.quit(), 0);
    }
  });
  pet.on('closed', () => { pet = null; });
}

function setPetVisible(v) {
  settings.visible = v; saveSettings();
  if (!pet) return;
  if (v) pet.showInactive(); else pet.hide();
  refreshTray();
}

/* ---------- drag ---------- */
let dragStart = null;
ipcMain.on('pet:ignore', (e, ignore) => {
  if (pet && CAN_IGNORE) pet.setIgnoreMouseEvents(!!ignore, { forward: true });
});
ipcMain.on('pet:drag-start', (e, sx, sy) => {
  if (!pet) return;
  const b = pet.getBounds();
  dragStart = { sx, sy, x: b.x, y: b.y };
});
ipcMain.on('pet:drag-move', (e, sx, sy) => {
  if (!pet || !dragStart) return;
  pet.setBounds({ x: Math.round(dragStart.x + sx - dragStart.sx), y: Math.round(dragStart.y + sy - dragStart.sy), width: W, height: H });
});
ipcMain.on('pet:drag-end', () => {
  if (!pet || !dragStart) return;
  dragStart = null;
  const b = pet.getBounds();
  settings.x = b.x; settings.y = b.y; saveSettings();
});

/* ---------- cursor following ---------- */
let lastCx = -1, lastCy = -1;
setInterval(() => {
  if (!pet || pet.isDestroyed() || !pet.isVisible()) return;
  const p = screen.getCursorScreenPoint();
  if (p.x === lastCx && p.y === lastCy) return;
  lastCx = p.x; lastCy = p.y;
  const b = pet.getBounds();
  pet.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y });
}, 70);

/* ---------- notes window ---------- */
function openNotes(mode) {
  const send = () => { if (notesWin && mode) notesWin.webContents.send('open', mode); };
  if (notesWin) {
    if (notesWin.isMinimized()) notesWin.restore();
    notesWin.show(); notesWin.focus(); send();
    return;
  }
  const dark = nativeTheme.shouldUseDarkColors;
  let x, y;
  if (pet) {
    const pb = pet.getBounds();
    const d = screen.getDisplayMatching(pb).workArea;
    x = pb.x - 480; if (x < d.x) x = Math.min(pb.x + W, d.x + d.width - 470);
    y = Math.max(d.y + 10, Math.min(pb.y + H - 660, d.y + d.height - 660));
  }
  notesWin = new BrowserWindow({
    width: 460, height: 640, minWidth: 360, minHeight: 440, x, y,
    title: "Pip's Notepad",
    backgroundColor: dark ? '#0D1322' : '#E8EEF7', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  notesWin.setMenuBarVisibility(false);
  notesWin.loadFile(path.join(__dirname, 'notes', 'notes.html'));
  notesWin.webContents.once('did-finish-load', () => { send(); notesWin && notesWin.show(); });
  notesWin.on('closed', () => { notesWin = null; });
}

/* ---------- notes data from the notes window ---------- */
ipcMain.handle('notes:get', () => notes);
ipcMain.on('notes:upsert', (e, n) => {
  if (!validNote(n)) return;
  n.items = Array.isArray(n.items) ? n.items.filter(it => it && typeof it === 'object' && typeof it.id === 'string') : [];
  n.title = typeof n.title === 'string' ? n.title : '';
  n.text = typeof n.text === 'string' ? n.text : '';
  n.date = typeof n.date === 'string' ? n.date : '';

  const old = notes.find(x => x.id === n.id);
  if (old && Array.isArray(n.items)) {
    n.items.forEach(it => {
      const o = (old.items || []).find(i => i.id === it.id);
      // keep reminder state set by the reminder timer when the user did not change the time
      if (o && o.time === it.time && !!o.remind === !!it.remind && old.date === n.date) {
        it.fired = o.fired || it.fired;
        it.snooze = o.snooze || 0;
      }
    });
  }
  const i = notes.findIndex(x => x.id === n.id);
  if (i >= 0) notes[i] = n; else notes.push(n);
  saveNotes();
  (n.items || []).forEach(it => { if (it.done && pet) pet.webContents.send('alert:clear', it.id); });
});
ipcMain.on('notes:remove', (e, id) => {
  notes = notes.filter(n => n.id !== id);
  saveNotes();
  if (pet) pet.webContents.send('alert:clear-note', id);
});
ipcMain.on('notes:open', (e, mode) => openNotes(mode));

/* ---------- reminders ---------- */
const dueMs = (n, it) => reminderDueMs(n.date, it.time);
function tick() {
  const now = Date.now();
  let changed = false;
  for (const n of notes) {
    if (n.kind !== 'list' || !Array.isArray(n.items)) continue;
    for (const it of n.items) {
      if (it.done || !it.remind || !it.time || it.fired) continue;
      const t = it.snooze || dueMs(n, it);
      if (isNaN(t) || now < t) continue;
      it.fired = true; it.snooze = 0; changed = true;
      if (now - t <= 45 * 60000) fire(n, it);
    }
  }
  if (changed) {
    saveNotes();
    if (notesWin) notesWin.webContents.send('notes:changed', notes);
  }
}
function fire(n, it) {
  try {
    if (Notification.isSupported()) new Notification({ title: 'Pip', body: `${it.time}  ${it.text || 'Reminder'}`, silent: false }).show();
  } catch (e) {
    console.error('notification failed', e);
  }
  if (pet) {
    if (!pet.isVisible()) pet.showInactive();
    pet.webContents.send('alert', { noteId: n.id, itemId: it.id, time: it.time, text: it.text || 'Reminder' });
  }
}
ipcMain.on('alert:resolve', (e, a, action) => {
  const n = notes.find(x => x.id === a.noteId);
  const it = n && n.items.find(i => i.id === a.itemId);
  if (!it) return;
  if (action === 'done') it.done = true;
  if (action === 'snooze') { it.snooze = Date.now() + 10 * 60000; it.fired = false; }
  n.updated = Date.now();
  saveNotes();
  if (notesWin) notesWin.webContents.send('notes:changed', notes);
});

/* ---------- tray + menus ---------- */
function menuTemplate() {
  const login = IS_LINUX ? false : app.getLoginItemSettings().openAtLogin;
  const items = [
    { label: 'New checklist', click: () => openNotes({ new: 'list' }) },
    { label: 'New note', click: () => openNotes({ new: 'note' }) },
    { label: 'Open my notes', click: () => openNotes({ home: true }) },
    { type: 'separator' },
    { label: 'Show Pip', type: 'checkbox', checked: !!(pet && pet.isVisible()), click: (i) => setPetVisible(i.checked) }
  ];
  if (!IS_LINUX) {
    items.push({ label: 'Start Pip when I log in', type: 'checkbox', checked: login, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) });
  }
  items.push(
    { label: 'Bring Pip to this screen', click: () => movePetToCursorScreen() },
    { type: 'separator' },
    { label: 'Quit Pip', click: () => app.quit() }
  );
  return items;
}
function refreshTray() { if (tray) tray.setContextMenu(Menu.buildFromTemplate(menuTemplate())); }
function movePetToCursorScreen() {
  if (!pet) return;
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const x = d.x + d.width - W - 24, y = d.y + d.height - H + 12;
  pet.setBounds({ x, y, width: W, height: H });
  settings.x = x; settings.y = y; settings.visible = true; saveSettings();
  pet.showInactive();
}
function createTray() {
  let img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  if (process.platform === 'darwin') img = img.resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip('Pip');
  refreshTray();
  tray.on('click', () => openNotes({ home: true }));
  tray.on('right-click', refreshTray);
}
ipcMain.on('pet:context', () => {
  if (pet) Menu.buildFromTemplate(menuTemplate()).popup({ window: pet });
});

/* ---------- app lifecycle ---------- */
app.on('second-instance', () => { if (pet && !pet.isVisible()) setPetVisible(true); });
app.on('activate', () => {
  if (process.platform === 'darwin' && pet && !pet.isVisible()) setPetVisible(true);
});
app.on('window-all-closed', () => { /* keep running in the tray */ });
app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  loadAll();
  createPet();
  createTray();
  setInterval(tick, 10000);
  setTimeout(tick, 1500);
  function repositionForDisplays() {
    if (!pet) return;
    const d = screen.getDisplayMatching(pet.getBounds()).workArea;
    const bounds = pet.getBounds();
    const x = Math.max(d.x, Math.min(bounds.x, d.x + d.width - W));
    const y = Math.max(d.y, Math.min(bounds.y, d.y + d.height - H));
    pet.setBounds({ x, y, width: W, height: H });
    settings.x = x; settings.y = y; saveSettings();
    if (notesWin) {
      const n = notesWin.getBounds();
      notesWin.setBounds({
        x: Math.max(d.x, Math.min(n.x, d.x + d.width - n.width)),
        y: Math.max(d.y, Math.min(n.y, d.y + d.height - n.height)),
        width: n.width,
        height: n.height
      });
    }
  }
  screen.on('display-added', repositionForDisplays);
  screen.on('display-removed', repositionForDisplays);
  screen.on('display-metrics-changed', repositionForDisplays);
});
