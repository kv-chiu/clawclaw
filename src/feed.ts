import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DATA_PATH, type ProjectsData } from "./config.js";

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

export async function generateFeed(): Promise<void> {
  const raw = await readFile(fileURLToPath(DATA_PATH), "utf-8");
  const data = JSON.parse(raw) as ProjectsData;

  const sorted = [...data.projects].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  const updated = sorted[0]?.updated_at ?? new Date().toISOString();

  const entries = sorted
    .map((p) => {
      const repoUrl = `https://github.com/${p.repo}`;
      return `  <entry>
    <title>${escapeXml(p.repo)}</title>
    <link href="${escapeXml(repoUrl)}" />
    <id>${escapeXml(repoUrl)}</id>
    <updated>${p.updated_at}</updated>
    <summary>${escapeXml(p.highlights)}</summary>
    <content type="html">${escapeXml(
      `Language: ${p.language} | Stars: ${p.stars} | Forks: ${p.forks} | Tags: ${p.tags.join(", ")}`,
    )}</content>
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
  <updated>${updated}</updated>
${entries}
</feed>
`;

  const outPath = new URL("../feed.xml", import.meta.url);
  await writeFile(fileURLToPath(outPath), feed);
  console.log("feed.xml generated.");
}
