# 12 UI 重构详细实施步骤

> [!IMPORTANT]
> 本文件是交给实施 Agent 的执行顺序，不替代产品规格。发生冲突时，优先级固定为：
> `00_MANDATORY_CONSTRAINTS.md` → `10_SAMSUNG_ANDROID_TABLET_UI_SPEC.md` / `11_ADMIN_MANAGE_UI_SPEC.md` → 本文件。

## 1. 最终目标

在不修改数据库实现、不改变既有业务能力和不破坏现网二维码/打印链路的前提下完成：

1. Samsung Android 员工 App UI 与信息架构重构；
2. Android 新增员工鉴权、只读、可分页到底的历史订单页面；
3. `admin_manage` 从五合一长页改成模块化经营后台；
4. Access Code 从 Android、顾客页和 `admin_manage` 的前端流程退役；
5. Windows 继续作为冻结的后台打印工作端，不重做员工交互 UI。

本轮只有两个功能集合例外：

- Android 新增只读历史订单；
- Access Code 从活动前端退役。

除此以外不得新增、删除或重新定义产品功能。

## 2. 当前源码基线

实施前必须承认以下当前事实，不能按目标设计反推源码已经完成：

- Android 主界面集中在 `apps/employee_app/App.tsx`，当前是桌台列表与订单列表的全局双栏布局。
- Android 当前仍在桌台卡和桌台抽屉显示 Access Code。
- Android 当前把多个订单状态按钮并列显示，但后端允许的状态集合和现有跳转能力都必须保留。
- Android 当前没有历史订单页面。
- 当前 `/api/admin/orders/history` 无员工鉴权、只支持最多 2000 条截断，不符合员工端历史要求。
- `admin_manage/index.html` 当前把菜单、二维码、报表、员工和隐私说明堆在同一长页。
- `admin_manage/app.js` 当前仍显示并轮换 Access Code。
- 顾客页仍有 Access Code 输入、提示、状态分支和请求字段。
- Windows Electron 仍包含旧员工交互代码；这些代码不在本轮重构范围，且打印 worker 仍依赖现有员工登录和任务领取链路。
- AWS 实际环境已经确认 `ZONE_ACCESS_CODE_REQUIRED=false`，AWS 当前不核验 Access Code。

## 3. 允许和禁止修改的文件边界

### 3.1 允许修改

- `app.js`：只增加员工历史只读路由及该路由所必需的纯路由适配代码；
- `apps/employee_app/App.tsx`：Android UI、前端派生状态、历史页面和现有动作的重新组织；
- `apps/employee_app/__tests__/`：与本轮改动直接相关的前端测试；
- `front_user/index.html`、`front_user/app.js`：仅移除 Access Code UI、分支和请求字段；
- `admin_manage/index.html`、`admin_manage/app.js`：模块化 UI 重构和 Access Code UI 退役；
- `style/main.css`：只增加或修改有 `manage-`、`employee-` 等明确作用域的样式，避免影响顾客页和旧员工 Web；
- 本项目 Markdown：同步真实实施结果、限制和验证状态。

### 3.2 禁止修改

- `database/` 下任何文件；
- SQLite 表、字段、索引、SQL、迁移、回填、初始化和归档事务；
- `.env`、`.env.example`、`.env.local.example`、`.env.aws.example`；
- 现有菜单、订单、结算、开台、结单、二维码、员工、打印 API 的业务语义；
- `front_admin/`；
- `windows_employee_app/main.js`、`preload.js`、`src/` 和构建产物；
- 顾客页面除 Access Code 退役之外的布局和业务；
- 二维码 token 生成规则和日常稳定性；
- 小票 JSON、打印任务字段、领取/完成协议。

### 3.3 工作区保护

当前工作区可能已有用户未提交修改。Agent 必须：

1. 先执行 `git status --short`；
2. 阅读与目标文件重叠的现有差异；
3. 不得 reset、checkout、覆盖或格式化掉用户已有修改；
4. 只修改本任务直接相关的行；
5. 发现无法安全合并的重叠修改时停止并报告，不自行丢弃。

## 4. 阶段 0：建立变更前证据

在写代码前记录：

- 当前 `git status --short`；
- 目标文件清单；
- 当前数据库目录状态；
- 当前 API 路由和客户端调用点；
- 至少一个现有桌台的 `zone.token`，只用于重构前后稳定性对比；
- Android 现有功能清单；
- `admin_manage` 现有功能清单；
- 当前可运行的静态检查与测试基线。

不得把真实员工密码、session token、顾客姓名或完整二维码 token 写入报告。token 稳定性证据只记录脱敏摘要或哈希。

完成本阶段前不得开始视觉重构。

## 5. 阶段 1：实现唯一必要的员工历史路由

### 5.1 路由位置和认证

在 `app.js` 现有员工路由区域增加：

```text
GET /api/employee/orders/history
```

强制要求：

- 使用现有 `requireEmployeeAuth`；
- 未登录或 session 过期返回 `401`；
- 只处理 `GET`；
- 不进入写队列；
- 不修改或替换 `/api/admin/orders/history`；
- 不修改现有 `getOrderWithItems` SQL；
- 只复用 `getOrderWithItems({ history: true })` 的现有结果，在路由适配层完成分组、筛选、排序和分页。

### 5.2 请求契约

```http
GET /api/employee/orders/history
  ?cursor=<opaque>
  &limit=30
  &zoneId=<zoneId>
  &date=YYYY-MM-DD
  &customerName=<text>
  &tzOffsetMinutes=<minutes>
X-Employee-Session: <token>
```

规则：

- `limit` 默认 30，允许 1–100；
- `cursor` 是服务端生成的不透明游标；
- `zoneId` 精确匹配；
- `customerName` 使用裁剪后的不区分大小写包含匹配；
- `date` 按结单时间和客户端时区偏移解释；
- 参数格式错误返回稳定 `400`，不能悄悄忽略；
- 筛选条件改变时旧 cursor 失效，服务端对不匹配 cursor 返回 `400`。

### 5.3 结单批次形成

先读取完整历史订单，再形成分页单位：

- 有 `checkoutAt`：使用 `zoneId + checkoutAt` 形成一个结单批次；
- 无 `checkoutAt`：每条订单形成独立 legacy 记录，`batchKey` 使用稳定的 `legacy:<orderId>`，并标记 `legacy=true`；
- 正常 `batchKey` 必须稳定，不依赖数组索引；
- 同一批次包含完整顾客、订单和菜品快照；
- 汇总顾客数量、订单数量、菜品项数、菜品总份数、总金额和处理员工；
- 金额继续使用现有历史序列化结果，不改变税费算法或历史写入。

### 5.4 筛选、排序和分页顺序

固定顺序：

1. 从全部历史订单形成完整批次；
2. 对批次应用 `zoneId`、`date`、`customerName` 筛选；
3. 顾客姓名命中一个批次时返回该批次全部内容；
4. 正常批次按 `checkoutAt DESC, batchKey DESC`；
5. legacy 记录按 `archivedAt/createdAt DESC, batchKey DESC`；
6. 应用 cursor；
7. 取 `limit` 条完整批次；
8. 返回下一游标和 `hasMore`。

不得在形成批次前先对原始订单做 `slice`，否则会拆散一次结单。

### 5.5 响应契约

```json
{
  "history": [
    {
      "batchKey": "zone-id|checkout-at",
      "legacy": false,
      "zoneId": "zone-id",
      "zoneLabel": "Room 1",
      "checkoutAt": "2026-07-29T00:00:00.000Z",
      "customerCount": 2,
      "orderCount": 3,
      "itemLineCount": 6,
      "itemQuantity": 9,
      "total": 100.0,
      "handledByEmployeeUsernames": ["employee"],
      "orders": []
    }
  ],
  "nextCursor": "opaque-or-null",
  "hasMore": true
}
```

不得返回数据库内部行对象，不得新增写操作，不得暴露员工 session。

### 5.6 路由门禁

进入下一阶段前至少验证：

- 无员工 session → `401`；
- 有效员工 session → `200`；
- `limit` 边界和错误参数；
- 两个批次时间相同仍保持稳定顺序；
- 同一批次不会跨页；
- 第二页不会重复第一页；
- 顾客筛选返回完整批次；
- legacy 记录没有伪造 `checkoutAt`；
- 反复读取不改变数据库；
- 原 `/api/admin/orders/history` 和日结路由语义未改变。

测试必须使用临时数据库路径，不得对真实 `database/store.sqlite3` 写入测试数据。

## 6. 阶段 2：Access Code 前端退役

### 6.1 顾客页

仅修改 `front_user/index.html` 和 `front_user/app.js`：

- 删除 Access Code 输入框和相关标签；
- 删除 `accessCodeInputEl`；
- 删除 `state.accessCodeRequired` 对 UI 和请求的控制；
- 把 `openSessionWithAccessCode` 改成表达“打开顾客会话”的名称；
- 请求体只发送 `token` 和 `customerName`；
- 未开台继续显示“请联系员工开台”；
- session 过期只提示重新输入姓名；
- 不改变购物车、菜单、订单、轮询和 session 本地存储流程。

如果服务端因环境误配仍返回 Access Code 错误，前端只能显示通用“当前无法开始点单，请联系员工”，不得重新显示 Access Code 输入框。

### 6.2 Android

- 删除 Access Code 文案、桌台卡展示和详情展示；
- 不使用 `accessCode` 做任何排序、筛选或显示；
- 当前会话起点必须使用现有 `periodStartAt`，不能继续用 `accessCodeUpdatedAt` 表示业务会话；
- 如 API 类型为兼容仍接受额外字段，不能把字段绑定到 UI 或产品逻辑。

### 6.3 `admin_manage`

- 删除 Access Code 展示；
- 删除“轮换访问码”按钮、事件分支和前端调用函数；
- 不调用 `/api/admin/zones/:id/access-code/rotate`；
- 不删除后端接口或数据库字段；
- 不把轮换访问码列为高危 UI 操作，因为该 UI 已经退役。

### 6.4 退役验收

目标活动前端不得出现：

- Access Code/访问码可见文案；
- 输入框；
- 请求字段；
- 验证分支；
- 轮换按钮或调用。

允许在后端兼容代码和技术文档中继续出现该词。

## 7. 阶段 3：Samsung Android 员工 App UI 重构

### 7.1 实现原则

- 不引入新的导航库、状态管理库或 UI 框架；
- 优先复用现有 fetch 和动作函数；
- 可以增加少量纯展示组件和类型，但不要建立过度抽象；
- 不修改原生 Android/iOS 工程配置，除非编译所必需且先报告原因；
- 使用 `useWindowDimensions`、Flex、最小/最大宽度和可伸缩列数，不写死整屏像素布局。

### 7.2 一级导航

登录后只有：

1. `当前桌台`；
2. `历史订单`。

使用简单前端 screen 状态即可，不引入导航依赖。

- 默认进入当前桌台；
- 历史页不参与 1 秒实时轮询；
- 返回当前桌台后恢复原桌台选择和滚动位置；
- 退出登录清空当前与历史的敏感内存状态。

### 7.3 当前桌台首页

把当前全局固定双栏改成桌台优先的单任务首页。

每张卡由现有 `zones + orders` 派生：

- 包厢名称；
- 开台状态；
- `new` 数量；
- `preparing` 数量；
- `ready` 数量；
- 未送份数和未送项数；
- 当前金额；
- 合单/分单；
- 分单未结人数；
- 可结单状态。

排序固定为：

1. 有 `new`；
2. 有 `ready` 且有未送菜品；
3. 有 `preparing`；
4. 可结单；
5. 已开台但空闲；
6. 未开台。

同级按最早相关订单时间和订单 ID 稳定排序。

首页不显示菜品明细、Access Code、内部 token、API 或数据库信息。

### 7.4 桌台详情

使用全屏工作页或明确的单任务页面，不恢复全局固定双栏。

顶部固定：

- 返回；
- 包厢名称；
- 开台状态；
- 合单/分单；
- 当前总金额；
- 未送份数/项数；
- 未结人数；
- 是否可结单；
- 最后刷新时间。

内容分为：

- `待处理`：`new`、`preparing`、`ready`；
- `当前会话已结束`：`served`、`cancelled`，默认折叠。

### 7.5 合单与分单

- 合单：按订单状态流显示，姓名为辅助信息；
- 分单：按顾客姓名一级分组；
- 分单组显示金额、订单数、未送份数/项数和已结/未结；
- 未结顾客优先；
- 已结顾客可以折叠，但仍有未送菜品时不能隐藏服务任务；
- 切换模式继续调用现有 API，不改变服务端语义。

### 7.6 订单卡和操作

订单卡显示：

- 顾客姓名；
- 状态；
- 下单时间；
- 菜品份数；
- 未送份数/项数；
- 总金额；
- 备注；
- `订单状态处理员工`。

不得写成“最后处理员工”。

主操作：

- `new` → 接单；
- `preparing` → 制作完成；
- `ready` → 整单完成。

其他现有状态跳转放入清晰的“更改状态”次级入口，不能删除。取消订单必须二次确认。

菜品继续支持：

- 标记已送/恢复未送；
- 未送菜品数量 `+/-`；
- 现有条件下加菜。

不得创造部分送达、单品取消历史、补单标签或独立单品备注。

### 7.7 开台、结单和打印

- 未开台时唯一主操作是“开台”；
- 已开台且满足条件时最终主操作是“结单并清台”；
- 分单仍有未结顾客时保持阻止；
- 结单二次确认；
- 打印入口继续发送现有打印任务；
- 入队成功只提示“打印任务已发送”；
- 不显示“打印成功”。

### 7.8 历史页面

历史页面使用阶段 1 的员工历史接口：

- 包厢筛选；
- 日期筛选；
- 顾客姓名搜索；
- 清除筛选；
- 下拉/按钮加载下一页；
- 加载中、错误重试、筛选无结果、全部加载完成；
- 结单批次列表；
- 顾客、订单和菜品详情展开；
- legacy 记录明确标记。

状态规则：

- 筛选变化时增加请求代次 ID 或取消旧请求，防止旧响应覆盖新筛选；
- 重置 `history`、`nextCursor`、`hasMore` 后重新请求；
- 追加页按 `batchKey` 去重，批次内按订单 ID 去重；
- `hasMore=false` 后禁止继续请求；
- 401 复用现有退出登录处理；
- 历史页不得有任何写按钮或打印按钮。

## 8. 阶段 4：`admin_manage` 模块化重构

### 8.1 页面壳

把 `admin_manage/index.html` 改成：

- 左侧固定导航；
- 右侧当前模块内容；
- 五个模块：概览、菜单、桌台/二维码、报表、员工；
- 默认概览；
- 隐私说明放在概览底部折叠区。

尽量保留现有 DOM ID，降低 `app.js` 改动风险。不得通过重新创建整个 DOM 破坏输入焦点和未保存编辑。

### 8.2 前端模块状态

在 `admin_manage/app.js` 增加简单的 `activeModule` 和模块切换函数：

- 不新增路由库；
- 切换模块不清空 `menuState`、`categoriesState`、`zonesState` 或 `employeesState`；
- 菜单存在未保存修改时，切换后仍保留；
- 桌台定时刷新只更新桌台区域，不重绘正在编辑的菜单或员工表单；
- 网络错误显示在所属模块，不弹出无上下文的连续 alert。

### 8.3 概览

只使用现有接口：

- `/api/admin/orders/by-day`；
- `/api/admin/zones`；
- `/api/admin/employees`。

展示：

- 今日下单金额；
- 今日订单数；
- 当前开台桌数；
- 当前可结单桌数；
- 当前有进行中订单桌数（`activeOrderCount > 0`）；
- 当前员工数；
- 最近更新时间。

不得写“今日营业收入”“今日结单收入”，不得为概览新增后端指标。

### 8.4 菜单模块

- 左侧分类，右侧菜品；
- 保留新增、编辑、上下架、勾选删除、全部删除、保存；
- 保留分类新增、改名、拖动排序和删除；
- 保留批量导入；
- 明确“有未保存修改/保存中/已保存/保存失败”；
- 不改变当前覆盖式保存语义。

### 8.5 桌台/二维码模块

左侧列表只显示摘要；右侧详情显示二维码与操作。

必须保留：

- 批量创建；
- 改名；
- 二维码预览；
- 复制完整链接；
- PNG/SVG 下载；
- 完成/取消完成；
- 结单清台；
- 重新生成二维码；
- 删除桌台。

不得显示 Access Code 或轮换入口。

高危确认：

- 重新生成二维码：两阶段确认，明确“已打印旧二维码将永久失效”；
- 删除桌台：两阶段确认，明确“已打印旧二维码将永久失效，相关数据将按现有接口规则处理”；
- 结单清台：确认文案写“订单将归档并清空当前桌台”，不能写成未保存历史的物理删除；
- 普通改名、完成标记和结单不得改变 `zone.token`。

Access Code 轮换不属于当前高危 UI，它必须完全退役。

### 8.6 报表和员工模块

报表：

- 保留日期选择、订单数、今日下单金额和订单详情；
- 保留活动/历史来源；
- `handledByEmployeeUsername` 显示为“订单状态处理员工”；
- 不新增导出、利润、支付或对账。

员工：

- 保留新增、编辑姓名/用户名/可选密码、删除；
- 删除使用明确危险确认；
- 不新增角色、权限、排班或停用功能。

### 8.7 样式隔离

- 新后台样式使用 `.manage-shell`、`.manage-nav`、`.manage-module` 等前缀；
- 不修改共享 `.card`、`.row`、`.table` 的全局规则来强行适配后台；
- 如必须调整共享规则，先验证顾客页和旧员工 Web 无回归；
- 桌面浏览器优先，同时覆盖常见笔记本宽度和窄屏降级。

## 9. 阶段 5：Windows 与旧员工 Web 边界

- 不修改 `front_admin/`；
- 不修改 Windows 源码和构建产物；
- 不删除 Windows 旧员工代码，因为当前打印 worker 仍可能依赖现有登录、服务端连接和轮询生命周期；
- `windows_employee_app/README.md` 只作为历史实现说明，主方向以 `docs/00`、`docs/06`、`docs/10` 为准；
- 如果 Android 打印入口或服务端打印字段发生任何变化，必须停止并重新评估，因为本轮不允许改变打印协议。

## 10. 阶段 6：验证顺序

### 10.1 静态检查

根项目：

```bash
node --check app.js
node --check front_user/app.js
node --check admin_manage/app.js
npm test
```

注意：根 `npm test` 当前只输出 `No tests configured yet`，不能报告成业务测试通过。

Android：

```bash
cd apps/employee_app
npx tsc --noEmit
npm run lint
npm test -- --runInBand
```

如果 Jest 仍被 `react-native-sound-player` 的既有 ESM 配置阻塞，必须报告“0 个测试执行”，不能写成通过。

### 10.2 历史接口验证

- 员工 401/200；
- cursor 连续加载；
- 稳定排序；
- 同批次不拆页；
- 筛选后分页；
- 去重；
- legacy 降级；
- 读取无副作用；
- 数据库文件和 schema 无变化。

### 10.3 顾客访问验证

- 未开台扫码：不能点单；
- 开台后：只输入姓名即可开始点单；
- 页面不出现 Access Code；
- session 过期要求重新输入姓名；
- 结单后旧 session 不能继续下单；
- 菜单、购物车和订单提交保持原功能。

### 10.4 Android 功能回归

逐项验证：

- 登录/退出和中英文；
- 桌台紧急度排序；
- 开台；
- 接单及所有现有状态变化；
- 单品已送/恢复未送；
- 数量加减；
- 加菜；
- 合单/分单；
- 顾客已结/未结；
- 结单守卫与归档清台；
- 打印任务发送文案；
- 新单提示；
- 写队列状态；
- 历史筛选、分页到底和详情只读；
- session 过期和网络失败。

### 10.5 Android 视觉验收

中间过程可使用 Android 模拟器，但最终必须在实际 Samsung 平板横屏验证：

- 登录与软键盘；
- 桌台首页；
- 合单详情；
- 分单详情；
- 历史列表；
- 历史详情；
- 空状态、错误状态和加载到底；
- 系统字体/显示缩放；
- 长列表滚动；
- 触摸目标尺寸。

记录平板型号、Android 版本、显示缩放、App 构建版本和测试时间，并保存截图。

### 10.6 `admin_manage` 回归

- 默认概览；
- 五模块导航；
- 菜单与分类全部 CRUD；
- 批量导入和未保存状态；
- 桌台批量创建；
- 改名、复制链接、PNG/SVG；
- 完成标记；
- 结单；
- 重置二维码和删除桌台两阶段确认；
- token 普通操作前后不变；
- 报表日期和“今日下单金额”；
- 员工 CRUD；
- 隐私说明；
- 定时刷新不覆盖输入；
- 无 Access Code UI 和请求。

### 10.7 打印兼容回归

若 Android UI 触及打印入口，必须用现有 Windows 工作端和真实打印机验证：

- Android 入队后提示“打印任务已发送”；
- Windows 领取；
- 小票渲染；
- 实际打印；
- completed/failed 回报；
- 连续多任务。

## 11. 数据库和二维码最终门禁

完成前必须证明：

- 数据库表、字段、索引、迁移、SQL和归档事务改动为 0；
- `database/` 目录没有本任务产生的修改；
- 测试使用临时 DB；
- 真实数据未被脚本改写；
- 普通改名、开台、订单处理、完成标记和结单不改变 `zone.token`；
- 只有管理员明确执行“重新生成二维码”或“删除桌台”时旧二维码才可能失效；
- Access Code 字段仍兼容保留，但活动前端不显示、不发送、不校验、不轮换。

“数据库零改动”不等于停止使用数据库。菜单、桌台、员工、订单、结单等现有业务仍通过原 API 正常读写运行数据。

## 12. 禁止的完成声明

以下任何一种情况都不能声称完成：

- 只做静态页面或 Mock；
- 历史只加载第一页或最多 2000 条；
- 历史接口没有员工鉴权；
- 筛选只作用于客户端当前已加载的一小部分数据；
- 同一次结单被拆成多个批次；
- Android 或 `admin_manage` 现有功能被误删；
- Access Code 仍出现在活动前端；
- Android 显示“打印成功”；
- 用浏览器或 Windows 截图代替 Samsung 平板验收；
- 修改数据库、归档、二维码 token 或打印协议；
- 把根 `npm test`、静态检查、构建成功当作完整业务验收；
- 未报告 Jest、设备、打印机、AWS 或其他外部验证缺口。

## 13. Agent 最终交付报告格式

Agent 完成后必须按以下结构报告：

1. **结果摘要**：完成了什么；
2. **文件清单**：每个文件为什么修改；
3. **功能保持矩阵**：Android 与 `admin_manage` 原功能逐项结果；
4. **唯一后端改动**：员工历史 GET 路由及契约；
5. **Access Code 退役结果**：三个活动前端检查；
6. **数据库改动**：必须写明 `0`；
7. **二维码稳定性**：验证证据；
8. **打印兼容性**：真实验证或明确未验证；
9. **测试命令与实际输出**：区分通过、失败、阻塞和未执行；
10. **Samsung 实机证据**：设备信息和截图；
11. **剩余风险/外部验证**：不得隐瞒；
12. **未修改范围**：`front_admin`、Windows 源码、数据库和 AWS 环境。

未获得用户明确授权时，不得部署 AWS、修改生产 `.env`、提交 Git、推送或创建 PR。
