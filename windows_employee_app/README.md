# Windows Employee App

> [!IMPORTANT]
> 本文件下方的员工交互功能清单描述的是仓库历史实现，不再代表当前产品方向。正式员工操作端只有 Samsung Android 平板 App。Windows 端停止员工 UI 功能迭代，现阶段只冻结保留登录打印 worker 所需的兼容流程、打印机配置、打印任务领取、小票渲染、真实打印和结果回报。不得依据本 README 要求同步重做 Windows 员工界面。

这个目录保留历史 Windows 员工端桌面实现。当前产品不再把 Android 员工业务迁移或同步到 Windows；Windows 的正式职责是后台领取打印任务并驱动门店打印机。

当前已切到 `Electron 22.3.27` 兼容线，用于支持 `Windows 7 / 8 / 8.1`。

## 历史实现功能（不再继续更新 UI）

- 员工登录 / 退出登录
- 订单轮询刷新
- 新订单提示音
- 订单状态流转
- 菜品已送 / 未送切换
- 菜品数量增减
- 给订单加菜
- 查看包厢当前 session
- 顾客已结 / 未结标记
- 包厢结单清零
- 可配置服务端地址

## 开发

```bash
cd windows_employee_app
npm install
npm start
```

## 打包 Windows 安装程序

```bash
cd windows_employee_app
npm install
npm run dist:win:x64
npm run dist:win:ia32
```

打包结果会输出到 `windows_employee_app/dist/`。

针对旧版 Windows 兼容测试时，也可以单独输出到独立目录：

- `dist_win7_ia32/`：Windows 7 32-bit
- `dist_win7_x64/`：Windows 7 64-bit
