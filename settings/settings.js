(function () {
  'use strict';

  var api = window.settingsApi;
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  var sizeRange = $('sizeRange'), sizeNum = $('sizeNum');
  var followRange = $('followRange'), followNum = $('followNum');
  var quality = $('quality');
  var enabled = $('enabled'), beside = $('beside'), login = $('login'), removeBg = $('removeBg');
  var imgState = $('imgState'), builtin = $('builtin');

  // Skip fields the user is editing so typing is not overwritten by the echo from the app.
  function setIdle(el, value) {
    if (document.activeElement !== el) el.value = value;
  }

  function apply(s) {
    setIdle(sizeRange, s.size);
    setIdle(sizeNum, s.size);
    setIdle(followRange, s.follow);
    setIdle(followNum, s.follow);
    setIdle(quality, String(s.quality));
    enabled.checked = !!s.enabled;
    beside.checked = !!s.beside;
    login.checked = !!s.launchAtLogin;
    login.disabled = !s.packaged;
    $('loginNote').textContent = s.packaged ? '' : 'Available in the built app';
    removeBg.checked = !!s.removeBackground;
    imgState.textContent = s.imageFile ? 'Your image' : 'Built-in ball';
    builtin.disabled = !s.imageFile;
  }

  // A slider and its number box edit the same value.
  function link(range, num, key, min, max) {
    range.addEventListener('input', function () {
      var v = parseFloat(range.value);
      num.value = v;
      var patch = {};
      patch[key] = v;
      api.set(patch);
    });
    num.addEventListener('input', function () {
      var v = parseFloat(num.value);
      if (!isFinite(v)) return;
      v = clamp(v, min, max);
      range.value = v;
      var patch = {};
      patch[key] = v;
      api.set(patch);
    });
    num.addEventListener('change', function () {
      var v = parseFloat(num.value);
      num.value = isFinite(v) ? clamp(v, min, max) : range.value;
    });
  }
  link(sizeRange, sizeNum, 'size', 48, 320);
  link(followRange, followNum, 'follow', 1, 10);

  quality.addEventListener('change', function () { api.set({ quality: Number(quality.value) }); });
  enabled.addEventListener('change', function () { api.set({ enabled: enabled.checked }); });
  beside.addEventListener('change', function () { api.set({ beside: beside.checked }); });
  login.addEventListener('change', function () { api.set({ launchAtLogin: login.checked }); });
  removeBg.addEventListener('change', function () { api.set({ removeBackground: removeBg.checked }); });

  $('choose').addEventListener('click', function () { api.chooseImage(); });
  builtin.addEventListener('click', function () { api.useBuiltIn(); });
  $('reset').addEventListener('click', function () { api.reset(); });

  api.onChange(apply);
  api.get().then(apply);
})();
