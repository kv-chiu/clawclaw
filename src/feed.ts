import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DailyReport, StatsChange } from "./config.js";
import { loadReports } from "./report.js";

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

function buildNewProjectsSection(repos: string[]): string {
  if (repos.length === 0) return "";
  const items = repos
    .map(
      (r) =>
        `&lt;li&gt;&lt;a href="https://github.com/${escapeXml(r)}"&gt;${escapeXml(r)}&lt;/a&gt;&lt;/li&gt;`,
    )
    .join("\n");
  return `&lt;h3&gt;New Projects (${repos.length})&lt;/h3&gt;\n&lt;ul&gt;\n${items}\n&lt;/ul&gt;`;
}

function buildStatsSection(changes: StatsChange[]): string {
  if (changes.length === 0) return "";
  const items = changes
    .map((s) => {
      const details = s.changes
        .map((c) => `${c.field}: ${c.old} → ${c.new}`)
        .join(", ");
      return `&lt;li&gt;${escapeXml(s.repo)}: ${escapeXml(details)}&lt;/li&gt;`;
    })
    .join("\n");
  return `&lt;h3&gt;Stats Changes&lt;/h3&gt;\n&lt;ul&gt;\n${items}\n&lt;/ul&gt;`;
}

function buildEntryContent(report: DailyReport): string {
  const parts: string[] = [];
  parts.push(
    `&lt;p&gt;Total projects: ${report.summary.total_projects}&lt;/p&gt;`,
  );

  const newSection = buildNewProjectsSection(report.summary.new_projects);
  if (newSection) parts.push(newSection);

  const statsSection = buildStatsSection(report.summary.stats_changes);
  if (statsSection) parts.push(statsSection);

  return parts.join("\n");
}

function buildEntrySummary(report: DailyReport): string {
  const parts: string[] = [];
  if (report.summary.new_projects.length > 0) {
    parts.push(`${report.summary.new_projects.length} new project(s)`);
  }
  if (report.summary.stats_changes.length > 0) {
    parts.push(
      `${report.summary.stats_changes.length} project(s) with stats changes`,
    );
  }
  if (parts.length === 0) parts.push("No changes");
  return parts.join(", ");
}

export async function generateFeed(): Promise<void> {
  const reports = await loadReports(30);

  const latestDate = reports[0]?.date ?? new Date().toISOString().slice(0, 10);

  const entries = reports
    .map((report) => {
      const summary = buildEntrySummary(report);
      const content = buildEntryContent(report);

      return `  <entry>
    <title>clawclaw ${report.type} report ${report.date} — ${escapeXml(summary)}</title>
    <link href="${SITE_URL}" />
    <id>${REPO_URL}/report/${report.date}</id>
    <updated>${report.date}T00:00:00Z</updated>
    <summary>${escapeXml(summary)}</summary>
    <content type="html">${content}</content>
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
