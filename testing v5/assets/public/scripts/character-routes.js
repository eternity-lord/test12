(function () {
  "use strict";

  if (window.CharacterRoutes && window.CharacterRoutes.version === 1) return;

  const version = 1;
  const STORAGE_KEY = "route_characters_v1";
  // Known ids are exposed for backwards-compatible UI defaults only. Route
  // storage itself deliberately accepts any safe id so adding a character is
  // a data/config change, not a runtime change.
  const DEFAULT_CHARACTERS = Object.freeze(["lena", "hailey", "evelyn", "mason"]);

  function token(value) {
    return String(value == null ? "" : value).trim().toLowerCase().replace(/[\s-]+/g, "_");
  }

  function normalizeRoute(value) {
    const route = token(value);
    if (route === "love" || route.startsWith("love")) return "love";
    if (route === "ntr" || route.startsWith("ntr")) return "ntr";
    if (route === "nts" || route.startsWith("nts")) return "nts";
    return "";
  }

  function normalizeCharacterId(value) {
    const id = token(value);
    return /^[a-z0-9_]+$/.test(id) ? id : "";
  }

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, String(value)); return true; } catch (_) { return false; }
  }

  function readObject() {
    try {
      const parsed = JSON.parse(safeGet(STORAGE_KEY) || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const routes = {};
      Object.entries(parsed).forEach(([rawId, rawRoute]) => {
        const id = normalizeCharacterId(rawId);
        const route = normalizeRoute(rawRoute);
        if (id && route) routes[id] = route;
      });
      return routes;
    } catch (_) { return {}; }
  }

  function legacyGlobalRoute() {
    return normalizeRoute(
      safeGet("route_global_locked_v1") ||
      safeGet("route_global") ||
      safeGet("selected_route") ||
      ""
    );
  }

  function isActive(id) {
    const raw = safeGet("active_character:" + id);
    return raw !== "0" && raw !== "false" && raw !== "disabled";
  }

  function readExplicit(id) {
    const cid = normalizeCharacterId(id);
    if (!cid) return "";
    let canonical = "";
    try {
      const engine = window.GameStateEngine;
      const variables = typeof engine?.getWorldVariables === "function"
        ? engine.getWorldVariables()
        : (engine?.getState?.() || engine?.getGameplayState?.() || null)?.world?.variables;
      canonical = normalizeRoute(variables?.["route_" + cid + "_locked_v1"]);
    } catch (_) {}
    return canonical || normalizeRoute(safeGet("route_" + cid + "_locked_v1")) || normalizeRoute(readObject()[cid]);
  }

  function writeObject(routes) {
    const clean = {};
    Object.entries(routes && typeof routes === "object" ? routes : {}).forEach(([rawId, rawRoute]) => {
      const id = normalizeCharacterId(rawId);
      const route = normalizeRoute(rawRoute);
      if (id && route) clean[id] = route;
    });
    safeSet(STORAGE_KEY, JSON.stringify(clean));
    return clean;
  }

  function set(id, route, options) {
    const cid = normalizeCharacterId(id);
    const clean = normalizeRoute(route);
    if (!cid || !clean) return "";
    const routes = readObject();
    routes[cid] = clean;
    writeObject(routes);
    const stored = options && options.storedRoute ? String(options.storedRoute) : clean;
    safeSet("route_" + cid + "_locked_v1", stored);
    if (options && options.lockDay != null) safeSet("route_" + cid + "_lock_day_v1", options.lockDay);
    return clean;
  }

  function get(id, options) {
    const cid = normalizeCharacterId(id);
    if (!cid) return "";
    const explicit = readExplicit(cid);
    if (explicit) return explicit;
    if (options && options.explicitOnly === true) return "";
    const inherited = legacyGlobalRoute() || normalizeRoute(options && options.defaultRoute) || "love";
    if ((!options || options.persistInherited !== false) && isActive(cid)) set(cid, inherited);
    return inherited;
  }

  function migrate() {
    const routes = readObject();
    let changed = false;
    const ids = new Set([...DEFAULT_CHARACTERS, ...Object.keys(routes)]);
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = String(localStorage.key(i) || "");
        const match = key.match(/^route_([a-z0-9_]+)_locked_v1$/i);
        if (match) ids.add(normalizeCharacterId(match[1]));
      }
    } catch (_) {}
    ids.delete("");
    ids.forEach((id) => {
      const explicit = normalizeRoute(safeGet("route_" + id + "_locked_v1"));
      if (explicit && routes[id] !== explicit) {
        routes[id] = explicit;
        changed = true;
      }
    });
    const inherited = legacyGlobalRoute();
    if (inherited) {
      ids.forEach((id) => {
        if (!routes[id] && isActive(id)) {
          routes[id] = inherited;
          safeSet("route_" + id + "_locked_v1", inherited);
          changed = true;
        }
      });
    }
    if (changed || !safeGet(STORAGE_KEY)) writeObject(routes);
    return routes;
  }

  function ownerFromStoryPath(path) {
    const normalized = String(path || "").trim().replace(/\\/g, "/");
    const catalog = window.LogicalStoryRoutes || {};
    const logicalPaths = catalog[normalized] ? [normalized] : Object.keys(catalog).filter((key) => Object.values(catalog[key] || {}).includes(normalized));
    if (logicalPaths.length) {
      const metadata = logicalPaths.map((key) => window.LogicalStoryCatalog?.[key]);
      if (metadata.some((row) => row?.ownerStatus && row.ownerStatus !== "KNOWN")) return "";
      const owners = [...new Set(metadata.map((row) => normalizeCharacterId(row?.ownerId)).filter(Boolean))];
      if (owners.length === 1) return owners[0];
      if (owners.length > 1) return "";
    }
    const file = normalized.split("/").pop() || "";
    const match = file.match(/^DAY\d+_\d+_([A-Z0-9]+)(?:_|\.json)/i);
    return normalizeCharacterId(match && match[1]);
  }

  function routeStoryPath(path, owner) {
    const normalized = String(path || "").trim().replace(/\\/g, "/");
    const catalog = window.LogicalStoryRoutes || {};
    const logicalVariants = catalog[normalized]
      || Object.values(catalog).find((variants) => Object.values(variants || {}).includes(normalized));
    // When this path DOES have a generated catalog entry, ownership is
    // always catalog-derived -- an explicit owner argument must never
    // override declared (even invalid/ambiguous) catalog metadata; see
    // character_route_catalog_owner.test.js's own "explicit fallback
    // cannot override invalid declared owner metadata" contract. Only
    // when there is NO catalog entry at all (a path the story-graph-
    // manifest generator has never seen -- e.g. a brand-new character's
    // content added before it has been regenerated) does an explicit
    // owner argument apply, and there it is preferred over
    // ownerFromStoryPath's own single-token filename guess, which cannot
    // reliably reconstruct a multi-word character id from a filename.
    const cid = logicalVariants
      ? ownerFromStoryPath(normalized)
      : (normalizeCharacterId(owner) || ownerFromStoryPath(normalized));
    if (!normalized || !cid) return normalized;
    const route = get(cid, { explicitOnly: true }) || (DEFAULT_CHARACTERS.includes(cid) ? "love" : "");
    if (logicalVariants) {
      if (logicalVariants[route]) return logicalVariants[route];
      if (!route && catalog[normalized] && Object.values(logicalVariants).length === 1) return Object.values(logicalVariants)[0];
      return normalized;
    }
    // No generated catalog entry exists for this path at all. Fall back to
    // a plain route-folder segment swap so correctly-authored .../
    // <route>/FILE.json content still resolves without needing a code
    // change, matching every known character's own physical layout
    // convention (this is the same forward-compatibility promise
    // ownerFromStoryPath's own filename-regex fallback already makes for
    // ownership -- routeStoryPath previously had no equivalent for the
    // path itself).
    if (route) {
      const folderSwap = normalized.replace(/\/(love|ntr|nts)\//i, `/${route}/`);
      if (folderSwap !== normalized) return folderSwap;
    }
    return normalized;
  }

  const api = Object.freeze({
    version,
    storageKey: STORAGE_KEY,
    characters: DEFAULT_CHARACTERS,
    normalizeCharacterId,
    normalizeRoute,
    legacyGlobalRoute,
    isActive,
    get,
    set,
    migrate,
    ownerFromStoryPath,
    routeStoryPath,
    read: readObject
  });
  window.CharacterRoutes = api;
  migrate();
})();
