(function(root){
  'use strict';
  if (root.CanonicalNotificationService?.__canonical) return;

  const engine = root.GameStateEngine;
  const delivering = new Set();

  if (!engine) return;

  const normalizeId = (value) => String(value || '').trim();
  const state = () => engine.getGameplayState() || {};

  // Centralized template resolution -- canonical committed notification
  // events intentionally keep the RAW {{name:x}}/{{status:x}} token (so a
  // later contact rename retroactively updates history); every consumer
  // that turns one into user-facing text must resolve it itself, through
  // the SAME single global resolver (window.Game.tpl, defined in
  // index.html) every other surface (conversation.html's addBubble,
  // convo-runtime.js's tplText) already uses. Root cause of a real, live,
  // reported bug: a "notify" step processed through the canonical Group 1
  // StoryInterpreter (scripts/engine/story-interpreter.js) commits its
  // `text`/`fromName` fields verbatim from the story JSON -- this service
  // is the only place that ever turns that committed row into a popup/list
  // string, so a missing resolve call here reached the player raw. Not a
  // Hailey/Aiden special case: every notify step across the story catalog
  // using a {{name:*}} token was equally exposed.
  // window.Game.tpl only resolves a {{name:x}} token from the player's own
  // saved identity (player_identity_v1) -- it has NO pretty-name fallback of
  // its own (unlike convo-runtime.js's tplText/replaceNameTags, which always
  // falls back to a capitalized default like "Evelyn" when nothing is
  // seeded yet). Early in a fresh playthrough, before any dialogue involving
  // a given character has ever run through the identity/alias-learning
  // path, Game.tpl alone can legitimately leave a token unresolved -- this
  // final pass guarantees the same "never a raw token" contract everywhere
  // else already has, without duplicating a private per-file resolver.
  const prettyNameFromKey = (raw) => {
    const key = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (!key) return 'Unknown';
    return key.split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  };
  const resolveTemplate = (value) => {
    const raw = String(value || '');
    if (!raw) return raw;
    let out = raw;
    try {
      if (typeof root.Game?.tpl === 'function') out = root.Game.tpl(raw);
    } catch {}
    if (out.indexOf('{{') === -1) return out;
    return out.replace(/\{\{\s*(?:name|status)\s*:\s*([^}]+?)\s*\}\}/gi, (_, key) => prettyNameFromKey(key));
  };

  const committedEvents = () => (state().notifications?.committedEvents || {});

  const keysFor = (value) => {
    const target = normalizeId(value);
    if (!target) return [];
    return [
      target
    ];
  };

  const matchRow = (row, target) => {
    if (!row || !target) return false;
    return [
      row.notificationId,
      row.eventId,
      row.sourceEventId,
      row.messageEventId
    ].some((value) => normalizeId(value) === target);
  };

  const resolveRecord = (id) => {
    const target = normalizeId(id);
    if (!target) return null;

    const rows = committedEvents();
    if (rows[target]) return rows[target];

    const candidateKeys = new Set(keysFor(target));
    for (const row of Object.values(rows)) {
      if (!row || typeof row !== 'object') continue;
      const rowKeys = [row.notificationId, row.eventId, row.sourceEventId, row.messageEventId];
      for (const value of rowKeys) {
        const normalized = normalizeId(value);
        if (normalized) candidateKeys.add(normalized);
      }
    }

    for (const [rowKey, row] of Object.entries(rows)) {
      if (candidateKeys.has(rowKey)) return row;
      if (matchRow(row, target)) return row;
    }

    for (const key of candidateKeys) {
      if (rows[key]) return rows[key];
    }

    return null;
  };

  const resolveId = (row) => normalizeId(row?.notificationId || row?.eventId || row?.sourceEventId || row?.messageEventId);

  function record(id) {
    return resolveRecord(id);
  }

  function deliver(id) {
    const row = resolveRecord(id);
    if (!row) return null;
    // Keep the canonical notification unacknowledged until the player has
    // confirmed their name, so its first visible text uses that identity.
    if (root.PlayerIdentity?.isPending?.()) return row;

    const notificationId = resolveId(row);
    if (!notificationId) return row;

    if (row.displayReceipt || delivering.has(notificationId)) return row;

    delivering.add(notificationId);
    try {
      const payload = row.payload || {};
      // A story author's own "don't preview this text, the very next step
      // shows it for real anyway" convention (or the renderer's short local
      // dedup window) -- recorded on the canonical event itself rather than
      // by skipping the commit, since a skipped commit here would just get
      // silently filled in later by the interpreter's own catch-up walk
      // (which has no way to know a caller intentionally chose not to
      // commit a step -- it only knows the canonical cursor hasn't reached
      // it yet) the next time this contact's story asks the engine to catch
      // up to a later position. The notification is still permanently
      // recorded (progression/dedup stays correct); only its delivery to
      // Feature 1's popup pipeline is suppressed.
      if (payload.suppressPopup === true) {
        const current = state();
        const result = engine.dispatch({
          type: 'MARK_NOTIFICATION_DISPLAYED',
          commandId: `notification-display:${notificationId}`,
          expectedRevision: current.revision,
          payload: { notificationId, eventId: notificationId, displayedAt: Date.now() }
        });
        return result.ok ? record(notificationId) : row;
      }
      const app = normalizeId(payload.app || 'messages').toLowerCase() || 'messages';
      // "messages"-app notifications (every real "notify" story step today)
      // reuse Feature 1's OWN pushMessage -- the same function every other
      // message-style popup goes through -- so contact-name resolution,
      // avatar fallback, cinematic-lock queueing and popup/unread dedup all
      // stay exactly as they already are for every other message. This
      // canonical service only decides WHETHER/WHEN to fire, never HOW the
      // popup itself renders.
      if (app === 'messages' && typeof root.Game?.Inbox?.pushMessage === 'function') {
        root.Game.Inbox.pushMessage({
          contactId: row.contactId,
          avatar: payload.avatar || '',
          from: payload.fromId || row.contactId,
          kind: payload.kind || 'text',
          text: resolveTemplate(payload.text || ''),
          eventId: notificationId,
          ts: row.committedAt || undefined,
          popup: true,
          bumpUnread: true
        });
      } else if (typeof root.Game?.notify === 'function') {
        const resolvedText = resolveTemplate(payload.text || '');
        const creatorId = normalizeId(payload.fromId || row.contactId).toLowerCase();
        // Saved notifications may predate the creator's display-name change.
        // Keep their stable identity and delivery receipt; project the current name.
        const fromName = app === 'onlyfun' && ['static_muse', 'staticmuse', 'sexminator'].includes(creatorId)
          ? 'Sexminator' : resolveTemplate(payload.fromName || '');
        root.Game.notify({
          notificationId,
          eventId: notificationId,
          notifId: notificationId,
          app,
          contactId: row.contactId,
          fromId: payload.fromId || row.contactId,
          fromName,
          avatar: payload.avatar || '',
          text: resolvedText,
          body: resolvedText,
          target: payload.target || undefined,
          evidenceIds: Array.isArray(payload.evidenceIds) ? payload.evidenceIds.slice() : undefined,
          open: payload.open && typeof payload.open === 'object' ? { ...payload.open } : undefined,
          sourceEventId: row.sourceEventId,
          messageEventId: row.messageEventId,
          __canonicalNotification: true
        });
      }

      const current = state();
      const result = engine.dispatch({
        type: 'MARK_NOTIFICATION_DISPLAYED',
        commandId: `notification-display:${notificationId}`,
        expectedRevision: current.revision,
        payload: {
          notificationId,
          eventId: notificationId,
          displayedAt: Date.now()
        }
      });
      return result.ok ? record(notificationId) : row;
    } finally {
      delivering.delete(notificationId);
    }
  }

  function click(id) {
    const row = resolveRecord(id);
    if (!row) return { ok: false, status: 'NOTIFICATION_NOT_FOUND', events: [] };

    const current = state();
    const notificationId = resolveId(row);
    if (!notificationId) {
      return { ok: false, status: 'NOTIFICATION_INVALID', events: [] };
    }

    return engine.dispatch({
      type: 'OPEN_CONTACT',
      commandId: `notification-open:${notificationId}`,
      expectedRevision: current.revision,
      payload: {
        contactId: row.contactId,
        sourceEventId: row.sourceEventId,
        notificationId,
        eventId: row.messageEventId || row.sourceEventId || undefined
      }
    });
  }

  const unsubscribe = engine.subscribe((events) => {
    for (const event of events || []) {
      if (event?.type !== 'notification:committed') continue;
      queueMicrotask(() => deliver(event.notificationId || event.eventId || event.sourceEventId || event.messageEventId || event.id));
    }
  });

  function deliverPending() {
    for (const id of Object.keys(committedEvents() || {})) deliver(id);
  }
  root.addEventListener?.('player-name:confirmed', deliverPending);

  const api = {
    __canonical: true,
    deliver,
    click,
    get: (id) => record(id),
    dispose() {
      unsubscribe();
      root.removeEventListener?.('player-name:confirmed', deliverPending);
    }
  };

  root.CanonicalNotificationService = Object.freeze(api);

  queueMicrotask(deliverPending);
})(typeof window !== 'undefined' ? window : globalThis);
