+++
title = "acot の Reporter プラグインを作ってみる #1"
date = 2021-04-05
draft = false
slug = "acot-reporter-null"
in_search_index = true
template = "page.html"

[taxonomies]
tags = ["acot", "plugin"]
categories = ["programming"]
+++

## acot というのは

[puppeteer](https://github.com/puppeteer/puppeteer) を使ったアクセシビリティテストフレームワークで、
ウェブサイトや Web アプリケーションに対してルールに基づいて機械的にチェックを行って結果をレポートしてくれます。
似たような目的を持ったツールは他にもあるようですが、静的解析ではなく、実際にブラウザに表示して AOM や DOM を使って検証を行うため、
マウスカーソルを要素にホバーしたときにどうなるかなど動的な検証が得意なのが特徴です。

ルールは ESLint のように `extends` で拡張可能なので、自社のアクセシビリティガイドラインに基づいたルールを構築することもできますし、
まだガイドラインのようなものがなければ、acot のプリセットも使えるし、スモールスタートで小さなルールセットから始めることもできます。

さらに実行戦略である Runner や結果表示の Reporter などプラグイン機構によって様々な環境に適用できそうです。
例えば GitHub の PR ごとに GitHub Actions で実行して結果をコメントとして残すようにしたり、
本番環境に対して定期実行させて結果を Slack に流したりできそうです。

## 無限の可能性

ということで無限の可能性を秘めているのでプラグインを作ってみようと思います。

<!-- more -->

## acot のプラグイン機構

acot のプラグイン機構はシンプルで以下のような流れです。

1. ModuleLoader に名前を渡す
2. モジュールの resolve を試みる
3. Factory が返却される
4. インスタンス化

## `acot-reporter-null` プラグインを作る

いわゆる「何もしない」プラグインです。仕組みがわかってない状態で中身までやるとだいたい挫折するので、
まずは中身は空っぽ、開発環境やデバッグ方法などを固めていくことを目的としたプラグインを作ってみます。

とりあえず先にコードを見たい人は [kuy/acot-reporter-null](https://github.com/kuy/acot-reporter-null) にあります。

## ローカル package のテスト

やり方はいろいろありますが、今回は一番楽そうな `npm link` を使ってみます。
`acot-reporter-null` というディレクトリを作って、 `package.json` を書きます。

そしたら `npm link` を実行して「被リンク package」としての準備は OK です。

次にテスト用に `acot-study` というディレクトリを作って、ここで `npx acot run` できるように準備します。
そのあとローカル package を使えるように `npm link acot-reporter-null` を実行してシンボリックリンクを作成します。

最後に `acot.config.js` を変更して `reporter: "null"` を追加します。

```javascript
module.exports = {
  presets: ["@acot/wcag"],
  reporter: "null",
  origin: "https://example.com",
  paths: ["/pages"],
  rules: {
    "@acot/wcag/page-has-title": "error",
    "@acot/wcag/img-has-name": "error",
    "@acot/wcag/focusable-has-indicator": "error",
  },
};
```

## デバッグ方法

これで `npx acot run` を実行すれば動くんですが、なんの手がかりもなくプラグイン開発を進めるのは厳しいものがあります。
そういうときは `DEBUG='acot:module-loader' npx acot run` のように環境変数の `DEBUG` を使うとデバッグログ全体や
特定のログだけを見ることができます。便利。

## 完成

package 全体は [kuy/acot-reporter-null](https://github.com/kuy/acot-reporter-null) を見てください。

次はちゃんと中身を書いて欲しいプラグインを作っていこうと思います。
