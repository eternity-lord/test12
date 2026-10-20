(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PlayerThoughts = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  // Historical transcript rows predate presentation metadata. Match only
  // authored inner speech, never ordinary dialogue containing "I think".
  const legacyTexts = Object.freeze([
    "I need to text {{name:mason}}",
    "I need to text {{name:mason}}.",
    "That fucker!",
    "Fuck it, i will try with {{name:aiden}}",
    "Fuck it, i will try with {{name:aiden}}.",
    "Now I need to warn {{name:hailey}} to hurry up and get ready",
    "Now I need to warn {{name:hailey}} to hurry up and get ready.",
    "This day was trash… injury,{{name:evelyn}} back at work…, plans ruined… what’s next",
    "This day was trash… injury,{{name:evelyn}} back at work…, plans ruined… what’s next?",
    "This day was trash… injury, {{name:evelyn}} back at work…, plans ruined… what’s next",
    "This day was trash… injury, {{name:evelyn}} back at work…, plans ruined… what’s next?",
    "(God damn)",
    "(God damn.)",
    "(You're one hell of a girlfriend)",
    "(You're one hell of a girlfriend.)"
  ]);
  const compact = value => String(value ?? "").replace(/\s+/g, " ").trim();
  // Existing localized saves may predate the punctuation correction. Ignore
  // only the final mark when comparing the exact known inner-speech texts.
  const legacyCompact = value => compact(value).replace(/[.!?…。！？؟।](?=[)）]*$)/u, "").trim();
  const escapePattern = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function playerName() {
    if (root.PlayerIdentity) return root.PlayerIdentity.getName();
    return String(root.Game?.resolveDisplayName?.("player", "Player") || "Player");
  }
  function label() {
    const title = root.Game?.i18n?.ui ? root.Game.i18n.ui("player.inner_thoughts", "Inner thoughts") : "Inner thoughts";
    return `${playerName()} · ${title}`;
  }
  function isThought(value) {
    if (!value || typeof value !== "object") value = { text: value };
    const source = value.canonicalSourceStep || value;
    if (value.presentation === "player_thought" || source.presentation === "player_thought") return true;
    const speaker = String(value.speaker || source.speaker || value.from || "").toLowerCase();
    if (["thought", "player_thought"].includes(value.kind) && (!speaker || speaker === "player")) return true;
    if (speaker && !["player", "system", "me"].includes(speaker)) return false;
    const text = legacyCompact(value.__i18n?.text?.source || source.__i18n?.text?.source || source.text || value.text);
    return legacyTexts.some(raw => {
      if (text === legacyCompact(raw)) return true;
      if (text === legacyCompact(root.Game?.tpl?.(raw) || raw)) return true;
      const translated = root.Game?.i18n?.sourceText?.(raw) || raw;
      return text === legacyCompact(translated) || text === legacyCompact(root.Game?.tpl?.(translated) || translated);
    });
  }
  function splitLegacyLine(text) {
    // Old saves may hold either source English or already-localized pages.
    // The player identity anchors the marker; its localized parentheses are
    // only consulted at a line boundary, never inside arbitrary dialogue.
    const names = ["{{name:player}}", "Player", playerName()].map(escapePattern).join("|");
    const marker = new RegExp(`(?:^|\\r?\\n)\\s*(?:${names})\\s*[（(][^）)\\r\\n]+[）)]\\s*[:：]\\s*`, "i");
    const found = marker.exec(text);
    if (!found) return null;
    const prefix = text.slice(0, found.index).trim();
    const thought = text.slice(found.index + found[0].length).trim();
    if (!thought) return null;
    return [...(prefix ? [{ text: prefix, presentation: "hak" }] : []), { text: thought, presentation: "player_thought" }];
  }
  function pages(payload = {}, transform = value => value) {
    const rows = [...(payload.message ? [payload.message] : []), ...(Array.isArray(payload.messages) ? payload.messages : [])];
    const defaultThought = isThought(payload);
    return rows.flatMap(row => {
      const object = row && typeof row === "object" ? row : { text: row };
      const text = String(object.text ?? object.message ?? "");
      if (!text.trim()) return [];
      const parts = splitLegacyLine(text) || [{ text, presentation: defaultThought || isThought(object) ? "player_thought" : "hak" }];
      return parts.map(part => ({ ...part, text: String(transform(part.text)) }));
    });
  }
  return Object.freeze({ isThought, label, pages, legacyTexts });
});
