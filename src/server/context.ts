import type { RequestHandler } from 'express';
import type { Database } from 'sqlite';
import type { SkillRegistry } from '../skillRegistry.js';
import type { SkillExecutor } from '../skillExecutor.js';
import type { SchedulerService } from '../scheduler.js';
import type { SkillWebSocket } from '../websocket.js';

export interface AppContext {
  db: Database;
  skillRegistry: SkillRegistry;
  skillExecutor: SkillExecutor;
  scheduler: SchedulerService;
  ws: SkillWebSocket;
  upload: import('multer').Multer;
  requireAdmin: RequestHandler;
  configPath: string;
  skillsDir: string;
  graphSensemaking: import('../services/graphSensemaking.js').GraphSensemakingService;
}
