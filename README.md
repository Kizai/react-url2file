# 飞书多维表格 - URL转附件插件

一个用于飞书多维表格的插件，可以将表格中URL字段的图片、文件链接转换为实际的附件文件。

## 功能特性

- 🔗 **URL转附件**：自动将表格中URL字段的链接下载并转换为附件
- 📊 **批量处理**：支持批量处理多条记录
- 🔄 **覆盖控制**：可选择是否覆盖已有附件
- 📁 **多字段支持**：支持选择不同的URL字段和附件字段
- 🌍 **国际化**：支持中文和英文界面
- ⚡ **实时进度**：显示处理进度和结果统计
- 🛡️ **文件限制**：自动检测文件大小，支持20M以内的文件

## 技术栈

- React 18
- TypeScript
- Vite
- Semi Design UI组件库
- 飞书多维表格 JS SDK (`@lark-base-open/js-sdk`)
- i18next 国际化

## 安装和开发

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

构建后的文件会在 `dist` 目录中。

## 使用方法

### 1. 在飞书多维表格中使用

1. 打开飞书多维表格
2. 在表格中添加扩展脚本
3. 将构建后的 `dist` 目录中的文件上传，或使用部署后的URL
4. 在侧边栏中打开插件

### 2. 配置插件

1. **授权码**（可选）：输入飞书多维表格授权码（如果需要使用Open API）
2. **选择数据表**：选择要处理的数据表
3. **选择视图**：选择要处理的视图
4. **选择URL字段**：选择包含URL链接的文本字段
5. **选择附件字段**：选择要存储附件的附件字段
6. **覆盖已有附件**：勾选此项将覆盖已有附件，不勾选则跳过已有附件的记录

### 3. 执行转换

点击"确定"按钮开始转换，插件会：
- 读取选中视图中的所有记录
- 提取每条记录的URL字段值
- 下载URL对应的文件
- 上传文件到飞书作为附件
- 更新附件字段

## 功能说明

### URL字段

- 支持文本类型的字段
- URL必须是有效的HTTP或HTTPS链接
- 如果URL为空或无效，将跳过该记录

### 附件字段

- 支持附件类型的字段
- 如果字段已有附件且未勾选"覆盖已有附件"，将跳过该记录
- 如果勾选"覆盖已有附件"，将替换原有附件

### 文件限制

- 支持最大20MB的文件
- 超过20MB的文件将被跳过并记录为失败

### 处理结果

处理完成后会显示：
- 成功处理的记录数
- 失败的记录数
- 处理进度

## 项目结构

```
react-url2file/
├── src/
│   ├── App.tsx              # 主应用组件
│   ├── App.css              # 样式文件
│   ├── index.tsx            # 入口文件
│   ├── components/          # 组件目录
│   │   └── LoadApp/         # 加载组件
│   ├── locales/             # 国际化文件
│   │   ├── zh.json          # 中文翻译
│   │   ├── en.json          # 英文翻译
│   │   └── i18n.ts          # 国际化配置
│   └── utils/               # 工具函数
│       └── fileUtils.ts     # 文件处理工具
├── dist/                    # 构建输出目录
├── package.json             # 项目配置
├── vite.config.js           # Vite配置
└── README.md                # 项目说明
```

## 开发指南

### 代码规范

- 使用TypeScript进行类型检查
- 遵循React Hooks最佳实践
- 使用Semi Design组件库
- 支持国际化，所有文本使用i18n

### 主要API

#### 飞书SDK API

- `bitable.base.getTableMetaList()` - 获取表格列表
- `bitable.base.getTableById()` - 获取表格实例
- `table.getViewMetaList()` - 获取视图列表
- `table.getFieldMetaList()` - 获取字段列表
- `view.getRecords()` - 获取记录列表
- `record.getCellValue()` - 获取单元格值
- `record.setCellValue()` - 设置单元格值
- `bitable.base.uploadAttachment()` - 上传附件

#### 工具函数

- `downloadFileFromUrl(url)` - 从URL下载文件
- `isValidUrl(url)` - 验证URL是否有效
- `getFileNameFromUrl(url)` - 从URL提取文件名

## 发布

### 发布到飞书多维表格

1. 执行 `npm run build` 构建项目
2. 将 `dist` 目录中的文件打包
3. 访问[共享表单](https://feishu.feishu.cn/share/base/form/shrcnGFgOOsFGew3SDZHPhzkM0e)提交插件

### 部署到Vercel

1. **登录Vercel**：访问 [Vercel](https://vercel.com) 并登录（可以使用GitHub账户）

2. **导入项目**：
   - 点击 "Add New Project"
   - 选择 "Import Git Repository"
   - 选择 `react-url2file` 仓库
   - 点击 "Import"

3. **配置项目**（通常Vercel会自动检测）：
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

4. **环境变量**：通常不需要额外配置环境变量

5. **部署**：
   - 点击 "Deploy" 按钮
   - 等待部署完成

6. **获取部署URL**：
   - 部署完成后，Vercel会提供一个URL（例如：`https://react-url2file.vercel.app`）
   - 在飞书多维表格的扩展脚本中使用这个URL

7. **在飞书多维表格中使用**：
   - 打开飞书多维表格
   - 进入扩展脚本设置
   - 输入Vercel提供的URL
   - 保存并启用插件

## 常见问题

### Q: 为什么有些URL无法转换？

A: 可能的原因：
- URL无效或无法访问
- 文件大小超过20MB
- 网络连接问题
- CORS跨域限制

### Q: 如何处理大量记录？

A: 插件会逐条处理记录，处理大量记录时可能需要较长时间。建议：
- 分批处理
- 确保网络连接稳定
- 检查URL有效性

### Q: 授权码是必需的吗？

A: 在插件环境中，通常不需要授权码，因为插件SDK已经提供了访问权限。授权码主要用于使用飞书Open API的场景。

## 更新日志

### v1.0.0
- 初始版本
- 实现URL转附件功能
- 支持批量处理
- 支持覆盖控制
- 支持国际化

## 参考文档

- [飞书多维表格扩展脚本开发指南](https://feishu.feishu.cn/docx/U3wodO5eqome3uxFAC3cl0qanIe)
- [Base Extension Development Guide](https://lark-technologies.larksuite.com/docx/HvCbdSzXNowzMmxWgXsuB2Ngs7d)
- [多维表格插件API](https://bytedance.feishu.cn/docx/HjCEd1sPzoVnxIxF3LrcKnepnUf)
- [Base Extensions Front-end API](https://lark-technologies.larksuite.com/docx/Y6IcdywRXoTYSOxKwWvuLK09sFe)

## 许可证

ISC

## 贡献

欢迎提交Issue和Pull Request！
