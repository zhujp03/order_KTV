# 09 源文件逐项导览与验证指南

## 1. 文档覆盖范围

本导览基于当前工作区实际文件，而不是另一个相似项目。仓库当前还包含用户原有的未提交改动和未跟踪 Windows 客户端目录；本文描述的是当前磁盘版本，不代表 Git `HEAD` 的历史版本。

## 2. 根目录

| 文件 | 作用 |
| --- | --- |
| `app.js` | 3560 行左右的单体后端：环境、SQLite、迁移、业务函数、静态页面、API、启动 |
| `package.json` | 根服务启动、调试和依赖；`test` 目前没有真实测试 |
| `package-lock.json` | 锁定根依赖版本 |
| `.env.example` | 通用服务器配置示例 |
| `.env.local.example` | 局域网开发示例 |
| `.env.aws.example` | AWS 示例；Access Code 两个开关为当前目标值 `false` |
| `ENV_SETUP.md` | 原有简版环境说明 |
| `codex.md` | 原有项目约定，包括 API 一致性、时区、移动优先和反远程点单目标 |
| `style/main.css` | 三个 Web 页面共用样式，约 900 行 |
| `app_logo.png` | 顾客页面 Logo |
| `new_order_note.mp3` | 普通新单提示音 |
| `uber_eats.mp3` | 外卖类提示音素材；核心后端没有 Uber Eats 集成 |

## 3. 后端 `app.js` 分区

| 大致区域 | 职责 |
| --- | --- |
| 顶部 | `.env` 解析、常量、token、金额和默认数据 |
| 数据库初始化 | 16 张表、索引、字段补丁、WAL/外键/busy timeout |
| 设置和区域会话 | 开台状态、会话周期、结算模式 |
| 购物车 | 会话购物车读取、保存、清理和区域汇总 |
| 结算/小票 | 顾客结算标记、小票聚合、打印计数和打印任务 |
| 鉴权 | 顾客开台状态/session、员工密码/session；后端仍含已退役 Access Code 兼容分支 |
| 查询/迁移 | 菜单、区域、订单序列化、旧 JSON 迁移、默认填充 |
| 中间件 | JSON、安全响应头、调试日志、写队列、静态目录 |
| 顾客路由 | session、上下文、购物车、提交订单、订单查询 |
| 管理路由 | 菜单、分类、区域、二维码、员工、报表 |
| 员工路由 | 登录、订单、开台、结算、小票和打印任务 |
| 底部 | 404、500、监听启动和模块导出 |

## 4. Web 页面

### `front_user/`

- `index.html`：顾客验证、菜单、购物车、费用明细和订单面板。
- `app.js`：token/session、分类渲染、购物车同步、订单提交和轮询。

### `front_admin/`

- `index.html`：员工登录、状态筛选、区域待办、订单卡片和抽屉。
- `app.js`：中英文、员工 session、订单处理、开台/结算/结单和提示音。

### `admin_manage/`

- `index.html`：菜单、分类、二维码、报表和员工管理布局。
- `app.js`：全部管理 API 的 DOM 操作和事件绑定。

三个页面没有 bundler，浏览器直接加载对应 `app.js`。修改 DOM ID 时必须同步修改 HTML 和 JavaScript。

## 5. React Native 移动端

| 路径 | 作用 |
| --- | --- |
| `apps/employee_app/App.tsx` | 约 1500 行，员工移动端全部业务和样式 |
| `apps/employee_app/index.js` | 注册 `EmployeeApp` |
| `apps/employee_app/__tests__/App.test.tsx` | 脚手架级渲染测试 |
| `apps/employee_app/package.json` | React Native、React、声音库和测试工具 |
| `babel.config.js` | React Native Babel preset |
| `metro.config.js` | Metro 默认配置 |
| `jest.config.js` | React Native Jest preset |
| `tsconfig.json` | TypeScript 配置 |
| `app.json` | App 名称注册信息 |

`android/` 与 `ios/` 中的 Gradle、Xcode、Kotlin、Swift、Manifest、plist、图标和隐私文件属于原生工程壳。业务变动一般先检查 `App.tsx`，权限、包名、资源和发布配置则检查对应原生目录。

## 6. Windows Electron 客户端

| 路径 | 作用 |
| --- | --- |
| `windows_employee_app/main.js` | Electron 主进程、配置、HTTP 代理和打印 |
| `windows_employee_app/preload.js` | IPC 安全桥 |
| `windows_employee_app/src/index.html` | 桌面端 UI 结构 |
| `windows_employee_app/src/renderer.js` | 约 1150 行员工业务逻辑 |
| `windows_employee_app/src/styles.css` | 桌面端专用样式 |
| `windows_employee_app/package.json` | Electron 和 electron-builder 配置 |
| `windows_employee_app/README.md` | 原有开发/构建说明 |
| `windows_employee_app/assets/` | 打包进桌面端的声音素材 |
| `dist_win7_ia32/`、`dist_win7_x64/` | 已生成安装包/解包文件，属于构建产物，不是源代码 |

不要直接修改 `.exe`、`.asar`、`.dll` 或 `win-unpacked` 内容。应修改源文件后重新打包。

## 7. 数据文件

`database/store.json` 包含旧格式的 `settings`、`menu`、`zones`、`carts` 和 `orders`。当前文件含少量旧数据，可作为迁移输入，但不能把它与运行时 SQLite 同时当作真实数据源。

运行时 SQLite、`-wal`、`-shm` 已被 `.gitignore` 排除。检查数据时应先确认实际 `DB_PATH`。

## 8. 自动化测试现状

- 根项目 `npm test` 只输出 `No tests configured yet`，不验证业务。
- React Native 目录只有脚手架级渲染测试，没有覆盖登录、订单、结算或网络交互。
- Windows 客户端没有自动化测试命令。
- 仓库没有后端 API 集成测试、数据库迁移测试、浏览器 E2E 或负载测试。

因此，语法检查或安装包存在都不能称为完整验收。

### 8.1 本次文档复核的实际结果（2026-07-29）

| 检查 | 结果 | 解释 |
| --- | --- | --- |
| 根后端、三个 Web JS、Electron 三个 JS 的 `node --check` | 通过 | 只证明 JavaScript 可被解析 |
| 根目录 `npm test` | 命令退出 0，但无测试 | 脚本仅输出 `No tests configured yet` |
| React Native `npx tsc --noEmit` | 通过 | TypeScript 静态类型检查通过 |
| React Native `npm run lint` | 通过但有 4 个 warning | 均为 `App.tsx` 中多余的 `Boolean` 转换，无 error |
| React Native Jest | 失败，0 个测试执行 | Jest 无法转换 `react-native-sound-player` 的 ESM `import`，测试套件在加载阶段终止 |

这些结果只用于确认文档所描述的当前工程状态；本次任务没有改动业务代码或修复既有测试配置。

## 9. 推荐的最小验证命令

### 9.1 根服务

```bash
node --check app.js
node --check front_user/app.js
node --check front_admin/app.js
node --check admin_manage/app.js
npm test
```

### 9.2 React Native

```bash
cd apps/employee_app
npm test -- --runInBand
npm run lint
npx tsc --noEmit
```

### 9.3 Windows Electron

```bash
cd windows_employee_app
node --check main.js
node --check preload.js
node --check src/renderer.js
```

## 10. 必须人工/实机验证的流程

1. 新数据库首次启动与旧 JSON 迁移分别测试。
2. 创建分类、菜单、区域和二维码。
3. 员工开台后，两个顾客分别建立 session 和购物车。
4. 未开台拒绝、开台后无需 Access Code、session 过期和结单撤销后的拒绝路径。
5. 服务端价格重算和 13% + 18% 金额核对。
6. Samsung 安卓平板上的状态、改单、合单/分单和单品送达流程；员工 Web、iOS 和 Windows 交互 UI 不作为本轮员工端验收对象。
7. 分开结账阻止未结顾客；合并结账允许整房结单。
8. 结单后活动订单归档、购物车清空、旧 session 失效。
9. Windows 真实打印机的领取、打印、重打、失败和断电恢复。
10. 备份恢复、长时间运行和峰值并发。

## 11. 修改代码时的核对范围

| 修改类型 | 至少核对 |
| --- | --- |
| API 路径/响应 | `app.js`、三个员工客户端或顾客端调用方 |
| 订单字段/状态 | SQLite 表、序列化、Web、RN、Electron、历史归档 |
| 金额规则 | 服务端、顾客展示、小票、日结 |
| 区域会话/结算 | 顾客 session、三个员工端、结单守卫、设置键 |
| 打印结构 | 服务端小票 JSON、打印任务、Electron HTML |
| DOM ID | 对应 HTML 与 JavaScript |
| 环境变量 | `app.js`、三个 `.env` 示例和部署文档 |

## 12. 文档维护原则

代码是最终事实来源。新增路由、表、状态、客户端或部署方式时，应同步更新对应分册；未经过真实环境验证的能力必须标成“实现存在、验证待完成”，不能把 Mock、静态检查、构建产物或历史结果写成生产验收。

## 13. 员工 Android 任务强制门禁

涉及员工 Android UI 或历史订单的任务，执行前必须先读取[员工 Android 重构强制约束](00_MANDATORY_CONSTRAINTS.md)。最低门禁如下：

1. 先确认本次数据库改动为零，再开始前端工作。
2. 禁止修改 schema、迁移、索引、回填、归档事务、数据库文件和旧 JSON 数据。
3. 历史功能必须只读并经过员工鉴权。
4. 验证历史分页确实到达服务端结束，不能只检查第一页或 2000 条上限。
5. 验证历史页面没有任何订单、菜品、结算、打印或清台写操作。
6. 运行 TypeScript、Lint 和能够运行的测试，并如实记录既有阻塞。
7. 必须详细执行[Samsung 安卓平板员工端 UI 最终规格](10_SAMSUNG_ANDROID_TABLET_UI_SPEC.md)，不能只改颜色或保留原双栏信息架构。
8. 可以使用 Android 模拟器做中间回归，但最终必须完成实际目标 Samsung 平板运行、截图和视觉检查。
9. 员工 Web、iOS 和 Windows 交互 UI 不属于本轮员工端验收范围，不能替代 Samsung 平板证据；但涉及打印任务、小票结构或相关 API 时，必须回归现有 Windows 打印工作端。

## 14. Access Code 源码审计结论（2026-07-29）

“产品已经不用 Access Code”是目标业务结论，但不能表述为“当前源码已无使用点”。当前磁盘版本仍存在：

- SQLite `zones.access_code`、`zones.access_code_updated_at` 字段及兼容 `ALTER TABLE`；
- Access Code 创建、补齐、验证和轮换函数；
- 顾客 session 打开接口的条件校验；
- 管理端轮换接口；
- Android、顾客页和 `admin_manage` 的展示、输入或调用代码；
- 源码默认开启校验与结单轮换的配置默认值。
- 当前本地 `.env`、`.env.example` 和 `.env.local.example` 仍把两个开关设为 `true`；`.env.aws.example` 已设为 `false`。项目负责人另已确认，实际 AWS `.env` 的 `ZONE_ACCESS_CODE_REQUIRED=false`，因此 AWS 当前不核验 Access Code。

因此本轮正确边界是：保留数据库字段、SQL、后端函数和兼容路由；实际环境显式设置两个开关为 `false`；从 Android、顾客页和 `admin_manage` 移除 Access Code 的可见 UI、输入、请求字段和轮换入口。Windows 与员工 Web 的交互 UI 已冻结，不为此同步重构。未来物理删除必须另立后端/数据库清理任务。
10. 验收报告必须分别列出：修改文件、数据库改动（必须为 0）、自动化结果、Samsung 平板型号/Android 版本/显示设置、截图证据和仍未验证项。
