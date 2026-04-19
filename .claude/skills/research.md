---
version: "1.0.0"
display_name: "情报采集"
description: |
  系统性搜索和收集技术文档。支持多维度搜索（学术论文、技术新闻、
  GitHub 项目、产业报告），自动内容提取、去重，存入数据库。
category: research
timeout: 1200
params:
  - name: topicName
    type: string
    required: true
    description: "主题名称"
  - name: keywords
    type: string
    required: true
    description: "搜索关键词（JSON 数组字符串）"
  - name: organizations
    type: string
    required: true
    description: "关注组织（JSON 数组字符串）"
  - name: topicId
    type: string
    required: true
    description: "主题 ID"
  - name: maxResults
    type: number
    required: false
    default: 10
    description: "最大采集数量"
steps:
  - "广域扫描：多维度搜索（学术论文、技术新闻、GitHub、产业报告）"
  - "深度追踪：分析 Phase 1 结果中的具体技术/产品/竞品"
  - "缺口填补：检查关键词覆盖度，定向搜索薄弱环节"
  - "质量控制：时效性分层、来源可信度分层、语义去重"
  - "存储到 SQLite 数据库"
---

# 技术情报采集

你是一个技术情报采集专家。请根据以下参数，通过多轮搜索系统性地收集高质量技术文档。

## 任务参数

- 主题名称：{{topicName}}
- 关键词：{{keywords}}
- 关注组织：{{organizations}}
- 主题 ID：{{topicId}}
- 最大采集数量：{{maxResults}}

## 执行步骤

### 1. Phase 1 — 广域扫描

解析 keywords 和 organizations，生成**成对查询**（关键词独立 + 关键词×组织组合）。

对每个关键词和关注组织，搜索以下维度：

- **学术论文**: `[keyword] arxiv paper 2025 2026` 和 `[keyword] [org] arxiv`
- **技术新闻**: `[keyword] technology news breakthrough 2025 2026` 和 `[keyword] [org] announcement`
- **GitHub 项目**: `[keyword] github open source` 和 `[org] [keyword] github`
- **产业报告**: `[keyword] industry report market analysis`

**双语查询**：当组织名称暗示非英语区域时（如中文组织），额外生成该语言的查询（如 `[keyword] 技术突破 2025`）。

**查询优先级**：每类最多 3 个查询，优先执行 keyword+org 组合查询。

### 2. Phase 2 — 深度追踪

分析 Phase 1 结果中出现的：
- 具体技术/产品名称 → 针对性搜索其最新进展
- 重要论文/项目 → 搜索相关讨论和 benchmark
- 竞品对比 → 搜索 head-to-head 比较分析

使用 web-reader 工具提取有价值链接的完整内容。

### 3. Phase 3 — 缺口填补

将已收集文档覆盖的关键词与原始关键词列表对比：
- 找出**未覆盖**或**覆盖薄弱**的关键词
- 对缺口关键词运行定向搜索
- 重复直到主要关键词都有 ≥1 篇文档或确认无可用结果

### 4. 质量控制

对每篇文档在存入前执行：

**时效性分层**（写入 metadata.recency_tier）：
- `breaking`: 30 天内
- `recent`: 12 个月内
- `background`: 超过 12 个月

**来源可信度分层**（写入 metadata.credibility_tier）：
- `tier1`: 官方文档、同行评审论文、标准规范
- `tier2`: 知名技术博客、会议演讲、行业分析报告
- `tier3`: 通用新闻、个人博客、论坛讨论

**语义去重**：与同 topic_id 下已有文档标题比较，标题相似度 >80% 时跳过（不插入）。

### 5. 存储到数据库

对通过质量控制的文档，使用 Bash 工具存入 SQLite：

```bash
sqlite3 database.sqlite "INSERT INTO documents (id, title, source, source_url, published_date, collected_date, content, topic_id, metadata) VALUES ('$(uuidgen)', '文档标题', '来源', 'URL', '发布日期', '$(date -I)', '内容摘要', '{{topicId}}', '{\"collected_by\": \"skill\", \"recency_tier\": \"recent\", \"credibility_tier\": \"tier1\"}');"
```

注意：
- 使用 Bash 工具的 sqlite3 命令操作数据库
- 对内容中的单引号进行转义（替换为 ''）
- 如果文档已存在（按 source_url 去重），跳过不重复插入

### 6. 返回结果

完成后，输出以下 JSON 格式的结果：

```json
{
  "topicId": "{{topicId}}",
  "topicName": "{{topicName}}",
  "totalCollected": 5,
  "documents": [
    {
      "title": "文档标题",
      "source": "arxiv",
      "sourceUrl": "https://...",
      "summary": "一句话摘要",
      "recencyTier": "recent",
      "credibilityTier": "tier1"
    }
  ],
  "searchQueries": ["实际使用的搜索词列表"],
  "gapAnalysis": {
    "covered": ["keyword1", "keyword2"],
    "gaps": ["keyword3"],
    "gapSearches": ["为缺口执行的搜索"]
  }
}
```
