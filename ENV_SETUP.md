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

当前实际 AWS `.env` 已由项目负责人确认：`ZONE_ACCESS_CODE_REQUIRED=false`，Access Code 不参与 AWS 点单流程。

## 3) 当前目标访问流程

- 员工未开台时，顾客扫码后不能点单。
- 员工开台后，顾客输入姓名即可建立短期会话并点单。
- 服务端继续使用 `ZONE_SESSION_TTL_MINUTES` 控制顾客会话有效期；结单会撤销该桌顾客会话。
- Access Code 已被产品废弃。SQLite 中现有兼容字段保留，但 Android、顾客页和 `admin_manage` 不显示、不输入、不发送、不核验，也不提供轮换入口。
- 当前源码仍保留 Access Code 条件校验和轮换兼容代码，因此所有实际部署必须显式设置：

```env
ZONE_ACCESS_CODE_REQUIRED=false
ROTATE_ACCESS_CODE_ON_CHECKOUT=false
```

- 未来若要删除字段或后端兼容代码，必须另开后端清理任务；本次 UI 重构不做。

## 4) 关键变量
- `PUBLIC_BASE_URL`: 二维码里生成的访问地址根域名
- `TRUST_PROXY`: 部署在反向代理后必须开启
- `DB_PATH`: SQLite 数据文件位置
- `SQLITE_BUSY_TIMEOUT_MS`: SQLite 锁等待时间（毫秒）
- `WRITE_QUEUE_ENABLED`: 是否启用写入 FIFO 队列
- `WRITE_QUEUE_MAX_SIZE`: 写入队列最大积压数
- `ZONE_ACCESS_CODE_REQUIRED`: 兼容开关；当前产品必须为 `false`
- `ZONE_SESSION_TTL_MINUTES`: 客人会话有效期（分钟）
- `ROTATE_ACCESS_CODE_ON_CHECKOUT`: 兼容开关；当前产品必须为 `false`
