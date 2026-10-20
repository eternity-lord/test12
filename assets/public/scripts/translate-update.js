#!/usr/bin/env node
"use strict";

const fs = require("fs");
const https = require("https");
const path = require("path");
const readline = require("readline");

const {
  ROOT,
  TRANSLATIONS_DIR,
  TARGET_LANGUAGES,
  readJsonFile,
  writeJsonFile,
  extractStoryStrings,
  extractTaggedUiStrings,
  extractPlaceholders,
  hasBrokenBraces,
  looksLikePathOrId,
  translationText,
  translationStatus
} = require("../tools/i18n/common");

const REPORT_DIR = path.join(ROOT, "reports", "i18n");
const DEFAULT_MODEL = process.env.OPENAI_TRANSLATION_MODEL || "gpt-4o-mini";
const DEFAULT_BATCH_SIZE = Number(process.env.TRANSLATION_BATCH_SIZE || 35);
const REQUEST_TIMEOUT_MS = Number(process.env.TRANSLATION_TIMEOUT_MS || 120000);
const INTER_REQUEST_DELAY_MS = Number(process.env.TRANSLATION_DELAY_MS || 800);
const MAX_RETRIES = Number(process.env.TRANSLATION_MAX_RETRIES || 4);

const LANGUAGE_NAMES = {
  fr: "French",
  de: "German",
  es: "Latin American Spanish",
  pt: "Brazilian Portuguese",
  it: "Italian",
  ru: "Russian",
  ar: "Modern Standard Arabic for texting",
  hi: "Hindi",
  ja: "Japanese casual texting",
  ko: "Korean casual texting",
  "zh-CN": "Simplified Chinese"
};

const LANGUAGE_STYLE = {
  fr: "Use natural French texting, with tu rather than vous unless the source is explicitly formal.",
  de: "Use natural German messaging, warm and direct rather than stiff.",
  es: "Use natural Latin American Spanish, casual and readable.",
  pt: "Use natural Brazilian Portuguese, not European Portuguese.",
  it: "Use natural Italian messaging, casual where the source is casual.",
  ru: "Use natural Russian messaging style with emotional nuance.",
  ar: "Use Modern Standard Arabic suitable for texting; keep it clear and natural.",
  hi: "Use natural Hindi suitable for phone messages; preserve a casual chat rhythm.",
  ja: "Use natural casual Japanese texting; avoid stiff literal phrasing.",
  ko: "Use natural Korean casual texting; preserve the relationship tone.",
  "zh-CN": "Use natural Simplified Chinese messaging; preserve short chat rhythm."
};

function norm(raw) {
  return String(raw || "").trim().replace(/\\/g, "/");
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = {
    scope: "all",
    langs: TARGET_LANGUAGES.slice(),
    model: DEFAULT_MODEL,
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    noBackup: false,
    forceMasonGenderNeutral: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw === "--no-backup") args.noBackup = true;
    else if (raw === "--force-mason-gender-neutral") args.forceMasonGenderNeutral = true;
    else if (raw.startsWith("--scope=")) args.scope = raw.slice("--scope=".length).trim() || "all";
    else if (raw === "--scope") args.scope = String(argv[++i] || "all").trim();
    else if (raw.startsWith("--langs=")) args.langs = raw.slice("--langs=".length).split(",").map((v) => v.trim()).filter(Boolean);
    else if (raw === "--langs") args.langs = String(argv[++i] || "").split(",").map((v) => v.trim()).filter(Boolean);
    else if (raw.startsWith("--model=")) args.model = raw.slice("--model=".length).trim() || DEFAULT_MODEL;
    else if (raw === "--model") args.model = String(argv[++i] || DEFAULT_MODEL).trim();
    else if (raw.startsWith("--batch-size=")) args.batchSize = Number(raw.slice("--batch-size=".length)) || DEFAULT_BATCH_SIZE;
    else if (raw === "--batch-size") args.batchSize = Number(argv[++i]) || DEFAULT_BATCH_SIZE;
    else throw new Error(`Unknown argument: ${raw}`);
  }

  args.langs = args.langs.filter((lang) => TARGET_LANGUAGES.includes(lang));
  if (!args.langs.length) throw new Error("No supported languages selected.");
  if (!["all", "evelyn", "mason-ntr"].includes(args.scope)) throw new Error("--scope must be all, evelyn, or mason-ntr");
  if (!Number.isFinite(args.batchSize) || args.batchSize < 1) args.batchSize = DEFAULT_BATCH_SIZE;
  return args;
}

function askApiKey() {
  const existing = String(process.env.OPENAI_API_KEY || "").trim();
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("Please enter your OpenAI API key: ", (answer) => {
      rl.close();
      resolve(String(answer || "").trim());
    });
  });
}

function protectedTokens(text) {
  const matches = String(text || "").match(/\{\{[^{}]+\}\}|\{name:[^{}]+\}/g);
  return matches ? matches.slice().sort() : [];
}

function emojiTokens(text) {
  const matches = String(text || "").match(/\p{Extended_Pictographic}/gu);
  return matches ? matches.slice().sort() : [];
}

function maskProtectedText(text) {
  const replacements = [];
  const masked = String(text || "").replace(/\{\{[^{}]+\}\}|\{name:[^{}]+\}|\p{Extended_Pictographic}/gu, (match) => {
    const token = `[[PROTECTED_${replacements.length}]]`;
    replacements.push([token, match]);
    return token;
  });
  return { text: masked, replacements };
}

function restoreProtectedText(text, replacements) {
  let out = String(text || "");
  for (const [token, original] of replacements || []) {
    out = out.split(token).join(original);
  }
  return out;
}

function sameList(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}

function parseModelJson(content) {
  const raw = String(content || "").trim();
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1]);
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(raw.slice(first, last + 1));
  throw new Error("Model did not return JSON");
}

function isEvelynUpdateKey(key) {
  if (key.startsWith("ui.")) return true;
  const storyPath = norm(key.split("::")[0] || "");
  return /^story\/DAY(9|1[0-5])\/(love|ntr|nts)\//i.test(storyPath)
    && /(EVELYN|HAK_HEARTSPIKE)/i.test(storyPath);
}

function isMasonNtrUpdateKey(key) {
  const storyPath = norm(key.split("::")[0] || "");
  if (/^story\/DAY(9|1[0-5])\/ntr\//i.test(storyPath)) return true;
  return /^story\/DAY(9|1[0-5])\/DAY(?:9_00_AIDEN_CHECKIN|(?:1[0-5])_00_AIDEN_SHARED)\.json$/i.test(storyPath);
}

function collectCatalog(scope) {
  const story = extractStoryStrings();
  const ui = extractTaggedUiStrings();
  const all = { ...story.strings, ...ui.strings };
  const strings = {};
  for (const key of Object.keys(all).sort()) {
    if (scope === "evelyn" && !isEvelynUpdateKey(key)) continue;
    if (scope === "mason-ntr" && !isMasonNtrUpdateKey(key)) continue;
    strings[key] = all[key];
  }
  return {
    storyFilesScanned: story.files,
    storyEpisodeFiles: story.episodeFiles,
    uiFilesScanned: ui.files,
    allStringCount: Object.keys(all).length,
    strings
  };
}

function buildSourceReuseIndex(data) {
  const index = new Map();
  for (const entry of Object.values(data || {})) {
    if (!entry || typeof entry !== "object") continue;
    const source = String(entry.source || "");
    const text = String(translationText(entry) || "").trim();
    if (!source || !text) continue;
    if (!index.has(source)) index.set(source, {
      translation: text,
      status: translationStatus(entry) || "machine"
    });
  }
  return index;
}

function syncLanguageData(data, allStrings) {
  const reuse = buildSourceReuseIndex(data);
  const next = {};
  let added = 0;
  let removed = 0;
  let reusedBySource = 0;
  let resetChangedSource = 0;

  for (const key of Object.keys(allStrings).sort()) {
    const source = allStrings[key];
    const old = data && typeof data === "object" ? data[key] : null;
    if (old && typeof old === "object" && old.source === source) {
      next[key] = {
        source,
        translation: String(translationText(old) || ""),
        status: translationStatus(old) || (String(translationText(old) || "").trim() ? "machine" : "todo")
      };
      continue;
    }

    if (old) resetChangedSource += 1;
    else added += 1;

    const reused = reuse.get(source);
    if (reused) {
      reusedBySource += 1;
      next[key] = { source, translation: reused.translation, status: reused.status || "machine" };
    } else {
      next[key] = { source, translation: "", status: "todo" };
    }
  }

  for (const key of Object.keys(data || {})) {
    if (!Object.prototype.hasOwnProperty.call(allStrings, key)) removed += 1;
  }

  return { data: next, added, removed, reusedBySource, resetChangedSource };
}

function uniqueSourcesNeedingTranslation(data, scopedStrings, options = {}) {
  const sourceToKeys = new Map();
  for (const [key, source] of Object.entries(scopedStrings)) {
    const entry = data[key];
    const translated = String(translationText(entry) || "").trim();
    const forceMason = options.forceMasonGenderNeutral && String(source).includes("{{name:mason}}");
    if (!forceMason && entry && entry.source === source && translated) continue;
    const list = sourceToKeys.get(source) || [];
    list.push(key);
    sourceToKeys.set(source, list);
  }
  return Array.from(sourceToKeys.entries()).map(([source, keys], index) => ({
    id: `s${index}`,
    source,
    keys
  }));
}

function validateTranslatedText(source, translated) {
  const s = String(source || "");
  const t = String(translated || "");
  if (!t.trim()) return "empty translation";
  if (hasBrokenBraces(t)) return "broken braces";
  if (!sameList(extractPlaceholders(s), extractPlaceholders(t))) return "placeholder mismatch";
  if (!sameList(protectedTokens(s), protectedTokens(t))) return "protected token mismatch";
  if (!sameList(emojiTokens(s), emojiTokens(t))) return "emoji mismatch";
  return "";
}

function postJson(url, payload, apiKey) {
  const body = JSON.stringify(payload);
  const endpoint = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      path: endpoint.pathname + endpoint.search,
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch {}
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const message = json && json.error && json.error.message ? json.error.message : `HTTP ${res.statusCode}`;
          const err = new Error(message);
          err.statusCode = res.statusCode;
          reject(err);
          return;
        }
        resolve(json);
      });
    });
    req.on("error", reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`OpenAI request timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });
    req.write(body);
    req.end();
  });
}

async function translateBatch(lang, rows, apiKey, model) {
  const target = LANGUAGE_NAMES[lang] || lang;
  const protectedRows = rows.map((row) => {
    const masked = maskProtectedText(row.source);
    return { ...row, protectedSource: masked.text, replacements: masked.replacements };
  });
  const payload = {
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You localize player-visible story, phone UI, notification, HAK, OnlyFun, and MeetAndGreet text for the game iNTeRcepted.",
          "Source language is English. Return only valid JSON.",
          "Translate naturally for the target language. Never do literal machine-style translation.",
          "Preserve emotional tone, texting rhythm, flirtation, warmth, fear, tension, sarcasm, humor, and short message pacing.",
          "Preserve placeholders and variables exactly, including {{variables}}, {{name:evelyn}}, {{name:lena}}, {{name:hailey}}, {{name:mason}}, and any similar token.",
          "Mason can be male or female at runtime. Whenever a source contains {{name:mason}}, use a natural gender-neutral construction: do not infer pronouns, titles, gendered nouns, or gender-inflected verbs/adjectives for Mason.",
          "Protected tokens such as [[PROTECTED_0]] are placeholders or emojis. Copy them exactly and do not translate, remove, reorder, or explain them.",
          "Preserve emojis exactly. Keep line breaks and punctuation style close to the original.",
          "Never translate JSON keys, IDs, story names, paths, image names, commands, actions, HAK, OnlyFun, MeetAndGreet, SnapGram, NexaID, NexaLink, or developer identifiers.",
          "Do translate player-facing text, including developer messages, notifications, time cards, choices, tips, comments, captions, and evidence descriptions.",
          "Keep character tone: Evelyn warm, grounded, protective, affectionate, sometimes vulnerable; Lena tender and sincere; Hailey playful; Mason dry and direct.",
          LANGUAGE_STYLE[lang] || "Use a natural player-facing style for the target language.",
          "Return this exact JSON shape: {\"translations\":[{\"id\":\"same id\",\"text\":\"translated text\"}]}."
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          target_language: target,
          items: protectedRows.map((row) => ({ id: row.id, text: row.protectedSource }))
        })
      }
    ]
  };

  const response = await postJson("https://api.openai.com/v1/chat/completions", payload, apiKey);
  const content = response && response.choices && response.choices[0] && response.choices[0].message
    ? response.choices[0].message.content
    : "";
  const parsed = parseModelJson(content);
  const out = new Map();
  const arr = Array.isArray(parsed.translations) ? parsed.translations : [];
  const protectedById = new Map(protectedRows.map((row) => [row.id, row.replacements]));
  for (const row of arr) {
    const id = String(row && row.id || "");
    const text = restoreProtectedText(row && row.text, protectedById.get(id));
    if (id) out.set(id, text);
  }
  return out;
}

async function translateBatchWithRetry(lang, rows, apiKey, model, report) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      report.apiRequests += 1;
      const translated = await translateBatch(lang, rows, apiKey, model);
      const retryRows = [];
      const accepted = new Map();
      for (const row of rows) {
        const text = translated.get(row.id) || "";
        const reason = validateTranslatedText(row.source, text);
        if (reason) retryRows.push({ ...row, reason });
        else accepted.set(row.id, text);
      }
      if (!retryRows.length) return { accepted, failed: [] };
      if (attempt === MAX_RETRIES) {
        return {
          accepted,
          failed: retryRows.map((row) => ({ language: lang, keys: row.keys, source: row.source, reason: row.reason }))
        };
      }
      rows = retryRows;
    } catch (err) {
      lastError = err;
      if (attempt === MAX_RETRIES) break;
    }
    await sleep(Math.min(30000, 1000 * (2 ** (attempt - 1))));
  }

  return {
    accepted: new Map(),
    failed: rows.map((row) => ({
      language: lang,
      keys: row.keys,
      source: row.source,
      reason: lastError && lastError.message ? lastError.message : String(lastError || "unknown error")
    }))
  };
}

function backupTranslations(langs) {
  const backupDir = path.join(ROOT, "backups", `translations_update_${stamp()}`);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const lang of langs) {
    const from = path.join(TRANSLATIONS_DIR, `${lang}.json`);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(backupDir, `${lang}.json`));
  }
  return backupDir;
}

function validateLanguageFile(lang, data, allStrings, scopedStrings) {
  const issues = [];
  const keys = Object.keys(data || {});
  const expectedKeys = Object.keys(allStrings);
  const missingKeys = expectedKeys.filter((key) => !Object.prototype.hasOwnProperty.call(data, key));
  const staleKeys = keys.filter((key) => !Object.prototype.hasOwnProperty.call(allStrings, key));
  const untranslatedScoped = [];
  const placeholderIssues = [];
  const emojiIssues = [];
  const possibleEnglish = [];

  for (const [key, source] of Object.entries(scopedStrings)) {
    const entry = data[key];
    const text = String(translationText(entry) || "");
    if (!entry || !text.trim()) {
      untranslatedScoped.push(key);
      continue;
    }
    if (!sameList(protectedTokens(source), protectedTokens(text))) placeholderIssues.push(key);
    if (!sameList(emojiTokens(source), emojiTokens(text))) emojiIssues.push(key);
    if (
      text.trim() === String(source).trim()
      && /[A-Za-z]{3,}/.test(source)
      && !looksLikePathOrId(source)
      && !/^(HAK|OnlyFun|SnapGram|NexaID|NexaLink|OK|PM|AM)$/i.test(source.trim())
    ) {
      possibleEnglish.push(key);
    }
  }

  if (missingKeys.length) issues.push(`${lang}: ${missingKeys.length} missing key(s)`);
  if (staleKeys.length) issues.push(`${lang}: ${staleKeys.length} stale key(s)`);
  if (untranslatedScoped.length) issues.push(`${lang}: ${untranslatedScoped.length} untranslated scoped key(s)`);
  if (placeholderIssues.length) issues.push(`${lang}: ${placeholderIssues.length} placeholder issue(s)`);
  if (emojiIssues.length) issues.push(`${lang}: ${emojiIssues.length} emoji issue(s)`);

  return {
    keyCount: keys.length,
    expectedKeyCount: expectedKeys.length,
    missingKeys: missingKeys.length,
    staleKeys: staleKeys.length,
    untranslatedScoped: untranslatedScoped.length,
    placeholderIssues: placeholderIssues.length,
    emojiIssues: emojiIssues.length,
    possibleEnglishLeft: possibleEnglish.length,
    issues,
    samples: {
      untranslatedScoped: untranslatedScoped.slice(0, 20),
      possibleEnglishLeft: possibleEnglish.slice(0, 20)
    }
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const allCatalog = collectCatalog("all");
  const scopedCatalog = args.scope === "all" ? allCatalog : collectCatalog(args.scope);
  const allStrings = allCatalog.strings;
  const scopedStrings = scopedCatalog.strings;
  const report = {
    at: new Date().toISOString(),
    scope: args.scope,
    model: args.model,
    languagesRequested: args.langs,
    batchSize: args.batchSize,
    dryRun: args.dryRun,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    interRequestDelayMs: INTER_REQUEST_DELAY_MS,
    apiRequests: 0,
    catalog: {
      allStringCount: allCatalog.allStringCount,
      scopedStringCount: Object.keys(scopedStrings).length,
      storyFilesScanned: allCatalog.storyFilesScanned,
      storyEpisodeFiles: allCatalog.storyEpisodeFiles,
      uiFilesScanned: allCatalog.uiFilesScanned
    },
    backupDir: "",
    languages: {},
    failed: [],
    validation: {}
  };

  if (!args.dryRun && !args.noBackup) report.backupDir = backupTranslations(args.langs);

  let totalQueued = 0;
  const syncedByLang = {};
  for (const lang of args.langs) {
    const file = path.join(TRANSLATIONS_DIR, `${lang}.json`);
    const existing = fs.existsSync(file) ? readJsonFile(file) : {};
    const synced = syncLanguageData(existing, allStrings);
    syncedByLang[lang] = synced;
    const unique = uniqueSourcesNeedingTranslation(synced.data, scopedStrings, args);
    totalQueued += unique.length;
    report.languages[lang] = {
      file: norm(path.relative(ROOT, file)),
      entriesAdded: synced.added,
      entriesRemoved: synced.removed,
      entriesReusedBySource: synced.reusedBySource,
      entriesResetChangedSource: synced.resetChangedSource,
      uniqueSourcesQueued: unique.length,
      uniqueSourcesTranslated: 0,
      entriesWritten: 0,
      failed: 0
    };
    if (!args.dryRun) writeJsonFile(file, synced.data);
  }

  if (args.dryRun || totalQueued === 0) {
    for (const lang of args.langs) {
      report.validation[lang] = validateLanguageFile(lang, syncedByLang[lang].data, allStrings, scopedStrings);
    }
    const reportPath = path.join(REPORT_DIR, `translate_update_${stamp()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    fs.writeFileSync(path.join(REPORT_DIR, "translate_update.latest.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log(`[i18n:update] ${args.dryRun ? "dry run" : "nothing to translate"}: ${totalQueued} unique source(s) queued.`);
    console.log(`[i18n:update] report: ${reportPath}`);
    return;
  }

  const apiKey = await askApiKey();
  if (!apiKey) throw new Error("OpenAI API key was not provided.");

  for (const lang of args.langs) {
    const file = path.join(TRANSLATIONS_DIR, `${lang}.json`);
    const data = readJsonFile(file);
    const unique = uniqueSourcesNeedingTranslation(data, scopedStrings, args);
    const totalBatches = Math.ceil(unique.length / args.batchSize) || 0;
    let translatedSources = 0;
    let writtenEntries = 0;

    for (let i = 0; i < unique.length; i += args.batchSize) {
      const batch = unique.slice(i, i + args.batchSize);
      console.log(`[i18n:update] ${lang}: batch ${Math.floor(i / args.batchSize) + 1}/${totalBatches} (${batch.length} source(s))`);
      const result = await translateBatchWithRetry(lang, batch, apiKey, args.model, report);
      report.failed.push(...result.failed);

      for (const row of batch) {
        if (!result.accepted.has(row.id)) continue;
        const text = result.accepted.get(row.id);
        translatedSources += 1;
        for (const key of row.keys) {
          data[key] = { source: scopedStrings[key], translation: text, status: "machine" };
          writtenEntries += 1;
        }
      }

      writeJsonFile(file, data);
      report.languages[lang].uniqueSourcesTranslated = translatedSources;
      report.languages[lang].entriesWritten = writtenEntries;
      report.languages[lang].failed = report.failed.filter((row) => row.language === lang).length;
      fs.writeFileSync(path.join(REPORT_DIR, "translate_update.latest.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
      if (INTER_REQUEST_DELAY_MS > 0) await sleep(INTER_REQUEST_DELAY_MS);
    }

    report.validation[lang] = validateLanguageFile(lang, data, allStrings, scopedStrings);
    console.log(`[i18n:update] ${lang}: translated ${translatedSources}/${unique.length}, wrote ${writtenEntries}, failed ${report.languages[lang].failed}`);
  }

  for (const lang of args.langs) {
    if (!report.validation[lang]) {
      const file = path.join(TRANSLATIONS_DIR, `${lang}.json`);
      report.validation[lang] = validateLanguageFile(lang, readJsonFile(file), allStrings, scopedStrings);
    }
  }

  const reportPath = path.join(REPORT_DIR, `translate_update_${stamp()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(REPORT_DIR, "translate_update.latest.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`[i18n:update] API requests: ${report.apiRequests}`);
  console.log(`[i18n:update] failed rows: ${report.failed.length}`);
  console.log(`[i18n:update] report: ${reportPath}`);
  if (report.failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[i18n:update] FAIL: ${err && err.message ? err.message : String(err)}`);
  process.exit(1);
});
