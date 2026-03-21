import type { Tweet, Genre } from '../types';
import { getGeminiApiKey } from './settings';

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

const FIXED_TAGS = ['#Webライター', '#Webライターとつながりたい'];

function mergeTags(aiTags: string[], tweetText: string): string[] {
  const lowerFixed = FIXED_TAGS.map((t) => t.toLowerCase());
  // Remove AI tags that duplicate fixed tags
  const aiOnly = aiTags.filter((t) => !lowerFixed.includes(t.toLowerCase()));

  const fits = (tags: string[]) =>
    (tags.length > 0 ? `${tweetText}\n${tags.join(' ')}` : tweetText).length <= 280;

  // Trim AI tags from the end if over 280, always keep fixed tags
  while (aiOnly.length > 0 && !fits([...aiOnly, ...FIXED_TAGS])) {
    aiOnly.pop();
  }
  return [...aiOnly, ...FIXED_TAGS];
}

function parseResponse(text: string): Tweet[] {
  const raw = JSON.parse(text) as Array<{ text: string; tags: string[] }>;
  return raw.map((item, i) => ({
    id: `tweet-${Date.now()}-${i}`,
    text: item.text,
    tags: mergeTags(item.tags ?? [], item.text),
  }));
}

export async function generateTweetsByGenre(genre: Genre): Promise<Tweet[]> {
  return callGemini(GENRE_PROMPTS[genre]);
}

export async function generateTweetsByKeyword(keyword: string): Promise<Tweet[]> {
  return callGemini(buildKeywordPrompt(keyword));
}

async function callGemini(prompt: string): Promise<Tweet[]> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      'Gemini APIキーが設定されていません。\n右上の⚙️ボタンからAPIキーを設定してください。\n取得先: https://aistudio.google.com/apikey'
    );
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API エラー: ${res.status} ${err}`);
  }

  const data = await res.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  const text = data.candidates[0].content.parts[0].text;
  return parseResponse(text);
}
