/**
 * 内存数据层：商品 / 购物车 / 订单（含订单状态机）
 */
"use strict";

const { randomUUID } = require("crypto");

/* ---------- 商品 ---------- */
const seedProducts = [
  { name: "极简陶瓷马克杯", brand: "MUYU", category: "家居", price: 49, stock: 120 },
  { name: "机械键盘 87 键", brand: "KEYFORGE", category: "数码", price: 329, stock: 45 },
  { name: "降噪头戴耳机", brand: "SOUNDPOD", category: "数码", price: 599, stock: 30 },
  { name: "冷萃咖啡壶", brand: "BREWLAB", category: "家居", price: 139, stock: 60 },
  { name: "瑜伽垫加厚 8mm", brand: "ZENFLOW", category: "运动", price: 99, stock: 200 },
  { name: "连帽卫衣", brand: "URBAN", category: "服饰", price: 159, stock: 80 },
].map(p => ({ id: randomUUID(), createdAt: Date.now(), ...p }));

const products = {
  list: () => seedProducts,
  get: (id) => seedProducts.find(p => p.id === id),
  create(data) {
    const p = {
      id: randomUUID(),
      createdAt: Date.now(),
      brand: data.brand || "",
      category: data.category || "默认",
      stock: data.stock ?? 0,
      ...data,
    };
    seedProducts.push(p);
    return p;
  },
  update(id, data) {
    const p = this.get(id);
    if (!p) return null;
    Object.assign(p, data, { id: p.id, createdAt: p.createdAt });
    return p;
  },
  remove(id) {
    const i = seedProducts.findIndex(p => p.id === id);
    if (i < 0) return false;
    seedProducts.splice(i, 1);
    return true;
  },
};

/* ---------- 购物车 ---------- */
const cartMap = new Map(); // cartId -> { productId: qty }

const carts = {
  view(cartId) {
    const items = cartMap.get(cartId) || {};
    const lines = Object.entries(items).map(([productId, qty]) => {
      const p = products.get(productId);
      return p ? { product: p, qty, subtotal: +(p.price * qty).toFixed(2) } : null;
    }).filter(Boolean);
    return {
      id: cartId,
      items: lines,
      total: +lines.reduce((s, l) => s + l.subtotal, 0).toFixed(2),
    };
  },
  addItem(cartId, productId, qty) {
    const p = products.get(productId);
    if (!p) throw new Error("product not found");
    if (!Number.isInteger(qty) || qty <= 0) throw new Error("qty must be a positive integer");
    const items = cartMap.get(cartId) || {};
    const next = (items[productId] || 0) + qty;
    if (next > p.stock) throw new Error(`insufficient stock (have ${p.stock})`);
    items[productId] = next;
    cartMap.set(cartId, items);
    return this.view(cartId);
  },
  removeItem(cartId, productId) {
    const items = cartMap.get(cartId) || {};
    delete items[productId];
    cartMap.set(cartId, items);
    return this.view(cartId);
  },
  clear(cartId) { cartMap.delete(cartId); },
};

/* ---------- 订单（状态机） ---------- */
const STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled", "refunded"];
const TRANSITIONS = {
  pending:   ["paid", "cancelled"],
  paid:      ["shipped", "refunded"],
  shipped:   ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded:  [],
};

const orderList = [];

const orders = {
  list: () => orderList,
  get: (id) => orderList.find(o => o.id === id),

  createFromCart(cartId, customer) {
    if (!cartId) throw new Error("cartId is required");
    const cart = carts.view(cartId);
    if (!cart.items.length) throw new Error("cart is empty");

    // 扣减库存
    for (const line of cart.items) {
      if (line.qty > line.product.stock) {
        throw new Error(`insufficient stock for ${line.product.name}`);
      }
    }
    cart.items.forEach(line => { line.product.stock -= line.qty; });

    const order = {
      id: randomUUID(),
      no: "HD" + Date.now(),
      items: cart.items.map(l => ({
        productId: l.product.id, name: l.product.name,
        price: l.product.price, qty: l.qty, subtotal: l.subtotal,
      })),
      total: cart.total,
      customer: { name: customer.name || "匿名", phone: customer.phone || "" },
      status: "pending",
      history: [{ from: null, to: "pending", at: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
    };
    orderList.push(order);
    carts.clear(cartId);
    return order;
  },

  transition(id, to) {
    const o = this.get(id);
    if (!o) throw new Error("order not found");
    if (!STATUSES.includes(to)) throw new Error(`unknown status: ${to}`);
    const allowed = TRANSITIONS[o.status];
    if (!allowed.includes(to)) {
      throw new Error(`cannot transition ${o.status} -> ${to} (allowed: ${allowed.join(", ") || "none"})`);
    }
    // 取消/退款回补库存
    if (to === "cancelled" || to === "refunded") {
      o.items.forEach(it => {
        const p = products.get(it.productId);
        if (p) p.stock += it.qty;
      });
    }
    o.history.push({ from: o.status, to, at: new Date().toISOString() });
    o.status = to;
    return o;
  },
};

module.exports = { products, carts, orders, STATUSES, TRANSITIONS };
