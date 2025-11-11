import './App.css';
import { bitable, ITableMeta, IViewMeta, IFieldMeta, IAttachmentField, ITextField, FieldType } from "@lark-base-open/js-sdk";
import { Button, Form, Input, Select, Checkbox, Typography, Notification, Spin, Card, Collapse, Progress } from '@douyinfe/semi-ui';
import { BaseFormApi } from '@douyinfe/semi-foundation/lib/es/form/interface';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadFileFromUrl, isValidUrl, getFileNameFromUrl } from './utils/fileUtils';

const { Title, Text } = Typography;

// 日志类型
interface LogEntry {
  id: number;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  data?: any;
}

interface FormValues {
  authCode: string;
  tableId: string;
  viewId: string;
  urlFieldId: string;
  attachmentFieldId: string;
  overwrite: boolean;
}

export default function App() {
  const { t } = useTranslation();
  const [tableMetaList, setTableMetaList] = useState<ITableMeta[]>([]);
  const [viewMetaList, setViewMetaList] = useState<IViewMeta[]>([]);
  const [urlFieldList, setUrlFieldList] = useState<IFieldMeta[]>([]);
  const [attachmentFieldList, setAttachmentFieldList] = useState<IFieldMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const logIdRef = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const formApi = useRef<BaseFormApi>();

  // 日志记录函数
  const addLog = useCallback((level: LogEntry['level'], message: string, data?: any) => {
    const logEntry: LogEntry = {
      id: logIdRef.current++,
      timestamp: Date.now(),
      level,
      message,
      data,
    };
    
    // 同时输出到控制台
    const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (data !== undefined) {
      consoleMethod(`[${level.toUpperCase()}] ${message}`, data);
    } else {
      consoleMethod(`[${level.toUpperCase()}] ${message}`);
    }
    
    // 添加到日志列表
    setLogs(prev => [...prev, logEntry]);
    
    // 自动滚动到底部
    setTimeout(() => {
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      }
    }, 100);
  }, []);

  // 清空日志
  const clearLogs = useCallback(() => {
    setLogs([]);
    logIdRef.current = 0;
  }, []);

  // 初始化：获取表格列表和当前选择
  useEffect(() => {
    let timer: number | undefined;
    const init = async () => {
      try {
        const [metaList, selection] = await Promise.all([
          bitable.base.getTableMetaList(),
          bitable.base.getSelection()
        ]);
        setTableMetaList(metaList);
        
        // 如果有选中的表格，等待formApi初始化后设置默认值
        if (selection.tableId && selection.tableId) {
          const tableId = selection.tableId;
          // 使用setTimeout确保formApi已初始化
          timer = window.setTimeout(() => {
            if (formApi.current) {
              formApi.current.setValue('tableId', tableId);
              loadTableData(tableId);
            }
          }, 200);
        }
      } catch (error) {
        console.error('Init error:', error);
        Notification.error({ title: t('error'), content: String(error) });
      }
    };
    init();
    
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 加载表格数据：视图列表和字段列表
  const loadTableData = useCallback(async (tableId: string) => {
    if (!tableId) return;
    
    try {
      const table = await bitable.base.getTableById(tableId);
      const [views, fields] = await Promise.all([
        table.getViewMetaList(),
        table.getFieldMetaList()
      ]);
      
      setViewMetaList(views);
      
      // 过滤URL字段（文本字段和URL字段）和附件字段
      // FieldType.Text = 1, FieldType.Url = 15, FieldType.Attachment = 17
      const urlFields = fields.filter(f => 
        f.type === FieldType.Text || f.type === FieldType.Url
      );
      const attachmentFields = fields.filter(f => f.type === FieldType.Attachment);
      
      setUrlFieldList(urlFields);
      setAttachmentFieldList(attachmentFields);
      
      // 设置默认视图
      if (views.length > 0) {
        formApi.current?.setValue('viewId', views[0].id);
      }
      
      // 设置默认字段（如果只有一个选项）
      if (urlFields.length === 1) {
        formApi.current?.setValue('urlFieldId', urlFields[0].id);
      }
      if (attachmentFields.length === 1) {
        formApi.current?.setValue('attachmentFieldId', attachmentFields[0].id);
      }
    } catch (error) {
      console.error('Load table data error:', error);
      Notification.error({ title: t('error'), content: String(error) });
    }
  }, [t]);

  // 处理表格选择变化
  const handleTableChange = useCallback((value: string | number | any[] | Record<string, any>) => {
    const tableId = typeof value === 'string' ? value : String(value);
    if (tableId) {
      loadTableData(tableId);
      // 清空视图和字段选择
      formApi.current?.setValue('viewId', '');
      formApi.current?.setValue('urlFieldId', '');
      formApi.current?.setValue('attachmentFieldId', '');
    }
  }, [loadTableData]);

  // 刷新数据
  const handleRefresh = useCallback(async () => {
    const values = formApi.current?.getValues() as FormValues;
    if (values?.tableId) {
      await loadTableData(values.tableId);
      Notification.success({ title: t('refresh'), content: '数据已刷新' });
    } else {
      // 重新加载表格列表
      try {
        const metaList = await bitable.base.getTableMetaList();
        setTableMetaList(metaList);
      } catch (error) {
        console.error('Refresh error:', error);
      }
    }
  }, [loadTableData, t]);

  // 处理URL转附件
  const handleConvert = useCallback(async (values: FormValues) => {
    const { tableId, viewId, urlFieldId, attachmentFieldId, overwrite } = values;

    // 清空日志并显示日志窗口
    clearLogs();
    setShowLogs(true);
    addLog('info', '开始处理URL转附件任务');

    // 验证必填字段
    if (!tableId) {
      addLog('error', '错误：未选择数据表');
      Notification.warning({ title: t('error'), content: t('pleaseSelectTable') });
      return;
    }
    if (!viewId) {
      addLog('error', '错误：未选择视图');
      Notification.warning({ title: t('error'), content: t('pleaseSelectView') });
      return;
    }
    if (!urlFieldId || !attachmentFieldId) {
      addLog('error', '错误：未选择URL字段或附件字段');
      Notification.warning({ title: t('error'), content: t('pleaseSelectFields') });
      return;
    }

    addLog('info', `数据表ID: ${tableId}`);
    addLog('info', `视图ID: ${viewId}`);
    addLog('info', `URL字段ID: ${urlFieldId}`);
    addLog('info', `附件字段ID: ${attachmentFieldId}`);
    addLog('info', `覆盖模式: ${overwrite ? '是' : '否'}`);

    setProcessing(true);
    setProgress({ current: 0, total: 0, success: 0, failed: 0 });

    try {
      const table = await bitable.base.getTableById(tableId);
      
      // 从表格获取所有记录ID（可以根据视图过滤）
      const view = await table.getViewById(viewId);
      const recordIds = await view.getVisibleRecordIdList();
      const total = recordIds.length;
      setProgress(prev => ({ ...prev, total }));

      if (total === 0) {
        Notification.info({ title: t('info'), content: t('noRecords') });
        setProcessing(false);
        return;
      }

      let successCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      addLog('info', `开始处理 ${total} 条记录`);
      setProgress(prev => ({ ...prev, current: 0, success: 0, failed: 0 }));

      // 遍历每条记录
      for (let i = 0; i < recordIds.length; i++) {
        const recordId = recordIds[i];
        if (!recordId) {
          addLog('warn', `记录 ${i + 1}: 记录ID为空，跳过`);
          skippedCount++;
          setProgress(prev => ({ ...prev, current: i + 1 }));
          continue;
        }
        
        const currentIndex = i + 1;
        setProgress(prev => ({ ...prev, current: currentIndex }));
        addLog('info', `\n=== 处理第 ${currentIndex}/${total} 条记录 ===`);
        addLog('info', `记录ID: ${recordId}`);

        try {
          // 获取URL字段的值
          const urlValue = await table.getCellValue(urlFieldId, recordId);
          addLog('info', `URL字段原始值:`, urlValue);
          
          let url: string | null = null;

          // 处理不同类型的URL字段值
          // Url字段类型返回的是ISegmentItem[]，其中包含link属性
          // Text字段类型返回的可能是string或ISegmentItem[]
          if (urlValue) {
            if (typeof urlValue === 'string') {
              // 纯字符串类型
              url = urlValue;
              addLog('info', `URL类型: 字符串, 值: ${url}`);
            } else if (Array.isArray(urlValue) && urlValue.length > 0) {
              // 数组类型（ISegmentItem[]），Url字段和Text字段都可能是这种格式
              const firstItem = urlValue[0];
              addLog('info', `URL类型: 数组, 第一项:`, firstItem);
              if (firstItem && typeof firstItem === 'object') {
                // 优先使用link属性（Url字段），如果没有则使用text属性（Text字段）
                url = (firstItem as any).link || (firstItem as any).text || null;
                addLog('info', `从数组提取URL - link: ${(firstItem as any).link}, text: ${(firstItem as any).text}, 最终URL: ${url}`);
              } else if (typeof firstItem === 'string') {
                url = firstItem;
                addLog('info', `从数组提取URL (字符串): ${url}`);
              }
            } else if (urlValue && typeof urlValue === 'object') {
              // 单个对象
              // 优先使用link属性（Url字段），如果没有则使用text属性
              url = (urlValue as any).link || (urlValue as any).text || null;
              addLog('info', `从对象提取URL，最终URL: ${url}`, urlValue);
            }
          }

          // 如果URL为空，跳过
          if (!url || typeof url !== 'string' || !url.trim()) {
            addLog('warn', `URL为空或无效，跳过该记录`);
            skippedCount++;
            continue;
          }

          const trimmedUrl = url.trim();
          addLog('info', `提取的URL: ${trimmedUrl}`);

          // 验证URL
          if (!isValidUrl(trimmedUrl)) {
            addLog('error', `URL格式无效: ${trimmedUrl}`);
            failedCount++;
            continue;
          }

          // 获取当前附件字段的值
          const currentAttachments = await table.getCellValue(attachmentFieldId, recordId);
          addLog('info', `当前附件字段值:`, currentAttachments);
          
          // 如果已有附件且不覆盖，跳过
          if (!overwrite && currentAttachments && Array.isArray(currentAttachments) && currentAttachments.length > 0) {
            addLog('info', `已有 ${currentAttachments.length} 个附件且不覆盖，跳过`);
            skippedCount++;
            continue;
          }

          // 下载文件
          let blob: Blob | null = null;
          try {
            addLog('info', `开始下载文件: ${trimmedUrl}`);
            addLog('info', `首先尝试通过代理下载（解决CORS问题）`);
            
            // 获取代理URL
            const baseUrl = window.location.origin;
            const proxyUrl = `${baseUrl}/api/proxy?url=${encodeURIComponent(trimmedUrl)}`;
            addLog('info', `代理URL: ${proxyUrl}`);
            
            // 使用代理下载，并传入日志回调
            blob = await downloadFileFromUrl(trimmedUrl, true, addLog);
            addLog('success', `文件下载成功 - 大小: ${(blob.size / 1024).toFixed(2)} KB, 类型: ${blob.type || 'unknown'}`);
          } catch (error: any) {
            addLog('error', `下载文件失败: ${error?.message || String(error)}`);
            if (error?.data) {
              addLog('error', `错误详情:`, error.data);
            }
            
            // 分析错误类型
            const errorMsg = error?.message || String(error);
            if (errorMsg.includes('500') || errorMsg.includes('HTTP错误') || errorMsg.includes('服务器错误')) {
              addLog('error', `目标服务器返回错误（可能是服务器问题，不是CORS问题）`);
              addLog('error', `如果目标服务器返回500错误，说明文件服务器有问题，无法下载`);
              failedCount++;
              setProgress(prev => ({ ...prev, failed: failedCount }));
              continue;
            } else if (errorMsg.includes('CORS') || errorMsg.includes('代理')) {
              addLog('info', `CORS或代理问题，尝试直接下载（可能仍然失败）`);
              try {
                blob = await downloadFileFromUrl(trimmedUrl, false, addLog); // 不使用代理
                addLog('success', `直接下载成功 - 大小: ${(blob.size / 1024).toFixed(2)} KB`);
              } catch (directError: any) {
                addLog('error', `直接下载也失败: ${directError?.message || String(directError)}`);
                failedCount++;
                setProgress(prev => ({ ...prev, failed: failedCount }));
                continue;
              }
            } else {
              failedCount++;
              setProgress(prev => ({ ...prev, failed: failedCount }));
              continue;
            }
          }

          // 检查blob是否成功下载
          if (!blob) {
            addLog('error', `文件下载失败，blob为空`);
            failedCount++;
            continue;
          }

          // 上传附件到飞书
          try {
            // 获取文件名
            const fileName = getFileNameFromUrl(trimmedUrl) || 'file';
            addLog('info', `文件名: ${fileName}`);
            
            // 将Blob转换为File对象
            const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
            addLog('info', `File对象创建成功 - name: ${file.name}, size: ${file.size}, type: ${file.type}`);
            
            // 获取附件字段实例
            const attachmentField = await table.getFieldById(attachmentFieldId) as IAttachmentField;
            addLog('info', `附件字段实例获取成功`);
            
            // 使用batchUploadFile上传文件，然后设置附件值
            addLog('info', `开始上传文件到飞书...`);
            const fileTokens = await bitable.base.batchUploadFile([file]);
            addLog('info', `文件上传API调用完成，返回tokens:`, fileTokens);
            
            if (!fileTokens || fileTokens.length === 0) {
              throw new Error('文件上传失败，未返回token');
            }
            
            const fileToken = fileTokens[0];
            addLog('success', `文件上传成功，token: ${fileToken}`);
            
            // 构建附件对象（根据IOpenAttachment类型定义）
            // IOpenAttachment需要: token, name, size, type, timeStamp
            const attachmentItem: any = {
              token: fileToken,
              name: fileName,
              size: blob.size,
              type: blob.type || 'application/octet-stream',
              timeStamp: Date.now(), // 添加时间戳
            };
            addLog('info', `附件对象构建完成:`, attachmentItem);

            // 准备要设置的附件数组
            let attachmentsToSet: any[];
            if (overwrite || !currentAttachments || !Array.isArray(currentAttachments) || currentAttachments.length === 0) {
              // 覆盖或为空时，设置为新附件
              attachmentsToSet = [attachmentItem];
              addLog('info', `使用覆盖模式，设置新附件`);
            } else {
              // 追加附件（保留原有附件）
              // 确保现有附件对象格式正确
              const normalizedExisting = (currentAttachments as any[]).map((att: any) => {
                // 如果现有附件对象缺少必要字段，尝试规范化
                if (att && typeof att === 'object' && att.token) {
                  return {
                    token: att.token,
                    name: att.name || 'file',
                    size: att.size || 0,
                    type: att.type || 'application/octet-stream',
                    timeStamp: att.timeStamp || Date.now(),
                  };
                }
                return att;
              });
              attachmentsToSet = [...normalizedExisting, attachmentItem];
              addLog('info', `使用追加模式，保留 ${normalizedExisting.length} 个现有附件，添加新附件`);
            }
            
            addLog('info', `准备设置附件字段值（共 ${attachmentsToSet.length} 个附件）`, attachmentsToSet);
            
            // 使用setCellValue设置附件字段的值
            try {
              addLog('info', `调用 setCellValue API...`);
              const setResult = await table.setCellValue(attachmentFieldId, recordId, attachmentsToSet);
              addLog('info', `setCellValue API调用完成，返回值: ${setResult}`);
              
              // 短暂等待，让服务器处理
              addLog('info', `等待1秒让服务器处理...`);
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // 验证设置是否成功 - 重新读取附件字段值
              addLog('info', `验证附件字段值...`);
              const verifyAttachments = await table.getCellValue(attachmentFieldId, recordId);
              addLog('info', `验证读取的附件字段值:`, verifyAttachments);
              
              // 检查是否设置成功
              if (verifyAttachments && Array.isArray(verifyAttachments)) {
                // 检查新附件是否在列表中
                const hasNewAttachment = verifyAttachments.some((att: any) => 
                  att && att.token === fileToken
                );
                
                if (hasNewAttachment) {
                  successCount++;
                  setProgress(prev => ({ ...prev, success: successCount }));
                  addLog('success', `✓ 处理成功！附件已确认设置到字段中`);
                } else if (verifyAttachments.length > 0) {
                  // 如果附件列表不为空，但找不到新附件，可能是token不匹配
                  // 检查是否有新添加的附件（通过数量判断）
                  const existingCount = (currentAttachments && Array.isArray(currentAttachments)) 
                    ? currentAttachments.length 
                    : 0;
                  const expectedCount = overwrite ? 1 : existingCount + 1;
                  if (verifyAttachments.length >= expectedCount) {
                    successCount++;
                    setProgress(prev => ({ ...prev, success: successCount }));
                    addLog('success', `✓ 处理成功！附件数量正确（${verifyAttachments.length}个，期望${expectedCount}个）`);
                  } else {
                    addLog('error', `⚠ 附件数量不匹配 - 期望: ${expectedCount}, 实际: ${verifyAttachments.length}`, verifyAttachments);
                    failedCount++;
                    setProgress(prev => ({ ...prev, failed: failedCount }));
                  }
                } else {
                  addLog('error', `⚠ 附件字段为空，设置可能失败`);
                  failedCount++;
                  setProgress(prev => ({ ...prev, failed: failedCount }));
                }
              } else {
                // 如果验证返回null或非数组，可能是字段为空（新设置）
                // 但在覆盖模式下，应该至少有一个附件
                if (overwrite) {
                  addLog('error', `⚠ 覆盖模式但附件字段为空，设置可能失败`);
                  failedCount++;
                  setProgress(prev => ({ ...prev, failed: failedCount }));
                } else {
                  // 追加模式，如果验证失败，但API调用成功，仍然认为可能成功
                  addLog('warn', `⚠ 无法验证附件，但API调用未报错，标记为成功`);
                  successCount++;
                  setProgress(prev => ({ ...prev, success: successCount }));
                }
              }
            } catch (setError: any) {
              addLog('error', `❌ 设置附件字段时抛出异常: ${setError?.message || String(setError)}`, {
                message: setError?.message,
                name: setError?.name,
                stack: setError?.stack,
              });
              failedCount++;
              setProgress(prev => ({ ...prev, failed: failedCount }));
            }
          } catch (error: any) {
            addLog('error', `上传附件失败: ${error?.message || String(error)}`, {
              message: error?.message,
              stack: error?.stack,
              name: error?.name,
            });
            failedCount++;
            setProgress(prev => ({ ...prev, failed: failedCount }));
          }
        } catch (error: any) {
          addLog('error', `处理记录时出错: ${error?.message || String(error)}`, error);
          failedCount++;
          setProgress(prev => ({ ...prev, failed: failedCount }));
        }
      }

      addLog('info', `\n=== 处理完成 ===`);
      addLog('success', `成功: ${successCount} 条`);
      addLog('error', `失败: ${failedCount} 条`);
      addLog('info', `跳过: ${skippedCount} 条`);
      addLog('info', `总计: ${total} 条`);

      setProgress(prev => ({ ...prev, success: successCount, failed: failedCount }));
      
      // 只有在有实际处理结果时才显示通知
      if (successCount > 0 || failedCount > 0) {
        if (failedCount === 0) {
          // 全部成功 - 使用模板字符串确保变量替换
          Notification.success({
            title: t('success'),
            content: `已成功处理 ${successCount} 条记录`,
            duration: 5,
          });
        } else {
          // 有失败记录 - 使用模板字符串确保变量替换
          Notification.warning({
            title: t('error'),
            content: `已完成 ${successCount} 条记录，失败 ${failedCount} 条`,
            duration: 5,
          });
        }
      } else {
        Notification.info({
          title: t('info'),
          content: t('noProcessableRecords'),
          duration: 3,
        });
      }
    } catch (error: any) {
      addLog('error', `处理过程中发生错误: ${error?.message || String(error)}`, error);
      Notification.error({ title: t('error'), content: String(error) });
    } finally {
      setProcessing(false);
    }
  }, [t, addLog, clearLogs]);

  // 表单提交处理
  const handleSubmit = useCallback(async (values: FormValues) => {
    await handleConvert(values);
  }, [handleConvert]);

  return (
    <main className="main">
      <div className="header">
        <Title heading={5}>{t('title')}</Title>
        <Button
          icon="refresh"
          theme="borderless"
          type="tertiary"
          onClick={handleRefresh}
          style={{ marginLeft: 'auto' }}
        />
      </div>
      
      <Text className="description">{t('description')}</Text>

      <Form
        labelPosition="top"
        onSubmit={handleSubmit}
        getFormApi={(api: BaseFormApi) => { formApi.current = api; }}
        style={{ marginTop: '16px' }}
      >
        <Form.Input
          field="authCode"
          label={t('authCodeLabel')}
          placeholder={t('authCodePlaceholder')}
          style={{ width: '100%' }}
        />
        <Text type="secondary" style={{ fontSize: '12px', marginTop: '-8px', marginBottom: '8px', display: 'block' }}>
          {t('authCodeHelp')}{' '}
          <a
            href="https://eggreeco.feishu.cn/wiki/DKmzw5ASKi2"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--semi-color-link)' }}
          >
            使用指南
          </a>
        </Text>

        <Form.Select
          field="tableId"
          label={t('selectTable')}
          placeholder={t('pleaseSelectTable')}
          style={{ width: '100%' }}
          onChange={handleTableChange}
          loading={loading}
        >
          {tableMetaList.map(({ name, id }) => (
            <Form.Select.Option key={id} value={id}>
              {name}
            </Form.Select.Option>
          ))}
        </Form.Select>

        <Form.Select
          field="viewId"
          label={t('selectView')}
          placeholder={t('pleaseSelectView')}
          style={{ width: '100%' }}
          disabled={!viewMetaList.length}
        >
          {viewMetaList.map(({ name, id }) => (
            <Form.Select.Option key={id} value={id}>
              {name}
            </Form.Select.Option>
          ))}
        </Form.Select>

        <Form.Select
          field="urlFieldId"
          label={t('selectUrlField')}
          placeholder={t('pleaseSelectFields')}
          style={{ width: '100%' }}
          disabled={!urlFieldList.length}
        >
          {urlFieldList.map(({ name, id }) => (
            <Form.Select.Option key={id} value={id}>
              {name}
            </Form.Select.Option>
          ))}
        </Form.Select>

        <Form.Select
          field="attachmentFieldId"
          label={t('selectAttachmentField')}
          placeholder={t('pleaseSelectFields')}
          style={{ width: '100%' }}
          disabled={!attachmentFieldList.length}
        >
          {attachmentFieldList.map(({ name, id }) => (
            <Form.Select.Option key={id} value={id}>
              {name}
            </Form.Select.Option>
          ))}
        </Form.Select>

        <Form.Checkbox field="overwrite" initValue={false}>
          {t('overwriteAttachments')}
        </Form.Checkbox>

        {processing && (
          <Card style={{ marginTop: '16px', backgroundColor: '#f7f8fa' }}>
            <div style={{ textAlign: 'center', padding: '16px' }}>
              <Spin spinning={true} size="large" />
              <div style={{ marginTop: '16px' }}>
                <Text strong style={{ fontSize: '16px', display: 'block', marginBottom: '8px' }}>
                  处理进度
                </Text>
                <Text style={{ fontSize: '14px', color: '#575757', display: 'block', marginBottom: '12px' }}>
                  正在处理第 <Text strong style={{ color: '#1890ff', fontSize: '16px' }}>{progress.current}</Text> 条记录，共 <Text strong style={{ color: '#1890ff', fontSize: '16px' }}>{progress.total}</Text> 条
                </Text>
                {progress.total > 0 && (
                  <Progress 
                    percent={Math.round((progress.current / progress.total) * 100)} 
                    showInfo={true}
                    stroke="#1890ff"
                    style={{ marginTop: '12px' }}
                  />
                )}
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center', gap: '24px', flexWrap: 'wrap' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: '12px' }}>成功</Text>
                    <Text strong style={{ fontSize: '18px', color: '#52c41a', display: 'block', marginTop: '4px' }}>
                      {progress.success}
                    </Text>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: '12px' }}>失败</Text>
                    <Text strong style={{ fontSize: '18px', color: '#f5222d', display: 'block', marginTop: '4px' }}>
                      {progress.failed}
                    </Text>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: '12px' }}>已完成</Text>
                    <Text strong style={{ fontSize: '18px', color: '#1890ff', display: 'block', marginTop: '4px' }}>
                      {progress.current} / {progress.total}
                    </Text>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        <Button
          theme="solid"
          type="primary"
          htmlType="submit"
          block
          loading={processing}
          style={{ marginTop: '24px' }}
        >
          {t('confirm')}
        </Button>
      </Form>

      {/* 日志窗口 */}
      {showLogs && (
        <Card
          style={{ marginTop: '24px' }}
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{t('logs')}</span>
              <div>
                <Button
                  size="small"
                  theme="borderless"
                  type="tertiary"
                  onClick={clearLogs}
                  style={{ marginRight: '8px' }}
                >
                  {t('clearLogs')}
                </Button>
                <Button
                  size="small"
                  theme="borderless"
                  type="tertiary"
                  onClick={() => setShowLogs(false)}
                >
                  {t('hideLogs')}
                </Button>
              </div>
            </div>
          }
        >
          <div
            ref={logContainerRef}
            className="log-container"
            style={{
              maxHeight: '400px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '12px',
              lineHeight: '1.6',
              padding: '12px',
              backgroundColor: '#1e1e1e',
              color: '#d4d4d4',
              borderRadius: '4px',
            }}
          >
            {logs.length === 0 ? (
              <div style={{ color: '#888' }}>{t('noLogs')}</div>
            ) : (
              logs.map((log) => {
                const time = new Date(log.timestamp).toLocaleTimeString();
                const levelColor = 
                  log.level === 'error' ? '#f48771' :
                  log.level === 'warn' ? '#dcdcaa' :
                  log.level === 'success' ? '#4ec9b0' :
                  '#569cd6';
                
                return (
                  <div
                    key={log.id}
                    style={{
                      marginBottom: '4px',
                      padding: '2px 0',
                      borderLeft: `3px solid ${levelColor}`,
                      paddingLeft: '8px',
                    }}
                  >
                    <span style={{ color: '#808080' }}>[{time}]</span>{' '}
                    <span style={{ color: levelColor, fontWeight: 'bold' }}>
                      [{log.level.toUpperCase()}]
                    </span>{' '}
                    <span style={{ color: '#d4d4d4' }}>{log.message}</span>
                    {log.data !== undefined && (
                      <pre
                        style={{
                          margin: '4px 0 0 0',
                          padding: '8px',
                          backgroundColor: '#252526',
                          borderRadius: '4px',
                          overflow: 'auto',
                          fontSize: '11px',
                          color: '#ce9178',
                        }}
                      >
                        {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : String(log.data)}
                      </pre>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>
      )}

      {/* 如果没有日志但处理中，显示一个简单的日志入口 */}
      {!showLogs && processing && (
        <Button
          theme="borderless"
          type="tertiary"
          onClick={() => setShowLogs(true)}
          style={{ marginTop: '16px', width: '100%' }}
        >
          {t('viewLogs')}
        </Button>
      )}
    </main>
  );
}