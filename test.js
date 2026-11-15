/**
 * 冒烟测试：启动服务器后运行  node test.js
 */
"use strict";

const BASE = process.env.BASE || "http://localhost:3000";
let passed = 0, failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

(async () => {
  console.log("smoke tests against", BASE);

  let productId, orderId;

  await check("GET /api/health", async () => {
    const r = await api("GET", "/api/health");
    assert(r.status === 200 && r.json.status === "ok", "health failed");
  });

  await check("GET /api/products 分页", async () => {
    const r = await api("GET", "/api/products?page=1&limit=3");
    assert(r.status === 200 && r.json.data.length === 3 && r.json.meta.total >= 6, "pagination wrong");
  });

  await check("搜索 & 筛选", async () => {
    const r = await api("GET", "/api/products?category=数码&sort=price_asc");
    assert(r.json.data.every(p => p.category === "数码"), "filter wrong");
    const prices = r.json.data.map(p => p.price);
    assert(JSON.stringify(prices) === JSON.stringify([...prices].sort((a, b) => a - b)), "sort wrong");
  });

  await check("POST 创建商品 + 校验", async () => {
    const bad = await api("POST", "/api/products", { price: -1 });
    assert(bad.status === 422, "should reject invalid");
    const r = await api("POST", "/api/products", { name: "测试商品", price: 9.9, stock: 5 });
    assert(r.status === 201, "create failed");
    productId = r.json.data.id;
  });

  await check("PATCH 更新商品", async () => {
    const r = await api("PATCH", `/api/products/${productId}`, { price: 19.9 });
    assert(r.json.data.price === 19.9, "update failed");
  });

  await check("加购 -> 下单 -> 状态机", async () => {
    await api("POST", "/api/cart/c1/items", { productId, qty: 2 });
    const cart = (await api("GET", "/api/cart/c1")).json.data;
    assert(cart.total === 39.8, `cart total wrong: ${cart.total}`);

    const order = (await api("POST", "/api/orders", { cartId: "c1", customer: { name: "测试" } })).json.data;
    orderId = order.id;
    assert(order.status === "pending", "order should be pending");

    const bad = await api("POST", `/api/orders/${orderId}/transition`, { to: "delivered" });
    assert(bad.status === 422, "illegal transition should fail");

    const paid = (await api("POST", `/api/orders/${orderId}/transition`, { to: "paid" })).json.data;
    assert(paid.status === "paid", "should be paid");
  });

  await check("退款回补库存", async () => {
    const before = (await api("GET", `/api/products/${productId}`)).json.data.stock;
    await api("POST", `/api/orders/${orderId}/transition`, { to: "refunded" });
    const after = (await api("GET", `/api/products/${productId}`)).json.data.stock;
    assert(after === before + 2, "stock not restored");
  });

  await check("DELETE 商品", async () => {
    const r = await api("DELETE", `/api/products/${productId}`);
    assert(r.status === 200, "delete failed");
    const gone = await api("GET", `/api/products/${productId}`);
    assert(gone.status === 404, "should be gone");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
