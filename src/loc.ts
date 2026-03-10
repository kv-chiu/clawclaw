import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function countLoc(repo: string): Promise<number> {
  const tempDir = await mkdtemp(join(tmpdir(), "clawclaw-loc-"));

  try {
    // Shallow clone
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

    // Run tokei
    const { stdout } = await execFileAsync("tokei", ["--output", "json"], {
      cwd: tempDir,
      timeout: 60_000,
    });

    const data = JSON.parse(stdout) as Record<
      string,
      { code?: number } | undefined
    >;

    // Sum all language code lines
    let total = 0;
    for (const lang of Object.values(data)) {
      if (lang && typeof lang.code === "number") {
        total += lang.code;
      }
    }

    return total;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
