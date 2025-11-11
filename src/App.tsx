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

      // 遍历每条记录
      for (let i = 0; i < recordIds.length; i++) {
        const recordId = recordIds[i];
        if (!recordId) continue;
        
        setProgress(prev => ({ ...prev, current: i + 1 }));

        try {
          // 获取URL字段的值
          const urlValue = await table.getCellValue(urlFieldId, recordId);
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
              } else if (typeof firstItem === 'string') {
                url = firstItem;
              }
            } else if (urlValue && typeof urlValue === 'object') {
              // 单个对象
              // 优先使用link属性（Url字段），如果没有则使用text属性
              url = (urlValue as any).link || (urlValue as any).text || null;
            }
          }

          // 如果URL为空，跳过
          if (!url || typeof url !== 'string' || !url.trim()) {
            continue;
          }

          const trimmedUrl = url.trim();

          // 验证URL
          if (!isValidUrl(trimmedUrl)) {
            console.warn(`Invalid URL: ${trimmedUrl}`);
            failedCount++;
            continue;
          }

          // 获取当前附件字段的值
          const currentAttachments = await table.getCellValue(attachmentFieldId, recordId);
          
          // 如果已有附件且不覆盖，跳过
          if (!overwrite && currentAttachments && Array.isArray(currentAttachments) && currentAttachments.length > 0) {
            continue;
          }

          // 下载文件
          let blob: Blob;
          try {
            blob = await downloadFileFromUrl(trimmedUrl);
          } catch (error) {
            console.error(`Download failed for URL: ${trimmedUrl}`, error);
            failedCount++;
            continue;
          }

          // 上传附件到飞书
          try {
            // 获取文件名
            const fileName = getFileNameFromUrl(trimmedUrl) || 'file';
            
            // 将Blob转换为File对象
            const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
            
            // 使用base.uploadFile上传文件，返回file_token
            const fileToken = await bitable.base.uploadFile(file);

            // 构建附件对象
            const attachmentItem = {
              file_token: fileToken,
              name: fileName,
            };

            // 设置附件字段的值
            if (overwrite || !currentAttachments || !Array.isArray(currentAttachments) || currentAttachments.length === 0) {
              // 覆盖或为空时，设置为新附件
              await table.setCellValue(attachmentFieldId, recordId, [attachmentItem] as any);
            } else {
              // 追加附件（保留原有附件）
              await table.setCellValue(attachmentFieldId, recordId, [
                ...(currentAttachments as any[]),
                attachmentItem
              ] as any);
            }

            successCount++;
          } catch (error) {
            console.error(`Upload failed for URL: ${trimmedUrl}`, error);
            failedCount++;
          }
        } catch (error) {
          console.error(`Process record error:`, error);
          failedCount++;
        }
      }

      setProgress(prev => ({ ...prev, success: successCount, failed: failedCount }));
      Notification.success({
        title: t('success'),
        content: t('completed', { success: successCount, failed: failedCount }),
        duration: 5,
      });
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