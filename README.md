# 电子书章节拆分工具

一个基于 Web 的工具，用于将 PDF 和 EPUB 格式的电子书按章节拆分，统一导出为 PDF 格式。

## 功能特性

- ✅ 支持 PDF 和 EPUB 格式
- ✅ 自动识别书籍章节（基于目录/大纲）
- ✅ 拖拽上传文件
- ✅ 可视化章节列表
- ✅ 支持单个或批量导出章节
- ✅ **所有格式统一导出为 PDF**
- ✅ EPUB 转 PDF 自动转换
- ✅ 纯前端处理，保护隐私
- ✅ 响应式设计

## 技术栈

- **前端框架**: React + TypeScript
- **构建工具**: Vite
- **样式**: TailwindCSS
- **PDF 处理**:
  - `pdf-lib` - PDF 拆分
  - `pdfjs-dist` - PDF 解析
  - `jspdf` - PDF 生成
- **EPUB 处理**:
  - `jszip` - ZIP 文件处理
  - `epubjs` - EPUB 解析
  - `html2canvas` - HTML 转图片

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

访问 http://localhost:5173 查看应用。

### 构建生产版本

```bash
npm run build
```

### 预览生产构建

```bash
npm run preview
```

### 环境要求

- Node.js 18.x 或更高版本
- 自动构建命令：`npm run build`
- 输出目录：`dist`

## 使用说明

1. **上传文件**
   - 点击上传区域选择文件，或直接拖拽文件到上传区域
   - 支持的格式：PDF、EPUB
   - 文件大小限制：100MB

2. **选择章节**
   - 文件上传后会自动识别章节
   - 勾选需要导出的章节
   - 可使用"全选"功能快速选择所有章节

3. **导出章节**
   - 单个章节：直接下载 PDF 文件
   - 多个章节：打包为 ZIP 文件下载
   - **所有格式统一导出为 PDF**（EPUB 会自动转换）

## 注意事项

- PDF 文件必须包含目录信息（Outline/Bookmarks）才能自动识别章节
- EPUB 文件必须包含导航文件（toc.ncx 或 nav.xhtml）才能识别章节
- 所有处理都在浏览器中完成，不会上传到服务器
- 建议使用现代浏览器（Chrome、Firefox、Edge、Safari）

## 项目结构

```
book-splitter/
├── src/
│   ├── components/          # React 组件
│   │   ├── FileUpload.tsx   # 文件上传组件
│   │   └── ChapterList.tsx  # 章节列表组件
│   ├── utils/               # 工具函数
│   │   ├── pdfProcessor.ts  # PDF 处理
│   │   └── epubProcessor.ts # EPUB 处理
│   ├── App.tsx              # 主应用组件
│   └── main.tsx             # 应用入口
├── public/                  # 静态资源
└── package.json             # 项目配置
```

## License

MIT
