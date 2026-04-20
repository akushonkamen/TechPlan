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

- **仪表盘** - 实时统计数据与趋势可视化
- **主题管理** - 创建和管理技术追踪主题
- **知识图谱** - 可视化实体关系与证据链
- **决策支持** - 多维度评分卡与决策建议
- **分析报告** - 自动生成日报、周报、月报与季报
- **数据采集** - AI 驱动的实时情报检索
- **审核台** - 人工复核低置信度抽取结果
- **技能系统** - 基于 Markdown 的可扩展技能流水线

---

## 快速开始

### 环境要求

| 依赖 | 版本 | 检查命令 |
|-----|------|---------|
| Node.js | >= 18.0.0 | `node --version` |
| npm | >= 9.0.0 | `npm --version` |
| Git | >= 2.0.0 | `git --version` |

### 安装

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
├── config.json            # 配置文件
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
├── .claude/skills/        # Markdown 技能定义
└── public/                # 静态资源
```

---

## 页面路由

| 路由 | 页面 |
|-----|------|
| `/` | 仪表盘 |
| `/topics` | 主题管理 |
| `/graph` | 知识图谱 |
| `/reports` | 分析报告 |
| `/review` | 审核台 |
| `/decision` | 决策支持 |
| `/settings` | 系统设置 |
| `/tasks` | 任务中心 |

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

手动触发同步：

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
