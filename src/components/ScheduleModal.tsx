import { useState } from 'react';
import type { Tweet } from '../types';

interface Props {
  tweet: Tweet;
  onConfirm: (scheduledAt: string) => void;
  onClose: () => void;
}

export function ScheduleModal({ tweet, onConfirm, onClose }: Props) {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 10);
  const defaultValue = now.toISOString().slice(0, 16);

  const [datetime, setDatetime] = useState(defaultValue);

  const handleConfirm = () => {
    if (!datetime) return;
    onConfirm(new Date(datetime).toISOString());
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">予約投稿</h3>
        <p className="modal__preview">{tweet.text}</p>
        <p className="modal__tags">{tweet.tags.join(' ')}</p>
        <label className="modal__label">
          投稿日時
          <input
            type="datetime-local"
            className="modal__input"
            value={datetime}
            min={new Date().toISOString().slice(0, 16)}
            onChange={(e) => setDatetime(e.target.value)}
          />
        </label>
        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn--primary" onClick={handleConfirm}>
            予約する
          </button>
        </div>
      </div>
    </div>
  );
}
