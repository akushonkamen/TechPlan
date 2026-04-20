# Blue-Team 逻辑断裂点审查（TechPlan）

日期：2026-03-30
范围：后端 API、技能执行链路、配置管理、图谱同步、前端执行状态协同

## 高风险

1. **配置接口可直接泄露密钥（无鉴权）**
   - `GET /api/config` 直接返回 `openaiApiKey/customApiKey/neo4jPassword`。
   - 风险：任意可访问服务的用户可读取生产密钥。
   - 代码位置：`server.ts` 1167-1216。
   - 建议：加鉴权 + 最小化返回（只返回是否已配置）。

2. **可远程触发高权限技能执行（无鉴权 + 无限并发）**
   - `POST /api/skill/:name` 无认证可触发执行。
   - `SkillExecutor` 定义了 `MAX_CONCURRENT=3`，但 `queue` 从未入队，`runningCount` 每次直接递增，实际没有并发上限。
   - 风险：DoS、资源耗尽、潜在命令链路被滥用。
   - 代码位置：`server.ts` 1527-1590；`src/skillExecutor.ts` 19, 36, 98-107, 283-287。
   - 建议：鉴权 + 真实排队器 + per-IP/per-user 速率限制。

3. **WebSocket 默认“未订阅即全收”导致执行结果外泄**
   - `send()` 中 `client.executionId === executionId || !client.executionId`，未订阅的连接也会收到所有 execution 消息。
   - 风险：多租户/多人使用时信息串流泄露。
   - 代码位置：`src/websocket.ts` 47-53。
   - 建议：默认不推送；必须先显式订阅 executionId。

4. **技能版本恢复存在路径穿越风险**
   - `path.join(skillsDir, `${name}.md`)` 未校验 `name`。
   - 风险：构造 `../` 可能覆盖非目标文件（视路径规范化和权限而定）。
   - 代码位置：`server.ts` 1400-1416, 1382-1383, 1295-1296。
   - 建议：限制 `name` 白名单（`^[a-z0-9-]+$`）并校验 `resolvedPath.startsWith(skillsDir)`。

## 中风险

5. **配置写入为“truthy merge”，造成不可清空+字段丢失**
   - `POST /api/config` 从空对象开始，仅在字段为 truthy 时写入。
   - 结果：
     - 用户无法把 key 清空为 `""`（因为空字符串不写入）。
     - 未提交字段会从文件中消失。
   - 代码位置：`server.ts` 1245-1263。
   - 建议：读取旧配置后做显式 merge；区分 `undefined` 与空字符串。

6. **前端取消状态与后端实际状态不一致**
   - 前端 `cancel()` 直接把状态置为 `idle`；后端杀进程后通常会走 `failed` 分支。
   - 风险：审计轨迹与 UI 认知错位，误判执行结果。
   - 代码位置：`src/hooks/useSkillExecutor.ts` 185-190；`src/skillExecutor.ts` 221-238, 291-299。
   - 建议：引入 `cancelled` 显式状态并端到端统一。

7. **图谱同步对 metadata 字段类型处理错误，导致类型信息失真**
   - `doc.metadata?.type || 'news'` 假设 metadata 为对象，但数据库存储为 JSON 字符串。
   - 结果：文档类型大概率退化为默认值。
   - 代码位置：`src/services/graphService.ts` 278-285。
   - 建议：先 JSON.parse(metadata) 再取 `type`。

8. **同一表 reports 被定义两次且 schema 不一致，迁移语义漂移**
   - 启动初始化中已有 `reports`（含 period_start/period_end）。
   - 后续又 `CREATE TABLE IF NOT EXISTS reports`（无 period_start/period_end）。
   - 风险：后续开发误判字段存在性，形成隐式数据契约断裂。
   - 代码位置：`server.ts` 118-133 与 1065-1084。
   - 建议：统一迁移脚本，单一 schema 来源。

## 低风险 / 设计债

9. **上传文件仅按 MIME 判断，缺少魔数校验**
   - 风险：伪造 MIME 触发解析异常或投递不可预期内容。
   - 代码位置：`src/services/fileUploadService.ts` 42-59, 113-119。
   - 建议：增加文件头签名检测、隔离解析。

10. **创建主题依赖客户端传入 id，冲突只返回 500**
   - 风险：重放/冲突时业务语义不清晰，无法区分参数错误与服务故障。
   - 代码位置：`server.ts` 349-373。
   - 建议：服务端生成 UUID，冲突返回 409。

## 优先修复顺序（蓝军建议）

1. 先封住密钥泄露与未鉴权执行（问题 1/2/3）。
2. 再修路径穿越与配置写入语义（问题 4/5）。
3. 最后做一致性与可维护性修复（问题 6/7/8/9/10）。

