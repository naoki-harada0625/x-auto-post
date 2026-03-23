// ============================================================
// X 自動投稿 - Google Apps Script
// ============================================================
// scheduled-tweets.json と auto-schedule.json を GitHub から
// 読み込み、15分おきに X (Twitter) へ投稿します。
//
// セットアップ:
//   1. スクリプトプロパティに各種 API キーを設定
//   2. setupTrigger() を1度だけ手動実行
// ============================================================

var GITHUB_OWNER = 'naoki-harada0625';
var GITHUB_REPO  = 'x-auto-post';
var TZ           = 'Asia/Tokyo';
var FIXED_TAGS   = '#Webライター #Webライターとつながりたい';

var SLOT_HOURS = {
  '06:00': 6,
  '12:00': 12,
  '18:00': 18,
  '24:00': 0
};

var TIME_THEMES = {
  '06:00': '朝（6時台）のツイート。おはようメッセージ、今日の目標、朝から副業ライターとして動くモチベーション系。朝起きて副業の準備をしている会社員に刺さる内容。',
  '12:00': '昼（12時台）のツイート。ノウハウ・Tips系、ライターあるある。ランチ中にスマホを見ている駆け出しライターや会社員が「保存したい」と思う実用的な情報。',
  '18:00': '夕方（18時台）のツイート。今日の振り返り、副業の成果報告、共感系。仕事を終えて帰宅中の会社員副業ライターが「わかる〜」となる内容。',
  '24:00': '深夜（0時台）のツイート。本音トーク、夜更かしライターあるある。深夜に原稿を書いている副業ライターの共感を呼ぶリアルな内容。自虐OK。'
};

// ============================================================
// メイン関数（GASトリガーから15分おきに呼び出される）
// ============================================================

function postScheduledTweets() {
  var props        = PropertiesService.getScriptProperties();
  var githubToken  = props.getProperty('GITHUB_TOKEN');

  if (!githubToken) {
    Logger.log('ERROR: GITHUB_TOKEN がスクリプトプロパティに設定されていません。');
    return;
  }

  var now = new Date();
  Logger.log('Current JST: ' + Utilities.formatDate(now, TZ, 'yyyy-MM-dd HH:mm'));

  try {
    processScheduledTweets_(now, githubToken, props);
  } catch (e) {
    Logger.log('Part 1 エラー: ' + e.message);
  }

  try {
    processAutoSchedule_(now, githubToken, props);
  } catch (e) {
    Logger.log('Part 2 エラー: ' + e.message);
  }

  Logger.log('All done.');
}

// ============================================================
// トリガーのセットアップ（初回に1度だけ手動実行）
// ============================================================

function setupTrigger() {
  // 既存の重複トリガーをすべて削除
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'postScheduledTweets') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // 15分おきのトリガーを作成
  ScriptApp.newTrigger('postScheduledTweets')
    .timeBased()
    .everyMinutes(15)
    .create();

  Logger.log('トリガー作成完了: postScheduledTweets を15分おきに実行します。');
}

// ============================================================
// Part 1: scheduled-tweets.json の処理
// ============================================================

function processScheduledTweets_(now, githubToken, props) {
  Logger.log('\n=== Part 1: scheduled-tweets.json ===');

  var result = fetchGithubJson_('scheduled-tweets.json', githubToken);
  if (!result) {
    Logger.log('scheduled-tweets.json が見つからないか空です。');
    return;
  }

  var tweets = result.content;
  var sha    = result.sha;
  Logger.log('件数: ' + tweets.length);

  var postedIds = [];

  for (var i = 0; i < tweets.length; i++) {
    var entry = tweets[i];
    Logger.log(
      '  id=' + entry.id +
      ' scheduledAt=' + (entry.scheduledAt || 'none') +
      ' immediate=' + entry.immediate +
      ' posted=' + entry.posted
    );

    if (!shouldPostScheduled_(entry, now)) {
      Logger.log('  -> スキップ');
      continue;
    }

    var tweetText = buildTweetText_(entry.text || '', entry.tags || []);
    try {
      var tweetId = postToX_(tweetText, props);
      Logger.log('  -> 投稿完了: id=' + tweetId + ' | ' + tweetText.substring(0, 60));
      postedIds.push(entry.id);
    } catch (e) {
      Logger.log('  -> 投稿失敗: ' + e.message);
    }
  }

  if (postedIds.length > 0) {
    var remaining = tweets.filter(function(t) {
      return postedIds.indexOf(t.id) === -1;
    });
    putGithubJson_(
      'scheduled-tweets.json',
      remaining,
      sha,
      githubToken,
      'chore: remove posted tweets from scheduled-tweets.json [skip ci]'
    );
    Logger.log('完了: ' + postedIds.length + '件投稿, 残り' + remaining.length + '件');
  } else {
    Logger.log('投稿対象なし。');
  }
}

function shouldPostScheduled_(entry, now) {
  if (entry.posted)    return false;
  if (entry.immediate) return true;

  if (entry.scheduledAt) {
    var scheduledMs = new Date(entry.scheduledAt).getTime();
    var diffMs      = now.getTime() - scheduledMs;
    Logger.log(
      '    scheduledAt=' + entry.scheduledAt +
      ' now(JST)=' + Utilities.formatDate(now, TZ, 'yyyy-MM-dd HH:mm:ss') +
      ' diff=' + Math.round(diffMs / 1000) + 's'
    );
    return diffMs >= 0;
  }
  return false;
}

// ============================================================
// Part 2: auto-schedule.json の処理（Gemini でツイート生成）
// ============================================================

function processAutoSchedule_(now, githubToken, props) {
  Logger.log('\n=== Part 2: auto-schedule.json ===');

  var geminiKey = props.getProperty('GEMINI_API_KEY');
  if (!geminiKey) {
    Logger.log('GEMINI_API_KEY 未設定: auto-schedule をスキップします。');
    return;
  }

  var result = fetchGithubJson_('auto-schedule.json', githubToken);
  if (!result) {
    Logger.log('auto-schedule.json が見つかりません。');
    return;
  }

  var schedule = result.content;
  var sha      = result.sha;
  var slots    = schedule.slots || [];

  var toPost = slots.filter(function(s) { return shouldPostSlot_(s, now); });
  if (toPost.length === 0) {
    Logger.log('投稿対象スロットなし。');
    return;
  }

  var anyPosted = false;

  for (var i = 0; i < toPost.length; i++) {
    var slot   = toPost[i];
    var slotId = slot.date + ' ' + slot.time;

    try {
      Logger.log('ツイート生成中: ' + slotId);
      var generated = generateTweet_(slot.time, geminiKey);
      var tweetText = buildTweetText_(generated.text, generated.tags);
      var tweetId   = postToX_(tweetText, props);
      Logger.log('投稿完了: id=' + tweetId + ' | ' + tweetText.substring(0, 60));

      for (var j = 0; j < slots.length; j++) {
        if (slots[j].date === slot.date && slots[j].time === slot.time) {
          slots[j].posted = true;
          anyPosted = true;
          break;
        }
      }
    } catch (e) {
      Logger.log('スロット ' + slotId + ' 失敗: ' + e.message);
    }
  }

  if (anyPosted) {
    schedule.slots = slots;
    putGithubJson_(
      'auto-schedule.json',
      schedule,
      sha,
      githubToken,
      'chore: update posted status in JSON files [skip ci]'
    );
    Logger.log('auto-schedule.json 更新完了。');
  }
}

function shouldPostSlot_(slot, now) {
  if (!slot.enabled || slot.posted) return false;

  var slotHour = SLOT_HOURS[slot.time];
  if (slotHour === undefined) return false;

  var nowDateStr = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
  var nowHour    = parseInt(Utilities.formatDate(now, TZ, 'HH'), 10);
  var nowMinute  = parseInt(Utilities.formatDate(now, TZ, 'mm'), 10);

  var checkDateStr = slot.date;
  if (slot.time === '24:00') {
    // 24:00 は翌日 0:00 として扱う
    var d = new Date(slot.date + 'T00:00:00+09:00');
    d.setDate(d.getDate() + 1);
    checkDateStr = Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  }

  return (
    checkDateStr === nowDateStr &&
    nowHour      === slotHour   &&
    nowMinute    <  15
  );
}

// ============================================================
// X (Twitter) API v2 投稿（OAuth 1.0a 署名をGASで生成）
// ============================================================

function postToX_(text, props) {
  var consumerKey    = props.getProperty('X_CONSUMER_KEY');
  var consumerSecret = props.getProperty('X_CONSUMER_SECRET');
  var accessToken    = props.getProperty('X_ACCESS_TOKEN');
  var tokenSecret    = props.getProperty('X_ACCESS_TOKEN_SECRET');

  if (!consumerKey || !consumerSecret || !accessToken || !tokenSecret) {
    throw new Error('X API キーがスクリプトプロパティに設定されていません。');
  }

  var url       = 'https://api.twitter.com/2/tweets';
  var method    = 'POST';
  var timestamp = Math.floor(Date.now() / 1000).toString();
  var nonce     = generateNonce_();

  // OAuth パラメータ（JSON ボディは署名に含めない: RFC 5849 §3.4.1）
  var oauthParams = {
    oauth_consumer_key:     consumerKey,
    oauth_nonce:            nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        timestamp,
    oauth_token:            accessToken,
    oauth_version:          '1.0'
  };

  var signature = computeOAuthSignature_(method, url, oauthParams, consumerSecret, tokenSecret);
  oauthParams['oauth_signature'] = signature;

  // Authorization ヘッダーを構築
  var authParts = Object.keys(oauthParams).sort().map(function(k) {
    return percentEncode_(k) + '="' + percentEncode_(oauthParams[k]) + '"';
  });
  var authHeader = 'OAuth ' + authParts.join(', ');

  var response = UrlFetchApp.fetch(url, {
    method:             'post',
    headers: {
      'Authorization': authHeader,
      'Content-Type':  'application/json'
    },
    payload:            JSON.stringify({ text: text }),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code !== 201) {
    throw new Error('X API ' + code + ': ' + body);
  }

  return JSON.parse(body).data.id;
}

// ============================================================
// OAuth 1.0a ユーティリティ
// ============================================================

function computeOAuthSignature_(method, url, oauthParams, consumerSecret, tokenSecret) {
  // パラメータをソートしてパーセントエンコード
  var sortedParams = Object.keys(oauthParams).sort().map(function(k) {
    return percentEncode_(k) + '=' + percentEncode_(oauthParams[k]);
  }).join('&');

  // シグネチャベース文字列
  var baseString = [
    method.toUpperCase(),
    percentEncode_(url),
    percentEncode_(sortedParams)
  ].join('&');

  // 署名キー
  var signingKey = percentEncode_(consumerSecret) + '&' + percentEncode_(tokenSecret);

  // HMAC-SHA1 → Base64
  var rawSig = Utilities.computeHmacSha1Signature(baseString, signingKey);
  return Utilities.base64Encode(rawSig);
}

// RFC 3986 準拠のパーセントエンコード
function percentEncode_(str) {
  return encodeURIComponent(String(str))
    .replace(/!/g,  '%21')
    .replace(/'/g,  '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

function generateNonce_() {
  var chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var result = '';
  for (var i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============================================================
// Gemini API（ツイート自動生成）
// ============================================================

function generateTweet_(slotTime, geminiKey) {
  var theme = TIME_THEMES[slotTime] || TIME_THEMES['12:00'];

  var prompt =
    'まず、Webライター・副業ライター・フリーランスライターに関する最新のトレンドや話題をWeb検索で確認してください。\n' +
    'その情報を踏まえて、以下の条件でX（Twitter）に今すぐ投稿する**1件**のツイートを生成してください。\n\n' +
    'ペルソナ: 名古屋在住34歳男性、本業は社内SE、副業でWebライター7年目。\n' +
    'テーマ: ' + theme + '\n' +
    '条件:\n' +
    '- 140文字以内（ハッシュタグ含む）\n' +
    '- 固定ハッシュタグ: ' + FIXED_TAGS + '\n' +
    '- 追加ハッシュタグ: 0〜1個（固定タグと重複しないもの）\n' +
    '- 親しみやすく自虐もOK。上から目線にならない。同じ目線で語る。\n' +
    '- トレンドを反映したタイムリーな内容を可能な限り含める\n\n' +
    'JSONのみ返してください（マークダウン不要）。形式:\n' +
    '{"text": "ツイート本文", "tags": ["#Webライター", "#Webライターとつながりたい"]}';

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + geminiKey;

  var response = UrlFetchApp.fetch(url, {
    method:             'post',
    headers:            { 'Content-Type': 'application/json' },
    payload:            JSON.stringify({
      contents:         [{ parts: [{ text: prompt }] }],
      tools:            [{ google_search: {} }],
      generationConfig: { temperature: 0.9 }
    }),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('Gemini API ' + response.getResponseCode() + ': ' + response.getContentText());
  }

  var data    = JSON.parse(response.getContentText());
  var rawText = data.candidates[0].content.parts[0].text;

  var match = rawText.match(/\{[^{}]*"text"\s*:[^{}]*\}/);
  if (match) {
    try {
      var tweetData = JSON.parse(match[0]);
      return {
        text: tweetData.text || rawText.substring(0, 140),
        tags: tweetData.tags || ['#Webライター', '#Webライターとつながりたい']
      };
    } catch (_) { /* fall through */ }
  }

  return {
    text: rawText.substring(0, 140),
    tags: ['#Webライター', '#Webライターとつながりたい']
  };
}

// ============================================================
// GitHub Contents API
// ============================================================

function fetchGithubJson_(filename, token) {
  var url = 'https://api.github.com/repos/' +
            GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + filename;

  var response = UrlFetchApp.fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept':        'application/vnd.github+json'
    },
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  if (code === 404) return null;
  if (code !== 200) {
    throw new Error('GitHub API ' + code + ': ' + response.getContentText());
  }

  var data    = JSON.parse(response.getContentText());
  var decoded = Utilities.newBlob(
    Utilities.base64Decode(data.content.replace(/\n/g, ''))
  ).getDataAsString();

  return { content: JSON.parse(decoded), sha: data.sha };
}

function putGithubJson_(filename, content, sha, token, message) {
  var url = 'https://api.github.com/repos/' +
            GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + filename;

  var jsonStr = JSON.stringify(content, null, 2);
  var encoded = Utilities.base64Encode(Utilities.newBlob(jsonStr).getBytes());

  var response = UrlFetchApp.fetch(url, {
    method:             'put',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept':        'application/vnd.github+json',
      'Content-Type':  'application/json'
    },
    payload:            JSON.stringify({ message: message, content: encoded, sha: sha }),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('GitHub Contents API ' + code + ': ' + response.getContentText());
  }
}

// ============================================================
// ヘルパー
// ============================================================

function buildTweetText_(text, tags) {
  var full = (tags && tags.length > 0) ? (text + '\n' + tags.join(' ')) : text;
  return full.substring(0, 280);
}
