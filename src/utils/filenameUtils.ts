/**
 * 转义文件名中不能使用的字符
 * 支持 Windows, macOS, Linux 所有平台
 */
export function sanitizeFilename(filename: string): string {
  // 替换不能作为文件名的字符
  // Windows: < > : " / \ | ? *
  // macOS/Linux: /
  // 所有平台都需要处理的控制字符

  return filename
    // 替换路径分隔符
    .replace(/[/\\]/g, '_')
    // 替换其他非法字符
    .replace(/[<>:"|?*]/g, '_')
    // 替换控制字符 (ASCII 0-31)
    .replace(/[\x00-\x1f]/g, '_')
    // 移除首尾空格和点号（Windows 不允许）
    .trim()
    .replace(/^\.+|\.+$/g, '')
    // 限制长度（考虑到某些文件系统的限制）
    .slice(0, 200);
}

/**
 * 构建带有父层级的文件名
 * 例如: "01_第一篇_第一章"
 */
export function buildHierarchicalFilename(
  index: number,
  parentTitles: string[],
  currentTitle: string,
  extension: string = '.pdf'
): string {
  const indexPrefix = String(index + 1).padStart(2, '0');

  // 构建层级路径
  const titleParts = [...parentTitles, currentTitle].map(sanitizeFilename);
  const filename = `${indexPrefix}_${titleParts.join('_')}${extension}`;

  return filename;
}

/**
 * 从章节树中查找章节的所有父级标题
 */
export function findParentTitles<T extends { id: string; title: string; children?: T[] }>(
  chapters: T[],
  targetId: string,
  parentTitles: string[] = []
): string[] | null {
  for (const chapter of chapters) {
    if (chapter.id === targetId) {
      return parentTitles;
    }

    if (chapter.children && chapter.children.length > 0) {
      const result = findParentTitles(
        chapter.children,
        targetId,
        [...parentTitles, chapter.title]
      );
      if (result !== null) {
        return result;
      }
    }
  }

  return null;
}
