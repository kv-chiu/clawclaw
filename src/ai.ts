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

// --- Core chat completion ---

async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const adapter = getAdapter();

  const res = await fetch(adapter.buildUrl(), {
    method: "POST",
    headers: adapter.buildHeaders(),
    body: JSON.stringify(adapter.buildBody(messages)),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `AI API error (${AI_CONFIG.provider}): ${res.status} ${text}`,
    );
  }

  const data = await res.json();
  return adapter.extractContent(data);
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
        "You summarize open-source projects in one concise sentence (under 100 chars). Include the project's emoji if it has one. Output ONLY the summary, nothing else.",
    },
    {
      role: "user",
      content: `Repository: ${repo}\nDescription: ${description}\n\nREADME (truncated):\n${readme}`,
    },
  ]);

  return response.trim();
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
