# Exam Capsule 仕様

## 境界

普通browser、完全には信用できない。別端末、改造client、偽event、防げない。Demo、抑止と異常発見と欠落検出を見せる。

## 受験

通常browser、PWA install導線と証跡確認だけ出す。受験開始、拒否する。install済みPWAをOS iconから起動するとstandalone app windowになる。そこで受験者名を入れる。

開始操作でserverがUUID session、bearer token、chain challengeを作る。client、Fullscreenを要求する。対応browserならKeyboard Lockも要求する。Fullscreen APIはuser activationが要るため自動実行しない。manifest、`display: standalone`を使う。試験終了時、Fullscreenを解除できる状態を保つ。

PWA判定、`display-mode: standalone`、`display-mode: fullscreen`、iOS standalone状態を見る。client判定、改造可能。環境完全性の証明に使わない。

試験開始前、`outerWidth/outerHeight`と`innerWidth/innerHeight`の差からdockされたDeveloper Toolsを推定する。閾値を超える時、sessionを作らない。undockされたDeveloper Tools、改造browser、確実には検出できない。推定を環境完全性の証明に使わない。

問題、serverが1問ずつ返す。3問、単一選択。回答順、serverが決める。現在問題でない回答、存在しない選択肢、二重提出、拒否する。最終回答で提出確定、server採点を返す。

## 監視

active session中、次を意味eventとして記録する。

- session開始、問題表示、回答選択、回答確定、試験提出
- Fullscreen出入り、document表示状態、window focus
- viewport変更
- clipboard copy/cut/paste試行、context menu、selection試行
- browserがpageへ渡したkeydown、keyup。key、code、location、modifier、IME状態を保存する。長押しrepeatは個別eventにせず、keyupの反復回数と押下時間へ集約する。focus離脱などでkeyupを受け取れない押下はinterruptedとして閉じる
- 問題文、選択肢の欠落、文字変更、非表示、別要素による被覆

clipboard、context menu、selection、通常UIで抑止する。selection抑止は毎回行うが、証跡は5秒に1件までに制限する。透かし、受験者名、session断片、現在時刻を画面全体に置く。Fullscreen離脱、即表示する。

意図しないFullscreen離脱、約0.6秒の警告音を鳴らす。試験提出による自動離脱、鳴らさない。

重要表示、750msごとにserver由来の問題dataとDOM textを照合する。computed style、寸法、中央点の最前面elementも見る。異常を1回だけ`content.integrity_failure`として保存し、session中の回答を停止する。拡張機能名の特定、しない。検査code自体を改造できるclientに対する証明、しない。

response header、CSP、frame埋め込み禁止、MIME sniffing禁止、不要なcamera、microphone、geolocation、display captureを閉じる。Browser extension content script、page CSPとは別権限。これで停止できない。

## 証跡

event、`sessionId`、`sequence`、`clientMonotonicTime`、`type`、`payload`、`previousHash`、`eventHash`を持つ。hash入力、key順を正規化する。

```text
eventHash = SHA-256(canonical(event without eventHash))
previousHash(1) = server challenge
previousHash(n) = eventHash(n - 1)
```

client、eventをIndexedDBへ保存してから送る。同一page内のappendを直列化する。最大100件をHTTP POSTする。server、token、session一致、連番、previous hash、event hashを検証する。ACK済みだけIndexedDBから消す。送信失敗、2秒後に再送する。同一sequence、同一hashなら冪等に受ける。異なるhashなら拒否する。

## 確認

`REVIEWER_KEY` bearer認証が必要。未設定なら確認APIを閉じる。画面、2秒ごとに同じFunction instanceのsessionと受理eventを読む。

## 提出レポート

提出後、server受理済みeventだけから不審度を0〜100で概算する。Fullscreen離脱20点、非表示10点、非表示秒数は最大30点、clipboard試行15点、focus離脱5点、resize 2点、shortcut分類は最大10点、表示改変50点。25点以上を要確認、60点以上を高いと表示する。不正認定には使わない。

受験者画面、得点、不審度、検出回数、server受理済みsession情報、回答、eventを提出後に表示する。表示用eventからhash、client内部時刻、重複識別子を除き、一括copyできる。未ACK event、集計に含めない。

提出確定後、Keyboard Lockを解除し、意図的終了としてFullscreenを抜ける。この離脱、不審eventへ加えない。最終画面から再挑戦できる。再挑戦、新しいsession、token、challenge、回答、証跡chainを作る。前回session、確認画面に残す。

## 保存

server store、process memory。全API、1つのcatch-all Next.js Route Handlerで同一Functionへ束ねる。process消滅、data消える。scale-out、instance間共有しない。これはdemo制約。本番仕様ではない。

PWA manifest、app identity、standalone表示、theme、192/512 iconを定義する。Service Workerとoffline cache、持たない。server authorityが必要な試験をofflineへ静かに劣化させない。

## 拡張機能

PWA、browser profileのextensionを継承する。Web page、稼働extensionの一覧取得、無効化、ID特定、できない。host permissionを持つcontent script、isolated worldから共有DOMを読んで変更できる。

管理端末、Chrome Enterprise `ExtensionSettings`で全extensionをremovedにするか、試験originを`runtime_blocked_hosts`へ置く。これはbrowser管理policy。Web applicationから設定、検証しない。非管理端末、表示改変検出を証跡として扱うだけ。
