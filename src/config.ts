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
  // Direct OpenClaw ecosystem
  "openclaw inspired",
  "openclaw alternative",
  "openclaw fork",
  "openclaw compatible",
  "openclaw plugin skill extension",
  "clawdbot moltbot",
  // Known similar projects
  "OpenHands OpenDevin coding agent",
  "Cline AI coding VS Code agent",
  "aider AI pair programming CLI",
  "SWE-agent autonomous coding",
  "OpenInterpreter local code execution",
  // Core characteristics
  "autonomous AI coding agent open source",
  "agentic AI software engineer tool",
  "AI agent file edit shell execute",
  "self-hosted AI agent BYO model",
  // Messaging / social platform adapters
  "AI agent telegram discord bot coding",
  "AI coding assistant messaging platform",
  "openclaw adapter feishu wechat",
];

export function getEnv(key: string, fallback?: string): string {
  const val = process.env[key];
  if (val !== undefined) return val;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
}

export type AIProvider = "openai" | "ollama";

export const AI_CONFIG = {
  get provider(): AIProvider {
    const val = getEnv("AI_PROVIDER", "openai");
    if (val !== "openai" && val !== "ollama") {
      throw new Error(
        `Invalid AI_PROVIDER: ${val}. Must be "openai" or "ollama".`,
      );
    }
    return val;
  },
  get baseUrl() {
    return getEnv(
      "AI_API_BASE",
      this.provider === "ollama" ? "http://localhost:11434" : "",
    );
  },
  get apiKey() {
    return getEnv("AI_API_KEY", this.provider === "ollama" ? "ollama" : "");
  },
  get model() {
    return getEnv("AI_MODEL", this.provider === "ollama" ? "llama3" : "gpt-4o");
  },
  get extraParams(): Record<string, unknown> {
    const raw = process.env.AI_EXTRA_PARAMS;
    if (!raw) return {};
    return JSON.parse(raw);
  },
};

export const GITHUB_TOKEN = () => getEnv("GITHUB_TOKEN", "");

export const DATA_PATH = new URL("../data/projects.json", import.meta.url);
export const QUEUE_PATH = new URL("../data/queue.json", import.meta.url);
export const README_PATH = new URL("../README.md", import.meta.url);

export const MAX_COLLECT_PER_RUN = parseInt(
  getEnv("MAX_COLLECT_PER_RUN", "50"),
  10,
);
