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
  onCursor: on('cursor'),
  // shared
  openNotes: (mode) => ipcRenderer.send('notes:open', mode),
  openExternal: (url) => ipcRenderer.send('app:open-external', url),
  // notes window
  getNotes: () => ipcRenderer.invoke('notes:get'),
  saveNote: (n) => ipcRenderer.invoke('notes:save', n),
  notesDragStart: (x, y) => ipcRenderer.send('notes:drag-start', x, y),
  notesDragMove: (x, y) => ipcRenderer.send('notes:drag-move', x, y),
  notesDragEnd: () => ipcRenderer.send('notes:drag-end'),
  notesResizeStart: (x, y) => ipcRenderer.send('notes:resize-start', x, y),
  notesResizeMove: (x, y) => ipcRenderer.send('notes:resize-move', x, y),
  notesResizeEnd: () => ipcRenderer.send('notes:resize-end'),
  notesMinimize: () => ipcRenderer.send('notes:minimize'),
  notesToggleMaximize: () => ipcRenderer.send('notes:toggle-maximize'),
  notesClose: () => ipcRenderer.send('notes:close'),
  removeNote: (id) => ipcRenderer.send('notes:remove', id),
  onNotesChanged: on('notes:changed'),
  onOpen: on('open')
});
