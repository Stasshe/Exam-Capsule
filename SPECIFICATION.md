# Exam Capsule 仕様

## 境界

普通browser、完全には信用できない。別端末、改造client、偽event、防げない。Demo、抑止と異常発見と欠落検出を見せる。

## 受験

受験者、名前を入れる。開始時、serverがUUID session、bearer token、chain challengeを作る。client、Fullscreenを要求する。対応browserならKeyboard Lockも要求する。

問題、serverが1問ずつ返す。3問、単一選択。回答順、serverが決める。現在問題でない回答、存在しない選択肢、二重提出、拒否する。最終回答で提出確定、server採点を返す。

## 監視

active session中、次を意味eventとして記録する。

- session開始、問題表示、回答選択、回答確定、試験提出
- Fullscreen出入り、document表示状態、window focus
- viewport変更
- clipboard copy/cut/paste試行、context menu、selection試行
- raw keyを保存しないkeyboard分類とmodifier状態

clipboard、context menu、selection、通常UIで抑止する。透かし、受験者名、session断片、現在時刻を画面全体に置く。Fullscreen離脱、即表示する。

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

## 保存

server store、process memory。全API、1つのcatch-all Next.js Route Handlerで同一Functionへ束ねる。process消滅、data消える。scale-out、instance間共有しない。これはdemo制約。本番仕様ではない。
