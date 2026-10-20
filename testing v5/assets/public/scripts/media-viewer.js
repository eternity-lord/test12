// scripts/media-viewer.js
// Reusable phone-style image/video viewer for local game assets.
(() => {
  if (window.MediaViewer && window.MediaViewer.__v === "2026-07-26-wallpaper-v1") return;

  const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
  const VIDEO_EXTS = new Set(["mp4", "webm", "ogg", "ogv", "mov"]);
  const VIDEO_MIME_BY_KIND = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    ogg: "video/ogg",
    ogv: "video/ogg"
  };
  const sniffCache = new Map();
  const isAndroidWebView = (() => {
    try {
      const ua = String(navigator.userAgent || "");
      return /Android/i.test(ua) && (/; wv\)/i.test(ua) || /Version\/\d+\.\d+ Chrome\//i.test(ua) || document.documentElement.classList.contains("android-webview"));
    } catch {
      return false;
    }
  })();

  let overlay = null;
  let body = null;
  let titleEl = null;
  let closeBtn = null;
  let playBtn = null;
  let prevBtn = null;
  let nextBtn = null;
  let wallpaperBtn = null;
  let activeWallpaperSrc = "";
  let activeVideo = null;
  let activeImageCleanup = null;
  let activeObjectUrl = "";
  let openState = false;
  let navState = null;
  // Invalidates asynchronous media detection/loading when the viewer is closed
  // or another item is opened. Without this guard, a late Android/WebView media
  // probe could resurrect a stale video overlay in an unrelated scene.
  let openRequestToken = 0;
  // Thumbnail presentations outlive neither their DOM owner nor their
  // logical conversation-render episode.  Scene teardown used to remove the
  // nodes without invoking their per-mount cleanup, leaving detached image
  // retries and 12s stall watchdogs alive.  A later transcript reconstruction
  // could then report the same logical failure several times (three detached
  // nodes plus the current connected node in the observed Day 2 failure).
  const activeThumbnailMounts = new Set();
  const reportedThumbnailStalls = new Set();
  let thumbnailDetachObserver = null;

  function ensureThumbnailDetachObserver() {
    if (thumbnailDetachObserver || !document.documentElement) return;
    thumbnailDetachObserver = new MutationObserver(() => {
      queueMicrotask(() => {
        for (const mount of [...activeThumbnailMounts]) {
          if (mount.isConnected) { mount.__mediaViewerWasConnected = true; continue; }
          if (!mount?.__mediaViewerWasConnected) continue;
          try { mount.__mediaViewerThumbCleanup?.("dom_detached"); } catch {}
        }
      });
    });
    thumbnailDetachObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function cleanPath(raw) {
    return String(raw || "").trim().replace(/\\/g, "/");
  }

  function uniquePush(list, value) {
    const clean = cleanPath(value);
    if (!clean || list.includes(clean)) return;
    list.push(clean);
  }

  function isSpecialMediaUrl(raw) {
    return /^(?:https?:|data:|blob:|file:|capacitor:|android_asset:)/i.test(cleanPath(raw));
  }

  function cacheBustedUrl(raw, attempt) {
    const url = cleanPath(raw);
    if (!url || /^(?:data:|blob:)/i.test(url)) return url;
    const hashAt = url.indexOf("#");
    const main = hashAt >= 0 ? url.slice(0, hashAt) : url;
    const hash = hashAt >= 0 ? url.slice(hashAt) : "";
    const sep = main.includes("?") ? "&" : "?";
    return `${main}${sep}mvRetry=${Date.now()}_${Math.max(0, Number(attempt || 0) || 0)}${hash}`;
  }

  function imageCandidateUrls(src) {
    const original = cleanPath(src);
    const candidates = [];
    uniquePush(candidates, original);
    try {
      const decoded = decodeURIComponent(original);
      if (decoded !== original) uniquePush(candidates, decoded);
    } catch {}

    const normalized = original.replace(/^\.\//, "").replace(/^\/+/, "");
    uniquePush(candidates, normalized);

    if (!isSpecialMediaUrl(normalized)) {
      const fixedConversation = normalized.replace(/^assets\/pictures\/conversation\//i, "assets/pictures/Conversation/");
      uniquePush(candidates, fixedConversation);
      if (/^pictures\//i.test(normalized)) uniquePush(candidates, `assets/${normalized}`);
      if (/^conversation\//i.test(normalized)) uniquePush(candidates, `assets/pictures/${normalized.replace(/^conversation\//i, "Conversation/")}`);

      // Never guess a media namespace from a basename. In particular an
      // official contact avatar such as assets/avatars/male_mason.jpg used as a
      // conversation photo is not an implicit Conversation/MeetAndGreet/HAK
      // asset. Those blind guesses caused one failed avatar load to fan out
      // into four unrelated renderer requests and could also cross Mason's
      // selected variant. Callers must supply the canonical logical path;
      // ProtectedMediaResolver owns its packaged/runtime resolution.
    }

    const base = candidates.slice();
    base.forEach((candidate, index) => uniquePush(candidates, cacheBustedUrl(candidate, index + 1)));
    return candidates;
  }

  function mediaCandidateUrls(src, opts = {}) {
    const roots = [];
    const pushRoot = (value) => {
      if (Array.isArray(value)) {
        value.forEach(pushRoot);
        return;
      }
      uniquePush(roots, value);
    };

    pushRoot(opts.thumb);
    pushRoot(opts.thumbnail);
    pushRoot(opts.thumbnailSrc);
    pushRoot(opts.preview);
    pushRoot(opts.previewSrc);
    pushRoot(opts.poster);
    pushRoot(opts.candidates);
    pushRoot(opts.fullSrc);
    pushRoot(opts.fallbackSrc);
    pushRoot(src);
    pushRoot(opts.src);
    pushRoot(opts.url);

    const out = [];
    roots.forEach((root) => {
      imageCandidateUrls(root).forEach((candidate) => uniquePush(out, candidate));
    });
    return out;
  }

  function extFromPath(raw) {
    const path = cleanPath(raw).split("#")[0].split("?")[0];
    const name = path.split("/").pop() || "";
    const idx = name.lastIndexOf(".");
    return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
  }

  function bytesToAscii(bytes, start, len) {
    let out = "";
    for (let i = start; i < start + len && i < bytes.length; i++) {
      const b = bytes[i];
      out += (b >= 32 && b <= 126) ? String.fromCharCode(b) : ".";
    }
    return out;
  }

  function sniffBytes(bytes) {
    if (!bytes || bytes.length < 4) return null;

    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { type: "image", kind: "jpg", mime: "image/jpeg", source: "magic" };
    }
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return { type: "image", kind: "png", mime: "image/png", source: "magic" };
    }
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return { type: "image", kind: "gif", mime: "image/gif", source: "magic" };
    }
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytesToAscii(bytes, 8, 4) === "WEBP") {
      return { type: "image", kind: "webp", mime: "image/webp", source: "magic" };
    }
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
      return { type: "video", kind: "webm", mime: "video/webm", source: "magic" };
    }
    if (bytesToAscii(bytes, 0, 4) === "OggS") {
      return { type: "video", kind: "ogg", mime: "video/ogg", source: "magic" };
    }
    if (bytes.length >= 12 && bytesToAscii(bytes, 4, 4) === "ftyp") {
      const brand = bytesToAscii(bytes, 8, 12).toLowerCase();
      const isMov = brand.includes("qt");
      return {
        type: "video",
        kind: isMov ? "mov" : "mp4",
        mime: isMov ? "video/quicktime" : "video/mp4",
        source: "magic"
      };
    }

    return null;
  }

  function fallbackTypeFromExtension(src) {
    const ext = extFromPath(src);
    if (IMAGE_EXTS.has(ext)) return { type: "image", kind: ext, mime: ext === "jpg" ? "image/jpeg" : `image/${ext}`, source: "extension" };
    if (VIDEO_EXTS.has(ext)) return { type: "video", kind: ext, mime: VIDEO_MIME_BY_KIND[ext] || `video/${ext}`, source: "extension" };
    return { type: "unknown", kind: ext, mime: "", source: "unknown" };
  }

  function normalizeMediaType(value) {
    const type = String(value || "").trim().toLowerCase();
    return type === "video" || type === "image" ? type : "";
  }

  function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const ms = Math.max(1000, Number(timeoutMs || 0) || 8000);
    if (typeof AbortController !== "function") return fetch(url, options);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, ms);
    return fetch(url, { ...(options || {}), signal: controller.signal })
      .finally(() => {
        try { clearTimeout(timer); } catch {}
      });
  }

  function mediaInfoWithType(src, type) {
    const base = fallbackTypeFromExtension(src);
    const forced = normalizeMediaType(type);
    return forced ? { ...base, type: forced, source: "option" } : base;
  }

  async function fetchHeadBytes(src) {
    // Packaged media may only exist as an encrypted record, just like the
    // image/video loaded by the viewer. Probe its resolved URL, not the raw path.
    const resolver = window.ProtectedMediaResolver?.resolveRuntimeAsset || window.ProtectedMediaResolver?.resolve;
    const resolvedSrc = typeof resolver === "function" ? await resolver(src) : src;
    const res = await fetchWithTimeout(resolvedSrc, { cache: "no-store", headers: { Range: "bytes=0-511" } }, 6000);
    if (!res || !res.ok) throw new Error(`Failed to read media: ${src}`);
    const buffer = await res.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async function detectMediaType(src) {
    const key = cleanPath(src);
    if (!key) return { type: "unknown", kind: "", mime: "", source: "empty" };
    if (sniffCache.has(key)) return sniffCache.get(key);

    const fallback = fallbackTypeFromExtension(key);
    if (isAndroidWebView && fallback.type !== "unknown") {
      sniffCache.set(key, Promise.resolve(fallback));
      return fallback;
    }
    const promise = fetchHeadBytes(key)
      .then((bytes) => sniffBytes(bytes) || fallback)
      .catch(() => fallback);
    sniffCache.set(key, promise);
    return promise;
  }

  function ensureOverlay() {
    if (overlay && overlay.isConnected && document.getElementById("mediaViewer") === overlay) return overlay;

    const existingOverlay = document.getElementById("mediaViewer");
    if (
      existingOverlay &&
      existingOverlay.classList &&
      existingOverlay.classList.contains("media-viewer-overlay") &&
      existingOverlay.querySelector("#mediaViewerBody") &&
      existingOverlay.querySelector("#mediaViewerTitle") &&
      existingOverlay.querySelector("#mediaViewerClose") &&
      existingOverlay.querySelector("#mediaViewerPlay")
    ) {
      overlay = existingOverlay;
      body = overlay.querySelector("#mediaViewerBody");
      titleEl = overlay.querySelector("#mediaViewerTitle");
      closeBtn = overlay.querySelector("#mediaViewerClose");
      playBtn = overlay.querySelector("#mediaViewerPlay");
      prevBtn = overlay.querySelector("#mediaViewerPrev");
      nextBtn = overlay.querySelector("#mediaViewerNext");
      wallpaperBtn = overlay.querySelector("#mediaViewerWallpaper");
      return overlay;
    }

    if (existingOverlay && existingOverlay.parentNode) {
      try { existingOverlay.remove(); } catch {}
    }

    overlay = null;
    body = null;
    titleEl = null;
    closeBtn = null;
    playBtn = null;
    prevBtn = null;
    nextBtn = null;
    wallpaperBtn = null;

    const style = document.createElement("style");
    style.id = "media-viewer-style";
    style.textContent = `
      .media-viewer-overlay{
        position:fixed; inset:0; z-index:2147483646;
        display:none; flex-direction:column; color:#f0f5ff;
        background:radial-gradient(circle at center, rgba(0,0,0,.72), rgba(0,0,0,.94));
        backdrop-filter:blur(12px);
      }
      .media-viewer-overlay.show{display:flex}
      .media-viewer-top{
        display:flex; align-items:center; justify-content:space-between; gap:12px;
        padding:calc(32px + env(safe-area-inset-top, 0px)) 14px 10px;
        background:linear-gradient(180deg, rgba(0,0,0,.72), rgba(0,0,0,0));
        position:relative; z-index:2;
      }
      .media-viewer-title{
        margin:0; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        font-size:12px; font-weight:900; letter-spacing:.16em; text-transform:uppercase;
        color:rgba(240,245,255,.9);
      }
      .media-viewer-close,.media-viewer-play,.media-viewer-nav{
        border:1px solid rgba(245,248,255,.22); border-radius:13px;
        background:rgba(6,7,10,.62); color:#f0f5ff;
        padding:9px 12px; cursor:pointer; font-weight:900; letter-spacing:.12em;
        text-transform:uppercase; box-shadow:0 12px 34px rgba(0,0,0,.55);
      }
      .media-viewer-top-actions{display:flex; align-items:center; gap:8px; flex:0 0 auto}
      .media-viewer-wallpaper{white-space:nowrap; border-color:rgba(112,220,255,.65); color:#dffaff}
      .media-viewer-wallpaper[hidden]{display:none!important}
      .media-viewer-wallpaper.is-success{border-color:#63efad; color:#9dffd0}
      .media-viewer-close:hover,.media-viewer-nav:hover{border-color:rgba(245,248,255,.48); filter:brightness(1.08)}
      .media-viewer-nav{
        position:absolute; top:50%; transform:translateY(-50%); z-index:6;
        width:46px; height:58px; padding:0; display:none; align-items:center; justify-content:center;
        font-size:34px; line-height:1; border-radius:999px;
      }
      .media-viewer-nav.is-visible{display:flex}
      .media-viewer-prev{left:12px}
      .media-viewer-next{right:12px}
      .media-viewer-play{
        min-width:142px; min-height:52px; padding:14px 24px; border-radius:999px;
        border:2px solid rgba(167,247,255,.95);
        background:
          radial-gradient(circle at 30% 20%, rgba(255,255,255,.42), rgba(255,255,255,0) 36%),
          linear-gradient(135deg, rgba(0,229,255,.98), rgba(255,59,218,.96));
        color:#031018; text-shadow:0 1px 0 rgba(255,255,255,.42);
        font-size:15px; letter-spacing:.16em;
        box-shadow:
          0 0 0 2px rgba(3,16,24,.76),
          0 0 26px rgba(0,229,255,.54),
          0 0 46px rgba(255,59,218,.34),
          0 18px 46px rgba(0,0,0,.72);
      }
      .media-viewer-play:hover{
        transform:translateY(-1px) scale(1.04);
        border-color:#fff;
        filter:saturate(1.18) brightness(1.12);
        box-shadow:
          0 0 0 2px rgba(3,16,24,.82),
          0 0 34px rgba(0,229,255,.72),
          0 0 58px rgba(255,59,218,.46),
          0 20px 52px rgba(0,0,0,.76);
      }
      .media-viewer-play:active{
        transform:translateY(1px) scale(.98);
        filter:saturate(1.1) brightness(.98);
      }
      .media-viewer-body{
        position:relative; flex:1; min-height:0; display:flex; align-items:center; justify-content:center;
        padding:12px 12px calc(18px + env(safe-area-inset-bottom, 0px));
      }
      .media-viewer-body img,.media-viewer-body video{
        max-width:100%; max-height:100%; border-radius:18px; background:#000;
        border:1px solid rgba(245,248,255,.18);
        box-shadow:0 24px 70px rgba(0,0,0,.82), 0 0 30px rgba(112,220,255,.10);
      }
      .media-viewer-body video{width:min(100%, 980px); height:auto}
      .media-viewer-thought{
        flex:0 0 auto; align-self:center; box-sizing:border-box;
        width:min(640px, calc(100% - 28px)); max-height:30vh; overflow:auto;
        margin:0 14px calc(16px + env(safe-area-inset-bottom, 0px)); padding:14px 18px;
        border:1px solid rgba(168,211,235,.4); border-radius:22px 22px 22px 7px;
        background:rgba(20,29,40,.96); color:#f0f5ff; text-shadow:none;
      }
      .media-viewer-thought .player-thought__label{
        display:block; margin-bottom:7px; color:#bfd9e9; font-size:12px; font-weight:700;
      }
      .media-viewer-thought .player-thought__text{margin:0; font-size:16px; line-height:1.5; white-space:pre-line}
      .media-viewer-controls{
        position:absolute; left:50%; bottom:calc(38px + env(safe-area-inset-bottom, 0px));
        transform:translateX(-50%); z-index:5; display:none;
      }
      .media-viewer-overlay.is-video .media-viewer-controls{display:block}
      .media-viewer-overlay.is-video.has-thought .media-viewer-controls{
        position:static; transform:none; align-self:center; flex:0 0 auto;
        margin:0 14px calc(16px + env(safe-area-inset-bottom, 0px));
      }
      .media-thumb{
        position:relative; width:100%; height:100%; min-height:72px; overflow:hidden;
        display:grid; place-items:center; background:rgba(0,0,0,.55);
      }
      .media-thumb img,.media-thumb video{width:100%; height:100%; object-fit:cover; display:block}
      .media-thumb-image img{object-fit:contain; background:#050507}
      .media-thumb video{position:absolute; inset:0; z-index:0; background:#000}
      .media-thumb-video{
        color:#f0f5ff; font-size:12px; font-weight:900; letter-spacing:.14em; text-transform:uppercase;
        background:radial-gradient(circle at 50% 35%, rgba(112,220,255,.16), rgba(0,0,0,.82));
      }
      .media-thumb-video::before{
        content:""; width:54px; height:54px; border-radius:999px;
        background:rgba(6,7,10,.72); border:1px solid rgba(245,248,255,.36);
        box-shadow:0 0 24px rgba(245,248,255,.12); position:absolute; z-index:2;
      }
      .media-thumb-video::after{
        content:""; position:absolute; border-style:solid; border-width:13px 0 13px 20px;
        border-color:transparent transparent transparent #f0f5ff; transform:translateX(3px); z-index:3;
      }
      .media-thumb-label{position:absolute; left:10px; right:10px; bottom:10px; text-align:center; opacity:.82; z-index:3}
      .media-thumb-image .media-thumb-label{top:50%; bottom:auto; transform:translateY(-50%)}
      .media-thumb-image.is-loaded .media-thumb-label{display:none}
      .media-thumb-image.is-loading img{opacity:0}
      .media-thumb-image.is-loaded img{opacity:1}
      .media-thumb-image.media-thumb-error img{display:none}
      .media-thumb-video.has-preview .media-thumb-label{display:none}
      .media-thumb-video.has-preview::before{background:rgba(3,8,14,.68); border-color:rgba(255,255,255,.62)}
      .media-viewer-status{
        position:absolute; left:20px; right:20px; top:50%; transform:translateY(-50%);
        text-align:center; color:rgba(240,245,255,.86); font-size:12px; font-weight:900;
        letter-spacing:.14em; text-transform:uppercase; z-index:1;
      }
      @media (max-width:560px){
        .media-viewer-top{align-items:flex-start; padding-left:10px; padding-right:10px}
        .media-viewer-title{padding-top:10px}
        .media-viewer-top-actions{flex-direction:column-reverse; align-items:stretch}
        .media-viewer-wallpaper,.media-viewer-close{min-height:44px; padding:9px 11px; font-size:10px}
        .media-viewer-body{padding-bottom:calc(12px + env(safe-area-inset-bottom, 0px))}
      }
      html.android-webview .media-viewer-overlay{
        background:rgba(0,0,0,.94) !important;
        backdrop-filter:none !important;
      }
      html.android-webview .media-viewer-overlay *,
      html.android-webview .media-viewer-overlay *::before,
      html.android-webview .media-viewer-overlay *::after{
        animation:none !important;
        transition:none !important;
        filter:none !important;
        box-shadow:none !important;
        text-shadow:none !important;
      }
      html.android-webview .media-thumb-video{
        background:rgba(0,0,0,.78) !important;
      }
    `;
    document.head.appendChild(style);

    overlay = document.createElement("div");
    overlay.id = "mediaViewer";
    overlay.className = "media-viewer-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="media-viewer-top">
        <p class="media-viewer-title" id="mediaViewerTitle">MEDIA</p>
        <div class="media-viewer-top-actions">
          <button class="media-viewer-wallpaper media-viewer-close" id="mediaViewerWallpaper" type="button" hidden data-i18n="wallpaper.set_as">Set as Wallpaper</button>
          <button class="media-viewer-close" id="mediaViewerClose" type="button" data-i18n="common.close">Close</button>
        </div>
      </div>
      <div class="media-viewer-body" id="mediaViewerBody"></div>
      <button class="media-viewer-nav media-viewer-prev" id="mediaViewerPrev" type="button" aria-label="Previous media">‹</button>
      <button class="media-viewer-nav media-viewer-next" id="mediaViewerNext" type="button" aria-label="Next media">›</button>
      <div class="media-viewer-controls">
        <button class="media-viewer-play" id="mediaViewerPlay" type="button">Play</button>
      </div>
    `;
    document.body.appendChild(overlay);

    body = overlay.querySelector("#mediaViewerBody");
    titleEl = overlay.querySelector("#mediaViewerTitle");
    closeBtn = overlay.querySelector("#mediaViewerClose");
    playBtn = overlay.querySelector("#mediaViewerPlay");
    prevBtn = overlay.querySelector("#mediaViewerPrev");
    nextBtn = overlay.querySelector("#mediaViewerNext");
    wallpaperBtn = overlay.querySelector("#mediaViewerWallpaper");
    try { window.Game?.i18n?.applyTo?.(overlay); } catch {}

    closeBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      close();
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target === body) close();
    });
    playBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleVideo();
    });
    prevBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      navigateMedia(-1);
    });
    nextBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      navigateMedia(1);
    });
    wallpaperBtn?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const src = activeWallpaperSrc;
      if (!src || !window.Game?.wallpaper) return;
      wallpaperBtn.disabled = true;
      const ok = await window.Game.wallpaper.set(src, { source: "mediaViewer" });
      wallpaperBtn.disabled = false;
      if (!ok) return;
      const translated = window.Game?.i18n?.ui?.("wallpaper.updated", "Wallpaper updated") || "Wallpaper updated";
      wallpaperBtn.textContent = translated;
      wallpaperBtn.classList.add("is-success");
      try { window.showToast?.(translated); } catch {}
      setTimeout(() => {
        if (!wallpaperBtn) return;
        wallpaperBtn.textContent = window.Game?.i18n?.ui?.("wallpaper.set_as", "Set as Wallpaper") || "Set as Wallpaper";
        wallpaperBtn.classList.remove("is-success");
      }, 1800);
    });

    window.addEventListener("keydown", (event) => {
      if (!openState) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
      if ((event.key === " " || event.key === "Spacebar") && activeVideo) {
        event.preventDefault();
        event.stopPropagation();
        toggleVideo();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        navigateMedia(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        navigateMedia(1);
      }
    }, true);

    document.addEventListener("click", (event) => {
      if (!openState) return;
      const target = event.target;
      if (target && target.closest && target.closest("#nav-back")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      }
    }, true);

    return overlay;
  }

  function normalizeNavList(list) {
    const raw = Array.isArray(list) ? list : [];
    return raw.map((item) => {
      if (typeof item === "string") return { src: cleanPath(item), title: "", type: "" };
      const obj = (item && typeof item === "object") ? item : {};
      return {
        ...obj,
        src: cleanPath(obj.src || obj.url || obj.image || obj.video || ""),
        title: String(obj.title || obj.alt || obj.label || "").trim(),
        type: normalizeMediaType(obj.type || obj.mediaType)
      };
    }).filter((item) => item.src);
  }

  function syncNavButtons() {
    const count = Array.isArray(navState?.items) ? navState.items.length : 0;
    const visible = openState && count > 1;
    [prevBtn, nextBtn].forEach((btn) => {
      if (!btn) return;
      btn.classList.toggle("is-visible", visible);
      btn.hidden = !visible;
    });
  }

  function updateNavState(url, options = {}) {
    const items = normalizeNavList(options.items || options.media || options.galleryItems || options.navItems || []);
    if (!items.length) {
      navState = null;
      syncNavButtons();
      return;
    }
    const wanted = cleanPath(url);
    let index = Number.isFinite(Number(options.index)) ? Math.max(0, Math.floor(Number(options.index))) : -1;
    if (index < 0) index = items.findIndex((item) => cleanPath(item.src) === wanted);
    if (index < 0) index = 0;
    navState = { items, index: Math.min(index, items.length - 1) };
    syncNavButtons();
  }

  function navigateMedia(delta) {
    const items = Array.isArray(navState?.items) ? navState.items : [];
    if (!openState || items.length < 2) return false;
    const len = items.length;
    const nextIndex = (Math.max(0, Number(navState.index || 0) || 0) + (Number(delta || 0) || 0) + len) % len;
    navState.index = nextIndex;
    const item = items[nextIndex];
    if (!item) return false;
    open(item.src, {
      ...item,
      items,
      index: nextIndex,
      title: item.title || item.alt || item.label || "",
      type: item.type || item.mediaType || ""
    });
    return true;
  }

  function showPlayerThought(value) {
    overlay.querySelector("#mediaViewerThought")?.remove();
    const thought = String(value || "").trim();
    overlay.classList.toggle("has-thought", !!thought);
    if (!thought) return;
    const bubble = document.createElement("section");
    bubble.id = "mediaViewerThought";
    bubble.className = "media-viewer-thought player-thought";
    const label = document.createElement("span");
    label.className = "player-thought__label";
    label.textContent = window.PlayerThoughts?.label?.() || "Inner thoughts";
    const text = document.createElement("p");
    text.className = "player-thought__text";
    // The caller already localized and expanded names. Preserve paragraph
    // breaks rather than running this caption through the DOM translator.
    text.setAttribute("translate", "no");
    text.textContent = thought;
    bubble.append(label, text);
    body.after(bubble);
  }

  function clearActiveMedia() {
    overlay?.querySelector("#mediaViewerThought")?.remove();
    overlay?.classList.remove("has-thought");
    if (typeof activeImageCleanup === "function") {
      try { activeImageCleanup(); } catch {}
    }
    activeImageCleanup = null;
    if (activeVideo) {
      try { activeVideo.pause(); } catch {}
      try { activeVideo.removeAttribute("src"); activeVideo.load(); } catch {}
    }
    if (body) {
      body.querySelectorAll("video").forEach((video) => {
        try { video.pause(); } catch {}
        try { video.removeAttribute("src"); video.load(); } catch {}
        const objectUrl = String(video.dataset?.objectUrl || "");
        if (objectUrl) {
          try { URL.revokeObjectURL(objectUrl); } catch {}
          try { video.dataset.objectUrl = ""; } catch {}
        }
      });
      body.querySelectorAll("img").forEach((img) => {
        try { img.removeAttribute("src"); } catch {}
        try { img.src = ""; } catch {}
      });
    }
    activeVideo = null;
    activeWallpaperSrc = "";
    if (wallpaperBtn) wallpaperBtn.hidden = true;
    if (activeObjectUrl) {
      try { URL.revokeObjectURL(activeObjectUrl); } catch {}
      activeObjectUrl = "";
    }
    if (body) body.innerHTML = "";
    if (playBtn) playBtn.textContent = "Play";
  }

  function close() {
    openRequestToken += 1;
    if (!overlay) return;
    const wasOpen = openState;
    clearActiveMedia();
    openState = false;
    navState = null;
    overlay.classList.remove("show", "is-video", "is-image");
    overlay.setAttribute("aria-hidden", "true");
    try { document.body.classList.remove("media-viewer-open"); } catch {}
    // Embedded readers can restore focus without observing this viewer's DOM.
    // Notify after teardown, once per visible session (including navigation).
    if (wasOpen) window.dispatchEvent(new CustomEvent("media-viewer:close"));
  }

  function setPlayButtonState() {
    if (!playBtn || !activeVideo) return;
    playBtn.textContent = activeVideo.paused ? "PLAY" : "PAUSE";
  }

  function toggleVideo() {
    if (!activeVideo) return;
    if (activeVideo.paused) {
      const p = activeVideo.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          try {
            activeVideo.muted = true;
            const retry = activeVideo.play();
            if (retry && typeof retry.catch === "function") retry.catch(() => {});
          } catch {}
          setPlayButtonState();
        });
      }
    } else {
      activeVideo.pause();
    }
    setTimeout(setPlayButtonState, 30);
  }

  async function makePlayableVideoSrc(src, info) {
    const resolver = window.ProtectedMediaResolver?.resolveRuntimeAsset || window.ProtectedMediaResolver?.resolve;
    const resolvedSrc = typeof resolver === "function" ? await resolver(src) : src;
    const res = await fetchWithTimeout(resolvedSrc, { cache: "no-store" }, 12000);
    if (!res || !res.ok) throw new Error(`Failed to load video: ${src}`);
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const detected = sniffBytes(bytes) || info || fallbackTypeFromExtension(src);
    const mime = detected.mime || VIDEO_MIME_BY_KIND[detected.kind] || "video/mp4";
    const blob = new Blob([buffer], { type: mime });
    return URL.createObjectURL(blob);
  }

  function loadImageWithRetries(img, src, callbacks = {}) {
    const candidates = Array.isArray(callbacks.candidates) && callbacks.candidates.length
      ? callbacks.candidates.map(cleanPath).filter(Boolean)
      : imageCandidateUrls(src);
    const slowBaseMs = Math.max(1200, Number(callbacks.slowMs || 0) || 2600);
    const finalSlowMs = Math.max(slowBaseMs + 2400, Number(callbacks.finalSlowMs || 0) || 8200);
    let index = 0;
    let token = 0;
    let timer = null;
    let cancelled = false;
    let finalSlowTried = false;

    const clearTimer = () => {
      if (!timer) return;
      try { clearTimeout(timer); } catch {}
      timer = null;
    };

    const finishFailure = () => {
      if (cancelled) return;
      clearTimer();
      callbacks.onFailure?.({ attempts: candidates.slice() });
    };

    const tryFinalSlowCandidate = () => {
      if (cancelled || finalSlowTried) return false;
      const fallbackRoots = mediaCandidateUrls(src, callbacks)
        .filter((candidate) => !/[?&]mvRetry=/.test(candidate));
      const current = fallbackRoots[fallbackRoots.length - 1] || candidates[candidates.length - 1] || "";
      if (!current) return false;

      finalSlowTried = true;
      const currentToken = ++token;
      callbacks.onLoading?.({ src: current, attempt: index + 1, total: candidates.length + 1, reason: "final-slow" });

      img.onload = () => {
        if (cancelled || currentToken !== token) return;
        clearTimer();
        callbacks.onSuccess?.({ src: current, attempt: index + 1, final: true });
      };
      img.onerror = () => {
        if (cancelled || currentToken !== token) return;
        finishFailure();
      };

      timer = setTimeout(() => {
        if (cancelled || currentToken !== token) return;
        finishFailure();
      }, finalSlowMs);

      try { img.removeAttribute("src"); } catch {}
      img.src = current;
      if (img.complete && Number(img.naturalWidth || 0) > 0) {
        try { img.onload(); } catch {}
      }
      return true;
    };

    const tryNext = (reason = "retry") => {
      if (cancelled) return;
      clearTimer();
      if (index >= candidates.length) {
        if (reason === "slow" && tryFinalSlowCandidate()) return;
        finishFailure();
        return;
      }

      const current = candidates[index++];
      const currentToken = ++token;
      callbacks.onLoading?.({ src: current, attempt: index, total: candidates.length, reason });

      img.onload = () => {
        if (cancelled || currentToken !== token) return;
        clearTimer();
        callbacks.onSuccess?.({ src: current, attempt: index });
      };
      img.onerror = () => {
        if (cancelled || currentToken !== token) return;
        tryNext("error");
      };

      timer = setTimeout(() => {
        if (cancelled || currentToken !== token) return;
        tryNext("slow");
      }, slowBaseMs + Math.min(2600, Math.max(0, index - 1) * 700));

      try { img.removeAttribute("src"); } catch {}
      img.src = current;
      if (img.complete && Number(img.naturalWidth || 0) > 0) {
        try { img.onload(); } catch {}
      }
    };

    tryNext("initial");
    return () => {
      cancelled = true;
      clearTimer();
      try { img.onload = null; } catch {}
      try { img.onerror = null; } catch {}
      try { img.removeAttribute("src"); } catch {}
      try { img.src = ""; } catch {}
    };
  }

  // Presentation stays authored and ordered, while the independent media
  // work for one small consecutive conversation group is prepared together.
  const preparedThumbnailGroups = new Map();
  let preparedThumbnailGeneration = 0;
  const preparationDiagnostics = { groups: 0, active: 0, maxActive: 0, completed: 0, events: [] };
  const preparationQueue = [];
  function drainPreparationQueue() {
    while (preparationDiagnostics.active < 3 && preparationQueue.length) {
      const row = preparationQueue.shift();
      preparationDiagnostics.active++;
      preparationDiagnostics.maxActive = Math.max(preparationDiagnostics.maxActive, preparationDiagnostics.active);
      Promise.resolve().then(row.work).then(row.resolve, row.reject).finally(() => {
        preparationDiagnostics.active = Math.max(0, preparationDiagnostics.active - 1);
        preparationDiagnostics.completed++;
        drainPreparationQueue();
      });
    }
  }
  function runBoundedPreparation(work) {
    return new Promise((resolve, reject) => {
      preparationQueue.push({ work, resolve, reject });
      drainPreparationQueue();
    });
  }

  function prepareThumbnailGroup(sources, opts = {}) {
    const generation = ++preparedThumbnailGeneration;
    const limit = Math.max(1, Math.min(3, Number(opts.concurrency || 3) || 3));
    const unique = [...new Set((Array.isArray(sources) ? sources : []).map(cleanPath).filter(Boolean))].slice(0, limit);
    preparationDiagnostics.groups++;
    for (const logical of unique) {
      if (preparedThumbnailGroups.has(logical)) continue;
      while (preparedThumbnailGroups.size >= 3) {
        const staleKey = [...preparedThumbnailGroups.keys()].find((key) => !unique.includes(key));
        if (!staleKey) break;
        preparedThumbnailGroups.get(staleKey)?.cancel?.();
        preparedThumbnailGroups.delete(staleKey);
      }
      if (preparedThumbnailGroups.size >= 3) break;
      const entry = { generation, task: null, retired: false, cancel: null };
      const cancellation = new Promise(resolve => { entry.cancel = () => { entry.retired = true; resolve(null); }; });
      const task = runBoundedPreparation(async () => {
        const event = { logical, queuedAt: performance.now(), startedAt: performance.now(), completedAt: null, ok: false };
        preparationDiagnostics.events.push(event);
        if (preparationDiagnostics.events.length > 30) preparationDiagnostics.events.shift();
        let probe = null, decodeTimer = null, onLoad = null, onError = null;
        try {
        if (entry.retired) return null;
        const resolver = window.ProtectedMediaResolver?.resolveRuntimeAsset || window.ProtectedMediaResolver?.resolve;
        const finalUrl = typeof resolver === "function" ? await Promise.race([resolver(logical), cancellation]) : logical;
        if (entry.retired) return null;
        probe = new Image();
        probe.loading = "eager";
        probe.decoding = "async";
        const loaded = new Promise((resolve, reject) => {
          onLoad = resolve;
          onError = () => reject(new Error(`thumbnail prepare failed: ${logical}`));
          probe.addEventListener("load", onLoad, { once: true });
          probe.addEventListener("error", onError, { once: true });
        });
        probe.src = finalUrl;
        await Promise.race([loaded, cancellation]);
        if (entry.retired) return null;
        if (typeof probe.decode === "function") {
          // Chromium can leave decode() pending indefinitely for an otherwise
          // successfully loaded image. Decode is an optimization, never a
          // preparation-slot ownership boundary.
          try { await Promise.race([probe.decode(), cancellation, new Promise((resolve) => { decodeTimer = setTimeout(resolve, 750); })]); } catch {}
        }
        if (entry.retired) return null;
        event.ok = true;
        return { logical, finalUrl, width: probe.naturalWidth, height: probe.naturalHeight };
        } finally {
          if (decodeTimer) clearTimeout(decodeTimer);
          if (probe) {
            if (onLoad) probe.removeEventListener("load", onLoad);
            if (onError) probe.removeEventListener("error", onError);
            if (entry.retired) { try { probe.removeAttribute("src"); } catch {} }
          }
          event.retired = entry.retired;
          event.completedAt = performance.now();
        }
      });
      entry.task = task;
      preparedThumbnailGroups.set(logical, entry);
      task.catch(() => {
        if (preparedThumbnailGroups.get(logical) === entry) preparedThumbnailGroups.delete(logical);
      });
    }
    return { generation, count: unique.length };
  }

  function clearPreparedThumbnailGroup() {
    preparedThumbnailGeneration++;
    for (const entry of preparedThumbnailGroups.values()) entry.cancel?.();
    preparedThumbnailGroups.clear();
  }

  function hasPreparedThumbnail(source) {
    return preparedThumbnailGroups.has(cleanPath(source));
  }

  async function open(input, opts = {}) {
    let src = input;
    let options = opts || {};
    if (input && typeof input === "object") {
      src = input.src || input.url || input.image || "";
      options = { ...input, ...options };
    }

    const url = cleanPath(src);
    if (!url) return false;
    const requestToken = ++openRequestToken;
    ensureOverlay();
    clearActiveMedia();
    updateNavState(url, options);

    const forcedType = normalizeMediaType(options.type || options.mediaType);
    const extensionInfo = fallbackTypeFromExtension(url);
    const info = forcedType
      ? mediaInfoWithType(url, forcedType)
      : (extensionInfo.type === "image" ? extensionInfo : await detectMediaType(url));
    if (requestToken !== openRequestToken) return false;
    const label = String(options.title || options.alt || (info.type === "video" ? "Video" : "Image")).trim();
    if (titleEl) titleEl.textContent = label.toUpperCase();

    if (info.type === "video") {
      activeWallpaperSrc = "";
      if (wallpaperBtn) wallpaperBtn.hidden = true;
      overlay.classList.add("show", "is-video");
      overlay.classList.remove("is-image");
      overlay.setAttribute("aria-hidden", "false");
      openState = true;
      try { document.body.classList.add("media-viewer-open"); } catch {}

      const video = document.createElement("video");
      video.preload = isAndroidWebView ? "none" : "metadata";
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.controls = false;
      video.addEventListener("play", setPlayButtonState);
      video.addEventListener("pause", setPlayButtonState);
      video.addEventListener("ended", setPlayButtonState);
      video.addEventListener("loadeddata", () => {
        if (requestToken === openRequestToken && activeVideo === video) showPlayerThought(options.playerThought);
      });
      video.addEventListener("error", () => {
        if (requestToken === openRequestToken && activeVideo === video) showPlayerThought("");
      });
      body.appendChild(video);
      activeVideo = video;

      if (isAndroidWebView) {
        video.src = url;
      } else {
        try {
          const objectUrl = await makePlayableVideoSrc(url, info);
          if (requestToken !== openRequestToken || activeVideo !== video) {
            try { URL.revokeObjectURL(objectUrl); } catch {}
            return false;
          }
          activeObjectUrl = objectUrl;
          video.src = objectUrl;
          video.load();
        } catch {
          if (requestToken !== openRequestToken || activeVideo !== video) return false;
          video.src = url;
          video.load();
        }
      }
      setPlayButtonState();
      syncNavButtons();
      return true;
    }

    const img = document.createElement("img");
    img.alt = label || "Image";
    img.decoding = "async";
    img.hidden = true;
    img.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      close();
    });
    const status = document.createElement("div");
    status.className = "media-viewer-status";
    status.textContent = "Loading image...";
    body.appendChild(status);
    body.appendChild(img);
    activeImageCleanup = loadImageWithRetries(img, url, {
      slowMs: 3200,
      finalSlowMs: 9500,
      candidates: mediaCandidateUrls(url, options),
      onLoading: () => {
        if (status.isConnected) status.textContent = "Loading image...";
      },
      onSuccess: ({ src: loadedSrc } = {}) => {
        if (requestToken !== openRequestToken) return;
        img.hidden = false;
        try { status.remove(); } catch {}
        // This is a reaction accompanying this image, not a story event.
        // Keep it out of loading/error states and clear it with the media.
        showPlayerThought(options.playerThought);
        const resolvedSrc = loadedSrc || url;
        const allowed = options.canSetAsWallpaper !== false && window.Game?.wallpaper?.canUse?.(resolvedSrc);
        activeWallpaperSrc = allowed ? window.Game.wallpaper.canonicalize(resolvedSrc) : "";
        if (wallpaperBtn) {
          wallpaperBtn.hidden = !activeWallpaperSrc;
          wallpaperBtn.textContent = window.Game?.i18n?.ui?.("wallpaper.set_as", "Set as Wallpaper") || "Set as Wallpaper";
          wallpaperBtn.classList.remove("is-success");
        }
      },
      onFailure: () => {
        img.hidden = true;
        if (status.isConnected) status.textContent = "Image unavailable";
      }
    });

    overlay.classList.add("show", "is-image");
    overlay.classList.remove("is-video");
    overlay.setAttribute("aria-hidden", "false");
    openState = true;
    try { document.body.classList.add("media-viewer-open"); } catch {}
    syncNavButtons();
    return true;
  }

  function mountThumbnail(target, src, opts = {}) {
    const el = target;
    const url = cleanPath(src || opts.fullSrc || opts.url || opts.src);
    if (!el || !url) return;
    ensureOverlay();
    ensureThumbnailDetachObserver();
    if (typeof el.__mediaViewerThumbCleanup === "function") {
      try { el.__mediaViewerThumbCleanup(); } catch {}
      el.__mediaViewerThumbCleanup = null;
    }
    const mountOwner = { retired: false };
    el.__mediaViewerThumbOwner = mountOwner;
    el.__mediaViewerWasConnected = !!el.isConnected;
    const mountCurrent = () => !mountOwner.retired && el.__mediaViewerThumbOwner === mountOwner;
    activeThumbnailMounts.add(el);
    // Type detection is asynchronous too. Give it ownership before it starts,
    // so a later mount or a detach can retire it before any DOM is replaced.
    el.__mediaViewerThumbCleanup = () => {
      mountOwner.retired = true;
      activeThumbnailMounts.delete(el);
      if (el.__mediaViewerThumbOwner === mountOwner) el.__mediaViewerThumbCleanup = null;
    };

    function mountImageThumb() {
      if (!mountCurrent()) return;
      const alt = String(opts.alt || "Image");
      const wrap = document.createElement("div");
      wrap.className = "media-thumb media-thumb-image is-loading";
      const img = document.createElement("img");
      const label = document.createElement("span");
      let cleanup = null;
      let stallTimer = null;
      let preparedWaitTimer = null;
      let viewportObserver = null;
      let loadStarted = false;
      let cleaned = false;
      const surfaceOwner = String(opts.surfaceOwner || window.Game?.currentScene || "media_viewer").trim().toLowerCase() || "media_viewer";
      const lifecycleToken = String(opts.lifecycleToken || `${surfaceOwner}:${preparedThumbnailGeneration}`);
      const episodeId = String(opts.presentationEpisodeId || [surfaceOwner, opts.storyPath || "", opts.stepIndex ?? -1, url].join("|"));
      img.alt = alt;
      img.loading = opts.loading === "eager" ? "eager" : "lazy";
      img.decoding = "async";
      label.className = "media-thumb-label";
      label.textContent = "Loading image...";
      wrap.appendChild(img);
      wrap.appendChild(label);
      el.replaceChildren(wrap);
      const armStallWatchdog = () => { stallTimer = setTimeout(() => {
        if (!wrap.classList.contains("is-loading")) return;
        // A detached presentation has no terminal UI contract and must not
        // emit a player-facing stall.  Dispose it instead.  The stable episode
        // identity also coalesces a genuine active failure across rerenders.
        if (!wrap.isConnected) { try { el.__mediaViewerThumbCleanup?.("stall_detached"); } catch {} return; }
        if (reportedThumbnailStalls.has(episodeId)) return;
        reportedThumbnailStalls.add(episodeId);
        if (reportedThumbnailStalls.size > 500) reportedThumbnailStalls.delete(reportedThumbnailStalls.values().next().value);
        try { const diagnostic={ presentationId:episodeId, surfaceOwner, lifecycleToken, story:surfaceOwner==="conversation"?String(opts.storyPath||window.__conversationRuntimeDiagnostics?.()?.storyPath||""):String(opts.storyPath||""), step:Number(opts.stepIndex??-1), logicalMediaPath:url, generation:Number(opts.generation??preparedThumbnailGeneration??0), taskState:preparedThumbnailGroups.has(url)?"prepared_pending":"presentation_loading", elapsedMs:12000, isConnected:wrap.isConnected, currentSrc:String(img.currentSrc||img.src||""), naturalWidth:Number(img.naturalWidth||0), naturalHeight:Number(img.naturalHeight||0) }; const code=surfaceOwner==="conversation"?"CONVERSATION_MEDIA_STALL":"SURFACE_MEDIA_STALL"; window.crashLog?.report?.(code, diagnostic); window.__qaDiagnosticSink?.(code,diagnostic); } catch {}
      }, 12000); };
      const startLoading = () => {
      if (loadStarted || !mountCurrent()) return;
      loadStarted = true;
      if (viewportObserver) { viewportObserver.disconnect(); viewportObserver = null; }
      // Native lazy images can wait offscreen indefinitely without attempting
      // a request. Start all resolver/retry/stall deadlines only when this
      // presentation is near the viewport, then explicitly permit the load.
      img.loading = "eager";
      armStallWatchdog();
      const prepared = opts.skipPrepared === true ? null : preparedThumbnailGroups.get(url);
      const beginLoad = async (preparedResult) => {
      if (!mountCurrent()) return;
      // Loading a detached image is valid: callers commonly build a complete
      // bubble before attaching it. The load/error lifecycle itself supplies
      // the terminal state once the bubble is mounted.
      let resolvedUrl=preparedResult?.finalUrl||url;
      if(opts.resolveRuntimeAsset===true&&window.ProtectedMediaResolver?.resolveRuntimeAsset){
        try{resolvedUrl=await window.ProtectedMediaResolver.resolveRuntimeAsset(url)}catch{resolvedUrl=url}
      }
      if (!mountCurrent()) return;
      cleanup = loadImageWithRetries(img, resolvedUrl, {
        slowMs: Number(opts.slowMs || 0) || 3400,
        finalSlowMs: Number(opts.finalSlowMs || 0) || 9000,
        candidates: resolvedUrl===url?mediaCandidateUrls(url, opts):[resolvedUrl],
        onLoading: () => {
          wrap.classList.add("is-loading");
          wrap.classList.remove("is-loaded", "media-thumb-error");
          label.textContent = "Loading image...";
          try { delete el.dataset.mediaError; } catch {}
        },
        onSuccess: () => {
          if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
          wrap.classList.remove("is-loading", "media-thumb-error");
          wrap.classList.add("is-loaded");
          label.textContent = "";
          try { delete el.dataset.mediaError; } catch {}
        },
        onFailure: () => {
          if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
          wrap.classList.remove("is-loading", "is-loaded");
          wrap.classList.add("media-thumb-error");
          el.dataset.mediaError = "1";
          label.textContent = "Image unavailable";
          try { img.removeAttribute("src"); } catch {}
        }
      });
      };
      if (prepared) {
        Promise.race([prepared.task, new Promise((resolve) => { preparedWaitTimer = setTimeout(() => resolve(null), 1800); })]).then((result) => {
          if (preparedWaitTimer) { clearTimeout(preparedWaitTimer); preparedWaitTimer = null; }
          if (!mountCurrent()) return;
          if (preparedThumbnailGroups.get(url) === prepared) {
            if (!result) prepared.cancel?.();
            preparedThumbnailGroups.delete(url);
          }
          return beginLoad(result);
        }).catch(() => beginLoad(null));
      } else {
        beginLoad(null);
      }
      };
      el.__mediaViewerThumbCleanup = () => {
        if (cleaned) return;
        cleaned = true;
        mountOwner.retired = true;
        activeThumbnailMounts.delete(el);
        if (viewportObserver) { viewportObserver.disconnect(); viewportObserver = null; }
        if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
        if (preparedWaitTimer) { clearTimeout(preparedWaitTimer); preparedWaitTimer = null; }
        if (typeof cleanup === "function") {
          try { cleanup(); } catch {}
        }
        el.__mediaViewerThumbCleanup = null;
      };
      if (img.loading === "lazy" && typeof window.IntersectionObserver === "function") {
        viewportObserver = new IntersectionObserver((entries) => {
          if (entries.some(entry => entry.isIntersecting)) startLoading();
        }, { rootMargin: "200px" });
        viewportObserver.observe(wrap);
      } else {
        startLoading();
      }
    }

    function mountVideoThumb(labelText = "Video") {
      if (!mountCurrent()) return;
      let previewIdle = null, previewTimer = null;
      const wrap = document.createElement("div");
      wrap.className = "media-thumb media-thumb-video";
      const video = document.createElement("video");
      video.muted = true;
      video.defaultMuted = true;
      video.preload = "metadata";
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.setAttribute("aria-hidden", "true");
      video.addEventListener("loadedmetadata", () => {
        wrap.classList.add("has-preview");
        try {
          const seekTo = Number.isFinite(video.duration) && video.duration > 0.18 ? 0.08 : 0;
          if (Math.abs(Number(video.currentTime || 0) - seekTo) > 0.01) video.currentTime = seekTo;
        } catch {}
      }, { once: true });
      video.addEventListener("loadeddata", () => {
        wrap.classList.add("has-preview");
      }, { once: true });
      video.addEventListener("error", () => {
        wrap.classList.remove("has-preview");
        try { video.removeAttribute("src"); video.load(); } catch {}
      }, { once: true });
      const label = document.createElement("span");
      label.className = "media-thumb-label";
      label.textContent = labelText;
      if (!isAndroidWebView) wrap.appendChild(video);
      wrap.appendChild(label);
      el.replaceChildren(wrap);
      el.__mediaViewerThumbCleanup = () => {
        if (!mountCurrent()) return;
        mountOwner.retired = true;
        activeThumbnailMounts.delete(el);
        if (previewIdle != null) { try { window.cancelIdleCallback?.(previewIdle); } catch {} previewIdle = null; }
        if (previewTimer != null) { clearTimeout(previewTimer); previewTimer = null; }
        const objectUrl = String(video.dataset?.objectUrl || "");
        if (objectUrl) {
          try { URL.revokeObjectURL(objectUrl); } catch {}
          try { video.dataset.objectUrl = ""; } catch {}
        }
        try { video.pause(); } catch {}
        try { video.removeAttribute("src"); video.load(); } catch {}
        el.__mediaViewerThumbCleanup = null;
      };
      if (isAndroidWebView) return;
      const attachPreview = () => {
        previewIdle = null; previewTimer = null;
        if (!mountCurrent() || !el.isConnected) return;
        video.src = url;
        try { video.load(); } catch {}
      };
      if ("requestIdleCallback" in window) {
        try { previewIdle = window.requestIdleCallback(attachPreview, { timeout: 900 }); } catch { previewTimer = setTimeout(attachPreview, 120); }
      } else {
        previewTimer = setTimeout(attachPreview, 120);
      }
    }

    const forcedType = normalizeMediaType(opts.type || opts.mediaType);
    if (forcedType) {
      el.dataset.mediaType = forcedType;
      if (forcedType === "video") {
        mountVideoThumb();
        return;
      }
      mountImageThumb();
      return;
    }

    const extensionType = fallbackTypeFromExtension(url);
    if (extensionType.type === "image") {
      el.dataset.mediaType = "image";
      mountImageThumb();
      return;
    }
    if (extensionType.type === "video") {
      el.dataset.mediaType = "video";
      mountVideoThumb();
      return;
    }

    el.innerHTML = `<div class="media-thumb media-thumb-video"><span class="media-thumb-label">Loading</span></div>`;
    detectMediaType(url).then((info) => {
      if (!mountCurrent() || !el.isConnected) return;
      el.dataset.mediaType = info.type || "unknown";
      if (info.type === "video") {
        mountVideoThumb();
      } else {
        mountImageThumb();
      }
    }).catch(() => {
      if (!mountCurrent() || !el.isConnected) return;
      el.dataset.mediaType = "image";
      mountImageThumb();
    });
  }

  const api = {
    __v: "2026-07-26-wallpaper-v1",
    imageExtensions: Array.from(IMAGE_EXTS),
    videoExtensions: Array.from(VIDEO_EXTS),
    resolveMediaCandidates: mediaCandidateUrls,
    prepareThumbnailGroup,
    clearPreparedThumbnailGroup,
    hasPreparedThumbnail,
    preparationDiagnostics: () => ({ ...preparationDiagnostics, events: preparationDiagnostics.events.map((row) => ({ ...row })), queued: preparationQueue.length, retained: preparedThumbnailGroups.size }),
    detectMediaType,
    mountThumbnail,
    open,
    close,
    navigate: navigateMedia,
    isOpen: () => openState
  };

  window.MediaViewer = api;
  window.Game = window.Game || {};
  window.Game.openMediaViewer = open;
  window.Game.closeMediaViewer = close;
})();
