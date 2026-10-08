import { planUpdate, sortPosts, neighbors } from "./blog.js";

const OWNER = "YCBGJS";
const REPO = "YCBGJS.github.io";
const BRANCH = "main";

function explain(status, message) {
  if (status === 401) return "The token is invalid or expired";
  if (status === 403) return "This token cannot write to the repository. Contents needs Read and write";
  if (status === 404) return "The repository or file was not found";
  if (status === 422) return "The repository changed. Publish again";
  return message || "Publish failed";
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

async function getFile(token, path) {
  const data = await gh(token, "GET", `/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`);
  if (!data || data.encoding !== "base64" || !data.content) {
    throw new Error(`Could not read ${path}`);
  }
  return decodeBase64(data.content);
}

async function commitFiles(token, parentSha, files, message) {
  const parent = await gh(token, "GET", `/repos/${OWNER}/${REPO}/git/commits/${parentSha}`);
  const tree = [];
  for (const [path, content] of Object.entries(files)) {
    const blob = await gh(token, "POST", `/repos/${OWNER}/${REPO}/git/blobs`, {
      content,
      encoding: "utf-8",
    });
    tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const nextTree = await gh(token, "POST", `/repos/${OWNER}/${REPO}/git/trees`, {
    base_tree: parent.tree.sha,
    tree,
  });
  const commit = await gh(token, "POST", `/repos/${OWNER}/${REPO}/git/commits`, {
    message,
    tree: nextTree.sha,
    parents: [parentSha],
  });
  await gh(token, "PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha });
  return commit.sha;
}

export async function publishPost(token, draft, onStatus) {
  if (!token) throw new Error("Add a GitHub token first");
  onStatus("Reading the repository…");
  const ref = await gh(token, "GET", `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const postsJson = await getFile(token, "posts.json");
  const indexHtml = await getFile(token, "index.html");
  const archiveHtml = await getFile(token, "archive.html");
  const feedXml = await getFile(token, "feed.xml");
  const posts = JSON.parse(postsJson);
  const next = sortPosts([...posts, { slug: draft.slug, date: draft.date, title: "", category: "", chip: "", excerpt: "" }]);
  const around = neighbors(next, draft.slug);
  const postHtml = {};
  for (const neighbor of [around.newer, around.older]) {
    if (!neighbor || !neighbor.slug || neighbor.slug === draft.slug) continue;
    postHtml[neighbor.slug] = await getFile(token, `posts/${neighbor.slug}.html`);
  }
  const planned = planUpdate({ postsJson, indexHtml, archiveHtml, feedXml, postHtml }, draft);
  onStatus("Publishing…");
  await commitFiles(token, ref.object.sha, planned.files, `Publish: ${planned.post.title}`);
  return planned.post;
}
