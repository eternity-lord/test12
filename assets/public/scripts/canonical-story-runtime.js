(function (root) {
  'use strict';
  if (root.CanonicalStoryRuntime?.__canonical) return;

  const engine = root.GameStateEngine;
  const InterpreterClass = root.StoryInterpreter;
  if (!engine || !InterpreterClass) return;

  let interpreter = null;

  function ensureInterpreter() {
    if (interpreter && !interpreter.destroyed) return interpreter;
    interpreter = new InterpreterClass(engine, { id: 'canonical-story-runtime' });
    return interpreter;
  }

  function retireInterpreterWithoutLeaseRelease() {
    if (!interpreter || interpreter.destroyed) return;
    try {
      for (const resource of interpreter.resources) {
        try { resource.abort?.(); if (typeof resource === "function") resource(); } catch {}
      }
      interpreter.resources.clear();
    } catch {}
    interpreter.destroyed = true;
    InterpreterClass.activeCount = 0;
    InterpreterClass.activeId = null;
  }

  ensureInterpreter();

  // Recreate after a restore lands a new session (RESTORE_SAVE bumps operationEpoch).
  // Deliberately does NOT call interpreter.destroy() -- destroy() calls cancel(),
  // which dispatches RELEASE_LEASE against the engine's CURRENT state. This fires
  // reentrantly inside RESTORE_SAVE's own listener loop, so "current state" is
  // already the just-restored one: it would release the lease RESTORE_SAVE had
  // just established, wiping the resumed story/contact/step it had just set up.
  // The old interpreter's own resources are tied to its old lease id, which
  // validateLease() already rejects against the new state, so they're inert;
  // still abort them directly (no dispatch) so no stale timer keeps firing.
  // Narrow accessor (no full-state clone) -- see getOperationEpoch()'s own
  // comment in game-state-engine.js. This subscriber runs on EVERY dispatch
  // and only ever needed this one primitive number.
  let lastEpoch = engine.getOperationEpoch ? engine.getOperationEpoch() : (engine.getState()?.execution?.operationEpoch ?? 0);
  engine.subscribe(() => {
    const epoch = engine.getOperationEpoch ? engine.getOperationEpoch() : (engine.getState()?.execution?.operationEpoch ?? 0);
    if (epoch === lastEpoch) return;
    lastEpoch = epoch;
    retireInterpreterWithoutLeaseRelease();
    interpreter = null;
    ensureInterpreter();
  });

  try {
    // A reload or real process close must preserve the durable canonical
    // lease. destroy() calls cancel(), which dispatches RELEASE_LEASE against
    // the current state; immediately after RESTORE_SAVE that erased the fresh
    // INPUT_REQUIRED cursor before the next document could hydrate it.
    root.addEventListener?.('beforeunload', retireInterpreterWithoutLeaseRelease);
  } catch {}

  // Deterministic, non-mutating projection of what COMMIT_MESSAGE_EVENT would
  // produce for the given payload against the engine's CURRENT committed state.
  // Runs the real command handler against a throwaway clone so the projection
  // can never drift from the actual canonical logic, then discards the clone.
  // No call here ever touches the live engine, its storage, or localStorage.
  function shadowDispatch(command) {
    const GameStateEngineClass = root.GameStateEngineClass;
    const MemoryStorage = root.EngineStorage?.MemoryStorage;
    if (!GameStateEngineClass || !MemoryStorage) return { ok: false, status: 'SHADOW_UNAVAILABLE', events: [] };
    const shadow = new GameStateEngineClass();
    const seed = JSON.parse(JSON.stringify(engine.getState()));
    const storage = new MemoryStorage({
      intercepted_engine_state_v4: JSON.stringify(seed),
      intercepted_engine_stable_revision_v4: String(seed.revision)
    });
    shadow.initialize({ storage, sessionId: 'shadow' });
    return shadow.dispatch(command);
  }

  // -------------------------
  // Migration diagnostics: per-step-type counters proving whether a step type's
  // canonical path is actually load-bearing (attempts/successes) or still
  // silently falling back to a legacy authority. A step type is only safe to
  // declare "canonical, no fallback" once every *LegacyFallbacks counter for it
  // stays at 0 across the required scenario matrix -- this service is the one
  // place that count is measured, so no migration claim rests on inference.
  // -------------------------
  const migrationDiagnostics = new Map();

  function ensureStepDiag(stepType) {
    if (!migrationDiagnostics.has(stepType)) {
      migrationDiagnostics.set(stepType, {
        stepType,
        backgroundCanonicalAttempts: 0,
        backgroundCanonicalSuccesses: 0,
        backgroundLegacyFallbacks: 0,
        interactiveCanonicalAttempts: 0,
        interactiveCanonicalSuccesses: 0,
        interactiveLegacyFallbacks: 0,
        duplicateCanonicalAttempts: 0,
        duplicateCanonicalRejections: 0,
        visibleEffects: 0,
        persistentCommits: 0,
        continuationReceipts: 0,
        errors: []
      });
    }
    return migrationDiagnostics.get(stepType);
  }

  function recordStepAttempt(stepType, mode, outcome, detail) {
    const d = ensureStepDiag(stepType);
    const attemptsKey = mode === 'interactive' ? 'interactiveCanonicalAttempts' : 'backgroundCanonicalAttempts';
    const successKey = mode === 'interactive' ? 'interactiveCanonicalSuccesses' : 'backgroundCanonicalSuccesses';
    const fallbackKey = mode === 'interactive' ? 'interactiveLegacyFallbacks' : 'backgroundLegacyFallbacks';
    d[attemptsKey] += 1;
    if (outcome === 'committed') {
      d[successKey] += 1;
      d.persistentCommits += 1;
    } else if (outcome === 'duplicate') {
      d[successKey] += 1;
      d.duplicateCanonicalAttempts += 1;
      d.duplicateCanonicalRejections += 1;
    } else if (outcome === 'fallback') {
      d[fallbackKey] += 1;
      d.errors.push({
        at: Date.now(),
        mode,
        stepType,
        story: detail?.story || null,
        contactId: detail?.contactId || null,
        lease: detail?.lease || null,
        status: detail?.status || null,
        error: detail?.error || null
      });
    }
    return d;
  }

  function getMigrationDiagnostics() {
    return Array.from(migrationDiagnostics.values()).map((d) => ({ ...d, errors: d.errors.slice(-20) }));
  }

  function resetMigrationDiagnostics(stepType) {
    if (stepType) migrationDiagnostics.delete(stepType);
    else migrationDiagnostics.clear();
  }

  // -------------------------
  // Shadow validation (mandatory-cutover-strategy steps 2-4): for every
  // condition the LIVE evaluator (evalIfConditionExpr, duplicated in
  // convo-runtime.js/conversation.html) decides, also ask StoryInterpreter's
  // condition() what it would decide against the SAME canonical state, and
  // record whether they agree. This is how the all:/any: divergence would
  // have been caught mechanically instead of by hand-auditing the grammar --
  // it is the proof mechanism the cutover for `if` depends on, not a
  // permanent second evaluator: once a group's mismatch count is proven zero
  // across real content, the interpreter becomes the sole authority and this
  // comparison (and the legacy evaluator it's comparing against) is removed.
  // Pure comparison -- never mutates production state, never affects which
  // branch is actually taken.
  // -------------------------
  const MAX_SHADOW_RECORDS = 1000;
  const shadowComparisons = [];

  function shadowEvaluateCondition(conditionExpr, engineState) {
    try {
      return !!InterpreterClass.prototype.condition({ condition: conditionExpr }, engineState);
    } catch (err) {
      return { __interpreterError: String(err && err.message || err), __code: err && err.code || null };
    }
  }

  function recordShadowComparison(record) {
    const legacyDecision = !!record.legacyDecision;
    const interpreterResult = record.interpreterDecision;
    const interpreterErrored = interpreterResult && typeof interpreterResult === 'object' && '__interpreterError' in interpreterResult;
    // CONDITION_NOT_YET_CANONICAL is a documented, expected gap (choice:/
    // hak_target: prefixes -- Groups 2 and 5, not migrated yet), not a real
    // disagreement to fix now. Classifying it separately keeps the mismatch
    // list actionable: everything in it is a genuine divergence to resolve,
    // not noise from a step type this pipeline isn't validating yet.
    const notYetCanonical = interpreterErrored && interpreterResult.__code === 'CONDITION_NOT_YET_CANONICAL';
    const interpreterDecision = interpreterErrored ? null : !!interpreterResult;
    const agree = !interpreterErrored && legacyDecision === interpreterDecision;
    const entry = {
      at: Date.now(),
      kind: record.kind || 'condition',
      storyPath: record.storyPath || null,
      contactId: record.contactId || null,
      sourceStepKey: record.sourceStepKey || null,
      expr: record.expr || null,
      mode: record.mode || 'background',
      legacyDecision,
      interpreterDecision,
      interpreterError: interpreterErrored ? interpreterResult.__interpreterError : null,
      notYetCanonical,
      agree,
      canonicalRevision: record.canonicalRevision ?? null
    };
    shadowComparisons.push(entry);
    if (shadowComparisons.length > MAX_SHADOW_RECORDS) shadowComparisons.shift();
    if (!agree && !notYetCanonical) {
      try {
        console.error('[ShadowValidation][mismatch]', entry);
      } catch {}
    }
    return entry;
  }

  function getShadowComparisons() { return shadowComparisons.slice(); }
  function getShadowMismatches() { return shadowComparisons.filter((r) => !r.agree && !r.notYetCanonical); }
  function getShadowNotYetCanonical() { return shadowComparisons.filter((r) => r.notYetCanonical); }
  function resetShadowComparisons() { shadowComparisons.length = 0; }

  root.CanonicalStoryRuntime = Object.freeze({
    __canonical: true,
    get: () => ensureInterpreter(),
    shadowDispatch,
    recordStepAttempt,
    getMigrationDiagnostics,
    resetMigrationDiagnostics,
    shadowEvaluateCondition,
    recordShadowComparison,
    getShadowComparisons,
    getShadowMismatches,
    getShadowNotYetCanonical,
    resetShadowComparisons,
    getDiagnostics: () => {
      const i = ensureInterpreter();
      return i.getDiagnostics();
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
