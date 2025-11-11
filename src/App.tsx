import './App.css';
import { bitable, ITableMeta, IViewMeta, IFieldMeta, IAttachmentField, ITextField, FieldType } from "@lark-base-open/js-sdk";
import { Button, Form, Input, Select, Checkbox, Typography, Notification, Spin } from '@douyinfe/semi-ui';
import { BaseFormApi } from '@douyinfe/semi-foundation/lib/es/form/interface';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadFileFromUrl, isValidUrl, getFileNameFromUrl } from './utils/fileUtils';

const { Title, Text } = Typography;

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
  const formApi = useRef<BaseFormApi>();

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

    // 验证必填字段
    if (!tableId) {
      Notification.warning({ title: t('error'), content: t('pleaseSelectTable') });
      return;
    }
    if (!viewId) {
      Notification.warning({ title: t('error'), content: t('pleaseSelectView') });
      return;
    }
    if (!urlFieldId || !attachmentFieldId) {
      Notification.warning({ title: t('error'), content: t('pleaseSelectFields') });
      return;
    }

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

      console.log(`开始处理 ${total} 条记录`);

      // 遍历每条记录
      for (let i = 0; i < recordIds.length; i++) {
        const recordId = recordIds[i];
        if (!recordId) {
          console.warn(`记录ID为空，跳过`);
          skippedCount++;
          continue;
        }
        
        setProgress(prev => ({ ...prev, current: i + 1 }));
        console.log(`处理第 ${i + 1}/${total} 条记录: ${recordId}`);

        try {
          // 获取URL字段的值
          const urlValue = await table.getCellValue(urlFieldId, recordId);
          console.log(`URL字段值:`, urlValue);
          
          let url: string | null = null;

          // 处理不同类型的URL字段值
          // Url字段类型返回的是ISegmentItem[]，其中包含link属性
          // Text字段类型返回的可能是string或ISegmentItem[]
          if (urlValue) {
            if (typeof urlValue === 'string') {
              // 纯字符串类型
              url = urlValue;
            } else if (Array.isArray(urlValue) && urlValue.length > 0) {
              // 数组类型（ISegmentItem[]），Url字段和Text字段都可能是这种格式
              const firstItem = urlValue[0];
              if (firstItem && typeof firstItem === 'object') {
                // 优先使用link属性（Url字段），如果没有则使用text属性（Text字段）
                url = (firstItem as any).link || (firstItem as any).text || null;
                console.log(`从数组提取URL:`, url, `link:`, (firstItem as any).link, `text:`, (firstItem as any).text);
              } else if (typeof firstItem === 'string') {
                url = firstItem;
              }
            } else if (urlValue && typeof urlValue === 'object') {
              // 单个对象
              // 优先使用link属性（Url字段），如果没有则使用text属性
              url = (urlValue as any).link || (urlValue as any).text || null;
              console.log(`从对象提取URL:`, url);
            }
          }

          // 如果URL为空，跳过
          if (!url || typeof url !== 'string' || !url.trim()) {
            console.warn(`记录 ${recordId} URL为空，跳过`);
            skippedCount++;
            continue;
          }

          const trimmedUrl = url.trim();
          console.log(`提取的URL: ${trimmedUrl}`);

          // 验证URL
          if (!isValidUrl(trimmedUrl)) {
            console.warn(`记录 ${recordId} URL无效: ${trimmedUrl}`);
            failedCount++;
            continue;
          }

          // 获取当前附件字段的值
          const currentAttachments = await table.getCellValue(attachmentFieldId, recordId);
          console.log(`当前附件:`, currentAttachments);
          
          // 如果已有附件且不覆盖，跳过
          if (!overwrite && currentAttachments && Array.isArray(currentAttachments) && currentAttachments.length > 0) {
            console.log(`记录 ${recordId} 已有附件且不覆盖，跳过`);
            skippedCount++;
            continue;
          }

          // 下载文件
          let blob: Blob;
          try {
            console.log(`开始下载文件: ${trimmedUrl}`);
            blob = await downloadFileFromUrl(trimmedUrl);
            console.log(`文件下载成功，大小: ${blob.size} bytes, 类型: ${blob.type}`);
          } catch (error) {
            console.error(`记录 ${recordId} 下载文件失败:`, error);
            failedCount++;
            continue;
          }

          // 上传附件到飞书
          try {
            // 获取文件名
            const fileName = getFileNameFromUrl(trimmedUrl) || 'file';
            console.log(`文件名: ${fileName}`);
            
            // 将Blob转换为File对象
            const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
            console.log(`File对象创建成功:`, { name: file.name, size: file.size, type: file.type });
            
            // 获取附件字段实例
            const attachmentField = await table.getFieldById(attachmentFieldId) as IAttachmentField;
            console.log(`附件字段获取成功:`, attachmentFieldId);
            
            // 方法1: 使用batchUploadFile上传文件，然后设置附件值
            console.log(`开始上传文件到飞书...`);
            const fileTokens = await bitable.base.batchUploadFile([file]);
            console.log(`文件上传成功，tokens:`, fileTokens);
            
            if (!fileTokens || fileTokens.length === 0) {
              throw new Error('文件上传失败，未返回token');
            }
            
            const fileToken = fileTokens[0];
            
            // 构建附件对象（根据IOpenAttachment类型定义）
            // IOpenAttachment需要: token, name, size, type, timeStamp
            const attachmentItem: any = {
              token: fileToken,
              name: fileName,
              size: blob.size,
              type: blob.type || 'application/octet-stream',
              timeStamp: Date.now(), // 添加时间戳
            };
            console.log(`附件对象:`, attachmentItem);

            // 准备要设置的附件数组
            let attachmentsToSet: any[];
            if (overwrite || !currentAttachments || !Array.isArray(currentAttachments) || currentAttachments.length === 0) {
              // 覆盖或为空时，设置为新附件
              attachmentsToSet = [attachmentItem];
              console.log(`使用覆盖模式，设置新附件`);
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
              console.log(`使用追加模式，保留 ${normalizedExisting.length} 个现有附件，添加新附件`);
            }
            
            console.log(`准备设置附件字段值（共 ${attachmentsToSet.length} 个附件）:`, attachmentsToSet);
            
            // 使用setCellValue设置附件字段的值
            try {
              const setResult = await table.setCellValue(attachmentFieldId, recordId, attachmentsToSet);
              console.log(`设置附件字段API调用完成，返回值:`, setResult);
              
              // 短暂等待，让服务器处理
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // 验证设置是否成功 - 重新读取附件字段值
              const verifyAttachments = await table.getCellValue(attachmentFieldId, recordId);
              console.log(`验证附件字段值:`, verifyAttachments);
              
              // 检查是否设置成功
              if (verifyAttachments && Array.isArray(verifyAttachments)) {
                // 检查新附件是否在列表中
                const hasNewAttachment = verifyAttachments.some((att: any) => 
                  att && att.token === fileToken
                );
                
                if (hasNewAttachment) {
                  successCount++;
                  console.log(`✓ 记录 ${recordId} 处理成功，附件已确认设置`);
                } else if (verifyAttachments.length > 0) {
                  // 如果附件列表不为空，但找不到新附件，可能是token不匹配
                  // 检查是否有新添加的附件（通过数量判断）
                  const existingCount = (currentAttachments && Array.isArray(currentAttachments)) 
                    ? currentAttachments.length 
                    : 0;
                  const expectedCount = overwrite ? 1 : existingCount + 1;
                  if (verifyAttachments.length >= expectedCount) {
                    successCount++;
                    console.log(`✓ 记录 ${recordId} 处理成功，附件数量正确（${verifyAttachments.length}个）`);
                  } else {
                    console.warn(`⚠ 记录 ${recordId} 附件数量不匹配，期望 ${expectedCount}，实际 ${verifyAttachments.length}`);
                    failedCount++;
                  }
                } else {
                  console.warn(`⚠ 记录 ${recordId} 附件字段为空，设置可能失败`);
                  failedCount++;
                }
              } else {
                // 如果验证返回null或非数组，可能是字段为空（新设置）
                // 但在覆盖模式下，应该至少有一个附件
                if (overwrite) {
                  console.warn(`⚠ 记录 ${recordId} 覆盖模式但附件字段为空`);
                  failedCount++;
                } else {
                  // 追加模式，如果验证失败，但API调用成功，仍然认为可能成功
                  console.log(`⚠ 记录 ${recordId} 无法验证，但API调用未报错，标记为成功`);
                  successCount++;
                }
              }
            } catch (setError: any) {
              console.error(`❌ 记录 ${recordId} 设置附件字段时抛出异常:`, setError);
              console.error(`异常详情:`, {
                message: setError?.message,
                name: setError?.name,
                stack: setError?.stack,
              });
              failedCount++;
            }
          } catch (error: any) {
            console.error(`记录 ${recordId} 上传附件失败:`, error);
            console.error(`错误详情:`, {
              message: error?.message,
              stack: error?.stack,
              name: error?.name,
            });
            failedCount++;
          }
        } catch (error) {
          console.error(`记录 ${recordId} 处理出错:`, error);
          failedCount++;
        }
      }

      console.log(`处理完成: 成功 ${successCount}, 失败 ${failedCount}, 跳过 ${skippedCount}`);

      setProgress(prev => ({ ...prev, success: successCount, failed: failedCount }));
      
      // 只有在有实际处理结果时才显示通知
      if (successCount > 0 || failedCount > 0) {
        if (failedCount === 0) {
          Notification.success({
            title: t('success'),
            content: t('completed', { success: successCount, failed: failedCount }),
            duration: 5,
          });
        } else {
          Notification.warning({
            title: t('error'),
            content: t('completed', { success: successCount, failed: failedCount }),
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
    } catch (error) {
      console.error('Convert error:', error);
      Notification.error({ title: t('error'), content: String(error) });
    } finally {
      setProcessing(false);
    }
  }, [t]);

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
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <Spin spinning={true} />
            <Text style={{ display: 'block', marginTop: '8px' }}>
              {t('processingRecord', {
                current: progress.current,
                total: progress.total,
              })}
            </Text>
          </div>
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
    </main>
  );
}