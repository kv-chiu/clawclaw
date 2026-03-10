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
    buildHeaders: () => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const key = AI_CONFIG.apiKey;
      if (key && key !== "ollama") {
        headers.Authorization = `Bearer ${key}`;
      }
      return headers;
    },
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
      content: `Repository: ${repo}\nDescription: ${description}\n\nREADME:\n${cleanReadme(readme)}`,
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
      content: `Repository: ${repo}\nDescription: ${description}\n\nREADME:\n${cleanReadme(readme)}`,
    },
  ]);

  try {
    const tags = JSON.parse(response.trim()) as string[];
    return tags.filter((t) => (allowedTags as readonly string[]).includes(t));
  } catch {
    return allowedTags.filter((t) => response.includes(t));
  }
}

const FILTER_SYSTEM_PROMPT = `You are evaluating whether GitHub projects qualify as autonomous AI agents in the style of OpenClaw (formerly Clawdbot/Moltbot, created by Peter Steinberger in late 2025).

A project qualifies if it matches ANY of these criteria:
- Autonomous AI agent that can read/write/edit files and execute shell commands
- AI coding assistant (CLI, IDE extension, or messaging bot) that directly modifies code
- AI agent with adapters for messaging platforms (Telegram, Discord, Slack, Feishu, WeChat, etc.) that executes real tasks
- Self-hosted / local-first AI agent with bring-your-own-model support
- AI agent with persistent memory, scheduling, or self-extension capabilities
- AI-powered tool that automates software engineering workflows (PR creation, testing, debugging)

A project does NOT qualify if it is:
- A library/SDK/framework only (no standalone agent functionality)
- A passive chatbot that only generates text without executing actions
- A model training, fine-tuning, or benchmarking tool
- A prompt engineering or prompt management tool
- A wrapper that only forwards API calls without agentic behavior

For each project, respond with its number ONLY if it qualifies. Output a JSON array of qualifying project numbers, e.g. [1, 3, 5]. If none qualify, output [].`;

const FILTER_BATCH_SIZE = 5;

export function cleanReadme(raw: string): string {
  return (
    raw
      // Remove image tags: ![alt](url) and <img .../>
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/<img[^>]*\/?>/gi, "")
      // Remove HTML tags (badges, links, media embeds)
      .replace(/<\/?[^>]+>/g, "")
      // Remove markdown links but keep text: [text](url) → text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Remove bare URLs
      .replace(/https?:\/\/[^\s)>\]]+/g, "")
      // Remove badge-style references: [![...](...)(...)]
      .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "")
      // Collapse multiple blank lines
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 2000)
  );
}

function parseIndices(response: string, maxIndex: number): number[] {
  const trimmed = response.trim();

  // Try direct JSON parse first
  try {
    const parsed = JSON.parse(trimmed) as number[];
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (n) => typeof n === "number" && n >= 1 && n <= maxIndex,
      );
    }
  } catch {
    // Fall through to fuzzy extraction
  }

  // Try to find a JSON array anywhere in the response
  const arrayMatch = trimmed.match(/\[[\d\s,]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]) as number[];
      return parsed.filter(
        (n) => typeof n === "number" && n >= 1 && n <= maxIndex,
      );
    } catch {
      // Fall through
    }
  }

  // Last resort: extract all standalone numbers
  const numbers = trimmed.match(/\b(\d+)\b/g);
  if (numbers) {
    return numbers.map(Number).filter((n) => n >= 1 && n <= maxIndex);
  }

  return [];
}

const BATCH_RETRY = 1;

export async function filterRelevantProjects(
  candidates: Array<{ repo: string; description: string; readme: string }>,
): Promise<string[]> {
  if (candidates.length === 0) return [];

  const approved: string[] = [];

  for (let i = 0; i < candidates.length; i += FILTER_BATCH_SIZE) {
    const batch = candidates.slice(i, i + FILTER_BATCH_SIZE);
    const batchNum = Math.floor(i / FILTER_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(candidates.length / FILTER_BATCH_SIZE);
    console.log(
      `  Batch ${batchNum}/${totalBatches} (${batch.length} projects)...`,
    );

    const list = batch
      .map((c, j) => {
        const readme = cleanReadme(c.readme);
        const readmeSection = readme
          ? `\n   README:\n   ${readme.slice(0, 800)}`
          : "";
        return `${j + 1}. ${c.repo}: ${c.description}${readmeSection}`;
      })
      .join("\n\n");

    let indices: number[] = [];

    for (let attempt = 0; attempt <= BATCH_RETRY; attempt++) {
      try {
        const response = await chatCompletion([
          { role: "system", content: FILTER_SYSTEM_PROMPT },
          { role: "user", content: `Projects to evaluate:\n\n${list}` },
        ]);

        indices = parseIndices(response, batch.length);

        if (indices.length > 0 || response.includes("[]")) {
          break; // Valid result (including explicit empty)
        }

        if (attempt < BATCH_RETRY) {
          console.warn(
            `  ⚠ Unparseable response, retrying batch ${batchNum}...`,
          );
        }
      } catch (err) {
        if (err instanceof AIError) throw err;
        if (attempt < BATCH_RETRY) {
          console.warn(`  ⚠ Batch ${batchNum} error, retrying...`);
        } else {
          console.warn(
            `  ⚠ Failed to parse batch ${batchNum} after retries, skipping.`,
          );
        }
      }
    }

    for (const idx of indices) {
      approved.push(batch[idx - 1].repo);
    }
  }

  return approved;
}
