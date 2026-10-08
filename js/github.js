import { planDelete, planUpdate, sortPosts, neighbors } from "./blog.js";

let resolved = null;

function explain(status, message) {
  if (status === 401) return "The token is invalid or expired";
  if (status === 403) return "This token cannot write to the repository. Contents needs Read and write";
  if (status === 404) return "The repository or file was not found";
  if (status === 422) return "The repository changed. Try again";
  return message || "The request failed";
}

async function gh(token, method, path, body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    throw new Error(explain(response.status, data && data.message));
  }
  return data;
}

function decodeBase64(content) {
  const binary = atob(content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function repoPath(site, suffix) {
  return `/repos/${site.owner}/${site.repo}${suffix}`;
}

async function resolveSite(token) {
  if (resolved && resolved.token === token) return resolved.site;
  const user = await gh(token, "GET", "/user");
  const login = user && user.login;
  if (!login || !/^[A-Za-z0-9-]+$/.test(login)) {
    throw new Error("Could not read the GitHub account for this token");
  }
  const site = {
    owner: login,
    repo: `${login}.github.io`,
    branch: "main",
    name: login,
    origin: `https://${login}.github.io`,
    github: `https://github.com/${login}`,
  };
  try {
    const repo = await gh(token, "GET", repoPath(site, ""));
    if (repo && repo.default_branch) site.branch = repo.default_branch;
  } catch {
    throw new Error(`Could not open ${site.owner}/${site.repo}. Select that repository when you create the token, and set Contents to Read and write`);
  }
  resolved = { token, site };
  return site;
}

async function getFile(token, site, path) {
  const data = await gh(token, "GET", `${repoPath(site, `/contents/${path}`)}?ref=${site.branch}`);
  if (!data || data.encoding !== "base64" || !data.content) {
    throw new Error(`Could not read ${path}`);
  }
  return decodeBase64(data.content);
}

async function commitChanges(token, site, parentSha, changes, message) {
  const parent = await gh(token, "GET", repoPath(site, `/git/commits/${parentSha}`));
  const tree = [];
  for (const [path, content] of Object.entries(changes.files || {})) {
    const blob = await gh(token, "POST", repoPath(site, "/git/blobs"), {
      content,
      encoding: "utf-8",
    });
    tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
  }
  for (const path of changes.deletions || []) {
    tree.push({ path, mode: "100644", type: "blob", sha: null });
  }
  const nextTree = await gh(token, "POST", repoPath(site, "/git/trees"), {
    base_tree: parent.tree.sha,
    tree,
  });
  const commit = await gh(token, "POST", repoPath(site, "/git/commits"), {
    message,
    tree: nextTree.sha,
    parents: [parentSha],
  });
  await gh(token, "PATCH", repoPath(site, `/git/refs/heads/${site.branch}`), { sha: commit.sha });
  return commit.sha;
}

export async function publishPost(token, draft, onStatus) {
  if (!token) throw new Error("Add a GitHub token first");
  onStatus("Reading the repository…");
  const site = await resolveSite(token);
  const ref = await gh(token, "GET", repoPath(site, `/git/ref/heads/${site.branch}`));
  const postsJson = await getFile(token, site, "posts.json");
  const indexHtml = await getFile(token, site, "index.html");
  const archiveHtml = await getFile(token, site, "archive.html");
  const feedXml = await getFile(token, site, "feed.xml");
  const posts = JSON.parse(postsJson);
  const next = sortPosts([...posts, { slug: draft.slug, date: draft.date, title: "", category: "", chip: "", excerpt: "" }]);
  const around = neighbors(next, draft.slug);
  const postHtml = {};
  for (const neighbor of [around.newer, around.older]) {
    if (!neighbor || !neighbor.slug || neighbor.slug === draft.slug) continue;
    postHtml[neighbor.slug] = await getFile(token, site, `posts/${neighbor.slug}.html`);
  }
  const planned = planUpdate({ postsJson, indexHtml, archiveHtml, feedXml, postHtml }, draft, site);
  onStatus("Publishing…");
  await commitChanges(token, site, ref.object.sha, { files: planned.files }, `Publish: ${planned.post.title}`);
  return { post: planned.post, site };
}

export async function listPosts(token) {
  const postsJson = token
    ? await getFile(token, await resolveSite(token), "posts.json")
    : await readPublicPosts();
  const posts = JSON.parse(postsJson);
  if (!Array.isArray(posts)) throw new Error("Could not read posts.json");
  return sortPosts(posts);
}

async function readPublicPosts() {
  const response = await fetch("/posts.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not read posts.json");
  return response.text();
}

export async function deletePost(token, slug, onStatus) {
  if (!token) throw new Error("Add a GitHub token first");
  onStatus("Reading the repository…");
  const site = await resolveSite(token);
  const ref = await gh(token, "GET", repoPath(site, `/git/ref/heads/${site.branch}`));
  const postsJson = await getFile(token, site, "posts.json");
  const posts = JSON.parse(postsJson);
  if (!Array.isArray(posts)) throw new Error("Could not read posts.json");
  const sorted = sortPosts(posts);
  if (!sorted.some((post) => post.slug === slug)) throw new Error("That post was not found");
  const around = neighbors(sorted, slug);
  const indexHtml = await getFile(token, site, "index.html");
  const archiveHtml = await getFile(token, site, "archive.html");
  const feedXml = await getFile(token, site, "feed.xml");
  const postHtml = {};
  for (const neighbor of [around.newer, around.older]) {
    if (!neighbor) continue;
    postHtml[neighbor.slug] = await getFile(token, site, `posts/${neighbor.slug}.html`);
  }
  const planned = planDelete({ postsJson, indexHtml, archiveHtml, feedXml, postHtml }, slug, site);
  onStatus("Deleting…");
  await commitChanges(token, site, ref.object.sha, planned, `Delete: ${planned.post.title}`);
  return planned.post;
}
