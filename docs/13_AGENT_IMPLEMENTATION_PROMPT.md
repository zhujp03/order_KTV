# 13 可直接复制给实施 Agent 的 Prompt

下面代码块中的内容可以完整复制给负责实施的 Agent。不要只复制其中一小段。

```text
你现在负责 /Users/michaelzhu/Desktop/order_system 的 UI 重构实施。

先不要立即写代码。先完整读取并遵守以下文件：

1. AGENTS.md（如果存在）
2. docs/00_MANDATORY_CONSTRAINTS.md
3. docs/10_SAMSUNG_ANDROID_TABLET_UI_SPEC.md
4. docs/11_ADMIN_MANAGE_UI_SPEC.md
5. docs/12_UI_REFACTOR_IMPLEMENTATION_PLAN.md
6. docs/04_API_REFERENCE.md
7. docs/05_DATABASE_MODEL.md
8. docs/06_CLIENTS.md
9. docs/09_SOURCE_AND_VALIDATION.md

目标：

- Samsung Android 员工 App 只重构 UI/信息架构，保留全部现有业务能力；唯一新增功能是员工鉴权、只读、可分页到底的历史订单。
- admin_manage 只重构 UI/页面组织，保留全部现有功能；Access Code 展示和轮换入口是明确退役例外。
- 顾客页只移除 Access Code 输入、提示、判断和请求字段，不做其他重构。
- 后端除新增必要的员工历史 GET 路由和纯路由适配外完全冻结。
- 数据库、SQL、迁移、初始化、归档事务、真实数据和二维码 token 零改动。
- Windows 源码不更新，只继续作为后台打印工作端；front_admin 不修改。

最高规则：

1. 先执行 git status --short，识别并保留用户已有修改。不得 reset、checkout 或覆盖不属于你的改动。
2. 不得修改 database/、任何 .env*、front_admin/、windows_employee_app 源码或构建产物。
3. app.js 只允许新增 GET /api/employee/orders/history 及该路由必需的纯适配代码。不得修改现有 SQL、数据库函数、路由语义、归档和写入逻辑。
4. 历史接口必须使用 requireEmployeeAuth 和 X-Employee-Session；必须按完整结单批次进行稳定 cursor 分页，返回 history/nextCursor/hasMore；先形成完整批次，再筛选、排序和分页；同一 zoneId + checkoutAt 批次不得跨页；legacy 数据不得伪造 checkoutAt。
5. Android 历史页只读，不得包含状态、菜品、结算、清台、删除或打印写操作。
6. Access Code 是数据库兼容字段：数据库和后端兼容代码保留，但 Android、front_user、admin_manage 不显示、不输入、不发送、不校验、不提供轮换入口。AWS 已确认 ZONE_ACCESS_CODE_REQUIRED=false。不要修改 AWS 或任何 .env。
7. Android 只显示“打印任务已发送”，不能显示“打印成功”；不得改变打印任务和小票协议。
8. admin_manage 概览只能使用现有 API；金额写“今日下单金额”；不得新增后端统计接口。
9. 订单字段 handledByEmployeeUsername 的 UI 文案必须是“订单状态处理员工”，不能包装成完整的“最后处理员工”。
10. 重新生成二维码和删除桌台必须两阶段确认，并明确提示“已打印旧二维码将永久失效”。Access Code 轮换不再属于 UI 操作。

严格按照 docs/12_UI_REFACTOR_IMPLEMENTATION_PLAN.md 的阶段执行。每完成一个阶段先执行该阶段门禁，再进入下一阶段。不要一次性大改后再测试。

Android 要求：

- 登录后一级入口只有“当前桌台”和“历史订单”。
- 默认当前桌台；桌台首页按业务紧急度排序。
- 桌台详情是单任务工作页，不使用全局固定双栏。
- 合单按订单流，分单按顾客姓名分组。
- 推荐下一状态作为唯一主按钮；其他现有状态切换放入次级“更改状态”，不得删除能力。
- 保留登录、中英文、开台、接单、状态修改、取消、单品送达、数量调整、加菜、合单/分单、顾客结算、结单、打印任务、新单提示、写队列状态和退出登录。
- 不增加导航库、状态管理库或 UI 框架；不新增依赖，除非绝对必要并先报告。
- Samsung 平板横屏优先，使用响应式 Flex/useWindowDimensions，不写死固定整屏像素。

admin_manage 要求：

- 五个一级模块：概览、菜单、桌台/二维码、报表、员工。
- 默认概览；隐私说明放概览底部折叠区。
- 保留菜单/分类 CRUD、批量导入、未保存状态、桌台批量创建、二维码预览、复制、PNG/SVG、完成标记、结单、改名、重新生成、删除、日报、员工 CRUD 和定时刷新。
- 模块切换不能丢菜单未保存状态；定时刷新不能覆盖输入。
- 新 CSS 必须使用 manage- 前缀隔离，避免影响顾客页和旧员工 Web。

验证：

- 测试数据只能写临时 DB，不能碰真实 database/store.sqlite3。
- 运行 node --check app.js、front_user/app.js、admin_manage/app.js。
- 运行根 npm test，但必须说明它当前没有真实测试，不能包装成业务通过。
- Android 运行 npx tsc --noEmit、npm run lint、npm test -- --runInBand；如 Jest 仍在加载阶段失败，原样报告 0 tests，不得写成通过。
- 做真实 API 回归、历史 cursor/筛选/去重/401 回归、顾客未开台/开台/session 回归、admin_manage 全 CRUD 回归。
- 中间可以用模拟器，最终必须在目标 Samsung 平板横屏运行并截图；浏览器/Windows/iOS 不能替代。
- 涉及 Android 打印入口时，用现有 Windows 工作端和真实打印机验证；如果没有设备，明确列为未验证，不得声称完成。
- 验证普通操作前后 zone.token 不变，数据库 schema 和 database/ 文件无本任务改动。

不要部署 AWS，不要修改生产 .env，不要提交 Git，不要推送或创建 PR，除非用户另行明确授权。

最终报告必须包含：结果摘要、修改文件、原功能保持矩阵、唯一后端路由、Access Code 退役、数据库改动 0、二维码稳定性、打印兼容性、全部测试命令和真实结果、Samsung 实机证据、未验证项、未修改范围。
```
