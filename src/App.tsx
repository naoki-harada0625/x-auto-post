import { useState, useCallback } from 'react';
import type { Tweet, ScheduledTweet } from './types';
import { AutoGenerateTab } from './components/AutoGenerateTab';
import { KeywordTab } from './components/KeywordTab';
import { ScheduledList } from './components/ScheduledList';
import { Toast } from './components/Toast';
import {
  loadScheduled,
  addScheduledTweet,
  removeScheduledTweet,
  triggerGitHubActions,
} from './utils/scheduledTweets';
import './App.css';

type Tab = 'auto' | 'keyword';

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function App() {
  const [tab, setTab] = useState<Tab>('auto');
  const [scheduled, setScheduled] = useState<ScheduledTweet[]>(loadScheduled);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [triggering, setTriggering] = useState(false);

  const showToast = useCallback((message: string, type: ToastState['type'] = 'success') => {
    setToast({ message, type });
  }, []);

  const handleImmediate = useCallback((tweet: Tweet) => {
    const entry: ScheduledTweet = {
      id: `${tweet.id}-imm-${Date.now()}`,
      text: tweet.text,
      tags: tweet.tags,
      immediate: true,
      createdAt: new Date().toISOString(),
    };
    const updated = addScheduledTweet(entry);
    setScheduled(updated);
    showToast('即時投稿キューに追加しました。「今すぐ実行」ボタンで GitHub Actions をトリガーしてください。', 'info');
  }, [showToast]);

  const handleSchedule = useCallback((tweet: Tweet, scheduledAt: string) => {
    const entry: ScheduledTweet = {
      id: `${tweet.id}-sch-${Date.now()}`,
      text: tweet.text,
      tags: tweet.tags,
      scheduledAt,
      createdAt: new Date().toISOString(),
    };
    const updated = addScheduledTweet(entry);
    setScheduled(updated);
    showToast('予約投稿に追加しました', 'success');
  }, [showToast]);

  const handleRemove = useCallback((id: string) => {
    const updated = removeScheduledTweet(id);
    setScheduled(updated);
    showToast('削除しました', 'info');
  }, [showToast]);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await triggerGitHubActions();
      showToast('GitHub Actions をトリガーしました！数分後に投稿されます。', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'トリガーに失敗しました', 'error');
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__inner">
          <h1 className="app-title">
            <span className="x-logo">𝕏</span> 自動投稿ツール
          </h1>
          <button
            className={`btn btn--trigger ${triggering ? 'btn--loading' : ''}`}
            onClick={handleTrigger}
            disabled={triggering}
            title="GitHub Actions を手動トリガー（即時投稿・期限切れ予約を処理）"
          >
            {triggering ? '⏳' : '▶'} 今すぐ実行
          </button>
        </div>
      </header>

      <nav className="tab-nav">
        <button
          className={`tab-btn ${tab === 'auto' ? 'tab-btn--active' : ''}`}
          onClick={() => setTab('auto')}
        >
          ✨ 自動生成
        </button>
        <button
          className={`tab-btn ${tab === 'keyword' ? 'tab-btn--active' : ''}`}
          onClick={() => setTab('keyword')}
        >
          🔍 キーワード検索
        </button>
      </nav>

      <main className="app-main">
        {tab === 'auto' ? (
          <AutoGenerateTab
            onImmediate={handleImmediate}
            onSchedule={handleSchedule}
            scheduled={scheduled}
          />
        ) : (
          <KeywordTab onImmediate={handleImmediate} onSchedule={handleSchedule} />
        )}

        <section className="scheduled-section">
          <h2 className="section-title">
            📅 予約済みリスト
            <span className="badge badge--count">{scheduled.length}</span>
          </h2>
          <ScheduledList tweets={scheduled} onRemove={handleRemove} />
        </section>
      </main>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
