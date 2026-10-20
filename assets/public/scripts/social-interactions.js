(function (root) {
  "use strict";
  if (root.SocialInteractions) return;
  let sequence = 0;
  let subscribedEngine = null;
  const tr = (key, source, vars = {}) => {
    let text = root.Game?.i18n?.ui?.(key, source) || source;
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll("{{" + name + "}}", String(value));
    return text;
  };
  function installStyle() {
    if (document.getElementById("social-interactions-style")) return;
    const style = document.createElement("style");
    style.id = "social-interactions-style";
    style.textContent = `
      .social-interactions{padding:10px 12px 12px;color:inherit;min-width:0;font-size:13px}
      .social-interactions .social-actions,.social-interactions .social-editor-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
      .social-interactions button{min-height:44px;padding:8px 12px;border:1px solid #647084;border-radius:10px;color:inherit;background:rgba(100,116,139,.12);font:inherit;cursor:pointer}
      .social-interactions button:focus-visible,.social-interactions textarea:focus-visible{outline:2px solid #79cfff;outline-offset:2px}
      .social-interactions button[aria-pressed="true"]{color:#ff8caf;border-color:#ff8caf;background:rgba(255,140,175,.12)}
      .social-interactions button:disabled{opacity:.5;cursor:default}
      .social-interactions .social-count{margin:8px 0;font-weight:700}
      .social-interactions .social-comment,.social-interactions .social-baseline-comment{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0;line-height:1.45}
      .social-interactions .social-author{font-weight:700;margin-right:6px}
      .social-interactions textarea{display:block;box-sizing:border-box;width:100%;min-height:76px;max-height:220px;resize:vertical;padding:10px;border:1px solid #647084;border-radius:10px;background:rgba(100,116,139,.08);color:inherit;font:inherit;line-height:1.4}
      .social-interactions .social-editor-actions{margin-top:8px}
      .social-interactions .social-status{margin:6px 0;color:#ffb6c9}
      .social-interactions [hidden]{display:none!important}
    `;
    document.head.appendChild(style);
  }
  function listen(engine) {
    if (subscribedEngine === engine) return;
    subscribedEngine = engine;
    engine.subscribe(events => {
      if (!(events || []).some(e => e.type === "social:interaction-changed" || e.type === "save:restored" || /reset|checkpoint/.test(e.type || "") || String(e.type || "").startsWith("onlyfun:"))) return;
      document.querySelectorAll(".social-interactions").forEach(node => node.socialRefresh?.());
    });
  }
  function mount(host, app, postId) {
    const engine = root.GameStateEngine;
    if (!host || !engine?.getSocialInteraction) return null;
    const initial = engine.getSocialInteraction(app, postId);
    if (!initial.allowed) return null;
    installStyle();
    listen(engine);
    const lifecycle = engine.getRuntimeLifecycleIdentity();
    const node = document.createElement("section");
    node.className = "social-interactions";
    node.dataset.app = app;
    node.dataset.postId = postId;
    const el = (tag, className, parent = node) => {
      const item = document.createElement(tag); item.className = className; parent.appendChild(item); return item;
    };
    const actions = el("div", "social-actions");
    const button = (className, parent, key, source) => {
      const result = el("button", className, parent); result.type = "button"; result.textContent = tr(key, source); return result;
    };
    const like = button("social-like", actions, "social.like", "Like");
    const comment = button("social-comment-toggle", actions, "social.comment", "Comment");
    const count = el("p", "social-count");
    const baseline = el("div", "social-baseline-comments");
    const own = el("div", "social-own-comment");
    const text = el("p", "social-comment", own); text.dir = "auto";
    const ownActions = el("div", "social-actions", own);
    const edit = button("social-edit", ownActions, "social.edit", "Edit");
    const remove = button("social-delete", ownActions, "social.delete", "Delete");
    const form = el("form", "social-editor"); form.hidden = true;
    const input = el("textarea", "social-comment-input", form);
    input.maxLength = 1000; // UTF-16 may use two code units per character; commit enforces 500 characters.
    input.dir = "auto";
    input.setAttribute("aria-label", tr("social.your_comment", "Your comment"));
    input.placeholder = tr("social.write_comment", "Write a comment…");
    const formActions = el("div", "social-editor-actions", form);
    const submit = button("social-submit", formActions, "social.post_comment", "Post comment"); submit.type = "submit";
    const cancel = button("social-cancel", formActions, "social.cancel", "Cancel");
    const status = el("p", "social-status"); status.setAttribute("role", "status"); status.hidden = true;
    let current = initial;
    let stale = false;
    function refresh() {
      const identity = engine.getRuntimeLifecycleIdentity();
      stale = Object.keys(lifecycle).some(key => identity[key] !== lifecycle[key]);
      current = engine.getSocialInteraction(app, postId);
      const allowed = !stale && current.allowed;
      for (const control of node.querySelectorAll("button,textarea")) control.disabled = !allowed;
      like.textContent = tr(current.liked ? "social.liked" : "social.like", current.liked ? "Liked" : "Like");
      like.setAttribute("aria-pressed", String(current.liked));
      count.textContent = tr("social.likes_count", "{{count}} likes", { count: current.baseLikes + (current.liked ? 1 : 0) });
      baseline.replaceChildren();
      baseline.hidden = !allowed;
      if (allowed) {
        const image = app === "snapgram"
          ? (root.MasonVariantService?.resolveImage?.(current.image, current.authorId) || current.image)
          : current.image;
        for (const row of root.SocialComments?.getForPost(app, { ...current, image }) || []) {
          const line = el("p", "social-baseline-comment", baseline); line.dir = "auto";
          line.dataset.commentId = row.id;
          const author = document.createElement("span"); author.className = "social-author";
          author.textContent = row.author;
          const content = root.Game?.i18n?.sourceText?.(row.text) || row.text;
          line.append(author, document.createTextNode(content));
        }
      }
      own.hidden = !allowed || !current.comment;
      comment.hidden = !!current.comment;
      text.replaceChildren();
      if (allowed && current.comment) {
        const author = document.createElement("span"); author.className = "social-author";
        author.setAttribute("data-i18n", "");
        author.textContent = root.PlayerIdentity?.getNametag?.() || root.PlayerIdentity?.getName?.() || tr("social.you", "You");
        text.append(author, document.createTextNode(current.comment.text));
      }
      if (!allowed) { form.hidden = true; input.value = ""; }
    }
    function commit(action, extra = {}) {
      if (!node.isConnected || stale) return false;
      const result = engine.dispatch({ type: "SET_SOCIAL_INTERACTION", commandId: "social:" + Date.now() + ":" + (++sequence), payload: { app, postId, action, lifecycle, ...extra } });
      if (!result.ok) {
        status.textContent = tr("social.unavailable", "This post is no longer available. Reopen the app to refresh it."); status.hidden = false; refresh(); return false;
      }
      status.hidden = true; refresh(); return true;
    }
    function openEditor() {
      refresh(); if (stale || !current.allowed) return;
      input.value = current.comment?.text || "";
      submit.textContent = tr(current.comment ? "social.save_comment" : "social.post_comment", current.comment ? "Save comment" : "Post comment");
      form.hidden = false; input.focus();
    }
    like.addEventListener("click", () => { refresh(); commit("like", { liked: !current.liked }); });
    comment.addEventListener("click", openEditor);
    edit.addEventListener("click", openEditor);
    remove.addEventListener("click", () => { if (commit("delete_comment")) { form.hidden = true; input.value = ""; } });
    cancel.addEventListener("click", () => { form.hidden = true; status.hidden = true; });
    form.addEventListener("submit", event => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value || [...value].length > 500) {
        status.textContent = tr("social.comment_length", "Write a comment of 1 to 500 characters."); status.hidden = false; input.focus(); return;
      }
      if (commit("comment", { text: value })) { form.hidden = true; input.value = ""; }
    });
    node.socialRefresh = refresh;
    refresh(); host.appendChild(node); return node;
  }
  const refreshIdentity = () => document.querySelectorAll(".social-interactions").forEach(node => node.socialRefresh?.());
  root.addEventListener("identity:changed", refreshIdentity);
  root.addEventListener("social-identity:changed", refreshIdentity);
  root.SocialInteractions = Object.freeze({ mount });
})(window);
