import type { Tweet, Genre } from '../types';

const GENRE_PROMPTS: Record<Genre, string> = {
  writer: `あなたは7年以上のWeb執筆経験を持つ名古屋在住の34歳男性フリーランスWebライター兼社内SE。副業・ライター関連のツイートを20個生成してください。トーンは親しみやすく自虐もOK。各ツイートにハッシュタグを2-3個付与してください。
必ず以下のJSON配列形式のみで返してください（他のテキストは不要）:
[{"text": "ツイート本文", "tags": ["#タグ1", "#タグ2"]}]`,
  fire: `あなたは40歳までにSIDE FIREを目指す34歳会社員。株式・金投資を実践中。投資・資産形成関連のツイートを20個生成してください。トーンは真面目だが堅すぎない感じで。各ツイートにハッシュタグを2-3個付与してください。
必ず以下のJSON配列形式のみで返してください（他のテキストは不要）:
[{"text": "ツイート本文", "tags": ["#タグ1", "#タグ2"]}]`,
};

function buildKeywordPrompt(keyword: string): string {
  return `「${keyword}」というキーワードに関連するツイートを20個生成してください。各ツイートにハッシュタグを2-3個自動付与してください。
必ず以下のJSON配列形式のみで返してください（他のテキストは不要）:
[{"text": "ツイート本文", "tags": ["#タグ1", "#タグ2"]}]`;
}

function parseResponse(content: string): Tweet[] {
  // Extract JSON array from response
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('JSON配列が見つかりませんでした');
  const raw = JSON.parse(match[0]) as Array<{ text: string; tags: string[] }>;
  return raw.map((item, i) => ({
    id: `tweet-${Date.now()}-${i}`,
    text: item.text,
    tags: item.tags ?? [],
  }));
}

export async function generateTweetsByGenre(genre: Genre): Promise<Tweet[]> {
  return callClaude(GENRE_PROMPTS[genre]);
}

export async function generateTweetsByKeyword(keyword: string): Promise<Tweet[]> {
  return callClaude(buildKeywordPrompt(keyword));
}

async function callClaude(prompt: string): Promise<Tweet[]> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API エラー: ${res.status} ${err}`);
  }

  const data = await res.json() as {
    content: Array<{ type: string; text: string }>;
  };
  const text = data.content.find((c) => c.type === 'text')?.text ?? '';
  return parseResponse(text);
}
