(function (root) {
  'use strict';
  if (!root || !root.Storage || root.__engineProtectedStorageGuardInstalled) return;
  const enabled = root.__ENGINE_QA__ === true || /(?:\?|&)engineQa=1(?:&|$)/.test(String(root.location && root.location.search || ''));
  if (!enabled) return;
  const protectedKey = /^(?:intercepted_engine_|pending_story_v1$|conv_progress_|conv_done_|once_|__once:|active_character:|character_route_|choices_log_v1$|conversations$|notifications$)/;
  const approvedStack = /[\\/]scripts[\\/]engine[\\/]engine-storage\.js/i;
  for (const method of ['setItem', 'removeItem']) {
    const original = root.Storage.prototype[method];
    Object.defineProperty(root.Storage.prototype, method, { configurable: true, writable: true, value: function (key, value) {
      if (protectedKey.test(String(key))) {
        const stack = String(new Error().stack || '');
        if (!approvedStack.test(stack)) {
          const error = new Error(`PROTECTED_PROGRESSION_WRITE: ${method}(${String(key)})`);
          error.code = 'PROTECTED_PROGRESSION_WRITE';
          throw error;
        }
      }
      return original.apply(this, arguments);
    }});
  }
  root.__engineProtectedStorageGuardInstalled = true;
})(typeof window !== 'undefined' ? window : globalThis);
