# 07 配置、启动与部署

## 1. 根服务依赖

根项目依赖：

- `express`：HTTP 和静态服务；
- `better-sqlite3`：同步 SQLite 驱动；
- `qrcode`：生成 PNG/SVG 二维码。

启动命令：

```bash
npm install
npm start
```

调试请求日志：

```bash
npm run debug
```

## 2. `.env` 加载规则

服务端自己实现了简化 `.env` 解析器：

- 只读取项目根目录 `.env`；
- 忽略空行和 `#` 注释；
- 支持最外层单/双引号；
- 不展开 `${VAR}`；
- 已存在的系统环境变量优先，不被 `.env` 覆盖。

## 3. 环境变量

| 变量 | 默认/范围 | 作用 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 监听地址 |
| `PORT` | `3000` | HTTP 端口 |
| `PUBLIC_BASE_URL` | 未设置时从请求推导 | 二维码中使用的公开根地址 |
| `DB_PATH` | `database/store.sqlite3` | SQLite 文件位置 |
| `TRUST_PROXY` | 未设置 | Express 反向代理信任设置，可为布尔、数字或字符串 |
| `DEBUG_REQUESTS` | `0` | 是否记录请求和响应摘要 |
| `ZONE_ACCESS_CODE_REQUIRED` | 源码默认 `true`；目标必须显式为 `false` | 遗留兼容校验开关 |
| `ZONE_ACCESS_CODE_LENGTH` | `4`，限制 4–8 | 遗留 Access Code 兼容字段长度 |
| `ZONE_SESSION_TTL_MINUTES` | `120`，限制 5–1440 | 顾客会话滑动有效期 |
| `ROTATE_ACCESS_CODE_ON_CHECKOUT` | 源码默认 `true`；目标必须显式为 `false` | 遗留结单轮换开关 |
| `EMPLOYEE_SESSION_TTL_MINUTES` | `720`，限制 30–10080 | 员工会话滑动有效期 |
| `CSP_ALLOW_INLINE_STYLE` | `true` | CSP 是否允许 HTML 内联样式 |
| `SQLITE_BUSY_TIMEOUT_MS` | `5000`，限制 100–60000 | SQLite 锁等待时间 |
| `WRITE_QUEUE_ENABLED` | `true` | 是否启用进程内写队列 |
| `WRITE_QUEUE_MAX_SIZE` | `2000`，限制 10–100000 | 队列最大待处理量 |

`EMPLOYEE_SESSION_TTL_MINUTES` 在代码中有效，但现有三个示例 `.env` 没有列出，部署时可显式补充。

## 4. 本地局域网运行

```bash
cp .env.local.example .env
```

把 `PUBLIC_BASE_URL` 改为门店局域网中其他手机可以访问的地址，例如：

```dotenv
PUBLIC_BASE_URL=http://192.168.1.50:3000
TRUST_PROXY=false
ZONE_ACCESS_CODE_REQUIRED=false
ROTATE_ACCESS_CODE_ON_CHECKOUT=false
```

验证顺序：

1. 服务端本机访问 `/api/health`。
2. 同一 Wi-Fi 的手机访问 `PUBLIC_BASE_URL`。
3. 在管理页生成新二维码并用手机扫描。
4. 员工未开台时确认无法点单；开台后确认只输入姓名即可建立 session 并点单。

本机防火墙、路由器客户端隔离和动态局域网 IP 都可能导致手机无法访问。

## 5. AWS/公网运行

公网部署至少需要：

1. Node 服务运行在受管理的进程或容器中。
2. 持久磁盘保存 SQLite，不能把数据库只放在临时容器层。
3. ALB/Nginx/CloudFront 等终止 HTTPS。
4. 正确设置 `PUBLIC_BASE_URL=https://...`。
5. 正确、最小化设置 `TRUST_PROXY`。
6. 只允许必要端口，限制管理入口。
7. 建立备份、日志轮转、监控和告警。

现有 `.env.aws.example` 包含：

```dotenv
ZONE_ACCESS_CODE_REQUIRED=false
ROTATE_ACCESS_CODE_ON_CHECKOUT=false
```

项目负责人已确认，实际 AWS `.env` 中 `ZONE_ACCESS_CODE_REQUIRED=false`，因此 AWS 当前不会核验 Access Code。`.env.aws.example` 同样把校验和结单轮换都设为 `false`，符合当前产品目标。由于源码默认值仍为 `true`，任何漏配环境都会意外恢复已废弃流程，因此本地、测试和生产都必须显式写出这两个 `false`。本次不通过修改后端默认值或删除数据库字段解决该问题。

## 6. 反向代理注意事项

- 代理必须把原始 Host/协议正确传递给 Express，或明确设置 `PUBLIC_BASE_URL`。
- 不要无条件信任所有代理层；错误的 `TRUST_PROXY=true` 可能影响来源 IP 判断。
- 当前应用没有内置 TLS，HTTPS 应由反向代理提供。
- 当前没有 CORS 配置，浏览器页面设计为与 API 同源部署。

## 7. React Native 开发

```bash
cd apps/employee_app
npm install
npm start
```

另一个终端运行：

```bash
npm run android
# 或
npm run ios
```

iOS 初次运行还需要 Ruby/CocoaPods 环境。移动 App 的服务地址当前硬编码，切换环境需要改代码并重新构建。

## 8. Windows 员工端

```bash
cd windows_employee_app
npm install
npm start
```

构建安装程序：

```bash
npm run dist:win:x64
npm run dist:win:ia32
```

应在目标 Windows 版本上验证：安装、启动、HTTPS 连接、登录、睡眠恢复、打印机枚举、连续打印、失败任务和应用升级。

## 9. 生产运行缺失项

仓库当前没有提供：

- Dockerfile、systemd/PM2 配置或 IaC；
- 反向代理配置；
- 数据库备份脚本；
- 日志集中采集；
- 健康检查以外的指标；
- 自动部署流程；
- 密钥管理方案。

这些属于生产运行工程，不能仅靠 `npm start` 替代。
