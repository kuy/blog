+++
title = "返り値でレスポンスを返すタイプのWebフレームワークでPresenterを実現する"
date = 2021-08-09
draft = false
slug = "ddd-output-port"
in_search_index = true
template = "page.html"

[taxonomies]
tags = ["rust", "web", "axum", "ddd", "clean-architecture"]
categories = ["programming"]
+++

## なにこれ？

ちょっとコンテキストが面倒なんだけど、

- DDD で Web フレームワークを隠蔽して Controller/Presenter できっちり分けてる実装少ない
- 返り値をレスポンスにしてる Web フレームワークが諸悪の根源っぽい
- Future を使えば実現できるんじゃね？ → やってみた

記事のタイトルをどうするかすごく迷ったけど、迷ったわりにわかりやすくなってないのが悲しい。

というわけで久々のやってみた系記事です。実用性はまったくない。

<!-- more -->

## 課題とゴール

先に何が実現できれば勝ちなのか明らかにしておく。

ひと言で言うならば、Usecase の中で Presenter を使ってレスポンスを制御すること。

これがリクエストハンドラのコード。

```rust
async fn get_index_handler(...) {
    let gateway = gateway::BeansGateway::new();
    let view = views::BeansRenderer::new(sender);
    let usecase = BeansUsecase::new(gateway, view);
    usecase.list().await;
}
```

こっちが Usecase のコード。 `render_list()` を呼び出すことでレスポンスを返している。返り値はない。

```rust
pub async fn list(&self) {
    let beans = self.repo.get_all().await;
    self.view.render_list(beans);
}
```

よくある Web フレームワークではリクエストに対するリクエストハンドラを定義して、ハンドラの戻り値がレスポンスになることが多い。
その場合、Usecase の中でレスポンスを制御することが難しいことがある。具体的には以下のようなコード。

```rust
async fn get_index_handler(...) {
    let gateway = gateway::BeansGateway::new();
    let usecase = BeansUsecase::new(gateway);
    usecase.list().await
}
```

Usecase のコードはこれ。Usecase の返り値をレスポンスにしている。

```rust
pub async fn list(&self) -> Vec<Beans> {
    self.repo.get_all().await
}
```

こまけーことなんだけど、本当にそこまで責務を分離する必要があるのかという部分は置いておいて、
Usecase が制御できれば単純に表現の幅が広がるので引き出しとしては持っておきたい。

## 基本的なアイデア

Web フレームワーク側の要求として「関数の返り値をレスポンスとする」があって、Usecase の要求として「Usecase の中で Presenter 呼び出しによってレスポンスを表現したい」がある。

相反するようだけど、Future とリクエストハンドラをラップするハンドラを作ってあげればいける。

```rust
fn wrapper() -> Future<...> {
    // Futureを用意する
    let fut

    // 非同期でレスポンスを生成
    runtime::block_on(async {
        handler(fut).await;
    });

    // いったんFutureを返して、レスポンスはあとで生成
    fut
}

async fn handler() {
    // 返り値は void になっている
    usecase().await;
}

async fn usecase() {
    // レスポンスを返すかはUsecaseが決定できる
    // render()の中からFuture経由でレスポンスを返す
    render(data);
}
```

イメージはこんな感じ。

## 実装

コード全体は [axum-study](https://github.com/kuy/axum-study/tree/presenter) を参照。

channel を使ってレスポンスを受け取っている。

```rust
async fn index(sender: Sender<String>) {
    let gateway = gateway::BeansGateway::new();
    let view = views::BeansRenderer::new(sender);
    let usecase = BeansUsecase::new(gateway, view);
    usecase.list().await;
}

fn index_wrapper() -> impl Future<Output = String> {
    let (sender, receiver) = channel::<String>();

    thread::spawn(move || {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            index(sender).await;
        });
    });

    RespondLater::new(receiver)
}

struct RespondLater {
    receiver: Receiver<String>,
    pipe: (Sender<String>, Receiver<String>),
}

impl RespondLater {
    pub fn new(receiver: Receiver<String>) -> Self {
        Self {
            receiver,
            pipe: channel(),
        }
    }
}

impl Future for RespondLater {
    type Output = String;

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        if let Ok(body) = self.pipe.1.try_recv() {
            Poll::Ready(body)
        } else {
            let waker = cx.waker().clone();
            let sender = self.pipe.0.clone();
            let receiver = self.receiver.clone();
            thread::spawn(move || {
                if let Ok(body) = receiver.recv() {
                    sender.send(body).expect("should be sent");
                    waker.wake();
                }
            });
            Poll::Pending
        }
    }
}
```

一応実現はできたけど、自分の実力ではこれを汎用化することは困難に思えた。

## まとめ

Rust は楽しいんだけど、ちょっとでも汎用化しようとすると型パズルで死ぬ。
