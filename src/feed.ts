import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DATA_PATH, type Project, type ProjectsData } from "./config.js";

const SITE_URL = "https://kv-chiu.github.io/clawclaw";
const REPO_URL = "https://github.com/kv-chiu/clawclaw";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function buildProjectRow(p: Project): string {
  return `&lt;li&gt;&lt;a href="https://github.com/${escapeXml(p.repo)}"&gt;${escapeXml(p.repo)}&lt;/a&gt; — ${escapeXml(p.highlights)} (⭐ ${p.stars}, ${escapeXml(p.language)})&lt;/li&gt;`;
}

export async function generateFeed(): Promise<void> {
  const raw = await readFile(fileURLToPath(DATA_PATH), "utf-8");
  const data = JSON.parse(raw) as ProjectsData;

  // Group projects by update date
  const byDate = new Map<string, Project[]>();
  for (const p of data.projects) {
    const key = toDateKey(p.updated_at);
    const list = byDate.get(key) ?? [];
    list.push(p);
    byDate.set(key, list);
  }

  // Sort dates descending
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

  const latestDate = dates[0] ?? new Date().toISOString().slice(0, 10);

  const entries = dates
    .map((date) => {
      const projects = byDate.get(date)!;
      const projectList = projects.map(buildProjectRow).join("\n");
      const summary = `${projects.length} project(s) updated`;

      return `  <entry>
    <title>clawclaw report ${date} — ${projects.length} project(s)</title>
    <link href="${SITE_URL}" />
    <id>${REPO_URL}/report/${date}</id>
    <updated>${date}T00:00:00Z</updated>
    <summary>${escapeXml(summary)}</summary>
    <content type="html">&lt;ul&gt;\n${projectList}\n&lt;/ul&gt;</content>
  </entry>`;
    })
    .join("\n");

  const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>clawclaw</title>
  <subtitle>Awesome list of OpenClaw-inspired AI agents</subtitle>
  <link href="${SITE_URL}/feed.xml" rel="self" />
  <link href="${REPO_URL}" />
  <id>${REPO_URL}</id>
  <updated>${latestDate}T00:00:00Z</updated>
${entries}
</feed>
`;

  const outPath = new URL("../feed.xml", import.meta.url);
  await writeFile(fileURLToPath(outPath), feed);
  console.log("feed.xml generated.");
}
