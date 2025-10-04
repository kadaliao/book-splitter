import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * 将 HTML 内容转换为 PDF
 */
export async function htmlToPdf(htmlContent: string, title: string): Promise<Uint8Array> {
  // 创建临时容器
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '800px';
  container.style.padding = '40px';
  container.style.backgroundColor = 'white';
  container.style.fontFamily = 'Arial, sans-serif';
  container.style.fontSize = '14px';
  container.style.lineHeight = '1.6';
  container.innerHTML = htmlContent;

  document.body.appendChild(container);

  try {
    // 使用 html2canvas 渲染 HTML - 降低分辨率减小文件大小
    const canvas = await html2canvas(container, {
      scale: 1.5, // 降低 scale 减小文件大小
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    // 创建 PDF
    const imgWidth = 210; // A4 宽度（毫米）
    const pageHeight = 297; // A4 高度（毫米）
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4',
      compress: true // 启用 PDF 压缩
    });

    let heightLeft = imgHeight;
    let position = 0;

    // 使用 JPEG 格式并设置合适的质量，大幅减小文件大小
    const imgData = canvas.toDataURL('image/jpeg', 0.85); // JPEG 质量 85%

    // 添加第一页
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // 如果内容超过一页，添加更多页面
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // 转换为 Uint8Array
    const pdfBlob = pdf.output('blob');
    const arrayBuffer = await pdfBlob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } finally {
    // 清理临时容器
    document.body.removeChild(container);
  }
}

/**
 * 下载 PDF 文件
 */
export function downloadPdfFromBytes(pdfBytes: Uint8Array, filename: string): void {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
