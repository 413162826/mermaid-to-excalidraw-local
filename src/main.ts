import {
  Editor,
  MarkdownPostProcessorContext,
  MarkdownView,
  Menu,
  Notice,
  Plugin,
  TFile,
  TFolder,
  normalizePath,
} from "obsidian";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import {
  buildEmbedLink,
  buildExcalidrawMarkdown,
  containsMermaidFence,
  findMermaidFence,
  findMermaidFenceByLineRange,
  isAlreadyExistsError,
  sanitizeFilePart,
} from "./core";

interface PluginSettings {
  generatedFolder: string;
  fontSize: number;
}

const DEFAULT_SETTINGS: PluginSettings = {
  generatedFolder: "Excalidraw/_generated/mermaid",
  fontSize: 22,
};

interface SelectionOffsets {
  start: number;
  end: number;
}

export default class MermaidToExcalidrawLocalPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;

  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };

    this.addCommand({
      id: "convert-current-mermaid-block",
      name: "转换当前 Mermaid 代码块为 Excalidraw",
      editorCheckCallback: (checking, editor, view) => {
        const block = this.getCurrentBlock(editor);
        if (!block) return false;
        if (!checking) this.convertEditorBlock(editor, view as MarkdownView);
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        if (!(view instanceof MarkdownView)) return;
        const block = this.getCurrentBlock(editor);
        if (!block) return;

        menu.addItem((item) => {
          item
            .setTitle("Mermaid 转 Excalidraw")
            .setIcon("pen-tool")
            .onClick(() => this.convertEditorBlock(editor, view));
        });
      }),
    );

    this.registerMarkdownPostProcessor(
      (element, context) => this.attachPreviewMenus(element, context),
      10000,
    );
  }

  private getSelectionOffsets(editor: Editor): SelectionOffsets {
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    return {
      start: editor.posToOffset(from),
      end: editor.posToOffset(to),
    };
  }

  private getCurrentBlock(editor: Editor) {
    const offsets = this.getSelectionOffsets(editor);
    return findMermaidFence(editor.getValue(), offsets.start, offsets.end);
  }

  private async convertEditorBlock(editor: Editor, view: MarkdownView) {
    const file = view.file;
    if (!(file instanceof TFile)) {
      new Notice("Mermaid 转 Excalidraw：当前没有 Markdown 文件。");
      return;
    }

    const block = this.getCurrentBlock(editor);
    if (!block) {
      new Notice("Mermaid 转 Excalidraw：请把光标放在 Mermaid 代码块内，或选中代码块。");
      return;
    }

    try {
      new Notice("Mermaid 转 Excalidraw：正在转换...");
      const drawingPath = await this.createDrawingFile(file, block.source);
      const embed = buildEmbedLink(drawingPath);
      editor.replaceRange(
        embed,
        editor.offsetToPos(block.startOffset),
        editor.offsetToPos(block.endOffset),
      );
      new Notice("Mermaid 转 Excalidraw：已转换。");
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Mermaid 转 Excalidraw：转换失败：${message}`, 8000);
    }
  }

  private attachPreviewMenus(
    element: HTMLElement,
    context: MarkdownPostProcessorContext,
  ) {
    const attach = () => this.attachPreviewMenusOnce(element, context);
    attach();

    const observer = new MutationObserver(attach);
    observer.observe(element, { childList: true, subtree: true });
    this.register(() => observer.disconnect());
  }

  private attachPreviewMenusOnce(
    element: HTMLElement,
    context: MarkdownPostProcessorContext,
  ) {
    this.attachPreviewSectionMenu(element, context);

    const candidates = this.getPreviewCandidates(element);
    for (const candidate of candidates) {
      this.attachPreviewMenuTarget(candidate, context, element);
    }
  }

  private attachPreviewSectionMenu(
    element: HTMLElement,
    context: MarkdownPostProcessorContext,
  ) {
    const sectionInfo = context.getSectionInfo(element);
    if (!sectionInfo || !containsMermaidFence(sectionInfo.text)) return;
    this.attachPreviewMenuTarget(element, context, element);
  }

  private attachPreviewMenuTarget(
    target: HTMLElement,
    context: MarkdownPostProcessorContext,
    fallback: HTMLElement,
  ) {
    if (target.dataset.mermaidToExcalidrawMenu === "true") return;
    const sectionInfo =
      context.getSectionInfo(target) ?? context.getSectionInfo(fallback);
    if (!sectionInfo || !containsMermaidFence(sectionInfo.text)) return;

    target.dataset.mermaidToExcalidrawMenu = "true";
    this.registerDomEvent(target, "contextmenu", (event) => {
      const currentSectionInfo =
        context.getSectionInfo(target) ?? context.getSectionInfo(fallback);
      if (!currentSectionInfo || !containsMermaidFence(currentSectionInfo.text)) return;

      event.preventDefault();
      event.stopPropagation();
      const menu = new Menu();
      menu.addItem((item) => {
        item
          .setTitle("Mermaid 转 Excalidraw")
          .setIcon("pen-tool")
          .onClick(() =>
            this.convertPreviewBlock(
              context.sourcePath,
              currentSectionInfo.lineStart,
              currentSectionInfo.lineEnd,
            ),
          );
      });
      menu.showAtMouseEvent(event);
    });
  }

  private getPreviewCandidates(element: HTMLElement) {
    const selectors = [
      ".mermaid",
      ".bd-block",
      ".beauty-diagram",
      ".beautiful-mermaid-block",
      "pre > code.language-mermaid",
      "svg[id^='mermaid']",
    ];
    const candidates = new Set<HTMLElement>();
    for (const selector of selectors) {
      if (element.matches(selector)) candidates.add(element);
      element
        .querySelectorAll(selector)
        .forEach((candidate) => {
          const htmlCandidate =
            candidate instanceof HTMLElement
              ? candidate
              : candidate.parentElement;
          if (htmlCandidate) candidates.add(htmlCandidate);
        });
    }
    return Array.from(candidates);
  }

  private async convertPreviewBlock(
    sourcePath: string,
    lineStart: number,
    lineEnd: number,
  ) {
    const file = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) {
      new Notice("Mermaid 转 Excalidraw：当前没有 Markdown 文件。");
      return;
    }

    try {
      const text = await this.app.vault.read(file);
      const block = findMermaidFenceByLineRange(text, lineStart, lineEnd);
      if (!block) {
        new Notice("Mermaid 转 Excalidraw：没有找到对应的 Mermaid 代码块。");
        return;
      }
      new Notice("Mermaid 转 Excalidraw：正在转换...");
      const drawingPath = await this.createDrawingFile(file, block.source);
      const embed = buildEmbedLink(drawingPath);
      await this.replacePreviewSource(file, text, block, embed);
      new Notice("Mermaid 转 Excalidraw：已转换。");
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Mermaid 转 Excalidraw：转换失败：${message}`, 8000);
    }
  }

  private async createDrawingFile(sourceFile: TFile, mermaidSource: string) {
    const parsed = await parseMermaidToExcalidraw(mermaidSource, {
      themeVariables: { fontSize: `${this.settings.fontSize}px` },
      flowchart: { curve: "linear" },
      maxTextSize: 50000,
      maxEdges: 1000,
    });
    const elements = convertToExcalidrawElements(parsed.elements);
    const scene = {
      type: "excalidraw",
      version: 2,
      source:
        "https://github.com/zsviczian/obsidian-excalidraw-plugin/releases/tag/2.20.6",
      elements,
      appState: {
        gridSize: null,
        viewBackgroundColor: "#ffffff",
        currentItemStrokeColor: "#1e1e1e",
        currentItemBackgroundColor: "transparent",
        currentItemFillStyle: "hachure",
        currentItemStrokeWidth: 2,
        currentItemStrokeStyle: "solid",
        currentItemRoughness: 1,
        currentItemOpacity: 100,
        currentItemFontFamily: 5,
        currentItemFontSize: this.settings.fontSize,
        currentItemTextAlign: "center",
        currentItemStartArrowhead: null,
        currentItemEndArrowhead: "arrow",
        scrollX: 240,
        scrollY: 40,
        zoom: { value: 0.75 },
      },
      files: parsed.files ?? {},
    };

    await this.ensureFolder(this.settings.generatedFolder);
    const targetPath = await this.getUniqueDrawingPath(sourceFile, mermaidSource);
    const markdown = buildExcalidrawMarkdown({ scene });
    await this.app.vault.create(targetPath, markdown);
    return targetPath;
  }

  private async replacePreviewSource(
    file: TFile,
    fileText: string,
    block: NonNullable<ReturnType<typeof findMermaidFenceByLineRange>>,
    embed: string,
  ) {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.file?.path === file.path) {
      const editor = activeView.editor;
      const editorText = editor.getValue();
      const editorBlock =
        findMermaidFence(editorText, block.startOffset, block.endOffset) ??
        findMermaidFence(editorText, block.sourceStartOffset, block.sourceEndOffset);

      if (editorBlock) {
        editor.replaceRange(
          embed,
          editor.offsetToPos(editorBlock.startOffset),
          editor.offsetToPos(editorBlock.endOffset),
        );
        return;
      }
    }

    const nextText =
      fileText.slice(0, block.startOffset) + embed + fileText.slice(block.endOffset);
    await this.app.vault.modify(file, nextText);
  }

  private async getUniqueDrawingPath(sourceFile: TFile, mermaidSource: string) {
    const folder = normalizePath(this.settings.generatedFolder);
    const baseName = sanitizeFilePart(sourceFile.basename) || "mermaid";
    const hash = hashText(mermaidSource).slice(0, 8);
    const basePath = `${folder}/${baseName}-${hash}.excalidraw.md`;
    if (!this.app.vault.getAbstractFileByPath(basePath)) return basePath;

    for (let index = 2; index < 1000; index += 1) {
      const candidate = `${folder}/${baseName}-${hash}-${index}.excalidraw.md`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }
    throw new Error("无法创建唯一的 Excalidraw 文件名。");
  }

  private async ensureFolder(folderPath: string) {
    const parts = normalizePath(folderPath).split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing) {
        if (!(existing instanceof TFolder)) {
          throw new Error(`生成目录路径被同名文件占用：${current}`);
        }
        continue;
      }

      try {
        await this.app.vault.createFolder(current);
      } catch (error) {
        if (!isAlreadyExistsError(error)) throw error;

        const afterCreate = this.app.vault.getAbstractFileByPath(current);
        if (afterCreate && !(afterCreate instanceof TFolder)) {
          throw new Error(`生成目录路径被同名文件占用：${current}`);
        }
      }
    }
  }
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
