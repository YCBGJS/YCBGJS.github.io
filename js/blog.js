import { renderMarkdown } from "./markdown.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function chipFor(category) {
  if (category === "Writing") return "chip-mint";
  if (category === "Daily") return "chip-lilac";
  return "";
}

export function parseTags(value) {
  const seen = new Set();
  const tags = [];
  for (const part of String(value || "").split(/[,，]/)) {
    const tag = part.trim().replace(/\s+/g, " ");
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export function postTags(post) {
  if (Array.isArray(post.tags) && post.tags.length) return post.tags;
  if (post.category) return [post.category];
  return [];
}

export function chipClass(chip) {
  return chip ? `chip ${chip}` : "chip";
}

export function validateDraft(draft) {
  if (!draft.title || !draft.title.trim()) return "Add a title";
  if (draft.title.trim().length > 80) return "The title is too long";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date || "")) return "Use a YYYY-MM-DD date";
  const [year, month, day] = draft.date.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return "That date is not valid";
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug || "")) {
    return "The filename can only use lowercase letters, numbers, and hyphens";
  }
  const tags = parseTags(draft.tags ?? draft.category);
  if (!tags.length) return "Add a tag";
  if (tags.length > 5) return "Use at most 5 tags";
  if (tags.some((tag) => tag.length > 16)) return "A tag is too long";
  if (!draft.markdown || !draft.markdown.trim()) return "The post is still empty";
  if (draft.markdown.length > 100000) return "The post is too long";
  return "";
}

export function clipExcerpt(text) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= 48) return clean;
  return `${clean.slice(0, 48).replace(/[，。、；：,. ]+$/u, "")}…`;
}

export function excerptFromMarkdown(markdown) {
  const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
  let inCode = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode || !line || line.startsWith("#") || /^(-{3,}|\*{3,})$/.test(line)) continue;
    const text = line
      .replace(/^>\s?/, "")
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/!\[[^\]]*]\([^)]+\)/g, "")
      .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
      .replace(/[*_`]/g, "")
      .trim();
    if (text) return clipExcerpt(text);
  }
  return "";
}

export function sortPosts(posts) {
  return [...posts].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.slug === b.slug) return 0;
    return a.slug < b.slug ? -1 : 1;
  });
}

export function neighbors(posts, slug) {
  const index = posts.findIndex((post) => post.slug === slug);
  return {
    newer: index > 0 ? posts[index - 1] : null,
    older: index >= 0 && index < posts.length - 1 ? posts[index + 1] : null,
  };
}

export function cnDate(date) {
  const [year, month, day] = date.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

export function dotDate(date) {
  return date.replace(/-/g, ".");
}

export function rssDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const weekday = WEEKDAYS[utc.getUTCDay()];
  const monthName = MONTHS[month - 1];
  return `${weekday}, ${String(day).padStart(2, "0")} ${monthName} ${year} 00:00:00 +0800`;
}

export function replaceBlock(source, name, inner, inline = false) {
  const start = `<!-- ${name}:start -->`;
  const end = `<!-- ${name}:end -->`;
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end);
  if (startAt < 0 || endAt < 0 || endAt < startAt) {
    throw new Error(`Missing marker ${start}`);
  }
  const body = String(inner).replace(/\s+$/u, "");
  if (inline) return `${source.slice(0, startAt + start.length)}${body}${source.slice(endAt)}`;
  return `${source.slice(0, startAt + start.length)}\n${body}\n${source.slice(endAt)}`;
}

function listDate(date) {
  const [, month, day] = date.split("-").map(Number);
  return `${MONTHS[month - 1]} ${String(day).padStart(2, "0")}`;
}

function longDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]} ${year}`;
}

export function renderIndexList(posts) {
  const groups = new Map();
  for (const post of posts) {
    const year = post.date.slice(0, 4);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(post);
  }
  return [...groups.entries()].map(([year, list]) => {
    const items = list.map((post) => `            <div class="row posts-line">
              <div class="posts-date col-xs-3 col-sm-2">
                <time datetime="${post.date}">${listDate(post.date)}</time>
              </div>
              <div class="posts-title col-xs-9 col-sm-10">
                <div class="row">
                  <div class="col-xs-11 col-sm-10">
                    <a href="/posts/${post.slug}.html">${escapeHtml(post.title)}</a>
                  </div>
                  <div class="col-xs-1 col-sm-2 posts-categories">
                    ${postTags(post).map((tag) => `<div class="posts-category"><strong>${escapeHtml(tag)}</strong></div>`).join("")}
                  </div>
                </div>
              </div>
            </div>`).join("\n");
    return `          <section>
            <h2 class="site-date-catalog">${year}</h2>
${items}
          </section>`;
  }).join("\n");
}

export function renderArchive(posts) {
  return renderIndexList(posts);
}

const FALLBACK_SITE = {
  name: "YCBGJS",
  origin: "https://ycbgjs.github.io",
  github: "https://github.com/YCBGJS",
};

function siteOf(site) {
  return site && site.origin ? site : FALLBACK_SITE;
}

export function renderFeed(posts, site) {
  const origin = siteOf(site).origin;
  return posts.map((post) => `    <item>
      <title>${escapeHtml(post.title)}</title>
      <link>${origin}/posts/${post.slug}.html</link>
      <guid>${origin}/posts/${post.slug}.html</guid>
      <pubDate>${rssDate(post.date)}</pubDate>
      <description>${escapeHtml(post.excerpt)}</description>
    </item>`).join("\n");
}

export function renderPager(newer, older) {
  const links = [];
  if (newer) links.push(`  <li><a href="/posts/${newer.slug}.html">${escapeHtml(newer.title)}</a></li>`);
  if (older) links.push(`  <li><a href="/posts/${older.slug}.html">${escapeHtml(older.title)}</a></li>`);
  if (!links.length) return "";
  return `<div class="related-content">\n<ul>\n${links.join("\n")}\n</ul>\n</div>`;
}

function indent(html) {
  return String(html).split("\n").map((line) => (line ? `        ${line}` : line)).join("\n");
}

export function renderPostPage(post, bodyHtml, newer, older, site) {
  const title = escapeHtml(post.title);
  const excerpt = escapeHtml(post.excerpt);
  const name = escapeHtml(siteOf(site).name);
  const github = escapeHtml(siteOf(site).github);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · ${name}</title>
  <meta name="description" content="${excerpt}">
  <meta name="theme-color" content="#ffffff">
  <meta property="og:title" content="${title}">
  <meta property="og:type" content="article">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="alternate" type="application/rss+xml" title="${name}" href="/feed.xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bree+Serif&family=Bungee+Shade&family=Noto+Serif+SC:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <script>
    (function () {
      var stored = localStorage.getItem("theme");
      var dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      var theme = stored && stored !== "system" ? stored : (dark ? "dark" : "light");
      if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
    })();
  </script>
</head>
<body>
  <a class="skip" href="#article">Skip to content</a>
  <article class="post" id="article">
    <header>
      <div class="header-title"><a href="/">${name}</a></div>
    </header>
    <div class="row end-md header-items">
      <div class="header-item-left">
        <button id="theme-toggle" class="theme-toggle" type="button" onclick="toggleTheme()" aria-label="Toggle color theme">🌙</button>
      </div>
      <div class="header-item"><a href="/about.html">About</a></div>
      <div class="header-item"><a href="${github}" target="_blank" rel="noopener">GitHub</a></div>
    </div>
    <div class="header-line"></div>
    <header class="post-header">
      <h1 class="post-title">${title}</h1>
      <div class="row post-desc">
        <div class="col-xs-6">
          <time class="post-date" datetime="${post.date}">${longDate(post.date)}</time>
        </div>
        <div class="col-xs-6">
          <div class="post-author"><a href="${github}" target="_blank" rel="noopener">@${name}</a></div>
        </div>
      </div>
    </header>
    <div class="post-content markdown-body">
${indent(bodyHtml)}
    </div>
    <div class="post-tag-list">
      ${postTags(post).map((tag) => `<span class="post-tags">${escapeHtml(tag)}</span>`).join("\n      ")}
    </div>
    <!-- pager:start -->
${renderPager(newer, older)}
    <!-- pager:end -->
    <div class="site-footer"></div>
  </article>
  <script src="/js/theme.js"></script>
  <script src="/js/post.js"></script>
</body>
</html>
`;
}

function normalize(draft) {
  const tags = parseTags(draft.tags ?? draft.category);
  const category = tags[0] || "";
  const excerpt = clipExcerpt(draft.excerpt.trim() || excerptFromMarkdown(draft.markdown));
  return {
    slug: draft.slug,
    title: draft.title.trim(),
    date: draft.date,
    category,
    tags,
    chip: chipFor(category),
    excerpt,
  };
}

export function planUpdate(current, draft, site) {
  const error = validateDraft(draft);
  if (error) throw new Error(error);
  const posts = JSON.parse(current.postsJson);
  if (!Array.isArray(posts)) throw new Error("Could not read posts.json");
  if (posts.some((post) => post.slug === draft.slug)) {
    throw new Error("A post with this filename already exists");
  }
  const post = normalize(draft);
  if (!post.excerpt) throw new Error("Add an excerpt, or start the post with a sentence that can stand alone");
  const next = sortPosts([...posts, post]);
  const around = neighbors(next, post.slug);
  const files = {
    [`posts/${post.slug}.html`]: renderPostPage(post, renderMarkdown(draft.markdown), around.newer, around.older, site),
    "posts.json": `${JSON.stringify(next, null, 2)}\n`,
    "index.html": replaceBlock(current.indexHtml, "posts", renderIndexList(next)),
    "archive.html": replaceBlock(current.archiveHtml, "posts", renderIndexList(next)),
    "feed.xml": replaceBlock(current.feedXml, "posts", renderFeed(next, site)),
  };

  for (const neighbor of [around.newer, around.older]) {
    if (!neighbor) continue;
    const html = current.postHtml[neighbor.slug];
    if (!html) throw new Error(`Could not find the neighboring post ${neighbor.slug}`);
    const side = neighbors(next, neighbor.slug);
    files[`posts/${neighbor.slug}.html`] = replaceBlock(html, "pager", renderPager(side.newer, side.older));
  }

  return { files, post };
}

export function planDelete(current, slug, site) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || "")) {
    throw new Error("That post was not found");
  }
  const posts = JSON.parse(current.postsJson);
  if (!Array.isArray(posts)) throw new Error("Could not read posts.json");
  const sorted = sortPosts(posts);
  const post = sorted.find((item) => item.slug === slug);
  if (!post) throw new Error("That post was not found");
  const around = neighbors(sorted, slug);
  const next = sorted.filter((item) => item.slug !== slug);
  const files = {
    "posts.json": `${JSON.stringify(next, null, 2)}\n`,
    "index.html": replaceBlock(current.indexHtml, "posts", renderIndexList(next)),
    "archive.html": replaceBlock(current.archiveHtml, "posts", renderIndexList(next)),
    "feed.xml": replaceBlock(current.feedXml, "posts", renderFeed(next, site)),
  };
  for (const neighbor of [around.newer, around.older]) {
    if (!neighbor) continue;
    const html = current.postHtml[neighbor.slug];
    if (!html) throw new Error(`Could not find the neighboring post ${neighbor.slug}`);
    const side = neighbors(next, neighbor.slug);
    files[`posts/${neighbor.slug}.html`] = replaceBlock(html, "pager", renderPager(side.newer, side.older));
  }
  return { files, deletions: [`posts/${slug}.html`], post };
}
