# 04 后端 API 说明

## 1. 通用约定

- API 根路径：`/api`
- 请求和响应：JSON，二维码接口除外。
- 请求体限制：1 MiB。
- 时间：服务端使用 `Date.toISOString()`，即 UTC ISO 8601 字符串。
- 金额：JSON 中使用两位小数的数字，不是整数分。
- 写请求：`POST`、`PUT`、`PATCH`、`DELETE` 经过进程内 FIFO 队列。
- 未知 API：返回 `404` 和请求方法/路径。
- 未捕获错误：返回 `500`。当前实现会把错误消息放入 `detail`，生产环境需谨慎。

## 2. 认证头

### 2.1 顾客会话

```http
X-Zone-Session: <sessionToken>
```

由 `POST /api/public/session/open` 签发，用于购物车、提交订单和查看订单。会话只对创建它的区域有效。

### 2.2 员工会话

```http
X-Employee-Session: <employeeToken>
```

由 `POST /api/employee/auth/login` 签发。除登录外，所有 `/api/employee/*` 路由都需要它；部分 `/api/admin/orders*` 路由也需要它。

### 2.3 管理接口现实

菜单、分类、区域、二维码、员工管理、历史和日结接口目前没有管理员认证中间件。不能因为路径名包含 `/admin/` 就认为它已经受保护。

## 3. 基础接口

| 方法与路径 | 认证 | 作用 |
| --- | --- | --- |
| `GET /api/health` | 无 | 返回服务状态、UTC 时间、数据库类型和写队列状态 |

健康检查只证明 Node 进程能响应且已经打开 SQLite，不证明完整业务、外部域名、打印机或备份正常。

## 4. 顾客接口

| 方法与路径 | 认证 | 关键输入 | 作用 |
| --- | --- | --- | --- |
| `POST /api/public/session/open` | 二维码 token | `token`、`customerName`；`accessCode` 仅为后端遗留兼容输入 | 验证开台并创建顾客会话 |
| `GET /api/public/context/:token` | 可匿名；携带 session 可恢复购物车 | 路径 token | 返回场所、区域、菜单、分类、开台状态和当前会话 |
| `GET /api/public/cart/:token` | 顾客 session | 路径 token | 读取个人购物车和同区域实时购物车 |
| `POST /api/public/cart/:token/items` | 顾客 session | `menuId`、`delta`（仅 `1` 或 `-1`） | 增减个人购物车项目 |
| `PUT /api/public/cart/:token/note` | 顾客 session | `note` | 保存个人订单备注，最多 240 字符 |
| `POST /api/public/orders` | 顾客 session | `token`、可选 `items`、可选 `note` | 服务端重算并创建订单 |
| `GET /api/public/orders/:token` | 顾客 session | 路径 token | 查看当前访问周期内该区域活动和已归档订单 |

### 4.1 打开顾客会话示例

```json
{
  "token": "qr-zone-token",
  "customerName": "Alex"
}
```

成功响应包含 `sessionToken`、`sessionId`、`expiresAt`、区域信息、个人购物车和本区域实时购物车。

常见错误码：

- `ZONE_NOT_OPEN`：员工尚未开台；
- `ACCESS_CODE_INVALID`：仅遗留配置误开时可能返回；目标部署必须关闭该校验；
- `SESSION_REQUIRED`：session 缺失、无效、过期或被撤销；
- `404`：二维码 token 不存在。

### 4.2 创建订单示例

```json
{
  "token": "qr-zone-token",
  "items": [
    { "menuId": "menu-id", "quantity": 2 }
  ],
  "note": "Less ice"
}
```

价格、名称和可用状态全部从服务端菜单重新读取。客户端即使伪造价格字段也不会被采用。

## 5. 菜单与分类管理接口

以下接口当前均无认证。

| 方法与路径 | 关键输入 | 作用 |
| --- | --- | --- |
| `GET /api/admin/menu` | 无 | 返回全部菜单、分类和场所名 |
| `PUT /api/admin/menu` | `menu` 数组 | 整体规范化并保存菜单 |
| `GET /api/admin/categories` | 无 | 返回分类列表 |
| `POST /api/admin/categories` | `name` | 新建分类 |
| `PATCH /api/admin/categories/reorder` | 分类 ID 顺序 | 更新分类排序 |
| `PATCH /api/admin/categories/:id` | `name` | 分类改名，并同步菜单分类名 |
| `POST /api/admin/menu/import-text` | 导入文本 | 解析并追加菜单项 |
| `DELETE /api/admin/categories/:id` | 路径 ID | 删除分类；有引用时按服务端规则处理 |

菜单整体保存属于覆盖式管理操作，调用方应先读取当前列表，避免用不完整数组意外丢失数据。

## 6. 区域/二维码管理接口

以下接口当前均无认证。

| 方法与路径 | 关键输入 | 作用 |
| --- | --- | --- |
| `GET /api/admin/zones` | 无 | 返回区域、活动订单统计、结算状态和二维码 URL；响应仍可能带 Access Code 兼容字段，目标前端不得展示 |
| `POST /api/admin/zones` | `label` | 新建区域及 token；后端仍可能填充 Access Code 兼容字段 |
| `PUT /api/admin/zones/:id` | `label` | 修改显示标签，不更换 token |
| `POST /api/admin/zones/:id/regenerate` | 无 | 更换二维码 token，使旧二维码失效 |
| `PATCH /api/admin/zones/:id/completion` | `completed` | 修改完成标记 |
| `POST /api/admin/zones/:id/checkout` | 无 | 按结算守卫归档并清空区域 |
| `POST /api/admin/zones/:id/access-code/rotate` | 无 | 遗留兼容接口；目标前端不得展示或调用，本次不删除后端接口 |
| `DELETE /api/admin/zones/:id` | 无 | 删除区域及受外键级联影响的数据 |
| `GET /api/admin/zones/:id/qrcode` | `format=png\|svg`、`size` | 动态生成二维码图片 |

二维码尺寸被限制在 180 至 800 像素。二维码内容使用 `PUBLIC_BASE_URL`，若配置错误，生成的二维码也会指向错误地址。

Access Code 已从产品流程退役。数据库字段和上述兼容接口保持原样，是因为本次禁止数据库及后端清理；实际部署必须设置 `ZONE_ACCESS_CODE_REQUIRED=false` 和 `ROTATE_ACCESS_CODE_ON_CHECKOUT=false`。

## 7. 员工账号接口

| 方法与路径 | 认证 | 作用 |
| --- | --- | --- |
| `GET /api/admin/employees` | 当前无认证 | 列出有效员工，不返回密码哈希 |
| `POST /api/admin/employees` | 当前无认证 | 新增员工 |
| `PATCH /api/admin/employees/:id` | 当前无认证 | 修改姓名、用户名和可选密码 |
| `DELETE /api/admin/employees/:id` | 当前无认证 | 删除员工、撤销 session；若删空会重建默认员工 |
| `POST /api/employee/auth/login` | 用户名/密码 | 登录并签发员工 session |
| `POST /api/employee/auth/logout` | 员工 session | 撤销当前 session |
| `GET /api/employee/auth/me` | 员工 session | 返回当前员工和过期时间 |

## 8. 员工订单接口

下列接口都需要员工 session。

| 方法与路径 | 关键输入 | 作用 |
| --- | --- | --- |
| `GET /api/employee/menu` | 无 | 返回上架菜单和分类 |
| `GET /api/employee/write-queue` | 无 | 返回写队列积压与处理统计 |
| `GET /api/employee/orders` | 可选 `status` | 返回活动订单和允许状态 |
| `PATCH /api/employee/orders/:id` | `status` | 修改订单状态并记录处理员工 |
| `PATCH /api/employee/orders/:orderId/items/:itemId/served` | `served` | 标记单项已送/未送 |
| `PATCH /api/employee/orders/:orderId/items/:itemId/quantity` | `delta`（`1` 或 `-1`） | 调整未送菜品数量并重算总额 |
| `POST /api/employee/orders/:orderId/items` | `menuId` | 给可编辑订单加上架菜品 |

兼容 Web 接单端的别名接口：

| 方法与路径 | 认证 | 作用 |
| --- | --- | --- |
| `GET /api/admin/orders` | 员工 session | 与员工订单列表相同 |
| `PATCH /api/admin/orders/:id` | 员工 session | 与员工状态修改相同 |

后端没有限制状态只能顺序流转；调用方可以把任何订单直接改为允许集合中的任意状态。取消操作会把金额清零。

## 9. 开台、结算与结单接口

以下均需要员工 session。

| 方法与路径 | 关键输入 | 作用 |
| --- | --- | --- |
| `GET /api/employee/zones` | 无 | 返回区域及活动订单/结算摘要 |
| `GET /api/employee/zones/:id/customer-settlements` | 无 | 返回会话顾客、结算标记和能否结单 |
| `POST /api/employee/zones/:id/open-session` | 无 | 开台或返回已开台状态 |
| `PATCH /api/employee/zones/:id/billing-mode` | `billingMode` | 设为 `split` 或 `merged` |
| `PATCH /api/employee/zones/:id/customer-settlements` | `customerName`、`settled` | 修改个人结算标记 |
| `POST /api/employee/zones/:id/checkout` | 无 | 验证后归档、清空并关台 |

结算状态响应的关键字段：

```json
{
  "periodStartAt": "2026-01-01T00:00:00.000Z",
  "customerNames": ["Alex", "Sam"],
  "unsettledCustomerNames": ["Sam"],
  "billingMode": "split",
  "sessionOpen": true,
  "canCheckout": false
}
```

## 10. 小票与打印任务接口

以下均需要员工 session。

| 方法与路径 | 关键输入 | 作用 |
| --- | --- | --- |
| `GET /api/employee/zones/:id/receipt` | 查询参数 `customerName` | 预览/生成小票 JSON，不创建任务 |
| `POST /api/employee/zones/:id/receipt/print` | `customerName` | 生成小票并建立 `pending` 打印任务 |
| `POST /api/employee/print-jobs/claim` | `workerId` | 领取最早的待打印任务 |
| `PATCH /api/employee/print-jobs/:id` | `workerId`、`status`、`errorMessage` | 把已领取任务结束为 `completed` 或 `failed` |

领取和完成任务时都校验 worker ID，避免其他客户端错误完成不属于自己的任务。

## 11. 历史与报表接口

以下接口当前无认证。

| 方法与路径 | 关键输入 | 作用 |
| --- | --- | --- |
| `GET /api/admin/orders/history` | 可选 `limit`，1 至 2000 | 返回最新归档订单 |
| `GET /api/admin/orders/by-day` | `date=YYYY-MM-DD`、`tzOffsetMinutes` | 合并活动/历史数据并返回日结汇总 |

日结时区由客户端传入偏移量，不是固定 EST/EDT 时区规则。若客户端偏移错误，日期边界也会错误。

## 12. 员工 Android 历史接口强制边界（目标约束）

员工 Android 历史功能尚未实施，但后续接口必须遵守[员工 Android 重构强制约束](00_MANDATORY_CONSTRAINTS.md)：

- 只允许在 HTTP 路由层增加经过 `X-Employee-Session` 验证的只读适配；
- 必须复用现有历史读取能力，不新增或修改 SQL；
- 不修改表、字段、索引、迁移、归档逻辑和数据库写入；
- 不允许 Android 正式实现直接调用当前未鉴权的 `/api/admin/orders/history`；
- 必须提供可连续读取到结束的分页语义，不能沿用最多 2000 条后宣称历史完整；
- 读取历史不得进入写队列，不得触发订单、结算、打印、会话或清台变更。

目标契约：

```http
GET /api/employee/orders/history?cursor=<opaque>&limit=30&zoneId=<id>&date=YYYY-MM-DD&customerName=<name>&tzOffsetMinutes=<offset>
X-Employee-Session: <employeeToken>
```

```json
{
  "history": [],
  "nextCursor": null,
  "hasMore": false
}
```

强制语义：

- `history` 的分页单位是完整结单批次，不是会把同一批次拆散的原始订单行；
- 先对完整批次集合应用筛选，再按 `checkoutAt` 与稳定 `batchKey` 倒序分页；
- 顾客姓名命中某批次后返回该批次全部顾客和订单，避免金额变成局部小计；
- `nextCursor` 是不透明游标，客户端不得自行解析或生成；
- 只有 `hasMore=false` 才表示加载到底；
- Android 追加分页时按 `batchKey` 和订单 ID 去重，筛选改变时必须丢弃旧 cursor 并重新加载。
