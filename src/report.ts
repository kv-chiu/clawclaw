import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  REPORTS_DIR,
  type Project,
  type DailyReport,
  type StatsChange,
} from "./config.js";

const STATS_FIELDS = [
  "stars",
  "forks",
  "issues",
  "prs",
  "commits",
  "loc",
] as const;

export function computeStatsChanges(
  before: Project[],
  after: Project[],
): StatsChange[] {
  const beforeMap = new Map(before.map((p) => [p.repo, p]));
  const changes: StatsChange[] = [];

  for (const curr of after) {
    const prev = beforeMap.get(curr.repo);
    if (!prev) continue;

    const fieldChanges: StatsChange["changes"] = [];
    for (const field of STATS_FIELDS) {
      if (prev[field] !== curr[field]) {
        fieldChanges.push({
          field,
          old: prev[field] as number,
          new: curr[field] as number,
        });
      }
    }
    if (fieldChanges.length > 0) {
      changes.push({ repo: curr.repo, changes: fieldChanges });
    }
  }

  return changes;
}

function reportPath(date: string): string {
  return fileURLToPath(new URL(`${date}.json`, REPORTS_DIR));
}

async function ensureReportsDir(): Promise<void> {
  await mkdir(fileURLToPath(REPORTS_DIR), { recursive: true });
}

async function loadExistingReport(date: string): Promise<DailyReport | null> {
  try {
    const raw = await readFile(reportPath(date), "utf-8");
    return JSON.parse(raw) as DailyReport;
  } catch {
    return null;
  }
}

export async function saveDailyReport(
  date: string,
  type: "update" | "discover",
  before: Project[],
  after: Project[],
  newRepos: string[],
): Promise<void> {
  await ensureReportsDir();

  const statsChanges = computeStatsChanges(before, after);
  const existing = await loadExistingReport(date);

  let report: DailyReport;
  if (existing) {
    // Merge with existing report for the same day
    const mergedNewProjects = [
      ...new Set([...existing.summary.new_projects, ...newRepos]),
    ];
    const mergedChanges = mergeStatsChanges(
      existing.summary.stats_changes,
      statsChanges,
    );
    report = {
      date,
      type,
      summary: {
        total_projects: after.length,
        new_projects: mergedNewProjects,
        stats_changes: mergedChanges,
      },
      projects: after,
    };
  } else {
    report = {
      date,
      type,
      summary: {
        total_projects: after.length,
        new_projects: newRepos,
        stats_changes: statsChanges,
      },
      projects: after,
    };
  }

  await writeFile(reportPath(date), JSON.stringify(report, null, 2) + "\n");
  console.log(`Report saved: data/reports/${date}.json`);
}

function mergeStatsChanges(
  existing: StatsChange[],
  incoming: StatsChange[],
): StatsChange[] {
  const map = new Map(existing.map((s) => [s.repo, s]));
  for (const s of incoming) {
    const prev = map.get(s.repo);
    if (prev) {
      // Use the oldest "old" value and newest "new" value
      const fieldMap = new Map(prev.changes.map((c) => [c.field, c]));
      for (const c of s.changes) {
        const existing = fieldMap.get(c.field);
        if (existing) {
          existing.new = c.new;
        } else {
          prev.changes.push(c);
        }
      }
    } else {
      map.set(s.repo, s);
    }
  }
  return [...map.values()];
}

export async function loadReports(limit = 30): Promise<DailyReport[]> {
  await ensureReportsDir();

  let files: string[];
  try {
    files = await readdir(fileURLToPath(REPORTS_DIR));
  } catch {
    return [];
  }

  const jsonFiles = files
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit);

  const reports: DailyReport[] = [];
  for (const file of jsonFiles) {
    const raw = await readFile(
      fileURLToPath(new URL(file, REPORTS_DIR)),
      "utf-8",
    );
    reports.push(JSON.parse(raw) as DailyReport);
  }

  return reports;
}
