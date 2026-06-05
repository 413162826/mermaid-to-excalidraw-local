import { describe, expect, test } from "vitest";
import {
  buildEmbedLink,
  buildExcalidrawMarkdown,
  containsMermaidFence,
  findMermaidFence,
  findMermaidFenceByLineRange,
  isAlreadyExistsError,
  sanitizeFilePart,
} from "../src/core";

describe("findMermaidFence", () => {
  test("finds the full mermaid fence around the cursor", () => {
    const note = [
      "# Note",
      "",
      "```mermaid",
      "flowchart TD",
      "  A --> B",
      "```",
      "",
      "tail",
    ].join("\n");
    const cursor = note.indexOf("A --> B");

    const block = findMermaidFence(note, cursor, cursor);

    expect(block).toMatchObject({
      language: "mermaid",
      source: "flowchart TD\n  A --> B",
    });
    expect(note.slice(block!.startOffset, block!.endOffset)).toBe(
      "```mermaid\nflowchart TD\n  A --> B\n```",
    );
  });

  test("returns null when selection is outside a mermaid fence", () => {
    const note = "plain text\n```js\nconsole.log(1)\n```";

    expect(findMermaidFence(note, 0, 4)).toBeNull();
  });

  test("finds a mermaid fence inside a preview section line range", () => {
    const note = [
      "# Note",
      "",
      "## Diagram",
      "",
      "```mermaid",
      "flowchart TD",
      "  A --> B",
      "```",
      "",
      "## Next",
    ].join("\n");

    const block = findMermaidFenceByLineRange(note, 2, 8);

    expect(block?.source).toBe("flowchart TD\n  A --> B");
    expect(note.slice(block!.startOffset, block!.endOffset)).toContain(
      "```mermaid",
    );
  });

  test("detects a mermaid fence inside preview section text", () => {
    const section = [
      "## Diagram",
      "",
      "~~~mermaid",
      "flowchart LR",
      "  A --> B",
      "~~~",
    ].join("\n");

    expect(containsMermaidFence(section)).toBe(true);
    expect(containsMermaidFence("## Plain section\n\nNo diagram here.")).toBe(
      false,
    );
  });
});

describe("generated paths and markdown", () => {
  test("sanitizes note names for generated drawing files", () => {
    expect(sanitizeFilePart("流程 / API: v1?")).toBe("流程 - API- v1");
  });

  test("builds an embed link that resolves to an excalidraw markdown file", () => {
    expect(
      buildEmbedLink(
        "Excalidraw/_generated/mermaid/流程-abc123.excalidraw.md",
      ),
    ).toBe("![[Excalidraw/_generated/mermaid/流程-abc123.excalidraw]]");
  });

  test("builds an Excalidraw markdown container with a drawing section", () => {
    const markdown = buildExcalidrawMarkdown({
      scene: {
        type: "excalidraw",
        version: 2,
        source: "test",
        elements: [{ id: "text-id", type: "text", text: "输入原始文章" }],
        appState: {},
        files: {},
      },
      tags: ["excalidraw", "mermaid-generated"],
    });

    expect(markdown).toContain("excalidraw-plugin: parsed");
    expect(markdown).toContain("输入原始文章 ^text-id");
    expect(markdown).toContain("## Drawing\n```json\n");
    expect(markdown).toContain("\n```\n%%");
  });

  test("recognizes already-exists folder errors as recoverable", () => {
    expect(isAlreadyExistsError(new Error("Folder already exists."))).toBe(true);
    expect(isAlreadyExistsError("folder already exists")).toBe(true);
    expect(isAlreadyExistsError(new Error("Permission denied"))).toBe(false);
  });
});
