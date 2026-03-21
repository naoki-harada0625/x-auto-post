#!/usr/bin/env python3
"""
Unified auto-post script.

Runs every 15 minutes via cron (auto-post.yml).

Part 1 – scheduled-tweets.json (予約投稿):
  - immediate: true のエントリは即時投稿
  - scheduledAt が現在JST時刻以降かつ15分以内のエントリを投稿
  - 投稿済みエントリはリストから削除

Part 2 – auto-schedule.json (カレンダー自動投稿):
  - 現在JST時刻が 06:00/12:00/18:00/24:00 の最初の15分以内のスロットを投稿
  - Gemini API + Google Search grounding でツイートを生成
  - 投稿済みスロットに posted: true をマーク
"""

import json
import os
import re
import sys
import urllib.request
from datetime import datetime, date as date_type, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import tweepy

ROOT = Path(__file__).parent.parent
SCHEDULED_JSON_PATH = ROOT / "scheduled-tweets.json"
AUTO_SCHEDULE_JSON_PATH = ROOT / "auto-schedule.json"

JST = ZoneInfo("Asia/Tokyo")

# カレンダースロット時刻 → JST hour（24:00 は翌日 0 時）
SLOT_HOURS: dict[str, int] = {
    "06:00": 6,
    "12:00": 12,
    "18:00": 18,
    "24:00": 0,
}

FIXED_TAGS = "#Webライター #Webライターとつながりたい"

TIME_THEMES: dict[str, str] = {
    "06:00": (
        "朝（6時台）のツイート。おはようメッセージ、今日の目標、朝から副業ライターとして動くモチベーション系。"
        "朝起きて副業の準備をしている会社員に刺さる内容。"
    ),
    "12:00": (
        "昼（12時台）のツイート。ノウハウ・Tips系、ライターあるある。"
        "ランチ中にスマホを見ている駆け出しライターや会社員が「保存したい」と思う実用的な情報。"
    ),
    "18:00": (
        "夕方（18時台）のツイート。今日の振り返り、副業の成果報告、共感系。"
        "仕事を終えて帰宅中の会社員副業ライターが「わかる〜」となる内容。"
    ),
    "24:00": (
        "深夜（0時台）のツイート。本音トーク、夜更かしライターあるある。"
        "深夜に原稿を書いている副業ライターの共感を呼ぶリアルな内容。自虐OK。"
    ),
}


# ─── helpers ───────────────────────────────────────────────────────────────

def build_tweet_text(text: str, tags: list[str]) -> str:
    full = f"{text}\n{' '.join(tags)}" if tags else text
    return full[:280]


def get_twitter_client() -> tweepy.Client:
    return tweepy.Client(
        consumer_key=os.environ["X_CONSUMER_KEY"],
        consumer_secret=os.environ["X_CONSUMER_SECRET"],
        access_token=os.environ["X_ACCESS_TOKEN"],
        access_token_secret=os.environ["X_ACCESS_TOKEN_SECRET"],
    )


# ─── Part 1: scheduled-tweets.json ─────────────────────────────────────────

def load_scheduled_tweets() -> list[dict]:
    if not SCHEDULED_JSON_PATH.exists():
        return []
    with open(SCHEDULED_JSON_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_scheduled_tweets(tweets: list[dict]) -> None:
    with open(SCHEDULED_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(tweets, f, ensure_ascii=False, indent=2)


def should_post_scheduled(entry: dict, now_jst: datetime) -> bool:
    if entry.get("posted"):
        return False
    if entry.get("immediate"):
        return True
    scheduled_at = entry.get("scheduledAt")
    if scheduled_at:
        scheduled_dt = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00"))
        scheduled_dt_jst = scheduled_dt.astimezone(JST)
        diff = now_jst - scheduled_dt_jst
        # 予定時刻を過ぎている、かつ15分以内（二重投稿防止）
        return timedelta(0) <= diff <= timedelta(minutes=15)
    return False


def process_scheduled_tweets(client: tweepy.Client, now_jst: datetime) -> None:
    print("\n=== Part 1: scheduled-tweets.json ===")
    tweets = load_scheduled_tweets()
    if not tweets:
        print("No scheduled tweets found.")
        return

    to_post = [t for t in tweets if should_post_scheduled(t, now_jst)]
    if not to_post:
        print("No scheduled tweets to post at this time.")
        return

    posted_ids: set[str] = set()
    for entry in to_post:
        tweet_text = build_tweet_text(entry.get("text", ""), entry.get("tags", []))
        try:
            response = client.create_tweet(text=tweet_text)
            tweet_id = response.data["id"]
            print(f"Posted tweet id={tweet_id}: {tweet_text[:60]}...")
            posted_ids.add(entry["id"])
        except Exception as exc:  # noqa: BLE001
            print(f"Failed to post {entry['id']}: {exc}", file=sys.stderr)

    if posted_ids:
        remaining = [t for t in tweets if t["id"] not in posted_ids]
        save_scheduled_tweets(remaining)
        print(f"Done. Posted {len(posted_ids)}, {len(remaining)} remaining.")


# ─── Part 2: auto-schedule.json ────────────────────────────────────────────

def load_auto_schedule() -> dict:
    if not AUTO_SCHEDULE_JSON_PATH.exists():
        return {"slots": [], "defaultTimes": ["06:00", "12:00", "18:00", "24:00"]}
    with open(AUTO_SCHEDULE_JSON_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_auto_schedule(schedule: dict) -> None:
    with open(AUTO_SCHEDULE_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(schedule, f, ensure_ascii=False, indent=2)


def should_post_slot(slot: dict, now_jst: datetime) -> bool:
    if not slot.get("enabled") or slot.get("posted"):
        return False

    slot_time: str = slot["time"]
    slot_date_str: str = slot["date"]
    slot_hour = SLOT_HOURS[slot_time]

    if slot_time == "24:00":
        check_date = date_type.fromisoformat(slot_date_str) + timedelta(days=1)
    else:
        check_date = date_type.fromisoformat(slot_date_str)

    return (
        now_jst.date() == check_date
        and now_jst.hour == slot_hour
        and now_jst.minute < 15  # cron が15分おきなので15分以内
    )


def build_prompt(slot_time: str) -> str:
    theme = TIME_THEMES.get(slot_time, TIME_THEMES["12:00"])
    return f"""まず、Webライター・副業ライター・フリーランスライターに関する最新のトレンドや話題をWeb検索で確認してください。
その情報を踏まえて、以下の条件でX（Twitter）に今すぐ投稿する**1件**のツイートを生成してください。

ペルソナ: 名古屋在住34歳男性、本業は社内SE、副業でWebライター7年目。
テーマ: {theme}
条件:
- 140文字以内（ハッシュタグ含む）
- 固定ハッシュタグ: {FIXED_TAGS}
- 追加ハッシュタグ: 0〜1個（固定タグと重複しないもの）
- 親しみやすく自虐もOK。上から目線にならない。同じ目線で語る。
- トレンドを反映したタイムリーな内容を可能な限り含める

JSONのみ返してください（マークダウン不要）。形式:
{{"text": "ツイート本文", "tags": ["#Webライター", "#Webライターとつながりたい"]}}"""


def generate_tweet(slot_time: str) -> tuple[str, list[str]]:
    api_key = os.environ["GEMINI_API_KEY"]
    prompt = build_prompt(slot_time)

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {"temperature": 0.9},
    }

    url = (
        "https://generativelanguage.googleapis.com/v1beta"
        f"/models/gemini-2.5-flash:generateContent?key={api_key}"
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    raw_text: str = data["candidates"][0]["content"]["parts"][0]["text"]

    match = re.search(r'\{[^{}]*"text"\s*:[^{}]*\}', raw_text, re.DOTALL)
    if match:
        tweet_data = json.loads(match.group())
        return tweet_data.get("text", raw_text[:140]), tweet_data.get(
            "tags", ["#Webライター", "#Webライターとつながりたい"]
        )

    return raw_text[:140], ["#Webライター", "#Webライターとつながりたい"]


def process_auto_schedule(client: tweepy.Client, now_jst: datetime) -> None:
    print("\n=== Part 2: auto-schedule.json ===")
    schedule = load_auto_schedule()
    slots: list[dict] = schedule.get("slots", [])

    to_post = [s for s in slots if should_post_slot(s, now_jst)]
    if not to_post:
        print("No auto-schedule slots to post at this time.")
        return

    any_posted = False
    for slot in to_post:
        slot_id = f"{slot['date']} {slot['time']}"
        try:
            print(f"Generating tweet for slot {slot_id} ...")
            text, tags = generate_tweet(slot["time"])
            tweet_text = build_tweet_text(text, tags)
            response = client.create_tweet(text=tweet_text)
            tweet_id = response.data["id"]
            print(f"Posted tweet id={tweet_id}: {tweet_text[:60]}...")

            for s in slots:
                if s["date"] == slot["date"] and s["time"] == slot["time"]:
                    s["posted"] = True
                    any_posted = True
                    break
        except Exception as exc:  # noqa: BLE001
            print(f"Failed to post slot {slot_id}: {exc}", file=sys.stderr)

    if any_posted:
        schedule["slots"] = slots
        save_auto_schedule(schedule)
        print("Auto-schedule updated with posted flags.")


# ─── main ──────────────────────────────────────────────────────────────────

def main() -> None:
    now_jst = datetime.now(JST)
    print(f"Current JST: {now_jst.strftime('%Y-%m-%d %H:%M')} JST")

    client = get_twitter_client()

    process_scheduled_tweets(client, now_jst)
    process_auto_schedule(client, now_jst)

    print("\nAll done.")


if __name__ == "__main__":
    main()
