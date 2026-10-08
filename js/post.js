const MERMAID_START = /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|C4Context|sankey-beta|xychart-beta|block-beta|quadrantChart|requirementDiagram|kanban|architecture-beta)\b/;

function diagramNodes() {
  return [...document.querySelectorAll(".post-content pre")].filter((pre) => {
    const code = pre.querySelector("code");
    const text = (pre.dataset.source || (code || pre).textContent).trim();
    const marked = pre.classList.contains("mermaid") || (code && code.classList.contains("language-mermaid"));
    if (!marked && !MERMAID_START.test(text)) return false;
    if (!pre.dataset.source) pre.dataset.source = text;
    pre.classList.add("mermaid");
    return true;
  });
}

function loadMermaid() {
  if (window.mermaid) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/vditor/dist/js/mermaid/mermaid.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Mermaid failed to load"));
    document.head.appendChild(script);
  });
}

let rendering = false;

async function renderDiagrams() {
  const nodes = diagramNodes();
  if (!nodes.length || rendering) return;
  rendering = true;
  try {
    await loadMermaid();
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: dark ? "dark" : "default",
    });
    for (const node of nodes) {
      const id = `post-mermaid-${Math.random().toString(36).slice(2)}`;
      try {
        const { svg } = await window.mermaid.render(id, node.dataset.source);
        node.innerHTML = svg;
      } catch (error) {
        const failed = document.getElementById(id);
        if (failed) failed.remove();
        node.textContent = error && error.message ? error.message : "Could not draw this diagram";
      }
    }
  } finally {
    rendering = false;
  }
}

renderDiagrams();
new MutationObserver(() => {
  renderDiagrams();
}).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
