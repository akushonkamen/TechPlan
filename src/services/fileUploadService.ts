/**
 * 文件上传服务
 * 支持内部文档上传：PDF、Word、TXT、Markdown
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// 动态导入（这些库只在服务器端使用）
let pdfParse: any = null;
let mammoth: any = null;

async function loadParsers() {
  if (!pdfParse) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    pdfParse = require('pdf-parse');
  }
  if (!mammoth) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mammoth = require('mammoth');
  }
}

interface UploadedFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  title: string;
  content: string;
  extractedAt: string;
}

interface UploadResult {
  success: boolean;
  file?: UploadedFile;
  error?: string;
}

// 支持的文件类型
const SUPPORTED_TYPES = {
  'application/pdf': { extension: '.pdf', type: 'PDF' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extension: '.docx', type: 'Word' },
  'application/msword': { extension: '.doc', type: 'Word' },
  'text/plain': { extension: '.txt', type: 'TXT' },
  'text/markdown': { extension: '.md', type: 'Markdown' },
  'text/x-markdown': { extension: '.md', type: 'Markdown' },
};

// 最大文件大小 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * 检查文件类型是否支持
 */
function isSupportedFileType(mimeType: string): boolean {
  return mimeType in SUPPORTED_TYPES;
}

/**
 * 检查文件大小是否合法
 */
function isValidFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}

/**
 * 从文件名提取标题（去除扩展名）
 */
function extractTitle(filename: string): string {
  const name = path.basename(filename);
  const ext = path.extname(name);
  return name.substring(0, name.length - ext.length);
}

/**
 * 解析 PDF 文件
 */
async function parsePDF(filePath: string): Promise<string> {
  await loadParsers();
  const dataBuffer = fs.readFileSync(filePath);
  // pdf-parse 的正确调用方式
  const data = await (pdfParse as any)(dataBuffer);
  return data.text;
}

/**
 * 解析 Word 文件
 */
async function parseWord(filePath: string): Promise<string> {
  await loadParsers();
  const dataBuffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer: dataBuffer });
  return result.value;
}

/**
 * 解析纯文本文件
 */
function parseTextFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * 处理上传的文件
 */
export async function processUploadedFile(
  file: Express.Multer.File,
  uploadsDir: string
): Promise<UploadResult> {
  try {
    // 验证文件类型
    if (!isSupportedFileType(file.mimetype)) {
      return {
        success: false,
        error: `不支持的文件类型: ${file.mimetype}。支持的类型: PDF、Word、TXT、Markdown`,
      };
    }

    // 验证文件大小
    if (!isValidFileSize(file.size)) {
      return {
        success: false,
        error: `文件大小超过限制 (最大 ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
      };
    }

    // 确保上传目录存在
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // 生成唯一文件名
    const fileId = uuidv4();
    const fileExtension = SUPPORTED_TYPES[file.mimetype].extension;
    const storedFileName = `${fileId}${fileExtension}`;
    const storedFilePath = path.join(uploadsDir, storedFileName);

    // 保存文件
    fs.writeFileSync(storedFilePath, file.buffer);

    // 根据类型提取文本内容
    let content = '';
    switch (file.mimetype) {
      case 'application/pdf':
        content = await parsePDF(storedFilePath);
        break;
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        content = await parseWord(storedFilePath);
        break;
      case 'text/plain':
      case 'text/markdown':
      case 'text/x-markdown':
        content = parseTextFile(storedFilePath);
        break;
      default:
        content = '';
    }

    // 清理内容
    content = content
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (content.length === 0) {
      return {
        success: false,
        error: '无法从文件中提取文本内容，请确认文件不是图片或扫描件',
      };
    }

    const uploadedFile: UploadedFile = {
      id: fileId,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      title: extractTitle(file.originalname),
      content,
      extractedAt: new Date().toISOString(),
    };

    return { success: true, file: uploadedFile };
  } catch (error) {
    console.error('File processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '文件处理失败',
    };
  }
}
