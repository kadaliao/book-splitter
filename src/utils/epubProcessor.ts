import JSZip from 'jszip';

export interface EpubChapter {
  id: string;
  title: string;
  href: string;
  anchor?: string; // 保存锚点信息，例如 #section1
  content?: string;
  level: number;
  children?: EpubChapter[];
}

/**
 * 解析 EPUB 文件的容器信息
 */
async function parseContainer(zip: JSZip): Promise<string> {
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) {
    throw new Error('无效的 EPUB 文件：缺少 container.xml');
  }

  const containerXml = await containerFile.async('text');
  const parser = new DOMParser();
  const doc = parser.parseFromString(containerXml, 'text/xml');

  const rootfile = doc.querySelector('rootfile');
  if (!rootfile) {
    throw new Error('无效的 EPUB 文件：无法找到 rootfile');
  }

  const fullPath = rootfile.getAttribute('full-path');
  if (!fullPath) {
    throw new Error('无效的 EPUB 文件：无法找到 content.opf 路径');
  }

  return fullPath;
}

/**
 * 解析 content.opf 文件
 */
async function parseContentOpf(zip: JSZip, opfPath: string): Promise<{
  basePath: string;
  navHref?: string;
  ncxHref?: string;
}> {
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error('无效的 EPUB 文件：无法找到 content.opf');
  }

  const opfXml = await opfFile.async('text');
  const parser = new DOMParser();
  const doc = parser.parseFromString(opfXml, 'text/xml');

  // 获取基础路径
  const basePath = opfPath.substring(0, opfPath.lastIndexOf('/'));

  // 查找导航文档
  const manifest = doc.querySelector('manifest');
  const navItem = manifest?.querySelector('item[properties="nav"]');
  const ncxItem = manifest?.querySelector('item[media-type="application/x-dtbncx+xml"]');

  return {
    basePath,
    navHref: navItem?.getAttribute('href') || undefined,
    ncxHref: ncxItem?.getAttribute('href') || undefined,
  };
}

/**
 * 根据锚点从HTML中提取对应的内容片段
 */
function extractContentByAnchor(html: string, anchor: string): string {
  const anchorId = anchor.substring(1); // 移除 # 号
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 查找锚点对应的元素
  const targetElement = doc.getElementById(anchorId);

  if (!targetElement) {
    // 如果找不到锚点，返回完整HTML
    console.warn(`找不到锚点 ${anchor}，返回完整内容`);
    return html;
  }

  // 获取目标元素及其所有内容
  const container = document.createElement('div');

  // 如果目标元素是 section 或其他块级元素，直接使用它
  if (['section', 'div', 'article'].includes(targetElement.tagName.toLowerCase())) {
    container.appendChild(targetElement.cloneNode(true));
  } else {
    // 如果是标题等元素，需要包含它之后的内容，直到下一个同级或更高级的标题
    const targetLevel = parseInt(targetElement.tagName.substring(1)) || 999;
    container.appendChild(targetElement.cloneNode(true));

    let sibling = targetElement.nextElementSibling;
    while (sibling) {
      const siblingTagName = sibling.tagName.toLowerCase();

      // 如果遇到同级或更高级的标题，停止
      if (siblingTagName.match(/^h[1-6]$/)) {
        const siblingLevel = parseInt(siblingTagName.substring(1));
        if (siblingLevel <= targetLevel) {
          break;
        }
      }

      container.appendChild(sibling.cloneNode(true));
      sibling = sibling.nextElementSibling;
    }
  }

  // 构建完整的HTML结构
  const head = doc.querySelector('head');
  const result = `
<!DOCTYPE html>
<html>
${head ? head.outerHTML : '<head></head>'}
<body>
${container.innerHTML}
</body>
</html>
  `;

  return result;
}

/**
 * 递归解析 NCX navPoint 节点
 */
function parseNavPoint(navPoint: Element, idPrefix: string, level: number): EpubChapter | null {
  const text = navPoint.querySelector(':scope > navLabel > text');
  const content = navPoint.querySelector(':scope > content');

  if (!text || !content) {
    return null;
  }

  const title = text.textContent?.trim() || `章节`;
  const hrefFull = content.getAttribute('src') || '';
  const [href, anchor] = hrefFull.includes('#')
    ? [hrefFull.split('#')[0], '#' + hrefFull.split('#')[1]]
    : [hrefFull, undefined];

  const chapter: EpubChapter = {
    id: idPrefix,
    title,
    href,
    anchor,
    level,
    children: []
  };

  // 递归处理子 navPoint
  const childNavPoints = navPoint.querySelectorAll(':scope > navPoint');
  childNavPoints.forEach((childNavPoint, index) => {
    const child = parseNavPoint(childNavPoint, `${idPrefix}-${index}`, level + 1);
    if (child) {
      chapter.children!.push(child);
    }
  });

  return chapter;
}

/**
 * 解析 NCX 文件（EPUB 2.0 格式）
 */
async function parseNcx(zip: JSZip, ncxPath: string): Promise<EpubChapter[]> {
  const ncxFile = zip.file(ncxPath);
  if (!ncxFile) {
    return [];
  }

  const ncxXml = await ncxFile.async('text');
  const parser = new DOMParser();
  const doc = parser.parseFromString(ncxXml, 'text/xml');

  // 获取顶层 navPoint（navMap 的直接子节点）
  const navMap = doc.querySelector('navMap');
  if (!navMap) {
    return [];
  }

  const topLevelNavPoints = navMap.querySelectorAll(':scope > navPoint');
  const chapters: EpubChapter[] = [];

  topLevelNavPoints.forEach((navPoint, index) => {
    const chapter = parseNavPoint(navPoint, `chapter-${index}`, 0);
    if (chapter) {
      chapters.push(chapter);
    }
  });

  return chapters;
}

/**
 * 递归解析导航列表项
 */
function parseNavList(listElement: Element, idPrefix: string, level: number): EpubChapter[] {
  const chapters: EpubChapter[] = [];
  const items = listElement.querySelectorAll(':scope > li');

  items.forEach((item, index) => {
    const link = item.querySelector(':scope > a[href], :scope > span > a[href]');
    if (!link) return;

    const title = link.textContent?.trim() || `章节`;
    const hrefFull = link.getAttribute('href') || '';
    const [href, anchor] = hrefFull.includes('#')
      ? [hrefFull.split('#')[0], '#' + hrefFull.split('#')[1]]
      : [hrefFull, undefined];

    const chapter: EpubChapter = {
      id: `${idPrefix}-${index}`,
      title,
      href,
      anchor,
      level,
      children: []
    };

    // 查找子列表
    const subList = item.querySelector(':scope > ol, :scope > ul');
    if (subList) {
      chapter.children = parseNavList(subList, chapter.id, level + 1);
    }

    chapters.push(chapter);
  });

  return chapters;
}

/**
 * 解析 Navigation 文件（EPUB 3.0 格式）
 */
async function parseNav(zip: JSZip, navPath: string): Promise<EpubChapter[]> {
  const navFile = zip.file(navPath);
  if (!navFile) {
    return [];
  }

  const navHtml = await navFile.async('text');
  const parser = new DOMParser();
  const doc = parser.parseFromString(navHtml, 'text/xml');

  const tocNav = doc.querySelector('nav[*|type="toc"]') || doc.querySelector('nav');
  if (!tocNav) {
    return [];
  }

  // 查找第一个 ol 或 ul
  const list = tocNav.querySelector('ol, ul');
  if (!list) {
    return [];
  }

  return parseNavList(list, 'chapter', 0);
}

/**
 * 从 EPUB 文件中提取章节信息
 */
export async function extractEpubChapters(
  file: File,
  onProgress?: (current: number, total: number, chapterTitle: string) => void
): Promise<EpubChapter[]> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // 解析容器信息
  const opfPath = await parseContainer(zip);
  const { basePath, navHref, ncxHref } = await parseContentOpf(zip, opfPath);

  // 尝试解析导航信息
  let chapters: EpubChapter[] = [];

  // 优先使用 EPUB 3.0 的 nav 文档
  if (navHref) {
    const navPath = basePath ? `${basePath}/${navHref}` : navHref;
    chapters = await parseNav(zip, navPath);
  }

  // 如果没有找到章节，尝试 EPUB 2.0 的 NCX
  if (chapters.length === 0 && ncxHref) {
    const ncxPath = basePath ? `${basePath}/${ncxHref}` : ncxHref;
    chapters = await parseNcx(zip, ncxPath);
  }

  if (chapters.length === 0) {
    throw new Error('此 EPUB 文件没有目录信息，无法自动识别章节');
  }

  // 只收集叶子节点（没有子章节的章节）以便加载内容
  const leafChapters: EpubChapter[] = [];
  const collectLeaves = (items: EpubChapter[]) => {
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

  // 按文件路径分组，避免重复加载同一个文件
  const fileCache = new Map<string, string>();

  // 并行加载叶子章节内容，使用节流控制进度更新
  const totalChapters = leafChapters.length;
  const batchSize = 10;
  let lastUpdateTime = Date.now();
  const updateInterval = 100; // 每100ms最多更新一次进度

  for (let i = 0; i < leafChapters.length; i += batchSize) {
    const batch = leafChapters.slice(i, Math.min(i + batchSize, leafChapters.length));

    await Promise.all(
      batch.map(async (chapter, batchIndex) => {
        const index = i + batchIndex;
        const chapterPath = basePath ? `${basePath}/${chapter.href}` : chapter.href;

        // 从缓存或文件中获取完整HTML内容
        if (!fileCache.has(chapterPath)) {
          const chapterFile = zip.file(chapterPath);
          if (chapterFile) {
            const fullContent = await chapterFile.async('text');
            fileCache.set(chapterPath, fullContent);
          }
        }

        const fullContent = fileCache.get(chapterPath);
        if (fullContent) {
          // 如果有锚点，尝试提取对应的内容片段
          if (chapter.anchor) {
            chapter.content = extractContentByAnchor(fullContent, chapter.anchor);
          } else {
            chapter.content = fullContent;
          }

          // 节流更新：只在间隔时间后更新，或批次的最后一个
          const now = Date.now();
          const isLastInBatch = batchIndex === batch.length - 1;
          if (isLastInBatch || now - lastUpdateTime >= updateInterval) {
            onProgress?.(index + 1, totalChapters, chapter.title);
            lastUpdateTime = now;
          }
        }
      })
    );

    // 批次完成后强制更新进度
    const currentProgress = Math.min(i + batchSize, totalChapters);
    const lastChapterInBatch = batch[batch.length - 1];
    onProgress?.(currentProgress, totalChapters, lastChapterInBatch.title);

    // 批次间小延迟确保UI更新
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 调试：打印章节信息
  const printChapterInfo = (items: EpubChapter[], indent = 0) => {
    items.forEach(item => {
      const hasContent = !!item.content;
      const anchorInfo = item.anchor ? ` (锚点: ${item.anchor})` : '';
      console.log(
        `${'  '.repeat(indent)}${item.title}: ${item.href}${anchorInfo} ${hasContent ? '✓ 有内容' : '✗ 无内容'}`
      );
      if (item.children && item.children.length > 0) {
        printChapterInfo(item.children, indent + 1);
      }
    });
  };
  console.log('=== EPUB 章节信息 ===');
  printChapterInfo(chapters);

  return chapters;
}

/**
 * 创建新的 EPUB 文件，包含选定的章节
 */
export async function createEpubFromChapters(
  originalFile: File,
  chapters: EpubChapter[]
): Promise<Uint8Array> {
  const arrayBuffer = await originalFile.arrayBuffer();
  const originalZip = await JSZip.loadAsync(arrayBuffer);
  const newZip = new JSZip();

  // 复制 mimetype
  const mimetypeFile = originalZip.file('mimetype');
  if (mimetypeFile) {
    const mimetypeContent = await mimetypeFile.async('text');
    newZip.file('mimetype', mimetypeContent, { compression: 'STORE' });
  }

  // 复制 META-INF
  originalZip.folder('META-INF')?.forEach((relativePath, file) => {
    file.async('uint8array').then((content) => {
      newZip.file(`META-INF/${relativePath}`, content);
    });
  });

  // 获取基础路径
  const opfPath = await parseContainer(originalZip);
  const { basePath } = await parseContentOpf(originalZip, opfPath);

  // 复制选定的章节文件
  for (const chapter of chapters) {
    const chapterPath = basePath ? `${basePath}/${chapter.href}` : chapter.href;
    const chapterFile = originalZip.file(chapterPath);

    if (chapterFile) {
      const content = await chapterFile.async('uint8array');
      newZip.file(chapterPath, content);
    }
  }

  // 生成新的 EPUB
  const epubBytes = await newZip.generateAsync({
    type: 'uint8array',
    mimeType: 'application/epub+zip',
  });

  return epubBytes;
}

/**
 * 下载 EPUB 文件
 */
export function downloadEpub(epubBytes: Uint8Array, filename: string): void {
  const blob = new Blob([epubBytes], { type: 'application/epub+zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
