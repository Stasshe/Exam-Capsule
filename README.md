# Exam Capsule

ブラウザ試験の抑止、異常操作の検出、改ざん検出可能な操作列を確認するデモ。

## 実行

Node.js 20以降とpnpmを使う。

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

- 受験画面: `http://localhost:3000`
- 証跡確認: `http://localhost:3000/review`

証跡確認では `.env.local` の `REVIEWER_KEY` を入力する。

Chromium系ブラウザで受験URLを開き、インストールボタンを押す。準備が必要な間だけボタン表示が変わり、準備後は同じ操作の流れでnative確認を開く。既に導入済みなら再インストールを待たず、その状態を表示する。ブラウザの確認を承認し、OSのアプリアイコンから起動する。通常browser tabでは試験を開始できない。VercelではHTTPSが自動提供される。

## 実装範囲

- FullscreenとKeyboard Lockの要求、離脱状態と警告音
- install可能なPWA、standalone app window、browser tabからの受験拒否
- 全画面での右クリック・既知のDeveloper Toolsショートカット抑止と、dockされたDeveloper Toolsの操作遮断
- 問題文・選択肢の改変、非表示、被覆検出と回答停止
- CSPと不要browser capabilityの拒否
- `visibilitychange`、focus、resize、keydown/keyupと同時押し、選択、クリップボード、context menuの記録。キー長押しrepeatは1回の押下へ集約し、選択試行は5秒単位で抑制
- 受験者、session、時刻を含む動的透かし
- IndexedDBへ先に保存するevent outbox
- SHA-256 hash chain、連番検証、ACK後のローカル削除
- tokenでbindしたsession、サーバー基準の問題進行と採点
- 提出後の不審度概算と、重要項目だけを一括コピーできるサーバー受理データレポート
- 新しいセッションとして何度でも再挑戦
- 2秒pollingの証跡確認画面

## デモ制約

サーバーデータは単一Next.js Function内のメモリへ保存する。再起動、再デプロイ、scale-outで消失または別インスタンスへ分離する。APIを1つのcatch-all Route Handlerへまとめているが、Vercel上の永続性は保証しない。本番化では `src/lib/store.ts` の境界を永続DBへ置き換える。

通常ブラウザ上のJavaScriptは改造可能であり、このデモは不正不可能性を証明しない。検出と通常クライアントにおける証跡欠落の低減を扱う。

Service Workerはインストール判定のために通信をそのままnetworkへ渡す。cacheとoffline受験は提供しない。問題進行、回答確定、証跡受理にはserver接続が必要。

詳細は [SPECIFICATION.md](SPECIFICATION.md) と [EVIDENCE_INTENT.md](EVIDENCE_INTENT.md) を参照。
