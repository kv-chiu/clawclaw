export interface Project {
  repo: string;
  language: string;
  stars: number;
  forks: number;
  issues: number;
  prs: number;
  commits: number;
  loc: number;
  highlights: string;
  tags: string[];
  updated_at: string;
}

export interface ProjectsData {
  projects: Project[];
}

export const AVAILABLE_TAGS = [
  "Lightweight",
  "Fast",
  "Secure",
  "Auditable",
  "Isolated",
  "Office Assistant",
  "Original Claw",
] as const;

export const RESERVED_TAGS: Record<string, string[]> = {
  "Original Claw": ["openclaw/openclaw"],
};

export const SEARCH_QUERIES = [
  "openclaw inspired",
  "openclaw alternative",
  "openclaw fork",
  "openclaw compatible",
  "AI coding agent CLI",
  "openclaw like terminal assistant",
];

export function getEnv(key: string, fallback?: string): string {
  const val = process.env[key];
  if (val !== undefined) return val;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
}

export const AI_CONFIG = {
  get baseUrl() {
    return getEnv("AI_API_BASE");
  },
  get apiKey() {
    return getEnv("AI_API_KEY");
  },
  get model() {
    return getEnv("AI_MODEL", "gpt-4o");
  },
  get extraParams(): Record<string, unknown> {
    const raw = process.env.AI_EXTRA_PARAMS;
    if (!raw) return {};
    return JSON.parse(raw);
  },
};

export const GITHUB_TOKEN = () => getEnv("GITHUB_TOKEN", "");

export const DATA_PATH = new URL("../data/projects.json", import.meta.url);
export const README_PATH = new URL("../README.md", import.meta.url);
