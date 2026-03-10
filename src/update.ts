import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DATA_PATH, type Project, type ProjectsData } from "./config.js";
import {
  getRepoInfo,
  getOpenIssueCount,
  getOpenPRCount,
  getCommitCount,
  getRepoReadme,
} from "./github.js";
import { countLoc } from "./loc.js";
import { generateHighlights, generateTags } from "./ai.js";

function loadProjects(): Promise<ProjectsData> {
  return readFile(fileURLToPath(DATA_PATH), "utf-8").then(
    (text) => JSON.parse(text) as ProjectsData,
  );
}

function saveProjects(data: ProjectsData): Promise<void> {
  return writeFile(
    fileURLToPath(DATA_PATH),
    JSON.stringify(data, null, 2) + "\n",
  );
}

async function fetchProjectData(
  repo: string,
): Promise<Omit<Project, "tags" | "highlights">> {
  const [repoInfo, issues, prs, commits, loc] = await Promise.all([
    getRepoInfo(repo),
    getOpenIssueCount(repo),
    getOpenPRCount(repo),
    getCommitCount(repo),
    countLoc(repo),
  ]);

  return {
    repo,
    language: repoInfo.language,
    stars: repoInfo.stars,
    forks: repoInfo.forks,
    issues,
    prs,
    commits,
    loc,
    updated_at: new Date().toISOString(),
  };
}

async function fetchAIContent(
  repo: string,
  description: string,
): Promise<{ highlights: string; tags: string[] }> {
  const readme = await getRepoReadme(repo);
  const [highlights, tags] = await Promise.all([
    generateHighlights(repo, description, readme),
    generateTags(repo, description, readme),
  ]);
  return { highlights, tags };
}

export async function updateAllProjects(): Promise<void> {
  const data = await loadProjects();

  for (const project of data.projects) {
    console.log(`Updating ${project.repo}...`);

    try {
      const stats = await fetchProjectData(project.repo);
      // Only update numeric fields, preserve AI-generated highlights and tags
      project.language = stats.language;
      project.stars = stats.stars;
      project.forks = stats.forks;
      project.issues = stats.issues;
      project.prs = stats.prs;
      project.commits = stats.commits;
      project.loc = stats.loc;
      project.updated_at = stats.updated_at;
      console.log(`  ✓ ${project.repo} updated`);
    } catch (err) {
      console.error(`  ✗ Failed to update ${project.repo}:`, err);
    }
  }

  await saveProjects(data);
  console.log("projects.json saved.");
}

export { loadProjects, saveProjects, fetchProjectData, fetchAIContent };
