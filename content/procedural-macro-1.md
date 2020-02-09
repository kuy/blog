+++
title = "Procedural MacroでRustライブラリのDXを改善する"
date = 2019-10-01
draft = true
slug = "procedural-macro-1"
in_search_index = true
template = "page.html"

[taxonomies]
tags = ["rust", "macro"]
categories = ["programming"]
+++

## jsonbox-rs

[jsonbox.io](https://jsonbox.io) というCRUD(Create, Read, Update, Delete)操作ができる公開JSONストレージがあります。条件式によるフィルタリングもできるので、個人でAWS Lambda使ってちょこっと何か処理したいとき、わざわざKVSを立ち上げるのもなぁ・・・って場面で重宝します。で、このjsonbox.ioを各種言語から便利に使うためのラッパーが列挙されていたので、自分もその波に乗って Rust版の [jsonbox-rs](https://github.com/kuy/jsonbox-rs) を作ってみました。

## DXが悪い

シンプルなAPIなので実装自体は何も難しい部分はないんですが（ライフタイムの理解の浅さを思い知ったり、Builder Patternの罠、作ってる途中で本家のバグを見つけた以外は）、やはりこういう雑に使えるサービスは雑な言語から雑に使って初めて最高の体験を得られるわけです。その意味でRustは対極にあり、愚直に作ったライブラリのAPIはお世辞にも使いやすいとは言えない仕上がりです。

```rust
// 読み書きに使う構造体
#[derive(Serialize, Deserialize)]
struct Data {
    name: String,
    message: String,
}

// データの書き込み
let data = Data {
    name: "kuy".into(),
    message: "Hello, Jsonbox!".into(),
};

// 書き込まれたデータと、サーバー側で生成したメタデータが返ってくる
let (record, meta) = client.create(&data)?;
println!("CREATE: data={:?}, meta={:?}", record, meta);
```

サーバーからのレスポンスには `id`, `_createdOn`, `_updatedOn` のメタデータが付加されて返ってくるので、APIでは苦し紛れにtupleを使ってデータとメタデータに分けて返しています。JavaScriptとかRubyとかであれば何ら問題ではないんですが、Rustだとあらかじめ読み書き（serialize/deserialize）に使うデータ型を構造体として定義しているため、実行時に勝手にメタデータのフィールドを追加するとかはできないわけです。

そうなると、以下のようにユーザーにあらかじめ所定のメタデータ用フィールドを定義しておいてもらうアイデアもあります。

```rust
// 安直な発想
#[derive(Serialize, Deserialize)]
struct Data {
    name: String,
    message: String,

    id: String,
    _createdOn: String,
    _updatedOn: String,
}
```

とても素直な発想ではあるんですが、ユーザーからすると突然「おまじない」を要求されることになるし、データ書き込みにために作る構造体でメタデータのフィールドをダミーで埋める必要があるので、かなり不自然なコードを書くことになってしまう。

```rust
let data = Data {
    name: "kuy".into(),
    message: "Hello, Jsonbox!".into(),

    id: "what_should_i_put_here_on_create".into(),
    _createdOn: "?".into(),
    _updatedOn: "?".into(),
};
```

ダミーデータを回避するという意味ではメタデータのフィールド定義に Option を使うのも手です。

```rust
// 安直な発想
#[derive(Serialize, Deserialize)]
struct Data {
    name: String,
    message: String,

    id: Option<String>,
    _createdOn: Option<String>,
    _updatedOn: Option<String>,
}
```

無意味なダミーデータの変わりに None を指定できるので多少はマシになりましたが、データ書き込み時には不要なフィールドを意識させられることに変わりないのが玉にキズです。

```rust
let data = Data {
    name: "kuy".into(),
    message: "Hello, Jsonbox!".into(),

    id: None,
    _createdOn: None,
    _updatedOn: None,
};
```

それにメタデータを参照したいときに常に値が存在しているのかチェックするのはだるいですし、こういったAPIデザインによって大量の `unwrap()` が生み出されるのかも、と考えるとできるだけ妥協したくない部分です。

## Procedural Macroという光

そんな感じでわりと絶望していたんですが、Rustにはみんな大好きMacroがあるんですね。みんな大好きMacro。さらにもう少し調べてみるとProcedural Macroという、簡単に言えば `#[derive(Debug)]` みたいにTraitを対象の定義に基づいて自動実装するMacroの仕組みや、さらには対象そのもののASTをいじくって変更するかっこいい仕組みもある。AST受け取ってAST返す関数は無限の可能性を秘めているので、もうこれはやるしかないな、と。

めちゃくちゃ前置きが長くなりましたが、この記事はRustのMacroと戦ってjsonbox-rsのDXを向上させる過程のメモです。

## ファーストトライ

第一歩として、「ユーザは普通の構造体を定義するだけ」という部分をなんとかするために、 `proc_macro_attribute` を使って任意の構造体にメタデータ用フィールドを生やすことができるか試してみた。つまり、

```
#[jsonbox_meta]
struct Data {
    name: String,
    message: String,
}
```

これを展開すると

```
struct Data {
    name: String,
    message: String,
    id: String,
    created_on: String,
    updated_on: String,
}
```

こうなる感じ。一応これを実現するMacro実装は作ることができた。ただ、問題として読み込み用の構造体としてはよいものの、書き込み時には不要なフィールドがあるのでそこをなんとかしたい。

Macroというのは手で書いてコンパイルできるもの以外は生成できないので、最初に手で書いてみることをおすすめします。わたしはどんな言語でもMacroを手にした途端に嬉しくなって無限の可能性を感じてすぐにMacroを書き始めてしまい、手で書けないコードを自動生成しようとして苦しみます。

## セカンドトライ

今解決しようとしていることは、読み込み時と書き込み時で構造が違うが、ユーザには同じように見える、みたいな魔法の実現です。そこで思い付いたのは構造体リテラル記法っぽく見えるMacroを作るやり方。つまり、

```
struct Data {
    name: String,
    id: Option<String>,
    created_on: Option<String>,
    updated_on: Option<String>,
}
```

このような構造体をリテラルで構築する場合、

```
let data = Data {
    name: "OK".into(),
    id: None,
    created_on: None,
    updated_on: None,
};
```

こんな風に書く必要があるけど、

```
macro_rules! Data {
    ($id:ident: $expr:expr,) => {
        Data {
            $id: $expr,
            id: None,
            created_on: None,
            updated_on: None,
        }
    };
}
```

`Data` というMacroを定義しておくと、

```
let data = Data! {
    name: "OK".into(),
};
```

こんな風にメタデータフィールドの追加はMacroに任せて、ユーザには見えなくできる。

で、実際にMacroを組む前に手書きでコードを書いて、想定通り動くことを確認した。

### が、・・・

`error[E0658]: procedural macros cannot expand to macro definitions` というエラーによって阻まれました。Procedural Macroはmacro_rulesを使えない・・・だと！？

ただ、いろいろ調べていて行き着いた先の [Tracking issue for procedural macros and "hygiene 2.0"](https://github.com/rust-lang/rust/issues/54727) というissueを見ていたら、これまで [proc-macro-hack](https://github.com/dtolnay/proc-macro-hack) で対処していた[macro展開できる場所の制約の緩和](https://github.com/rust-lang/rust/issues/54727#issuecomment-525090471)と同時に、[macroからmacro_rules!を生成できない制限](https://github.com/rust-lang/rust/issues/54727#issuecomment-526826620)も緩和される流れになってた。

すごいタイミングで[stabilize](https://github.com/rust-lang/rust/pull/64035#issuecomment-533890826)されて[PR](https://github.com/rust-lang/rust/pull/64035)が出てる。上記の[エラーを出していたコードも削除](https://github.com/rust-lang/rust/pull/64035/files#diff-7fde1475846894e59317d75947bdb921L741-L747)されている。

いずれ取り込まれた暁にはこの方法が可能になるかもしれない。

## サードトライ

構造体のフィールドを生やすのではなく、メソッドを生やせばよいのでは、と思って試してみた。つまり、

```
#[jsonbox_meta]
struct Data {
    name: String,
    message: String,
}
```

これが

```
struct Data {
    name: String,
    message: String,
    meta: Option<Meta>,
}

impl Data {
    fn created_on(&self) -> String {
        match &self.meta {
            Some(meta) => meta.created_on.clone(),
            None => "".to_string(),
        }
    }
    
    // ...
}
```

みたいに展開されて、

```
println!(
    "data={}, created_on={}",
    data.name,
    data.created_on()
);
```

のように呼び出せる。

ただまぁ、メソッド呼び出しかぁ・・・というのが残念。

## Deref使っちゃうか

proc_macroまわりを調べる中で `readonly` というおもしろMacroを発見した。Deref を ~~悪用して~~ 活用して「同一モジュール内からであれば読み書きできるが、モジュール外からだと読むことしかできない構造体のフィールド」を実現する魔法のようなMacro。

このreadonlyは開発過程の丁寧な解説 ["Read-only fields of mutable struct"](https://github.com/dtolnay/case-studies/blob/master/readonly-fields/README.md) が作者のリポジトリにあって（というかこの [dtolnay/case-studies](https://github.com/dtolnay/case-studies/) というリポジトリは知見で溢れてて鼻血出そう）、それによると Deref の挙動として `.` によるフィールドアクセスでは対象の型にフィールドが存在しない場合は Deref 実装の方を見る。これはBoxみたいなスマートポインタには重要な挙動。

これを見て思い付いたのは、

```
struct Data {
    name: String,
    meta: Option<Meta>,
}

struct Meta {
    id: String,
    created_on: String,
    updated_on: String,
}
```

こんな風にメタデータ `Meta` を格納する `meta` フィールドを定義しておいて、通常であれば `data.meta.created_on` みたいにしかアクセスできないところを、 Deref を使えば `data.created_on` のようにアクセスできるのでは、と。

```
println!(
    "data={}, id={}, created_on={}, updated_on={}",
    data.name,
    data.id,
    data.created_on,
    data.updated_on
);
```

