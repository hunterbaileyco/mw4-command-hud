/* Dashboard style. hud.mode is "mw4" or "glass".
   Unset stays on the theater. Mute stays on mw4hud.sound, same as the HUD. */
(function (w) {
  'use strict';
  const KEY = 'hud.mode';
  const SKEY = 'mw4hud.sound';
  const RKEY = 'hud.refresh';
  const SYNC = 'hud.synced';

  function read(key) {
    try { return w.localStorage.getItem(key); }
    catch (_) { return null; }
  }
  function write(key, value) {
    try { w.localStorage.setItem(key, value); }
    catch (_) { /* private mode */ }
  }

  function get() {
    return read(KEY) === 'glass' ? 'glass' : 'mw4';
  }
  function soundOn() {
    return read(SKEY) !== '0';
  }
  function refreshOn() {
    return read(RKEY) !== '0';
  }
  function syncedAt() {
    return read(SYNC) || '';
  }
  function markSynced(iso) {
    if (iso) write(SYNC, String(iso));
  }

  function apply(mode) {
    const m = mode === 'glass' ? 'glass' : 'mw4';
    document.documentElement.dataset.hud = m;
    document.documentElement.classList.toggle('is-glass', m === 'glass');
    return m;
  }

  function reflectSound(on) {
    const label = on ? '🔊' : '🔇';
    document.querySelectorAll('[data-sound-face]').forEach((el) => {
      el.textContent = label;
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      el.setAttribute('aria-checked', on ? 'true' : 'false');
      el.classList.toggle('off', !on);
    });
  }

  function setSound(on) {
    const next = !!on;
    write(SKEY, next ? '1' : '0');
    reflectSound(next);
    w.dispatchEvent(new CustomEvent('hudsound', { detail: next }));
    return next;
  }

  function setRefresh(on) {
    const next = !!on;
    write(RKEY, next ? '1' : '0');
    document.querySelectorAll('[data-refresh-face]').forEach((el) => {
      el.setAttribute('aria-checked', next ? 'true' : 'false');
      el.classList.toggle('off', !next);
    });
    w.dispatchEvent(new CustomEvent('hudrefresh', { detail: next }));
    return next;
  }

  function paintToggle(host) {
    const mode = get();
    const glass = mode === 'glass';
    host.innerHTML =
      '<div class="hud-toggle" role="radiogroup" aria-label="Dashboard style">' +
      '<button type="button" role="radio" data-mode="mw4" aria-checked="' + (glass ? 'false' : 'true') + '">' + (glass ? 'MW4' : 'MW4') + '</button>' +
      '<button type="button" role="radio" data-mode="glass" aria-checked="' + (glass ? 'true' : 'false') + '">' + (glass ? 'Glass' : 'GLASS') + '</button>' +
      '</div>';
    host.querySelectorAll('button[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => set(btn.getAttribute('data-mode')));
    });
    if (host.dataset.keys === '1') return;
    host.dataset.keys = '1';
    host.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const next = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 'glass' : 'mw4';
      set(next);
      const focus = host.querySelector('[data-mode="' + next + '"]');
      if (focus) focus.focus();
    });
  }

  function mount(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-hud-mode]').forEach(paintToggle);
    reflectSound(soundOn());
    document.querySelectorAll('[data-refresh-face]').forEach((el) => {
      const on = refreshOn();
      el.setAttribute('aria-checked', on ? 'true' : 'false');
      el.classList.toggle('off', !on);
    });
  }

  function takeForce() {
    const on = !!w.MW4Mode.forceRefresh;
    w.MW4Mode.forceRefresh = false;
    return on;
  }

  function set(mode) {
    const m = apply(mode);
    write(KEY, m);
    mount(document);
    w.dispatchEvent(new CustomEvent('hudmode', { detail: m }));
    return m;
  }

  apply(get());
  w.MW4Mode = {
    KEY, SKEY, RKEY,
    get, set, apply, mount,
    soundOn, setSound, reflectSound,
    refreshOn, setRefresh,
    syncedAt, markSynced,
    takeForce, forceRefresh: false,
  };

  function boot() { mount(document); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
