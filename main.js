const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { validNote, normalizeNotes, normalizeSettings } = require('./lib/app-data');

// ===== SIZE SETTINGS: change these two numbers =====
const SCALE = 0.7;     // Pip's size. 1 = original, 0.7 = 70%, 0.5 = half
const UI_SCALE = 0.8;  // size of the buttons and speech bubble. 1 = original
// ====================================================
const W = Math.round(Math.max(192 * SCALE, 290 * UI_SCALE) + 24);
const H = Math.round(179 * UI_SCALE + 208 * SCALE + 12);
const IS_LINUX = process.platform === 'linux';
const CAN_IGNORE = !IS_LINUX; // mouse click-through with forwarding is not supported on Linux

if (process.env.PIP_SMOKE_USER_DATA) app.setPath('userData', process.env.PIP_SMOKE_USER_DATA);
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
    return true;
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') console.error('temporary file cleanup failed', cleanupError);
    }
    console.error('write failed', e);
    return false;
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
      openNotes({ home: true });
      notesWin.webContents.once('did-finish-load', async () => {
        try {
          const ready = await notesWin.webContents.executeJavaScript(
            "document.body.dataset.notepadReady === 'true' && getComputedStyle(document.querySelector('#drag-handle')).getPropertyValue('-webkit-app-region') === 'no-drag' && getComputedStyle(document.querySelector('#case button')).getPropertyValue('-webkit-app-region') === 'no-drag' && document.querySelector('#chk[aria-label=\"Format as checkbox list\"]') && document.querySelector('#resize-handle')"
          );
          if (!notesWin.isMovable()) throw new Error('Notepad window is not movable.');
            if (!notesWin.isResizable()) throw new Error('Notepad window is not resizable.');
          const beforeDrag = notesWin.getBounds();
          await notesWin.webContents.executeJavaScript(
            "(() => { const handle = document.querySelector('#drag-handle'); handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, screenX: 100, screenY: 100 })); document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, pointerId: 1, screenX: 140, screenY: 130 })); document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, screenX: 140, screenY: 130 })); })()"
          );
          await new Promise(resolve => setTimeout(resolve, 250));
          const afterDrag = notesWin.getBounds();
          if (beforeDrag.x === afterDrag.x && beforeDrag.y === afterDrag.y) {
            throw new Error('Dragging the Notepad handle did not move the window.');
          }
          const beforeResize = notesWin.getBounds();
          await notesWin.webContents.executeJavaScript(
            "(() => { const handle = document.querySelector('#resize-handle'); handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 2, screenX: 100, screenY: 100 })); document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, pointerId: 2, screenX: 150, screenY: 150 })); document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 2, screenX: 150, screenY: 150 })); })()"
          );
          await new Promise(resolve => setTimeout(resolve, 250));
          const afterResize = notesWin.getBounds();
          const resizedCase = await notesWin.webContents.executeJavaScript(
            "({ width: document.querySelector('#case').getBoundingClientRect().width, scale: Number(document.querySelector('#stage').style.zoom) })"
          );
          if (afterResize.width <= beforeResize.width || afterResize.height <= beforeResize.height ||
              resizedCase.width <= 543 || resizedCase.scale <= 1) {
            throw new Error('Resizing the Notepad did not resize the visible notebook frame.');
          }
          await notesWin.webContents.executeJavaScript(
            "(() => { const handle = document.querySelector('#resize-handle'); handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 3, screenX: 150, screenY: 150 })); document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 0, pointerId: 3, screenX: 100, screenY: 100 })); document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 3, screenX: 100, screenY: 100 })); })()"
          );
          await new Promise(resolve => setTimeout(resolve, 250));
          const smallerCaseWidth = await notesWin.webContents.executeJavaScript(
            "document.querySelector('#case').getBoundingClientRect().width"
          );
          if (smallerCaseWidth >= resizedCase.width) {
            throw new Error('Shrinking the Notepad did not scale down the visible notebook frame.');
          }
          const notesOnly = await pet.webContents.executeJavaScript("!document.querySelector('[data-new=\"list\"]')");
          if (!ready || !notesOnly) throw new Error('Notepad renderer, drag regions, or notes-only menu did not initialize.');
          console.log('PIP_ELECTRON_SMOKE_READY');
          app.quit();
        } catch (error) {
          console.error('Electron smoke test failed', error);
          app.exit(1);
        }
      });
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
  let area = screen.getPrimaryDisplay().workArea;
  let x, y;
  if (pet) {
    const pb = pet.getBounds();
    area = screen.getDisplayMatching(pb).workArea;
    x = pb.x - 690;
    y = pb.y + H - 760;
  }
  const width = Math.min(670, area.width);
  const height = Math.min(750, area.height);
  x = Math.max(area.x, Math.min(x == null ? area.x + area.width - width - 20 : x, area.x + area.width - width));
  y = Math.max(area.y, Math.min(y == null ? area.y + area.height - height - 20 : y, area.y + area.height - height));
  notesWin = new BrowserWindow({
    width, height, minWidth: Math.min(360, width), minHeight: Math.min(440, height), x, y,
    title: "Pip's Notepad",
    frame: false, transparent: true, backgroundColor: '#00000000', autoHideMenuBar: true, movable: true, resizable: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  notesWin.setMenuBarVisibility(false);
  notesWin.loadFile(path.join(__dirname, 'notes', 'notepad.html'));
  notesWin.webContents.once('did-finish-load', () => { send(); notesWin && notesWin.show(); });
  notesWin.on('closed', () => { notesWin = null; notesDrag = null; });
}

let notesDrag = null;
let notesResize = null;
function isNotesDragRequest(event, x, y) {
  return notesWin && !notesWin.isDestroyed() && event.sender === notesWin.webContents &&
    Number.isFinite(x) && Number.isFinite(y);
}
ipcMain.on('notes:drag-start', (event, screenX, screenY) => {
  if (!isNotesDragRequest(event, screenX, screenY)) return;
  const bounds = notesWin.getBounds();
  notesDrag = { screenX, screenY, x: bounds.x, y: bounds.y };
});
ipcMain.on('notes:drag-move', (event, screenX, screenY) => {
  if (!notesDrag || !isNotesDragRequest(event, screenX, screenY)) return;
  notesWin.setPosition(
    Math.round(notesDrag.x + screenX - notesDrag.screenX),
    Math.round(notesDrag.y + screenY - notesDrag.screenY)
  );
});
ipcMain.on('notes:drag-end', event => {
  if (notesWin && event.sender === notesWin.webContents) notesDrag = null;
});
ipcMain.on('notes:resize-start', (event, screenX, screenY) => {
  if (!isNotesDragRequest(event, screenX, screenY)) return;
  const bounds = notesWin.getBounds();
  notesResize = { screenX, screenY, width: bounds.width, height: bounds.height };
});
ipcMain.on('notes:resize-move', (event, screenX, screenY) => {
  if (!notesResize || !isNotesDragRequest(event, screenX, screenY)) return;
  const area = screen.getDisplayMatching(notesWin.getBounds()).workArea;
  const width = Math.max(360, Math.min(area.width, Math.round(notesResize.width + screenX - notesResize.screenX)));
  const height = Math.max(440, Math.min(area.height, Math.round(notesResize.height + screenY - notesResize.screenY)));
  notesWin.setSize(width, height);
});
ipcMain.on('notes:resize-end', event => {
  if (notesWin && event.sender === notesWin.webContents) notesResize = null;
});
ipcMain.on('notes:minimize', event => {
  if (notesWin && event.sender === notesWin.webContents) notesWin.minimize();
});
ipcMain.on('notes:toggle-maximize', event => {
  if (!notesWin || event.sender !== notesWin.webContents) return;
  if (notesWin.isMaximized()) notesWin.unmaximize();
  else notesWin.maximize();
});
ipcMain.on('notes:close', event => {
  if (notesWin && event.sender === notesWin.webContents) notesWin.close();
});

/* ---------- notes data from the notes window ---------- */
ipcMain.handle('notes:get', () => notes);
function storeNote(n, sender) {
  if (!validNote(n) || n.kind !== 'note') return false;
  n.title = typeof n.title === 'string' ? n.title : '';
  n.text = typeof n.text === 'string' ? n.text : '';
  const i = notes.findIndex(x => x.id === n.id);
  const previous = i >= 0 ? notes[i] : null;
  if (i >= 0) notes[i] = n; else notes.push(n);
  if (!saveNotes()) {
    if (i >= 0) notes[i] = previous;
    else notes.pop();
    return false;
  }
  if (notesWin && (!sender || notesWin.webContents.id !== sender.id)) notesWin.webContents.send('notes:changed', notes);
  return true;
}
ipcMain.handle('notes:save', (e, n) => {
  if (!storeNote(n, e.sender)) throw new Error('Could not save this note. Check the app data folder and try again.');
});
ipcMain.on('notes:remove', (e, id) => {
  notes = notes.filter(n => n.id !== id);
  saveNotes();
  if (notesWin && notesWin.webContents.id !== e.sender.id) notesWin.webContents.send('notes:changed', notes);
});
ipcMain.on('notes:open', (e, mode) => openNotes(mode));
ipcMain.on('app:open-external', (e, value) => {
  let url;
  try { url = new URL(value); } catch { return; }
  if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return;
  shell.openExternal(url.href).catch(error => console.error('external link failed', error));
});

/* ---------- tray + menus ---------- */
function menuTemplate() {
  const login = IS_LINUX ? false : app.getLoginItemSettings().openAtLogin;
  const items = [
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
