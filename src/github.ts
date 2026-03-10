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

interface SearchIssuesResult {
  total_count: number;
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

export async function getOpenIssueCount(repo: string): Promise<number> {
  const data = await githubFetch<SearchIssuesResult>(
    `/search/issues?q=repo:${repo}+type:issue+state:open&per_page=1`,
  );
  return data.total_count;
}

export async function getOpenPRCount(repo: string): Promise<number> {
  const data = await githubFetch<SearchIssuesResult>(
    `/search/issues?q=repo:${repo}+type:pr+state:open&per_page=1`,
  );
  return data.total_count;
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
