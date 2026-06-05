# Mermaid to Excalidraw Local

把 Obsidian 里的 Mermaid 代码块转换成可编辑的 Excalidraw 内嵌图。
转换前：
<img width="1970" height="1143" alt="image" src="https://github.com/user-attachments/assets/44ac907b-8ff3-462c-8565-9c17193d8268" />
转换后：
<img width="1653" height="1186" alt="image" src="https://github.com/user-attachments/assets/529fecd6-ed33-4156-bce8-42dacea50946" />
操作简单：
<img width="2015" height="331" alt="image" src="https://github.com/user-attachments/assets/b0e1a694-0c9a-48db-ad60-2cfc8aa5022a" />
可二次编辑
<img width="1520" height="936" alt="image" src="https://github.com/user-attachments/assets/cd3ff86f-ffac-47c4-9a93-4e3dc1d33b98" />


## 功能

- 在 Markdown 编辑器里，把光标放进 Mermaid 代码块后右键转换。
- 在阅读/预览视图里，对 Mermaid 渲染区域打开右键菜单并转换。
- 使用本地 `mermaid-to-excalidraw` 转换，不上传图表内容。
- 生成 `.excalidraw.md` 文件，再用 Obsidian 内嵌链接替换原 Mermaid 块。
- 保留 Excalidraw 编辑能力，双击内嵌图即可继续编辑。

## 依赖

需要先安装并启用 Obsidian 的 Excalidraw 插件，否则生成的 `.excalidraw.md` 文件不能按 Excalidraw 图形方式展示。

推荐安装 Hide Folders 插件，并隐藏 `_generated` 文件夹。插件默认把生成文件放在：

```text
Excalidraw/_generated/mermaid
```

这样 Obsidian 可以正常索引和内嵌文件，同时文件树不会被生成文件打扰。

## 安装

### 手动安装

1. 下载本仓库 release 里的 `main.js`、`manifest.json`。
2. 放到你的 vault：

```text
.obsidian/plugins/mermaid-to-excalidraw-local/
```

3. 在 Obsidian 设置里启用 `Mermaid to Excalidraw Local`。

### BRAT 安装

这是公测阶段推荐方式。安装 BRAT 后添加本仓库：

```text
https://github.com/413162826/obsidian-mermaid-to-excalidraw
```

## 使用

### 编辑模式

把光标放进 Mermaid 代码块，右键选择：

```text
Mermaid 转 Excalidraw
```

也可以从命令面板执行：

```text
转换当前 Mermaid 代码块为 Excalidraw
```

### 阅读/预览模式

在 Mermaid 渲染区域右键，选择：

```text
Mermaid 转 Excalidraw
```

插件会识别当前渲染区域对应的完整 Mermaid 代码块，不需要手动全选源码。

## 当前限制

- 目前主要验证了 flowchart 和 sequenceDiagram。
- 生成文件不会反向恢复 Mermaid 源码。
- 复杂图表的布局效果取决于 `@excalidraw/mermaid-to-excalidraw`。
- 预览模式右键依赖 Obsidian 渲染区域映射，少数第三方 Mermaid 美化插件可能需要额外兼容。

## 开发

```bash
npm install
npm test
npm run build
```

## 隐私

转换在本地完成。插件不会主动把 Mermaid 内容发送到远程服务。
