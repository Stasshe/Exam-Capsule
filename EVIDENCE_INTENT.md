# Evidence設計意図

WebSocket接続、到達保証ではない。切断直前のeventを守るにはclient側の確定保存、ACK、再送、重複排除が要る。ゆえに証跡経路、IndexedDB outboxとbatch HTTPを核にする。live表示、証跡保存から分離する。

raw keyや回答文の全保存、個人情報と秘密入力を過剰収集する。判定に必要な意味へ落とす。keyboard、文字でなく分類とmodifierだけ残す。

hash chain、不正clientを正しくする魔法ではない。通常clientの欠落、削除、順序変更、重複を発見する道具。client生成hashを不正証明として扱わない。

server、問題進行、回答確定、採点を持つ。client表示状態を権威にしない。Demo storeだけmemory。永続化へ進む時も、この責務境界を変えない。
