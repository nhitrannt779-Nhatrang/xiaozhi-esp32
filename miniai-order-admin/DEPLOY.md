# Deploy lên manage.miniai.vn

Cần tài khoản Cloudflare của domain. Khi có quyền, làm đúng 4 bước:

1. Tạo KV tên `ORDERS` và copy namespace id.
2. Thay id đó vào `wrangler.toml`, thay cho `replace-with-orders-kv-id`.
3. Pages → Connect to Git → repo này, build command để trống, output directory `miniai-order-admin`.
4. Gắn custom domain `manage.miniai.vn`. Trong Settings → Functions, binding KV tên `ORDERS`.

Chạy local không cần Cloudflare: `node server.js`, mở `http://127.0.0.1:8787/orders/order`.
