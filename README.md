# DSH Follow-up · 个人想法与跟进待办

v0.1.3，目标运行时 DeepSeek Harness 0.2.2-rc.3。

记录你自己的想法，以及与 Agent 聊完之后仍需要自己推进的事项。只需标题即可记录，之后再分类、安排日期、设置提醒和标记完成。

## 已实现

- 快速输入标题回车，保存到收集箱；详情支持备注、象限、合并的截止日期与时间选择器。
- 四象限、月历、周时间轴、统计列表，共用日期导航与筛选。
- 侧边栏「待办」按宿主「作品」entry 排在其后；可由宿主固定/取消固定。
- 回复「用量」之后的「加入待办」按钮，使用 DSH 默认/悬停配色；转发后保留有限来源引用，可返回会话。同一回复重复点击打开已有事项。
- 完成、撤销完成、软删除；本地持久化、版本冲突提示、请求幂等和损坏备份恢复。
- 不提醒 / 到期时 / 提前 10 分钟。提醒在应用内保留；浏览器允许时可尝试系统通知。
- 前端使用官方 shadcn 源码组件、Radix 和 Lucide；共享 DSH 的 React 实例，不注入全局 reset。

## v0.1.3 布局修复

统计表在剩余内容区域独立滚动，表头固定；支持滚轮和键盘浏览末行。标题栏使用 DSH 提供的 `--dsh-frame-leading-clearance`，侧栏收起和全屏切换时自动避让窗口与导航按钮。

## v0.1.2 增补

统计列表的日期弹层新增「全部日期」，统计卡片与表格同时按全部日期计算；选择日期、今天或前后月份可恢复月份筛选。会话「加入待办」使用列表加号图标，保存后「已加入待办」切换列表勾选图标，点击可查看已有待办，删除后恢复加号。

## v0.1.1 交互修复

日期与时间合在同一面板，参考 Ant Design 的日历加时分双列交互，继续使用 shadcn / Radix 的组件基础。支持任意分钟、今天/明天/一周后、此刻、仅日期和不设截止时间；点击确定后生效，外点或 Escape 取消临时选择。已移除系统原生时间弹窗和字段外的清除 ×。输入框焦点样式、详情标题、关闭按钮热区、弹窗与转发侧栏尺寸也已按设计校准。

## 安装到 Desktop

从 [GitHub Releases](https://github.com/996559536-commits/dsh-followup/releases) 下载 `dsh-followup-0.1.3.tgz`。源码包含完整开发工程，安装包包含构建后的运行时文件。

v0.1.3 已安装到开发机的 Desktop profile，并在真实桌面 App 中确认统计表可滚动到首末行、表头固定，以及全屏收起侧栏后的标题避让。其他交互与提醒的验证见 [VERIFICATION.md](VERIFICATION.md)。本机配置备份、用户数据和会话不会上传至仓库或打包。

从源码安装时，先在本项目目录执行 `npm ci` 和 `npm run build`，再到 DSH「插件 → 添加插件」输入该目录的绝对路径，点击安装并按宿主提示重新加载。

也可以使用 Desktop 自带的官方 CLI 安装打包产物：

```bash
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add /absolute/path/dsh-followup-0.1.3.tgz
```

命令使用目标 profile；请保留实际安装包绝对路径。插件拥有独立 ID `dsh-followup` 和数据目录，不读取其他待办插件的数据。第一版不做旧插件迁移。

## 数据与 Web 配置

Desktop 数据：当前 Desktop profile 的 `data/dsh-followup/state.json`，同目录有备份。卸载不删除数据；备份整个目录即可。

普通 Web Host 需要显式配置本插件的绝对 `dataDir`，或设置 `DSH_FOLLOWUP_DATA_DIR=/absolute/path/data`。Host 同一目录只允许一个写入进程。插件 API 位于 `/dsh-followup/api`，使用宿主访问校验与同源请求。

## 开发与预览

```bash
npm ci
npm run build
npm run typecheck
npm test
npm run preview
```

预览默认 `http://127.0.0.1:4178`，使用 `.preview-data`；转发流程中的会话是明确标记的演示数据。真实 DSH 的验证结果另见 [VERIFICATION.md](VERIFICATION.md)。`npm test` 使用构建后的领域代码，先运行 build。

源码结构与接口说明见 [ARCHITECTURE.md](ARCHITECTURE.md)，开发执行记录见 [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md)。`vendor/shadcn` 保留官方 registry 来源；`lib/THIRD_PARTY_NOTICES.txt` 包含构建产物的第三方许可。

## 当前边界

- 本插件不调用模型、派发 Agent 或自动执行事项。
- 来源跳转打开原会话，暂不精确滚动到某条消息。来源不存在时，待办内容和引用仍保留。
- Host 活着时才会生成到点事件。完全退出 DSH 或电脑休眠时不能保证准点系统通知；重新打开后按补偿窗口保留应用内提醒。
- 系统通知受浏览器/操作系统权限影响，未使用私有 Electron 通知接口。应用内提醒已实际验证，原生 OS 弹窗尚未验收。
- 已在当前 Desktop 插件组合中确认「待办」位于「作品」之后；其他第三方主题和侧栏插件版本仍可能有差异。
- 未发布 npm；安装包通过 GitHub Releases 分发，不包含测试数据、会话或登录信息。
