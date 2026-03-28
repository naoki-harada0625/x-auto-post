import type { Tweet, Genre } from '../types';
import { getGeminiApiKey } from './settings';

const GENRE_PROMPTS: Record<Genre, string> = {
  writer: `あなたは7年以上のWeb執筆経験を持つ34歳の副業Webライター。文字単価0.5円から始めて月40万円まで稼いだ実体験がある。

以下の「型」からランダムに選んで20個のツイートを生成してください。各ツイートは140文字以内。

【使う型】
1. 逆説型：「〇〇だと思ってた。でも実は△△だった。」
2. 数字型：「ライター7年で気づいた3つのこと」
3. 失敗談型：「文字単価0.5円時代にやらかしたこと→」
4. 比較型：「副業ライター1年目と5年目の決定的な違い」
5. 問いかけ型：「副業で月10万稼ぐのに一番大事なことって何？」

【ルール】
- 冒頭1行目で「あるある」か「えっ？」と思わせる
- 抽象的な精神論は禁止（「頑張ろう」「諦めるな」はNG）
- 具体的な数字・金額・期間を必ず1つ入れる
- 最後の1文で余韻を残すか、問いかけで終わる
- ハッシュタグは2個まで（#副業ライター #Webライター から選択）
- 絵文字は冒頭に1つだけ

JSON配列で返してください。形式: [{"text": "ツイート本文", "tags": ["#副業ライター"]}]
JSONのみ返してください。マークダウンのコードブロックも不要です。`,

  fire: `あなたは40歳までにSIDE FIREを目指す34歳の会社員。NTT株を680株保有中。株式・金投資を実践中。

以下の「型」からランダムに選んで20個のツイートを生成してください。各ツイートは140文字以内。

【使う型】
1. 逆説型：「投資で一番大事なのは利回りじゃなかった。」
2. 数字型：「年収400万台からSIDE FIRE目指して2年。資産の変化→」
3. 失敗談型：「NTT株を○○した時の話。あれは痛かった。」
4. 比較型：「貯金だけの人 vs 投資してる人、5年後の差」
5. 問いかけ型：「SIDE FIREに必要な金額、みんなどう計算してる？」

【ルール】
- 冒頭1行目で「あるある」か「えっ？」と思わせる
- 抽象的な精神論は禁止（「頑張ろう」「諦めるな」はNG）
- 具体的な数字・金額・期間を必ず1つ入れる
- 最後の1文で余韻を残すか、問いかけで終わる
- ハッシュタグは2個まで（#SIDEFIRE #投資初心者 から選択）
- 絵文字は冒頭に1つだけ

JSON配列で返してください。形式: [{"text": "ツイート本文", "tags": ["#SIDEFIRE"]}]
JSONのみ返してください。マークダウンのコードブロックも不要です。`,
};

function buildKeywordPrompt(keyword: string): string {
  return `「${keyword}」というキーワードに関連するツイートを20個生成してください。各ツイートにハッシュタグを2-3個自動付与してください。
必ず以下のJSON配列形式のみで返してください（他のテキストは不要）:
[{"text": "ツイート本文", "tags": ["#タグ1", "#タグ2"]}]`;
}

function extractJsonArray(text: string): string {
  // google_search grounding may wrap response in extra text; extract the JSON array
  const match = text.match(/\[[\s\S]*\]/);
  return match ? match[0] : text;
}

function parseResponse(text: string): Tweet[] {
  const raw = JSON.parse(extractJsonArray(text)) as Array<{ text: string; tags: string[] }>;
  return raw.map((item, i) => ({
    id: `tweet-${Date.now()}-${i}`,
    text: item.text,
    tags: item.tags ?? [],
  }));
}

export async function generateTweetsByGenre(genre: Genre): Promise<Tweet[]> {
  return callGeminiWithSearch(GENRE_PROMPTS[genre]);
}

export async function generateTweetsByKeyword(keyword: string): Promise<Tweet[]> {
  return callGemini(buildKeywordPrompt(keyword));
}

function getApiKey(): string {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      'Gemini APIキーが設定されていません。\n右上の⚙️ボタンからAPIキーを設定してください。\n取得先: https://aistudio.google.com/apikey'
    );
  }
  return apiKey;
}

const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

/** Google Search grounding を使ったジャンル生成（responseMimeType は指定不可）*/
async function callGeminiWithSearch(prompt: string): Promise<Tweet[]> {
  const apiKey = getApiKey();

  const res = await fetch(GEMINI_URL(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.9,
      },
    }),
  });

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

/** キーワード生成（JSON mode 使用）*/
async function callGemini(prompt: string): Promise<Tweet[]> {
  const apiKey = getApiKey();

  const res = await fetch(GEMINI_URL(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        responseMimeType: 'application/json',
      },
    }),
  });

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
