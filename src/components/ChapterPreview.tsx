import React, { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';

interface Chapter {
  id: string;
  title: string;
  startPage?: number;
  endPage?: number;
  content?: string;
  level: number;
  children?: Chapter[];
}

interface ChapterPreviewProps {
  chapter: Chapter | null;
  fileType: 'pdf' | 'epub';
  previewContent: string | null; // PDF为图片base64 URL, EPUB为HTML字符串
  isLoading: boolean;
  position: { x: number; y: number } | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export const ChapterPreview: React.FC<ChapterPreviewProps> = ({
  chapter,
  fileType,
  previewContent,
  isLoading,
  position,
  onMouseEnter,
  onMouseLeave,
}) => {
  const previewRef = useRef<HTMLDivElement>(null);

  // 调整位置避免超出视口
  useEffect(() => {
    if (!previewRef.current || !position) return;

    const preview = previewRef.current;
    const rect = preview.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = position.x;
    let adjustedY = position.y;

    // 防止右侧溢出
    if (adjustedX + rect.width > viewportWidth - 20) {
      adjustedX = viewportWidth - rect.width - 20;
    }

    // 防止底部溢出 - 如果窗口太高，对齐到顶部
    if (adjustedY + rect.height > viewportHeight - 20) {
      adjustedY = Math.max(20, viewportHeight - rect.height - 20);
    }

    // 防止左侧溢出
    if (adjustedX < 20) {
      adjustedX = 20;
    }

    // 防止顶部溢出
    if (adjustedY < 20) {
      adjustedY = 20;
    }

    preview.style.left = `${adjustedX}px`;
    preview.style.top = `${adjustedY}px`;
  }, [position, previewContent]);

  if (!chapter || !position) return null;

  return (
    <div
      ref={previewRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-50 bg-white rounded-xl shadow-2xl border-2 border-blue-200 overflow-hidden transition-opacity duration-200"
      style={{
        left: position.x,
        top: position.y,
        width: '500px',
        maxHeight: '80vh',
      }}
    >
      {/* 头部 */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900 truncate" title={chapter.title}>
          {chapter.title}
        </h4>
        {fileType === 'pdf' && chapter.startPage && chapter.endPage && (
          <p className="text-xs text-gray-600 mt-1">
            第 {chapter.startPage} 页起始内容
          </p>
        )}
      </div>

      {/* 内容区域 - 可滚动 */}
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 60px)' }}>
        {isLoading ? (
          <div className="p-6 space-y-3">
            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-full"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-5/6"></div>
            <div className="h-32 bg-gray-200 rounded animate-pulse mt-4"></div>
          </div>
        ) : previewContent ? (
          fileType === 'pdf' ? (
            // PDF显示渲染的页面图片
            <img
              src={previewContent}
              alt={`${chapter.title} 预览`}
              className="w-full h-auto"
            />
          ) : (
            // EPUB显示HTML内容
            <div className="p-4">
              <div
                className="prose prose-sm max-w-none text-gray-800 leading-relaxed"
                style={{
                  fontSize: '14px',
                  lineHeight: '1.6'
                }}
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(previewContent, {
                    ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'br', 'div', 'span', 'ul', 'ol', 'li', 'a', 'section', 'article'],
                    ALLOWED_ATTR: ['class', 'style', 'href', 'title']
                  })
                }}
              />
            </div>
          )
        ) : (
          <div className="p-6 text-center text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">无法加载预览</p>
          </div>
        )}
      </div>
    </div>
  );
};
