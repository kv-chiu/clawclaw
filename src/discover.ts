import { SEARCH_QUERIES } from "./config.js";
import { searchRepositories, getRepoInfo, getRepoReadme } from "./github.js";
import {
  AIError,
  filterRelevantProjects,
  generateHighlights,
  generateTags,
} from "./ai.js";
import { fetchProjectData, loadProjects, saveProjects } from "./update.js";

export async function discoverProjects(): Promise<string[]> {
  const data = await loadProjects();
  const existingRepos = new Set(data.projects.map((p) => p.repo));
  const allCandidates = new Map<string, string>();

  // Search with each query
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

  if (allCandidates.size === 0) return [];

  // Fetch READMEs for all candidates
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

  // AI filter in batches — abort discovery if AI is unavailable
  console.log("Filtering with AI...");
  let relevant: string[];
  try {
    relevant = await filterRelevantProjects(candidatesWithReadme);
  } catch (err) {
    if (err instanceof AIError) {
      console.error(
        `  ✗ AI unavailable (${err.status}), skipping discovery. Will retry next run.`,
      );
      return [];
    }
    throw err;
  }
  console.log(`AI approved ${relevant.length} projects.`);

  // Fetch data for new projects — skip AI content on failure, save partial
  const newProjects = [];
  let aiFailed = false;

  for (const repo of relevant) {
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
              `  ⚠ AI failed (${err.status}), using repo description as fallback for remaining projects.`,
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

      newProjects.push({ ...stats, highlights, tags });
      console.log(`  ✓ ${repo} added${aiFailed ? " (AI fallback)" : ""}`);
    } catch (err) {
      console.error(`  ✗ Failed to collect ${repo}:`, err);
    }
  }

  if (newProjects.length > 0) {
    data.projects.push(...newProjects);
    data.projects.sort((a, b) => b.stars - a.stars);
    await saveProjects(data);
    console.log(`Added ${newProjects.length} new projects.`);
  }

  return relevant;
}
