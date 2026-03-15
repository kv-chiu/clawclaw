import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DATA_PATH, type ProjectsData } from "./config.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export async function renderHtml(): Promise<void> {
  const raw = await readFile(fileURLToPath(DATA_PATH), "utf-8");
  const data = JSON.parse(raw) as ProjectsData;

  const rows = data.projects
    .map(
      (p) => `      <tr>
        <td><a href="https://github.com/${esc(p.repo)}" target="_blank">${esc(p.repo)}</a></td>
        <td>${esc(p.language)}</td>
        <td>${fmt(p.stars)}</td>
        <td>${fmt(p.forks)}</td>
        <td>${fmt(p.issues)}</td>
        <td>${fmt(p.prs)}</td>
        <td>${fmt(p.commits)}</td>
        <td>${fmt(p.loc)}</td>
        <td class="highlights">${esc(p.highlights)}</td>
        <td class="tags">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(" ")}</td>
      </tr>`,
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>clawclaw — Awesome OpenClaw-inspired AI Agents</title>
  <link rel="alternate" type="application/atom+xml" title="clawclaw feed" href="feed.xml">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      color: #c9d1d9;
      background: #0d1117;
      padding: 2rem 1.5rem;
      line-height: 1.5;
    }
    header {
      max-width: 960px;
      margin: 0 auto 2rem;
    }
    header h1 {
      font-size: 2rem;
      color: #f0f6fc;
      margin-bottom: 0.25rem;
    }
    header p {
      color: #8b949e;
      font-size: 1rem;
    }
    header nav {
      margin-top: 0.75rem;
      font-size: 0.875rem;
    }
    header nav a {
      color: #58a6ff;
      text-decoration: none;
      margin-right: 1rem;
    }
    header nav a:hover { text-decoration: underline; }
    .table-wrap {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      min-width: 1100px;
    }
    thead th {
      position: sticky;
      top: 0;
      background: #161b22;
      color: #f0f6fc;
      font-weight: 600;
      text-align: left;
      padding: 0.625rem 0.75rem;
      border-bottom: 2px solid #30363d;
      white-space: nowrap;
    }
    tbody tr { border-bottom: 1px solid #21262d; }
    tbody tr:hover { background: #161b22; }
    td {
      padding: 0.5rem 0.75rem;
      vertical-align: top;
      white-space: nowrap;
    }
    td:first-child a {
      color: #58a6ff;
      text-decoration: none;
      font-weight: 500;
    }
    td:first-child a:hover { text-decoration: underline; }
    td.highlights {
      white-space: normal;
      min-width: 220px;
      max-width: 340px;
    }
    td.tags {
      white-space: normal;
      min-width: 120px;
    }
    .tag {
      display: inline-block;
      background: #1f6feb22;
      color: #58a6ff;
      border: 1px solid #1f6feb44;
      border-radius: 1rem;
      padding: 0.125rem 0.5rem;
      font-size: 0.75rem;
      margin: 0.125rem 0.125rem;
    }
    footer {
      max-width: 960px;
      margin: 2rem auto 0;
      color: #484f58;
      font-size: 0.8rem;
      text-align: center;
    }
    footer a { color: #58a6ff; text-decoration: none; }
  </style>
</head>
<body>
  <header>
    <h1>clawclaw</h1>
    <p>Awesome list of OpenClaw-inspired AI agents. Discovered by agents, for humans.</p>
    <nav>
      <a href="https://github.com/kv-chiu/clawclaw">GitHub</a>
      <a href="feed.xml">Atom Feed</a>
    </nav>
  </header>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Project</th>
          <th>Language</th>
          <th>Stars</th>
          <th>Forks</th>
          <th>Issues</th>
          <th>PRs</th>
          <th>Commits</th>
          <th>LOC</th>
          <th>Highlights</th>
          <th>Tags</th>
        </tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </div>
  <footer>
    <p>Updated ${new Date().toISOString().slice(0, 10)} &middot; <a href="https://github.com/kv-chiu/clawclaw">kv-chiu/clawclaw</a></p>
  </footer>
</body>
</html>
`;

  const outPath = new URL("../index.html", import.meta.url);
  await writeFile(fileURLToPath(outPath), html);
  console.log("index.html rendered.");
}
