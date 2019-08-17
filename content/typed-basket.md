+++
title = "中身を型で表現するコンテナを作ろうとした"
date = 2019-08-17
draft = false
slug = "typed-basket"
in_search_index = true
template = "page.html"

[taxonomies]
tags = ["rust"]
categories = ["programming"]
+++

## 結果

自分には思い通りのものを作ることはできなかった。

## やりたいこと（やりたかったこと）

以下みたいなことを実現したい。

- 型をキーとした `HashMap`
- 値を与えると格納される
- 型を指定することで値を取り出せる
- 保管していない型を指定した場合は **コンパイルエラー** が発生

```rust
let bag = Basket::new();
bag.set("Universe");
bag.set(42);

println!("i32: {}", bag.get::<i32>());   // => "i32: 42"
println!("&str: {}", bag.get::<&str>()); // => "&str: Universe"

// println!("bool: {}", bag.get::<bool>()); => Compile Error!
```

<!-- more -->

こんなことを考えたのは[前回の記事](https://kuy.github.io/flex-handler/)で `actix-web` の `data()` メソッドでデータを設定せずに `web::Data<T>` を引数に持つハンドラを渡してもコンパイルエラーにならず、実行時エラーになるのを何とかできないものか、と思ったから。
根っこの問題としてデータの保管先である `Extensions` が実行時に特定の型が保管されているか判断しているのが良くない。

コンパイル時にエラーを検出するには **状態を型として表現** すればいい。上記のコードで言えば `new()` 直後は何のデータも格納されておらず、1 つ目の `set()` が呼ばれたら `&str` が保管されていて、さらに `set()` が呼ばれると `&str` と `i32` が保管されていることを型として表現する。その型情報の中に `get()` メソッドの呼び出しで渡された型パラメータが含まれているときだけコンパイルが通るようにする。

## 試行錯誤

基本的なアイデアは簡単で、初期状態を `Basket<()>` 、`&str` を格納した状態を `Basket<(&str,)>` 、さらに `i32` を格納した状態を `Basket<(&str, i32)>` という感じで `Basket<T>` の型パラメータを変えて、それぞれの型ごとに呼び出せるメソッドに制限をかければいい。型が変化するのは `set()` メソッドの呼び出し時なので、単純にその時点で格納しているデータを引き継ぎつつ、新しく格納する値の型を含めた新たなコンテナの型で `new()` すればいい。型パラメータを使わないと怒られるので `PhantomData` を使っている。 `HashMap` のデータを引き継ぐ部分は `Drain` を使ってみた。

以下がとりあえず書いたコード。 `panic!` しまくってるけど気にしてはいけない。

```rust
pub struct Basket<T> {
    items: HashMap<TypeId, Box<dyn Any>>,
    _t: PhantomData<T>,
}

impl Basket<()> {
    pub fn new() -> Self {
        Basket {
            items: HashMap::new(),
            _t: PhantomData,
        }
    }

    pub fn set<U: 'static>(mut self, val: U) -> Basket<(U,)> {
        self.items.insert(TypeId::of::<U>(), Box::new(val));
        Basket::<(U,)>::new_with(self.items.drain())
    }
}

impl<A: 'static> Basket<(A,)> {
    fn new_with(iter: Drain<TypeId, Box<dyn Any>>) -> Self {
        Basket {
            items: HashMap::from_iter(iter),
            _t: PhantomData,
        }
    }

    pub fn set<U: 'static>(mut self, val: U) -> Basket<(A, U)> {
        self.items.insert(TypeId::of::<U>(), Box::new(val));
        Basket::<(A, U)>::new_with(self.items.drain())
    }

    pub fn get<U: 'static>(&self) -> &U {
        match self.items.get(&TypeId::of::<U>()) {
            Some(item) => match item.downcast_ref::<U>() {
                Some(item) => item,
                _ => panic!()
            },
            _ => panic!()
        }
    }
}

impl<A: 'static, B: 'static> Basket<(A, B)> {
    fn new_with(iter: Drain<TypeId, Box<dyn Any>>) -> Self {
        Basket {
            items: HashMap::from_iter(iter),
            _t: PhantomData,
        }
    }

    pub fn get<U: 'static>(&self) -> &U {
        match self.items.get(&TypeId::of::<U>()) {
            Some(item) => match item.downcast_ref::<U>() {
                Some(item) => item,
                _ => panic!()
            },
            _ => panic!()
        }
    }
}
```

このコードは一見正しく動いてしまう。

```rust
fn main() {
    let bag = Basket::new()
        .set("Universe")
        .set(42);

    let item = bag.get::<i32>();
    println!("i32: {}", item); // => "i32: 42"

    let item = bag.get::<&str>();
    println!("&str: {}", item); // => "&str: Universe"
}
```

ただ、以下のコードを追加すると肝心のコンパイル時のエラーチェックが効いていないことがわかる。

```rust
let item = bag.get::<bool>();
println!("bool: {}", item); // => Compiled successfully, but PANIC!
```

原因は明らかで、 `get()` メソッドの定義において実装対象である `Basket<(A, B)>` の型パラメータ（`A`, `B`）を使っておらず、新たに導入した型パラメータ `U` にしか依存していないからである。
かといって、 型パラメータ `A` を使うようにすると `U` は不要になるので `get()` メソッド呼び出し時に型パラメータを指定できない。型パラメータの指定ができなければ欲しい値を取り出せない。

```rust
impl<A: 'static, B: 'static> Basket<(A, B)> {
    fn new_with(iter: Drain<TypeId, Box<dyn Any>>) -> Self {
        Basket {
            items: HashMap::from_iter(iter),
            _t: PhantomData,
        }
    }

    pub fn get(&self) -> &A {
        match self.items.get(&TypeId::of::<A>()) {
            Some(item) => match item.downcast_ref::<A>() {
                Some(item) => item,
                _ => panic!()
            },
            _ => panic!()
        }
    }
}
```

ちなみに、以下のコードは定義がコンフリクトしてしまってコンパイルできない。

```rust
impl<A: 'static, B: 'static> Basket<(A, B)> {
    fn new_with(iter: Drain<TypeId, Box<dyn Any>>) -> Self {
        Basket {
            items: HashMap::from_iter(iter),
            _t: PhantomData,
        }
    }

    pub fn get(&self) -> &A {
        match self.items.get(&TypeId::of::<A>()) {
            Some(item) => match item.downcast_ref::<A>() {
                Some(item) => item,
                _ => panic!()
            },
            _ => panic!()
        }
    }

    pub fn get(&self) -> &B { // => Conflict!
        match self.items.get(&TypeId::of::<B>()) {
            Some(item) => match item.downcast_ref::<B>() {
                Some(item) => item,
                _ => panic!()
            },
            _ => panic!()
        }
    }
}
```

理想的にはメソッドに型パラメータ `U` を導入しつつ、 `A` または `B` と型が一致する、みたいな制約をかけることができればありがたいんだけど、そういう書き方は存在しなさそう。

```rust
impl<A: 'static, B: 'static> Basket<(A, B)> {
    fn new_with(iter: Drain<TypeId, Box<dyn Any>>) -> Self {
        Basket {
            items: HashMap::from_iter(iter),
            _t: PhantomData,
        }
    }

    pub fn get<U: 'static>(&self) -> &U where U = A | B { // => Invalid Syntax!
        match self.items.get(&TypeId::of::<U>()) {
            Some(item) => match item.downcast_ref::<U>() {
                Some(item) => item,
                _ => panic!()
            },
            _ => panic!()
        }
    }
}
```

上記で `TypeId::of::<U>` と `TypeId::of::<A>` を比較する方法だと実行時になっちゃうのでダメ。

## ダメっぽい

`get()` メソッドをそのまま実装せず、 `Get` トレイトを定義して associated type を使って制約をかけようとコードをこねくりまわしたり（失敗に終わった）、それらを調べていたら [`Generic Associated Types`](https://github.com/rust-lang/rfcs/blob/master/text/1598-generic_associated_types.md) なるものが unstable では使えて `Associated Type Constructor` の存在を知り、その背後にある [`Higher-Kinded Types`](https://keens.github.io/blog/2016/02/28/rustnohigherkinded_type_trait/) に出会ってしまって数時間潰したりしたけど、結局目的のものを組むことはできなかった。

何か方法があるならぜひ知りたい。
