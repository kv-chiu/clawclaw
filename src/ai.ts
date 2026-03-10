import { AI_CONFIG, AVAILABLE_TAGS, RESERVED_TAGS } from "./config.js";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatChoice {
  message: { content: string };
}

interface ChatResponse {
  choices: ChatChoice[];
}

async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const body = {
    model: AI_CONFIG.model,
    messages,
    stream: false,
    ...AI_CONFIG.extraParams,
  };

  const res = await fetch(`${AI_CONFIG.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_CONFIG.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI API error: ${res.status} ${text}`);
  }

  const data = (await res.json()) as ChatResponse;
  return data.choices[0].message.content;
}

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
  // Determine which tags are allowed for this repo
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
    // Validate tags
    return tags.filter((t) => (allowedTags as readonly string[]).includes(t));
  } catch {
    // Try to extract from text if JSON parse fails
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
