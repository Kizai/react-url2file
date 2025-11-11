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
    console.log(`开始下载: ${url}`);
    
    // 尝试使用cors模式，如果失败则尝试no-cors
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
      });
    } catch (corsError) {
      console.warn('CORS模式失败，尝试no-cors模式:', corsError);
      // 如果CORS失败，尝试no-cors（但这种方式可能无法读取响应内容）
      response = await fetch(url, {
        method: 'GET',
        mode: 'no-cors',
        credentials: 'omit',
      });
      
      // no-cors模式下，response.ok和status可能不可用
      if (!response.type || response.type === 'opaque') {
        throw new Error('CORS限制：无法下载该文件，请确保文件URL支持跨域访问');
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}`);
    }

    // 检查文件大小（20MB限制）
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const fileSize = parseInt(contentLength, 10);
      const maxSize = 20 * 1024 * 1024; // 20MB
      if (fileSize > maxSize) {
        throw new Error(`File size (${(fileSize / 1024 / 1024).toFixed(2)}MB) exceeds 20M`);
      }
    }

    const blob = await response.blob();
    console.log(`下载完成，大小: ${blob.size} bytes, 类型: ${blob.type || 'unknown'}`);
    
    // 如果无法获取content-length，检查blob大小
    if (blob.size > 20 * 1024 * 1024) {
      throw new Error(`File size (${(blob.size / 1024 / 1024).toFixed(2)}MB) exceeds 20M`);
    }

    // 检查blob是否为空
    if (blob.size === 0) {
      throw new Error('下载的文件为空');
    }

    return blob;
  } catch (error: any) {
    console.error('Download file error:', error);
    // 提供更详细的错误信息
    if (error.message) {
      throw new Error(`下载失败: ${error.message}`);
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('网络错误：无法连接到文件服务器，请检查URL是否正确');
    } else {
      throw new Error(`下载失败: ${String(error)}`);
    }
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

