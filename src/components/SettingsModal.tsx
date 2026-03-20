import { useState } from 'react';
import { loadSettings, saveSettings } from '../utils/settings';

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const current = loadSettings();
  const [geminiApiKey, setGeminiApiKey] = useState(current.geminiApiKey);
  const [githubToken, setGithubToken] = useState(current.githubToken);

  const handleSave = () => {
    saveSettings({ geminiApiKey, githubToken });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">⚙️ API設定</h3>

        {/* Gemini API Key */}
        <div className="settings-field">
          <label className="settings-label">
            Gemini APIキー <span className="settings-required">※必須</span>
          </label>
          <input
            type="password"
            className="modal__input"
            placeholder="AIza..."
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.target.value)}
          />
          <p className="settings-hint">
            ツイート生成に使用します（無料）。
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="settings-link"
            >
              Google AI Studio で取得
            </a>
          </p>
          {!geminiApiKey && (
            <p className="settings-warn">⚠️ APIキーが未設定のためツイート生成ができません</p>
          )}
        </div>

        <hr className="settings-divider" />

        {/* GitHub Token */}
        <div className="settings-field">
          <label className="settings-label">GitHub Personal Access Token</label>
          <input
            type="password"
            className="modal__input"
            placeholder="github_pat_..."
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
          />
          <p className="settings-hint">
            「今すぐ実行」ボタンで GitHub Actions をトリガーするために使用します。
            権限: <code>workflow</code>
          </p>
        </div>

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn--primary" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
