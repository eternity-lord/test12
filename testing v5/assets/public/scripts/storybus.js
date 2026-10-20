(function () {
  // Si déjà initialisé, on ne refait rien (idempotent)
  if (window.StoryBus && typeof window.StoryBus.emit === "function") return;

  // Polyfill léger CustomEvent (sécurité)
  (function () {
    try { new CustomEvent("x"); }
    catch (_) {
      function CustomEventPolyfill(event, params) {
        params = params || { bubbles: false, cancelable: false, detail: undefined };
        const evt = document.createEvent("CustomEvent");
        evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
        return evt;
      }
      CustomEventPolyfill.prototype = window.Event.prototype;
      window.CustomEvent = CustomEventPolyfill;
    }
  })();

  // EventTarget interne unique
  const Bus = new EventTarget();

  // Expose l'API publique
  window.StoryBus = {
    on(type, fn) { if (type && fn) Bus.addEventListener(type, fn); },
    off(type, fn) { if (type && fn) Bus.removeEventListener(type, fn); },

    /**
     * Émission d'un évènement StoryBus
     * -> dispatch sur Bus interne
     * -> miroir sur window avec marqueur __fromStoryBus pour éviter les doublons
     */
    emit(type, detail = {}) {
      if (!type) return;

      // 1) Bus interne (detail "pur")
      Bus.dispatchEvent(new CustomEvent(type, { detail }));

      // 2) window mirror (detail marqué)
      try {
        const winDetail =
          (detail && typeof detail === "object")
            ? { ...detail, __fromStoryBus: true }
            : { value: detail, __fromStoryBus: true };

        window.dispatchEvent(new CustomEvent(type, { detail: winDetail }));
      } catch {}
    },

    dispatchEvent(evt) { return Bus.dispatchEvent(evt); },
    addEventListener(type, fn) { return Bus.addEventListener(type, fn); },
    removeEventListener(type, fn) { return Bus.removeEventListener(type, fn); },

    once(type, fn) {
      if (!type || !fn) return;
      const wrapper = (e) => { try { fn(e); } finally { Bus.removeEventListener(type, wrapper); } };
      Bus.addEventListener(type, wrapper);
    }
  };
})();
