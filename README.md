# StatUpAcademia — 介護記録アシスタント

スタートアップアカデミア開発用。ワイヤレスイヤホン等での発話だけで，施設ごとに異なる
フォーマットに沿った介護記録をリアルタイムに作成できるWebアプリのプロトタイプです。

## 実装範囲

- **P-1** 記録フォーマットの初期設定（記録用紙の撮影 → AIによる項目抽出 → 確認・編集）
- **P-2** 音声入力による記録作成（「記録開始」「送信」という発話ワードで開始・送信、Web Speech API）
- **P-3** 個人ページでの記録確認（入居者ごとのタイムライン表示、未入力項目のハイライト）

## セットアップ

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) をGoogle Chromeで開いてください（音声認識はChromeの機能に依存します）。

写真からの項目抽出・発話内容の構造化にはAnthropic Claude APIを使用します。`ANTHROPIC_API_KEY`
環境変数が未設定の場合は，開発用のモック応答にフォールバックします。

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

## デプロイ

GitHubリポジトリをVercelにインポートすることで，push時の自動デプロイが有効になります。
APIキーはVercel側の環境変数に設定し，ブラウザには公開しません。
