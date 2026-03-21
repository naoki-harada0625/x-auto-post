import type { AutoSchedule, ScheduleSlot, TimeSlot } from '../types';
import { getGithubToken } from './settings';

const GITHUB_OWNER = 'naoki-harada0625';
const GITHUB_REPO = 'x-auto-post';
const GITHUB_FILE = 'auto-schedule.json';
const STORAGE_KEY = 'x-auto-post-auto-schedule';

const DEFAULT_SCHEDULE: AutoSchedule = {
  slots: [],
  defaultTimes: ['06:00', '12:00', '18:00', '24:00'],
};

function b64Encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return btoa(String.fromCharCode(...bytes));
}

function b64Decode(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function loadScheduleLocal(): AutoSchedule {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AutoSchedule) : { ...DEFAULT_SCHEDULE, slots: [] };
  } catch {
    return { ...DEFAULT_SCHEDULE, slots: [] };
  }
}

export function saveScheduleLocal(schedule: AutoSchedule): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
}

interface GHContents {
  schedule: AutoSchedule;
  sha: string;
}

async function fetchFromGitHub(token: string): Promise<GHContents> {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    }
  );
  if (res.status === 404) {
    return { schedule: { ...DEFAULT_SCHEDULE, slots: [] }, sha: '' };
  }
  if (!res.ok) throw new Error(`GitHub API エラー: ${res.status}`);
  const data = await res.json() as { content: string; sha: string };
  return {
    schedule: JSON.parse(b64Decode(data.content)) as AutoSchedule,
    sha: data.sha,
  };
}

async function putToGitHub(schedule: AutoSchedule, sha: string, token: string): Promise<void> {
  const content = b64Encode(JSON.stringify(schedule, null, 2));
  const body: Record<string, unknown> = {
    message: 'chore: update auto-schedule [skip ci]',
    content,
  };
  if (sha) body.sha = sha;
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API エラー: ${res.status} ${err}`);
  }
}

export async function syncScheduleFromGitHub(): Promise<AutoSchedule | null> {
  const token = getGithubToken();
  if (!token) return null;
  try {
    const { schedule } = await fetchFromGitHub(token);
    saveScheduleLocal(schedule);
    return schedule;
  } catch {
    return null;
  }
}

export async function updateScheduleOnGitHub(schedule: AutoSchedule): Promise<void> {
  const token = getGithubToken();
  if (!token) {
    throw new Error('GitHub Token が設定されていません。\n右上の⚙️ボタンから設定してください。');
  }
  const { sha } = await fetchFromGitHub(token);
  await putToGitHub(schedule, sha, token);
  saveScheduleLocal(schedule);
}

/** スロットのON/OFFを切り替えた新しいスロット配列を返す（ローカルのみ） */
export function toggleSlot(
  schedule: AutoSchedule,
  date: string,
  time: TimeSlot
): AutoSchedule {
  const existing = schedule.slots.find((s) => s.date === date && s.time === time);
  if (existing?.posted) return schedule; // 投稿済みは変更不可

  let newSlots: ScheduleSlot[];
  if (existing?.enabled) {
    // ON → OFF: 配列から削除（posted:trueなら残す）
    newSlots = schedule.slots.filter((s) => !(s.date === date && s.time === time));
  } else if (existing) {
    // posted:false, enabled:false → ON
    newSlots = schedule.slots.map((s) =>
      s.date === date && s.time === time ? { ...s, enabled: true } : s
    );
  } else {
    // 存在しない → ON で追加
    newSlots = [...schedule.slots, { date, time, enabled: true }];
  }
  return { ...schedule, slots: newSlots };
}
