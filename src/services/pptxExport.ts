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
const TEMPLATE_DIR = path.join(PPTMASTER_DIR, 'skills', 'ppt-master', 'templates', 'layouts', 'mckinsey');

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
  const elements: string[] = [];
  let y = startY;
  const lineHeight = 28;
  const maxCharsPerLine = 65;

  for (let i = 0; i < items.length && y < startY + 400; i++) {
    const lines = wrapText(truncate(items[i], 200), maxCharsPerLine);
    // Bullet dot
    elements.push(`<circle cx="82" cy="${y - 4}" r="3" fill="#005587"/>`);
    for (const line of lines) {
      elements.push(
        `<text x="96" y="${y}" font-family="Arial, sans-serif" font-size="15" fill="#5D6D7E">${escXml(line)}</text>`
      );
      y += lineHeight;
    }
    y += 6; // extra spacing between items
  }
  return elements.join('\n    ');
}

// Generate signal cards (2-column layout)
function buildSignalCards(signals: { type: string; title: string; description: string; confidence: number }[], startY: number): string {
  const elements: string[] = [];
  let y = startY;
  const cardHeight = 70;
  const cardWidth = 555;
  const gap = 30;

  const colorMap: Record<string, { bg: string; border: string; dot: string }> = {
    trend: { bg: '#F0F7FF', border: '#005587', dot: '#0076A8' },
    breakthrough: { bg: '#FFF8E1', border: '#F5A623', dot: '#F5A623' },
    opportunity: { bg: '#F0FFF4', border: '#27AE60', dot: '#27AE60' },
    threat: { bg: '#FFF5F5', border: '#E74C3C', dot: '#E74C3C' },
    milestone: { bg: '#F5F0FF', border: '#7C3AED', dot: '#7C3AED' },
  };

  for (let i = 0; i < signals.length && y + cardHeight <= startY + 420; i += 2) {
    for (let col = 0; col < 2 && i + col < signals.length; col++) {
      const sig = signals[i + col];
      const x = col === 0 ? 60 : 60 + cardWidth + gap;
      const colors = colorMap[sig.type] || colorMap.trend;

      elements.push(`<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" fill="${colors.bg}" stroke="${colors.border}" stroke-width="1" rx="6"/>`);
      elements.push(`<rect x="${x}" y="${y}" width="4" height="${cardHeight}" fill="${colors.dot}" rx="2"/>`);
      elements.push(`<circle cx="${x + 20}" cy="${y + 22}" r="4" fill="${colors.dot}"/>`);
      elements.push(`<text x="${x + 32}" y="${y + 26}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#2C3E50">${escXml(truncate(sig.title, 40))}</text>`);
      elements.push(`<text x="${x + 20}" y="${y + 50}" font-family="Arial, sans-serif" font-size="12" fill="#7F8C8D">${escXml(truncate(sig.description, 70))}</text>`);
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

  console.log(`[PPTX] Exporting report ${report.id} (${sections.length} sections) using mckinsey template`);

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
      console.log('[PPTX] Creating mckinsey cover slide');
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
      const tocMap: Record<string, string> = { PAGE_NUM: String(pageNum) };
      for (let i = 0; i < Math.min(6, sections.length); i++) {
        tocMap[`TOC_ITEM_${i + 1}_TITLE`] = sections[i].title;
        tocMap[`TOC_ITEM_${i + 1}_DESC`] = truncate(sections[i].thesis || '', 40);
      }
      // Fill unused slots
      for (let i = sections.length; i < 6; i++) {
        tocMap[`TOC_ITEM_${i + 1}_TITLE`] = '';
        tocMap[`TOC_ITEM_${i + 1}_DESC`] = '';
      }
      tocMap['KEY_FOCUS'] = truncate(content.executiveSummary?.overview || report.summary || '', 100);
      const tocSvg = replacePlaceholders(tocTpl, tocMap);
      fs.writeFileSync(path.join(svgOutputDir, `slide_${String(pageNum).padStart(3, '0')}.svg`), tocSvg);
      pageNum++;
    }

    // ── Section slides ──
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      // Chapter divider
      console.log(`[PPTX] Chapter divider: ${section.title}`);
      const chapterTpl = readTemplate('02_chapter.svg');
      const chapterSvg = replacePlaceholders(chapterTpl, {
        CHAPTER_NUM: String(i + 1).padStart(2, '0'),
        CHAPTER_TITLE: section.title,
        CHAPTER_DESC: truncate(section.thesis || '', 60),
        PAGE_NUM: String(pageNum),
        PROJECT_CODE: report.id.slice(0, 12).toUpperCase(),
      });
      fs.writeFileSync(path.join(svgOutputDir, `slide_${String(pageNum).padStart(3, '0')}.svg`), chapterSvg);
      pageNum++;

      // Content page
      console.log(`[PPTX] Content page: ${section.title}`);
      const contentTpl = readTemplate('03_content.svg');

      // Build content area
      let contentAreaSvg = '';
      const hasSignals = section.signals && section.signals.length > 0;
      const hasHighlights = section.highlights && section.highlights.length > 0;

      if (hasSignals) {
        // Signal cards layout
        contentAreaSvg = buildSignalCards(section.signals!, 180);
      }

      if (hasHighlights) {
        const bulletStartY = hasSignals ? 440 : 180;
        contentAreaSvg += (contentAreaSvg ? '\n    ' : '') + buildBulletContent(section.highlights!, bulletStartY, 1100);
      }

      // If neither, put text content
      if (!hasSignals && !hasHighlights && section.content) {
        const textContent = truncate(section.content, 600);
        const lines = wrapText(textContent, 80).slice(0, 14);
        contentAreaSvg = lines.map((line, j) =>
          `<text x="80" y="${190 + j * 28}" font-family="Arial, sans-serif" font-size="15" fill="#5D6D7E">${escXml(line)}</text>`
        ).join('\n    ');
      }

      // Replace content area placeholder BEFORE other replacements
      // Use unique marker to avoid regex encoding issues with × etc.
      const CONTENT_MARKER = '__TECHPLAN_CONTENT_AREA__';
      let contentSvg = contentTpl
        .replace(/<rect x="60" y="170"[\s\S]*?1160.{1,3}450 px\s*<\/text>/, CONTENT_MARKER);

      // Replace remaining placeholders
      contentSvg = replacePlaceholders(contentSvg, {
        SECTION_NUM: String(i + 1).padStart(2, '0'),
        PAGE_TITLE: section.title,
        SECTION_NAME: topicName,
        KEY_MESSAGE: truncate(section.thesis || '', 70),
        SOURCE: 'TechPlan Intelligence Platform',
        NOTE: '',
        PAGE_NUM: String(pageNum),
      });

      // Insert actual content
      contentSvg = contentSvg.replace(CONTENT_MARKER,
        contentAreaSvg || '<text x="640" y="400" text-anchor="middle" fill="#BDC3C7" font-family="Arial, sans-serif" font-size="16">—</text>'
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
