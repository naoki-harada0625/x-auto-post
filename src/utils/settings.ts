const STORAGE_KEY = 'x-auto-post-settings';

interface Settings {
  geminiApiKey: string;
  githubToken: string;
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Settings) : { geminiApiKey: '', githubToken: '' };
  } catch {
    return { geminiApiKey: '', githubToken: '' };
  }
}

function save(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getGeminiApiKey(): string {
  return load().geminiApiKey || (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
}

export function getGithubToken(): string {
  return load().githubToken || (import.meta.env.VITE_GITHUB_TOKEN as string) || '';
}

export function saveSettings(settings: Partial<Settings>): void {
  save({ ...load(), ...settings });
}

export function loadSettings(): Settings {
  return {
    geminiApiKey: getGeminiApiKey(),
    githubToken: getGithubToken(),
  };
}
