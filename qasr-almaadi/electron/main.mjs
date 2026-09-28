// Electron shell for the Qasr El Maadi hospital system.
// Runs the same Express + PGlite server in-process on 127.0.0.1 (no internet needed)
// and shows the unchanged web interface in a native window.
import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  safeStorage,
  shell,
} from "electron";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const PREFERRED_PORT = Number(process.env.QASR_PORT || 4310);
const BACKUP_KEEP = 14;
const BACKUP_EVERY_MS = 24 * 3600 * 1000;

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// The server reads package.json relative to the working directory.
process.chdir(appRoot);

const userDir = app.getPath("userData");
const configFile = path.join(userDir, "config.json");
const keyFile = path.join(userDir, "backup.key");
const readConfig = () => {
  try {
    return JSON.parse(readFileSync(configFile, "utf8"));
  } catch {
    return {};
  }
};
const writeConfig = (patch) => {
  mkdirSync(userDir, { recursive: true });
  writeFileSync(configFile, JSON.stringify({ ...readConfig(), ...patch }, null, 2));
};
const dataDir = () =>
  process.env.QASR_DATA_DIR || readConfig().dataDir || path.join(userDir, "data");
const backupDir = () =>
  readConfig().backupDir ||
  path.join(app.getPath("documents"), "QasrAlMaadi-Backups");

// ---- backup passphrase (kept with Windows DPAPI via safeStorage) ------------------
function saveBackupPassphrase(value) {
  if (!safeStorage.isEncryptionAvailable()) return false;
  mkdirSync(userDir, { recursive: true });
  writeFileSync(keyFile, safeStorage.encryptString(value));
  return true;
}
function loadBackupPassphrase() {
  try {
    return safeStorage.decryptString(readFileSync(keyFile));
  } catch {
    return "";
  }
}

let engine; // the bundled server module
let db;
let running;
let mainWindow;
let setupWindow;
let quitting = false;
let booting = true; // setup/main window handoff must not count as "all windows closed"

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

async function backupNow({ automatic }) {
  const passphrase = loadBackupPassphrase();
  if (!passphrase) throw new Error("لم يتم ضبط كلمة سر النسخ الاحتياطي.");
  const dir = backupDir();
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `qasr-almaadi-${stamp()}.enc`);
  await engine.backupDatabase(dataDir(), target, passphrase);
  if (automatic) pruneBackups(dir);
  return target;
}
function pruneBackups(dir) {
  const files = readdirSync(dir)
    .filter((f) => /^qasr-almaadi-.*\.enc$/.test(f))
    .map((f) => ({ f, t: statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const old of files.slice(BACKUP_KEEP)) {
    try {
      unlinkSync(path.join(dir, old.f));
    } catch {}
  }
}
function lastBackupAge() {
  try {
    const dir = backupDir();
    const times = readdirSync(dir)
      .filter((f) => /^qasr-almaadi-.*\.enc$/.test(f))
      .map((f) => statSync(path.join(dir, f)).mtimeMs);
    return times.length ? Date.now() - Math.max(...times) : Infinity;
  } catch {
    return Infinity;
  }
}

// ---- server lifecycle -------------------------------------------------------------
async function startServer() {
  db = await engine.initDb(dataDir());
  running = await engine.serve(db, {
    staticDir: path.join(appRoot, "dist"),
    port: PREFERRED_PORT,
  });
}
async function stopServer() {
  try {
    await running?.close();
  } finally {
    running = undefined;
    try {
      await db?.close();
    } finally {
      db = undefined;
    }
  }
}

// ---- windows ----------------------------------------------------------------------
function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: "نظام مستشفى قصر المعادي",
    icon: path.join(appRoot, "build", "icon.png"),
    autoHideMenuBar: true,
    backgroundColor: "#0b1329",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const origin = new URL(url).origin;
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (new URL(target).origin === origin) {
      // Print previews and reports open as native child windows.
      return {
        action: "allow",
        overrideBrowserWindowOptions: { autoHideMenuBar: true, width: 1000, height: 800 },
      };
    }
    shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (new URL(target).origin !== origin) {
      event.preventDefault();
      shell.openExternal(target);
    }
  });
  mainWindow.on("closed", () => (mainWindow = undefined));
  mainWindow.loadURL(url);
}

function showSetupWindow() {
  return new Promise((resolve) => {
    setupWindow = new BrowserWindow({
      width: 620,
      height: 760,
      resizable: false,
      title: "الإعداد الأول — مستشفى قصر المعادي",
      icon: path.join(appRoot, "build", "icon.png"),
      autoHideMenuBar: true,
      backgroundColor: "#0b1329",
      webPreferences: {
        preload: path.join(here, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    let done = false;
    ipcMain.handle("setup:submit", async (_e, form) => {
      const f = form || {};
      if (f.password !== f.confirm) return { ok: false, error: "تأكيد كلمة المرور غير مطابق." };
      if (String(f.backupPassphrase || "").length < 16)
        return { ok: false, error: "كلمة سر النسخ الاحتياطي يجب ألا تقل عن 16 حرفًا." };
      if (!safeStorage.isEncryptionAvailable())
        return { ok: false, error: "تعذر حفظ كلمة سر النسخ الاحتياطي بأمان على هذا الجهاز." };
      try {
        await engine.setupSystem(db, {
          username: String(f.username || "admin"),
          password: String(f.password || ""),
          hospitalName: String(f.hospitalName || ""),
        });
      } catch (error) {
        return { ok: false, error: translateSetupError(error) };
      }
      saveBackupPassphrase(String(f.backupPassphrase));
      done = true;
      setupWindow?.close();
      return { ok: true };
    });
    setupWindow.on("closed", () => {
      ipcMain.removeHandler("setup:submit");
      setupWindow = undefined;
      resolve(done);
    });
    setupWindow.loadFile(path.join(here, "setup.html"));
  });
}
function translateSetupError(error) {
  const m = String(error?.message || error);
  if (m.includes("username must be")) return "اسم المستخدم من 3 إلى 64 حرفًا إنجليزيًا أو أرقامًا (يسمح بـ . _ -).";
  if (m.includes("password of 16")) return "كلمة مرور الإدارة يجب أن تكون من 16 إلى 256 حرفًا بدون مسافات في الأطراف.";
  if (m.includes("hospital name")) return "اسم المستشفى مطلوب (حتى 160 حرفًا).";
  if (m.includes("already has users")) return "النظام مُعدّ بالفعل.";
  return m;
}

// ---- menu -------------------------------------------------------------------------
function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "النظام",
        submenu: [
          { label: "نسخة احتياطية الآن", click: () => runManualBackup() },
          { label: "فتح مجلد النسخ الاحتياطية", click: () => shell.openPath(backupDir()) },
          { label: "اختيار مجلد النسخ الاحتياطية…", click: () => chooseBackupDir() },
          { label: "استرجاع نسخة احتياطية…", click: () => restoreFlow() },
          { type: "separator" },
          { role: "quit", label: "خروج" },
        ],
      },
      {
        label: "عرض",
        submenu: [
          { role: "reload", label: "إعادة تحميل" },
          { role: "zoomIn", label: "تكبير" },
          { role: "zoomOut", label: "تصغير" },
          { role: "resetZoom", label: "الحجم الافتراضي" },
          { role: "togglefullscreen", label: "ملء الشاشة" },
        ],
      },
    ]),
  );
}
async function withServerStopped(task) {
  // PGlite holds an exclusive lock, so the server is stopped around backup/restore.
  await stopServer();
  try {
    return await task();
  } finally {
    if (!quitting) {
      await startServer();
      mainWindow?.loadURL(`http://127.0.0.1:${running.port}`);
    }
  }
}
async function runManualBackup() {
  try {
    const target = await withServerStopped(() => backupNow({ automatic: false }));
    dialog.showMessageBox({ type: "info", message: "تم إنشاء النسخة الاحتياطية", detail: target });
  } catch (error) {
    dialog.showErrorBox("فشل النسخ الاحتياطي", String(error?.message || error));
  }
}
async function chooseBackupDir() {
  const r = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
    defaultPath: backupDir(),
  });
  if (!r.canceled && r.filePaths[0]) writeConfig({ backupDir: r.filePaths[0] });
}
async function restoreFlow() {
  const pick = await dialog.showOpenDialog({
    title: "اختر ملف النسخة الاحتياطية",
    properties: ["openFile"],
    filters: [{ name: "نسخة احتياطية", extensions: ["enc"] }],
    defaultPath: backupDir(),
  });
  if (pick.canceled || !pick.filePaths[0]) return;
  const confirm = await dialog.showMessageBox({
    type: "warning",
    buttons: ["استرجاع", "إلغاء"],
    defaultId: 1,
    cancelId: 1,
    message: "سيُنشأ نظام جديد من هذه النسخة ويُستخدم بدل الحالي.",
    detail: "لا تُحذف بيانات النظام الحالي؛ تبقى في مكانها ويمكن الرجوع إليها.",
  });
  if (confirm.response !== 0) return;
  try {
    const target = path.join(userDir, `data-restored-${stamp()}`);
    await stopServer();
    await engine.restoreDatabase(pick.filePaths[0], target, loadBackupPassphrase());
    writeConfig({ dataDir: target });
    app.relaunch();
    quitting = true;
    app.exit(0);
  } catch (error) {
    dialog.showErrorBox("فشل الاسترجاع", String(error?.message || error));
    if (!running) {
      await startServer();
      mainWindow?.loadURL(`http://127.0.0.1:${running.port}`);
    }
  }
}

// ---- boot -------------------------------------------------------------------------
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on("before-quit", async (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  try {
    await stopServer();
  } finally {
    app.exit(0);
  }
});
app.on("window-all-closed", () => {
  if (!booting) app.quit();
});

app.whenReady().then(async () => {
  try {
    engine = await import(path.join(here, "server.mjs"));
    // Daily automatic encrypted backup, taken before the database is opened.
    if (existsSync(path.join(dataDir(), "PG_VERSION")) && loadBackupPassphrase() && lastBackupAge() > BACKUP_EVERY_MS) {
      try {
        await backupNow({ automatic: true });
      } catch (error) {
        console.error("Automatic backup failed:", error);
      }
    }
    await startServer();
    if (!(await engine.hasUsers(db))) {
      if (!(await showSetupWindow())) return app.quit();
    }
    buildMenu();
    createMainWindow(`http://127.0.0.1:${running.port}`);
    booting = false;
  } catch (error) {
    dialog.showErrorBox(
      "تعذر تشغيل النظام",
      `${String(error?.message || error)}\n\nإذا كان النظام مفتوحًا في نافذة أخرى فأغلقها ثم أعد المحاولة.`,
    );
    app.exit(1);
  }
});
