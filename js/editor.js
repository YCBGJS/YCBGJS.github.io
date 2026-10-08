import { excerptFromMarkdown, validateDraft } from "./blog.js";
import { deletePost, listPosts, publishPost } from "./github.js";

const TOKEN_KEY = "ycbgjs.githubToken";
const DRAFT_KEY = "ycbgjs.draft";
const VDITOR_CDN = "/vendor/vditor";
const MIN_PANE = 180;

const tokenInput = document.querySelector("#token");
const tokenState = document.querySelector("#token-state");
const settingsPanel = document.querySelector("#settings-panel");
const settingsToggle = document.querySelector("#toggle-settings");
const titleInput = document.querySelector("#title");
const tagsInput = document.querySelector("#tags");
const dateInput = document.querySelector("#date");
const slugInput = document.querySelector("#slug");
const slugHint = document.querySelector("#slug-hint");
const excerptInput = document.querySelector("#excerpt");
const statusNode = document.querySelector("#status");
const publishButton = document.querySelector("#publish");
const postsPanel = document.querySelector("#posts-panel");
const postsToggle = document.querySelector("#toggle-posts");
const postAdmin = document.querySelector("#post-admin");
const workspace = document.querySelector(".write-workspace");

let vditor = null;
let editorReady = false;
let working = false;
let initialMarkdown = "";
let applySplit = () => {};
let splitRatioValue = 0.5;

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function savedToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setStatus(message, isError) {
  statusNode.textContent = message;
  statusNode.classList.toggle("error", Boolean(isError));
}

function markdownValue() {
  if (editorReady && vditor) return vditor.getValue();
  return initialMarkdown;
}

function currentDraft() {
  return {
    title: titleInput.value,
    tags: tagsInput.value,
    date: dateInput.value,
    slug: slugInput.value.trim(),
    excerpt: excerptInput.value,
    markdown: markdownValue(),
  };
}

function updateSlugHint() {
  const slug = slugInput.value.trim();
  slugHint.textContent = slug ? `Saves as /posts/${slug}.html` : "The filename becomes the post URL";
}

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(currentDraft()));
}

function loadDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    if (draft.title) titleInput.value = draft.title;
    if (draft.date) dateInput.value = draft.date;
    if (draft.slug) slugInput.value = draft.slug;
    if (draft.excerpt) excerptInput.value = draft.excerpt;
    if (typeof draft.markdown === "string") initialMarkdown = draft.markdown;
    if (Array.isArray(draft.tags)) tagsInput.value = draft.tags.join(", ");
    else if (draft.tags) tagsInput.value = draft.tags;
    else if (draft.category) tagsInput.value = draft.category;
  } catch {
    localStorage.removeItem(DRAFT_KEY);
  }
}

function setSettingsOpen(open) {
  settingsPanel.hidden = !open;
  settingsToggle.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) setPostsOpen(false);
  requestAnimationFrame(resizeEditor);
}

function setPostsOpen(open) {
  postsPanel.hidden = !open;
  postsToggle.setAttribute("aria-expanded", open ? "true" : "false");
}

function setWorking(value) {
  working = value;
  publishButton.disabled = value || !editorReady;
  postsToggle.disabled = value;
  postAdmin.querySelectorAll("button").forEach((button) => {
    button.disabled = value;
  });
}

function renderPostList(posts) {
  postAdmin.replaceChildren();
  if (!posts.length) {
    const empty = document.createElement("li");
    empty.textContent = "No posts yet.";
    postAdmin.append(empty);
    return;
  }
  for (const post of posts) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${post.date}  ${post.title}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost danger";
    button.textContent = "Delete";
    button.addEventListener("click", () => removePost(post));
    item.append(label, button);
    postAdmin.append(item);
  }
}

async function loadPostList(options = {}) {
  const loading = document.createElement("li");
  loading.textContent = "Loading…";
  postAdmin.replaceChildren(loading);
  try {
    const posts = await listPosts(tokenInput.value.trim() || savedToken());
    renderPostList(posts);
  } catch (error) {
    const message = error.message || "Could not load posts";
    const failed = document.createElement("li");
    failed.textContent = message;
    postAdmin.replaceChildren(failed);
    if (!options.keepStatus) setStatus(message, true);
  }
}

async function removePost(post) {
  if (working) return;
  const confirmed = window.confirm(`Delete "${post.title}"? This removes it from the site.`);
  if (!confirmed) return;
  const token = tokenInput.value.trim() || savedToken();
  if (!token) {
    setSettingsOpen(true);
    setStatus("Add a GitHub token first", true);
    return;
  }
  if (tokenInput.value.trim()) localStorage.setItem(TOKEN_KEY, tokenInput.value.trim());
  setWorking(true);
  setStatus("", false);
  try {
    await deletePost(token, post.slug, setStatus);
    tokenInput.value = "";
    refreshTokenState();
    setStatus(`Deleted. /posts/${post.slug}.html should disappear in a minute or two`, false);
    await loadPostList({ keepStatus: true });
  } catch (error) {
    setStatus(error.message || "Delete failed", true);
  } finally {
    setWorking(false);
  }
}

function refreshTokenState() {
  const exists = Boolean(savedToken());
  tokenState.textContent = exists ? "A token is saved in this browser. Leave the field empty to keep using it." : "No token yet. Save one before publishing.";
}

function isDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme() {
  if (!editorReady || !vditor) return;
  vditor.setTheme(isDark() ? "dark" : "classic", isDark() ? "dark" : "light");
}

function resizeEditor() {
  if (!vditor) return;
  const height = Math.max(workspace.clientHeight, 240);
  const root = document.querySelector("#vditor");
  const shell = root && root.querySelector(".vditor");
  if (root) root.style.height = `${height}px`;
  if (shell) shell.style.height = `${height}px`;
  applySplit();
}

function mountSplit() {
  const content = document.querySelector("#vditor .vditor-content");
  const source = content && content.querySelector(".vditor-sv");
  const preview = content && content.querySelector(".vditor-preview");
  if (!content || !source || !preview || content.querySelector(".write-split")) return;

  const handle = document.createElement("div");
  handle.className = "write-split";
  handle.tabIndex = 0;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", "Resize the editor and preview");
  preview.before(handle);
  let dragging = false;

  const apply = () => {
    if (dragging) return;
    const both = source.style.display !== "none" && preview.style.display !== "none";
    handle.hidden = !both;
    if (!both) {
      source.style.flex = "";
      source.style.width = "";
      preview.style.flex = "";
      return;
    }
    const total = content.clientWidth - handle.offsetWidth;
    if (total < MIN_PANE * 2) return;
    const width = Math.min(total - MIN_PANE, Math.max(MIN_PANE, Math.round(total * splitRatioValue)));
    source.style.flex = `0 0 ${width}px`;
    source.style.width = `${width}px`;
    preview.style.flex = "1 1 auto";
    handle.setAttribute("aria-valuenow", String(Math.round((width / total) * 100)));
  };

  const remember = () => {
    const total = content.clientWidth - handle.offsetWidth;
    if (total <= 0) return;
    splitRatioValue = Math.min(0.8, Math.max(0.2, source.getBoundingClientRect().width / total));
    apply();
  };

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    handle.classList.add("is-dragging");
    document.body.classList.add("is-splitting");
    const startX = event.clientX;
    const startWidth = source.getBoundingClientRect().width;
    const move = (ev) => {
      const total = content.clientWidth - handle.offsetWidth;
      const next = Math.min(total - MIN_PANE, Math.max(MIN_PANE, startWidth + (ev.clientX - startX)));
      source.style.flex = `0 0 ${next}px`;
      source.style.width = `${next}px`;
      preview.style.flex = "1 1 auto";
    };
    const stop = () => {
      dragging = false;
      handle.classList.remove("is-dragging");
      document.body.classList.remove("is-splitting");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      remember();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  });

  handle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const total = content.clientWidth - handle.offsetWidth;
    if (total <= 0) return;
    const current = source.getBoundingClientRect().width / total;
    const delta = event.key === "ArrowRight" ? 0.04 : -0.04;
    splitRatioValue = Math.min(0.8, Math.max(0.2, current + delta));
    apply();
  });

  const observer = new MutationObserver(apply);
  observer.observe(source, { attributes: true, attributeFilter: ["style"] });
  observer.observe(preview, { attributes: true, attributeFilter: ["style"] });
  applySplit = apply;
  apply();
  requestAnimationFrame(apply);
}

function pastePlainText(event) {
  const data = event.clipboardData;
  if (!vditor || !data || data.files.length) return;
  const text = data.getData("text/plain");
  if (!text) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  vditor.insertValue(text);
}

function createEditor() {
  if (!window.Vditor) {
    setStatus("Vditor failed to load", true);
    return;
  }
  publishButton.disabled = true;
  vditor = new window.Vditor("vditor", {
    cdn: VDITOR_CDN,
    height: Math.max(workspace.clientHeight, 240),
    mode: "sv",
    lang: "en_US",
    theme: isDark() ? "dark" : "classic",
    icon: "ant",
    value: initialMarkdown,
    placeholder: "Write something...",
    cache: { enable: false },
    outline: { enable: false },
    resize: { enable: false },
    counter: { enable: true },
    toolbar: [
      "headings",
      "bold",
      "italic",
      "strike",
      "|",
      "line",
      "quote",
      "list",
      "ordered-list",
      "check",
      "|",
      "code",
      "inline-code",
      "link",
      "table",
      "|",
      "undo",
      "redo",
      "|",
      "edit-mode",
      "both",
      "preview",
      "fullscreen",
      "outline",
    ],
    preview: {
      delay: 200,
      mode: "both",
      actions: [],
      theme: {
        current: isDark() ? "dark" : "light",
      },
    },
    input() {
      if (!editorReady) return;
      saveDraft();
    },
    after() {
      editorReady = true;
      publishButton.disabled = false;
      resizeEditor();
      applyTheme();
      const source = document.querySelector("#vditor textarea");
      if (source) source.addEventListener("paste", pastePlainText, true);
      mountSplit();
      vditor.focus();
    },
  });
}

document.querySelector("#save-token").addEventListener("click", () => {
  const token = tokenInput.value.trim();
  if (!token) {
    setStatus("Paste a token first", true);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
  tokenInput.value = "";
  refreshTokenState();
  setStatus("Token saved in this browser", false);
});

document.querySelector("#clear-token").addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  tokenInput.value = "";
  refreshTokenState();
  setStatus("Token cleared", false);
});

settingsToggle.addEventListener("click", () => {
  setSettingsOpen(settingsPanel.hidden);
});

postsToggle.addEventListener("click", () => {
  const open = postsPanel.hidden;
  if (open) setSettingsOpen(false);
  setPostsOpen(open);
  if (open) loadPostList();
  requestAnimationFrame(resizeEditor);
});

[titleInput, tagsInput, dateInput, slugInput, excerptInput].forEach((node) => {
  node.addEventListener("input", () => {
    updateSlugHint();
    saveDraft();
  });
});

publishButton.addEventListener("click", async () => {
  if (working) return;
  if (!editorReady) {
    setStatus("The editor is still loading", true);
    return;
  }
  const draft = currentDraft();
  const problem = validateDraft(draft);
  if (problem) {
    setStatus(problem, true);
    return;
  }
  if (!draft.excerpt.trim() && !excerptFromMarkdown(draft.markdown)) {
    setStatus("Add an excerpt, or start the post with a sentence that can stand alone", true);
    return;
  }
  const token = tokenInput.value.trim() || savedToken();
  if (!token) {
    setSettingsOpen(true);
    setStatus("Add a GitHub token first", true);
    return;
  }
  if (tokenInput.value.trim()) localStorage.setItem(TOKEN_KEY, tokenInput.value.trim());
  const confirmed = window.confirm(`Publish "${draft.title.trim()}"?`);
  if (!confirmed) return;
  setWorking(true);
  setStatus("", false);
  try {
    const published = await publishPost(token, draft, setStatus);
    localStorage.removeItem(DRAFT_KEY);
    window.location.assign(`${published.site.origin}/`);
    return;
  } catch (error) {
    setStatus(error.message || "Publish failed", true);
  } finally {
    setWorking(false);
  }
});

if (!dateInput.value) dateInput.value = today();
if (!slugInput.value) slugInput.value = dateInput.value;
loadDraft();
refreshTokenState();
updateSlugHint();
createEditor();

window.addEventListener("resize", resizeEditor);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
if (window.ResizeObserver) {
  new ResizeObserver(resizeEditor).observe(workspace);
}
