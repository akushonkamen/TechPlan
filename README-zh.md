[English](README.md)

<div align="center">

# TechPlan

**技术情报与推理平台**

贯穿情报采集、知识抽取、图谱构建到分析报告的全链路技术情报平台。
六步智能流水线。Markdown 技能引擎。实时 WebSocket 推送。

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
| 定期报告全靠手动汇总 | 周五下午赶周报，遗漏关键事件 | 定时调度自动生成 7 种类型报告 |
| 新技术方案缺乏量化评估 | 凭经验拍板，事后复盘 | 10 维度评分卡 + 基于证据的决策建议 |

---

## 核心架构

### 报告生成流水线（六步）

```
  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
  │ ①research │──▶│ ②extract │──▶│③sync-graph│──▶│ ④report  │──▶│⑤image-gen│──▶│ ⑥pptx   │
  │ 情报采集  │   │ 知识抽取  │   │ 图谱同步  │   │ AI 报告   │   │ 封面+插图 │   │ PPT 导出 │
  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
        │              │              │              │              │              │
        └── 数据充足时跳过 ──┘              │              └── Z-Image 服务 ──┘
                                                   │
                              已有数据时跳过 ①②③ ──┘
```

每一步都支持条件跳过：数据充足时跳过采集，实体已存在时跳过抽取，抽取跳过时跳过图谱同步。

### 实时通信

```
  Browser ──── WebSocket ────┐
                              ▼
  ┌─ Express Server ──────────────────────────┐
  │  Skill Executor (Claude CLI, stream-json) │
  │       │                                   │
  │       ▼ stream-json 内部事件               │
  │       │  tool_use → 人类可读进度文本        │
  │       │  tool_result → 结果摘要            │
  │       ▼                                   │
  │  WebSocket Broadcast (progress/result/error)│
  │       └──▶ 所有订阅该 executionId 的客户端 │
  └───────────────────────────────────────────┘
```

---

## 功能特性

### 仪表盘

实时统计卡片（活跃主题、周采集文档数、待审核项、预警数），面积图展示采集趋势，柱状图展示主题证据分布。情报亮点面板显示预测关联、异常实体和核心实体，趋势信号面板展示各主题文档变化率，智能告警区域实时展示预警报告。

### 主题管理

创建和追踪技术主题，配置关键词、优先级、采集范围和频率（每日/每周/每月）。支持文档列表查看和文件上传分析。每个主题可独立配置报告调度（日/周/月/季报开关）。

### 知识图谱

SVG 自定义图谱，支持 7 种布局模式：地形图（默认，LLM 语义聚类）、聚焦、时间线、网格、雷达、矩阵、环形。节点/边搜索高亮，6 个分析维度（统计、路径、中心性、社区、预测、异常）。支持 JSON 和 SVG 导出。

### 分析报告

自动生成 7 种报告类型：日报、周报、月报、季报、专题报告、竞品报告、预警报告。报告支持封面图片生成（Z-Image 服务）和 PPT 导出。内置新鲜度机制自动标记过期状态。支持选中文字片段展开 AI 深度讨论，讨论结果可钉回报告章节。

### 决策支持

10 维度评分卡量化评估技术方案（技术成熟度、学术热度、产业化速度、竞争拥挤度等），支持竞品追踪，提供基于证据的决策建议（持续跟踪/小规模试点/重点投入等）。

### 技能系统

基于 Markdown 的可扩展技能引擎。技能定义为 `.md` 文件 + YAML frontmatter，支持参数模板渲染。内置 13 个技能覆盖采集、抽取、图谱同步、报告生成、优化、竞品追踪和讨论展开。

### 审核台

对低置信度的抽取结果进行人工复核，支持三种审核任务：声明审核、实体对齐、矛盾检测。支持批量通过，保障数据质量。

---

## 快速开始

<details>
<summary><strong>一键安装（推荐）</strong></summary>

跨平台脚本自动检测并安装 Node.js 18+、Claude Code CLI，完成依赖安装和项目构建。

**macOS / Linux：**

```bash
bash scripts/setup.sh
```

**Windows（管理员 PowerShell）：**

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\setup.ps1
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
  "schedulerCheckIntervalMinutes": 30,
  "aiProvider": "openai",
  "openaiApiKey": "your-api-key",
  "openaiBaseUrl": "https://api.openai.com/v1",
  "openaiModel": "gpt-4o-mini",
  "services": {
    "zImageUrl": "http://127.0.0.1:8000",
    "pptMasterDir": ""
  }
}
```

或使用环境变量：

| 变量 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `PORT` | `3000` | 服务端口 |
| `ADMIN_TOKEN` | — | 管理员认证 Token |
| `MAX_UPLOAD_SIZE_MB` | `10` | 文件上传大小限制 |
| `OPENAI_API_KEY` | — | AI 服务 API 密钥 |
| `OPENAI_BASE_URL` | — | AI 服务 API 地址 |
| `OPENAI_MODEL` | — | AI 模型名称 |
| `SCHEDULER_ENABLED` | `true` | 是否启用定时调度 |

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
| 数据库 | SQLite（主存储）, Kuzu（本地图缓存，SQLite 自动回退） |
| AI | Claude CLI + stream-json 输出 |
| 实时通信 | WebSocket (ws) |
| 图表 | Recharts 3 |
| 图谱 | 自定义 SVG 画布 |
| 图片生成 | Z-Image（本地部署） |
| 文档导出 | PPTX（ppt-master） |

---

## 项目结构

```
TechPlan/
├── src/
│   ├── App.tsx                # React 入口 + 路由定义
│   ├── main.tsx               # 渲染根节点
│   ├── components/            # 通用 UI 组件
│   ├── pages/                 # 页面组件（8 个）
│   ├── services/              # 服务层
│   │   ├── imageGeneration.ts # Z-Image 封面/插图生成
│   │   ├── imagePromptSchema.ts # 图片提示词校验
│   │   ├── pptxExport.ts      # PPTX 导出
│   │   ├── reportService.ts   # 报告迁移辅助
│   │   └── topicService.ts    # 主题 API
│   ├── hooks/                 # 自定义 Hooks
│   ├── schemas/               # 校验 Schema
│   ├── lib/                   # 工具库（布局、图分析、设计系统）
│   ├── types/                 # 类型定义模块
│   ├── db/                    # 数据库客户端（Kuzu）
│   ├── server/                # 后端服务
│   │   ├── index.ts           # Express 入口
│   │   ├── reportHandler.ts   # 报告流水线编排（6 步）
│   │   ├── db.ts              # SQLite 连接
│   │   ├── middleware.ts      # 认证与配置中间件
│   │   └── routes/            # API 路由（skills, reports, topics, graph, dashboard, reviews, config）
│   ├── skillExecutor.ts       # Claude CLI 执行引擎（stream-json）
│   ├── skillRegistry.ts       # Markdown 技能加载器
│   ├── scheduler.ts           # 报告调度 + 预警检测
│   └── websocket.ts           # WebSocket 实时推送
├── scripts/                   # 安装与启动脚本
│   ├── setup.sh               # macOS/Linux 一键安装
│   └── setup.ps1              # Windows 一键安装
├── .claude/skills/            # Markdown 技能定义（13 个内置技能）
└── public/                    # 静态资源
```

### 页面路由

| 路由 | 页面 | 说明 |
| ---- | ---- | ---- |
| `/` | 仪表盘 | 统计概览、情报亮点、趋势信号、预警 |
| `/topics` | 主题管理 | 创建/编辑/采集/配置调度 |
| `/graph` | 知识图谱 | 7 种布局可视化 + 6 维分析 |
| `/reports` | 分析报告 | 查看/生成/PPT 导出/展开讨论 |
| `/review` | 审核台 | 声明审核/实体对齐/矛盾检测 |
| `/decision` | 决策支持 | 10 维评分卡 + 竞品追踪 |
| `/settings` | 系统设置 | AI/图数据库/技能/调度配置 |
| `/tasks` | 任务中心 | 执行监控与历史 |

---

## 常见问题

**Q: 启动时提示"未配置 API Key"**

在 `config.json` 中设置 `openaiApiKey` 字段，或设置环境变量 `OPENAI_API_KEY`。

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

**Q: 封面图片生成失败**

确保 Z-Image 服务已启动且可访问（默认 `http://127.0.0.1:8000`），图片生成步骤会自动跳过不可用的服务。

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
