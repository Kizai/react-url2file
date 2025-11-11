/**
 * 文件工具函数
 * 用于处理URL下载和文件上传
 */

/**
 * 从URL下载文件
 * @param url 文件URL
 * @returns Promise<Blob> 文件Blob对象
 */
export async function downloadFileFromUrl(url: string): Promise<Blob> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // 检查文件大小（20MB限制）
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const fileSize = parseInt(contentLength, 10);
      const maxSize = 20 * 1024 * 1024; // 20MB
      if (fileSize > maxSize) {
        throw new Error('File size exceeds 20M');
      }
    }

    const blob = await response.blob();
    
    // 如果无法获取content-length，检查blob大小
    if (blob.size > 20 * 1024 * 1024) {
      throw new Error('File size exceeds 20M');
    }

    return blob;
  } catch (error) {
    console.error('Download file error:', error);
    throw error;
  }
}

/**
 * 验证URL是否有效
 * @param url URL字符串
 * @returns boolean
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 获取文件名称从URL
 * @param url URL字符串
 * @returns string 文件名
 */
export function getFileNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const fileName = pathname.split('/').pop() || 'file';
    return decodeURIComponent(fileName);
  } catch {
    return 'file';
  }
}

