import React, { useCallback, useState } from 'react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = useCallback((file: File): boolean => {
    const validTypes = ['application/pdf', 'application/epub+zip'];
    const validExtensions = ['.pdf', '.epub'];

    const isValidType = validTypes.includes(file.type);
    const isValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!isValidType && !isValidExtension) {
      setError('只支持 PDF 或 EPUB 文件');
      return false;
    }

    if (file.size > 100 * 1024 * 1024) { // 100MB limit
      setError('文件大小不能超过 100MB');
      return false;
    }

    setError(null);
    return true;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      if (validateFile(file)) {
        onFileSelect(file);
      }
    }
  }, [validateFile, onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (validateFile(file)) {
        onFileSelect(file);
      }
    }
  }, [validateFile, onFileSelect]);

  return (
    <div className="w-full max-w-4xl mx-auto p-0 sm:p-3 lg:p-6">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative rounded-xl sm:rounded-2xl lg:rounded-3xl border-2 bg-white shadow-xl transition-all duration-300
          ${isDragging
            ? 'border-blue-500 scale-[1.02] sm:scale-105 shadow-2xl'
            : 'border-gray-200 hover:border-blue-400'
          }
        `}
      >
        <input
          type="file"
          id="file-input"
          className="hidden"
          accept=".pdf,.epub"
          onChange={handleFileInput}
        />

        <label htmlFor="file-input" className="cursor-pointer block p-6 sm:p-10 lg:p-16">
          <div className="space-y-4 sm:space-y-6 lg:space-y-8">
            {/* 图标 */}
            <div className="flex justify-center">
              <div className={`
                w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 flex items-center justify-center rounded-xl sm:rounded-2xl
                bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg
                transform transition-transform duration-300
                ${isDragging ? 'rotate-12 scale-110' : 'hover:rotate-6 hover:scale-105'}
              `}>
                <svg
                  className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
            </div>

            {/* 文字 */}
            <div className="space-y-2 sm:space-y-3 text-center">
              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                {isDragging ? '松开以上传文件' : '拖拽文件到这里'}
              </h3>
              <p className="text-sm sm:text-base text-gray-600">
                或者
                <span className="mx-1 sm:mx-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium inline-block hover:shadow-lg transition-shadow text-xs sm:text-sm">
                  点击选择文件
                </span>
              </p>
            </div>

            {/* 格式支持 */}
            <div className="flex items-center justify-center gap-3 sm:gap-4 lg:gap-6">
              <div className="flex items-center gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-2.5 lg:px-5 lg:py-3 bg-blue-50 rounded-lg sm:rounded-xl border border-blue-200">
                <div className="p-1.5 sm:p-2 bg-blue-500 rounded-md sm:rounded-lg">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-blue-900">PDF</p>
                  <p className="text-xs text-blue-600 hidden sm:block">文档格式</p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-2.5 lg:px-5 lg:py-3 bg-purple-50 rounded-lg sm:rounded-xl border border-purple-200">
                <div className="p-1.5 sm:p-2 bg-purple-500 rounded-md sm:rounded-lg">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-purple-900">EPUB</p>
                  <p className="text-xs text-purple-600 hidden sm:block">电子书格式</p>
                </div>
              </div>
            </div>

            {/* 提示 */}
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-500">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>文件大小限制: <span className="font-semibold text-gray-700">100 MB</span></span>
            </div>
          </div>
        </label>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mt-3 sm:mt-4 lg:mt-6 p-3 sm:p-4 lg:p-5 bg-white rounded-xl sm:rounded-2xl border-2 border-red-500 shadow-lg">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="p-1.5 sm:p-2 bg-red-500 rounded-lg flex-shrink-0">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-red-900 mb-0.5 sm:mb-1">上传失败</h4>
              <p className="text-xs sm:text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
