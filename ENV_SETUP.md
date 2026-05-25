# `.env` 使用说明（本地 + AWS）

`.env` 文件位置：
- `/Users/michaelzhu/Desktop/order_system/.env`

## 1) 本地内网运行
1. 复制模板：
   - `cp .env.local.example .env`
2. 把 `PUBLIC_BASE_URL` 改成本机在 Wi-Fi 局域网里的地址（例如 `http://192.168.1.50:3000`）。
3. 启动：
   - `npm start`

## 2) AWS 公网运行
1. 复制模板：
   - `cp .env.aws.example .env`
2. 把 `PUBLIC_BASE_URL` 改成你的正式域名（必须是 HTTPS），例如：
   - `PUBLIC_BASE_URL=https://order.yourdomain.com`
3. 如果前面有 ALB/Nginx/CloudFront，保持：
   - `TRUST_PROXY=true`
4. 启动：
   - `npm start`

## 3) 防止“离店后继续点单”的机制（已实现）
- 每个桌/包厢除了二维码 token，还有一个 `Access Code`（管理端可见）。
- 客人扫码后，必须输入该桌访问码，才可以同步购物车和提交订单。
- 服务端给该设备发短期会话（`ZONE_SESSION_TTL_MINUTES`），过期后需要重新输入访问码。
- 结单时默认自动轮换访问码并废弃旧会话（`ROTATE_ACCESS_CODE_ON_CHECKOUT=true`）。
- 管理端可手动“轮换访问码”，立即让旧会话失效。

## 4) 关键变量
- `PUBLIC_BASE_URL`: 二维码里生成的访问地址根域名
- `TRUST_PROXY`: 部署在反向代理后必须开启
- `DB_PATH`: SQLite 数据文件位置
- `SQLITE_BUSY_TIMEOUT_MS`: SQLite 锁等待时间（毫秒）
- `WRITE_QUEUE_ENABLED`: 是否启用写入 FIFO 队列
- `WRITE_QUEUE_MAX_SIZE`: 写入队列最大积压数
- `ZONE_ACCESS_CODE_REQUIRED`: 是否启用访问码拦截
- `ZONE_SESSION_TTL_MINUTES`: 客人会话有效期（分钟）
- `ROTATE_ACCESS_CODE_ON_CHECKOUT`: 结单是否自动轮换访问码
