+++
title = "dieselで条件に基づいたクエリを構築する"
date = 2020-02-11
draft = false
slug = "build-conditional-query"
in_search_index = true
template = "page.html"

[taxonomies]
tags = ["rust", "actix-web", "diesel", "sql"]
categories = ["programming"]
+++

[diesel](https://github.com/diesel-rs/diesel) 小ネタ。

参考: [https://github.com/diesel-rs/diesel/issues/455](https://github.com/diesel-rs/diesel/issues/455)

## やりたいこと

数字の ID でも文字列の slug でも１つの関数で検索できるようにしたい。

```rust
pub enum IdOrSlug {
    Id(i32),
    Slug(String),
}

// ...

pub fn find(..., id: IdOrSlug) -> Result<Article> {
    let query = articles::table.left_join(categories::table);
    let query = match id {
        IdOrSlug::Id(id) => query.filter(articles::id.eq(id)),
        IdOrSlug::Slug(slug) => query.filter(articles::slug.eq(slug.as_str())),
    };

    // ...
```

## ダメっぽい

`.filter()` をかますと引数の型が戻り値の型に埋め込まれるようで、 incompatible だと怒られる。

```
match arms have incompatible types

expected struct `schema::articles::columns::id`, found struct `schema::articles::columns::slug`

note: expected type `diesel::query_builder::SelectStatement<_, _, _, diesel::query_builder::where_clause::WhereClause<diesel::expression::operators::Eq<schema::articles::columns::id, diesel::expression::bound::Bound<diesel::sql_types::Integer, i32>>>>`
       found struct `diesel::query_builder::SelectStatement<_, _, _, diesel::query_builder::where_clause::WhereClause<diesel::expression::operators::Eq<schema::articles::columns::slug, diesel::expression::bound::Bound<diesel::sql_types::Text, &str>>>>`
```

<!-- more -->

## 解決方法

`.filter()` の呼び出しのあとに `into_boxed()` を使って Box する。

```rust
// ...

pub fn find(..., id: IdOrSlug) -> Result<ViewProduct> {
    let query = articles::table.left_join(categories::table);
    let query = match id {
        IdOrSlug::Id(id) => query.filter(articles::id.eq(id)).into_boxed(),
        IdOrSlug::Slug(slug) => query.filter(articles::slug.eq(slug.as_str())).into_boxed(),
    };

    // ...
```

## 未解決

最初は条件部分だけ切り出してやろうとしたんだけど、こっちは何か方法が無いんだろうか。

```rust
// ...

pub fn find(..., id: IdOrSlug) -> Result<Article> {
    let cond = match id {
        IdOrSlug::Id(id) => articles::id.eq(id),
        IdOrSlug::Slug(slug) => articles::slug.eq(slug.as_str()),
    };
    match articles::table.left_join(categories::table).filter(cond)... {
        // ...
    }

    // ...
```
