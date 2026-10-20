"use strict";

const path = require("path");
const fs = require("fs");

function startLocalCrashReporter({ app, crashReporter, writeLog = () => {} }) {
  try {
    const dumpPath = path.join(app.getPath("userData"), "crash-dumps");
    fs.mkdirSync(dumpPath, { recursive: true });
    app.setPath("crashDumps", dumpPath);
    crashReporter.start({ productName: app.getName(), uploadToServer: false });
    writeLog("main:crash-reporter-ready", { dumpPath, uploadToServer: false });
    return dumpPath;
  } catch (error) {
    writeLog("main:crash-reporter-unavailable", { message: String(error?.message || error) });
    return null;
  }
}

const FAILED_RENDERER_REASONS = new Set([
  "crashed", "oom", "abnormal-exit", "launch-failed", "integrity-failure", "memory-eviction"
]);

function createRendererCrashRecovery({ app, dialog, createWindow, getMainWindow, isQaRun = false, writeLog = () => {}, defer = setImmediate }) {
  const handled = new WeakSet();
  const closingWindows = new WeakSet();
  let appClosing = false;
  let dialogPending = false;
  app.on("before-quit", () => { appClosing = true; });

  const available = (win) => !appClosing && !!win && !win.isDestroyed() && !closingWindows.has(win) && getMainWindow() === win;

  function handleRendererGone(win, details = {}) {
    if (isQaRun || !FAILED_RENDERER_REASONS.has(details.reason) || !available(win) || handled.has(win) || dialogPending) return false;
    handled.add(win);
    dialogPending = true;
    // Leave Chromium's process-death observer stack before opening a dialog or
    // creating another renderer. Each failed window gets one explicit choice.
    defer(async () => {
      try {
        if (!available(win)) return;
        const { response } = await dialog.showMessageBox(win, {
          type: "error",
          title: "iNTeRcepted",
          message: "The game stopped unexpectedly.",
          detail: "Restart the game to continue from your saved progress. Your existing saves are kept. Progress that had not been saved may be lost.",
          buttons: ["Restart game", "Close"],
          defaultId: 0,
          cancelId: 1,
          noLink: true
        });
        if (!available(win)) return;
        if (response === 0) {
          // A fresh window avoids the crashed renderer's local cache. Create
          // first so closing the old window cannot trigger window-all-closed.
          const replacement = createWindow();
          if (!replacement || replacement === win || replacement.isDestroyed()) throw new Error("Replacement game window was not created");
          writeLog("main:renderer-restart", { reason: String(details.reason || ""), exitCode: Number(details.exitCode || 0) });
          win.destroy();
        } else {
          appClosing = true;
          app.quit();
        }
      } catch (error) {
        writeLog("main:renderer-recovery-failed", { message: String(error?.message || error) });
        if (!appClosing) {
          appClosing = true;
          app.quit();
        }
      } finally {
        dialogPending = false;
      }
    });
    return true;
  }

  return {
    handleRendererGone,
    markWindowClosing(win) { closingWindows.add(win); }
  };
}

module.exports = { startLocalCrashReporter, createRendererCrashRecovery };
