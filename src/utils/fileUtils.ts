/**
 * 文件工具函数
 * 用于处理URL下载和文件上传
 */

/**
 * 从URL下载文件
 * @param url 文件URL
 * @param useProxy 是否使用代理（默认true，用于解决CORS问题）
 * @param onLog 可选的日志回调函数
 * @returns Promise<Blob> 文件Blob对象
 */
export async function downloadFileFromUrl(
  url: string, 
  useProxy: boolean = true,
  onLog?: (level: 'info' | 'warn' | 'error', message: string, data?: any) => void
): Promise<Blob> {
  const log = onLog || ((level, message, data) => {
    const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (data !== undefined) {
      method(`[${level.toUpperCase()}] ${message}`, data);
    } else {
      method(`[${level.toUpperCase()}] ${message}`);
    }
  });
  try {
    log('info', `开始下载: ${url}, 使用代理: ${useProxy}`);
    
    let response: Response | null = null;

    // 如果使用代理，通过代理API下载
    if (useProxy) {
      try {
        // 获取当前部署的域名
        const baseUrl = window.location.origin;
        const proxyUrl = `${baseUrl}/api/proxy?url=${encodeURIComponent(url)}`;
        log('info', `通过代理下载: ${proxyUrl}`);
        
        const proxyResponse = await fetch(proxyUrl, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          headers: {
            'Accept': '*/*',
          },
        });

        log('info', `代理响应状态: ${proxyResponse.status} ${proxyResponse.statusText}`);

        if (proxyResponse.ok) {
          response = proxyResponse;
          log('info', '代理下载成功，使用代理响应');
        } else {
          // 如果代理返回错误，尝试读取错误信息
          try {
            const contentType = proxyResponse.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const errorData = await proxyResponse.json();
              log('error', `代理下载失败，状态码: ${proxyResponse.status}`, errorData);
              // 如果代理返回的错误是因为目标URL的问题（如500），记录详细信息
              if (proxyResponse.status >= 500) {
                log('error', '代理返回服务器错误，可能是目标URL服务器的问题（如HTTP 500）');
              }
            } else {
              const errorText = await proxyResponse.text();
              log('error', `代理下载失败，状态码: ${proxyResponse.status}`, { response: errorText.substring(0, 200) });
            }
          } catch (e) {
            log('warn', '无法解析代理错误响应', e);
          }
          // 继续尝试直接下载（虽然可能也会失败）
        }
      } catch (proxyError: any) {
        log('warn', `代理下载异常: ${proxyError?.message || String(proxyError)}`, proxyError);
        log('info', '将尝试直接下载');
        // 代理失败，继续尝试直接下载
      }
    }

    // 如果代理未成功，尝试直接下载
    if (!response) {
      try {
        log('info', `尝试直接下载: ${url}`);
        response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
        });
        log('info', `直接下载响应状态: ${response.status} ${response.statusText}`);
      } catch (corsError: any) {
        // 如果CORS失败，抛出错误
        log('error', `CORS下载失败: ${corsError?.message || String(corsError)}`, corsError);
        throw new Error(`CORS限制：无法下载该文件。错误: ${corsError?.message || String(corsError)}。如果文件服务器不支持跨域访问，代理模式应该能解决此问题，但如果代理也失败，请联系管理员。`);
      }
    }

    // 确保response存在
    if (!response) {
      throw new Error('无法获取文件响应，代理和直接下载都失败了');
    }

    if (!response.ok) {
      let errorDetails = '';
      try {
        const errorText = await response.text();
        errorDetails = errorText.substring(0, 200);
      } catch (e) {
        // 忽略读取错误文本的失败
      }
      throw new Error(`HTTP错误! 状态码: ${response.status}, 状态文本: ${response.statusText || 'Unknown'}${errorDetails ? ', 详情: ' + errorDetails : ''}`);
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
    log('info', `下载完成，大小: ${blob.size} bytes, 类型: ${blob.type || 'unknown'}`);
    
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
    log('error', `下载文件错误: ${error?.message || String(error)}`, error);
    // 提供更详细的错误信息
    if (error.message) {
      throw new Error(`下载失败: ${error.message}`);
    } else if (error.name === 'TypeError' && error.message && error.message.includes('fetch')) {
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

