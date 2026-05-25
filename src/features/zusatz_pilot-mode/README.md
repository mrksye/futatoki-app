# zusatz_pilot-mode

PilotMode (= 実験モード / ExperimentalMode)。開発中・実験的な機能を「知っている人だけ」が触れるよう
出し分けるための汎用ゲート。本体機能とは疎結合で、いつでも丸ごと外せる。

ディレクトリ名の `zusatz_`（独: 追加・付録・おまけ）は、(1)「本体ではない付け足し」という意味と、
(2) エディタのファイル一覧で最下段へ沈める（z 始まり）狙いを兼ねた接頭辞。中身も "歪なモノ" として
1 ディレクトリに隔離してある。

## 解錠のしかた

設定ポップオーバーの「配色」欄のパレットボタンを、合言葉

> もも咲く朝、いそいそいそぐ

の順（各パレット名の頭文字 = 13 手）でタップすると解錠される。解錠した瞬間に下部トーストで知らせ、
解錠中は画面の縁に金色オーラがゆっくり脈打つ。解錠は **session 限り** — リロード / 再起動で解ける
（永続化しない／痕跡を残さない）。

解錠すると、モード切替に実験的な項目（現状は「たいむ」）が現れる。

## 完全に消したくなったら

1. この `zusatz_pilot-mode/` ディレクトリを丸ごと削除する。
2. 参照が壊れてコンパイルエラーになる行を消す。差し込み先（host）には説明コメントを一切置いて
   いないので、**エラー行だけが手がかり**になる:
   - `src/components/SettingsPopover.tsx`
     — `knockingOnPilotModesDoor` の import と、配色 onClick 内の呼び出し。
   - `src/components/ModePicker.tsx`
     — `inPilotMode` の import と、`ITEMS` を絞る filter の `|| inPilotMode()` 部分。

これで痕跡ゼロ。

手早く封印するだけなら、`SettingsPopover.tsx` の `knockingOnPilotModesDoor(...)` 呼び出し 1 行を消す
だけでよい。解錠経路が断たれて `inPilotMode` は永久に false になり、ゲートも金色オーラもすべて出なく
なる（残った import が unused 警告になるだけ）。

## ファイル

| file | 役割 |
| --- | --- |
| `state.ts` | `inPilotMode` signal + 解錠検出 `knockingOnPilotModesDoor` |
| `sequence.ts` | 合言葉（解錠シーケンス） |
| `golden-aura.ts` | 解錠中の金色オーラを `document.body` へ直接ねじ込む黒魔術 |
| `toast.ts` | 解錠した瞬間に下部から出て自動で消える通知トースト（同じく DOM 直注入） |
| `index.ts` | 公開 API（`inPilotMode` / `knockingOnPilotModesDoor`） |
