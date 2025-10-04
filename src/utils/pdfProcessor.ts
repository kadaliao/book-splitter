import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// 配置 PDF.js worker - 使用本地 worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export interface PdfChapter {
  id: string;
  title: string;
  startPage: number;
  endPage: number;
  level: number;
  children?: PdfChapter[];
}

/**
 * 递归解析 PDF 大纲节点
 */
async function parseOutlineItem(
  item: any,
  pdfDoc: any,
  level: number,
  idPrefix: string,
  allItems: any[]
): Promise<PdfChapter> {
  const title = item.title;

  // 获取章节的起始页码
  let startPage = 1;
  if (item.dest) {
    try {
      const dest = typeof item.dest === 'string'
        ? await pdfDoc.getDestination(item.dest)
        : item.dest;

      if (dest) {
        const pageRef = dest[0];
        const pageIndex = await pdfDoc.getPageIndex(pageRef);
        startPage = pageIndex + 1; // 转换为 1 based
      }
    } catch (err) {
      console.warn('无法获取章节页码:', err);
    }
  }

  const chapter: PdfChapter = {
    id: idPrefix,
    title,
    startPage,
    endPage: startPage, // 初始值，后续会更新
    level,
    children: []
  };

  // 递归处理子章节
  if (item.items && item.items.length > 0) {
    for (let i = 0; i < item.items.length; i++) {
      const child = await parseOutlineItem(
        item.items[i],
        pdfDoc,
        level + 1,
        `${idPrefix}-${i}`,
        allItems
      );
      chapter.children!.push(child);
    }
  }

  allItems.push(chapter);
  return chapter;
}

/**
 * 计算章节的结束页码
 * 优化：只计算叶子节点（没有子章节的章节）的 endPage
 * 父章节的 endPage 设置为其最后一个子孙节点的 endPage
 */
function calculateEndPages(chapters: PdfChapter[], totalPages: number): void {
  // 收集所有叶子节点（没有子章节的章节）
  const leafChapters: PdfChapter[] = [];

  const collectLeaves = (items: PdfChapter[]) => {
    items.forEach(item => {
      if (!item.children || item.children.length === 0) {
        // 叶子节点
        leafChapters.push(item);
      } else {
        // 有子节点，继续递归
        collectLeaves(item.children);
      }
    });
  };

  collectLeaves(chapters);

  // 按起始页码排序叶子节点
  leafChapters.sort((a, b) => a.startPage - b.startPage);

  // 计算每个叶子节点的结束页码
  for (let i = 0; i < leafChapters.length; i++) {
    const current = leafChapters[i];
    if (i < leafChapters.length - 1) {
      current.endPage = leafChapters[i + 1].startPage - 1;
    } else {
      current.endPage = totalPages;
    }
  }

  // 为父章节设置 endPage（等于其最后一个子孙节点的 endPage）
  const setParentEndPages = (items: PdfChapter[]) => {
    items.forEach(item => {
      if (item.children && item.children.length > 0) {
        // 递归处理子节点
        setParentEndPages(item.children);

        // 找到最后一个子孙叶子节点的 endPage
        const getLastDescendantEndPage = (ch: PdfChapter): number => {
          if (!ch.children || ch.children.length === 0) {
            return ch.endPage;
          }
          const lastChild = ch.children[ch.children.length - 1];
          return getLastDescendantEndPage(lastChild);
        };

        item.endPage = getLastDescendantEndPage(item);
      }
    });
  };

  setParentEndPages(chapters);
}

/**
 * 从 PDF 文件中提取章节信息
 */
export async function extractPdfChapters(
  file: File,
  onProgress?: (current: number, total: number, chapterTitle: string) => void
): Promise<PdfChapter[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;

  const outline = await pdfDoc.getOutline();

  if (!outline || outline.length === 0) {
    throw new Error('此 PDF 文件没有目录信息，无法自动识别章节');
  }

  const chapters: PdfChapter[] = [];
  const allItems: any[] = [];
  const totalPages = pdfDoc.numPages;

  // 提取章节信息
  let lastUpdateTime = Date.now();
  const updateInterval = 100; // 每100ms最多更新一次

  for (let i = 0; i < outline.length; i++) {
    const item = outline[i];

    // 节流更新进度
    const now = Date.now();
    if (now - lastUpdateTime >= updateInterval || i === outline.length - 1) {
      onProgress?.(i + 1, outline.length, item.title);
      lastUpdateTime = now;
    }

    const chapter = await parseOutlineItem(item, pdfDoc, 0, `chapter-${i}`, allItems);
    chapters.push(chapter);

    // 每10个章节添加小延迟让UI更新
    if ((i + 1) % 10 === 0 && i < outline.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  // 计算所有章节的结束页码
  calculateEndPages(chapters, totalPages);

  // 调试：打印章节信息
  const printChapterInfo = (items: PdfChapter[], indent = 0) => {
    items.forEach(item => {
      console.log(
        `${'  '.repeat(indent)}${item.title}: p${item.startPage}-${item.endPage} (${item.endPage - item.startPage + 1}页)`
      );
      if (item.children && item.children.length > 0) {
        printChapterInfo(item.children, indent + 1);
      }
    });
  };
  console.log('=== PDF 章节信息 ===');
  printChapterInfo(chapters);

  // 最后一次进度更新
  if (outline.length > 0) {
    const lastItem = outline[outline.length - 1];
    onProgress?.(outline.length, outline.length, lastItem.title);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return chapters;
}

/**
 * 从 PDF 中提取指定页码范围的内容并创建新的 PDF
 */
export async function extractPdfPages(
  file: File,
  startPage: number,
  endPage: number
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);

  const newPdfDoc = await PDFDocument.create();

  // 复制指定范围的页面（转换为 0-based index）
  const pages = await newPdfDoc.copyPages(
    pdfDoc,
    Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage - 1 + i)
  );

  pages.forEach((page) => {
    newPdfDoc.addPage(page);
  });

  // 使用压缩选项保存 PDF
  const pdfBytes = await newPdfDoc.save({
    useObjectStreams: true, // 使用对象流压缩
    addDefaultPage: false,
    objectsPerTick: 50
  });

  return pdfBytes;
}

/**
 * 下载 PDF 文件
 */
export function downloadPdf(pdfBytes: Uint8Array, filename: string): void {
  const blob = new Blob([pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
