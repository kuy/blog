+++
title = "Yew: Setup development environment"
date = 2020-03-22
draft = false
slug = "setup-ywe-dev"
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

## Run `stdweb` examples

It's pretty easy. For example, here is an example to run `counter` example of `stdweb` version.

```
cd examples/std_web/counter
cargo web start --target wasm32-unknown-unknown
```

Open `http://localhost:8000` in your browser.

## Run `web-sys` examples

```
cd examples/web_sys/counter
cargo build --target wasm32-unknown-unknown
wasm-bindgen --target web --no-typescript --out-dir ../../static/ --out-name wasm ../../target/wasm32-unknown-unknown/debug/counter_web_sys.wasm
```

## ERROR: thread 'main' panicked at 'index out of bounds: the len is 0 but the index is 0', /Users/yourname/.cargo/registry/src/github.com-1ecc6299db9ec823/wasm-bindgen-cli-support-0.2.58/src/descriptor.rs:198:15

Welcome to the main section of this post. In my environment, I couldn't create wasm module and got errors:

```
thread 'main' panicked at 'index out of bounds: the len is 0 but the index is 0', /Users/yourname/.cargo/registry/src/github.com-1ecc6299db9ec823/wasm-bindgen-cli-support-0.2.58/src/descriptor.rs:198:15
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace.
```

Here is a verbose report.

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

### Upgrade toolchains

Upgrade all toolchains before starting developing Yew. Don't forget to use `--force` option, which is required to upgrade to latest version.

- `rustup update stable`
- `cargo install cargo-web --force`
- `cargo install wasm-bindgen-cli --force`
