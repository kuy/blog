+++
title = "sccacheでGitHub Actions上のRustビルドを高速化するやつ試した"
date = 2021-04-26
draft = false
slug = "speedup-rust-build"
in_search_index = true
template = "page.html"

[taxonomies]
tags = ["rust", "optimization", "sccache", "tool"]
categories = ["programming"]
+++

## Rust プロジェクトのビルド速度

ご存知の通り、Rust のコンパイル速度は遅い。まぁそれだけ高級なことをやっているんだから仕方ないとは思う。
それに[パフォーマンスダッシュボード](https://perf.rust-lang.org/dashboard.html)を見てみると着実に改善していてすごい。

とはいえ、現実にはその遅さによって微妙な待ちが発生してしまうのは事実。何とかならないかな・・・と思っていたら [「GitHub Actions best practices for Rust projects」](https://www.fluvio.io/blog/2021/04/github-actions-best-practices/) という記事を見つけた。

記事自体のテーマは GitHub Actions における Rust プロジェクトだけど、そのうちの１つはビルド速度の改善。

これはうってつけだ！ということで早速趣味プロジェクトの CI に導入して試してみた。

<!-- more -->

## 結論: 2 倍早くなった

忙しい人のために結論から言うと 2 倍も早くなった。 crate のダウンロードキャッシュなども導入することでさらに早くなりそう。

## GitHub Actions の workflow

記事の内容だとそのまま動かない部分があったので、とりあえず workflow を掲載しておく。

```yml
name: Build

on:
  push:

jobs:
  build:
    name: Build
    runs-on: ubuntu-20.04
    env:
      RUSTC_WRAPPER: sccache
      SCCACHE_CACHE_SIZE: 1G
      SCCACHE_DIR: /home/runner/.cache/sccache
      # SCCACHE_RECACHE: 1 # Uncomment this to clear cache, then comment it back out
    steps:
      - uses: actions/checkout@v2
      - name: Install sccache
        env:
          LINK: https://github.com/mozilla/sccache/releases/download
          SCCACHE_VERSION: 0.2.15
        run: |
          SCCACHE_FILE=sccache-v$SCCACHE_VERSION-x86_64-unknown-linux-musl
          mkdir -p $HOME/.local/bin
          curl -L "$LINK/v$SCCACHE_VERSION/$SCCACHE_FILE.tar.gz" | tar xz
          mv -f $SCCACHE_FILE/sccache $HOME/.local/bin/sccache
          chmod +x $HOME/.local/bin/sccache
          echo "$HOME/.local/bin" >> $GITHUB_PATH
      - name: Install Rust toolchain
        uses: actions-rs/toolchain@v1
        with:
          profile: minimal
          toolchain: 1.51.0
          override: true
      - name: Prepare sccache
        uses: actions/cache@v2
        continue-on-error: false
        with:
          path: /home/runner/.cache/sccache
          key: ${{ runner.os }}-sccache-${{ hashFiles('**/Cargo.lock') }}
          restore-keys: |
            ${{ runner.os }}-sccache-
      - name: Start sccache server
        run: sccache --start-server
      - name: Build
        uses: actions-rs/cargo@v1
        with:
          command: build
          args: --release
      - name: Print sccache stats
        run: sccache --show-stats
      - name: Stop sccache server
        run: sccache --stop-server || true
```

変更点としては、

- 最新の `0.2.15` だと GitHub 上でのタグ付けフォーマットが変わった
  - `v` が入るようになった
- ダウンロードした `sccache` の実行ファイルに権限付与
