#!/usr/bin/env python3
"""
Post scheduled tweets to X (Twitter) using Tweepy.

Reads scheduled-tweets.json, posts entries that are:
  - immediate: true
  - scheduledAt <= now (UTC)

After posting, removes those entries from the JSON file.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import tweepy


JSON_PATH = Path(__file__).parent.parent / "scheduled-tweets.json"


def load_tweets() -> list[dict]:
    if not JSON_PATH.exists():
        return []
    with open(JSON_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_tweets(tweets: list[dict]) -> None:
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(tweets, f, ensure_ascii=False, indent=2)


def get_client() -> tweepy.Client:
    consumer_key = os.environ["X_CONSUMER_KEY"]
    consumer_secret = os.environ["X_CONSUMER_SECRET"]
    access_token = os.environ["X_ACCESS_TOKEN"]
    access_token_secret = os.environ["X_ACCESS_TOKEN_SECRET"]

    return tweepy.Client(
        consumer_key=consumer_key,
        consumer_secret=consumer_secret,
        access_token=access_token,
        access_token_secret=access_token_secret,
    )


def build_tweet_text(entry: dict) -> str:
    text = entry.get("text", "")
    tags = entry.get("tags", [])
    full = f"{text}\n{' '.join(tags)}" if tags else text
    # X allows max 280 characters
    return full[:280]


def should_post(entry: dict, now: datetime) -> bool:
    if entry.get("posted"):
        return False
    if entry.get("immediate"):
        return True
    scheduled_at = entry.get("scheduledAt")
    if scheduled_at:
        scheduled_dt = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00"))
        return scheduled_dt <= now
    return False


def main() -> None:
    tweets = load_tweets()
    if not tweets:
        print("No scheduled tweets found.")
        return

    now = datetime.now(timezone.utc)
    client = get_client()

    to_post = [t for t in tweets if should_post(t, now)]
    if not to_post:
        print("No tweets to post at this time.")
        return

    posted_ids: set[str] = set()
    for entry in to_post:
        tweet_text = build_tweet_text(entry)
        try:
            response = client.create_tweet(text=tweet_text)
            tweet_id = response.data["id"]
            print(f"Posted tweet id={tweet_id}: {tweet_text[:60]}...")
            posted_ids.add(entry["id"])
        except Exception as exc:  # noqa: BLE001
            print(f"Failed to post tweet {entry['id']}: {exc}", file=sys.stderr)

    # Remove posted entries
    remaining = [t for t in tweets if t["id"] not in posted_ids]
    save_tweets(remaining)
    print(f"Done. Posted {len(posted_ids)} tweet(s), {len(remaining)} remaining.")


if __name__ == "__main__":
    main()
