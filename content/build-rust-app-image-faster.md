+++
title = "GitHub Actions上のRustアプリのDockerイメージビルドを高速化する"
date = 2021-08-22
draft = false
slug = "build-rust-app-image-faster"
in_search_index = true
template = "page.html"

[taxonomies]
tags = ["rust", "web", "docker", "optimization", "github-actions"]
categories = ["programming"]
+++

## Rust + Docker + GitHub Actions = めちゃ遅い

以前、[GitHub Actions 上の Rust ビルドを高速化する記事](https://blog.endflow.net/speedup-rust-build/)を書いたけど、
今回は Kubernetes 環境にスムーズに移行できるよう Docker イメージ化するという要件も加わったことで、改めて試行錯誤する必要が出てきた。

それぞれに対するビルド速度の最適化は存在しているものの、３つ (Rust, Docker, GitHub Actions) すべてを満たすとなるとコピペで終わるほど情報がまとまってないし、見つけた Tips もちょっと古かったり、これというものは見つけられなかった。

公式ドキュメントを見ると正当進化していて新しいオプションが生えていたりしたので、賞味期限は短そうだけど、自分の試行錯誤の結果を残しておこうと思う。

成果としては 12 分 22 秒かかっていた Rust アプリケーションの Docker イメージビルドが最短で 2 分 43 秒まで縮まった。Docker layer caching 最高だっ！！！！

<!-- more -->

## TL; DR

3 行で言うと、

- [cargo-chef](https://github.com/LukeMathWalker/cargo-chef) で Docker layer caching を最大限活用する `Dockerfile` にしろ
- [docker/build-push-action@v2](https://github.com/docker/build-push-action) でビルドして GitHub Actions のキャッシュを使え
- 優勝！！！

## 課題

GitHub Actions 上で Rust アプリの Docker イメージを高速ビルドするにあたってボトルネックとなるのは 2 つ。

- Rust コンパイルの遅さ
- Docker イメージのビルドそのものの遅さ

[sccache によって高速化](https://blog.endflow.net/speedup-rust-build/)できたのは前者なわけだけど、Docker のマルチステージビルドを活用する場合 sccache サーバーを builder コンテナ内部に立てることになる。そのためにはキャッシュは外部からマウントして、それを `actions/cache` でキャッシュする・・・みたいな、なんともアレな構成になってやる前から地雷を踏みそうでそわそわする。

落とし穴を避けるという意味ではマルチステージビルドはせず、外側 (つまり GitHub Actions のステップ) で sccache を効かせてビルドした成果物を Docker イメージに持ち込むというパターンもありえる。けど、持ち込みは条件揃えないと実行時に問題発生する可能性もあってちょいアレ。

2 つ目の Docker イメージのビルド自体が遅いってやつは本質的な遅さで、小細工で高速化するには限界がある。抜本的な対策が必要。

ということで、それぞれの課題について順に書いていく。

## Rust コンパイルの遅さ

Rust 1.52.1 から無効になっていた incremental compilation が 1.54 で戻ってきたことで、普段の開発体験は再び良くなった。ただ、常にまっさら状態からビルドをする CI/CD 環境においては Rust のビルドの遅さはしばしば問題となる。加えて今回はこれを Docker イメージビルドのプロセス内部で行うため、sccache のような仰々しい仕組みは使いたくない。

そこで今回は [`cargo-chef`](https://github.com/LukeMathWalker/cargo-chef) を使った。このツールは「依存ライブラリだけをインストール・ビルドした中間レイヤを生成しておき、あとからアプリケーションコードを入れてビルドを実行する」という Docker の仕組みを活用したビルド高速化のテクニックを Rust でも手軽に利用できるようパッケージ化したもの。このテクニックは Python とか Node.js だとまさに「依存ライブラリだけインストール・ビルド」のためのコマンドが用意されているので比較的やりやすいものの、Rust だと依存ライブラリだけのインストール・ビルドというコマンドは存在しないため非常にやりにくい。

`cargo-chef` を利用するために既存の Dockerfile の構成を大幅に変える必要があるのでできるだけ最初の段階でこの構成にしておいた方がよい。

`cargo-chef` は Docker Buildx でビルドしないと意味がないどころか逆に遅くなるので注意が必要。Docker layer caching に強く依存した最適化手法なので、次のセクションで GitHub Actions でやり方を見ていく。

## Docker イメージのビルドそのものの遅さ

Docker イメージのビルドは古来より本当に遅かった。仕組み上の遅さではあるものの、最近は BuildKit によってかなり快適にビルドできるようになってきた。

使いたい。GitHub Actions でも使いたい！！！

とか思って記事を漁ってたら Docker 公式ドキュメントに [Optimizing the workflow](https://docs.docker.com/ci-cd/github-actions/#optimizing-the-workflow) というセクションがあって、完全にほしかったやつが書いてあり、 [docker/build-push-action](https://github.com/docker/build-push-action) を使えばよいらしい。

さらに！ buildx 0.6.0 と BuildKit 0.9.0 以降では [GitHub Actions 専用のキャッシュ設定](https://github.com/docker/build-push-action/blob/master/docs/advanced/cache.md#github-cache) が利用可能になっていて、 手作業で `actions/cache` を設定する必要もなく、単純に `type=gha` とだけ書いてあげれば OK といういたれりつくせりっぷり・・・。

自分はビルド後に E2E を通してから push したかったので、 `push: true` の代わりに `load: true` をオプションとして渡した。 `push` や `load` は `output` と呼ばれていて、何かしらの `output` がないとキャッシュだけ作成されてそのあとイメージを呼び出せないので注意。

`docker/setup-qemu-action` は一度入れてみたもののどういう効果があるのかよくわからなかったので外した。特に問題なくビルドできているのでいったんなしのままいく。

## おわりに

爆速すぎて笑いが止まらないレベルでした。Docker layer caching はこれほどまでに影響がでかい。そして、ここのところエコシステムがどんどん洗練されていて連携がしやすくなっていて本当にありがたい。

とはいえサンプルコードがないのでただの紹介になってしまったのは反省点。高速ビルドネタはいろいろあるからまた書きたい。

### 参考

- [5x Faster Rust Docker Builds with cargo-chef](https://www.lpalmieri.com/posts/fast-rust-docker-builds/)
- [Docker イメージビルドのキャッシュを BuildKit を交えつつ Actions でやってみた](https://dev.classmethod.jp/articles/docker-build-cache-with-buildkit-on-actions/)
- [Optimizing the workflow | Docker Docs](https://docs.docker.com/ci-cd/github-actions/#optimizing-the-workflow)
