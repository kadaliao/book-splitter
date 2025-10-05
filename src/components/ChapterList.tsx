import React, { useState } from 'react';

interface Chapter {
  id: string;
  title: string;
  startPage?: number;
  endPage?: number;
  href?: string;
  level: number;
  children?: Chapter[];
}

interface ChapterListProps {
  chapters: Chapter[];
  fileType: 'pdf' | 'epub';
  isProcessing?: boolean;
  onExport: (selectedChapters: Chapter[], mergeMode: 'separate' | 'merge', mergedChapterIds: Set<string>) => void;
}

export const ChapterList: React.FC<ChapterListProps> = ({
  chapters,
  fileType,
  isProcessing = false,
  onExport,
}) => {
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [mergeMode, setMergeMode] = useState<'separate' | 'merge'>('separate');
  const [mergedChapters, setMergedChapters] = useState<Set<string>>(new Set()); // 记录哪些章节的子章节应该合并

  // 扁平化所有章节以便计数
  const getAllChapterIds = (items: Chapter[]): string[] => {
    const ids: string[] = [];
    const traverse = (chapters: Chapter[]) => {
      chapters.forEach(chapter => {
        ids.push(chapter.id);
        if (chapter.children && chapter.children.length > 0) {
          traverse(chapter.children);
        }
      });
    };
    traverse(items);
    return ids;
  };

  const allChapterIds = getAllChapterIds(chapters);

  const handleSelectAll = () => {
    if (selectedChapters.size === allChapterIds.length) {
      setSelectedChapters(new Set());
    } else {
      setSelectedChapters(new Set(allChapterIds));
    }
  };

  const handleClearSelection = () => {
    setSelectedChapters(new Set());
    setMergedChapters(new Set());
  };

  const handleToggleChapter = (chapterId: string, chapter: Chapter) => {
    const newSelected = new Set(selectedChapters);

    // 获取该章节及其所有子章节的ID
    const getChapterAndChildrenIds = (ch: Chapter): string[] => {
      const ids = [ch.id];
      if (ch.children && ch.children.length > 0) {
        ch.children.forEach(child => {
          ids.push(...getChapterAndChildrenIds(child));
        });
      }
      return ids;
    };

    const affectedIds = getChapterAndChildrenIds(chapter);

    if (newSelected.has(chapterId)) {
      // 取消选择该章节及其所有子章节
      affectedIds.forEach(id => newSelected.delete(id));
    } else {
      // 选择该章节及其所有子章节
      affectedIds.forEach(id => newSelected.add(id));
    }

    setSelectedChapters(newSelected);
  };

  const handleToggleExpand = (chapterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedChapters);
    if (newExpanded.has(chapterId)) {
      newExpanded.delete(chapterId);
    } else {
      newExpanded.add(chapterId);
    }
    setExpandedChapters(newExpanded);
  };

  const handleToggleMerge = (chapterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newMerged = new Set(mergedChapters);
    if (newMerged.has(chapterId)) {
      newMerged.delete(chapterId);
    } else {
      newMerged.add(chapterId);
    }
    setMergedChapters(newMerged);
  };

  const handleExport = () => {
    // 收集所有选中的章节
    const findSelectedChapters = (items: Chapter[]): Chapter[] => {
      const result: Chapter[] = [];
      items.forEach(item => {
        if (selectedChapters.has(item.id)) {
          result.push(item);
        }
        if (item.children && item.children.length > 0) {
          result.push(...findSelectedChapters(item.children));
        }
      });
      return result;
    };

    const chaptersToExport = findSelectedChapters(chapters);
    onExport(chaptersToExport, mergeMode, mergedChapters);
  };

  const isAllSelected = selectedChapters.size === allChapterIds.length && allChapterIds.length > 0;
  const isSomeSelected = selectedChapters.size > 0;

  // 递归渲染章节树
  const renderChapter = (chapter: Chapter, _index: number, level: number = 0): React.ReactNode => {
    const isExpanded = expandedChapters.has(chapter.id);
    const isSelected = selectedChapters.has(chapter.id);
    const hasChildren = chapter.children && chapter.children.length > 0;
    const isMerged = mergedChapters.has(chapter.id);

    // 检查是否有子章节被选中（递归检查所有后代）
    const hasSelectedChildren = (() => {
      if (!hasChildren) return false;

      const checkDescendants = (ch: Chapter): boolean => {
        if (selectedChapters.has(ch.id)) return true;
        if (ch.children && ch.children.length > 0) {
          return ch.children.some(child => checkDescendants(child));
        }
        return false;
      };

      return chapter.children!.some(child => checkDescendants(child));
    })();

    return (
      <div key={chapter.id} className="space-y-1.5 sm:space-y-2">
        <div
          className={`
            group relative overflow-hidden rounded-lg sm:rounded-xl cursor-pointer transition-all duration-200
            ${isSelected
              ? 'bg-gradient-to-r from-blue-500 to-indigo-600 shadow-lg'
              : 'bg-white shadow hover:shadow-md'
            }
          `}
          style={{ marginLeft: `${level * (level > 0 ? 12 : 16)}px` }}
        >
          <div className="relative p-2.5 sm:p-3 lg:p-4">
            <div className="flex items-center space-x-2 sm:space-x-3">
              {/* 复选框区域 */}
              <div
                onClick={() => handleToggleChapter(chapter.id, chapter)}
                className="flex-1 flex items-center space-x-2 sm:space-x-3 min-w-0"
              >
                <div className={`
                  flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded border-2 flex items-center justify-center transition-all
                  ${isSelected
                    ? 'bg-white border-white'
                    : 'border-gray-300 group-hover:border-blue-400'
                  }
                `}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                {/* 章节信息 */}
                <div className="flex-1 min-w-0 text-left">
                  <h3 className={`
                    text-xs sm:text-sm font-semibold truncate
                    ${isSelected ? 'text-white' : 'text-gray-900'}
                  `}>
                    {chapter.title}
                  </h3>
                  {fileType === 'pdf' && chapter.startPage && chapter.endPage && (
                    <p className={`
                      text-xs mt-0.5 sm:mt-1
                      ${isSelected ? 'text-white/90' : 'text-gray-500'}
                    `}>
                      P.{chapter.startPage}-{chapter.endPage} ({chapter.endPage - chapter.startPage + 1} 页)
                    </p>
                  )}
                </div>
              </div>

              {/* 合并子章节按钮 */}
              {hasChildren && hasSelectedChildren && (
                <button
                  onClick={(e) => handleToggleMerge(chapter.id, e)}
                  className={`
                    flex-shrink-0 px-2 py-1 sm:px-3 sm:py-1.5 text-xs font-medium rounded-md sm:rounded-lg transition-all whitespace-nowrap
                    ${isMerged
                      ? isSelected
                        ? 'bg-white text-blue-600 border border-white'
                        : 'bg-blue-100 text-blue-700 border border-blue-300'
                      : isSelected
                        ? 'bg-white/20 text-white border border-white/30 hover:bg-white/30'
                        : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
                    }
                  `}
                >
                  {isMerged ? '✓ 合并' : '合并'}
                </button>
              )}

              {/* 展开/折叠按钮 */}
              {hasChildren && (
                <button
                  onClick={(e) => handleToggleExpand(chapter.id, e)}
                  className={`
                    flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded transition-all
                    ${isSelected ? 'text-white hover:bg-white/20' : 'text-gray-400 hover:bg-gray-100'}
                  `}
                >
                  <svg
                    className={`w-3 h-3 sm:w-4 sm:h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 递归渲染子章节 */}
        {hasChildren && isExpanded && (
          <div className="space-y-1.5 sm:space-y-2">
            {chapter.children!.map((child, idx) => renderChapter(child, idx, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {/* 顶部操作栏 */}
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 lg:p-6 border border-gray-100">
        <div className="space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* 左侧：全选控制 */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div
                onClick={handleSelectAll}
                className="flex items-center space-x-2 sm:space-x-3 lg:space-x-4 cursor-pointer group"
              >
                <div className={`
                  w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-lg flex items-center justify-center transition-all duration-300
                  ${isAllSelected
                    ? 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg'
                    : 'bg-gray-100 group-hover:bg-blue-100'
                  }
                `}>
                  <svg className={`w-4 h-4 sm:w-5 sm:h-5 ${isAllSelected ? 'text-white' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-gray-900">
                    {isAllSelected ? '取消全选' : '全选章节'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    已选择 <span className="font-bold text-blue-600">{selectedChapters.size}</span> / {allChapterIds.length} 个章节
                  </p>
                </div>
              </div>

              {/* 清除选择按钮 */}
              {isSomeSelected && (
                <button
                  onClick={handleClearSelection}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  清除
                </button>
              )}
            </div>

            {/* 右侧：导出按钮 */}
            <button
              onClick={handleExport}
              disabled={!isSomeSelected || isProcessing}
              className={`
                px-4 py-2 sm:px-5 sm:py-2.5 lg:px-6 lg:py-3 text-xs sm:text-sm font-bold text-white rounded-lg transition-all whitespace-nowrap
                ${isSomeSelected && !isProcessing
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl'
                  : 'bg-gray-300 cursor-not-allowed'
                }
              `}
            >
              {isProcessing ? '处理中...' : `导出 ${selectedChapters.size} 个章节`}
            </button>
          </div>

          {/* 全局导出模式选择 - 仅在全选时显示 */}
          {isAllSelected && selectedChapters.size > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 pt-2 sm:pt-3 border-t border-gray-100">
              <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">全局导出模式:</span>
              <div className="flex space-x-2">
                <button
                  onClick={() => setMergeMode('separate')}
                  className={`
                    flex-1 sm:flex-none px-3 py-1.5 sm:px-4 sm:py-2 text-xs font-medium rounded-lg transition-all
                    ${mergeMode === 'separate'
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }
                  `}
                >
                  分别导出
                </button>
                <button
                  onClick={() => setMergeMode('merge')}
                  className={`
                    flex-1 sm:flex-none px-3 py-1.5 sm:px-4 sm:py-2 text-xs font-medium rounded-lg transition-all
                    ${mergeMode === 'merge'
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }
                  `}
                >
                  合并为一个文件
                </button>
              </div>
            </div>
          )}

          {/* 提示信息 */}
          {!isAllSelected && isSomeSelected && mergedChapters.size > 0 && (
            <div className="pt-2 sm:pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                💡 提示：已标记 {mergedChapters.size} 个章节的子章节为合并导出
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 章节列表 */}
      <div className="space-y-1.5 sm:space-y-2">
        {chapters.map((chapter, index) => renderChapter(chapter, index, 0))}
      </div>

      {chapters.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          未找到章节信息
        </div>
      )}
    </div>
  );
};
