# 周报生成问题修复记录

> 修复日期：2026-03-30
> 问题：点击"生成周报"后，前端显示 JSON 字符串片段

---

## 问题分析

### 问题现象

前端显示的内容是 JSON 字符串片段，如：
```
s\": [\"Daft\", \"Ray Data\", \"Polars\"]\n },\n {\n \"date\": \"2026-03-05\"...
```

### 根本原因

**Claude CLI 输出格式**：
```json
{"type":"result","result":"数据已收集。我发现有32篇文档...\n\n{\"title\":\"向量数据库 技术情报周报...\"}"}
```

**问题链**：
1. `parsed.result` 字符串不是纯 JSON，而是 **中文说明 + JSON**
2. 原代码尝试 `JSON.parse(resultStr)` 直接解析，失败
3. Fallback 逻辑保存了完整的 stdout（包含多行 stream-json）
4. `server.ts` 从 `raw` 中无法正确提取内容

### 数据流分析

```
Claude CLI 输出
    │
    └── {"type":"result","result":"中文说明...\n\n{...JSON...}"}
    
skillExecutor.ts 处理
    │
    ├── JSON.parse(line) ✓ 成功
    ├── parsed.type === 'result' ✓ 找到
    ├── parsed.result = "中文说明...\n\n{...JSON...}"
    └── JSON.parse(parsed.result) ✗ 失败（不是纯 JSON）
    
修复后
    │
    ├── 找到第一个 '{' 和最后一个 '}'
    ├── 提取中间的 JSON 字符串
    └── JSON.parse(extracted) ✓ 成功
```

---

## 修复内容

### src/skillExecutor.ts (第 195-236 行)

**修复前**：
```typescript
try {
  const resultStr = parsed.result;
  if (typeof resultStr === 'string') {
    let cleaned = resultStr.trim();
    // ... 复杂的处理逻辑 ...
    execution.result = JSON.parse(cleaned);  // ← 失败！
  }
} catch (parseErr) {
  // fallback 保存完整 stdout
}
```

**修复后**：
```typescript
const resultStr = parsed.result;
let parsedResult: any = null;

if (typeof resultStr === 'string') {
  // Find the outermost JSON object in the result string
  // The result may have extra text before/after the JSON
  const firstBrace = resultStr.indexOf('{');
  const lastBrace = resultStr.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const extracted = resultStr.slice(firstBrace, lastBrace + 1);
    console.log('[SkillExecutor] Extracted JSON from result, length:', extracted.length);
    
    try {
      parsedResult = JSON.parse(extracted);
      console.log('[SkillExecutor] Successfully parsed result JSON');
      console.log('[SkillExecutor] Result title:', parsedResult.title);
    } catch (parseErr) {
      console.error('[SkillExecutor] Failed to parse extracted JSON:', parseErr);
      parsedResult = { raw: resultStr, parseError: String(parseErr) };
    }
  } else {
    console.log('[SkillExecutor] No JSON object found in result');
    parsedResult = { raw: resultStr };
  }
} else if (resultStr && typeof resultStr === 'object') {
  parsedResult = resultStr;
} else {
  parsedResult = parsed;
}

execution.result = parsedResult;
```

---

## 验证结果

### 测试用例

```javascript
const testResult = '数据已收集。我发现有32篇文档...\n\n{"title":"向量数据库 技术情报周报 · 2026-03-30","summary":"本周向量数据库领域呈现三大核心趋势","content":{"version":"2.0"}}';

const firstBrace = testResult.indexOf('{');
const lastBrace = testResult.lastIndexOf('}');
const extracted = testResult.slice(firstBrace, lastBrace + 1);

const parsedResult = JSON.parse(extracted);
// ✅ SUCCESS!
// Title: 向量数据库 技术情报周报 · 2026-03-30
// Summary: 本周向量数据库领域呈现三大核心趋势
// Has content: true
```

### 预期结果

重启服务器后生成报告，日志应显示：
```
[SkillExecutor] Received result type, parsing...
[SkillExecutor] Extracted JSON from result, length: 18075
[SkillExecutor] Successfully parsed result JSON
[SkillExecutor] Result title: 向量数据库 技术情报周报 · 2026-03-30
[Report] Parsed report: { title: '...', hasSummary: true, ... }
```

---

## 相关文件

- [src/skillExecutor.ts](../src/skillExecutor.ts) - LLM 输出解析
- [server.ts](../server.ts) - 报告保存逻辑

---

## 问题总结

| 问题 | 原因 | 修复 |
|------|------|------|
| JSON 解析失败 | `parsed.result` 包含中文说明 + JSON | 提取 `{...}` 部分 |
| 前端显示乱码 | 保存了完整的 stdout | 正确解析并保存 JSON |

---

*修复完成，请重启服务器后测试。*
