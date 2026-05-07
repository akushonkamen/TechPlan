import path from 'path';
import fs from 'fs';

function loadServiceConfig() {
  try {
    const configPath = path.join(process.cwd(), 'config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

const ZIMAGE_SERVER = process.env.ZIMAGE_SERVER_URL || loadServiceConfig().services?.zImageUrl || 'http://127.0.0.1:8000';
const IMAGE_DIR = path.join(process.cwd(), 'generated_images');
const TIMEOUT_MS = 300_000;

const REPORT_TYPE_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  tech_topic: 'Technology Topic',
  competitor: 'Competitor Analysis',
  alert: 'Alert',
};

export async function isServerOnline(): Promise<boolean> {
  try {
    // Try /health endpoint first
    const res = await fetch(`${ZIMAGE_SERVER}/health`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    return data.model_loaded === true || res.ok;
  } catch {
    // Fallback: try root endpoint
    try {
      const res = await fetch(`${ZIMAGE_SERVER}/`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export async function generateCoverImage(
  topicName: string,
  reportType: string,
  summary: string,
  reportId: string,
): Promise<string | null> {
  try {
    if (!await isServerOnline()) {
      console.log('[ImageGen] Z-Image server not available, skipping cover image');
      return null;
    }

    const typeLabel = REPORT_TYPE_LABELS[reportType] || 'Weekly';
    const topicSnippet = (topicName || 'Technology').slice(0, 60);
    const summarySnippet = (summary || '').slice(0, 120).replace(/[\n\r"]/g, ' ');

    const prompt = `Professional infographic cover for a ${typeLabel} technology intelligence report about ${topicSnippet}. ${summarySnippet}. Abstract data visualization elements, network nodes and connections, blue and teal color scheme, dark gradient background, clean modern design, no text overlays, wide banner format.`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${ZIMAGE_SERVER}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, width: 1024, height: 512, steps: 8, seed: -1 }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.error(`[ImageGen] Server returned ${res.status}`);
      return null;
    }

    const data = await res.json() as { image_base64?: string; seed?: number };
    if (!data.image_base64) {
      console.error('[ImageGen] No image_base64 in response');
      return null;
    }

    if (!fs.existsSync(IMAGE_DIR)) {
      fs.mkdirSync(IMAGE_DIR, { recursive: true });
    }

    const filename = `${reportId}.png`;
    const filePath = path.join(IMAGE_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(data.image_base64, 'base64'));

    const publicPath = `/generated_images/${filename}`;
    console.log(`[ImageGen] Cover image generated: ${publicPath}`);
    return publicPath;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error('[ImageGen] Request timed out');
    } else {
      console.error('[ImageGen] Failed:', err.message);
    }
    return null;
  }
}

/**
 * Generate a slide image for a report section using Z-Image.
 * Returns the absolute file path (for SVG embedding) or null on failure.
 */
export async function generateSectionImage(
  prompt: string,
  reportId: string,
  sectionKey: string,
): Promise<string | null> {
  try {
    if (!await isServerOnline()) {
      console.log(`[ImageGen] Z-Image server not available, skipping ${sectionKey}`);
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${ZIMAGE_SERVER}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, width: 1024, height: 768, steps: 4, seed: -1 }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.error(`[ImageGen] Server returned ${res.status} for ${sectionKey}`);
      return null;
    }

    const data = await res.json() as { image_base64?: string };
    if (!data.image_base64) {
      console.error(`[ImageGen] No image_base64 for ${sectionKey}`);
      return null;
    }

    if (!fs.existsSync(IMAGE_DIR)) {
      fs.mkdirSync(IMAGE_DIR, { recursive: true });
    }

    const filename = `${reportId}_${sectionKey}.png`;
    const filePath = path.join(IMAGE_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(data.image_base64, 'base64'));

    console.log(`[ImageGen] Section image generated: ${filename}`);
    return filePath;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error(`[ImageGen] Timeout for ${sectionKey}`);
    } else {
      console.error(`[ImageGen] Failed for ${sectionKey}:`, err.message);
    }
    return null;
  }
}
