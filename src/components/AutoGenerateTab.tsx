import { useState } from 'react';
import type { Genre, Tweet, ScheduledTweet } from '../types';
import { generateTweetsByGenre } from '../utils/geminiApi';
import { Spinner } from './Spinner';
import { TweetCard } from './TweetCard';

interface Props {
  onImmediate: (tweet: Tweet) => void;
  onSchedule: (tweet: Tweet, scheduledAt: string) => void;
  scheduled: ScheduledTweet[];
}

export function AutoGenerateTab({ onImmediate, onSchedule }: Props) {
  const [selectedGenre, setSelectedGenre] = useState<Genre | null>(null);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  const handleGenerate = async (genre: Genre) => {
    setSelectedGenre(genre);
    setError(null);
    setLoading(true);
    setGenerated(false);
    try {
      const result = await generateTweetsByGenre(genre);
      setTweets(result);
      setGenerated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!selectedGenre) return;
    await handleGenerate(selectedGenre);
  };

  return (
    <div className="tab-content">
      <div className="genre-buttons">
        <button
          className={`genre-btn ${selectedGenre === 'writer' ? 'genre-btn--active' : ''}`}
          onClick={() => handleGenerate('writer')}
          disabled={loading}
        >
          ✍️ 副業・ライター
        </button>
        <button
          className={`genre-btn ${selectedGenre === 'fire' ? 'genre-btn--active' : ''}`}
          onClick={() => handleGenerate('fire')}
          disabled={loading}
        >
          🔥 SIDE FIRE・投資
        </button>
      </div>

      {!generated && !loading && (
        <p className="hint">ジャンルを選択して「生成」ボタンを押してください</p>
      )}

      {loading && <Spinner />}

      {error && (
        <div className="error-box">
          <p>{error}</p>
        </div>
      )}

      {!loading && generated && tweets.length > 0 && (
        <>
          <div className="regenerate-row">
            <button className="btn btn--outline" onClick={handleRegenerate}>
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
