'use strict';

function validNote(note) {
  if (!note || typeof note !== 'object' || Array.isArray(note) || typeof note.id !== 'string') return false;
  if (note.kind !== 'note' && note.kind !== 'list') return false;
  if (note.items != null && !Array.isArray(note.items)) return false;
  return true;
}

function normalizeNotes(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(validNote).map(note => ({
    ...note,
    items: Array.isArray(note.items)
      ? note.items.filter(item => item && typeof item === 'object' && !Array.isArray(item) && typeof item.id === 'string')
      : []
  }));
}

function normalizeSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { x: null, y: null, visible: true };
  }
  return {
    x: Number.isFinite(value.x) ? value.x : null,
    y: Number.isFinite(value.y) ? value.y : null,
    visible: typeof value.visible === 'boolean' ? value.visible : true
  };
}

module.exports = { validNote, normalizeNotes, normalizeSettings };
