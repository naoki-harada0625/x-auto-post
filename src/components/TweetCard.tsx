import { useState } from 'react';
import type { Tweet } from '../types';
import { ScheduleModal } from './ScheduleModal';

interface Props {
  tweet: Tweet;
  onImmediate: (tweet: Tweet) => void;
  onSchedule: (tweet: Tweet, scheduledAt: string) => void;
}

export function TweetCard({ tweet, onImmediate, onSchedule }: Props) {
  const [selected, setSelected] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const fullText = `${tweet.text}\n${tweet.tags.join(' ')}`;
  const charCount = fullText.length;

  return (
    <>
      <div
        className={`tweet-card ${selected ? 'tweet-card--selected' : ''}`}
        onClick={() => setSelected((s) => !s)}
      >
        <p className="tweet-card__text">{tweet.text}</p>
        <p className="tweet-card__tags">{tweet.tags.join(' ')}</p>
        <div className="tweet-card__footer">
          <span className={`tweet-card__count ${charCount > 280 ? 'tweet-card__count--over' : ''}`}>
            {charCount}/280
          </span>
        </div>

        {selected && (
          <div
            className="tweet-card__actions"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="btn btn--primary"
              onClick={() => onImmediate(tweet)}
            >
              今すぐ投稿
            </button>
            <button
              className="btn btn--secondary"
              onClick={() => setShowModal(true)}
            >
              予約投稿
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <ScheduleModal
          tweet={tweet}
          onConfirm={(scheduledAt) => {
            onSchedule(tweet, scheduledAt);
            setShowModal(false);
            setSelected(false);
          }}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
