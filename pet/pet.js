(function () {
'use strict';
var $ = function (s) { return document.querySelector(s); };
var sprite = $('#sprite'), pipBtn = $('#pip'), menu = $('#menu');
var bubble = $('#bubble'), bubbleText = $('#bubble-text');
var RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var q = new URLSearchParams(location.search);
document.documentElement.style.setProperty('--s', parseFloat(q.get('s')) || 1);
document.documentElement.style.setProperty('--u', parseFloat(q.get('u')) || 1);

/* ---------- animation (rows of assets/sheet.png) ---------- */
// rows: 0 idle, 1 wave, 2 jump, 3 reading, 4 look 0-157deg, 5 look 180-337deg, 6 sleepy
var IDLE = [[0,0,1500],[0,1,300],[0,2,140],[0,3,320],[0,4,1300],[0,5,300]];
var JUMP = [[2,0,90],[2,1,90],[2,2,110],[2,3,90],[2,4,90]];
var WAVE = [[1,0,120],[1,1,120],[1,2,140],[1,1,120],[1,2,140],[1,1,120],[1,2,140],[1,3,160]];
var SLEEP_IN = [[6,1,500],[6,2,600],[6,3,700],[6,4,900]];
var SLEEP = [[6,3,1600],[6,4,1600]];
// rows 7 and 8: flying right and flying left, 8 frames each
var FLY_R = [0,1,2,3,4,5,6,7].map(function (c) { return [7, c, 75]; });
var FLY_L = [0,1,2,3,4,5,6,7].map(function (c) { return [8, c, 75]; });
var flyDir = 0;
var mode = 'idle', animT = 0, lookT = 0, sleepT = 0, sayT = 0;

function frame(r, c) { sprite.style.setProperty('--row', r); sprite.style.setProperty('--col', c); }
function stopAnim() { clearTimeout(animT); }
function play(seq, opt) {
  opt = opt || {}; stopAnim(); var i = 0;
  (function step() {
    var f = seq[i]; frame(f[0], f[1]); i++;
    if (i >= seq.length) {
      if (opt.loop) i = 0;
      else { animT = setTimeout(function () { opt.then && opt.then(); }, f[2]); return; }
    }
    animT = setTimeout(step, f[2]);
  })();
}
function idle() {
  mode = 'idle';
  if (RM) { stopAnim(); frame(0, 0); return; }
  play(IDLE, { loop: true });
}
function look(idx) { mode = 'look'; stopAnim(); frame(idx < 8 ? 4 : 5, idx % 8); }
function greet() {
  mode = 'busy';
  if (RM) { stopAnim(); frame(1, 2); animT = setTimeout(idle, 1500); return; }
  play(JUMP, { then: function () { play(WAVE, { then: idle }); } });
}

function fly(dir) {
  if (dir === flyDir && mode === 'fly') return;
  flyDir = dir; mode = 'fly';
  if (RM) { stopAnim(); frame(dir > 0 ? 7 : 8, 2); return; }
  play(dir > 0 ? FLY_R : FLY_L, { loop: true });
}

/* ---------- speech bubble ---------- */
function say(text, ms) {
  clearTimeout(sayT);
  bubbleText.textContent = text;
  bubble.hidden = false;
  if (ms) sayT = setTimeout(function () { bubble.hidden = true; }, ms);
}
function hideSay() { bubble.hidden = true; }

/* ---------- sleep ---------- */
function fallAsleep() {
  if (RM || (mode !== 'idle' && mode !== 'look')) return;
  mode = 'sleep';
  say('Zzz…');
  play(SLEEP_IN, { then: function () { play(SLEEP, { loop: true }); } });
}
function wake(silent) {
  clearTimeout(sleepT);
  sleepT = setTimeout(fallAsleep, 90000);
  if (mode === 'sleep') {
    mode = 'busy'; hideSay();
    if (!silent) play(JUMP, { then: idle }); else idle();
  }
}

/* ---------- Pip follows the cursor anywhere on screen ---------- */
window.pip.onCursor(function (p) {
  wake();
  if (RM || (mode !== 'idle' && mode !== 'look')) return;
  var r = sprite.getBoundingClientRect();
  var cx = r.left + r.width / 2, cy = r.top + r.height * 0.35;
  var dx = p.x - cx, dy = p.y - cy;
  if (Math.hypot(dx, dy) > 900) { if (mode === 'look') idle(); return; }
  var a = Math.atan2(dx, -dy) * 180 / Math.PI; if (a < 0) a += 360;
  look(Math.round(a / 22.5) % 16);
  clearTimeout(lookT);
  lookT = setTimeout(function () { if (mode === 'look') idle(); }, 2500);
});

/* ---------- hover menu and click-through ---------- */
var ignoring = true, hovering = false, closeT = 0;
function setIgnore(v) { if (v !== ignoring) { ignoring = v; window.pip.setIgnore(v); } }
function openMenu() {
  clearTimeout(closeT);
  if (hovering) return;
  hovering = true;
  menu.classList.add('show');
  greet();
  say('What shall we write?');
}
function closeMenuSoon() {
  clearTimeout(closeT);
  closeT = setTimeout(function () {
    hovering = false; menu.classList.remove('show');
    hideSay();
  }, 450);
}
var dragging = false;
document.addEventListener('mousemove', function (e) {
  wake();
  var el = document.elementFromPoint(e.clientX, e.clientY);
  var hit = el && el.closest('[data-hit]');
  if (window.pip.platform !== 'linux') setIgnore(!hit && !dragging);
  var over = !!(el && (el.closest('#pip') || (menu.classList.contains('show') && el.closest('#menu'))));
  if (dragging) return;
  if (over) openMenu(); else if (hovering) closeMenuSoon();
});
document.addEventListener('mouseleave', function () { if (!dragging && hovering) closeMenuSoon(); });

/* ---------- drag to move, click to wave ---------- */
var down = null, lastDX = 0;
pipBtn.addEventListener('pointerdown', function (e) {
  if (e.button !== 0) return;
  pipBtn.setPointerCapture(e.pointerId);
  down = { x: e.screenX, y: e.screenY, moved: false };
  lastDX = e.screenX;
  window.pip.dragStart(e.screenX, e.screenY);
});
pipBtn.addEventListener('pointermove', function (e) {
  if (!down) return;
  if (!down.moved && Math.hypot(e.screenX - down.x, e.screenY - down.y) > 4) {
    down.moved = true; dragging = true; menu.classList.remove('show'); hovering = false;
    say('Wheee!'); fly(flyDir || 1);
  }
  if (down.moved) {
    window.pip.dragMove(e.screenX, e.screenY);
    var dx = e.screenX - lastDX;
    if (Math.abs(dx) >= 3) {
      lastDX = e.screenX;
      fly(dx > 0 ? 1 : -1);
    }
  }
});
function endDrag(e) {
  if (!down) return;
  var moved = down.moved; down = null; dragging = false;
  if (pipBtn.hasPointerCapture(e.pointerId)) pipBtn.releasePointerCapture(e.pointerId);
  window.pip.dragEnd();
  if (moved) { flyDir = 0; idle(); hideSay(); }
  else greet();
}
pipBtn.addEventListener('pointerup', endDrag);
pipBtn.addEventListener('pointercancel', endDrag);
pipBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); window.pip.contextMenu(); });

document.querySelectorAll('[data-new]').forEach(function (b) {
  b.addEventListener('click', function () {
    window.pip.openNotes({ new: b.getAttribute('data-new') });
    menu.classList.remove('show'); hovering = false; hideSay();
    if (!RM) { mode = 'busy'; play(JUMP, { then: idle }); }
  });
});

idle();
wake(true);
})();
