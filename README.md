[English](readme-zh.md)

<div align="center">

# TechPlan

**技术情报与推理平台**

智能技术情报采集、知识图谱构建与分析报告生成

[![License](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)

</div>

---

## 功能特性

### 仪表盘

实时展示系统运行状态，包含活跃主题数、周采集文档数、待审核项和预警数等统计卡片，趋势折线图展示采集量变化，柱状图展示主题证据分布，底部活动流实时更新。

### 主题管理

创建和管理技术追踪主题，每个主题可配置关键词、优先级、采集范围和采集频率（每日/每周/每月）。支持文档列表查看和文件上传分析。

### 知识图谱

基于 SVG 的自定义图谱可视化，支持聚焦、时间线、网格三种布局模式，节点/边搜索高亮，LLM 驱动的图谱智能聚类分析，可导出 JSON 格式数据。

### 决策支持

多维度评分卡对技术方案进行量化评估，支持竞品组织追踪、场景建模和影响分析，提供基于证据的决策建议。

### 分析报告

自动生成多种类型报告：
- **日报** — 每日技术动态摘要
- **周报** — 一周技术趋势总结
- **月报** — 月度技术发展回顾
- **季报** — 季度技术战略分析
- **专题报告** — 深度技术主题分析
- **竞品报告** — 竞争对手动态追踪
- **预警报告** — 异常信号和风险提醒

### 技能系统

基于 Markdown 的可扩展技能引擎，技能定义为 `.md` 文件 + YAML frontmatter，支持参数模板渲染。核心三阶段流水线：

```
research（情报采集）→ extract（知识抽取）→ sync-graph（图谱同步）
```

内置 12 个技能：情报采集、知识抽取、图谱同步、模型优化、竞品追踪，以及 7 种报告生成技能。

### 定时调度

按主题配置的采集频率自动触发采集和报告生成，支持 5-1440 分钟自定义检查间隔，可视化展示待触发主题和最近触发记录。

### 审核台

对低置信度的抽取结果（实体、关系、声明、事件）进行人工复核，支持批量通过/拒绝，保障数据质量。

---

## 一键安装

提供跨平台一键安装脚本，自动检测并安装 Node.js 18+、Claude Code CLI，完成依赖安装和项目构建。

### macOS / Linux

```bash
bash setup.sh
```

脚本会自动：
1. 检测操作系统
2. 检查/安装 Node.js 18+（Homebrew 或 nvm）
3. 检查/安装 Claude Code CLI
4. 安装依赖并构建项目
5. 引导 Claude Code 认证

### Windows

以管理员身份打开 PowerShell：

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\setup.ps1
```

脚本会自动通过 winget 或 MSI 安装 Node.js，其余流程与 Linux 版一致。

---

## 手动安装

### 环境要求

| 依赖 | 版本 | 检查命令 |
|-----|------|---------|
| Node.js | >= 18.0.0 | `node --version` |
| npm | >= 9.0.0 | `npm --version` |
| Git | >= 2.0.0 | `git --version` |

### 安装步骤

```bash
git clone https://github.com/akushonkamen/TechPlan.git
cd TechPlan
npm install
```

### 配置

创建 `config.json`：

```json
{
  "aiProvider": "openai",
  "openaiApiKey": "your-api-key",
  "openaiBaseUrl": "https://api.openai.com/v1",
  "openaiModel": "gpt-4o-mini"
}
```

或使用环境变量：

```bash
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

### 启动

```bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm run build && npm start
```

启动成功后访问 **http://localhost:3000**

---

## AI 服务配置

| 提供商 | 配置项 | 说明 |
|-------|-------|------|
| **OpenAI** | `openaiApiKey`, `openaiBaseUrl`, `openaiModel` | OpenAI API 或兼容服务 |
| **自定义** | `customApiKey`, `customBaseUrl`, `customModel` | 任意兼容 OpenAI API 的服务 |

---

## 技术栈

| 层级 | 技术 |
|-----|------|
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
├── setup.sh               # macOS/Linux 一键安装脚本
├── setup.ps1              # Windows 一键安装脚本
├── config.json            # 配置文件（需创建）
├── database.sqlite        # SQLite 数据库（自动生成）
├── src/
│   ├── App.tsx            # React 入口
│   ├── main.tsx           # 渲染根节点
│   ├── components/        # UI 组件
│   ├── pages/             # 页面组件
│   ├── services/          # API 服务
│   ├── hooks/             # 自定义 Hooks
│   ├── db/                # 数据库客户端
│   ├── skillExecutor.ts   # Claude CLI 执行引擎
│   ├── skillRegistry.ts   # 技能加载器
│   ├── scheduler.ts       # 报告调度器
│   └── websocket.ts       # 实时更新
├── .claude/skills/        # Markdown 技能定义（12 个内置技能）
└── public/                # 静态资源
```

---

## 页面路由

| 路由 | 页面 | 说明 |
|-----|------|------|
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
