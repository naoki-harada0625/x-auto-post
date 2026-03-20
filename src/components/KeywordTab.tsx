import { useState } from 'react';
import type { Tweet } from '../types';
import { generateTweetsByKeyword } from '../utils/claudeApi';
import { Spinner } from './Spinner';
import { TweetCard } from './TweetCard';

interface Props {
  onImmediate: (tweet: Tweet) => void;
  onSchedule: (tweet: Tweet, scheduledAt: string) => void;
}

export function KeywordTab({ onImmediate, onSchedule }: Props) {
  const [keyword, setKeyword] = useState('');
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!keyword.trim()) return;
    setError(null);
    setLoading(true);
    setTweets([]);
    try {
      const result = await generateTweetsByKeyword(keyword.trim());
      setTweets(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleGenerate();
  };

  return (
    <div className="tab-content">
      <div className="keyword-input-row">
        <input
          type="text"
          className="keyword-input"
          placeholder="キーワードを入力（例: フリーランス、節約術）"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          className="btn btn--primary"
          onClick={handleGenerate}
          disabled={loading || !keyword.trim()}
        >
          生成
        </button>
      </div>

      {loading && <Spinner />}

      {error && (
        <div className="error-box">
          <p>{error}</p>
        </div>
      )}

      {!loading && tweets.length > 0 && (
        <>
          <div className="regenerate-row">
            <button className="btn btn--outline" onClick={handleGenerate}>
              🔄 再生成
            </button>
            <span className="hint-small">タップしてツイートを選択</span>
          </div>
          <div className="tweet-list">
            {tweets.map((tweet) => (
              <TweetCard
                key={tweet.id}
                tweet={tweet}
                onImmediate={onImmediate}
                onSchedule={onSchedule}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
