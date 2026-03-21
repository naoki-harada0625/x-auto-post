import { useState, useCallback, useEffect } from 'react';
import type { Tweet, ScheduledTweet } from './types';
import { AutoGenerateTab } from './components/AutoGenerateTab';
import { KeywordTab } from './components/KeywordTab';
import { ScheduleTab } from './components/ScheduleTab';
import { ScheduledList } from './components/ScheduledList';
import { Toast } from './components/Toast';
import { SettingsModal } from './components/SettingsModal';
import {
  loadScheduled,
  addScheduledTweet,
  removeScheduledTweet,
  pushTweetToGitHub,
  removeTweetFromGitHub,
  triggerGitHubActions,
  syncFromGitHub,
} from './utils/scheduledTweets';
import './App.css';

type Tab = 'auto' | 'keyword' | 'schedule';

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function App() {
  const [tab, setTab] = useState<Tab>('auto');
  const [scheduled, setScheduled] = useState<ScheduledTweet[]>(loadScheduled);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const showToast = useCallback((message: string, type: ToastState['type'] = 'success') => {
    setToast({ message, type });
  }, []);

  // 画面を開いた時に GitHub から最新の状態を同期
  useEffect(() => {
    syncFromGitHub().then((tweets) => {
      if (tweets !== null) {
        setScheduled(tweets);
        showToast('リストを更新しました', 'info');
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImmediate = useCallback(async (tweet: Tweet) => {
    const entry: ScheduledTweet = {
      id: `${tweet.id}-imm-${Date.now()}`,
      text: tweet.text,
      tags: tweet.tags,
      immediate: true,
      createdAt: new Date().toISOString(),
    };
    const updated = addScheduledTweet(entry);
    setScheduled(updated);
    setTriggering(true);
    try {
      await pushTweetToGitHub(entry);
      await triggerGitHubActions();
      showToast('GitHub に保存しアクションをトリガーしました。1〜2分後に投稿されます。', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'エラーが発生しました', 'error');
    } finally {
      setTriggering(false);
    }
  }, [showToast]);

  const handleSchedule = useCallback(async (tweet: Tweet, scheduledAt: string) => {
    const entry: ScheduledTweet = {
      id: `${tweet.id}-sch-${Date.now()}`,
      text: tweet.text,
      tags: tweet.tags,
      scheduledAt,
      createdAt: new Date().toISOString(),
    };
    const updated = addScheduledTweet(entry);
    setScheduled(updated);
    try {
      await pushTweetToGitHub(entry);
      showToast('予約投稿に追加しました。5分おきのcronで自動投稿されます。', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'GitHub への保存に失敗しました', 'error');
    }
  }, [showToast]);

  const handleRemove = useCallback(async (id: string) => {
    const updated = removeScheduledTweet(id);
    setScheduled(updated);
    showToast('削除しました', 'info');
    try {
      await removeTweetFromGitHub(id);
    } catch {
      // GitHub側の削除失敗はサイレント
    }
  }, [showToast]);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await triggerGitHubActions();
      showToast('GitHub Actions をトリガーしました！30秒後にリストを更新します。', 'success');
      // 30秒後に GitHub から状態を再取得して投稿済みエントリを反映
      setTimeout(() => {
        syncFromGitHub().then((tweets) => {
          if (tweets !== null) {
            setScheduled(tweets);
            showToast('リストを更新しました', 'info');
          }
        });
      }, 30000);
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
          <div className="header-actions">
            <button
              className={`btn btn--trigger ${triggering ? 'btn--loading' : ''}`}
              onClick={handleTrigger}
              disabled={triggering}
              title="GitHub Actions を手動トリガー（即時投稿・期限切れ予約を処理）"
            >
              {triggering ? '⏳' : '▶'} 今すぐ実行
            </button>
            <button
              className="btn btn--icon btn--settings"
              onClick={() => setShowSettings(true)}
              title="API設定"
            >
              ⚙️
            </button>
          </div>
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
          🔍 キーワード
        </button>
        <button
          className={`tab-btn ${tab === 'schedule' ? 'tab-btn--active' : ''}`}
          onClick={() => setTab('schedule')}
        >
          📅 投稿スケジュール
        </button>
      </nav>

      <main className="app-main">
        {tab === 'auto' && (
          <AutoGenerateTab
            onImmediate={handleImmediate}
            onSchedule={handleSchedule}
            scheduled={scheduled}
          />
        )}
        {tab === 'keyword' && (
          <KeywordTab onImmediate={handleImmediate} onSchedule={handleSchedule} />
        )}
        {tab === 'schedule' && (
          <ScheduleTab onToast={showToast} />
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

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
