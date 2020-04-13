+++
title = "社内システム向けにSAML用認証プロキシをFargateで立ててVPNを撲滅する話"
date = 2020-04-13
draft = false
slug = "saml-proxy"
in_search_index = true
template = "page.html"

[taxonomies]
tags = ["saml", "sso", "node-js", "fargate", "docker", "aws"]
categories = ["programming"]
+++

## 経緯

Work from Home への対応を進める中で、部署によっては社内システムへのアクセスで VPN が必須になっている。でも、VPN 経由だと回線は細くなるので接続しっぱなしで作業するのはつらいことが多い。もちろんエンジニアであれば特定の IP だけ VPN 経由に、とかそういう設定もできるけど、みんなが手軽にできるわけでもない。それに、最近は [Zero Trust Network](https://www.wikiwand.com/en/Zero_Trust) みたいな考え方も出てきているし、社内システムを G Suite の Google アカウントで SSO できるように対応できればセキュリティも強化されるし VPN 不要になってみんなハッピー！と思った。

とはいえ、社内システムは他システムからの依存もあり、あんまり適当に認証まわりをいじりたくない。そこで、社内システム自体はそのままにして、SAML 対応の認証プロキシを別ドメインで立てるという構想に至った。

<!-- more -->

### 訂正: 2020/04/13 03:19:35

最初「社内システム向けに SAML 用認証プロキシを Fargate で立てて VPN を撲滅した話」というタイトルにしてたけど、現段階ではまだ撲滅できていない。歴史的経緯で複数のドメインがあり、ひとまず自分の管理権限でカスタム SAML アプリケーションを追加できる組織だけ SSO できる状態にした。他組織に展開するのは明日以降になる。

## 全体イメージ

![system-overview](/img/saml-system-overview.png)

## サンプルコード

[https://github.com/kuy/saml-proxy](https://github.com/kuy/saml-proxy)

## 構成

- SAML 認証とプロキシは Node.js で作る（手軽！）
- Docker で固めて Fargate で運用（メンテフリー！）

## セットアップ

力尽きたのであとで書く。

この記事がかなり参考になった。 [https://artsnet.jp/archives/gsuite_sso_private_gitbook/](https://artsnet.jp/archives/gsuite_sso_private_gitbook/)

## ハマりポイント

- private subnet で作るとヘルスチェックがおかしい
- public subnet で作るときは Public IP を有効にしないと ECR からイメージを pull できない
- AWS CLI だけで作るにはかなり慣れが必要

## 今後の改善

- ECS 側の外部 IP を固定化する
  - private subnet で Task を立ち上げて NAT Gateway を経由させればいけそう
- AWS CLI で完全に構築できるようにしたい
