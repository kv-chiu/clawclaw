import { AI_CONFIG, AVAILABLE_TAGS, RESERVED_TAGS } from "./config.js";
import type { AIProvider } from "./config.js";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// --- Provider abstraction ---

interface ProviderAdapter {
  buildUrl(): string;
  buildHeaders(): Record<string, string>;
  buildBody(messages: ChatMessage[]): Record<string, unknown>;
  extractContent(data: unknown): string;
}

function openaiAdapter(): ProviderAdapter {
  return {
    buildUrl: () => `${AI_CONFIG.baseUrl}/chat/completions`,
    buildHeaders: () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_CONFIG.apiKey}`,
    }),
    buildBody: (messages) => ({
      model: AI_CONFIG.model,
      messages,
      stream: false,
      ...AI_CONFIG.extraParams,
    }),
    extractContent: (data) => {
      const res = data as { choices: [{ message: { content: string } }] };
      return res.choices[0].message.content;
    },
  };
}

function ollamaAdapter(): ProviderAdapter {
  return {
    buildUrl: () => `${AI_CONFIG.baseUrl}/api/chat`,
    buildHeaders: () => ({
      "Content-Type": "application/json",
    }),
    buildBody: (messages) => ({
      model: AI_CONFIG.model,
      messages,
      stream: false,
      ...AI_CONFIG.extraParams,
    }),
    extractContent: (data) => {
      const res = data as { message: { content: string } };
      return res.message.content;
    },
  };
}

const adapters: Record<AIProvider, () => ProviderAdapter> = {
  openai: openaiAdapter,
  ollama: ollamaAdapter,
};

function getAdapter(): ProviderAdapter {
  return adapters[AI_CONFIG.provider]();
}

// --- Core chat completion with retry ---

const MAX_RETRIES = 3;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const adapter = getAdapter();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(adapter.buildUrl(), {
      method: "POST",
      headers: adapter.buildHeaders(),
      body: JSON.stringify(adapter.buildBody(messages)),
    });

    if (res.ok) {
      const data = await res.json();
      return adapter.extractContent(data);
    }

    const text = await res.text();

    // Rate limit: retry with exponential backoff
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = res.headers.get("retry-after");
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : 2 ** attempt * 5000;
      console.warn(
        `  ⏳ Rate limited, retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})...`,
      );
      await sleep(waitMs);
      continue;
    }

    // Retryable server errors
    if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
      const waitMs = 2 ** attempt * 3000;
      console.warn(
        `  ⏳ Server error ${res.status}, retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})...`,
      );
      await sleep(waitMs);
      continue;
    }

    // Non-retryable (401, 402, 403, etc.)
    throw new AIError(res.status, text);
  }

  throw new AIError(429, "Max retries exceeded");
}

export class AIError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`AI API error (${AI_CONFIG.provider}): ${status} ${body}`);
    this.name = "AIError";
  }
}

// --- Public API ---

export async function generateHighlights(
  repo: string,
  description: string,
  readme: string,
): Promise<string> {
  const response = await chatCompletion([
    {
      role: "system",
      content:
        "Summarize this project in ONE short sentence (max 80 characters). If the project has a signature emoji, start with it. Output ONLY the sentence. No explanation, no markdown, no quotes.",
    },
    {
      role: "user",
      content: `Repository: ${repo}\nDescription: ${description}\n\nREADME (first 2000 chars):\n${readme.slice(0, 2000)}`,
    },
  ]);

  // Hard truncate: take first line only, cap at 100 chars
  const firstLine = response.trim().split("\n")[0];
  return firstLine.length > 100 ? firstLine.slice(0, 97) + "..." : firstLine;
}

export async function generateTags(
  repo: string,
  description: string,
  readme: string,
): Promise<string[]> {
  const allowedTags = AVAILABLE_TAGS.filter((tag) => {
    const reserved = RESERVED_TAGS[tag];
    if (!reserved) return true;
    return reserved.includes(repo);
  });

  const response = await chatCompletion([
    {
      role: "system",
      content: `You are a project classifier. Given a project's info, select 1-3 most relevant tags from this list ONLY: ${allowedTags.join(", ")}. Output ONLY the selected tags as a JSON array of strings, e.g. ["Fast", "Lightweight"]. Do not invent new tags.`,
    },
    {
      role: "user",
      content: `Repository: ${repo}\nDescription: ${description}\n\nREADME (truncated):\n${readme}`,
    },
  ]);

  try {
    const tags = JSON.parse(response.trim()) as string[];
    return tags.filter((t) => (allowedTags as readonly string[]).includes(t));
  } catch {
    return allowedTags.filter((t) => response.includes(t));
  }
}

export async function filterRelevantProjects(
  candidates: Array<{ repo: string; description: string }>,
): Promise<string[]> {
  if (candidates.length === 0) return [];

  const list = candidates
    .map((c, i) => `${i + 1}. ${c.repo}: ${c.description}`)
    .join("\n");

  const response = await chatCompletion([
    {
      role: "system",
      content: `You are evaluating whether GitHub projects are "OpenClaw-inspired AI agents" — tools that function as AI-powered coding assistants, terminal-based AI agents, or CLI tools similar to OpenClaw.

For each project, respond with its number ONLY if it qualifies. Output a JSON array of qualifying project numbers, e.g. [1, 3, 5]. If none qualify, output [].`,
    },
    {
      role: "user",
      content: `Projects to evaluate:\n${list}`,
    },
  ]);

  try {
    const indices = JSON.parse(response.trim()) as number[];
    return indices
      .filter((i) => i >= 1 && i <= candidates.length)
      .map((i) => candidates[i - 1].repo);
  } catch {
    return [];
  }
}
