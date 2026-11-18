const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (fn) => ipcRenderer.on(channel, (_e, ...args) => fn(...args));

contextBridge.exposeInMainWorld('pip', {
  platform: process.platform,
  // pet window
  setIgnore: (b) => ipcRenderer.send('pet:ignore', b),
  dragStart: (x, y) => ipcRenderer.send('pet:drag-start', x, y),
  dragMove: (x, y) => ipcRenderer.send('pet:drag-move', x, y),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  contextMenu: () => ipcRenderer.send('pet:context'),
  resolveAlert: (a, action) => ipcRenderer.send('alert:resolve', a, action),
  onCursor: on('cursor'),
  onAlert: on('alert'),
  onAlertClear: on('alert:clear'),
  onAlertClearNote: on('alert:clear-note'),
  // shared
  openNotes: (mode) => ipcRenderer.send('notes:open', mode),
  // notes window
  getNotes: () => ipcRenderer.invoke('notes:get'),
  upsertNote: (n) => ipcRenderer.send('notes:upsert', n),
  removeNote: (id) => ipcRenderer.send('notes:remove', id),
  onNotesChanged: on('notes:changed'),
  onOpen: on('open')
});
