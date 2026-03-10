import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_REPO_SIZE_MB = 500;

export async function checkRepoSize(repo: string): Promise<number> {
  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) return 0;
  const data = (await res.json()) as { size: number };
  return data.size / 1024;
}

export async function countLoc(repo: string): Promise<number> {
  const sizeMb = await checkRepoSize(repo);
  if (sizeMb > MAX_REPO_SIZE_MB) {
    console.warn(
      `  ⚠ Repo ${repo} is ${Math.round(sizeMb)}MB, skipping LOC count`,
    );
    return 0;
  }

  const tempDir = await mkdtemp(join(tmpdir(), "clawclaw-loc-"));

  try {
    await execFileAsync(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--single-branch",
        `https://github.com/${repo}.git`,
        tempDir,
      ],
      { timeout: 120_000 },
    );

    // Use --compact for minimal output, parse Total line
    const { stdout } = await execFileAsync("tokei", ["--compact"], {
      cwd: tempDir,
      timeout: 60_000,
    });

    // Output format:
    //  Language  Files  Lines  Code  Comments  Blanks
    //  Total       42   5876  4213       892     771
    const match = stdout.match(/Total\s+\d+\s+\d+\s+(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
