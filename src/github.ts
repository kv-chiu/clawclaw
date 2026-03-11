import { GITHUB_TOKEN } from "./config.js";

interface GitHubRepo {
  full_name: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  description: string | null;
}

interface SearchResult {
  total_count: number;
  items: GitHubRepo[];
}

interface GraphQLIssuesAndPRsResult {
  data: {
    repository?: {
      issues: { totalCount: number };
      pullRequests: { totalCount: number };
    };
  };
  errors?: Array<{ message: string }>;
}

async function githubFetch<T>(path: string): Promise<T> {
  const token = GITHUB_TOKEN();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    throw new Error(
      `GitHub API error: ${res.status} ${res.statusText} for ${path}`,
    );
  }
  return res.json() as Promise<T>;
}

export interface RepoInfo {
  language: string;
  stars: number;
  forks: number;
  description: string;
}

export async function getRepoInfo(repo: string): Promise<RepoInfo> {
  const data = await githubFetch<GitHubRepo>(`/repos/${repo}`);
  return {
    language: data.language ?? "Unknown",
    stars: data.stargazers_count,
    forks: data.forks_count,
    description: data.description ?? "",
  };
}

export async function getOpenIssueAndPRCount(
  repoFullName: string,
): Promise<{ issues: number; prs: number }> {
  const [owner, name] = repoFullName.split("/");
  const query = `
    query {
      repository(owner: "${owner}", name: "${name}") {
        issues(states: [OPEN]) {
          totalCount
        }
        pullRequests(states: [OPEN]) {
          totalCount
        }
      }
    }
  `;

  const token = GITHUB_TOKEN();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(
      `GitHub GraphQL error: ${res.status} ${res.statusText} for ${repoFullName}`,
    );
  }

  const json = (await res.json()) as GraphQLIssuesAndPRsResult;

  if (json.errors && json.errors.length > 0) {
    throw new Error(
      `GitHub GraphQL API error: ${json.errors[0]?.message} for ${repoFullName}`,
    );
  }

  if (!json.data.repository) {
    throw new Error(
      `GitHub GraphQL API error: Repository not found for ${repoFullName}`,
    );
  }

  return {
    issues: json.data.repository.issues.totalCount,
    prs: json.data.repository.pullRequests.totalCount,
  };
}

export async function getCommitCount(repo: string): Promise<number> {
  const token = GITHUB_TOKEN();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Use per_page=1 and parse the Link header for last page number
  const res = await fetch(
    `https://api.github.com/repos/${repo}/commits?per_page=1`,
    { headers },
  );
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} for commits of ${repo}`);
  }

  const link = res.headers.get("link");
  if (!link) {
    // Only one page, count the items
    const items = (await res.json()) as unknown[];
    return items.length;
  }

  const match = link.match(/page=(\d+)>;\s*rel="last"/);
  if (match) {
    return parseInt(match[1], 10);
  }

  return 0;
}

export async function getRepoReadme(repo: string): Promise<string> {
  const token = GITHUB_TOKEN();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.raw+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/readme`, {
    headers,
  });
  if (!res.ok) return "";
  const text = await res.text();
  // Truncate to ~4000 chars to stay within AI context limits
  return text.slice(0, 4000);
}

export async function searchRepositories(query: string): Promise<GitHubRepo[]> {
  const data = await githubFetch<SearchResult>(
    `/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=30`,
  );
  return data.items;
}
