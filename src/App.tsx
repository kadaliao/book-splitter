import { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { ChapterList } from './components/ChapterList';
import { extractPdfChapters, extractPdfPages, downloadPdf } from './utils/pdfProcessor';
import { extractEpubChapters } from './utils/epubProcessor';
import { htmlToPdf } from './utils/epubToPdf';
import { buildHierarchicalFilename } from './utils/filenameUtils';
import JSZip from 'jszip';
import './App.css';

interface Chapter {
  id: string;
  title: string;
  startPage?: number;
  endPage?: number;
  content?: string;
  level: number;
  children?: Chapter[];
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'pdf' | 'epub'>('pdf');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; title: string } | null>(null);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setProgress({ current: 0, total: 1, title: '正在读取文件...' });
    setIsProcessing(true);

    try {
      const detectedFileType = selectedFile.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub';
      setFileType(detectedFileType);

      // 添加小延迟确保初始状态渲染
      await new Promise(resolve => setTimeout(resolve, 100));

      if (detectedFileType === 'pdf') {
        const pdfChapters = await extractPdfChapters(
          selectedFile,
          (current, total, title) => {
            console.log('PDF进度:', current, '/', total, title);
            setProgress({ current, total, title });
          }
        );
        setChapters(pdfChapters);
      } else {
        const epubChapters = await extractEpubChapters(
          selectedFile,
          (current, total, title) => {
            console.log('EPUB进度:', current, '/', total, title);
            setProgress({ current, total, title });
          }
        );
        setChapters(epubChapters);
      }

      setIsProcessing(false);
      setProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件处理失败');
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const handleExport = async (selectedChapters: Chapter[], mergeMode: 'separate' | 'merge' = 'separate', mergedChapterIds: Set<string> = new Set()) => {
    if (!file || selectedChapters.length === 0) return;

    setIsProcessing(true);
    setError(null);
    setProgress({ current: 0, total: selectedChapters.length, title: '准备导出...' });

    try {
      // 创建选中章节 ID 的 Set 以便快速查找
      const selectedChapterIds = new Set(selectedChapters.map(ch => ch.id));

      // 扁平化所有章节以便计数
      const getAllChapterIds = (items: Chapter[]): string[] => {
        const ids: string[] = [];
        const traverse = (chs: Chapter[]) => {
          chs.forEach(ch => {
            ids.push(ch.id);
            if (ch.children && ch.children.length > 0) {
              traverse(ch.children);
            }
          });
        };
        traverse(items);
        return ids;
      };

      const allChapterIds = getAllChapterIds(chapters);
      const isFullSelection = selectedChapters.length === allChapterIds.length;

      // 按章节起始页排序（确保顺序正确）
      const sortedChapters = [...selectedChapters].sort((a, b) => {
        if (fileType === 'pdf') {
          return (a.startPage || 0) - (b.startPage || 0);
        }
        return 0; // EPUB 保持原顺序
      });

      // 组织导出任务
      interface ExportTask {
        name: string;
        chapters: Chapter[];
        parentTitles: string[];  // 父层级标题
        chapterId: string;       // 章节ID，用于查找父层级
      }

      const exportTasks: ExportTask[] = [];

      if (isFullSelection && mergeMode === 'merge') {
        // 全选且合并模式：所有章节合并为一个文件
        exportTasks.push({
          name: '合并章节',
          chapters: sortedChapters,
          parentTitles: [],
          chapterId: 'merged'
        });
      } else {
        // 根据mergedChapterIds组织导出任务
        const processed = new Set<string>();

        const processChapter = (chapter: Chapter, parentTitles: string[] = []) => {
          if (processed.has(chapter.id)) return;

          const hasChildren = chapter.children && chapter.children.length > 0;

          if (mergedChapterIds.has(chapter.id) && hasChildren) {
            // 这个章节标记为合并子章节
            // 收集所有选中的子章节
            const getAllDescendants = (parent: Chapter): Chapter[] => {
              const descendants: Chapter[] = [];
              if (!parent.children) return descendants;

              parent.children.forEach(child => {
                descendants.push(child);
                descendants.push(...getAllDescendants(child));
              });

              return descendants;
            };

            const allDescendants = getAllDescendants(chapter);
            const childrenToMerge = allDescendants.filter(ch => selectedChapterIds.has(ch.id));

            if (childrenToMerge.length > 0) {
              const chaptersInTask: Chapter[] = [];

              // 检查父章节是否有独立内容（不属于子章节的部分）
              if (fileType === 'pdf' && chapter.startPage && chapter.endPage) {
                // 找出第一个子章节的起始页
                const firstChildStartPage = Math.min(...childrenToMerge.map(ch => ch.startPage || Infinity));

                // 如果父章节起始页小于第一个子章节起始页，说明有独立内容
                if (chapter.startPage < firstChildStartPage) {
                  // 创建一个虚拟章节表示父章节的独立内容
                  chaptersInTask.push({
                    id: `${chapter.id}_intro`,
                    title: chapter.title,
                    startPage: chapter.startPage,
                    endPage: firstChildStartPage - 1,
                    level: chapter.level
                  });
                }
              } else if (fileType === 'epub' && chapter.content) {
                // 对于 EPUB，如果父章节有内容，包含它
                chaptersInTask.push({
                  id: `${chapter.id}_intro`,
                  title: chapter.title,
                  content: chapter.content,
                  level: chapter.level
                });
              }

              // 添加所有子章节
              chaptersInTask.push(...childrenToMerge.sort((a, b) => {
                if (fileType === 'pdf') {
                  return (a.startPage || 0) - (b.startPage || 0);
                }
                return 0;
              }));

              exportTasks.push({
                name: chapter.title,
                chapters: chaptersInTask,
                parentTitles,
                chapterId: chapter.id
              });

              // 标记父章节和所有子章节为已处理
              processed.add(chapter.id);
              childrenToMerge.forEach(ch => processed.add(ch.id));
            }
          } else if (selectedChapterIds.has(chapter.id)) {
            // 检查是否有子章节
            if (hasChildren) {
              // 有子章节但未标记为合并
              // 检查父章节是否有独立内容
              const getAllDescendants = (parent: Chapter): Chapter[] => {
                const descendants: Chapter[] = [];
                if (!parent.children) return descendants;

                parent.children.forEach(child => {
                  descendants.push(child);
                  descendants.push(...getAllDescendants(child));
                });

                return descendants;
              };

              const allDescendants = getAllDescendants(chapter);
              const selectedChildren = allDescendants.filter(ch => selectedChapterIds.has(ch.id));

              let hasIndependentContent = false;

              if (fileType === 'pdf' && chapter.startPage && chapter.endPage && selectedChildren.length > 0) {
                // 找出第一个选中的子章节的起始页
                const firstChildStartPage = Math.min(...selectedChildren.map(ch => ch.startPage || Infinity));
                // 如果父章节起始页小于第一个子章节起始页，说明有独立内容
                hasIndependentContent = chapter.startPage < firstChildStartPage;
              } else if (fileType === 'epub' && chapter.content) {
                // 对于 EPUB，如果父章节有内容，认为有独立内容
                hasIndependentContent = true;
              }

              if (hasIndependentContent) {
                // 父章节有独立内容，需要单独导出
                if (fileType === 'pdf' && chapter.startPage && chapter.endPage) {
                  const firstChildStartPage = Math.min(...selectedChildren.map(ch => ch.startPage || Infinity));
                  exportTasks.push({
                    name: chapter.title,
                    chapters: [{
                      id: `${chapter.id}_intro`,
                      title: chapter.title,
                      startPage: chapter.startPage,
                      endPage: firstChildStartPage - 1,
                      level: chapter.level
                    }],
                    parentTitles,
                    chapterId: chapter.id
                  });
                } else if (fileType === 'epub' && chapter.content) {
                  exportTasks.push({
                    name: chapter.title,
                    chapters: [{
                      id: `${chapter.id}_intro`,
                      title: chapter.title,
                      content: chapter.content,
                      level: chapter.level
                    }],
                    parentTitles,
                    chapterId: chapter.id
                  });
                }
                processed.add(chapter.id);
              }
              // 不添加processed标记（如果没有独立内容），让子章节被单独处理
            } else {
              // 没有子章节，单独导出
              exportTasks.push({
                name: chapter.title,
                chapters: [chapter],
                parentTitles,
                chapterId: chapter.id
              });
              processed.add(chapter.id);
            }
          }
        };

        // 按原始章节树的顺序处理
        const traverseChapters = (chs: Chapter[], currentParentTitles: string[] = []) => {
          chs.forEach(ch => {
            processChapter(ch, currentParentTitles);
            if (ch.children && ch.children.length > 0) {
              traverseChapters(ch.children, [...currentParentTitles, ch.title]);
            }
          });
        };

        traverseChapters(chapters);
      }

      if (fileType === 'pdf') {
        // PDF 导出
        if (exportTasks.length === 1 && exportTasks[0].chapters.length === 1) {
          // 单个章节直接下载
          const task = exportTasks[0];
          const chapter = task.chapters[0];
          if (chapter.startPage && chapter.endPage) {
            setProgress({ current: 1, total: 1, title: `正在提取：${chapter.title}` });
            const pdfBytes = await extractPdfPages(file, chapter.startPage, chapter.endPage);
            const filename = buildHierarchicalFilename(0, task.parentTitles, task.name);
            downloadPdf(pdfBytes, filename);
          }
        } else {
          // 多个任务或合并任务，打包下载
          const zip = new JSZip();
          const { PDFDocument } = await import('pdf-lib');
          const arrayBuffer = await file.arrayBuffer();
          const sourcePdf = await PDFDocument.load(arrayBuffer);

          for (let i = 0; i < exportTasks.length; i++) {
            const task = exportTasks[i];
            setProgress({ current: i + 1, total: exportTasks.length, title: `正在处理：${task.name}` });

            const filename = buildHierarchicalFilename(i, task.parentTitles, task.name);

            if (task.chapters.length === 1) {
              // 单个章节
              const chapter = task.chapters[0];
              if (chapter.startPage && chapter.endPage) {
                const pdfBytes = await extractPdfPages(file, chapter.startPage, chapter.endPage);
                zip.file(filename, pdfBytes);
              }
            } else {
              // 合并多个章节
              const mergedPdf = await PDFDocument.create();
              const sortedTaskChapters = task.chapters.sort((a, b) => (a.startPage || 0) - (b.startPage || 0));

              for (const chapter of sortedTaskChapters) {
                if (chapter.startPage && chapter.endPage) {
                  const pages = await mergedPdf.copyPages(
                    sourcePdf,
                    Array.from({ length: chapter.endPage - chapter.startPage + 1 }, (_, j) => chapter.startPage! - 1 + j)
                  );
                  pages.forEach(page => mergedPdf.addPage(page));
                }
              }

              const pdfBytes = await mergedPdf.save({ useObjectStreams: true });
              zip.file(filename, pdfBytes);
            }

            // 添加小延迟让进度UI更新
            await new Promise(resolve => setTimeout(resolve, 50));
          }

          setProgress({ current: exportTasks.length, total: exportTasks.length, title: '正在打包文件...' });
          const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 9 }
          });
          const url = URL.createObjectURL(zipBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${file.name.replace('.pdf', '')}_chapters.zip`;
          link.click();
          URL.revokeObjectURL(url);
        }
      } else {
        // EPUB 转 PDF 导出
        if (exportTasks.length === 1 && exportTasks[0].chapters.length === 1) {
          // 单个章节转 PDF 下载
          const task = exportTasks[0];
          const chapter = task.chapters[0];
          if (chapter.content) {
            setProgress({ current: 1, total: 1, title: `正在转换：${chapter.title}` });
            const pdfBytes = await htmlToPdf(chapter.content, chapter.title);
            const filename = buildHierarchicalFilename(0, task.parentTitles, task.name);
            downloadPdf(pdfBytes, filename);
          }
        } else {
          // 多个任务或合并任务，打包下载
          const zip = new JSZip();

          for (let i = 0; i < exportTasks.length; i++) {
            const task = exportTasks[i];
            setProgress({ current: i + 1, total: exportTasks.length, title: `正在处理：${task.name}` });

            const filename = buildHierarchicalFilename(i, task.parentTitles, task.name);

            if (task.chapters.length === 1) {
              // 单个章节
              const chapter = task.chapters[0];
              if (chapter.content) {
                const pdfBytes = await htmlToPdf(chapter.content, chapter.title);
                zip.file(filename, pdfBytes);
              } else {
                console.warn(`章节 "${task.name}" 没有内容，跳过`);
              }
            } else {
              // 合并多个章节 - 过滤掉没有内容的章节
              const validChapters = task.chapters.filter(ch => ch.content);

              if (validChapters.length > 0) {
                const mergedContent = validChapters
                  .map(ch => ch.content!)
                  .join('<div style="page-break-before: always;"></div>');

                const pdfBytes = await htmlToPdf(mergedContent, task.name);
                zip.file(filename, pdfBytes);
              } else {
                console.warn(`章节 "${task.name}" 的所有子章节都没有内容，跳过`);
              }
            }

            // 添加小延迟让进度UI更新
            await new Promise(resolve => setTimeout(resolve, 50));
          }

          setProgress({ current: exportTasks.length, total: exportTasks.length, title: '正在打包文件...' });
          const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 9 }
          });
          const url = URL.createObjectURL(zipBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${file.name.replace('.epub', '')}_chapters.zip`;
          link.click();
          URL.revokeObjectURL(url);
        }
      }

      setIsProcessing(false);
      setProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
      setIsProcessing(false);
      setProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <header className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="p-2 sm:p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg sm:rounded-xl shadow-lg">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                电子书章节拆分工具
              </h1>
              <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-gray-600 truncate">
                轻松拆分 PDF 和 EPUB 格式的电子书，统一导出为 PDF
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        {!file ? (
          <FileUpload onFileSelect={handleFileSelect} />
        ) : (
          <div className="space-y-3 sm:space-y-4 lg:space-y-6">
            {/* 文件信息卡片 - 精简版 */}
            <div className="bg-white/90 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between p-3 sm:p-4 lg:p-5">
                <div className="flex items-center space-x-2 sm:space-x-3 lg:space-x-4 flex-1 min-w-0">
                  <div className="flex-shrink-0 p-2 sm:p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate">{file.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {fileType.toUpperCase()} 文件
                      {chapters.length > 0 && ` · ${chapters.length} 个章节`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setFile(null);
                    setChapters([]);
                    setError(null);
                  }}
                  className="flex-shrink-0 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  更换
                </button>
              </div>

              {isProcessing && (
                <div className="px-3 pb-3 sm:px-4 sm:pb-4 lg:px-5 lg:pb-5">
                  <div className="p-3 sm:p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="space-y-2 sm:space-y-3">
                      {/* 进度信息 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 sm:space-x-3">
                          <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-2 border-blue-600 border-t-transparent"></div>
                          <span className="text-xs sm:text-sm text-blue-900 font-semibold">
                            {progress && progress.current > 0 ? '正在解析章节...' : '正在读取文件...'}
                          </span>
                        </div>
                        {progress && progress.current > 0 && (
                          <span className="text-xs sm:text-sm text-blue-600 font-medium">
                            {progress.current} / {progress.total}
                          </span>
                        )}
                      </div>

                      {/* 进度条 */}
                      {progress && progress.current > 0 && (
                        <>
                          <div className="w-full bg-blue-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-blue-500 to-purple-600 h-full rounded-full transition-all duration-300"
                              style={{ width: `${(progress.current / progress.total) * 100}%` }}
                            ></div>
                          </div>

                          {/* 当前章节 */}
                          <div className="flex items-start space-x-2">
                            <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                            </svg>
                            <p className="text-xs sm:text-sm text-blue-700 flex-1 leading-relaxed truncate" title={progress.title}>
                              {progress.title}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="px-3 pb-3 sm:px-4 sm:pb-4 lg:px-5 lg:pb-5">
                  <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded-lg">
                    <div className="flex items-start">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <p className="ml-3 text-xs sm:text-sm text-red-700 font-medium">{error}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 章节列表 */}
            {chapters.length > 0 && (
              <div className="bg-white/90 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6">
                <div className="flex items-center justify-between mb-3 sm:mb-4 lg:mb-6">
                  <div>
                    <h2 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900">
                      识别到的章节
                    </h2>
                    <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-gray-500">
                      从文件中提取了 <span className="font-semibold text-gray-700">{chapters.length}</span> 个章节
                    </p>
                  </div>
                </div>
                <ChapterList
                  chapters={chapters}
                  fileType={fileType}
                  isProcessing={isProcessing}
                  onExport={handleExport}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
