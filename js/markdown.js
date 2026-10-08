function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unescapeHtml(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function safeUrl(url) {
  const value = unescapeHtml(url).trim();
  if (/^(https?:|mailto:|\/)/i.test(value)) return value;
  return "";
}

function renderInline(raw) {
  const codes = [];
  const withCodes = raw.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(escapeHtml(code));
    return `\u0000${codes.length - 1}\u0000`;
  });
  let html = escapeHtml(withCodes);
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
    const href = safeUrl(url);
    if (!href) return alt;
    return `<img src="${escapeHtml(href)}" alt="${alt}">`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const href = safeUrl(url);
    if (!href) return label;
    return `<a href="${escapeHtml(href)}">${label}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  html = html.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codes[Number(index)]}</code>`);
  return html;
}

const MERMAID_START = /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|C4Context|sankey-beta|xychart-beta|block-beta|quadrantChart|requirementDiagram|kanban|architecture-beta)\b/;

function isMermaidSource(source) {
  return MERMAID_START.test(String(source).trim());
}

function isBlockStart(line) {
  return (
    line.startsWith("```") ||
    line.startsWith(">") ||
    /^(#{1,3})\s+/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^(-{3,}|\*{3,})$/.test(line.trim())
  );
}

export function renderMarkdown(source) {
  const lines = String(source).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim().split(/\s+/)[0].toLowerCase();
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const body = escapeHtml(code.join("\n"));
      const mermaid = lang === "mermaid" || isMermaidSource(code.join("\n"));
      if (mermaid) {
        blocks.push(`<pre class="mermaid"><code>${body}</code></pre>`);
      } else if (/^[a-z0-9-]+$/.test(lang)) {
        blocks.push(`<pre><code class="language-${lang}">${body}</code></pre>`);
      } else {
        blocks.push(`<pre><code>${body}</code></pre>`);
      }
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const tag = `h${heading[1].length + 1}`;
      blocks.push(`<${tag}>${renderInline(heading[2].trim())}</${tag}>`);
      index += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const quote = [];
      while (index < lines.length && lines[index].startsWith(">")) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote><p>${renderInline(quote.join(" "))}</p></blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].replace(/^[-*]\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].replace(/^\d+\.\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }

  return blocks.join("\n");
}
