+++
title = "rust-analyzer: QuickFix of snake case #1"
date = 2020-05-30
draft = true
slug = "rust-analyzer-dev-01"
in_search_index = true
template = "page.html"

[taxonomies]
tags = ["rust", "rust-analyzer", "language-server", "lsp"]
categories = ["programming"]
+++

最近 [rust-analyzer](https://github.com/rust-analyzer/rust-analyzer) へのコントリビュートを始めて、この前小さいやつだけど 1 つマージされた。
次はもうちょい歯ごたえあるやつを、と思って camel case を snake case に修正する QuickFix を提案してみた。

ただ、前回よりも広い範囲のコードを見る必要もあって、作業が細切れになりがちなので、メモを書きながら進めようかな、と思ってこれを書いてる。

<!-- more -->

## やりとりをざっくり

rust-analyzer に触れるまで Language Server Protocol についての知識はほぼゼロだったんだけど、VSCode で普段使っている機能の多くの部分が Language Server によって提供されていることがわかってとても興味深い。

Code Action と QuickFix の違いは Code Action の方が上位概念で、Code Action の一種として QuickFix がある。

1. `CODE -> RA`: initialize (初期化)
2. `RA <-> CODE`: ...(なんやかんやあって)
3. `RA -> CODE`: `textDocument/publishDiagnostics` (診断結果が push される)
4. `CODE -> RA`: `textDocument/codeAction` (修正候補を要求する)
5. `RA -> CODE`: `textDocument/codeAction` (修正候補を受け取る)

4 番では 3 番で受け取った diagnostics を context として送信しているものの、これは実際には使われていなかった。
なので純粋にファイルとコード上の位置から Code Action を生成している。

## Code Action の生成

最初 Code Action はすべて Language Server が生成していると思っていた。
ところが、 よく見てみると未使用引数の QuickFix は修正候補として表示されているし snake case も大差ないように思えた。
さらに、Code Action のハンドラを見ていると diagnostics を変換して候補に追加しているコードがあったので、
まずは `cargo check` の実行結果を見てみることにした。

以下は `cargo check` の結果の一部で、１つ目は未使用引数 (`unused_variables`) の部分。

```json
{
  "reason": "compiler-message",
  "package_id": "ra-example 0.1.0 (path+file:///Users/kuy/Work/ra-example)",
  "target": {
    "kind": ["bin"],
    "crate_types": ["bin"],
    "name": "ra-example",
    "src_path": "/Users/kuy/Work/ra-example/src/main.rs",
    "edition": "2018",
    "doctest": false
  },
  "message": {
    "rendered": "warning: unused variable: `anime`\n  --> src/main.rs:11:9\n   |\n11 |     let anime = Anime::new(\"Anime\", 2014);\n   |         ^^^^^ help: consider prefixing with an underscore: `_anime`\n\n",
    "children": [
      {
        "children": [],
        "code": null,
        "level": "help",
        "message": "consider prefixing with an underscore",
        "rendered": null,
        "spans": [
          {
            "byte_end": 172,
            "byte_start": 167,
            "column_end": 14,
            "column_start": 9,
            "expansion": null,
            "file_name": "src/main.rs",
            "is_primary": true,
            "label": null,
            "line_end": 11,
            "line_start": 11,
            "suggested_replacement": "_anime",
            "suggestion_applicability": "MachineApplicable",
            "text": [
              {
                "highlight_end": 14,
                "highlight_start": 9,
                "text": "    let anime = Anime::new(\"Anime\", 2014);"
              }
            ]
          }
        ]
      }
    ],
    "code": {
      "code": "unused_variables",
      "explanation": null
    },
    "level": "warning",
    "message": "unused variable: `anime`",
    "spans": [
      {
        "byte_end": 172,
        "byte_start": 167,
        "column_end": 14,
        "column_start": 9,
        "expansion": null,
        "file_name": "src/main.rs",
        "is_primary": true,
        "label": null,
        "line_end": 11,
        "line_start": 11,
        "suggested_replacement": null,
        "suggestion_applicability": null,
        "text": [
          {
            "highlight_end": 14,
            "highlight_start": 9,
            "text": "    let anime = Anime::new(\"Anime\", 2014);"
          }
        ]
      }
    ]
  }
}
```

次に snake case (`non_snake_case`) の部分。

```json
{
  "reason": "compiler-message",
  "package_id": "ra-example 0.1.0 (path+file:///Users/kuy/Work/ra-example)",
  "target": {
    "kind": ["bin"],
    "crate_types": ["bin"],
    "name": "ra-example",
    "src_path": "/Users/kuy/Work/ra-example/src/main.rs",
    "edition": "2018",
    "doctest": false
  },
  "message": {
    "rendered": "warning: variable `anAnime` should have a snake case name\n --> src/main.rs:5:16\n  |\n5 | fn check_anime(anAnime: Anime, __year: i32) {\n  |                ^^^^^^^ help: convert the identifier to snake case: `an_anime`\n  |\n  = note: `#[warn(non_snake_case)]` on by default\n\n",
    "children": [
      {
        "children": [],
        "code": null,
        "level": "note",
        "message": "`#[warn(non_snake_case)]` on by default",
        "rendered": null,
        "spans": []
      },
      {
        "children": [],
        "code": null,
        "level": "help",
        "message": "convert the identifier to snake case",
        "rendered": null,
        "spans": [
          {
            "byte_end": 53,
            "byte_start": 46,
            "column_end": 23,
            "column_start": 16,
            "expansion": null,
            "file_name": "src/main.rs",
            "is_primary": true,
            "label": null,
            "line_end": 5,
            "line_start": 5,
            "suggested_replacement": "an_anime",
            "suggestion_applicability": "MaybeIncorrect",
            "text": [
              {
                "highlight_end": 23,
                "highlight_start": 16,
                "text": "fn check_anime(anAnime: Anime, __year: i32) {"
              }
            ]
          }
        ]
      }
    ],
    "code": {
      "code": "non_snake_case",
      "explanation": null
    },
    "level": "warning",
    "message": "variable `anAnime` should have a snake case name",
    "spans": [
      {
        "byte_end": 53,
        "byte_start": 46,
        "column_end": 23,
        "column_start": 16,
        "expansion": null,
        "file_name": "src/main.rs",
        "is_primary": true,
        "label": null,
        "line_end": 5,
        "line_start": 5,
        "suggested_replacement": null,
        "suggestion_applicability": null,
        "text": [
          {
            "highlight_end": 23,
            "highlight_start": 16,
            "text": "fn check_anime(anAnime: Anime, __year: i32) {"
          }
        ]
      }
    ]
  }
}
```

やはり警告情報だけでなく修正候補と具体的な変更まで含まれているのでこれを活用しない手はない。 rustc すごいな。

で、なぜ未使用引数の方は修正候補が出て snake case の方は出ないのか。これは上記を見比べると `suggestion_applicability` というフィールドに違いがある。rust-analyzer ではここが `Applicability::MachineApplicable` のみ通すようになっていたので、 `Applicability::MaybeIncorrect` も含めるようにすることで表示されるはず。

[画像]

表示されて、選択すると修正された！

## 問題: 引数を使っている部分の変更をどうするか

事前に分かっていたことだけど、引数名を変更すると同時に、コード内でその引数を使用している部分を一斉に変更する必要がある。
IntelliJ Rust もそういう挙動になっているしぜひとも再現したい。

## 案 1: オリジナルの Code Action を改変して参照部分も同時に変更する

引数を使っている箇所を変更するのはすでにサポートされている名前変更のリファクタリングを使えばいけそうである。
ただ、問題はそれをどうやって実行するか。

現在の Code Action は引数名の変更のみが行われる挙動で、エディタ側に送信されている内容は以下になる。

```json
{
  "edit": {
    "changes": {
      "file:///Users/kuy/Work/ra-example/src/main.rs": [
        {
          "newText": "an_anime",
          "range": {
            "end": {
              "character": 22,
              "line": 4
            },
            "start": {
              "character": 15,
              "line": 4
            }
          }
        }
      ]
    }
  },
  "kind": "quickfix",
  "title": "convert the identifier to snake case"
}
```

rust-analyzer の方針としてサーバー起点のコード変更は避けているとのことで、

```rust
// We intentionally don't support command-based actions, as those either
// requires custom client-code anyway, or requires server-initiated edits.
// Server initiated edits break causality, so we avoid those as well.
```

何かこれとは別の変更を追加で push することはやめた方が良さそう。
ということで思いついたアイデアが上記の Code Action の `edit.changes` のところに、参照箇所を置き換えるような変更を追加してしまえばよい、というもの。

[画像]

ただ、ここまでやっておいて思ったのは、これって結果的にサーバー起点でのコード変更になってるし、クライアントからしたら「引数名を変更する Code Action を実行したら他の部分も一斉置換された」って状況にもなるのでちょっとやりすぎな気がしてきた。でも、明らかにビルドが通らない変更を Code Action として提供するってのは無責任な気もするし、判断が難しい。

`MaybeIncorrect` の意味がそのままやったら壊れるから何らか手を加えてくれ、なのであればそれを機械的に補ってあげるのは別に悪いわけではないとも思う。ちょっとこれは判断つかないので意見を聞くとして、別の案も考えてみることにした。

## 案 2: 引数名の変更後、エディタ側で一斉置換を行う

これが自然かもしれない。ただ、今受け取ってる内容だと `id` とか `code` がないので、エディタ側で引数名変更の実行かどうか判断がつかず、何らか目印をつけないと一斉置換をトリガーできない。

この案のデメリットもある。rust-analyzer を利用するエディタがすべて同様の対応を行わない限り同じ挙動にはならない。Language Server 側に知識を集約してエディタ側はシンプルに保つ、という本来の目的からするとかなり微妙な気がする。

## 案 3: Code Action から生成

Code Action を生成する場所としてはどこが正しいのか、という疑問を持った。
`textDocument/codeAction` のハンドラ内で生成される Code Action は以下がある。

1. `world.analysis().diagnostics(...)` を変換して生成
2. `world.check_fixes` から取得
3. `world.analysis().assists(...)` から取得

正直、1 と 2 の違いはよくわからない。ちょっと見た感じ `check_fixes` もたどっていくと diagnostics が出てきたので。
ただ、実行してみると `non_snake_case` の警告は２つ目で追加されていた。

ということで、今のところ 2 で得られる修正内容をベースに改変したものを VSCode 側に提供しているわけだけど、絶対にそれを使わないといけないわけではない。
むしろ、 `MaybeIncorrect` をそのまま出してしまうというのは少し行儀が悪いかもしれない。

そういう意味で、1 の診断結果をもとにゼロから Code Action を生成するのが実装的にも美しいんじゃないかと思う。

・・・試したところ、 `handle_code_action(...)` で生成したものは `kind` が `quickfix` ではなく空欄となるため、 `handle_fixes(...)` で生成したときのように VSCode 側で quickfix として選択できなくなり、電球マークの Code Action としてしか実行できなかった。

## 案 4: 新しい枠組みを作る

cargo check 由来の変更提案のうち MaybeIncorrect なやつを rust-analyzer 側で補って quickfix として提供する仕組みを作る。
現時点では MaybeIncorrect なものは除外されている。これらをすべて quickfix として出してしまうのは問題なので、対応可能なものだけひろう感じ。
なので実装としては案 1 を使いつつ、枠組みを作る。

## 現状

1. Code Action: `ra_assist` で生成したもの
2. QuickFix: `rustc` の diagnostics のうち `MachineApplicable` なもの

やりたいことは `rustc` の diagnostics のうちそのまま適用できない `MaybeIncorrect` なものを rust-analyzer 側で追加の変更を機械的に加えて QuickFix を生成する。

設計方針によると rust-analyzer は LSP に依存しない形で IDE の機能を提供すべき、とあるので、 `ra_assist` のように生成した内部表現を `rust-analyzer` crate で LSP 向けに変換する形を取らないといけない。ただ、現状では既存の枠組みではこのコードをどこに置くべきかわからない。

3. QuickFix: `rustc` の diagnostics のうち `MaybeIncorrect` なものを `ra_quickfix` で補完したもの

という３つ目の方法が必要だと思う。

## 悩む

方向性は決まったものの、実際に実装するとなると悩む。

まず、 `map_rust_diagnostic_to_lsp(...)` は `ra_flycheck` から push される `cargo check` の結果を LSP 向けに変換するためのレイヤーであって、ここで IDE 由来の支援などを行うべきではない。

前提の構造として、以下の 2 つが非同期に走っている。

1. `textDocument/codeAction` に対するレスポンス生成
2. 1 に備えて `cargo check` からの結果を LSP 向けに変換して溜め込む

つまり、 `cargo check` の結果はそのまま溜め込み、機械的に適用可能な Code Action のみ溜め込んでおくのが正しい姿。どうやったって今回やろうとしてることは既存の枠組みの中ではやらない方がいい。なので IDE 支援可能なものがあれば QuickFix を追加するという処理は、既存部分とは別に `handle_fixes(...)` 内で行えばいい。

具体的にはすでに溜め込んである diagnostics を参照できるので、その中から `MaybeIncorrect` だけど IDE 支援可能なものをピンポイントでひろって QuickFix を生成すればいい。
