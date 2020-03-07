+++
title = "actix-webの柔軟なリクエストハンドラの仕組み"
date = 2019-08-12
draft = false
slug = "flex-handler"
in_search_index = true
template = "page.html"

[taxonomies]
tags = ["rust", "web", "actix-web"]
categories = ["programming"]
+++

## きっかけ

業務で Rust を使っていこうということになったので、Rust を勉強しながら何か Web アプリでも作ってみようと思って [actix-web](https://actix.rs/) を触り始めた。サンプルコードをいじっていて気になったのはリクエストハンドラの引数の柔軟さで、まるでスクリプト言語のように扱える。

例えば以下は `http://localhost:8080/hoge` にリクエストを受けると path 部分である `/hoge` をレスポンスとして返す。

```rust
fn index(
    req: HttpRequest,
) -> impl IntoFuture<Item = String, Error = Error> {
    Ok(String::from(req.path()))
}

fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .default_service(web::route().to_async(index))
    })
    .bind("127.0.0.1:8080")?
    .run()
}
```

リクエストハンドラに何かデータ（普通はアプリケーションの状態など）を渡すこともできる。この例だと `http://localhost:8080/spacecat` にアクセスすると `http://www.example.com/spacecat` が表示される。

```rust
fn index(
    req: HttpRequest,
    prefix: web::Data<&str>,
) -> impl IntoFuture<Item = String, Error = Error> {
    Ok(format!("{}{}", prefix, req.path()))
}

fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .data("http://www.example.com")
            .default_service(web::route().to_async(index))
    })
    .bind("127.0.0.1:8080")?
    .run()
}
```

ここで「どこまで柔軟性があるんだろうか？」と思って、試しにリクエストハンドラの引数の順番を入れ替えてみた。

```rust
fn index(
    prefix: web::Data<&str>,
    req: HttpRequest,
) -> impl IntoFuture<Item = String, Error = Error> {
    Ok(format!("{}{}", prefix, req.path()))
}
```

**これ、ちゃんと動いてしまう。**

Rust のようなガチガチに検証するタイプの言語でこの柔軟性を一体どうやって実現しているんだろう・・・？ と思ったのがきっかけ。

<!-- more -->

## 疑問

謎な部分を分解すると以下になる。

- 可変長引数のリクエストハンドラはどうやって実現している？
- なぜ順番を入れ替えても動く？
- 型チェックはどうなってんの？

## TL;DR

忙しい人のために要約すると、

- 0 個から 10 個の引数を取る関数にハンドラ用のトレイトを実装（`factory_tuple!` マクロ）
- タプルで受け取った引数を、ハンドラ呼び出し時にフラットに展開
- ハンドラ引数の型情報に基づいて呼び出し用のタプルを実行時に生成（`tuple_from_req!` マクロ）

という感じ（3 行で説明するの厳しい・・・）。忙しいけどコードは読める人向けに雰囲気が伝わるサンプルコードを作ってみた。

[flex_handler](https://github.com/kuy/flex-handler/blob/master/src/main.rs): 柔軟なシグネチャを持つ関数の呼び出しサンプル

以下、暇な人向けの解説。

## 疑問 1: 可変長引数のリクエストハンドラはどうやって実現している？

リクエストハンドラを設定する [`to()`](https://github.com/actix/actix-web/blob/master/src/resource.rs#L220) と [`to_async()`](https://github.com/actix/actix-web/blob/master/src/resource.rs#L254) の引数を見ると、それぞれ [`Factory<T, R>`](https://github.com/actix/actix-web/blob/master/src/handler.rs#L15) と [`AsyncFactory<T, R>`](https://github.com/actix/actix-web/blob/master/src/handler.rs#L123) がトレイト境界として指定されている。ただ、このトレイトが実装されている型を探しても、引数 0 個の関数 `Fn() -> R + Clone` への実装しか出てこない。いきなり出鼻をくじかれた感じだ。

### タネあかし

そんなバカな、ということで [`handler.rs`](https://github.com/actix/actix-web/blob/master/src/handler.rs) を見てみると [`factory_tuple!`](https://github.com/actix/actix-web/blob/master/src/handler.rs#L375) というマクロ定義があり、引数 1 個から 10 個までの関数に対して `Factory` と `AsyncFactory` それぞれの実装が[マクロによって生成](https://github.com/actix/actix-web/blob/master/src/handler.rs#L401-L410)されていた。

例えば以下はマクロによって生成された「引数が 3 個で `Responder` を返す関数」をハンドラとして受け入れるようにする `Factory` トレイトの実装である。

```rust
impl <Func, A, B, C, Res> Factory<(A, B, C), Res> for Func
where
    Func: Fn(A, B, C) -> Res + Clone,
    Res: Responder,
{
    fn call(&self, param: (A, B, C)) -> Res {
        (self)(param.0, param.1, param.2)
    }
}
```

同様に以下は `AsyncFactory` トレイトの実装。

```rust
impl <Func, A, B, C, Res> AsyncFactory<(A, B, C), Res> for Func
where
    Func: Fn(A, B, C) -> Res + Clone + 'static,
    Res: IntoFuture,
    Res::Item: Responder,
    Res::Error: Into<Error>,
{
    fn call(&self, param: (A, B, C)) -> Res {
        (self)(param.0, param.1, param.2)
    }
}
```

Rust には現時点では可変長引数はないのでマクロによる力技に頼るしか無い。

### 試しに引数 11 個のハンドラを作ってみる

引数 10 個はコンパイル通る。

```rust
fn forward(
    req: HttpRequest,
    payload: web::Payload,
    client: web::Data<Client>,
    ignore4: web::Data<&str>,
    ignore5: web::Data<&str>,
    ignore6: web::Data<&str>,
    ignore7: web::Data<&str>,
    ignore8: web::Data<&str>,
    ignore9: web::Data<&str>,
    ignore10: web::Data<&str>,
) -> impl Future<Item = HttpResponse, Error = Error> {
```

引数 11 個はコンパイル通らない。

```rust
fn forward(
    req: HttpRequest,
    payload: web::Payload,
    client: web::Data<Client>,
    ignore4: web::Data<&str>,
    ignore5: web::Data<&str>,
    ignore6: web::Data<&str>,
    ignore7: web::Data<&str>,
    ignore8: web::Data<&str>,
    ignore9: web::Data<&str>,
    ignore10: web::Data<&str>,
    ignore11: web::Data<&str>,
) -> impl Future<Item = HttpResponse, Error = Error> {
```

### `Factory` / `AsyncFactory` の `call(&self, param: T)` について

前述の `factory_tuple!` マクロによって生成される `Factory` / `AsyncFactory` トレイトの実装にはいくつか重要なポイントがある。

1 つ目はフレームワーク内の規約として、ハンドラを関数として普通に呼び出す代わりに `Factory` / `AsyncFactory` トレイトの `call()` メソッドを呼び出すようにし、さらに `call()` メソッドの引数をたった１つの `param: T` (`T`は型パラメータ) のみした点。この規約を導入することでハンドラ関数の引数がいくつだろうと呼び出し側は気にする必要がなくなる。

もう 1 つは `param: T` の実際の型としてタプルを使うことで、`call()` メソッド呼び出し時にいったんタプルに集約しつつも、要素の型と並び順を保ち、ハンドラ関数の呼び出し時にはタプルを関数引数に展開している部分。

さきほどの 3 引数の `Factory` トレイト実装をもう一度見てみる。

```rust
impl <Func, A, B, C, Res> Factory<(A, B, C), Res> for Func
where
    Func: Fn(A, B, C) -> Res + Clone,
    Res: Responder,
{
    fn call(&self, param: (A, B, C)) -> Res {
        (self)(param.0, param.1, param.2)
    }
}
```

注目すべきは `T = (A, B, C)` でのタプル型を指定し、要素の型と関数の引数の型と並び順が一致するように `Fn(A, B, C) -> Res + Clone` というトレイト境界を定めているところ。

## 疑問 2: なぜ順番を入れ替えても動く？

次は一番謎な引数の順番入れ替えについて。定義で型パラメータが使われているから順番を入れ替えてもコンパイルが通るというのはなんとなくわかるけど、実際に動いてしまうのは謎すぎる。

まわりの Rust に詳しそうな人に聞いてみても言語的にそういう仕組みはなさそう、ということで詳しく調べることにした。最初ヒントになったのは同僚の [@fnwiya](https://twitter.com/fnwiya) から教えてもらった [Extractors](https://actix.rs/docs/extractors/) という仕組み。

ざっくり言えば、さまざまなリクエスト情報（パス情報、クエリ文字列、POST/PUT データ、任意のアプリケーションデータなど）を、表現（例えば POST/PUT データだけでも `Payload (Stream)`, `String`, `Bytes`, `JSON`）含めて自由にアクセスするための枠組み。ほとんどの Web フレームワークではリクエストハンドラの第１引数として `req: Request` が与えられるので、リファレンス片手にネストされた構造をたどって・・・となりがちだけど、ハンドラ関数を定義するだけで欲しいデータにアクセスできるのは魔法みたいな開発体験。

「なぜ順番入れ替えできるの？」→「Extractors 使ってるから ( ｰ`д ｰ ´)ｷﾘｯ」では済まされないので仕組みを見ていくことにする。

### `FromRequest`: リクエスト情報からハンドラ引数の値を抽出する

ハンドラ関数の引数に何でも指定できてしまうかのような雰囲気があるが、もちろん制約はある。それは引数の型はすべて [`FromRequest` トレイト](https://github.com/actix/actix-web/blob/master/src/extract.rs#L13) を実装している必要がある。`FromRequest` トレイトの役割はたったひとつで「型、`HttpRequest`、`Payload` から値を抽出する」。そのための関数が `from_request(req: &HttpRequest, payload: &mut Payload)` である。後述するが、この関数が関連関数として定義されているのが重要である。

例えば本記事冒頭で示した `req: HttpRequest` のみを引数に取るハンドラ関数であれば `from_request()` 関数の引数にまんま `HttpRequest` が含まれているので、そのまま渡せばよさそう、と想像できる。POST/PUT データがさまざまな形態でアクセスできるのも `Payload (Stream)` を加工することで実現している。

### `Extensions`: `TypeId` をキーにした `HashMap`

次に疑問に思うのは任意のアプリケーションデータを受け取れる部分。これは `data()` メソッドで設定した値を `Extensions` という `TypeId` (型に割り振られた一意の ID) をキーにした `HashMap` のデータ構造に保持しておいて、 `HttpRequest` の `get_app_data()` メソッドからアクセスできる。`data()` メソッドはタプル構造体の [`Data<T>`](https://github.com/actix/actix-web/blob/master/src/data.rs#L64) でラップしてから `Extensions` 構造体に値を突っ込むので、 `FromRequest` トレイトが実装されている型は `Data<T>` で、ハンドラ関数の引数として指定できる型は `Data<&str>` とか `Data<MyData>` (ユーザー定義の構造体も OK) のように `Data<T>` に型パラメータを与えたものになる。

これでアプリケーションデータについても `from_request()` 関数で `HttpRequest` から値を抽出することができることがわかった。

### 入れ子: タプルも `FromRequest` トレイトを実装している

ここまでの話で、ハンドラ関数の呼び出しには同じ型で同じ並びのタプルが必要なこと、そして `FromRequest` トレイトによって引数の値をリクエスト情報から抽出できる仕組みを知った。あとはこれらの要素をつないで「引数の順番を入れ替えても動く」ようにする。

以下は [`tuple_from_req!` マクロ](https://github.com/actix/actix-web/blob/master/src/extract.rs#L194) が生成した、３要素タプル `(A, B, C)` への `FromRequest` トレイト実装である。

```rust
impl <A: FromRequest + 'static, B: FromRequest + 'static,
      C: FromRequest + 'static> FromRequest for (A, B, C) {
    type Error = Error;
    type Future = TupleFromRequest3<A, B, C>;
    type Config = (A::Config, B::Config, C::Config);

    fn from_request(req: &HttpRequest, payload: &mut Payload) -> Self::Future {
        TupleFromRequest3{
            items: <(Option<A>, Option<B>, Option<C>)>::default(),
            futs: (A::from_request(req, payload).into_future(),
                   B::from_request(req, payload).into_future(),
                   C::from_request(req, payload).into_future()),
        }
    }
}
```

注目すべきはトレイト境界の `<A: FromRequest + 'static, B: FromRequest + 'static, C: FromRequest + 'static>` で、これは何を意味しているかというとタプルの要素も `FromRequest` トレイトを実装しているという制約である。この制約によってタプルに対して呼び出された `from_request()` 関数が、要素に対して再帰的に `from_request()` 関数を呼び出す形になって、すべての引数が解決される。

もう 1 つ（しれっと書かれてるけど）重要なことは `A::from_request(req, payload).into_future()` という形で型パラメータだったはずの `A` がコード中で使用されている部分。これは `from_request()` が関連関数であることが重要である理由になる。

ここでちょっと「引数の順番」について考えてみると、このコードは型パラメータが使われているので、 `A` や `B` が実際に何であるかは気にしておらず、 `from_request()` を呼び出せることだけが重要になっている。つまり、 **ユーザーが定義したハンドラ関数の引数の個数と型とその並びに一致するタプルに `FromRequest` トレイト実装がコンパイル時にコード生成されることで「引数の順番の入れ替え」を実現していることになる。**

一応最後まで説明すると、 `from_request()` の戻り値である `TupleFromRequest3<A, B, C>` 構造体には `Future` トレイトも実装されていて、 `poll()` メソッドの戻り値の型が `Poll<(A, B, C), Error>` となっていることから、最終的に `(A, B, C)` を得ることができる。

## 疑問 3: 型チェックはどうなってんの？

まるでスクリプト言語という感じだったのでどこまで型チェックが効いているのか俄然興味が湧いてくる。ということでこの柔軟性のトレードオフとなっている型チェックの限界、仕組み上の制限について見ていく。

### 同じ型のアプリケーションデータは複数保持できない

`TypeId` をキーにした `HashMap` のデータ構造という時点でこれはどうしょもない部分。試したところ、 `data("Foo")` と `data("Bar")` を呼び出して、ハンドラを `fn index(str1: web::Data<&str>, str2: web::Data<&str>)` にすると、どちらの引数にも `"Foo"` が入っていた。 `HashMap` の実装的には上書きされる気がしたけど、なぜそうならないのかは深追いしていない。

回避策として `type Hoge = String` みたいなエイリアスだと `TypeId` が同一になって別々のデータとして格納できないので代わりに[New Type イディオム](https://doc.rust-lang.org/rust-by-example/generics/new_types.html)を使えばよい。

### `data()` で格納してない型を引数に取るハンドラ関数でもコンパイル通る

さすがにこれは現状の仕組みだと検出のしようがない。`Data<T>` に実装された `FromRequest` トレイトの `from_request()` 関数で `Extensions` から値を引き出すときに存在しないため `App data is not configured, to configure use App::data()` というエラーが発生する。

でもこれ、 `data()` を呼び出すたびに幽霊型で型を保持していけるなら、実行時のコストはゼロのまま、受け入れるハンドラに制限かけることってできるような気がしないでもない。すんごいすんごい面倒そうだけど。ちなみに OCaml の線形代数ライブラリ [slap](https://github.com/akabe/slap) は、ペアノ数のように次元数を型として表現することで、２つのベクトルが演算可能かどうかコンパイル時にわかるやつがある。コンパイル時チェックは夢もロマンもある。

## サンプルコード

以上の仕組みの理解を深めるために、引数の数や順番を入れ替えてもいい感じに引数を fill して呼び出してくれるやつを作ってみた。仕組みがわかりやすいようにマクロなどは使っていないのと、上記で説明した部分とはかなり異なる部分もあるので注意。あくまで雰囲気を感じてもらえれば。

### ハンドラ定義

```rust
fn handler0() {
    println!("handler[0]");
}

fn handler1(a: &str) {
    println!("handler[1]: {}", a);
}

fn handler1i(a: i32) {
    println!("handler[1i]: {}", a);
}

fn handler2(a: &str, b: i32) {
    println!("handler[2]: {}, {}", a, b);
}

fn handler2s(a: i32, b: &str) {
    println!("handler[2s]: {}, {}", a, b);
}
```

### 呼び出し

`Dispatcher` 構造体を作ってハンドラ関数を格納しておいて、 `run()` メソッドで呼ぶときに引数の代わりに `Extensions` を渡して、ハンドラが必要とするタプルの生成とディスパッチを行う。

`TypeId` をキーにした `HashMap`、今の自分にはハイレベルすぎて詰んだので、`actix-web` から拝借した `Extensions` 実装を使っている。

```rust
fn main() {
    env::set_var("RUST_LOG", "info");
    env_logger::init();

    let mut bag = Extensions::new();
    bag.insert("Universe");
    bag.insert(42);

    let d0 = Dispatcher::new(handler0);
    d0.run(&bag);

    let d1 = Dispatcher::new(handler1);
    d1.run(&bag);

    let d1i = Dispatcher::new(handler1i);
    d1i.run(&bag);

    let d2 = Dispatcher::new(handler2);
    d2.run(&bag);

    let d2s = Dispatcher::new(handler2s);
    d2s.run(&bag);
}
```

ここで `bag.insert(42);` の行をコメントアウトして実行すると、 `Extensions` から取得できずにエラーログを吐いて `panic!` する。

### 実装

わりと長くなったので Github に置くことにした。

[flex_handler](https://github.com/kuy/flex-handler/blob/master/src/main.rs): 柔軟なシグネチャを持つ関数の呼び出しサンプル
