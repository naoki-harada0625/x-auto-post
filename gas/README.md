# GAS セットアップ手順

GitHub Actions の cron の代わりに Google Apps Script (GAS) を使って
15分おきに正確に投稿を実行するための手順書です。

---

## 全体の流れ

```
Google スプレッドシート作成
        ↓
拡張機能 > Apps Script でエディタを開く
        ↓
Code.gs を貼り付けて保存
        ↓
スクリプトプロパティに API キーを設定
        ↓
setupTrigger() を実行してトリガーを登録
        ↓
動作確認（postScheduledTweets を手動実行）
```

---

## Step 1: Google スプレッドシートを作成

1. [Google ドライブ](https://drive.google.com) を開く
2. 左上「＋ 新規」→「Google スプレッドシート」→「空白のスプレッドシート」
3. タイトルを「X 自動投稿ツール」などに変更（任意）

> スプレッドシート自体は使いません。GAS スクリプトのコンテナとして作成します。

---

## Step 2: GAS エディタを開く

1. スプレッドシートのメニューバーから「**拡張機能**」→「**Apps Script**」をクリック
2. GAS エディタが新しいタブで開く

---

## Step 3: Code.gs を貼り付ける

1. エディタ左側の「コード.gs」（または「Code.gs」）をクリック
2. 既存のコード（`function myFunction() {}` など）を**全て削除**
3. このリポジトリの `gas/Code.gs` の内容を**まるごとコピー**して貼り付ける
4. **Ctrl+S**（Mac は Cmd+S）で保存

---

## Step 4: スクリプトプロパティに API キーを設定

1. GAS エディタの左メニューから「**⚙️ プロジェクトの設定**」をクリック
2. 下にスクロールして「**スクリプト プロパティ**」セクションを見つける
3. 「**スクリプト プロパティを追加**」を押して以下の6つを登録

| プロパティ名 | 値 | 取得元 |
|---|---|---|
| `GITHUB_TOKEN` | GitHub Personal Access Token | GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)。スコープ: `repo` にチェック |
| `X_CONSUMER_KEY` | X API Consumer Key | X Developer Portal → プロジェクト → Keys and tokens |
| `X_CONSUMER_SECRET` | X API Consumer Secret | 同上 |
| `X_ACCESS_TOKEN` | X API Access Token | 同上（Read and Write 権限が必要） |
| `X_ACCESS_TOKEN_SECRET` | X API Access Token Secret | 同上 |
| `GEMINI_API_KEY` | Gemini API Key | [Google AI Studio](https://aistudio.google.com/app/apikey) → API キーを作成 |

> `GEMINI_API_KEY` が未設定の場合、カレンダー自動投稿（auto-schedule.json）はスキップされます。
> 予約投稿（scheduled-tweets.json）だけなら `GEMINI_API_KEY` は不要です。

4. すべて入力したら「**スクリプト プロパティを保存**」をクリック

---

## Step 5: トリガーを設定する

1. GAS エディタ上部の関数選択ドロップダウンで **`setupTrigger`** を選択
2. 「▶ 実行」ボタンをクリック
3. 初回実行時は「権限を確認」ダイアログが表示される
   - 「権限を確認」→ Googleアカウントを選択 → 「詳細」→「安全ではないページに移動」→「許可」
4. 実行ログに `トリガー作成完了: postScheduledTweets を15分おきに実行します。` と表示されれば成功

### トリガーの確認

- GAS エディタ左メニューの「**⏰ トリガー**」をクリック
- `postScheduledTweets` が `時間ベース / 15分おき` で登録されていることを確認

---

## Step 6: 動作確認（手動実行）

1. 関数選択ドロップダウンで **`postScheduledTweets`** を選択
2. 「▶ 実行」をクリック
3. 下部の「実行ログ」を確認

**正常時のログ例:**
```
Current JST: 2026-03-23 12:00
=== Part 1: scheduled-tweets.json ===
件数: 1
  id=xxx-imm-123 scheduledAt=none immediate=true posted=undefined
  -> 投稿完了: id=1234567890 | 副業ライター7年目...
完了: 1件投稿, 残り0件
=== Part 2: auto-schedule.json ===
投稿対象スロットなし。
All done.
```

---

## GitHub Actions の変更点

GAS に移行したため、`auto-post.yml` の cron トリガーを削除しました。

- **`auto-post.yml`**: `workflow_dispatch`（手動トリガー）のみ残存。緊急時の手動実行に使用可能。
- **`post-tweets.yml`**: 変更なし。手動トリガー用に残存。

---

## トラブルシューティング

### X API で 403 エラー

- X Developer Portal でアプリの権限が「**Read and Write**」になっているか確認
- Access Token を「**Read and Write**」権限で再生成する

### GitHub API で 401 エラー

- `GITHUB_TOKEN` の権限スコープに `repo` が含まれているか確認
- トークンの有効期限が切れていないか確認

### `postScheduledTweets` が実行されない

- GAS エディタ → トリガー で登録されているか確認
- `setupTrigger()` を再実行して重複を削除してから再登録

### ログの確認方法

- GAS エディタ → 左メニュー「実行数」で過去の実行履歴とログを確認できる
