import type { ScheduledTweet } from '../types';
import { getGithubToken } from './settings';

const STORAGE_KEY = 'x-auto-post-scheduled';
const GITHUB_OWNER = 'naoki-harada0625';
const GITHUB_REPO = 'x-auto-post';
const GITHUB_FILE = 'scheduled-tweets.json';

export function loadScheduled(): ScheduledTweet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScheduledTweet[]) : [];
  } catch {
    return [];
  }
}

export function saveScheduled(tweets: ScheduledTweet[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tweets));
}

export function addScheduledTweet(tweet: ScheduledTweet): ScheduledTweet[] {
  const current = loadScheduled();
  const updated = [...current, tweet];
  saveScheduled(updated);
  return updated;
}

export function removeScheduledTweet(id: string): ScheduledTweet[] {
  const current = loadScheduled();
  const updated = current.filter((t) => t.id !== id);
  saveScheduled(updated);
  return updated;
}

export function exportToJson(tweets: ScheduledTweet[]): string {
  return JSON.stringify(tweets, null, 2);
}

// --- GitHub Contents API ---

function b64Encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return btoa(String.fromCharCode(...bytes));
}

function b64Decode(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

interface GitHubContents {
  tweets: ScheduledTweet[];
  sha: string;
}

async function fetchFromGitHub(token: string): Promise<GitHubContents> {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    }
  );
  if (!res.ok) throw new Error(`GitHub API エラー: ${res.status}`);
  const data = await res.json() as { content: string; sha: string };
  return { tweets: JSON.parse(b64Decode(data.content)) as ScheduledTweet[], sha: data.sha };
}

async function putToGitHub(
  tweets: ScheduledTweet[],
  sha: string,
  token: string,
  message: string
): Promise<void> {
  const content = b64Encode(JSON.stringify(tweets, null, 2));
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, content, sha }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub Contents API エラー: ${res.status} ${err}`);
  }
}

/**
 * scheduled-tweets.json を GitHub から取得し localStorage と同期する。
 * トークン未設定時は null を返す（エラーにしない）。
 */
export async function syncFromGitHub(): Promise<ScheduledTweet[] | null> {
  const token = getGithubToken();
  if (!token) return null;
  try {
    const { tweets } = await fetchFromGitHub(token);
    saveScheduled(tweets);
    return tweets;
  } catch {
    return null;
  }
}

/**
 * scheduled-tweets.json にツイートを追記してコミットする。
 */
export async function pushTweetToGitHub(tweet: ScheduledTweet): Promise<void> {
  const token = getGithubToken();
  if (!token) {
    throw new Error('GitHub Token が設定されていません。\n右上の⚙️ボタンから設定してください。');
  }
  const { tweets, sha } = await fetchFromGitHub(token);
  await putToGitHub([...tweets, tweet], sha, token, 'Add scheduled tweet');
}

/**
 * scheduled-tweets.json から指定IDのツイートを削除してコミットする。
 */
export async function removeTweetFromGitHub(id: string): Promise<void> {
  const token = getGithubToken();
  if (!token) return;
  const { tweets, sha } = await fetchFromGitHub(token);
  const updated = tweets.filter((t) => t.id !== id);
  if (updated.length === tweets.length) return; // not found, skip
  await putToGitHub(updated, sha, token, 'Remove scheduled tweet');
}

/**
 * GitHub Actions の workflow_dispatch をトリガーする。
 */
export async function triggerGitHubActions(): Promise<void> {
  const token = getGithubToken();
  if (!token) {
    throw new Error(
      'GitHub Token が設定されていません。\n右上の⚙️ボタンから設定してください。'
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/post-tweets.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub Actions トリガー失敗: ${res.status} ${err}`);
  }
}
