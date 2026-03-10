import { SEARCH_QUERIES } from "./config.js";
import { searchRepositories, getRepoInfo, getRepoReadme } from "./github.js";
import {
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

  // AI filter
  const candidates = Array.from(allCandidates.entries()).map(
    ([repo, description]) => ({ repo, description }),
  );

  console.log("Filtering with AI...");
  const relevant = await filterRelevantProjects(candidates);
  console.log(`AI approved ${relevant.length} projects.`);

  // Fetch data for new projects
  const newProjects = [];
  for (const repo of relevant) {
    console.log(`Collecting data for ${repo}...`);
    try {
      const stats = await fetchProjectData(repo);
      const repoInfo = await getRepoInfo(repo);
      const readme = await getRepoReadme(repo);
      const [highlights, tags] = await Promise.all([
        generateHighlights(repo, repoInfo.description, readme),
        generateTags(repo, repoInfo.description, readme),
      ]);

      newProjects.push({ ...stats, highlights, tags });
      console.log(`  ✓ ${repo} added`);
    } catch (err) {
      console.error(`  ✗ Failed to collect ${repo}:`, err);
    }
  }

  if (newProjects.length > 0) {
    data.projects.push(...newProjects);
    // Sort by stars descending
    data.projects.sort((a, b) => b.stars - a.stars);
    await saveProjects(data);
    console.log(`Added ${newProjects.length} new projects.`);
  }

  return relevant;
}
