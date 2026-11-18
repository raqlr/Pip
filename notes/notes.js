(function () {
'use strict';
var api = window.pip;
var sheet = document.getElementById('sheet');

/* ---------- helpers ---------- */
function h(tag, props) {
  var e = document.createElement(tag), p = props || {};
  Object.keys(p).forEach(function (k) {
    var v = p[k];
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  });
  for (var i = 2; i < arguments.length; i++) {
    var c = arguments[i];
    if (c == null) continue;
    if (Array.isArray(c)) c.forEach(function (x) { e.append(x); });
    else e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}
var ICONS = {
  back: '<path d="M20 12H5M11 6l-6 6 6 6"/>',
  bell: '<path d="M6 17v-6a6 6 0 0112 0v6l2 2H4zM10 21h4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>'
};
function icon(n, size) {
  var s = document.createElement('span'); s.style.display = 'inline-grid';
  s.innerHTML = '<svg viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) + '" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true">' + ICONS[n] + '</svg>';
  return s;
}
function uid() { return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function today() { return new Date().toLocaleDateString('sv-SE'); }
function hhmm(ms) { return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
function shortDate(s) { return new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }

/* ---------- data ---------- */
var notes = new Map(), view = 'home', cur = null, statusEl = null;
function norm(r) {
  var n = JSON.parse(JSON.stringify(r));
  n.kind = n.kind === 'list' ? 'list' : 'note';
  n.title = n.title || ''; n.text = n.text || ''; n.date = n.date || today();
  n.items = Array.isArray(n.items) ? n.items : [];
  n.items.forEach(function (i) {
    i.id = i.id || uid(); i.text = i.text || ''; i.time = i.time || '';
    i.done = !!i.done; i.remind = !!i.remind; i.fired = !!i.fired; i.snooze = +i.snooze || 0;
  });
  n.created = n.created || Date.now(); n.updated = n.updated || n.created;
  return n;
}
var timers = {};
function setStatus(saving) {
  if (!statusEl) return;
  statusEl.className = 'status' + (saving ? ' saving' : '');
  statusEl.textContent = saving ? 'Saving…' : 'Saved';
}
function touch(n) {
  n.updated = Date.now(); setStatus(true);
  clearTimeout(timers[n.id]);
  timers[n.id] = setTimeout(function () { api.upsertNote(n); setStatus(false); }, 350);
}
function flushNow(n) { clearTimeout(timers[n.id]); api.upsertNote(n); }
function removeNote(id) {
  clearTimeout(timers[id]); notes.delete(id); api.removeNote(id);
}

/* ---------- home ---------- */
function isLate(n, it) { return !it.done && it.time && new Date(n.date + 'T' + it.time + ':00').getTime() < Date.now(); }
function nextTime(n) {
  if (n.date !== today()) return '';
  var now = Date.now(), best = '';
  n.items.forEach(function (it) {
    if (it.done || !it.time || !it.remind) return;
    if (new Date(n.date + 'T' + it.time + ':00').getTime() > now && (!best || it.time < best)) best = it.time;
  });
  return best;
}
function whenLabel(n) {
  if (n.kind === 'list') return n.date === today() ? 'Today' : shortDate(n.date);
  var d = new Date(n.updated);
  return d.toLocaleDateString('sv-SE') === today() ? hhmm(n.updated) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function row(n) {
  var isList = n.kind === 'list', meta;
  if (isList) {
    var d = n.items.filter(function (i) { return i.done; }).length;
    meta = n.items.length ? d + ' of ' + n.items.length + ' done' : 'No tasks yet';
    var nx = nextTime(n); if (nx) meta += ' · next at ' + nx;
  } else meta = (n.text || '').trim().replace(/\s+/g, ' ').slice(0, 90) || 'Empty note';
  return h('button', { class: 'row', type: 'button', onclick: function () { openNote(n.id); } },
    h('span', { class: 'tag ' + (isList ? 't-list' : 't-note'), text: isList ? 'List' : 'Note' }),
    h('span', { class: 'r-main' },
      h('span', { class: 'r-title', text: n.title || (isList ? 'Untitled list' : 'Untitled note') }),
      h('span', { class: 'r-meta', text: meta })),
    h('span', { class: 'r-when', text: whenLabel(n) }));
}
function renderHome() {
  view = 'home'; cur = null; statusEl = null;
  sheet.replaceChildren();
  var list = Array.from(notes.values()).sort(function (a, b) { return b.updated - a.updated; });
  sheet.append(h('div', { class: 'head' }, h('h2', { text: 'On the desk' }),
    h('span', { class: 'count', text: list.length ? list.length + (list.length === 1 ? ' note' : ' notes') : '' })));
  if (!list.length) {
    sheet.append(h('div', { class: 'welcome' },
      h('h3', { text: 'Nothing here yet' }),
      h('p', { text: 'Hover over Pip on your desktop and pick a checklist or a blank note, or use the buttons above.' }),
      h('p', { class: 'muted', text: 'Checklists can have a time and a reminder for each task. Pip rings even when this window is closed.' })));
  } else {
    var ul = h('ul', { class: 'deck' });
    list.forEach(function (n) { ul.append(h('li', {}, row(n))); });
    sheet.append(ul);
  }
}

/* ---------- editor ---------- */
function newNote(kind) {
  leaveCurrent();
  var now = Date.now();
  var n = { id: uid(), kind: kind, title: '', text: '', date: today(), items: [], created: now, updated: now };
  notes.set(n.id, n);
  openNote(n.id);
}
function isEmpty(n) {
  return n.kind === 'list' ? (!n.title.trim() && !n.items.length) : (!n.title.trim() && !n.text.trim());
}
function leaveCurrent() {
  if (view !== 'edit' || !cur) return;
  var n = notes.get(cur);
  if (n && isEmpty(n)) removeNote(cur); else if (n) flushNow(n);
}
function closeEditor() { leaveCurrent(); renderHome(); }

function openNote(id, keepFocus) {
  var n = notes.get(id); if (!n) return;
  cur = id; view = 'edit';
  sheet.replaceChildren();

  var delBtn = h('button', { class: 'ghost danger', type: 'button', text: 'Delete' }), delT = 0;
  delBtn.addEventListener('click', function () {
    if (!delBtn.classList.contains('confirm')) {
      delBtn.classList.add('confirm'); delBtn.textContent = 'Click again to delete';
      delT = setTimeout(function () { delBtn.classList.remove('confirm'); delBtn.textContent = 'Delete'; }, 4000);
      return;
    }
    clearTimeout(delT); removeNote(id); renderHome();
  });
  statusEl = h('span', { class: 'status', role: 'status', text: 'Saved' });
  sheet.append(h('div', { class: 'ed-bar' },
    h('button', { class: 'ghost', type: 'button', onclick: closeEditor }, icon('back', 16), 'Desk'),
    statusEl, delBtn));

  var title = h('input', { class: 'ed-title', type: 'text', maxlength: '120', 'aria-label': 'Title', placeholder: n.kind === 'list' ? "Today's list" : 'Untitled note' });
  title.value = n.title;
  title.addEventListener('input', function () { n.title = title.value; touch(n); });
  sheet.append(title);
  if (n.kind === 'list') buildList(n, title, keepFocus); else buildNote(n, title, keepFocus);
}

function buildNote(n, title, keepFocus) {
  var ta = h('textarea', { class: 'ed-body', 'aria-label': 'Note', placeholder: 'Start writing…' });
  ta.value = n.text;
  var wc = h('p', { class: 'muted' });
  function size() { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, window.innerHeight * 0.45) + 'px'; }
  function words() { var t = n.text.trim(); var c = t ? t.split(/\s+/).length : 0; wc.textContent = c + (c === 1 ? ' word' : ' words'); }
  ta.addEventListener('input', function () { n.text = ta.value; size(); words(); touch(n); });
  sheet.append(ta, wc);
  words(); setTimeout(size, 0);
  window.addEventListener('resize', size);
  if (!keepFocus) (n.title || n.text ? ta : title).focus();
}

var refreshLate = function () {};
function buildList(n, title, keepFocus) {
  var dateIn = h('input', { class: 'field', type: 'date', 'aria-label': 'Day' }); dateIn.value = n.date;
  dateIn.addEventListener('change', function () {
    if (!dateIn.value) return;
    n.date = dateIn.value;
    n.items.forEach(function (i) { i.fired = false; i.snooze = 0; });
    touch(n); renderItems();
  });
  var sortBtn = h('button', { class: 'ghost sort', type: 'button', text: 'Sort by time', onclick: function () {
    var timed = n.items.filter(function (i) { return i.time; }).sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
    var rest = n.items.filter(function (i) { return !i.time; });
    n.items = timed.concat(rest); touch(n); renderItems();
  } });
  sheet.append(h('div', { class: 'meta-row' }, h('label', {}, 'Day', dateIn), sortBtn));

  var itemsEl = h('ul', { class: 'items' });
  sheet.append(itemsEl);

  var addText = h('input', { class: 'field add-text', type: 'text', maxlength: '200', 'aria-label': 'New task', placeholder: 'Add a task and press Enter' });
  var addTime = h('input', { class: 'field add-time', type: 'time', 'aria-label': 'Time for the new task (optional)' });
  var form = h('form', { class: 'add' }, addText, addTime, h('button', { class: 'btn', type: 'submit', text: 'Add' }));
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var t = addText.value.trim();
    if (!t) { addText.focus(); return; }
    n.items.push({ id: uid(), text: t, done: false, time: addTime.value || '', remind: !!addTime.value, fired: false, snooze: 0 });
    addText.value = ''; addTime.value = '';
    touch(n); renderItems(); addText.focus();
  });
  sheet.append(form);

  var progText = h('span'), fill = h('i');
  sheet.append(h('div', { class: 'foot' },
    h('div', { class: 'prog-text' }, progText, h('span', { text: 'Pip rings at each time, even with this window closed.' })),
    h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Progress', 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill)));

  function progress() {
    var total = n.items.length, d = n.items.filter(function (i) { return i.done; }).length;
    progText.textContent = total ? d + ' of ' + total + ' done' : 'Nothing to do yet';
    var pct = total ? Math.round(d / total * 100) : 0;
    fill.style.width = pct + '%'; fill.parentNode.setAttribute('aria-valuenow', String(pct));
  }
  function removeItem(id) { n.items = n.items.filter(function (i) { return i.id !== id; }); touch(n); renderItems(); }
  function itemRow(it) {
    var li = h('li', { class: 'it' + (it.done ? ' done' : ''), 'data-id': it.id });
    var cb = h('input', { type: 'checkbox', 'aria-label': 'Done' }); cb.checked = it.done;
    cb.addEventListener('change', function () { it.done = cb.checked; li.classList.toggle('done', it.done); touch(n); refreshLate(); progress(); });
    var tx = h('input', { class: 'it-text', type: 'text', maxlength: '200', 'aria-label': 'Task' }); tx.value = it.text;
    tx.addEventListener('input', function () { it.text = tx.value; touch(n); });
    tx.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addText.focus(); }
      if (e.key === 'Backspace' && !tx.value) { e.preventDefault(); removeItem(it.id); }
    });
    var tm = h('input', { class: 'field it-time', type: 'time', 'aria-label': 'Time' }); tm.value = it.time;
    var bell = h('button', { class: 'bell', type: 'button' }, icon('bell', 18));
    function syncBell() {
      bell.disabled = !it.time;
      var on = !!(it.time && it.remind);
      bell.setAttribute('aria-pressed', String(on));
      bell.setAttribute('aria-label', it.time ? (on ? 'Reminder on. Turn off' : 'Reminder off. Turn on') : 'Set a time to enable a reminder');
      bell.title = it.time ? (on ? 'Reminder on' : 'Reminder off') : 'Set a time first';
      tm.classList.toggle('late', !!isLate(n, it));
    }
    tm.addEventListener('change', function () {
      var had = !!it.time; it.time = tm.value; it.fired = false; it.snooze = 0;
      if (it.time && !had) it.remind = true;
      if (!it.time) it.remind = false;
      syncBell(); touch(n);
    });
    bell.addEventListener('click', function () { it.remind = !it.remind; it.fired = false; it.snooze = 0; syncBell(); touch(n); });
    var x = h('button', { class: 'x', type: 'button', 'aria-label': 'Delete task', onclick: function () { removeItem(it.id); } }, icon('x', 16));
    syncBell();
    li.append(h('label', { class: 'chk' }, cb, h('span', { class: 'box', 'aria-hidden': 'true' })), tx, tm, bell, x);
    return li;
  }
  function renderItems() {
    itemsEl.replaceChildren();
    if (!n.items.length) itemsEl.append(h('li', { class: 'empty', text: 'No tasks yet. Add the first one below.' }));
    n.items.forEach(function (it) { itemsEl.append(itemRow(it)); });
    progress();
  }
  refreshLate = function () {
    itemsEl.querySelectorAll('.it').forEach(function (li) {
      var it = n.items.find(function (i) { return i.id === li.getAttribute('data-id'); });
      if (it) li.querySelector('.it-time').classList.toggle('late', !!isLate(n, it));
    });
  };
  renderItems();
  if (!keepFocus) (n.title ? addText : title).focus();
}
setInterval(function () { if (view === 'edit') refreshLate(); }, 30000);

/* ---------- messages from the main process ---------- */
api.onOpen(function (m) {
  if (m && m.new) newNote(m.new);
  else { leaveCurrent(); renderHome(); }
});
api.onNotesChanged(function (list) {
  // the reminder timer or the Pip bubble changed something (fired, done, snoozed)
  var doneChanged = false;
  var incomingIds = new Set((list || []).map(function (r) { return r.id; }));
  list.forEach(function (r) {
    var l = notes.get(r.id);
    if (!l) { notes.set(r.id, norm(r)); return; }
    if (r.id === cur && view === 'edit') {
      (r.items || []).forEach(function (ri) {
        var li = (l.items || []).find(function (i) { return i.id === ri.id; });
        if (!li) return;
        if (li.done !== !!ri.done) doneChanged = true;
        li.done = !!ri.done; li.fired = !!ri.fired; li.snooze = +ri.snooze || 0;
      });
    } else if ((r.updated || 0) >= (l.updated || 0)) notes.set(r.id, norm(r));
  });
  Array.from(notes.keys()).forEach(function (id) {
    if (!incomingIds.has(id)) {
      notes.delete(id);
      if (cur === id) { cur = null; view = 'home'; }
    }
  });
  if (view === 'home') renderHome();
  else if (doneChanged) openNote(cur, true);
});
document.getElementById('new-list').addEventListener('click', function () { newNote('list'); });
document.getElementById('new-note').addEventListener('click', function () { newNote('note'); });
window.addEventListener('beforeunload', function () { var n = notes.get(cur); if (view === 'edit' && n) flushNow(n); });

api.getNotes().then(function (list) {
  (list || []).forEach(function (r) { var n = norm(r); notes.set(n.id, n); });
  if (view === 'home') renderHome();
});
renderHome();
})();
