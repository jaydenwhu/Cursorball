// Draws the built-in ball and prepares custom images. Works in the overlay window and in Node
// (when used with a canvas library to render the app icons).
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BallArt = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var PALETTE = [[8, 88, 70], [40, 86, 76], [170, 55, 62]]; // coral, sand, teal as [h, s%, l%]
  var PATTERN = [0, 1, 2, 0, 1, 2];
  var DARK = '#1c1c25';

  function pol(r, t) { return [Math.cos(t) * r, Math.sin(t) * r]; }

  // Draws the built-in ball in unit space (radius 1). u = device pixels per unit, for glow blur.
  function drawBall(c, a, u) {
    var N = 6, step = Math.PI * 2 / N, i, col, a0, p0, c1, tip, c2, p1, g;
    c.lineJoin = 'round';
    c.lineCap = 'round';

    c.beginPath();
    c.arc(0, 0, 0.9, 0, Math.PI * 2);
    c.fillStyle = DARK;
    c.fill();

    for (i = 0; i < N; i++) {
      a0 = a + i * step;
      col = PALETTE[PATTERN[i]];
      p0 = pol(0.26, a0);
      c1 = pol(0.92, a0 + step * 0.12);
      tip = pol(1, a0 + step * 0.82);
      c2 = pol(0.5, a0 + step * 0.78);
      p1 = pol(0.26, a0 + step);
      g = c.createRadialGradient(0, 0, 0.2, 0, 0, 1);
      g.addColorStop(0, 'hsl(' + col[0] + ' ' + col[1] + '% ' + (col[2] - 16) + '%)');
      g.addColorStop(1, 'hsl(' + col[0] + ' ' + col[1] + '% ' + Math.min(94, col[2] + 6) + '%)');
      c.beginPath();
      c.moveTo(p0[0], p0[1]);
      c.quadraticCurveTo(c1[0], c1[1], tip[0], tip[1]);
      c.quadraticCurveTo(c2[0], c2[1], p1[0], p1[1]);
      c.closePath();
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = DARK;
      c.lineWidth = 0.055;
      c.stroke();
    }

    c.beginPath();
    c.arc(0, 0, 0.3, 0, Math.PI * 2);
    c.fillStyle = '#272731';
    c.fill();
    c.strokeStyle = DARK;
    c.lineWidth = 0.06;
    c.stroke();

    var cg = c.createRadialGradient(0, 0, 0.01, 0, 0, 0.15);
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(0.5, '#fff0c4');
    cg.addColorStop(1, '#ffc864');
    c.save();
    c.shadowColor = 'rgba(255, 200, 100, 0.95)';
    c.shadowBlur = 0.12 * u;
    c.beginPath();
    c.arc(0, 0, 0.15, 0, Math.PI * 2);
    c.fillStyle = cg;
    c.fill();
    c.restore();

    var m = pol(0.21, a);
    c.beginPath();
    c.arc(m[0], m[1], 0.03, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fill();
  }

  // Paints the ball (or a custom image) into a square sprite canvas context, S pixels wide.
  function renderSprite(sctx, S, angle, custom) {
    var u = S / 2.3;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, S, S);
    sctx.setTransform(u, 0, 0, u, S / 2, S / 2);
    if (custom) {
      var iw = custom.naturalWidth || custom.width, ih = custom.naturalHeight || custom.height;
      var k = 2 / Math.max(iw, ih);
      sctx.save();
      sctx.rotate(angle);
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(custom, -iw * k / 2, -ih * k / 2, iw * k, ih * k);
      sctx.restore();
    } else {
      drawBall(sctx, angle, u);
    }
    // Fixed light from the upper left so the spinning pattern reads as a sphere.
    sctx.globalCompositeOperation = 'source-atop';
    var g = sctx.createRadialGradient(-0.35, -0.4, 0.05, -0.15, -0.2, 1.5);
    g.addColorStop(0, 'rgba(255,255,255,0.24)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(10,10,40,0.3)');
    sctx.fillStyle = g;
    sctx.fillRect(-1.2, -1.2, 2.4, 2.4);
    sctx.globalCompositeOperation = 'source-over';
  }

  // Removes a flat background that touches the edges (a grey stage or white border), then crops
  // to a square centred on the artwork so it spins around its own centre. Browser only.
  function prepareImage(im) {
    var w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
    if (!w || !h) return im;
    var sc = Math.min(1, 2048 / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
    var a = document.createElement('canvas');
    a.width = cw; a.height = ch;
    var ac = a.getContext('2d', { willReadFrequently: true });
    ac.drawImage(im, 0, 0, cw, ch);
    var data;
    try { data = ac.getImageData(0, 0, cw, ch); } catch (e) { return im; }
    var d = data.data;
    var bg = [d[0], d[1], d[2], d[3]];
    var x, y;
    if (bg[3] > 250) {
      var seen = new Uint8Array(cw * ch), stack = [];
      var near = function (i) {
        if (d[i + 3] < 8) return true;
        if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) <= 36) return true;
        return d[i] >= 238 && d[i + 1] >= 238 && d[i + 2] >= 238;
      };
      var push = function (px, py) {
        var p = py * cw + px;
        if (!seen[p] && near(p * 4)) { seen[p] = 1; stack.push(p); }
      };
      for (x = 0; x < cw; x++) { push(x, 0); push(x, ch - 1); }
      for (y = 0; y < ch; y++) { push(0, y); push(cw - 1, y); }
      while (stack.length) {
        var q = stack.pop();
        x = q % cw; y = (q - x) / cw;
        d[q * 4 + 3] = 0;
        if (x > 0) push(x - 1, y);
        if (x < cw - 1) push(x + 1, y);
        if (y > 0) push(x, y - 1);
        if (y < ch - 1) push(x, y + 1);
      }
      ac.putImageData(data, 0, 0);
    }
    var minX = cw, minY = ch, maxX = -1, maxY = -1;
    for (y = 0; y < ch; y++) {
      for (x = 0; x < cw; x++) {
        if (d[(y * cw + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return im;
    var bw = maxX - minX + 1, bh = maxY - minY + 1;
    var side = Math.ceil(Math.max(bw, bh) * 1.04);
    var out = document.createElement('canvas');
    out.width = side; out.height = side;
    out.getContext('2d').drawImage(a, minX, minY, bw, bh, (side - bw) / 2, (side - bh) / 2, bw, bh);
    return out;
  }

  return { drawBall: drawBall, renderSprite: renderSprite, prepareImage: prepareImage };
});
