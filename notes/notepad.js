'use strict';

(function () {
  var api = window.pip;
  var ed = document.getElementById('ed');
  var lp = document.getElementById('lp');
  var lu = document.getElementById('lu');
  var list = document.getElementById('list');
  var notes = [];
  var currentId = null;
  var sort = 'new';
  var query = '';
  var pendingDelete = null;
  var savedRange = null;
  var editing = false;

  var SVG = 'fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
  function lines(items) {
    return items.map(function (line) {
      return '<path d="M' + line[0] + ' ' + line[1] + 'H' + line[2] + '"/>';
    }).join('');
  }
  var icons = {
    al: lines([[5, 6, 19], [5, 10, 14], [5, 14, 19], [5, 18, 14]]),
    ac: lines([[5, 6, 19], [8, 10, 16], [5, 14, 19], [8, 18, 16]]),
    ar: lines([[5, 6, 19], [10, 10, 19], [5, 14, 19], [10, 18, 19]]),
    aj: lines([[5, 6, 19], [5, 10, 19], [5, 14, 19], [5, 18, 19]]),
    ul: '<circle cx="6" cy="7" r="1"/><circle cx="6" cy="12" r="1"/><circle cx="6" cy="17" r="1"/>' + lines([[10, 7, 19], [10, 12, 19], [10, 17, 19]]),
    ol: lines([[11, 7, 19], [11, 12, 19], [11, 17, 19]]) + '<path d="M5 6l1-1v4M5 11h2l-2 2h2M5 16h2v1H6h1v1H5"/>',
    out: lines([[11, 6, 19], [11, 18, 19], [5, 12, 19]]) + '<path d="M9 9l-3 3 3 3"/>',
    ind: lines([[5, 6, 13], [5, 18, 13], [5, 12, 13]]) + '<path d="M15 9l3 3-3 3"/>',
    link: '<path d="M10 14a3.5 3.5 0 005 0l3-3a3.5 3.5 0 00-5-5l-1 1M14 10a3.5 3.5 0 00-5 0l-3 3a3.5 3.5 0 005 5l1-1"/>',
    check: '<rect x="4.5" y="5" width="5" height="5" rx="1"/><path d="M5.6 7.6l1.3 1.3 2-2.6"/>' + lines([[12, 7.5, 19]]) + '<rect x="4.5" y="14" width="5" height="5" rx="1"/>' + lines([[12, 16.5, 19]]),
    undo: '<path d="M9 8L5 12l4 4M5 12h9a4 4 0 010 8h-2" transform="translate(0 -3)"/>',
    redo: '<path d="M15 8l4 4-4 4M19 12h-9a4 4 0 000 8h2" transform="translate(0 -3)"/>'
  };
  document.querySelectorAll('[data-i]').forEach(function (button) {
    var stroke = button.classList.contains('d') ? '#ddd' : '#fff';
    button.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" ' + SVG + ' stroke="' + stroke + '">' + icons[button.dataset.i] + '</svg>';
  });

  function allowedUrl(value) {
    try {
      var url = new URL(value);
      return ['http:', 'https:', 'mailto:', 'tel:'].indexOf(url.protocol) >= 0 ? url.href : '';
    } catch {
      return '';
    }
  }

  function cleanHtml(value) {
    var doc = new DOMParser().parseFromString(String(value || ''), 'text/html');
    var allowed = ['A', 'B', 'BR', 'DIV', 'EM', 'H3', 'I', 'LI', 'OL', 'P', 'STRONG', 'U', 'UL'];
    function clean(parent) {
      Array.from(parent.childNodes).forEach(function (node) {
        if (node.nodeType === Node.TEXT_NODE) return;
        if (node.nodeType !== Node.ELEMENT_NODE) {
          node.remove();
          return;
        }
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH'].indexOf(node.tagName) >= 0) {
          node.remove();
          return;
        }
        clean(node);
        if (allowed.indexOf(node.tagName) < 0) {
          node.replaceWith.apply(node, Array.from(node.childNodes));
          return;
        }
        var href = node.getAttribute('href') || '';
        var className = node.className;
        var alignment = node.style.textAlign || node.getAttribute('align') || '';
        var attributes = Array.from(node.attributes);
        attributes.forEach(function (attribute) { node.removeAttribute(attribute.name); });
        if (node.tagName === 'A') {
          href = allowedUrl(href);
          if (href) node.setAttribute('href', href);
          else node.replaceWith.apply(node, Array.from(node.childNodes));
        } else if (node.tagName === 'UL' && className.split(/\s+/).indexOf('cl') >= 0) {
          node.className = 'cl';
        } else if (node.tagName === 'LI' && className.split(/\s+/).indexOf('done') >= 0) {
          node.className = 'done';
        }
        if (['DIV', 'P', 'H3'].indexOf(node.tagName) >= 0) {
          if (['left', 'center', 'right', 'justify'].indexOf(alignment) >= 0) node.style.textAlign = alignment;
        }
      });
    }
    clean(doc.body);
    return doc.body.innerHTML;
  }

  function textFromHtml(html) {
    var safe = cleanHtml(html);
    var doc = new DOMParser().parseFromString(safe, 'text/html');
    return doc.body.innerHTML
      .replace(/<\/(div|p|li|h3)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  function textToHtml(value) {
    return String(value || '').split(/\r?\n/).map(function (line) {
      return '<div>' + line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
    }).join('');
  }

  function dateLabel(value) {
    var date = new Date(value || Date.now());
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
      date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function titleFor(note) {
    if (note.title) return note.title;
    return textFromHtml(note.html || note.text || '').split('\n').map(function (line) {
      return line.trim();
    }).filter(Boolean)[0] || 'Untitled';
  }

  function summaryFor(note) {
    var lines = textFromHtml(note.html || note.text || '').split('\n').map(function (line) {
      return line.trim();
    }).filter(Boolean);
    var text = note.titleMode === 'content' ? lines.slice(1).join(' ') : lines.join(' ');
    return text || 'No additional text';
  }

  function render() {
    pendingDelete = null;
    var visible = notes.filter(function (note) {
      return !query || (titleFor(note) + ' ' + summaryFor(note)).toLowerCase().indexOf(query) >= 0;
    });
    visible.sort(function (a, b) {
      var aTitle = titleFor(a), bTitle = titleFor(b);
      var aTime = a.updated || a.created || 0, bTime = b.updated || b.created || 0;
      return sort === 'az' ? aTitle.localeCompare(bTitle) : sort === 'old' ? aTime - bTime : bTime - aTime;
    });
    document.getElementById('cnt').textContent = notes.length + (notes.length === 1 ? ' note' : ' notes');
    list.replaceChildren();
    if (!visible.length) {
      var empty = document.createElement('div');
      empty.className = 'emp';
      empty.textContent = query ? 'No notes match your search.' : 'No saved notes yet. Tap “New” to start one.';
      list.append(empty);
      return;
    }
    visible.forEach(function (note) {
      var row = document.createElement('div');
      row.className = 'nr';
      row.dataset.id = note.id;
      var titleRow = document.createElement('div');
      titleRow.className = 'nt';
      var title = document.createElement('b');
      title.textContent = titleFor(note);
      var date = document.createElement('span');
      date.textContent = dateLabel(note.updated || note.created);
      titleRow.append(title, date);
      var summaryRow = document.createElement('div');
      summaryRow.className = 'ns';
      var summary = document.createElement('em');
      summary.textContent = summaryFor(note);
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'del';
      remove.dataset.del = note.id;
      remove.textContent = 'Delete';
      summaryRow.append(summary, remove);
      row.append(titleRow, summaryRow);
      list.append(row);
    });
  }

  function showMenu() {
    editing = false;
    render();
    show(true);
  }

  function show(menuVisible) {
    document.getElementById('case').classList.toggle('menu', menuVisible);
  }

  function openNote(id) {
    var note = notes.find(function (item) { return item.id === id && item.kind === 'note'; });
    if (!note) return;
    currentId = id;
    editing = true;
    ed.innerHTML = cleanHtml(note.html || textToHtml(note.text));
    document.getElementById('date').textContent = dateLabel(note.updated || note.created);
    var font = document.getElementById('font');
    font.value = Array.from(font.options).some(function (option) { return option.value === note.font; }) ? note.font : 'Roboto';
    document.getElementById('fam').textContent = font.options[font.selectedIndex].textContent;
    ed.style.fontFamily = "'" + font.value + "',sans-serif";
    var size = document.getElementById('size');
    var storedSize = String(note.fontSize || '12').replace('px', '');
    size.value = Array.from(size.options).some(function (option) { return option.value === storedSize; }) ? storedSize : '12';
    document.getElementById('sz').textContent = size.value;
    ed.style.fontSize = size.value + 'px';
    show(false);
    ed.focus();
  }

  function updateToolbar() {
    var selection = window.getSelection();
    if (!selection.rangeCount || !ed.contains(selection.anchorNode)) return;
    ['bold', 'italic', 'underline', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull', 'insertUnorderedList', 'insertOrderedList'].forEach(function (command) {
      var button = document.querySelector('[data-c="' + command + '"]');
      if (button) {
        var active = false;
        try { active = document.queryCommandState(command); } catch { /* unsupported formatting state */ }
        button.classList.toggle('on', active);
      }
    });
    var anchor = selection.anchorNode;
    anchor = anchor && anchor.nodeType === Node.TEXT_NODE ? anchor.parentNode : anchor;
    document.getElementById('lnk').classList.toggle('on', !!(anchor && anchor.closest && anchor.closest('a')));
    var checkboxButton = document.getElementById('chk');
    var checkboxList = !!(anchor && anchor.closest && anchor.closest('ul.cl'));
    checkboxButton.classList.toggle('on', checkboxList);
    checkboxButton.setAttribute('aria-pressed', String(checkboxList));
  }

  function selectedList() {
    var selection = window.getSelection();
    var anchor = selection.anchorNode;
    anchor = anchor && anchor.nodeType === Node.TEXT_NODE ? anchor.parentNode : anchor;
    var ul = anchor && anchor.closest ? anchor.closest('ul') : null;
    return ul && ed.contains(ul) ? ul : null;
  }

  function toggleCheckboxList() {
    ed.focus();
    var ul = selectedList();
    if (!ul) {
      document.execCommand('insertUnorderedList');
      ul = selectedList();
    }
    if (!ul) return;
    var enabled = !ul.classList.contains('cl');
    ul.classList.toggle('cl', enabled);
    if (!enabled) ul.querySelectorAll('li.done').forEach(function (item) { item.classList.remove('done'); });
    updateToolbar();
  }

  function openLink() {
    var selection = window.getSelection();
    savedRange = selection.rangeCount && ed.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
    lp.hidden = false;
    lu.value = '';
    lu.focus();
  }

  function addLink() {
    var value = lu.value.trim();
    lp.hidden = true;
    if (!value) return;
    if (!/^(https?:|mailto:|tel:)/i.test(value)) value = 'https://' + value;
    var href = allowedUrl(value);
    if (!href) return;
    ed.focus();
    var selection = window.getSelection();
    if (savedRange) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }
    if (!savedRange || savedRange.collapsed) {
      var link = document.createElement('a');
      link.href = href;
      link.textContent = value;
      var range = selection.rangeCount ? selection.getRangeAt(0) : document.createRange();
      range.insertNode(link);
      range.setStartAfter(link);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      document.execCommand('createLink', false, href);
    }
    savedRange = null;
    updateToolbar();
  }

  function applyMode(mode) {
    if (!mode) return;
    if (mode.new === 'note') {
      currentId = null;
      editing = true;
      ed.replaceChildren();
      ed.style.fontFamily = '';
      ed.style.fontSize = '';
      document.getElementById('date').textContent = dateLabel(Date.now());
      show(false);
      ed.focus();
    } else if (mode.home) showMenu();
  }

  async function migrateLegacy() {
    var marker = 'pip-notepad-migrated';
    try {
      if (localStorage.getItem(marker)) return;
    } catch (error) {
      console.error('legacy notes migration unavailable', error);
      return;
    }
    var legacy;
    try {
      legacy = JSON.parse(localStorage.getItem('notes') || '[]');
      if (!Array.isArray(legacy)) throw new TypeError('Legacy notes data is not a list.');
      var oldNote = localStorage.getItem('note');
      if (oldNote) legacy.push({ id: 'legacy-single', html: oldNote, t: Date.now() });
    } catch (error) {
      console.error('legacy notes migration failed', error);
      return;
    }
    for (var index = 0; index < legacy.length; index++) {
      var item = legacy[index];
      if (!item || typeof item.html !== 'string') continue;
      var id = 'notepad-' + String(item.id || index);
      if (notes.some(function (note) { return note.id === id; })) continue;
      var html = cleanHtml(item.html);
      var text = textFromHtml(html);
      var timestamp = Number(item.t) || Date.now();
      var note = {
        id: id,
        kind: 'note',
        title: text.split('\n').map(function (line) { return line.trim(); }).filter(Boolean)[0] || '',
        titleMode: 'content',
        text: text,
        html: html,
        items: [],
        created: timestamp,
        updated: timestamp
      };
      try {
        await api.saveNote(note);
        notes.push(note);
      } catch (error) {
        console.error('legacy note save failed', error);
        return;
      }
    }
    try { localStorage.setItem(marker, '1'); } catch (error) {
      console.error('legacy notes migration marker failed', error);
    }
  }

  document.querySelectorAll('.grp button').forEach(function (button) {
    button.addEventListener('mousedown', function (event) { event.preventDefault(); });
    button.addEventListener('click', function () {
      if (button.id === 'lnk') { openLink(); return; }
      if (button.id === 'chk') { toggleCheckboxList(); return; }
      ed.focus();
      document.execCommand(button.dataset.c, false, null);
      updateToolbar();
    });
  });
  document.getElementById('minimize').addEventListener('click', function () { api.notesMinimize(); });
  document.getElementById('maximize').addEventListener('click', function () { api.notesToggleMaximize(); });
  document.getElementById('close').addEventListener('click', function () { api.notesClose(); });
  document.addEventListener('selectionchange', updateToolbar);
  var dragHandle = document.getElementById('drag-handle');
  var draggingWindow = false;
  dragHandle.addEventListener('pointerdown', function (event) {
    if (event.button !== 0) return;
    draggingWindow = true;
    if (event.isTrusted && dragHandle.setPointerCapture) dragHandle.setPointerCapture(event.pointerId);
    api.notesDragStart(event.screenX, event.screenY);
    event.preventDefault();
  });
  document.addEventListener('pointermove', function (event) {
    if (draggingWindow) api.notesDragMove(event.screenX, event.screenY);
  });
  function endWindowDrag() {
    if (!draggingWindow) return;
    draggingWindow = false;
    api.notesDragEnd();
  }
  document.addEventListener('pointerup', endWindowDrag);
  document.addEventListener('pointercancel', endWindowDrag);
  var resizeHandle = document.getElementById('resize-handle');
  var resizingWindow = false;
  resizeHandle.addEventListener('pointerdown', function (event) {
    if (event.button !== 0) return;
    resizingWindow = true;
    if (event.isTrusted && resizeHandle.setPointerCapture) resizeHandle.setPointerCapture(event.pointerId);
    api.notesResizeStart(event.screenX, event.screenY);
    event.preventDefault();
  });
  document.addEventListener('pointermove', function (event) {
    if (resizingWindow) api.notesResizeMove(event.screenX, event.screenY);
  });
  function endWindowResize() {
    if (!resizingWindow) return;
    resizingWindow = false;
    api.notesResizeEnd();
  }
  document.addEventListener('pointerup', endWindowResize);
  document.addEventListener('pointercancel', endWindowResize);
  ed.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a');
    if (link) {
      event.preventDefault();
      var href = allowedUrl(link.href);
      if (href) api.openExternal(href);
      return;
    }
    var item = event.target.closest && event.target.closest('ul.cl li');
    if (item && event.clientX < item.getBoundingClientRect().left) item.classList.toggle('done');
  });
  document.getElementById('la').addEventListener('click', addLink);
  document.getElementById('lc').addEventListener('click', function () { lp.hidden = true; });
  lu.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') { event.preventDefault(); addLink(); }
    if (event.key === 'Escape') lp.hidden = true;
  });
  function bind(selectId, labelId, apply) {
    var select = document.getElementById(selectId);
    select.addEventListener('change', function () {
      document.getElementById(labelId).textContent = select.options[select.selectedIndex].textContent;
      apply(select);
    });
  }
  bind('style', 'sty', function (select) {
    ed.focus();
    document.execCommand('formatBlock', false, select.value === 'Heading' ? 'h3' : 'div');
  });
  bind('font', 'fam', function (select) { ed.style.fontFamily = "'" + select.value + "',sans-serif"; });
  bind('size', 'sz', function (select) { ed.style.fontSize = select.value + 'px'; });

  document.getElementById('new').addEventListener('click', function () {
    currentId = null;
    editing = true;
    ed.replaceChildren();
    ed.style.fontFamily = '';
    ed.style.fontSize = '';
    document.getElementById('date').textContent = dateLabel(Date.now());
    show(false);
    ed.focus();
  });
  document.getElementById('q').addEventListener('input', function (event) {
    query = event.target.value.toLowerCase().trim();
    render();
  });
  document.querySelectorAll('[data-s]').forEach(function (button) {
    button.addEventListener('click', function () {
      sort = button.dataset.s;
      document.querySelectorAll('[data-s]').forEach(function (item) { item.classList.toggle('on', item === button); });
      render();
    });
  });
  list.addEventListener('click', function (event) {
    var remove = event.target.closest('[data-del]');
    if (remove) {
      var id = remove.dataset.del;
      if (pendingDelete === id) {
        api.removeNote(id);
        notes = notes.filter(function (note) { return note.id !== id; });
        render();
      } else {
        pendingDelete = id;
        remove.textContent = 'Sure?';
        remove.classList.add('arm');
      }
      return;
    }
    var row = event.target.closest('.nr');
    if (!row) return;
    var note = notes.find(function (item) { return item.id === row.dataset.id; });
    if (!note) return;
    openNote(note.id);
  });
  document.getElementById('ok').addEventListener('click', async function () {
    if (!editing) return;
    var html = cleanHtml(ed.innerHTML);
    var text = textFromHtml(html);
    if (text.trim()) {
      var note = notes.find(function (item) { return item.id === currentId; });
      if (!note) {
        var now = Date.now();
        note = {
          id: 'n' + now.toString(36) + Math.random().toString(36).slice(2, 8),
          kind: 'note',
          title: '',
          titleMode: 'content',
          text: '',
          html: '',
          items: [],
          created: now,
          updated: now
        };
        notes.push(note);
      }
      currentId = note.id;
      note.html = html;
      note.text = text;
      note.updated = Date.now();
      note.font = document.getElementById('font').value;
      note.fontSize = document.getElementById('size').value;
      if (note.titleMode === 'content' || !note.title) {
        note.title = text.split('\n').map(function (line) { return line.trim(); }).filter(Boolean)[0] || '';
        note.titleMode = 'content';
      }
      try {
        await api.saveNote(note);
        document.getElementById('cnt').textContent = 'Saved';
        currentId = note.id;
      } catch (error) {
        console.error('note save failed', error);
        document.getElementById('cnt').textContent = 'Save failed';
        return;
      }
    }
    showMenu();
  });
  document.getElementById('no').addEventListener('click', showMenu);

  api.onOpen(applyMode);
  api.onNotesChanged(function (updated) {
    if (!Array.isArray(updated)) return;
    notes = updated.filter(function (note) { return note && note.kind === 'note'; });
    if (!editing) render();
  });
  api.getNotes().then(function (stored) {
    notes = Array.isArray(stored) ? stored.filter(function (note) {
      return note && note.kind === 'note';
    }) : [];
    return migrateLegacy().then(render);
  }).catch(function (error) {
    console.error('notes load failed', error);
    document.getElementById('cnt').textContent = 'Could not load notes';
  });

  document.body.dataset.notepadReady = 'true';
  function fit() {
    var scale = Math.min(window.innerWidth / 670, window.innerHeight / 750);
    document.getElementById('stage').style.zoom = scale;
  }
  window.addEventListener('resize', fit);
  fit();
})();
