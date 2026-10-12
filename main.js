'use strict';
const { app, BrowserWindow, Tray, Menu, screen, dialog, nativeImage, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULTS = {
  enabled: true,
  size: 120,
  follow: 5,
  quality: 2,
  beside: true,
  removeBackground: true,
  imageFile: null,
  launchAtLogin: false
};

const IMAGE_NAME = /^ball-image\.(png|jpe?g|gif|webp|svg)$/;
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };

let settings = { ...DEFAULTS };
let settingsPath = '';
let tray = null;
let windows = [];            // { win, bounds, ready, shown }
let union = { minX: 0, minY: 0, maxX: 1920, maxY: 1080 };
let imageCache = null;
let imageVersion = 0;        // bumps whenever the chosen image changes, so it is only sent when needed
let settingsWin = null;
let saveTimer = null;
let rebuildTimer = null;

// Ball state, in screen coordinates (points).
const ball = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 };
let placed = false;
let wasSettled = false;
let dirty = true;
let timer = null;
let lastT = process.hrtime.bigint();

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// ---------- Saved settings ----------

function sanitize(raw) {
  const s = { ...DEFAULTS };
  if (raw && typeof raw === 'object') {
    if (typeof raw.enabled === 'boolean') s.enabled = raw.enabled;
    if (typeof raw.size === 'number') s.size = clamp(raw.size, 48, 320);
    if (typeof raw.follow === 'number') s.follow = clamp(raw.follow, 1, 10);
    if (typeof raw.quality === 'number') s.quality = clamp(raw.quality, 0.5, 4);
    if (typeof raw.beside === 'boolean') s.beside = raw.beside;
    if (typeof raw.removeBackground === 'boolean') s.removeBackground = raw.removeBackground;
    if (typeof raw.imageFile === 'string' && IMAGE_NAME.test(raw.imageFile)) s.imageFile = raw.imageFile;
    if (typeof raw.launchAtLogin === 'boolean') s.launchAtLogin = raw.launchAtLogin;
  }
  return s;
}

function loadSettings() {
  try {
    settings = sanitize(JSON.parse(fs.readFileSync(settingsPath, 'utf8')));
  } catch (e) {
    settings = { ...DEFAULTS };
  }
}

function writeSettingsNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log('Settings saved:', settings);
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

function saveSettings() {
  clearTimeout(saveTimer);
  // Write immediately - don't wait
  writeSettingsNow();
}

// ---------- Image ----------

function currentImage() {
  if (!settings.imageFile) return null;
  if (imageCache) return imageCache;
  try {
    const file = path.join(app.getPath('userData'), settings.imageFile);
    const ext = path.extname(file).slice(1).toLowerCase();
    if (!MIME[ext]) return null;
    imageCache = 'data:' + MIME[ext] + ';base64,' + fs.readFileSync(file).toString('base64');
    return imageCache;
  } catch (e) {
    return null;
  }
}

async function chooseImage() {
  app.focus({ steal: true });
  const dialogOptions = {
    title: 'Choose a ball image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]
  };
  const parent = settingsWin && !settingsWin.isDestroyed() ? settingsWin : null;
  const result = parent ? await dialog.showOpenDialog(parent, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || !result.filePaths[0]) return;
  const src = result.filePaths[0];
  const ext = path.extname(src).toLowerCase().replace('jpeg', 'jpg');
  const name = 'ball-image' + ext;
  if (!IMAGE_NAME.test(name)) {
    dialog.showErrorBox('Unsupported image', 'Choose a PNG, JPG, GIF, WebP or SVG file.');
    return;
  }
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, path.join(dir, name));
    if (settings.imageFile && settings.imageFile !== name) {
      fs.rmSync(path.join(dir, settings.imageFile), { force: true });
    }
    update({ imageFile: name });
  } catch (e) {
    dialog.showErrorBox('Could not use that image', String((e && e.message) || e));
  }
}

function useBuiltInBall() {
  if (settings.imageFile) {
    try { fs.rmSync(path.join(app.getPath('userData'), settings.imageFile), { force: true }); } catch (e) { /* ignore */ }
  }
  update({ imageFile: null });
}

// ---------- Settings changes ----------

function update(patch) {
  // Always preserve imageFile unless explicitly being changed to something else
  if (!('imageFile' in patch) && settings.imageFile) {
    patch.imageFile = settings.imageFile;
  }
  Object.assign(settings, patch);
  if ('imageFile' in patch) { imageCache = null; imageVersion++; }
  if ('launchAtLogin' in patch && app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: !!settings.launchAtLogin });
  }
  if ('enabled' in patch) applyEnabled();
  sendConfigAll();
  dirty = true;
  saveSettings();
  buildMenu();
  notifySettings();
}

// Only accept known keys with sensible ranges from the Settings window.
function cleanPatch(p) {
  const out = {};
  if (!p || typeof p !== 'object') return out;
  if (typeof p.size === 'number' && isFinite(p.size)) out.size = Math.round(clamp(p.size, 48, 320));
  if (typeof p.follow === 'number' && isFinite(p.follow)) out.follow = clamp(p.follow, 1, 10);
  if (p.quality === 1 || p.quality === 2 || p.quality === 4) out.quality = p.quality;
  ['beside', 'removeBackground', 'enabled', 'launchAtLogin'].forEach((k) => {
    if (typeof p[k] === 'boolean') out[k] = p[k];
  });
  // Always preserve imageFile - it should never be lost when any setting changes
  if (typeof p.imageFile === 'string' && IMAGE_NAME.test(p.imageFile)) {
    out.imageFile = p.imageFile;
  } else if (settings.imageFile) {
    out.imageFile = settings.imageFile;
  }
  return out;
}

function snapshot() {
  return { ...settings, packaged: app.isPackaged };
}

function notifySettings() {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('settings:changed', snapshot());
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    app.focus({ steal: true });
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 440,
    height: 600,
    title: 'Cursor Ball Settings',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'settings', 'settings.html'));
  settingsWin.once('ready-to-show', () => {
    app.focus({ steal: true });
    settingsWin.show();
  });
  settingsWin.on('closed', () => { settingsWin = null; });
}

function resetSettings() {
  if (settings.imageFile) {
    try { fs.rmSync(path.join(app.getPath('userData'), settings.imageFile), { force: true }); } catch (e) { /* ignore */ }
  }
  update({ ...DEFAULTS });
}

// ---------- Overlay windows (one per display) ----------

function computeUnion() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of screen.getAllDisplays()) {
    const b = d.bounds;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  union = { minX, minY, maxX, maxY };
}

function configFor(entry) {
  const cfg = {
    origin: { x: entry.bounds.x, y: entry.bounds.y },
    size: settings.size,
    quality: settings.quality,
    removeBackground: settings.removeBackground
  };
  // The picture can be large, so it is only sent when it is new to this window.
  if (entry.imageVersion !== imageVersion) {
    cfg.image = currentImage();
    entry.imageVersion = imageVersion;
  }
  return cfg;
}

function sendConfig(entry) {
  if (entry.ready && !entry.win.isDestroyed()) entry.win.webContents.send('config', configFor(entry));
}

function sendConfigAll() {
  windows.forEach(sendConfig);
}

function buildWindows() {
  for (const entry of windows) {
    try { entry.win.destroy(); } catch (e) { /* already gone */ }
  }
  windows = [];
  computeUnion();

  for (const display of screen.getAllDisplays()) {
    const b = display.bounds;
    const win = new BrowserWindow({
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      focusable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      enableLargerThanScreen: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    });
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setBounds(b);

    const entry = { win, bounds: b, ready: false, shown: false, imageVersion: -1 };
    win.webContents.on('did-finish-load', () => {
      entry.ready = true;
      sendConfig(entry);
      if (settings.enabled && !win.isDestroyed()) win.showInactive();
    });
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    windows.push(entry);
  }
  dirty = true;
}

function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(buildWindows, 300);
}

// ---------- Physics ----------

function physics(dt, cursor) {
  const R = settings.size / 2;
  const k = 8 + settings.follow * settings.follow * 4; // spring stiffness
  const c = 2 * 0.82 * Math.sqrt(k);                   // damping, just under critical
  const n = 2;
  const h = dt / n;
  let tx = cursor.x;
  let ty = cursor.y;

  for (let i = 0; i < n; i++) {
    tx = cursor.x;
    ty = cursor.y;
    if (settings.beside) {
      let dx = ball.x - cursor.x;
      let dy = ball.y - cursor.y;
      let d = Math.hypot(dx, dy);
      if (d < 0.001) { dx = -1; dy = 0; d = 1; }
      const gap = R * 1.2 + 14;
      tx = cursor.x + (dx / d) * gap;
      ty = cursor.y + (dy / d) * gap;
    }
    ball.vx += (k * (tx - ball.x) - c * ball.vx) * h;
    ball.vy += (k * (ty - ball.y) - c * ball.vy) * h;
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;
  }

  const lo = R * 0.5;
  if (ball.x < union.minX + lo) { ball.x = union.minX + lo; ball.vx = Math.max(0, ball.vx); }
  if (ball.x > union.maxX - lo) { ball.x = union.maxX - lo; ball.vx = Math.min(0, ball.vx); }
  if (ball.y < union.minY + lo) { ball.y = union.minY + lo; ball.vy = Math.max(0, ball.vy); }
  if (ball.y > union.maxY - lo) { ball.y = union.maxY - lo; ball.vy = Math.min(0, ball.vy); }

  // Rolling without slipping: the surface turns by distance travelled divided by radius.
  ball.angle += ((ball.vx + 0.35 * ball.vy) / R) * dt;

  const settled = Math.hypot(ball.vx, ball.vy) < 0.3 && Math.hypot(tx - ball.x, ty - ball.y) < 0.3;
  if (settled) { ball.vx = 0; ball.vy = 0; }
  return settled;
}

function broadcast() {
  const R = settings.size / 2;
  const reach = R * 1.4;
  const state = { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, angle: ball.angle };
  for (const entry of windows) {
    if (!entry.ready || entry.win.isDestroyed()) continue;
    const b = entry.bounds;
    const visible = ball.x + reach > b.x && ball.x - reach < b.x + b.width &&
                    ball.y + reach > b.y && ball.y - reach < b.y + b.height;
    if (visible) {
      entry.win.webContents.send('state', state);
      entry.shown = true;
    } else if (entry.shown) {
      entry.win.webContents.send('state', null);
      entry.shown = false;
    }
  }
}

function clearAll() {
  for (const entry of windows) {
    if (entry.ready && entry.shown && !entry.win.isDestroyed()) entry.win.webContents.send('state', null);
    entry.shown = false;
  }
}

function loop() {
  if (!settings.enabled) return;
  const now = process.hrtime.bigint();
  let dt = Number(now - lastT) / 1e9;
  lastT = now;
  if (!(dt > 0)) return;
  dt = Math.min(dt, 0.05);

  const cursor = screen.getCursorScreenPoint();
  if (!placed) {
    // Start a little to the left of the cursor so the ball rolls in when the app opens.
    const R = settings.size / 2;
    ball.x = clamp(cursor.x - 420, union.minX + R, union.maxX - R);
    ball.y = cursor.y;
    ball.vx = 0;
    ball.vy = 0;
    placed = true;
    wasSettled = false;
  }
  const settled = physics(dt, cursor);
  if (settled && wasSettled && !dirty) return;
  wasSettled = settled;
  dirty = false;
  broadcast();
}

function applyEnabled() {
  if (settings.enabled) {
    placed = false;
    lastT = process.hrtime.bigint();
    for (const entry of windows) {
      if (entry.ready && !entry.win.isDestroyed()) entry.win.showInactive();
    }
    if (!timer) timer = setInterval(loop, 8);
  } else {
    if (timer) { clearInterval(timer); timer = null; }
    clearAll();
    for (const entry of windows) {
      if (!entry.win.isDestroyed()) entry.win.hide();
    }
  }
}

// ---------- Menu bar ----------

function radio(label, key, value) {
  return { label, type: 'radio', checked: settings[key] === value, click: () => update({ [key]: value }) };
}

function buildMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: 'Settings…', accelerator: 'Command+,', click: openSettings },
    { label: settings.enabled ? 'Hide ball' : 'Show ball', click: () => update({ enabled: !settings.enabled }) },
    { type: 'separator' },
    {
      label: 'Size',
      submenu: [radio('Small', 'size', 80), radio('Medium', 'size', 120), radio('Large', 'size', 180), radio('Huge', 'size', 240)]
    },
    {
      label: 'Follow speed',
      submenu: [radio('Lazy', 'follow', 3), radio('Normal', 'follow', 5), radio('Snappy', 'follow', 8)]
    },
    {
      label: 'Resolution',
      submenu: [radio('Standard (1×)', 'quality', 1), radio('Sharp (2×)', 'quality', 2), radio('Ultra (4×)', 'quality', 4)]
    },
    { label: 'Stay beside cursor', type: 'checkbox', checked: settings.beside, click: (item) => update({ beside: item.checked }) },
    { type: 'separator' },
    { label: 'Choose image…', click: chooseImage },
    {
      label: 'Remove image background',
      type: 'checkbox',
      checked: settings.removeBackground,
      click: (item) => update({ removeBackground: item.checked })
    },
    { label: 'Use built-in ball', enabled: !!settings.imageFile, click: useBuiltInBall },
    { type: 'separator' },
    {
      label: 'Open at login',
      type: 'checkbox',
      checked: settings.launchAtLogin,
      enabled: app.isPackaged,
      click: (item) => update({ launchAtLogin: item.checked })
    },
    { label: 'Reset settings', click: resetSettings },
    { type: 'separator' },
    { label: 'Quit Cursor Ball', role: 'quit' }
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Cursor Ball');
  buildMenu();
}

// ---------- App lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('window-all-closed', () => { /* keep running in the menu bar */ });
  app.on('before-quit', writeSettingsNow);

  app.whenReady().then(() => {
    if (process.platform === 'darwin') {
      app.setActivationPolicy('accessory');
      if (app.dock) app.dock.hide();
    }
    settingsPath = path.join(app.getPath('userData'), 'settings.json');
    loadSettings();
    ipcMain.handle('settings:get', () => snapshot());
    ipcMain.on('settings:set', (_event, patch) => update(cleanPatch(patch)));
    ipcMain.on('settings:choose-image', () => { chooseImage(); });
    ipcMain.on('settings:use-builtin', useBuiltInBall);
    ipcMain.on('settings:reset', resetSettings);
    createTray();
    buildWindows();
    applyEnabled();

    screen.on('display-added', scheduleRebuild);
    screen.on('display-removed', scheduleRebuild);
    screen.on('display-metrics-changed', scheduleRebuild);
  });
}
