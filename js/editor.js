import { excerptFromMarkdown, validateDraft } from "./blog.js";
import { publishPost } from "./github.js";

const TOKEN_KEY = "ycbgjs.githubToken";
const DRAFT_KEY = "ycbgjs.draft";
const SPLIT_KEY = "ycbgjs.splitRatio";
const VDITOR_CDN = "/vendor/vditor";
const MIN_PANE = 180;

const tokenInput = document.querySelector("#token");
const tokenState = document.querySelector("#token-state");
const settingsPanel = document.querySelector("#settings-panel");
const settingsToggle = document.querySelector("#toggle-settings");
const titleInput = document.querySelector("#title");
const categoryInput = document.querySelector("#category");
const customCategory = document.querySelector("#category-custom");
const customWrap = document.querySelector("#custom-wrap");
const dateInput = document.querySelector("#date");
const slugInput = document.querySelector("#slug");
const slugHint = document.querySelector("#slug-hint");
const excerptInput = document.querySelector("#excerpt");
const statusNode = document.querySelector("#status");
const publishButton = document.querySelector("#publish");
const workspace = document.querySelector(".write-workspace");

let vditor = null;
let editorReady = false;
let initialMarkdown = "";
let applySplit = () => {};

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

function currentCategory() {
  if (categoryInput.value === "Other") return customCategory.value.trim();
  return categoryInput.value;
}

function syncCategoryField() {
  const custom = categoryInput.value === "Other";
  customWrap.hidden = !custom;
}

function markdownValue() {
  if (editorReady && vditor) return vditor.getValue();
  return initialMarkdown;
}

function currentDraft() {
  return {
    title: titleInput.value,
    category: currentCategory(),
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
    if (draft.category === "Design" || draft.category === "Writing" || draft.category === "Daily") {
      categoryInput.value = draft.category;
    } else if (draft.category) {
      categoryInput.value = "Other";
      customCategory.value = draft.category;
    }
  } catch {
    localStorage.removeItem(DRAFT_KEY);
  }
}

function setSettingsOpen(open) {
  settingsPanel.hidden = !open;
  settingsToggle.setAttribute("aria-expanded", open ? "true" : "false");
  requestAnimationFrame(resizeEditor);
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

function splitRatio() {
  const value = Number(localStorage.getItem(SPLIT_KEY));
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.8, Math.max(0.2, value));
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
    const total = Math.max(content.clientWidth - handle.offsetWidth, MIN_PANE * 2);
    const width = Math.min(total - MIN_PANE, Math.max(MIN_PANE, Math.round(total * splitRatio())));
    source.style.flex = `0 0 ${width}px`;
    source.style.width = `${width}px`;
    preview.style.flex = "1 1 auto";
    handle.setAttribute("aria-valuenow", String(Math.round((width / total) * 100)));
  };

  const remember = () => {
    const total = content.clientWidth - handle.offsetWidth;
    if (total <= 0) return;
    const ratio = source.getBoundingClientRect().width / total;
    localStorage.setItem(SPLIT_KEY, String(Math.min(0.8, Math.max(0.2, ratio))));
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
    localStorage.setItem(SPLIT_KEY, String(Math.min(0.8, Math.max(0.2, current + delta))));
    apply();
  });

  const observer = new MutationObserver(apply);
  observer.observe(source, { attributes: true, attributeFilter: ["style"] });
  observer.observe(preview, { attributes: true, attributeFilter: ["style"] });
  applySplit = apply;
  apply();
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

[titleInput, categoryInput, customCategory, dateInput, slugInput, excerptInput].forEach((node) => {
  node.addEventListener("input", () => {
    syncCategoryField();
    updateSlugHint();
    saveDraft();
  });
});

categoryInput.addEventListener("change", () => {
  syncCategoryField();
  if (categoryInput.value === "Other") setSettingsOpen(true);
  updateSlugHint();
  saveDraft();
});

publishButton.addEventListener("click", async () => {
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
  publishButton.disabled = true;
  setStatus("", false);
  try {
    const post = await publishPost(token, draft, setStatus);
    localStorage.removeItem(DRAFT_KEY);
    tokenInput.value = "";
    refreshTokenState();
    setStatus(`Published. /posts/${post.slug}.html should be up in a minute or two`, false);
  } catch (error) {
    setStatus(error.message || "Publish failed", true);
  } finally {
    publishButton.disabled = false;
  }
});

if (!dateInput.value) dateInput.value = today();
if (!slugInput.value) slugInput.value = dateInput.value;
loadDraft();
syncCategoryField();
refreshTokenState();
updateSlugHint();
createEditor();

window.addEventListener("resize", resizeEditor);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
if (window.ResizeObserver) {
  new ResizeObserver(resizeEditor).observe(workspace);
}
