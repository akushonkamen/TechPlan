<div align="center">
<img width="1200" height="475" alt="TechPlan Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# TechPlan - 技术情报与推理平台

TechPlan 是一个智能技术情报采集、分析与决策支持平台，帮助用户追踪技术动态、构建知识图谱、生成分析报告并提供决策建议。

## 功能特性

- **📊 仪表盘** - 实时统计数据与趋势可视化
- **📁 主题管理** - 创建和管理技术追踪主题
- **🕸️ 知识图谱** - 可视化实体关系与证据链
- **🎯 决策支持** - 多维度评分卡与决策建议
- **📄 分析报告** - 自动生成周报与专题报告
- **📡 数据采集** - AI 驱动的实时情报检索
- **✅ 审核台** - 人工复核低置信度抽取结果
- **⚙️ 系统设置** - AI 服务与数据库配置

---

## 环境准备要求

### 操作系统
- **Linux** (Ubuntu 20.04+, CentOS 8+, Debian 11+)
- **macOS** 12.0+
- **Windows** 10/11 (需 WSL2 或 PowerShell)

### 软件依赖

| 软件 | 最低版本 | 推荐版本 | 检查命令 |
|-----|---------|---------|---------|
| Node.js | 18.0.0 | 20.x LTS | `node --version` |
| npm | 9.0.0 | 10.x | `npm --version` |
| Git | 2.0.0 | 最新版 | `git --version` |

### 可选依赖

| 软件 | 用途 | 安装方式 |
|-----|-----|---------|
| Neo4j | 图数据库（生产环境推荐） | [官方文档](https://neo4j.com/docs/operations-manual/current/installation/) |
| SQLite | 关系型数据库（内置，无需安装） | - |

---

## 安装步骤

### 1. 克隆项目

```bash
# HTTPS 方式
git clone https://github.com/akushonkamen/TechPlan.git

# SSH 方式（推荐）
git clone git@github.com:akushonkamen/TechPlan.git

# 进入项目目录
cd TechPlan
```

### 2. 安装依赖

```bash
# 安装所有依赖包
npm install
```

> **注意**：如果遇到 `sqlite3` 编译错误，可能需要安装编译工具：
> ```bash
> # Ubuntu/Debian
> sudo apt-get install build-essential python3
>
> # macOS (Xcode Command Line Tools)
> xcode-select --install
>
> # Windows (以管理员身份运行)
> npm install --global windows-build-tools
> ```

### 3. 配置文件设置

#### 方式一：使用配置文件（推荐）

创建 `config.json` 文件：

```bash
cp config.example.json config.json
```

编辑 `config.json`：

```json
{
  "aiProvider": "openai",
  "openaiApiKey": "your-api-key-here",
  "openaiBaseUrl": "https://api.openai.com/v1",
  "openaiModel": "gpt-4o-mini",
  "geminiModel": "gemini-2.5-flash-preview",
  "neo4jUri": "bolt://localhost:7687",
  "neo4jUser": "neo4j",
  "neo4jPassword": ""
}
```

#### 方式二：使用环境变量

创建 `.env` 文件：

```bash
# OpenAI 配置
OPENAI_API_KEY=your-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# 或 Gemini 配置
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash-preview

# Neo4j 配置（可选）
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
```

#### AI 服务配置说明

| 提供商 | 配置项 | 说明 |
|-------|-------|------|
| **OpenAI** | `openaiApiKey` | OpenAI API Key |
| | `openaiBaseUrl` | API 端点（支持兼容服务） |
| | `openaiModel` | 模型名称，如 `gpt-4o`, `gpt-4o-mini` |
| **Gemini** | `geminiApiKey` | Google AI API Key |
| | `geminiModel` | 模型名称，如 `gemini-2.5-flash-preview` |
| **自定义** | `customApiKey` | 兼容 OpenAI API 的服务密钥 |
| | `customBaseUrl` | 自定义 API 端点 |
| | `customModel` | 模型名称 |

### 4. 数据库初始化

SQLite 数据库会在首次启动时自动创建，无需手动初始化。

如果使用 Neo4j 图数据库：

```bash
# 确保 Neo4j 服务已启动
# Ubuntu
sudo systemctl start neo4j

# macOS (Homebrew)
brew services start neo4j

# Docker
docker run -d --name neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:latest
```

### 5. 启动开发环境

```bash
# 开发模式（热重载）
npm run dev
```

### 6. 生产环境部署

```bash
# 构建生产版本
npm run build

# 启动生产服务
npm start
```

---

## 验证流程

### 检查服务是否成功启动

启动成功后，终端应显示：

```
No existing graph data found, starting with empty storage
Using JSON file storage: /path/to/TechPlan/data/graph-data.json
GraphService initialized with backend: json
Graph database initialized with backend: json
Server running on http://localhost:3000
```

### 访问应用

打开浏览器访问：**http://localhost:3000**

### 功能检查清单

| 检查项 | 预期结果 |
|-------|---------|
| 仪表盘页面加载 | 显示统计卡片和图表 |
| 主题管理 | 可以创建/编辑/删除主题 |
| 知识图谱 | 显示图谱可视化界面 |
| 决策支持 | 显示评分卡和分析界面 |
| 系统设置 | 可以保存 AI 配置 |
| 数据采集 | 点击采集后能获取数据 |

### API 健康检查

```bash
# 检查 API 状态
curl http://localhost:3000/api/topics

# 检查图数据库状态
curl http://localhost:3000/api/graph/status
```

---

## 项目结构

```
TechPlan/
├── server.ts              # Express 后端服务入口
├── config.json            # 配置文件（需创建）
├── database.sqlite        # SQLite 数据库（自动生成）
├── package.json           # 项目依赖
├── tsconfig.json          # TypeScript 配置
├── vite.config.ts         # Vite 配置
├── src/
│   ├── App.tsx            # React 应用入口
│   ├── main.tsx           # 渲染入口
│   ├── types.ts           # 类型定义
│   ├── components/        # UI 组件
│   │   ├── Layout.tsx
│   │   ├── GraphVisualization.tsx
│   │   └── TopicForm.tsx
│   ├── pages/             # 页面组件
│   │   ├── Dashboard.tsx
│   │   ├── Topics.tsx
│   │   ├── KnowledgeGraph.tsx
│   │   ├── DecisionSupport.tsx
│   │   ├── Reports.tsx
│   │   ├── DataSources.tsx
│   │   ├── ReviewConsole.tsx
│   │   └── Settings.tsx
│   ├── services/          # 业务服务
│   │   ├── aiService.ts
│   │   ├── agentService.ts
│   │   ├── extractionService.ts
│   │   ├── reasoningService.ts
│   │   ├── graphService.ts
│   │   └── ...
│   ├── db/                # 数据库模块
│   │   └── neo4j.ts
│   └── lib/               # 工具函数
│       └── utils.ts
└── data/                  # 数据存储
    └── graph-data.json    # 图谱 JSON 存储
```

---

## 常见问题

### Q: 启动时提示 "未配置 API Key"

**A:** 请确保 `config.json` 文件存在且包含有效的 API Key：

```bash
# 检查配置文件
cat config.json

# 如果不存在，创建配置文件
echo '{
  "aiProvider": "openai",
  "openaiApiKey": "your-key-here",
  "openaiModel": "gpt-4o-mini"
}' > config.json
```

### Q: 端口 3000 被占用

**A:** 终止占用端口的进程：

```bash
# Linux/macOS
lsof -ti:3000 | xargs kill -9

# 或修改端口
PORT=3001 npm run dev
```

### Q: SQLite 数据库错误

**A:** 删除数据库文件重新初始化：

```bash
rm database.sqlite
npm run dev
```

### Q: Neo4j 连接失败

**A:** 系统会自动降级到 JSON 文件存储模式，功能不受影响。如需使用 Neo4j：

1. 确保 Neo4j 服务已启动
2. 检查 `config.json` 中的连接配置
3. 确认防火墙允许 7687 端口

---

## 技术栈

- **前端**: React 19 + TypeScript + Vite + Tailwind CSS
- **后端**: Express + TypeScript
- **数据库**: SQLite + Neo4j (可选)
- **AI**: OpenAI / Google Gemini / 自定义兼容 API
- **可视化**: ReactFlow + Recharts

---

## License

Apache-2.0
