import {
  fetchProjectData,
  loadProjects,
  saveProjects,
  fetchAIContent,
} from "./update.js";
import { getRepoInfo } from "./github.js";
import { saveDailyReport } from "./report.js";

export async function researchRepos(repos: string[]): Promise<void> {
  if (repos.length === 0) {
    console.log("Usage: pnpm start research <owner/repo> [owner/repo ...]");
    process.exit(1);
  }

  const data = await loadProjects();
  const snapshot = data.projects.map((p) => ({ ...p }));
  const added: string[] = [];

  for (const repo of repos) {
    console.log(`Researching ${repo}...`);

    const exists = data.projects.find((p) => p.repo === repo);

    try {
      const stats = await fetchProjectData(repo);

      if (exists) {
        // Update existing project
        Object.assign(exists, stats);
        console.log(`  ✓ ${repo} updated`);
      } else {
        // New project: fetch AI content
        let highlights = "";
        let tags: string[] = [];
        try {
          const repoInfo = await getRepoInfo(repo);
          const ai = await fetchAIContent(repo, repoInfo.description);
          highlights = ai.highlights;
          tags = ai.tags;
        } catch {
          console.warn(`  ⚠ AI failed, using repo description as fallback.`);
          const repoInfo = await getRepoInfo(repo);
          highlights = repoInfo.description;
        }

        data.projects.push({ ...stats, highlights, tags });
        data.projects.sort((a, b) => b.stars - a.stars);
        added.push(repo);
        console.log(`  ✓ ${repo} added`);
      }
    } catch (err) {
      console.error(`  ✗ Failed to research ${repo}:`, err);
    }
  }

  await saveProjects(data);
  console.log("projects.json saved.");

  const today = new Date().toISOString().slice(0, 10);
  await saveDailyReport(today, "discover", snapshot, data.projects, added);

  console.log(
    `Done. ${added.length} new, ${repos.length - added.length} updated.`,
  );
}
