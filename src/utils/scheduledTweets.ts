import type { ScheduledTweet } from '../types';

const STORAGE_KEY = 'x-auto-post-scheduled';

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

/**
 * GitHub Actions の workflow_dispatch をトリガーする。
 * VITE_GITHUB_TOKEN が設定されている場合のみ動作。
 */
export async function triggerGitHubActions(): Promise<void> {
  const token = import.meta.env.VITE_GITHUB_TOKEN as string | undefined;
  const owner = 'naoki-harada0625';
  const repo = 'x-auto-post';
  const workflow = 'post-tweets.yml';

  if (!token) {
    throw new Error(
      'VITE_GITHUB_TOKEN が設定されていません。\nGitHub > Settings > Developer settings > Personal access tokens でトークンを発行し、.env ファイルに設定してください。'
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
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
