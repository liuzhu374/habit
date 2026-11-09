import { app, BrowserWindow, Menu, nativeTheme, shell } from 'electron';
import path from 'node:path';
import { startServer } from '../server.js';

// 数据放在 ~/Library/Application Support/Habit/data（Mac）或 %APPDATA%\Habit\data（Windows）；HABIT_DATA 仅供测试时覆盖
const IS_MAC = process.platform === 'darwin';
const DATA_DIR = process.env.HABIT_DATA || path.join(app.getPath('userData'), 'data');

let baseUrl;
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 800,
    minWidth: 420,
    minHeight: 560,
    title: 'Habit',
    // Mac 隐藏标题栏、保留红绿灯；Windows 用系统标题栏，并去掉菜单栏
    ...(IS_MAC ? { titleBarStyle: 'hiddenInset' } : { autoHideMenuBar: true }),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1C1B20' : '#FAF7F2',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadURL(`${baseUrl}/?app=${IS_MAC ? 'mac' : 'win'}`);
  win.once('ready-to-show', () => win.show());

  // 自己的图片 / PDF 在新窗口打开，外部链接交给默认浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(baseUrl)) return { action: 'allow', overrideBrowserWindowOptions: { width: 900, height: 900 } };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(baseUrl)) return;
    e.preventDefault();
    shell.openExternal(url);
  });
  win.on('closed', () => { win = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return createWindow();
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  // 关掉窗口后点 Dock 图标，会重新打开并挑一条新的
  app.on('activate', () => { if (!win && baseUrl) createWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

  app.whenReady().then(async () => {
    if (!IS_MAC) Menu.setApplicationMenu(null);
    ({ url: baseUrl } = await startServer({ dataDir: DATA_DIR }));
    createWindow();
  });
}
