---
version: "1.0.0"
display_name: "优化循环"
description: |
  调用 Bilevel-Autoresearch 框架对指定 skill 进行
  propose × evaluate × iterate 双层优化循环。
category: optimization
timeout: 1200
params:
  - name: skillName
    type: string
    required: true
    description: "目标 Skill 名称"
  - name: evaluationCriteria
    type: string
    required: false
    default: "relevance,depth,accuracy"
    description: "评估标准（逗号分隔）"
  - name: maxIterations
    type: number
    required: false
    default: 10
    description: "最大迭代次数"
  - name: convergenceThreshold
    type: number
    required: false
    default: 8
    description: "收敛阈值（0-10）"
steps:
  - "准备优化配置并获取历史教训"
  - "Inner Loop：propose → execute → evaluate → extract lesson"
  - "Outer Loop：调整搜索策略，生成 prompt overrides"
  - "Meta-Optimization：发现新机制，跨领域搜索灵感"
  - "存储优化结果（教训、技能、轨迹）到数据库"
---

# Bilevel 优化

你是一个元优化专家。请调用 Bilevel-Autoresearch 框架对指定的 skill 进行 propose × evaluate × iterate 优化循环。

## 任务参数

- 目标 Skill：{{skillName}}
- 评估标准：{{evaluationCriteria}}
- 最大迭代次数：{{maxIterations}}
- 收敛阈值：{{convergenceThreshold}}

## 执行步骤

### 1. 准备优化配置

使用 Bash 工具创建配置文件：

```bash
cat > /tmp/techplan_optimize_config.json << 'OPTCONFIG'
{
  "skill_name": "{{skillName}}",
  "evaluation_criteria": "{{evaluationCriteria}}",
  "max_iterations": {{maxIterations}},
  "convergence_threshold": {{convergenceThreshold}},
  "domain": "techplan_opt",
  "db_path": "database.sqlite"
}
OPTCONFIG
```

### 2. 获取历史教训

从数据库获取该 skill 已有的教训和技能，作为优化起点：

```bash
sqlite3 -json database.sqlite "SELECT lesson_type, stage, summary, reuse_rule, confidence FROM bilevel_lessons WHERE skill_name = '{{skillName}}' ORDER BY confidence DESC LIMIT 20;"

sqlite3 -json database.sqlite "SELECT stage, content, confidence FROM bilevel_skills WHERE skill_name = '{{skillName}}' ORDER BY confidence DESC LIMIT 10;"

sqlite3 -json database.sqlite "SELECT run_number, scores, overall, strategy_used FROM bilevel_traces WHERE skill_name = '{{skillName}}' ORDER BY created_at DESC LIMIT 10;"
```

### 3. 执行 Bilevel 优化循环

#### Level 1: Inner Loop（优化 skill 输出）

迭代执行以下循环：

1. **Propose**: 根据历史教训和当前 context，提出一个改进的执行策略
2. **Execute**: 按照提出的策略执行目标 skill
3. **Evaluate**: 按照评估标准对执行结果评分（0-10）
4. **Extract Lesson**: 从本轮执行中提取教训
   - success_pattern: 哪些策略有效
   - failure_pattern: 哪些策略无效
   - improvement: 可改进的地方
5. **Promote Skills**: 将高置信度（≥0.85）的教训晋升为 skill guidance

#### Level 1.5: Outer Loop（优化搜索策略）

每完成一轮 inner loop 后：
1. 分析 inner loop 的过程信号（收敛轨迹、失败模式、教训质量）
2. 调整下一轮的搜索策略配置
3. 生成 prompt overrides 注入到下一轮

#### Level 2: Meta-Optimization（发现新机制）

如果 inner loop 遇到结构性瓶颈：
1. 跨领域搜索新的优化机制灵感
2. 生成具体的 Python 实现方案
3. 验证新机制的有效性

### 4. 存储优化结果

将本轮优化的教训、技能和轨迹存入数据库：

```bash
# 存储教训
sqlite3 database.sqlite "INSERT INTO bilevel_lessons (id, skill_name, lesson_type, stage, summary, reuse_rule, confidence, outer_cycle) VALUES ('$(uuidgen)', '{{skillName}}', 'success_pattern', 'propose', '教训摘要', '复用规则', 0.9, 1);"

# 存储/更新技能
sqlite3 database.sqlite "INSERT OR REPLACE INTO bilevel_skills (id, skill_name, stage, content, confidence, created_at, updated_at) VALUES ('$(uuidgen)', '{{skillName}}', 'propose', '技能内容', 0.9, '$(date -I)', '$(date -I)');"

# 存储轨迹
sqlite3 database.sqlite "INSERT INTO bilevel_traces (id, skill_name, run_number, scores, overall, strategy_used) VALUES ('$(uuidgen)', '{{skillName}}', 1, '{\"relevance\": 8, \"depth\": 7}', 7, '策略描述');"
```

### 5. 尝试调用 Bilevel-Autoresearch Python 引擎

如果 Python 环境可用，尝试调用：

```bash
cd /home/yalun/Dev/Bilevel-Autoresearch && python3 -c "
import sys, json
sys.path.insert(0, '.')
from core.inner_loop import InnerLoopController
print(json.dumps({'status': 'available'}))
" 2>/dev/null || echo '{"status": "python_unavailable", "fallback": "native_optimization"}'
```

如果 Python 引擎不可用，则使用 Claude 自身的能力完成上述 inner/outer loop 循环。

### 6. 返回结果

```json
{
  "skillName": "{{skillName}}",
  "optimizationResult": {
    "converged": true,
    "iterations": 8,
    "peakScore": 9,
    "finalScore": 8.5,
    "improvement": "+2.5"
  },
  "lessonsExtracted": 5,
  "skillsPromoted": 3,
  "strategyChanges": ["调整了搜索关键词策略", "优化了内容过滤阈值"]
}
```
