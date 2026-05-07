import { Router } from 'express';
import fs from 'fs';
import type { AppContext } from '../context.js';

export function createConfigRouter(ctx: AppContext): Router {
  const router = Router();

  /**
   * GET /api/config
   * 获取当前配置
   */
  router.get("/api/config", ctx.requireAdmin, async (_req, res) => {
    try {
      let config = {
        aiProvider: "openai",
        openaiApiKey: "",
        openaiBaseUrl: "https://api.openai.com/v1",
        openaiModel: "gpt-4o",
        customApiKey: "",
        customBaseUrl: "",
        customModel: "",
      };

      // 从文件读取配置
      if (fs.existsSync(ctx.configPath)) {
        const fileContent = await fs.promises.readFile(ctx.configPath, "utf-8");
        config = { ...config, ...JSON.parse(fileContent) };
      }

      // 从环境变量读取（优先级更高）
      if (process.env.OPENAI_API_KEY) config.openaiApiKey = process.env.OPENAI_API_KEY;
      if (process.env.OPENAI_BASE_URL) config.openaiBaseUrl = process.env.OPENAI_BASE_URL;
      // Mask sensitive fields before sending to client
      const mask = (val: string | undefined) => {
        if (!val || val.length <= 4) return val ? '****' : '';
        return '****' + val.slice(-4);
      };
      res.json({
        aiProvider: config.aiProvider,
        openaiBaseUrl: config.openaiBaseUrl,
        openaiModel: config.openaiModel,
        openaiApiKey: mask(config.openaiApiKey),
        customBaseUrl: config.customBaseUrl,
        customModel: config.customModel,
        customApiKey: mask(config.customApiKey),
      });
    } catch (error) {
      console.error("Failed to load config:", error);
      res.status(500).json({ error: "Failed to load config" });
    }
  });

  /**
   * POST /api/config
   * 保存配置
   */
  router.post("/api/config", ctx.requireAdmin, async (req, res) => {
    try {
      const payload = req.body ?? {};
      let config: any = {};
      if (fs.existsSync(ctx.configPath)) {
        const raw = await fs.promises.readFile(ctx.configPath, "utf-8");
        config = JSON.parse(raw);
      }

      const allowList = [
        "aiProvider",
        "openaiApiKey",
        "openaiBaseUrl",
        "openaiModel",
        "customApiKey",
        "customBaseUrl",
        "customModel",
      ];

      for (const key of allowList) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
          config[key] = payload[key];
        }
      }

      // 保存到文件
      await fs.promises.writeFile(ctx.configPath, JSON.stringify(config, null, 2), "utf-8");

      // 设置环境变量（用于当前进程）
      if (Object.prototype.hasOwnProperty.call(payload, "openaiApiKey")) process.env.OPENAI_API_KEY = String(payload.openaiApiKey ?? "");
      if (Object.prototype.hasOwnProperty.call(payload, "openaiBaseUrl")) process.env.OPENAI_BASE_URL = String(payload.openaiBaseUrl ?? "");
      res.json({ success: true, message: "配置已保存" });
    } catch (error) {
      console.error("Failed to save config:", error);
      res.status(500).json({ error: "Failed to save config" });
    }
  });

  /**
   * POST /api/config/test
   * Test AI provider connectivity
   */
  router.post("/api/config/test", ctx.requireAdmin, async (req, res) => {
    try {
      const { provider, apiKey, baseUrl, model } = req.body ?? {};

      if (!provider || !apiKey) {
        return res.status(400).json({ success: false, error: "Provider and API key are required" });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        if (provider === "openai" || provider === "custom") {
          const url = baseUrl || "https://api.openai.com/v1";
          const response = await fetch(`${url}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: model || (provider === "openai" ? "gpt-4o" : "gpt-4o"),
              messages: [{ role: "user", content: "test" }],
              max_tokens: 1,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            return res.status(400).json({ success: false, error: `HTTP ${response.status}: ${errorText}` });
          }

          return res.json({ success: true });
        } else {
          return res.status(400).json({ success: false, error: "Unknown provider" });
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === "AbortError") {
          return res.status(400).json({ success: false, error: "Request timeout (10s)" });
        }
        return res.status(400).json({ success: false, error: fetchError.message || "Connection failed" });
      }
    } catch (error: any) {
      console.error("Failed to test config:", error);
      res.status(500).json({ success: false, error: "Test failed" });
    }
  });

  return router;
}
