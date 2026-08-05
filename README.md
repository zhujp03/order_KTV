# Order System 项目说明

这是一个面向 KTV、包厢餐饮和桌台服务场景的扫码点单系统。顾客扫描桌台/包厢二维码，员工开台后输入姓名即可建立会话、浏览菜单和提交订单；现场员工只使用为 Samsung 安卓平板设计的 Android App 接单、改单、送达、合单/分单、结算和历史回看；经营者通过管理页维护菜单、二维码、员工与日结记录。

项目当前采用单体架构：一个 Node.js/Express 进程同时提供 HTTP API 和静态页面，业务数据保存在本机 SQLite 数据库中。它适合单店、单服务实例的轻量部署，不等同于已经完成多门店、高可用或合规支付能力的成熟 POS。

## 文档导航

建议按以下顺序阅读：

1. [UI 重构最高强制约束](docs/00_MANDATORY_CONSTRAINTS.md)
2. [项目含义、目标与边界](docs/01_PROJECT_PURPOSE.md)
3. [整体架构与目录结构](docs/02_ARCHITECTURE.md)
4. [核心业务流程](docs/03_BUSINESS_WORKFLOWS.md)
5. [后端 API 说明](docs/04_API_REFERENCE.md)
6. [数据库与数据模型](docs/05_DATABASE_MODEL.md)
7. [各客户端实现说明](docs/06_CLIENTS.md)
8. [配置、启动与部署](docs/07_CONFIGURATION_AND_DEPLOYMENT.md)
9. [安全、限制与上线前事项](docs/08_SECURITY_AND_LIMITATIONS.md)
10. [源文件逐项导览与验证指南](docs/09_SOURCE_AND_VALIDATION.md)
11. [Samsung 安卓平板员工端 UI 最终规格](docs/10_SAMSUNG_ANDROID_TABLET_UI_SPEC.md)
12. [`admin_manage` 经营后台 UI 最终规格](docs/11_ADMIN_MANAGE_UI_SPEC.md)
13. [UI 重构详细实施步骤](docs/12_UI_REFACTOR_IMPLEMENTATION_PLAN.md)
14. [可直接复制给实施 Agent 的 Prompt](docs/13_AGENT_IMPLEMENTATION_PROMPT.md)

> [!IMPORTANT]
> `docs/00_MANDATORY_CONSTRAINTS.md` 是本次 UI 重构的最高优先级规则。Android 和 `admin_manage` 只能重构 UI；只有“Android 新增只读历史回看”和“Access Code 从活动前端退役”两个功能集合例外。正式员工操作端只使用 Samsung 安卓平板 App；员工 Web 不投入使用，Windows 不再更新员工交互功能但继续作为固定小票打印工作端。数据库必须保持零改动，历史功能必须只读、经过员工鉴权并能分页读取全部记录。任何冲突方案不得实施。

## 最短启动路径

前提：已安装适用于当前依赖的 Node.js 与 npm。

```bash
npm install
cp .env.local.example .env
npm start
```

默认入口：

- 顾客端：`http://127.0.0.1:3000/`，实际点单应使用管理页生成的 `/o/<token>` 二维码链接。
- Samsung 安卓平板员工端：`apps/employee_app/`（正式现场员工入口）
- 员工接单 Web：`http://127.0.0.1:3000/admin`（仓库保留，现场基本不使用）
- 经营管理页：`http://127.0.0.1:3000/manage`
- 健康检查：`http://127.0.0.1:3000/api/health`

首次启动会自动创建 SQLite 表、示例菜单、两个示例包厢和默认员工账号。默认账号只用于初始化，必须在真实部署前更换；完整风险见[安全说明](docs/08_SECURITY_AND_LIMITATIONS.md)。

## 当前实现的关键业务规则

- 订单状态集合：`new`、`preparing`、`ready`、`served`、`cancelled`。
- 金额算法：小计 + 18% 服务费，再对“小计 + 服务费”收取 13% HST。
- 每个顾客会话拥有独立购物车，同一包厢可看到所有顾客的实时购物车汇总。
- 包厢支持 `split`（分开结账）和 `merged`（整房合并）两种结算模式。
- 分开结账时，必须把当前会话内所有顾客标记为已结，才能结单清零。
- 结单会归档活动订单、清空购物车并撤销顾客会话；Access Code 已从产品流程退役，目标部署必须关闭其校验和结单轮换。
- 小票打印继续使用“Samsung Android 提交打印任务 → 服务端打印队列 → 现有 Windows 打印工作端 → 门店打印机”的链路。Windows 员工交互界面不再继续更新，但打印功能必须保留和保持兼容。

## 事实边界

仓库中的代码证明上述流程已被实现，但当前根项目没有有效的自动化业务测试：`npm test` 只是输出提示文本。已有 Windows 安装包属于构建产物，不能单独证明真实打印机、真实 Windows 7 设备、AWS 公网部署、并发容量或安全验收已经完成。
