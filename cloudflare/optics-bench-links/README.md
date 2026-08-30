# Optics Bench short links

Optics Benchの`#ob1=`共有データだけをCloudflare Workers KVへ保存し、短いURLから公開版へ戻す専用Worker。
任意URLを登録できる一般的な短縮サービスにはしない。

## API

- `POST /api/links` — `{ "hash": "#ob1=..." }`を登録し、`{ "url", "slug", "created" }`を返す。
- `GET /<slug>` — `https://skanai0123.github.io/optics-bench/#ob1=...`へ302リダイレクトする。
- `GET /` — ヘルス応答。

登録元は本番サイト、`localhost`／ループバック、ローカルファイルの`Origin: null`だけをCORSで許可する。保存できる値は正規base64urlのgzipで始まる`ob1`データに限定する。`LINK_LIMITER`を設定した環境では同一送信元あたり30回／分のRate Limiting bindingを通す。CORSは認証ではないため、費用上限とWorkersログもCloudflare側で監視する。

同じ共有データはSHA-256から決める同じ12文字IDへ集約する。万一別データと衝突した場合は16、20、32、43文字へ伸ばす。KVには圧縮済みpayloadだけを保存し、任意の転送先や秘密情報は保存しない。リンクは明示的に削除するまで期限なし。

## デプロイ

Cloudflareの公式Wranglerを使用する。

```powershell
cd cloudflare/optics-bench-links
npx wrangler@latest login
npx wrangler@latest deploy
```

本番Workerは`https://optics-bench-links.shun-kanai-a7.workers.dev`、KV namespaceは`optics-bench-links`。`wrangler.jsonc`には本番KVのIDを記録済みで、`LINK_LIMITER`を含めてWranglerから再現できる。2026-08-30時点のDashboard初回デプロイはKV bindingだけを接続しており、Rate Limiting bindingは未接続。Worker側はbindingがない場合も動作する。

- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Workers KV bindings](https://developers.cloudflare.com/kv/concepts/kv-bindings/)
- [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
