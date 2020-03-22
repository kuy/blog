+++
title = "Yew: Setup development environment"
date = 2020-03-22
draft = false
slug = "setup-yew-dev"
in_search_index = true
template = "page.html"

[taxonomies]
tags = ["rust", "yew", "frontend", "tips"]
categories = ["programming"]
+++

This post is a supplemental note for setting up [Yew](https://yew.rs)'s development environment (not development environment using Yew). Hope this save your time.

<!-- more -->

## RTFM

Do it first: [Contribution Guide](https://github.com/yewstack/yew/blob/master/CONTRIBUTING.md)

## RTFS

Yes, [fabulous script](https://github.com/yewstack/yew/blob/master/examples/build_all.sh).

## Build & Run `stdweb` examples

It's pretty easy. For example, here is an example to run `counter` example of `stdweb` version.

```
cd examples/std_web/counter
cargo web start --target wasm32-unknown-unknown
```

Open `http://localhost:8000` in your browser.

## Build `web-sys` examples

In `web-sys` examples, you need to run separated build commands (`cargo build` and `wasm-bindgen`) because `cargo-web` doesn't support `web-sys` at this time.

```
cd examples/web_sys/counter
cargo build --target wasm32-unknown-unknown
wasm-bindgen --target web --no-typescript --out-dir ../../static/ --out-name wasm ../../target/wasm32-unknown-unknown/debug/counter_web_sys.wasm
```

I got following error on running `wasm-bindgen`.

## ERROR: thread 'main' panicked at 'index out of bounds: the len is 0 but the index is 0', /Users/yourname/.cargo/registry/src/github.com-1ecc6299db9ec823/wasm-bindgen-cli-support-0.2.58/src/descriptor.rs:198:15

Welcome to the main section of this post.

```
thread 'main' panicked at 'index out of bounds: the len is 0 but the index is 0', /Users/yourname/.cargo/registry/src/github.com-1ecc6299db9ec823/wasm-bindgen-cli-support-0.2.58/src/descriptor.rs:198:15
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace.
```

Here is a verbose output.

```
thread 'main' panicked at 'index out of bounds: the len is 0 but the index is 0', /Users/yourname/.cargo/registry/src/github.com-1ecc6299db9ec823/wasm-bindgen-cli-support-0.2.58/src/descriptor.rs:198:15
stack backtrace:
   0: <std::sys_common::backtrace::_print::DisplayBacktrace as core::fmt::Display>::fmt
   1: core::fmt::write
   2: std::io::Write::write_fmt
   3: std::panicking::default_hook::{{closure}}
   4: std::panicking::default_hook
   5: std::panicking::rust_panic_with_hook
   6: rust_begin_unwind
   7: core::panicking::panic_fmt
   8: core::panicking::panic_bounds_check
   9: wasm_bindgen_cli_support::descriptor::Descriptor::_decode
  10: wasm_bindgen_cli_support::descriptor::Descriptor::_decode
  11: wasm_bindgen_cli_support::descriptor::Function::decode
  12: wasm_bindgen_cli_support::descriptor::Descriptor::_decode
  13: wasm_bindgen_cli_support::descriptors::execute
  14: wasm_bindgen_cli_support::Bindgen::generate_output
  15: wasm_bindgen_cli_support::Bindgen::generate
  16: wasm_bindgen::main
  17: std::rt::lang_start::{{closure}}
  18: std::panicking::try::do_call
  19: __rust_maybe_catch_panic
  20: std::rt::lang_start_internal
  21: main
note: Some details are omitted, run with `RUST_BACKTRACE=full` for a verbose backtrace.
```

### Reason: Version mismatch

Yew's `Cargo.toml` has `wasm-bindgen = { version = "0.2.59", optional = true }`. But my `wasm-bindgen-cli` is `0.2.58`.

```
$ wasm-bindgen --version
wasm-bindgen 0.2.58
```

### Update toolchains

Update `wasm-bindgen-cli` to `0.2.59` to match a version used in `Cargo.toml`.

```
cargo install wasm-bindgen-cli --force
```

Most of Rust projects assume you use the latest version of toolchains. I recommend you to also update other toolchains:

- `rustup update stable`
- `cargo install cargo-web --force`

After updates, I confirmed `wasm-bindgen` is `0.2.59` and rebuilt successfully. Note that `wasm-bindgen` outputs nothing on success (according to UNIX philosophy).

## Run `web-sys` examples

All builds were done. Let's run it. To serve local files, I'm using [http-server](https://www.npmjs.com/package/http-server). If you have favorite [one-liners](https://gist.github.com/willurd/5720255), it's okay to use it of course.

```
http-server ../../static -p 9000
```

Open `http://localhost:9000` in your browser.
