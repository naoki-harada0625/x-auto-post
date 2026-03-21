import type { Tweet, Genre } from '../types';
import { getGeminiApiKey } from './settings';

const TREND_PREFIX = `まず、Webライター・副業ライター・フリーランスライターに関する最新のトレンドや話題をWeb検索で確認してください。
その情報を踏まえて、タイムリーで一般ユーザーにもリーチできるツイートを含めてください。
例: AI時代のライター生存戦略、最新のSEO動向、Googleアルゴリズム変更の影響、クラウドソーシングの最新事情など。
20個中5個程度はトレンド・最新情報に基づくツイートにしてください。

`;

const TREND_PREFIX_FIRE = `まず、FIRE・SIDE FIRE・投資・資産形成に関する最新のトレンドや話題をWeb検索で確認してください。
その情報を踏まえて、タイムリーで一般ユーザーにもリーチできるツイートを含めてください。
例: 最新の株式市場動向、新NISA活用事例、インフレ対策、注目の投資商品など。
20個中5個程度はトレンド・最新情報に基づくツイートにしてください。

`;

const GENRE_PROMPTS: Record<Genre, string> = {
  writer: `${TREND_PREFIX}あなたは名古屋在住の34歳男性、本業は会社員SE（社内SE）で、副業でWebライターを7年やっている。
以下のターゲット層に刺さるツイートを20個生成してください。

ターゲット:
- 副業を始めたい・始めたばかりの会社員
- 駆け出しWebライター
- SE・エンジニアで副業に興味がある人
- Webライターとして伸び悩んでいる人

ツイートの方向性:
1. 実体験ベースのリアルな話（文字単価の推移、クライアントとのやり取り、本業との両立の苦労）
2. SE×ライターの掛け合わせの強み（技術記事が書ける、ロジカルに構成できる等）
3. 副業ライターの現実と希望（最初は月1万だったけど今は〇〇万等）
4. 共感を呼ぶあるある（納期前の深夜作業、修正地獄、低単価案件の罠）
5. 具体的なノウハウ（ポートフォリオの作り方、単価交渉のコツ、案件の探し方）

トーン: 親しみやすく自虐もOK。上から目線にならない。同じ目線で語る。
各ツイートは140文字以内。
JSONのみ返してください。マークダウンのコードブロックも不要です。
形式: [{"text": "ツイート本文", "tags": ["#タグ1", "#タグ2"]}]`,

  fire: `${TREND_PREFIX_FIRE}あなたは40歳までにSIDE FIREを目指す34歳のSE会社員。株式・金投資を実践中。

ターゲット:
- FIRE・SIDE FIREを目指す20-30代会社員
- 投資初心者〜中級者
- 節約・資産形成に興味がある人

ツイートの方向性:
1. 具体的な数字を使ったリアルな資産報告（今月の積立額、資産推移）
2. SIDE FIREまでの道のりと現実（目標3000万、現在〇〇万）
3. 投資のメンタル管理（暴落時の心理、含み損との付き合い方）
4. SE・会社員ならではの投資戦略
5. 最新の投資トレンドに基づく情報

トーン: 真面目だが堅すぎない。同じ目線で語る。
各ツイートは140文字以内。
JSONのみ返してください。マークダウンのコードブロックも不要です。
形式: [{"text": "ツイート本文", "tags": ["#タグ1", "#タグ2"]}]`,
};

function buildKeywordPrompt(keyword: string): string {
  return `「${keyword}」というキーワードに関連するツイートを20個生成してください。各ツイートにハッシュタグを2-3個自動付与してください。
必ず以下のJSON配列形式のみで返してください（他のテキストは不要）:
[{"text": "ツイート本文", "tags": ["#タグ1", "#タグ2"]}]`;
}

const FIXED_TAGS = ['#Webライター', '#Webライターとつながりたい'];

function mergeTags(aiTags: string[], tweetText: string): string[] {
  const lowerFixed = FIXED_TAGS.map((t) => t.toLowerCase());
  const aiOnly = aiTags.filter((t) => !lowerFixed.includes(t.toLowerCase()));

  const fits = (tags: string[]) =>
    (tags.length > 0 ? `${tweetText}\n${tags.join(' ')}` : tweetText).length <= 280;

  while (aiOnly.length > 0 && !fits([...aiOnly, ...FIXED_TAGS])) {
    aiOnly.pop();
  }
  return [...aiOnly, ...FIXED_TAGS];
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
    tags: mergeTags(item.tags ?? [], item.text),
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
