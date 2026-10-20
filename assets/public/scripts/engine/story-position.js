(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.StoryPosition=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Single normalized story-tree representation shared by every consumer that
  // needs to address a position inside a story's step tree: the static
  // production-wide condition/label/goto shadow harness
  // (tools/qa/static_condition_shadow_harness.js) and the live canonical
  // runtime (StoryInterpreter). Neither one parses or walks the tree with its
  // own logic -- both call into this module, so "how a nested if.then/if.else
  // position is addressed" can only ever be defined in one place. This is the
  // same discipline condition-grammar.js established for condition parsing,
  // applied to step-tree addressing.
  //
  // Path format: dot-separated, e.g. "3" (root step 3), "3.then.0" (step 0 of
  // root step 3's then-branch), "3.then.0.else.2" (step 2 of that step's
  // else-branch). This is deliberately identical to the __ifPath convention
  // convo-runtime.js's cloneStoryStepsWithMeta already assigns per-step (see
  // its header comment) and to the sourceKey convention
  // static_condition_shadow_harness.js already reports conditions/labels/gotos
  // under -- not a new scheme, a formalization of the one two independent
  // legacy call sites already converged on. A branch decision's identity
  // (branchId) computed from this path is therefore stable across the legacy
  // background runner, the legacy interactive renderer, and the canonical
  // StoryInterpreter: same position, same path string, same id.
  //
  // Never mutates the steps array it is given. There is no destructive
  // "splice the chosen branch into the flat array" step anywhere in this
  // module -- a position is always expressed as (rootIndex, branchPath)
  // against the pristine, as-loaded story, which is what makes it possible to
  // resume deterministically from a saved cursor without replaying every
  // prior branch decision to reconstruct a mutated array first.

  function branchArray(step, branch) {
    if (!step || typeof step !== 'object') return [];
    if (branch === 'then') {
      if (Array.isArray(step.then)) return step.then;
      if (Array.isArray(step.steps)) return step.steps;
      return [];
    }
    return Array.isArray(step.else) ? step.else : [];
  }

  function formatPath(rootIndex, branchPath) {
    let s = String(rootIndex);
    for (const hop of (branchPath || [])) s += `.${hop.branch}.${hop.index}`;
    return s;
  }

  function parsePath(pathStr) {
    const parts = String(pathStr == null ? '' : pathStr).split('.');
    const rootIndex = Number(parts[0]);
    const branchPath = [];
    for (let i = 1; i + 1 < parts.length; i += 2) {
      branchPath.push({ branch: parts[i], index: Number(parts[i + 1]) });
    }
    return { rootIndex, branchPath };
  }

  // Resolves (rootIndex, branchPath) against `steps` without any bounds
  // normalization -- returns the array actually addressed and the index
  // within it, even if that index is out of bounds (caller decides what that
  // means: exhausted branch vs. genuinely invalid path).
  function locate(steps, rootIndex, branchPath) {
    let arr = Array.isArray(steps) ? steps : [];
    let idx = Number(rootIndex) || 0;
    for (const hop of (branchPath || [])) {
      const container = arr[idx];
      if (!container) return null;
      arr = branchArray(container, hop.branch);
      idx = Number(hop.index) || 0;
    }
    return { arr, idx };
  }

  // Advances (rootIndex, branchPath) to the next position in document order
  // that actually resolves to a step, ascending out of any branch array(s)
  // exhausted along the way. Returns null when the whole story is exhausted
  // (rootIndex has walked off the end of the root steps array with no branch
  // left to ascend out of) -- the canonical "story complete" signal.
  function normalize(steps, rootIndex, branchPath) {
    let bp = (branchPath || []).map((h) => ({ branch: h.branch, index: h.index }));
    let root = Number(rootIndex) || 0;
    for (;;) {
      const loc = locate(steps, root, bp);
      if (loc && loc.idx >= 0 && loc.idx < loc.arr.length) {
        return { rootIndex: root, branchPath: bp, step: loc.arr[loc.idx] };
      }
      if (bp.length === 0) return null;
      bp = bp.slice(0, -1);
      if (bp.length === 0) root += 1;
      else bp[bp.length - 1] = { ...bp[bp.length - 1], index: bp[bp.length - 1].index + 1 };
    }
  }

  // Position of the first step of the given branch of the step currently at
  // (rootIndex, branchPath) -- i.e. "descend into this if's then/else".
  // Caller must normalize() the result (the branch may be empty).
  function descend(rootIndex, branchPath, branch) {
    return { rootIndex, branchPath: [...(branchPath || []), { branch, index: 0 }] };
  }

  // Compares two positions for document order (the order normalize()'s own
  // ascend-and-advance walk visits them in): rootIndex partitions the walk
  // into top-level containers visited 0,1,2,...; within one rootIndex, a
  // shorter branchPath addresses an ancestor step (e.g. the `if` itself,
  // still being decided) which is always visited BEFORE its own branch's
  // children (a longer branchPath descending into `then`/`else`); at any
  // depth shared by both paths, "then" is authored/visited before "else",
  // then ties break on the numeric index. Returns <0 if A is strictly
  // before B, 0 if equal, >0 if A is after B.
  //
  // Exists to let a cursor WRITER (see game-state-engine.js's cursor merge)
  // detect a stale patch -- one computed from an if-decision that a
  // DIFFERENT, faster writer already resolved and progressed past -- without
  // that writer needing to re-derive story-tree traversal order itself. Pure
  // position arithmetic, no `steps` lookup, so it works even when the two
  // positions being compared come from independent callers that never saw
  // each other's traversal.
  function comparePosition(rootIndexA, branchPathA, rootIndexB, branchPathB) {
    const rootA = Number(rootIndexA) || 0;
    const rootB = Number(rootIndexB) || 0;
    if (rootA !== rootB) return rootA - rootB;
    const a = Array.isArray(branchPathA) ? branchPathA : [];
    const b = Array.isArray(branchPathB) ? branchPathB : [];
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const ha = a[i] || {}, hb = b[i] || {};
      if (ha.branch !== hb.branch) return ha.branch === 'then' ? -1 : (hb.branch === 'then' ? 1 : 0);
      const ia = Number(ha.index) || 0, ib = Number(hb.index) || 0;
      if (ia !== ib) return ia - ib;
    }
    return a.length - b.length;
  }

  // Position of the next sibling after (rootIndex, branchPath) at the same
  // depth, before normalization (the sibling may not exist -- normalize()
  // ascends in that case).
  function siblingAdvance(rootIndex, branchPath) {
    if (!branchPath || branchPath.length === 0) return { rootIndex: rootIndex + 1, branchPath: [] };
    const bp = branchPath.slice();
    bp[bp.length - 1] = { ...bp[bp.length - 1], index: bp[bp.length - 1].index + 1 };
    return { rootIndex, branchPath: bp };
  }

  // Recursive visitor over every step in the tree (top-level and nested
  // inside if.then/if.else at any depth), passing each step's dot-path.
  // Extracted verbatim from static_condition_shadow_harness.js's walkSteps
  // (see that file's header) so the harness and the live runtime share the
  // one traversal implementation instead of two that could silently diverge.
  function walkNormalizedSteps(steps, sourcePrefix, visitor) {
    if (!Array.isArray(steps)) return;
    steps.forEach((step, idx) => {
      if (!step || typeof step !== 'object') return;
      const sourceKey = sourcePrefix ? `${sourcePrefix}.${idx}` : String(idx);
      visitor(step, sourceKey);
      const t = String(step.type || '').toLowerCase();
      if (t === 'if') {
        if (Array.isArray(step.then)) walkNormalizedSteps(step.then, `${sourceKey}.then`, visitor);
        if (Array.isArray(step.else)) walkNormalizedSteps(step.else, `${sourceKey}.else`, visitor);
      }
    });
  }

  // Label index: name (lowercased) -> {rootIndex, branchPath}. Real
  // production content only ever defines labels at the root level (verified:
  // 0 of 193 label/goto steps across all production story files are nested
  // inside an if), but this walks the full tree so a nested label would still
  // resolve correctly rather than silently failing to be found.
  function buildLabelIndex(steps) {
    const map = new Map();
    const duplicates = [];
    walkNormalizedSteps(steps, '', (step, sourceKey) => {
      if (String(step.type || '').toLowerCase() !== 'label') return;
      const name = String(step.name || step.id || step.label || '').trim().toLowerCase();
      if (!name) return;
      if (map.has(name)) duplicates.push({ name, firstAt: map.get(name).path, duplicateAt: sourceKey });
      else map.set(name, { ...parsePath(sourceKey), path: sourceKey });
    });
    return { map, duplicates };
  }

  // Resolves a goto's target label to the position of the step AFTER the
  // label marker (labels are no-op markers; landing "on" one and then
  // immediately advancing past it every time would be redundant work for
  // every single caller of this function, so the target already points past
  // it -- matching the legacy jump()/jumpToLabelIndex "index + 1" contract).
  function resolveGotoTarget(steps, labelIndex, name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key || !labelIndex.has(key)) return null;
    const at = labelIndex.get(key);
    const after = siblingAdvance(at.rootIndex, at.branchPath);
    return normalize(steps, after.rootIndex, after.branchPath);
  }

  // Byte-for-byte copies of convo-runtime.js's normToken/keyToken (see its
  // "UNIVERSAL ALIAS REGISTRY" section). A branch decision's canonical id
  // (progression.branchReceipts key) is `${storyToken}|${token}|${condition}`
  // where token = keyToken(the step's dot-path) -- already-shipped player
  // saves have branchReceipts recorded under ids convo-runtime.js computed
  // with these exact functions. StoryInterpreter must reproduce them
  // precisely (not "an equivalent normalization") so a save made before the
  // canonical cutover still resolves its already-decided branches instead of
  // silently re-evaluating them against possibly-changed world state -- the
  // exact failure mode this whole id scheme exists to prevent.
  function normToken(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, '_');
  }
  function keyToken(raw) {
    return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '');
  }

  return {
    branchArray, formatPath, parsePath, locate, normalize, descend, siblingAdvance, comparePosition,
    walkNormalizedSteps, buildLabelIndex, resolveGotoTarget, normToken, keyToken
  };
});
