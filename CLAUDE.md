# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web-based e-book chapter splitter tool that splits PDF and EPUB books by chapters and exports them as PDF files. The application runs entirely in the browser without server-side processing.

## Commands

### Development
```bash
npm run dev        # Start development server (http://localhost:5173)
npm run build      # Build for production (runs TypeScript compiler + Vite build)
npm run preview    # Preview production build
npm run lint       # Run ESLint
```

### Build Output
- Build output directory: `dist/`
- Build command for deployment: `npm run build`

## Architecture

### Core File Processing Flow

1. **File Upload** → `FileUpload.tsx` component handles file selection
2. **Chapter Extraction**:
   - PDF: `pdfProcessor.ts` → Uses `pdfjs-dist` to parse outline/bookmarks → Extracts page ranges
   - EPUB: `epubProcessor.ts` → Parses NCX/nav files → Loads HTML content from ZIP
3. **Export Logic** (in `App.tsx`):
   - PDF chapters: Extracted directly using `pdf-lib`
   - EPUB chapters: Converted to PDF via `epubToPdf.ts` (html2canvas + jsPDF)
4. **Download**: Single files download directly; multiple files packaged in ZIP using `jszip`

### Key Processing Details

**PDF Chapter Extraction (`pdfProcessor.ts`)**:
- Parses PDF outline/bookmarks to identify chapter hierarchy
- Uses recursive algorithm to build chapter tree with parent-child relationships
- Calculates `endPage` for each chapter based on next chapter's `startPage`
- Leaf chapters (no children) get explicit page ranges; parent chapters span from their start to their last descendant's end
- All processing done in `extractPdfChapters()` function with progress callbacks

**EPUB Chapter Extraction (`epubProcessor.ts`)**:
- Supports both EPUB 2.0 (NCX) and EPUB 3.0 (nav) formats
- Parses ZIP structure to locate container.xml → content.opf → navigation files
- Handles anchor-based chapters (same file, different sections via #anchor)
- Loads and caches HTML content to avoid redundant file reads
- `extractContentByAnchor()` extracts specific sections when chapters point to anchors

**EPUB to PDF Conversion (`epubToPdf.ts`)**:
- Creates off-screen DOM container with HTML content
- Uses `html2canvas` to render HTML to canvas (scale: 1.5)
- Converts canvas to JPEG (quality: 85%) to reduce file size
- Uses `jsPDF` to generate PDF with A4 page layout
- Handles multi-page content by splitting canvas across pages

### Hierarchical Chapter Export

The app supports complex export scenarios managed in `App.tsx` `handleExport()`:
- **Separate mode**: Each selected chapter exports as individual PDF
- **Merge mode**: Parent chapters can merge with all child chapters into single PDF
- **Hierarchical filenames**: Uses `filenameUtils.ts` `buildHierarchicalFilename()` to create numbered names like "01_ParentChapter_02_ChildChapter.pdf"
- Handles parent chapters with independent content (pages before first child)
- Export tasks organized with parent title tracking for proper filename hierarchy

### State Management

All state managed in `App.tsx` using React hooks:
- `file`: Currently loaded file
- `chapters`: Parsed chapter hierarchy
- `isProcessing`: Loading/export state
- `progress`: Current operation progress (current/total/title)
- `error`: Error messages

### UI Components

- `FileUpload.tsx`: Drag-and-drop file upload with format validation
- `ChapterList.tsx`: Hierarchical chapter tree with checkboxes, supports selection modes (separate/merge)

## Technical Constraints

- **Browser-only**: All file processing happens client-side for privacy
- **File size limit**: 100MB (enforced in FileUpload component)
- **PDF requirements**: Must have outline/bookmarks for chapter detection
- **EPUB requirements**: Must have NCX (EPUB 2.0) or nav (EPUB 3.0) for chapter detection
- **Worker configuration**: PDF.js worker loaded from local bundle (pdfProcessor.ts:5-8)

## TypeScript Configuration

- Uses TypeScript ~5.9.3
- Multiple tsconfig files (tsconfig.json references app and node configs)
- Strict mode enabled for type checking

## Build System

- **Vite** for development and bundling
- **React 19** with TypeScript
- **TailwindCSS** for styling with PostCSS/Autoprefixer
- Output optimized for static hosting (suitable for Vercel/Netlify)
