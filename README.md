# headless-api · 轻量电商 REST API

零依赖（仅用 Node 内置 `http` 模块）的 Headless 电商后端，
覆盖商品、购物车、订单全链路，约 300 行代码，适合教学与二次开发。

## 快速开始

```bash
node server.js        # 启动，默认 3000 端口
node test.js          # 另开终端，跑冒烟测试（10 个断言）
```

## API 一览

### 商品
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/products` | 列表，支持 `q` `category` `minPrice` `maxPrice` `sort` `page` `limit` |
| GET | `/api/products/:id` | 详情 |
| POST | `/api/products` | 创建（带字段校验） |
| PATCH | `/api/products/:id` | 更新 |
| DELETE | `/api/products/:id` | 删除 |

### 购物车
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/cart/:cartId` | 查看（含小计/总计） |
| POST | `/api/cart/:cartId/items` | 加购 `{productId, qty}`，校验库存 |
| DELETE | `/api/cart/:cartId/items/:productId` | 移除 |

### 订单
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/orders` | 从购物车下单 `{cartId, customer}`，自动扣库存 |
| GET | `/api/orders` / `/:id` | 查询（支持 `status` 筛选） |
| POST | `/api/orders/:id/transition` | 状态流转 `{to}` |

**订单状态机**：`pending → paid → shipped → delivered`，`paid/shipped/delivered → refunded`，
`pending → cancelled`；非法流转返回 422，取消/退款自动回补库存，全程记录 history。

## 示例

```bash
# 加购并下单
curl -X POST localhost:3000/api/cart/c1/items -H "Content-Type: application/json" \
  -d '{"productId":"<id>","qty":1}'
curl -X POST localhost:3000/api/orders -H "Content-Type: application/json" \
  -d '{"cartId":"c1","customer":{"name":"张三"}}'
```

## 设计参考

参考了 medusa / saleor 的资源建模与 vendure 的订单状态机思想，用 Node 零依赖方式重新实现。

## License

MIT
