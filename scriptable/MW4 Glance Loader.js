// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: crosshairs;

/*
 * MW4 Glance Loader — paste this into Scriptable once.
 *
 * Replace the existing "Glance" script with this file and keep the name Glance.
 * The Home Screen widget stays pointed at it. If that script is gone, add a new
 * one, name it Glance, and select it on the widget.
 *
 * Every run downloads the latest full Glance widget from GitHub (main) and runs
 * it. The last copy that compiled is kept on this phone. A failed download runs
 * that copy. With no copy yet, the widget shows NO SCRIPT.
 *
 * Ship widget changes by merging them to main. Do not paste the full script again.
 * This file does not download the status feed — the script it runs does.
 * Tap ▶ once if the widget says AUTH NEEDED. The HUD code stays in the iOS Keychain.
 */

const SCRIPT_URL = "https://raw.githubusercontent.com/hunterbaileyco/mw4-command-hud/main/scriptable/MW4%20Glance.js";
const CACHE_NAME = "mw4-glance-script.js";
const MARKER = "MW4 Glance — Scriptable";
const TITLE = "MW4 GLANCE";

// Local documents persists and is shared with the widget extension.
// cacheDirectory is not shared with the widget and iOS may delete it.
// iCloud documents is the scripts folder and can stall a refresh while downloading.
function cacheFile() {
  const fm = FileManager.local();
  return { fm, path: fm.joinPath(fm.documentsDirectory(), CACHE_NAME) };
}

function stripBom(source) {
  if (source && source.charCodeAt(0) === 0xFEFF) return source.slice(1);
  return source;
}

function readCache() {
  const { fm, path } = cacheFile();
  try {
    if (fm.fileExists(path)) return stripBom(fm.readString(path));
  } catch (e) {}
  return null;
}

function writeCache(source) {
  const { fm, path } = cacheFile();
  fm.writeString(path, source);
}

function sourceOk(source) {
  return typeof source === "string"
    && source.length > 1000
    && source.indexOf(MARKER) !== -1
    && source.indexOf("Script.setWidget") !== -1
    && source.indexOf("<html") === -1
    && source.indexOf("<!DOCTYPE") === -1;
}

// The built widget uses top-level await. That is legal in the main Scriptable
// script and inside an async function. A plain Function/eval body rejects it.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function compile(source) {
  return new AsyncFunction(source);
}

function usable(source) {
  if (!sourceOk(source)) return false;
  try { compile(source); return true; } catch (e) { return false; }
}

async function fetchLatest(seconds) {
  const req = new Request(SCRIPT_URL + "?t=" + Date.now());
  req.timeoutInterval = seconds;
  req.headers = { "User-Agent": "Scriptable MW4 Loader", "Accept": "text/plain" };
  const source = stripBom(await req.loadString());
  if (!sourceOk(source)) throw new Error("unexpected script");
  return source;
}

async function resolveSource() {
  const cached = readCache();
  const cachedOk = usable(cached);
  // When a copy is already runnable, cap the download so a slow GitHub call
  // still leaves time for the widget's own encrypted-feed request.
  try {
    const fresh = await fetchLatest(cachedOk ? 4 : 8);
    if (!usable(fresh)) throw new Error("script did not compile");
    try { writeCache(fresh); } catch (e) {}
    return fresh;
  } catch (e) {
    return cachedOk ? cached : null;
  }
}

async function showError(detail) {
  const w = new ListWidget();
  w.backgroundColor = new Color("#0B0E0C");
  w.setPadding(12, 12, 12, 12);
  const title = w.addText(TITLE);
  title.font = Font.heavyMonospacedSystemFont(12);
  title.textColor = new Color("#C5A572");
  title.lineLimit = 1;
  w.addSpacer(4);
  const line = w.addText(detail);
  line.font = Font.mediumMonospacedSystemFont(11);
  line.textColor = new Color("#E07A5F");
  line.lineLimit = 3;
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
  if (config.runsInWidget) Script.setWidget(w);
  else {
    try { await w.presentSmall(); } catch (e) {}
  }
  Script.complete();
}

const source = await resolveSource();
if (!source) {
  await showError("NO SCRIPT\nRun once online");
} else {
  try {
    await compile(source)();
  } catch (e) {
    await showError("SCRIPT ERROR");
  }
}
