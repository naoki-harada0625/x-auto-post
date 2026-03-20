import { useState } from 'react';
import type { ScheduledTweet } from '../types';

interface Props {
  tweets: ScheduledTweet[];
  onRemove: (id: string) => void;
}

export function ScheduledList({ tweets, onRemove }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (tweets.length === 0) {
    return (
      <div className="scheduled-empty">
        <p>予約済みツイートはありません</p>
      </div>
    );
  }

  const sorted = [...tweets].sort((a, b) => {
    if (a.immediate) return -1;
    if (b.immediate) return 1;
    return new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime();
  });

  return (
    <div className="scheduled-list">
      {sorted.map((tweet) => (
        <div
          key={tweet.id}
          className="scheduled-item"
          onClick={() => setExpanded(expanded === tweet.id ? null : tweet.id)}
        >
          <div className="scheduled-item__header">
            <div className="scheduled-item__meta">
              {tweet.immediate ? (
                <span className="badge badge--immediate">即時投稿待ち</span>
              ) : (
                <span className="badge badge--scheduled">
                  {formatDate(tweet.scheduledAt!)}
                </span>
              )}
            </div>
            <button
              className="btn btn--icon"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(tweet.id);
              }}
              title="削除"
            >
              ✕
            </button>
          </div>
          <p className="scheduled-item__preview">
            {expanded === tweet.id
              ? `${tweet.text}\n${tweet.tags.join(' ')}`
              : `${tweet.text.slice(0, 60)}${tweet.text.length > 60 ? '...' : ''}`}
          </p>
          {expanded === tweet.id && (
            <p className="scheduled-item__tags">{tweet.tags.join(' ')}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
