#!/usr/bin/env python3
"""
Post scheduled tweets to X (Twitter).

Delegates to auto-post.py Part 1 logic to guarantee identical implementation.
Reads scheduled-tweets.json, posts entries that are:
  - immediate: true
  - scheduledAt <= now (JST)

After posting, removes those entries from the JSON file.
"""

import importlib.util
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

JST = ZoneInfo("Asia/Tokyo")

# Load auto-post.py (hyphen in filename requires importlib)
_spec = importlib.util.spec_from_file_location(
    "auto_post",
    os.path.join(os.path.dirname(__file__), "auto-post.py"),
)
_mod = importlib.util.module_from_spec(_spec)  # type: ignore[arg-type]
_spec.loader.exec_module(_mod)  # type: ignore[union-attr]

get_twitter_client = _mod.get_twitter_client
process_scheduled_tweets = _mod.process_scheduled_tweets


def main() -> None:
    now_jst = datetime.now(JST)
    print(f"Current JST: {now_jst.strftime('%Y-%m-%d %H:%M')} JST")

    client = get_twitter_client()
    process_scheduled_tweets(client, now_jst)

    print("\nDone.")


if __name__ == "__main__":
    main()
