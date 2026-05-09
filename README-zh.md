[English](README.md)

<div align="center">

# TechPlan

**技术情报与推理平台**

贯穿情报采集、知识抽取、图谱构建到分析报告的全链路技术情报平台。
三阶段流水线。Markdown 技能引擎。实时 WebSocket 推送。

[![License](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)

</div>

---

## 为什么需要 TechPlan

技术团队每天面对海量技术动态，靠人工追踪既慢又容易遗漏关键信号。

| 痛点 | 传统方式 | TechPlan 方案 |
| ---- | -------- | ------------- |
| 技术动态分散在数十个来源 | 人工浏览、截图、Excel 整理 | AI 驱动自动采集，按主题聚合 |
| 信息碎片化，看不到关联 | 各自记忆，知识随人员流失 | 知识图谱自动构建实体关系与证据链 |
| 定期报告全靠手动汇总 | 周五下午赶周报，遗漏关键事件 | 定时调度自动生成日/周/月/季报 |
| 新技术方案缺乏量化评估 | 凭经验拍板，事后复盘 | 多维度评分卡 + 基于证据的决策建议 |

---

## 核心架构

### 三阶段情报流水线

```
  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
  │  ① research      │     │  ② extract      │     │  ③ sync-graph   │
  │  情报采集         │────▶│  知识抽取         │────▶│  图谱同步         │
  │                  │     │                  │     │                  │
  │  多源扫描        │     │  实体 / 关系      │     │  SQLite → Kuzu   │
  │  文档入库        │     │  声明 / 事件      │     │  节点 + 边写入    │
  └─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 报告生成链路

```
  调度器触发 / 手动触发
       │
       ▼
  ┌──────────┐     ┌──────────┐     ┌──────────┐
  │  采集数据  │────▶│  AI 分析  │────▶│  生成报告  │
  │  时间窗口  │     │  趋势识别  │     │  Markdown │
  │  按主题    │     │  证据聚合  │     │  + 封面图  │
  └──────────┘     └──────────┘     └──────────┘
```

### 实时通信

```
  Browser ──── WebSocket ────┐
                              ▼
  ┌─ Express Server ──────────────────────────┐
  │  Skill Executor (Claude CLI, stream-json) │
  │       │                                   │
  │       ▼ progress / tool_use / tool_result │
  │  WebSocket Broadcast ──▶ 所有订阅客户端    │
  └───────────────────────────────────────────┘
```

---

## 功能特性

### 仪表盘

实时统计卡片（活跃主题、周采集文档数、待审核项、预警数），趋势折线图展示采集量变化，柱状图展示主题证据分布，底部活动流实时更新。

### 主题管理

创建和追踪技术主题，配置关键词、优先级、采集范围和频率（每日/每周/每月）。支持文档列表查看和文件上传分析。

### 知识图谱

SVG 自定义图谱，支持聚焦、时间线、网格三种布局。节点/边搜索高亮，LLM 驱动的智能聚类分析，可导出 JSON。

### 分析报告

自动生成 7 种报告类型：日报、周报、月报、季报、专题报告、竞品报告、预警报告。每个主题可配置独立的报告调度。

### 决策支持

多维度评分卡量化评估技术方案，支持竞品追踪、场景建模和影响分析，提供基于证据的决策建议。

### 技能系统

基于 Markdown 的可扩展技能引擎。技能定义为 `.md` 文件 + YAML frontmatter，支持参数模板渲染。内置 12 个技能覆盖采集、抽取、图谱同步和报告生成。

### 审核台

对低置信度的抽取结果（实体、关系、声明、事件）进行人工复核，支持批量通过/拒绝，保障数据质量。

---

## 快速开始

<details>
<summary><strong>一键安装（推荐）</strong></summary>

跨平台脚本自动检测并安装 Node.js 18+、Claude Code CLI，完成依赖安装和项目构建。

**macOS / Linux：**

```bash
bash setup.sh
```

**Windows（管理员 PowerShell）：**

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\setup.ps1
```

</details>

<details>
<summary><strong>手动安装</strong></summary>

**环境要求：**

| 依赖 | 版本 | 检查命令 |
| ---- | ---- | -------- |
| Node.js | >= 18.0.0 | `node --version` |
| npm | >= 9.0.0 | `npm --version` |
| Git | >= 2.0.0 | `git --version` |

**安装：**

```bash
git clone https://github.com/akushonkamen/TechPlan.git
cd TechPlan
npm install
```

</details>

<details>
<summary><strong>配置</strong></summary>

创建 `config.json`：

```json
{
  "schedulerEnabled": false,
  "services": {
    "zImageUrl": "http://127.0.0.1:8000"
  }
}
```

或使用环境变量：

| 变量 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `PORT` | `3000` | 服务端口 |
| `ADMIN_TOKEN` | — | 管理员认证 Token |
| `MAX_UPLOAD_SIZE_MB` | `10` | 文件上传大小限制 |

</details>

**启动：**

```bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm run build && npm start
```

启动后访问 **http://localhost:3000**

---

## 技术栈

| 层级 | 技术 |
| ---- | ---- |
| 前端 | React 19, TypeScript, Vite, Tailwind CSS v4 |
| 后端 | Express, Node.js |
| 数据库 | SQLite（主存储）, Kuzu（本地图缓存） |
| AI | Claude CLI + stream-json 输出 |
| 实时通信 | WebSocket (ws) |
| 图表 | Recharts |
| 图谱 | 自定义 SVG 画布 |

---

## 项目结构

```
TechPlan/
├── server.ts              # Express 后端服务
├── setup.sh / setup.ps1   # 一键安装脚本
├── config.json            # 配置文件
├── database.sqlite        # SQLite 数据库（自动生成）
├── src/
│   ├── App.tsx            # React 入口
│   ├── main.tsx           # 渲染根节点
│   ├── components/        # UI 组件
│   ├── pages/             # 页面组件
│   ├── services/          # API 服务
│   ├── hooks/             # 自定义 Hooks
│   ├── schemas/           # 校验 Schema
│   ├── db/                # 数据库客户端
│   ├── skillExecutor.ts   # Claude CLI 执行引擎
│   ├── skillRegistry.ts   # Markdown 技能加载器
│   ├── scheduler.ts       # 报告调度器
│   └── websocket.ts       # WebSocket 实时更新
├── .claude/skills/        # Markdown 技能定义（12 个内置技能）
└── public/                # 静态资源
```

### 页面路由

| 路由 | 页面 | 说明 |
| ---- | ---- | ---- |
| `/` | 仪表盘 | 统计概览与趋势 |
| `/topics` | 主题管理 | 创建/编辑/采集 |
| `/graph` | 知识图谱 | 图谱可视化与分析 |
| `/reports` | 分析报告 | 查看/生成报告 |
| `/review` | 审核台 | 人工复核抽取结果 |
| `/decision` | 决策支持 | 评分卡与建议 |
| `/settings` | 系统设置 | AI/图数据库/技能/调度配置 |
| `/tasks` | 任务中心 | 执行监控与历史 |

---

## 常见问题

**Q: 启动时提示"未配置 API Key"**

创建 `config.json` 并填入有效的 API Key。

**Q: 端口 3000 被占用**

```bash
lsof -ti:3000 | xargs kill -9
# 或使用其他端口
PORT=3001 npm run dev
```

**Q: 图谱没有数据**

先对主题执行采集（research → extract → sync-graph），或手动触发同步：

```bash
curl -X POST http://localhost:3000/api/graph/sync/<topicId>
```

---

## 开源协议

本项目采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 协议。

**你可以自由地：**
- 共享 — 在任何媒介以任何形式复制、发行本作品
- 改编 — 修改、转换或以本作品为基础进行创作

**须遵守下列条件：**
- **署名** — 必须给出适当的版权声明
- **非商业性使用** — 不得将本作品用于商业目的
- **相同方式共享** — 再创作须采用相同的协议
