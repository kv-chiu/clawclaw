import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DATA_PATH, README_PATH, type ProjectsData } from "./config.js";

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export async function renderReadme(): Promise<void> {
  const raw = await readFile(fileURLToPath(DATA_PATH), "utf-8");
  const data = JSON.parse(raw) as ProjectsData;

  const header = `# clawclaw

Awesome list of OpenClaw-inspired AI agents. Discovered by agents, for humans.

`;

  const tableHeader = `| Project Name | Language | Stars | Forks | Issues | PRs | Commits | LOC | Highlights | Tags |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;

  const rows = data.projects
    .map((p) => {
      const name = `[${p.repo}](https://github.com/${p.repo})`;
      return `| ${name} | ${p.language} | ${formatNumber(p.stars)} | ${formatNumber(p.forks)} | ${formatNumber(p.issues)} | ${formatNumber(p.prs)} | ${formatNumber(p.commits)} | ${formatNumber(p.loc)} | ${p.highlights} | ${p.tags.join(", ")} |`;
    })
    .join("\n");

  const content = header + tableHeader + rows + "\n";

  await writeFile(fileURLToPath(README_PATH), content);
  console.log("README.md rendered.");
}
