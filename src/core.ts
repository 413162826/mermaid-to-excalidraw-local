export interface MermaidFence {
  startOffset: number;
  endOffset: number;
  sourceStartOffset: number;
  sourceEndOffset: number;
  language: string;
  source: string;
}

export interface TextLikeElement {
  id?: string;
  type?: string;
  text?: string;
}

export interface ExcalidrawMarkdownOptions {
  scene: Record<string, unknown> & { elements?: TextLikeElement[] };
  tags?: string[];
}

const MERMAID_LANGUAGES = new Set([
  "mermaid",
  "mmd",
  "mermaid-excalidraw",
  "mermind",
]);

interface LineInfo {
  text: string;
  start: number;
  end: number;
  endWithBreak: number;
}

function splitLines(source: string): LineInfo[] {
  const lines: LineInfo[] = [];
  const pattern = /.*(?:\r\n|\n|\r|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const value = match[0];
    if (!value) break;
    const endWithBreak = match.index + value.length;
    const text = value.replace(/\r?\n|\r$/, "");
    lines.push({
      text,
      start: match.index,
      end: match.index + text.length,
      endWithBreak,
    });
  }
  return lines;
}

function getFenceMatch(line: string) {
  return line.match(/^(\s*)(`{3,}|~{3,})\s*([A-Za-z0-9_-]+)?[^\n\r]*$/);
}

export function findMermaidFence(
  source: string,
  selectionStart: number,
  selectionEnd: number,
): MermaidFence | null {
  const from = Math.min(selectionStart, selectionEnd);
  const to = Math.max(selectionStart, selectionEnd);
  const lines = splitLines(source);
  let open:
    | {
        line: LineInfo;
        marker: string;
        language: string;
      }
    | null = null;

  for (const line of lines) {
    const match = getFenceMatch(line.text);
    if (!open) {
      const language = match?.[3]?.toLowerCase();
      if (match && language && MERMAID_LANGUAGES.has(language)) {
        open = { line, marker: match[2], language };
      }
      continue;
    }

    if (!match || match[2][0] !== open.marker[0]) continue;

    const blockStart = open.line.start;
    const blockEnd = line.end;
    const intersects =
      (from >= blockStart && from <= blockEnd) ||
      (to >= blockStart && to <= blockEnd) ||
      (from <= blockStart && to >= blockEnd);

    if (intersects) {
      const sourceStart = open.line.endWithBreak;
      const sourceEnd = line.start;
      return {
        startOffset: blockStart,
        endOffset: blockEnd,
        sourceStartOffset: sourceStart,
        sourceEndOffset: sourceEnd,
        language: open.language,
        source: source.slice(sourceStart, sourceEnd).replace(/\r?\n$/, ""),
      };
    }
    open = null;
  }

  return null;
}

export function findMermaidFenceByLineRange(
  source: string,
  lineStart: number,
  lineEnd: number,
): MermaidFence | null {
  const lines = splitLines(source);
  const startLine = Math.max(0, lineStart);
  const endLine = Math.max(startLine, lineEnd);
  const rangeStart = lines[startLine]?.start ?? 0;
  const rangeEnd =
    lines[Math.min(endLine, lines.length - 1)]?.endWithBreak ?? source.length;

  return findMermaidFence(source, rangeStart, rangeEnd);
}

export function containsMermaidFence(source: string): boolean {
  return findMermaidFence(source, 0, source.length) !== null;
}

export function sanitizeFilePart(value: string): string {
  return value
    .replace(/[\\/]+/g, " - ")
    .replace(/[:*"<>\|]+/g, "-")
    .replace(/[?]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+-\s+/g, " - ")
    .replace(/-+/g, "-")
    .trim()
    .replace(/[. ]+$/g, "");
}

export function buildEmbedLink(markdownPath: string): string {
  const linkPath = markdownPath.replace(/\.md$/i, "");
  return `![[${linkPath}]]`;
}

export function isAlreadyExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists|exists already|EEXIST/i.test(message);
}

function buildTextElements(elements: TextLikeElement[] = []): string {
  return elements
    .filter((element) => element.type === "text" && element.text && element.id)
    .map((element) => `${element.text} ^${element.id}`)
    .join("\n\n");
}

export function buildExcalidrawMarkdown({
  scene,
  tags = ["excalidraw", "mermaid-generated"],
}: ExcalidrawMarkdownOptions): string {
  const tagText = tags.join(", ");
  const textElements = buildTextElements(scene.elements);
  const sceneJson = JSON.stringify(scene, null, 2);
  return `---
excalidraw-plugin: parsed
tags: [${tagText}]
---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==

# Excalidraw Data

## Text Elements
${textElements}
%%

## Drawing
\`\`\`json
${sceneJson}
\`\`\`
%%
`;
}
