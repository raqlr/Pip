'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { validNote, normalizeNotes, normalizeSettings } = require('../../lib/app-data');

test('validates notes and their item container', () => {
  assert.equal(validNote({ id: 'n1', kind: 'note' }), true);
  assert.equal(validNote({ id: 'n2', kind: 'list', items: [] }), true);
  assert.equal(validNote({ id: 'n3', kind: 'unknown' }), false);
  assert.equal(validNote({ id: 'n4', kind: 'list', items: {} }), false);
  assert.equal(validNote([{ id: 'n5', kind: 'list' }]), false);
});

test('normalizes stored notes and filters malformed notes and items', () => {
  const notes = normalizeNotes([
    { id: 'n1', kind: 'list', items: [{ id: 'i1' }, null, { id: 2 }, []] },
    { id: 'bad', kind: 'invalid' },
    null
  ]);
  assert.deepEqual(notes, [{ id: 'n1', kind: 'list', items: [{ id: 'i1' }] }]);
  assert.deepEqual(normalizeNotes({}), []);
});

test('normalizes settings to safe defaults', () => {
  assert.deepEqual(normalizeSettings({ x: 20, y: -10, visible: false }), {
    x: 20, y: -10, visible: false
  });
  assert.deepEqual(normalizeSettings({ x: '20', y: Infinity, visible: 0 }), {
    x: null, y: null, visible: true
  });
  assert.deepEqual(normalizeSettings(null), { x: null, y: null, visible: true });
});
