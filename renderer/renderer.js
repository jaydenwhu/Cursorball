// Overlay window: draws the ball wherever the main process says it is.
(function () {
  'use strict';

  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var sprite = document.createElement('canvas');
  var sctx = sprite.getContext('2d');
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var cfg = { origin: { x: 0, y: 0 }, size: 120, quality: 2, removeBackground: true, image: null };
  var st = null;        // latest ball state in screen coordinates, or null when the ball is elsewhere
  var custom = null;    // prepared custom image
  var needs = true;
  var W = 1, H = 1, dpr = 1;
  var loadedImage = null, loadedKey = '';

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    needs = true;
  }

  function loadImage(url, removeBackground) {
    var key = (url ? 'img' : 'none') + '|' + removeBackground;
    if (url === loadedImage && key === loadedKey) return;
    loadedImage = url;
    loadedKey = key;
    custom = null;
    needs = true;
    if (!url) return;
    var im = new Image();
    im.onload = function () {
      if (loadedImage !== url) return;
      custom = removeBackground ? window.BallArt.prepareImage(im) : im;
      needs = true;
    };
    im.src = url;
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!st) return;

    var R = cfg.size / 2;
    var s = Math.max(8, Math.ceil(R * 2.3 * dpr * cfg.quality));
    if (sprite.width !== s || sprite.height !== s) { sprite.width = s; sprite.height = s; }
    window.BallArt.renderSprite(sctx, s, st.angle, custom);

    var speed = Math.hypot(st.vx, st.vy);
    var stretch = reduce ? 0 : Math.min(speed / 3000, 0.16);
    var ang = Math.atan2(st.vy, st.vx);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.save();
    ctx.translate(st.x - cfg.origin.x, st.y - cfg.origin.y);
    ctx.rotate(ang);
    ctx.scale(1 + stretch, 1 - stretch * 0.9);
    ctx.rotate(-ang);
    ctx.shadowColor = 'rgba(8, 8, 20, 0.38)';
    ctx.shadowBlur = R * 0.35 * dpr;
    ctx.shadowOffsetY = R * 0.18 * dpr;
    ctx.drawImage(sprite, -R * 1.15, -R * 1.15, R * 2.3, R * 2.3);
    ctx.restore();
  }

  function frame() {
    if (needs) { needs = false; draw(); }
    window.requestAnimationFrame(frame);
  }

  window.ballApi.onConfig(function (c) {
    cfg = Object.assign({}, cfg, c); // the image is only included when it changes
    resize();
    loadImage(c.image, c.removeBackground);
  });
  window.ballApi.onState(function (s) {
    st = s;
    needs = true;
  });
  window.addEventListener('resize', resize);

  resize();
  window.requestAnimationFrame(frame);
})();
