import express from 'express';
import multer from 'multer';

// Upload config (memory storage)
const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10') * 1024 * 1024;
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
  },
});

export const PORT = parseInt(process.env.PORT || '3000');

/**
 * Create the requireAdmin middleware based on configured token
 */
export function createRequireAdmin(): express.RequestHandler {
  const adminToken = process.env.ADMIN_TOKEN;

  return (req, res, next) => {
    if (!adminToken) return next();

    const authHeader = req.header("authorization");
    const bearer = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
    const headerToken = req.header("x-admin-token");
    const token = bearer || headerToken;

    if (!token || token !== adminToken) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };
}

const SKILL_NAME_PATTERN = /^[a-z0-9-]+$/;
export function validateSkillName(name: string): boolean {
  return SKILL_NAME_PATTERN.test(name);
}
