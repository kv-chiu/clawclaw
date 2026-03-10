import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SEARCH_QUERIES, QUEUE_PATH, MAX_COLLECT_PER_RUN } from "./config.js";
import { searchRepositories, getRepoInfo, getRepoReadme } from "./github.js";
import {
  AIError,
  filterRelevantProjects,
  generateHighlights,
  generateTags,
} from "./ai.js";
import { fetchProjectData, loadProjects, saveProjects } from "./update.js";

interface QueueData {
  pending: string[]; // repos approved by AI, waiting to be collected
  updated_at: string;
}

async function loadQueue(): Promise<QueueData> {
  try {
    const raw = await readFile(fileURLToPath(QUEUE_PATH), "utf-8");
    return JSON.parse(raw) as QueueData;
  } catch {
    return { pending: [], updated_at: "" };
  }
}

async function saveQueue(queue: QueueData): Promise<void> {
  queue.updated_at = new Date().toISOString();
  await writeFile(
    fileURLToPath(QUEUE_PATH),
    JSON.stringify(queue, null, 2) + "\n",
  );
}

/**
 * Phase 1: Search + AI filter → save approved repos to queue.
 * Skips if queue already has pending items.
 */
async function refreshQueue(): Promise<QueueData> {
  const queue = await loadQueue();

  // If there are pending items, skip search — process existing queue first
  if (queue.pending.length > 0) {
    console.log(
      `Queue has ${queue.pending.length} pending projects, skipping search.`,
    );
    return queue;
  }

  const data = await loadProjects();
  const existingRepos = new Set(data.projects.map((p) => p.repo));
  const allCandidates = new Map<string, string>();

  for (const query of SEARCH_QUERIES) {
    console.log(`Searching: "${query}"...`);
    try {
      const results = await searchRepositories(query);
      for (const r of results) {
        if (
          !existingRepos.has(r.full_name) &&
          !allCandidates.has(r.full_name)
        ) {
          allCandidates.set(r.full_name, r.description ?? "");
        }
      }
    } catch (err) {
      console.error(`  Search failed for "${query}":`, err);
    }
  }

  console.log(`Found ${allCandidates.size} new candidates.`);

  if (allCandidates.size === 0) return queue;

  // Fetch READMEs
  console.log("Fetching READMEs for candidates...");
  const candidatesWithReadme: Array<{
    repo: string;
    description: string;
    readme: string;
  }> = [];

  for (const [repo, description] of allCandidates) {
    try {
      const readme = await getRepoReadme(repo);
      candidatesWithReadme.push({ repo, description, readme });
    } catch {
      candidatesWithReadme.push({ repo, description, readme: "" });
    }
  }

  // AI filter
  console.log("Filtering with AI...");
  let relevant: string[];
  try {
    relevant = await filterRelevantProjects(candidatesWithReadme);
  } catch (err) {
    if (err instanceof AIError) {
      console.error(
        `  ✗ AI unavailable (${err.status}), skipping discovery. Will retry next run.`,
      );
      return queue;
    }
    throw err;
  }

  console.log(`AI approved ${relevant.length} projects.`);

  // Save to queue
  queue.pending = relevant;
  await saveQueue(queue);

  return queue;
}

/**
 * Phase 2: Process up to MAX_COLLECT_PER_RUN projects from the queue.
 */
async function processQueue(queue: QueueData): Promise<string[]> {
  if (queue.pending.length === 0) {
    console.log("Queue is empty, nothing to process.");
    return [];
  }

  const data = await loadProjects();
  const batch = queue.pending.slice(0, MAX_COLLECT_PER_RUN);
  const remaining = queue.pending.slice(MAX_COLLECT_PER_RUN);

  console.log(
    `Processing ${batch.length} projects (${remaining.length} remaining in queue)...`,
  );

  const added: string[] = [];
  let aiFailed = false;

  for (const repo of batch) {
    if (data.projects.some((p) => p.repo === repo)) {
      console.log(`  Skipping ${repo} (already exists).`);
      // Remove from queue
      queue.pending = queue.pending.filter((r) => r !== repo);
      await saveQueue(queue);
      continue;
    }

    console.log(`Collecting data for ${repo}...`);
    try {
      const stats = await fetchProjectData(repo);

      let highlights = "";
      let tags: string[] = [];

      if (!aiFailed) {
        try {
          const repoInfo = await getRepoInfo(repo);
          const readme = await getRepoReadme(repo);
          [highlights, tags] = await Promise.all([
            generateHighlights(repo, repoInfo.description, readme),
            generateTags(repo, repoInfo.description, readme),
          ]);
        } catch (err) {
          if (err instanceof AIError) {
            aiFailed = true;
            console.warn(
              `  ⚠ AI failed (${err.status}), using repo description as fallback.`,
            );
            const repoInfo = await getRepoInfo(repo);
            highlights = repoInfo.description;
          } else {
            throw err;
          }
        }
      } else {
        const repoInfo = await getRepoInfo(repo);
        highlights = repoInfo.description;
      }

      // Add to projects and save immediately
      data.projects.push({ ...stats, highlights, tags });
      data.projects.sort((a, b) => b.stars - a.stars);
      await saveProjects(data);

      // Remove from queue and save
      queue.pending = queue.pending.filter((r) => r !== repo);
      await saveQueue(queue);

      added.push(repo);
      console.log(`  ✓ ${repo} saved${aiFailed ? " (AI fallback)" : ""}`);
    } catch (err) {
      console.error(`  ✗ Failed to collect ${repo}:`, err);
    }
  }

  console.log(
    `Added ${added.length} projects. Queue: ${queue.pending.length} remaining.`,
  );
  return added;
}

export async function discoverProjects(): Promise<string[]> {
  const queue = await refreshQueue();
  return processQueue(queue);
}
