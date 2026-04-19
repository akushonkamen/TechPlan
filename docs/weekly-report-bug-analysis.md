# 周报生成链路问题分析报告

> 分析日期：2026-03-30
> 问题：点击"生成周报"后，任务完成但前端未显示结果

---

## 一、问题定位

### 1.1 核心问题：LLM 输出解析错误

**问题位置**：`src/skillExecutor.ts` 第 195 行

```typescript
} else if (parsed.type === 'result') {
  execution.result = parsed;  // ❌ 问题：直接赋值了包装对象
```

**Claude CLI 流式输出格式**：
```json
{
  "type": "result",
  "result": "{\n  \"title\": \"端侧大模型技术情报周报\",\n  \"summary\": \"...\",\n  \"content\": {...}\n}",
  "duration_ms": 45000,
  ...
}
```

**当前代码行为**：
- `execution.result` = 整个包装对象 `{ type: "result", result: "...", ... }`

**期望行为**：
- `execution.result` = 解析后的实际内容 `{ title: "...", summary: "...", content: {...} }`

### 1.2 连锁问题：server.ts 中的数据提取

**问题位置**：`server.ts` 第 1821-1822 行

```typescript
const result = execution.result ?? {};
const content = result.content ?? {};  // ❌ 找不到 content 字段
```

由于 `execution.result` 是包装对象，没有 `content` 字段，导致：
- `content` = `{}`（空对象）
- `result.title` = `undefined`
- `result.summary` = `undefined`

### 1.3 最终结果

数据库中保存的报告：
```json
{
  "id": "rpt_xxx",
  "title": "端侧大模型 分析报告",  // 使用了默认标题
  "summary": "",                    // 空摘要
  "content": "{}"                   // 空内容
}
```

前端显示：空报告，无法展开查看内容。

---

## 二、完整链路分析

### 2.1 正确的数据流（期望）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. 前端触发                                                                   │
│    POST /api/skill/report                                                    │
│    { topicId: "1", topicName: "端侧大模型", reportType: "weekly" }          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. 后端启动执行                                                               │
│    skillExecutor.startExecution("report", params)                           │
│    → 渲染技能模板 → 调用 Claude CLI                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. Claude CLI 执行                                                            │
│    输出流式 JSON：                                                            │
│    { "type": "result", "result": "{...实际JSON...}" }                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. 结果解析（当前有BUG）                                                      │
│    ❌ 当前：execution.result = { type: "result", result: "..." }            │
│    ✅ 应该：execution.result = JSON.parse(parsed.result)                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. 数据库保存                                                                 │
│    INSERT INTO reports (title, summary, content, ...)                       │
│    ❌ 当前：title=默认值, summary=空, content={}                             │
│    ✅ 应该：title=实际标题, summary=实际摘要, content=完整内容               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. 前端显示                                                                   │
│    GET /api/reports                                                          │
│    ❌ 当前：显示空报告                                                        │
│    ✅ 应该：显示完整报告内容                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Claude CLI 输出格式详解

Claude CLI 使用 `--output-format stream-json` 时，输出格式为：

```jsonl
{"type":"system","session_id":"xxx"}
{"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{...}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","content":[...]}]}}
{"type":"result","result":"{\"title\":\"...\",\"content\":{...}}","duration_ms":45000}
```

**关键字段**：
- `type: "result"` - 表示最终结果
- `result` - 字符串形式的 JSON，需要再次解析

---

## 三、修复方案

### 3.1 修复 skillExecutor.ts

**文件**：`src/skillExecutor.ts`
**位置**：第 194-200 行

```typescript
// 当前代码（有BUG）
} else if (parsed.type === 'result') {
  execution.result = parsed;
  const durationSec = parsed.duration_ms
    ? Math.round(parsed.duration_ms / 1000)
    : 0;
  appendProgress(`── 完成${durationSec ? ` (耗时 ${durationSec}s)` : ''} ──`);
}

// 修复后代码
} else if (parsed.type === 'result') {
  // 解析 Claude CLI 返回的实际 JSON 内容
  try {
    const resultStr = parsed.result;
    if (typeof resultStr === 'string') {
      execution.result = JSON.parse(resultStr);
    } else {
      execution.result = resultStr;
    }
  } catch (parseErr) {
    console.error('[SkillExecutor] Failed to parse result JSON:', parseErr);
    execution.result = { raw: parsed.result };
  }
  
  const durationSec = parsed.duration_ms
    ? Math.round(parsed.duration_ms / 1000)
    : 0;
  appendProgress(`── 完成${durationSec ? ` (耗时 ${durationSec}s)` : ''} ──`);
}
```

### 3.2 增强错误处理（可选）

**文件**：`server.ts`
**位置**：第 1821 行附近

```typescript
if (name === 'report') {
  try {
    const result = execution.result ?? {};
    
    // 增强日志：打印解析后的结果结构
    console.log('[Report] Result structure:', {
      hasTitle: !!result.title,
      hasSummary: !!result.summary,
      hasContent: !!result.content,
      resultKeys: Object.keys(result),
    });
    
    const content = result.content ?? {};
    
    // 如果 content 为空，尝试从 raw 字段解析
    if (Object.keys(content).length === 0 && result.raw) {
      try {
        const parsed = JSON.parse(result.raw);
        Object.assign(content, parsed.content ?? {});
        result.title = result.title ?? parsed.title;
        result.summary = result.summary ?? parsed.summary;
      } catch { /* ignore */ }
    }
    
    // ... 后续保存逻辑
  }
}
```

### 3.3 技能模板优化（可选）

**文件**：`.claude/skills/report.md`

在模板末尾添加输出格式强调：

```markdown
## 输出格式强调

**极其重要**：你的输出必须是纯 JSON，不要包含任何 markdown 代码块标记。

❌ 错误示例：
```json
{
  "title": "..."
}
```

✅ 正确示例：
{
  "title": "...",
  "summary": "...",
  "content": {...}
}
```

---

## 四、验证步骤

### 4.1 单元测试

```bash
# 测试 JSON 解析
node -e "
const parsed = {
  type: 'result',
  result: '{\"title\":\"测试报告\",\"content\":{\"sections\":[]}}'
};
const execution = {};
try {
  const resultStr = parsed.result;
  if (typeof resultStr === 'string') {
    execution.result = JSON.parse(resultStr);
  }
  console.log('Parsed result:', execution.result);
  console.log('Title:', execution.result.title);
} catch (err) {
  console.error('Parse error:', err);
}
"
```

### 4.2 集成测试

1. 启动服务器：`npm run dev`
2. 打开前端：`http://localhost:3000`
3. 进入"分析报告"页面
4. 选择主题，点击"生成周报"
5. 等待执行完成
6. 检查浏览器控制台网络请求：
   - `GET /api/reports` 返回的报告是否有 `content`
7. 检查数据库：
   ```bash
   sqlite3 database.sqlite "SELECT id, title, length(content) as content_len FROM reports ORDER BY created_at DESC LIMIT 1;"
   ```

### 4.3 日志验证

查看服务器日志：
```
[Report] Result structure: { hasTitle: true, hasSummary: true, hasContent: true, ... }
[Report] Saved report rpt_xxx for topic 1
```

---

## 五、其他潜在问题

### 5.1 前端轮询逻辑

**文件**：`src/pages/Reports.tsx` 第 287-307 行

```typescript
const poll = async () => {
  let attempts = 0;
  const MAX_ATTEMPTS = 120;  // 120 * 3s = 6分钟
  const doPoll = async () => {
    if (!mountedRef.current) return;
    attempts++;
    if (attempts > MAX_ATTEMPTS) {
      if (mountedRef.current) setSkillStatus('failed');
      return;
    }
    // ...
  };
};
```

**潜在问题**：
- 如果报告生成时间超过 6 分钟，会被标记为失败
- 建议增加超时提示或延长超时时间

### 5.2 数据库查询优化

**文件**：`server.ts` 第 1832-1838 行

```typescript
const docCount = await db.get(
  "SELECT COUNT(*) as count FROM documents WHERE topic_id = ?",
  [params.topicId]
);
const entityCount = await db.get(
  `SELECT COUNT(*) as count FROM entities e JOIN documents d ON e.document_id = d.id WHERE d.topic_id = ?`,
  [params.topicId]
);
```

**优化建议**：
- 可以合并为一个查询减少数据库调用

---

## 六、修复优先级

| 优先级 | 问题 | 影响 | 修复难度 |
|--------|------|------|----------|
| P0 | skillExecutor 结果解析错误 | 报告内容为空 | 低 |
| P1 | 增强错误日志 | 难以调试 | 低 |
| P2 | 技能模板强调输出格式 | LLM 可能输出错误格式 | 低 |
| P3 | 前端超时处理 | 长时间任务失败 | 中 |

---

## 七、总结

**根本原因**：`skillExecutor.ts` 在解析 Claude CLI 输出时，直接将包装对象赋值给 `execution.result`，而没有解析 `parsed.result` 字符串。

**影响范围**：所有使用 SkillExecutor 的技能执行，包括报告生成、优化等。

**修复方案**：在 `parsed.type === 'result'` 分支中，正确解析 `parsed.result` 字符串为 JSON 对象。

**验证方法**：修复后重新生成报告，检查数据库中的 `content` 字段是否有完整内容。
