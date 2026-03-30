# 周报生成问题修复计划

## 问题分析

### 当前状态
- `skill_executions.result` = `{ raw: "完整stdout", truncated: true }`
- `raw` 包含 96707 字符的 stream-json 格式输出
- 每行是独立的 JSON 对象：`{"type":"system",...}`, `{"type":"assistant",...}`, `{"type":"result",...}`
- 最终的 `{"type":"result","result":"..."}` 包含 LLM 的实际输出

### 问题链
1. `skillExecutor.ts` 解析 stream-json 时，`parsed.type === 'result'` 分支被触发
2. 但 `parsed.result` 字符串解析失败（可能是 JSON 格式问题）
3. Fallback 到 `proc.on('close')` 逻辑
4. `stdout` 不是单个 JSON，所以保存为 `{ raw: stdout }`
5. `server.ts` 从 `raw` 中无法提取有效内容

### 根本原因
- **skillExecutor.ts**: 没有正确处理 stream-json 格式的多行输出
- **解析逻辑**: 需要从多行 JSON 中找到 `type: 'result'` 行并提取内容

## 修复方案

### 方案 1: 在 skillExecutor.ts 中正确解析 stream-json

**修改位置**: `src/skillExecutor.ts`

**核心逻辑**:
1. 在 `proc.stdout.on('data')` 中解析每一行 JSON
2. 找到 `type: 'result'` 行时，提取 `result` 字段
3. 解析 `result` 字段中的 JSON 字符串
4. 如果解析失败，保存完整的 `result` 字符串供后续处理

### 方案 2: 在 server.ts 中增强 raw 内容处理

**修改位置**: `server.ts`

**核心逻辑**:
1. 如果 `execution.result` 是 `{ raw: "..." }` 格式
2. 从 `raw` 中找到 `type: 'result'` 的 JSON 行
3. 提取并解析 `result` 字段

## 实施步骤

### Step 1: 修复 skillExecutor.ts

```typescript
// 在 proc.stdout.on('data') 中
for (const line of lines) {
  try {
    const parsed = JSON.parse(line);
    
    if (parsed.type === 'result') {
      // 提取 result 字段
      const resultStr = parsed.result;
      
      if (typeof resultStr === 'string') {
        // 尝试解析为 JSON
        try {
          execution.result = JSON.parse(resultStr);
          console.log('[SkillExecutor] Successfully parsed result JSON');
        } catch {
          // 如果解析失败，保存原始字符串
          execution.result = { rawResult: resultStr };
          console.log('[SkillExecutor] Saved raw result string');
        }
      } else {
        execution.result = resultStr;
      }
    }
  } catch {
    // 忽略非 JSON 行
  }
}
```

### Step 2: 修复 server.ts 中的报告处理

```typescript
// 在报告处理逻辑中
let rawOutput = envelope.result ?? envelope.raw ?? envelope.rawResult ?? envelope;

// 如果 rawOutput 是 stream-json 格式的多行输出
if (typeof rawOutput === 'string' && rawOutput.includes('"type":"result"')) {
  // 找到 type: 'result' 行
  const lines = rawOutput.split('\n');
  for (const line of lines) {
    if (line.includes('"type":"result"')) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.result) {
          rawOutput = parsed.result;
          break;
        }
      } catch { /* ignore */ }
    }
  }
}
```

### Step 3: 验证

1. 重启服务器
2. 生成新报告
3. 检查数据库中的报告内容

## 预期结果

- 报告 `content` 字段包含完整的 JSON 结构
- 前端正确显示执行摘要、章节、时间线等
