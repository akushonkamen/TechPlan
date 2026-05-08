import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

function loadServiceConfig() {
  try {
    const configPath = path.join(process.cwd(), 'config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

const PPTMASTER_DIR = process.env.PPTMASTER_DIR || loadServiceConfig().services?.pptMasterDir || path.join(process.cwd(), '..', 'ppt-master');
const SCRIPTS_DIR = path.join(PPTMASTER_DIR, 'skills', 'ppt-master', 'scripts');
const PYTHON = process.env.PPTMASTER_PYTHON || path.join(PPTMASTER_DIR, '.venv', 'bin', 'python3');
const IMAGE_DIR = path.join(process.cwd(), 'generated_images');
function resolveTemplateDir(): string {
  const config = loadServiceConfig();
  const templateName = config.ppt?.template || 'minimal_white';
  return path.join(PPTMASTER_DIR, 'skills', 'ppt-master', 'templates', 'layouts', templateName);
}
const TEMPLATE_DIR = resolveTemplateDir();

interface ReportSection {
  id: string;
  title: string;
  thesis?: string;
  content?: string;
  highlights?: string[];
  signals?: { type: string; title: string; description: string; confidence: number }[];
}

interface ReportContent {
  meta?: { type?: string; topicName?: string; period?: { start?: string; end?: string } };
  executiveSummary?: { overview?: string; keyPoints?: any[] };
  sections?: ReportSection[];
  timeline?: any[];
  metrics?: any;
}

interface Report {
  id: string;
  title: string;
  summary?: string;
  type: string;
  content: string | ReportContent;
  topic_name?: string;
}

function parseReportContent(raw: string | ReportContent): ReportContent {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw;
}

function escXml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

function readTemplate(name: string): string {
  const p = path.join(TEMPLATE_DIR, name);
  if (!fs.existsSync(p)) throw new Error(`Template not found: ${p}`);
  return fs.readFileSync(p, 'utf-8');
}

function replacePlaceholders(svg: string, map: Record<string, string>): string {
  let result = svg;
  for (const [key, value] of Object.entries(map)) {
    result = result.replaceAll(`{{${key}}}`, escXml(value));
  }
  return result;
}

function isPptMasterAvailable(): boolean {
  return fs.existsSync(path.join(SCRIPTS_DIR, 'svg_to_pptx.py'));
}

function createTempProject(reportId: string): string {
  const dir = path.join(process.cwd(), 'tmp', `pptx-${reportId}`);
  fs.mkdirSync(path.join(dir, 'svg_output'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'svg_final'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'exports'), { recursive: true });
  return dir;
}

// Wrap text into lines of approximately maxChars per line

// Template color schemes
const COLOR_SCHEMES = {
  mckinsey: {
    bulletDot: '#005587',
    bulletText: '#5D6D7E',
    cardTitle: '#2C3E50',
    cardDesc: '#7F8C8D',
    emptyFill: '#BDC3C7',
    fallbackText: '#5D6D7E',
    signalColors: {
      trend: { bg: '#F0F7FF', border: '#005587', dot: '#0076A8' },
      breakthrough: { bg: '#FFF8E1', border: '#F5A623', dot: '#F5A623' },
      opportunity: { bg: '#F0FFF4', border: '#27AE60', dot: '#27AE60' },
      threat: { bg: '#FFF5F5', border: '#E74C3C', dot: '#E74C3C' },
      milestone: { bg: '#F5F0FF', border: '#7C3AED', dot: '#7C3AED' },
    },
  },
  eng_whiteboard: {
    bulletDot: '#C41E3A',
    bulletText: '#C9D1D9',
    cardTitle: '#C9D1D9',
    cardDesc: '#8B949E',
    emptyFill: '#8B949E',
    fallbackText: '#C9D1D9',
    signalColors: {
      trend: { bg: '#161B22', border: '#58A6FF', dot: '#58A6FF' },
      breakthrough: { bg: '#161B22', border: '#F0883E', dot: '#F0883E' },
      opportunity: { bg: '#161B22', border: '#3FB950', dot: '#3FB950' },
      threat: { bg: '#161B22', border: '#F85149', dot: '#F85149' },
      milestone: { bg: '#161B22', border: '#BC8CFF', dot: '#BC8CFF' },
    },
  },
  minimal_white: {
    bulletDot: '#1a1a2e',
    bulletText: '#374151',
    cardTitle: '#1a1a2e',
    cardDesc: '#6b7280',
    emptyFill: '#e5e7eb',
    fallbackText: '#374151',
    signalColors: {
      trend: { bg: '#f9fafb', border: '#e5e7eb', dot: '#1a1a2e' },
      breakthrough: { bg: '#f9fafb', border: '#e5e7eb', dot: '#1a1a2e' },
      opportunity: { bg: '#f9fafb', border: '#e5e7eb', dot: '#1a1a2e' },
      threat: { bg: '#f9fafb', border: '#e5e7eb', dot: '#1a1a2e' },
      milestone: { bg: '#f9fafb', border: '#e5e7eb', dot: '#1a1a2e' },
    },
  },
} as const;

function getActiveScheme() {
  const config = loadServiceConfig();
  const templateName = config.ppt?.template || 'minimal_white';
  return COLOR_SCHEMES[templateName as keyof typeof COLOR_SCHEMES] || COLOR_SCHEMES.minimal_white;
}

function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue; }
    const words = paragraph.split(/\s+/);
    let current = '';
    for (const w of words) {
      if ((current + ' ' + w).trim().length > maxChars && current) {
        lines.push(current.trim());
        current = w;
      } else {
        current = current ? current + ' ' + w : w;
      }
    }
    if (current) lines.push(current.trim());
  }
  return lines;
}

// Generate bullet point SVG elements within content area
function buildBulletContent(items: string[], startY: number, maxWidth: number): string {
  const scheme = getActiveScheme();
  const elements: string[] = [];
  let y = startY;
  const lineHeight = 28;
  const maxCharsPerLine = 65;

  for (let i = 0; i < items.length && y < startY + 400; i++) {
    const lines = wrapText(truncate(items[i], 200), maxCharsPerLine);
    // Bullet dot
    elements.push(`<circle cx="82" cy="${y - 4}" r="3" fill="${scheme.bulletDot}"/>`);
    for (const line of lines) {
      elements.push(
        `<text x="96" y="${y}" font-family="Arial, sans-serif" font-size="15" fill="${scheme.bulletText}">${escXml(line)}</text>`
      );
      y += lineHeight;
    }
    y += 6; // extra spacing between items
  }
  return elements.join('\n    ');
}

// Generate signal cards (2-column layout)
function buildSignalCards(signals: { type: string; title: string; description: string; confidence: number }[], startY: number): string {
  const scheme = getActiveScheme();
  const elements: string[] = [];
  let y = startY;
  const cardHeight = 70;
  const cardWidth = 555;
  const gap = 30;

  const colorMap = scheme.signalColors;

  for (let i = 0; i < signals.length && y + cardHeight <= startY + 420; i += 2) {
    for (let col = 0; col < 2 && i + col < signals.length; col++) {
      const sig = signals[i + col];
      const x = col === 0 ? 60 : 60 + cardWidth + gap;
      const colors = colorMap[sig.type as keyof typeof colorMap] || colorMap.trend;

      elements.push(`<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" fill="${colors.bg}" stroke="${colors.border}" stroke-width="1" rx="6"/>`);
      elements.push(`<rect x="${x}" y="${y}" width="4" height="${cardHeight}" fill="${colors.dot}" rx="2"/>`);
      elements.push(`<circle cx="${x + 20}" cy="${y + 22}" r="4" fill="${colors.dot}"/>`);
      elements.push(`<text x="${x + 32}" y="${y + 26}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="${scheme.cardTitle}">${escXml(truncate(sig.title, 40))}</text>`);
      elements.push(`<text x="${x + 20}" y="${y + 50}" font-family="Arial, sans-serif" font-size="12" fill="${scheme.cardDesc}">${escXml(truncate(sig.description, 70))}</text>`);
      elements.push(`<text x="${x + cardWidth - 15}" y="${y + 26}" text-anchor="end" font-family="Arial, sans-serif" font-size="11" fill="${colors.dot}">${(sig.confidence * 100).toFixed(0)}%</text>`);
    }
    y += cardHeight + 12;
  }
  return elements.join('\n    ');
}

interface ExistingImages {
  coverImageUrl?: string;
  sectionImages?: Record<string, string>;
}

export async function exportReportToPptx(report: Report, existingImages?: ExistingImages): Promise<string> {
  if (!isPptMasterAvailable()) {
    throw new Error('ppt-master not found. Install: git clone https://github.com/akushonkamen/ppt-master.git ' + PPTMASTER_DIR);
  }

  const content = parseReportContent(report.content);
  const sections = content.sections || [];
  const reportType = report.type || content.meta?.type || 'weekly';
  const topicName = report.topic_name || content.meta?.topicName || '';
  const period = content.meta?.period || {};
  const dateStr = period.end ? period.end : new Date().toISOString().slice(0, 10);

  const templateName = path.basename(TEMPLATE_DIR);
  console.log(`[PPTX] Exporting report ${report.id} (${sections.length} sections) using ${templateName} template`);

  const projectDir = createTempProject(report.id);
  const svgOutputDir = path.join(projectDir, 'svg_output');
  let pageNum = 1;

  try {
    // ── Slide 1: Cover ──
    const coverImagePath = existingImages?.coverImageUrl
      ? path.join(process.cwd(), existingImages.coverImageUrl)
      : null;

    if (coverImagePath && fs.existsSync(coverImagePath)) {
      // Use image-based cover if available
      console.log('[PPTX] Using existing cover image with cover template');
      const coverTpl = readTemplate('01_cover.svg');
      const coverSvg = replacePlaceholders(coverTpl, {
        TITLE: report.title.split('·')[0].trim() || report.title,
        TITLE_LINE2: report.title.includes('·') ? report.title.split('·').slice(1).join('·').trim() : reportType,
        SUBTITLE: topicName + ' · ' + dateStr,
        PROJECT_CODE: report.id.slice(0, 12).toUpperCase(),
        DATE: dateStr,
        PAGE_NUM: String(pageNum),
      });
      // Overlay image on right side
      const imgInsert = coverSvg.replace('</svg>',
        `<image href="${escXml(coverImagePath)}" x="780" y="100" width="440" height="440" preserveAspectRatio="xMidYMid slice" clip-path="inset(0 round 8px)"/>\n</svg>`
      );
      fs.writeFileSync(path.join(svgOutputDir, `slide_${String(pageNum).padStart(3, '0')}.svg`), imgInsert);
    } else {
      console.log('[PPTX] Creating cover slide');
      const coverTpl = readTemplate('01_cover.svg');
      const coverSvg = replacePlaceholders(coverTpl, {
        TITLE: report.title.split('·')[0].trim() || report.title,
        TITLE_LINE2: report.title.includes('·') ? report.title.split('·').slice(1).join('·').trim() : reportType,
        SUBTITLE: topicName + ' · ' + dateStr,
        PROJECT_CODE: report.id.slice(0, 12).toUpperCase(),
        DATE: dateStr,
        PAGE_NUM: String(pageNum),
      });
      fs.writeFileSync(path.join(svgOutputDir, `slide_${String(pageNum).padStart(3, '0')}.svg`), coverSvg);
    }
    pageNum++;

    // ── Slide 2: TOC ──
    if (sections.length > 0) {
      console.log('[PPTX] Creating TOC slide');
      const tocTpl = readTemplate('02_toc.svg');
      const tocMap: Record<string, string> = {
        PAGE_NUM: String(pageNum),
        PROJECT_CODE: report.id.slice(0, 12).toUpperCase(),
      };
      for (let i = 0; i < Math.min(5, sections.length); i++) {
        tocMap[`TOC_${i + 1}_TITLE`] = sections[i].title;
        tocMap[`TOC_${i + 1}_DESC`] = truncate(sections[i].thesis || '', 50);
      }
      // Fill unused slots
      for (let i = sections.length; i < 5; i++) {
        tocMap[`TOC_${i + 1}_TITLE`] = '';
        tocMap[`TOC_${i + 1}_DESC`] = '';
      }
      const tocSvg = replacePlaceholders(tocTpl, tocMap);
      fs.writeFileSync(path.join(svgOutputDir, `slide_${String(pageNum).padStart(3, '0')}.svg`), tocSvg);
      pageNum++;
    }

    // ── Content slides (merged sections) ──
    // Merge multiple sections into fewer slides for higher content density
    const maxContentSlides = 3;
    const contentSlideCount = Math.min(sections.length, maxContentSlides);
    const sectionsPerSlide = Math.ceil(sections.length / contentSlideCount);

    for (let slideIdx = 0; slideIdx < contentSlideCount; slideIdx++) {
      const startSec = slideIdx * sectionsPerSlide;
      const endSec = Math.min(startSec + sectionsPerSlide, sections.length);
      const slideSections = sections.slice(startSec, endSec);

      // Use first section's title as page title, or combined
      const pageTitle = slideSections.length === 1
        ? slideSections[0].title
        : slideSections.map(s => s.title).join(' · ');

      console.log(`[PPTX] Content slide ${slideIdx + 1}: ${slideSections.map(s => s.title).join(' + ')}`);
      const contentTpl = readTemplate('03_content.svg');

      // Build merged content for all sections in this slide
      const scheme = getActiveScheme();
      let contentAreaSvg = '';
      let y = 180;

      for (let si = 0; si < slideSections.length; si++) {
        const section = slideSections[si];

        // Section header (skip for first section if only one)
        if (slideSections.length > 1) {
          contentAreaSvg += `<text x="70" y="${y}" font-family="Arial, sans-serif" font-size="17" font-weight="bold" fill="#1a1a2e">${escXml(section.title)}</text>\n`;
          y += 6;
          contentAreaSvg += `<rect x="70" y="${y}" width="1140" height="1" fill="#e5e7eb"/>\n`;
          y += 18;
        }

        // Thesis
        if (section.thesis) {
          const thesisLines = wrapText(truncate(section.thesis, 120), 80).slice(0, 2);
          for (const line of thesisLines) {
            contentAreaSvg += `<text x="70" y="${y}" font-family="Arial, sans-serif" font-size="13" fill="#6b7280">${escXml(line)}</text>\n`;
            y += 22;
          }
          y += 4;
        }

        // Highlights as bullets
        if (section.highlights && section.highlights.length > 0) {
          for (let hi = 0; hi < section.highlights.length && y < 600; hi++) {
            const lines = wrapText(truncate(section.highlights[hi], 150), 75);
            contentAreaSvg += `<circle cx="82" cy="${y - 4}" r="2.5" fill="${scheme.bulletDot}"/>\n`;
            for (const line of lines) {
              contentAreaSvg += `<text x="94" y="${y}" font-family="Arial, sans-serif" font-size="13" fill="${scheme.bulletText}">${escXml(line)}</text>\n`;
              y += 20;
            }
            y += 6;
          }
        } else if (section.content) {
          // Fallback: plain text
          const textLines = wrapText(truncate(section.content, 400), 80).slice(0, 8);
          for (const line of textLines) {
            contentAreaSvg += `<text x="70" y="${y}" font-family="Arial, sans-serif" font-size="13" fill="${scheme.fallbackText}">${escXml(line)}</text>\n`;
            y += 20;
          }
        }

        // Separator between sections (except last)
        if (si < slideSections.length - 1) {
          y += 10;
          contentAreaSvg += `<rect x="70" y="${y}" width="1140" height="1" fill="#e5e7eb"/>\n`;
          y += 16;
        }
      }

      // Replace content area placeholder
      const CONTENT_MARKER = '__TECHPLAN_CONTENT_AREA__';
      let contentSvg = contentTpl
        .replace(/<rect x="60" y="170"[\s\S]*?1160.{1,3}450 px\s*<\/text>/, CONTENT_MARKER);

      contentSvg = replacePlaceholders(contentSvg, {
        PAGE_TITLE: pageTitle,
        PAGE_NUM: String(pageNum),
        PROJECT_CODE: report.id.slice(0, 12).toUpperCase(),
        SECTION_NAME: topicName,
      });

      contentSvg = contentSvg.replace(CONTENT_MARKER,
        contentAreaSvg || `<text x="640" y="400" text-anchor="middle" fill="${scheme.emptyFill}" font-family="Arial, sans-serif" font-size="16">—</text>`
      );

      fs.writeFileSync(path.join(svgOutputDir, `slide_${String(pageNum).padStart(3, '0')}.svg`), contentSvg);
      pageNum++;
    }

    // ── Ending slide ──
    console.log('[PPTX] Creating ending slide');
    const endingTpl = readTemplate('04_ending.svg');
    const endingSvg = replacePlaceholders(endingTpl, {
      THANK_YOU: '感谢关注',
      ENDING_SUBTITLE: topicName + ' · ' + dateStr,
      CONTACT_INFO: 'TechPlan Intelligence',
      CONTACT_TITLE: 'Technology Intelligence Platform',
      CONTACT_EMAIL: 'techplan@intelligence.ai',
      CONTACT_PHONE: '',
      COPYRIGHT: `© ${new Date().getFullYear()} TechPlan Intelligence. All rights reserved.`,
      PAGE_NUM: String(pageNum),
    });
    fs.writeFileSync(path.join(svgOutputDir, `slide_${String(pageNum).padStart(3, '0')}.svg`), endingSvg);

    // ── Run ppt-master finalize_svg.py ──
    console.log('[PPTX] Running finalize_svg.py...');
    try {
      const finalizeResult = execSync(`"${PYTHON}" "${path.join(SCRIPTS_DIR, 'finalize_svg.py')}" "${projectDir}" 2>&1`, {
        encoding: 'utf-8',
        timeout: 60_000,
      });
      console.log('[PPTX] finalize_svg.py output:', finalizeResult);
    } catch (err: any) {
      console.warn('[PPTX] finalize_svg.py failed (non-fatal):', err.message);
      // Fallback: copy svg_output to svg_final
      const srcDir = svgOutputDir;
      const dstDir = path.join(projectDir, 'svg_final');
      const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.svg'));
      for (const f of files) {
        fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
      }
    }

    // ── Run ppt-master svg_to_pptx.py ──
    console.log('[PPTX] Running svg_to_pptx.py...');
    try {
      const pptxStdout = execSync(`"${PYTHON}" "${path.join(SCRIPTS_DIR, 'svg_to_pptx.py')}" "${projectDir}" -s final 2>&1`, {
        encoding: 'utf-8',
        timeout: 60_000,
      });
      console.log('[PPTX] svg_to_pptx.py output:', pptxStdout);
    } catch (err: any) {
      console.error('[PPTX] svg_to_pptx.py failed:', err.message, '\nstdout:', err.stdout || '', '\nstderr:', err.stderr || '');
      console.error('[PPTX] Temp dir preserved at:', projectDir);
      throw new Error(`svg_to_pptx.py failed: ${err.stdout || ''} ${err.stderr || ''} ${err.message}`);
    }

    // ── Find and move the exported PPTX ──
    const exportsDir = path.join(projectDir, 'exports');
    const pptxFiles = fs.readdirSync(exportsDir).filter(f => f.endsWith('.pptx') && !f.includes('_svg'));
    if (pptxFiles.length === 0) {
      throw new Error('svg_to_pptx.py did not produce a PPTX file');
    }

    if (!fs.existsSync(IMAGE_DIR)) {
      fs.mkdirSync(IMAGE_DIR, { recursive: true });
    }

    const destPath = path.join(IMAGE_DIR, `${report.id}.pptx`);
    const srcPath = path.join(exportsDir, pptxFiles[0]);
    fs.copyFileSync(srcPath, destPath);

    console.log(`[PPTX] Exported: /generated_images/${report.id}.pptx`);
    return `/generated_images/${report.id}.pptx`;

  } catch (err) {
    console.error('[PPTX] Temp dir preserved for debugging:', projectDir);
    throw err;
  } finally {
    try {
      fs.rmSync(projectDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
  }
}

export { isPptMasterAvailable };
