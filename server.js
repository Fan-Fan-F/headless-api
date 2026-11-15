/**
 * headless-api — 零依赖轻量电商 REST API（Node 原生 http 模块）
 * 运行: node server.js  (默认端口 3000，可用 PORT 环境变量覆盖)
 */
"use strict";

const http = require("http");
const { randomUUID } = require("crypto");
const store = require("./store");

const PORT = process.env.PORT || 3000;

/* ---------- 工具 ---------- */
function send(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) reject(new Error("body too large"));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error("invalid JSON body")); }
    });
  });
}

function paginate(list, query) {
  const page = Math.max(1, +query.get("page") || 1);
  const limit = Math.min(50, Math.max(1, +query.get("limit") || 10));
  const start = (page - 1) * limit;
  return {
    data: list.slice(start, start + limit),
    meta: { page, limit, total: list.length, pages: Math.ceil(list.length / limit) },
  };
}

/* ---------- 路由 ---------- */
const routes = [];
function route(method, pattern, handler) {
  // pattern 形如 /api/products/:id
  const keys = [];
  const regex = new RegExp("^" + pattern.replace(/:([a-z]+)/gi, (_, k) => {
    keys.push(k);
    return "([^/]+)";
  }) + "$");
  routes.push({ method, regex, keys, handler });
}

/* ---- 商品 ---- */
route("GET", "/api/products", (req, res, params, query) => {
  let list = store.products.list();
  const q = query.get("q");
  const cat = query.get("category");
  const min = query.get("minPrice"), max = query.get("maxPrice");
  if (q) list = list.filter(p => (p.name + p.brand).toLowerCase().includes(q.toLowerCase()));
  if (cat) list = list.filter(p => p.category === cat);
  if (min) list = list.filter(p => p.price >= +min);
  if (max) list = list.filter(p => p.price <= +max);
  const sort = query.get("sort");
  if (sort === "price_asc") list.sort((a, b) => a.price - b.price);
  if (sort === "price_desc") list.sort((a, b) => b.price - a.price);
  if (sort === "newest") list.sort((a, b) => b.createdAt - a.createdAt);
  send(res, 200, paginate(list, query));
});

route("GET", "/api/products/:id", (req, res, { id }) => {
  const p = store.products.get(id);
  p ? send(res, 200, { data: p }) : send(res, 404, { error: "product not found" });
});

route("POST", "/api/products", async (req, res) => {
  const body = await readBody(req);
  const err = validateProduct(body);
  if (err) return send(res, 422, { error: err });
  const p = store.products.create(body);
  send(res, 201, { data: p });
});

route("PATCH", "/api/products/:id", async (req, res, { id }) => {
  const body = await readBody(req);
  const p = store.products.update(id, body);
  p ? send(res, 200, { data: p }) : send(res, 404, { error: "product not found" });
});

route("DELETE", "/api/products/:id", (req, res, { id }) => {
  store.products.remove(id)
    ? send(res, 200, { data: { deleted: id } })
    : send(res, 404, { error: "product not found" });
});

/* ---- 购物车 ---- */
route("GET", "/api/cart/:cartId", (req, res, { cartId }) => {
  send(res, 200, { data: store.carts.view(cartId) });
});

route("POST", "/api/cart/:cartId/items", async (req, res, { cartId }) => {
  const body = await readBody(req);
  try {
    const cart = store.carts.addItem(cartId, body.productId, body.qty || 1);
    send(res, 200, { data: cart });
  } catch (e) {
    send(res, 422, { error: e.message });
  }
});

route("DELETE", "/api/cart/:cartId/items/:productId", (req, res, { cartId, productId }) => {
  send(res, 200, { data: store.carts.removeItem(cartId, productId) });
});

/* ---- 订单 ---- */
route("POST", "/api/orders", async (req, res) => {
  const body = await readBody(req);
  try {
    const order = store.orders.createFromCart(body.cartId, body.customer || {});
    send(res, 201, { data: order });
  } catch (e) {
    send(res, 422, { error: e.message });
  }
});

route("GET", "/api/orders", (req, res, params, query) => {
  let list = store.orders.list();
  const status = query.get("status");
  if (status) list = list.filter(o => o.status === status);
  send(res, 200, paginate(list, query));
});

route("GET", "/api/orders/:id", (req, res, { id }) => {
  const o = store.orders.get(id);
  o ? send(res, 200, { data: o }) : send(res, 404, { error: "order not found" });
});

route("POST", "/api/orders/:id/transition", async (req, res, { id }) => {
  const body = await readBody(req);
  try {
    const o = store.orders.transition(id, body.to);
    send(res, 200, { data: o });
  } catch (e) {
    send(res, 422, { error: e.message });
  }
});

/* ---- 健康检查 ---- */
route("GET", "/api/health", (req, res) => {
  send(res, 200, { status: "ok", uptime: process.uptime().toFixed(1) + "s" });
});

/* ---------- 校验 ---------- */
function validateProduct(b) {
  if (!b.name || typeof b.name !== "string") return "name is required";
  if (typeof b.price !== "number" || b.price < 0) return "price must be a non-negative number";
  if (b.stock != null && (!Number.isInteger(b.stock) || b.stock < 0)) return "stock must be a non-negative integer";
  return null;
}

/* ---------- 服务器 ---------- */
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});

  const url = new URL(req.url, `http://${req.headers.host}`);
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = url.pathname.match(r.regex);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    try {
      return await r.handler(req, res, params, url.searchParams);
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }
  send(res, 404, { error: "route not found", hint: "see README.md for API docs" });
});

server.listen(PORT, () => {
  console.log(`headless-api listening on http://localhost:${PORT}`);
  console.log(`try: curl http://localhost:${PORT}/api/products`);
});
