/*
此文件由 esbuild 打包生成，请勿直接修改。
源码见 src/ 目录；构建命令：npm run build（开发监听：npm run dev）。
*/

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  columnsExtension: () => columnsExtension,
  columnsField: () => columnsField,
  default: () => BlockEditorPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian10 = require("obsidian");

// src/util.ts
function getCM(editor) {
  const cm = editor.cm;
  return cm != null ? cm : null;
}
function getIndent(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1] : "";
}
function getLines(editor, start, end) {
  const lines = [];
  for (let i = start; i <= end; i++) lines.push(editor.getLine(i));
  return lines;
}
function shiftIndent(line, delta) {
  if (line.trim() === "") return line;
  if (delta > 0) return " ".repeat(delta) + line;
  const cur = (line.match(/^(\s*)/) || ["", ""])[1].length;
  return " ".repeat(Math.max(cur + delta, 0)) + line.slice(cur);
}
function getEditorFromContent(app, cmContent) {
  var _a, _b;
  const cmEditor = cmContent.closest(".cm-editor");
  if (!cmEditor) return null;
  const active = app.workspace.activeEditor;
  if (active == null ? void 0 : active.editor) {
    const editor = active.editor;
    const cm = getCM(editor);
    if (cm && cm.dom === cmEditor) {
      return { editor, file: (_a = active.file) != null ? _a : app.workspace.getActiveFile() };
    }
  }
  const leaves = app.workspace.getLeavesOfType("markdown");
  for (const leaf of leaves) {
    const view = leaf.view;
    const editor = view == null ? void 0 : view.editor;
    if (!editor) continue;
    const cm = getCM(editor);
    if (cm && cm.dom === cmEditor) return { editor, file: (_b = view == null ? void 0 : view.file) != null ? _b : null };
  }
  return null;
}

// src/block-detect.ts
var BlockDetector = class {
  constructor() {
    this.scanCache = null;
  }
  // 单次遍历收集「围栏代码块 / 公式块 / 表格 / 属性区范围」。
  // CM6 文档不可变，可直接用对象身份做缓存键：改一个字就换对象，缓存自动失效
  getScan(editor) {
    const cm = getCM(editor);
    if (!cm) return { list: [], fmEnd: -1 };
    const doc = cm.state.doc;
    if (this.scanCache && this.scanCache.doc === doc) return this.scanCache;
    const list = [];
    const total = editor.lineCount();
    let fenceStart = -1;
    let fenceChar = null;
    let mathStart = -1;
    let tableStart = -1;
    let fmEnd = -1;
    if (/^---\s*$/.test(editor.getLine(0))) {
      const limit = Math.min(total, 500);
      for (let i = 1; i < limit; i++) {
        if (/^---\s*$/.test(editor.getLine(i))) {
          fmEnd = i;
          break;
        }
      }
    }
    for (let i = 0; i < total; i++) {
      const text = editor.getLine(i);
      if (fenceStart !== -1) {
        const m = text.match(/^\s*(`{3,}|~{3,})/);
        if (m && m[1][0] === fenceChar) {
          list.push({ start: fenceStart, end: i, type: "code" });
          fenceStart = -1;
          fenceChar = null;
        }
        continue;
      }
      if (mathStart !== -1) {
        if (/^\s*\$\$\s*$/.test(text)) {
          list.push({ start: mathStart, end: i, type: "math" });
          mathStart = -1;
        }
        continue;
      }
      if (tableStart !== -1 && !/^\s*\|/.test(text)) {
        list.push({ start: tableStart, end: i - 1, type: "table" });
        tableStart = -1;
      }
      const fence = text.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {
        fenceStart = i;
        fenceChar = fence[1][0];
      } else if (/^\s*\$\$\s*$/.test(text)) {
        mathStart = i;
      } else if (/^\s*\|/.test(text) && tableStart === -1) {
        tableStart = i;
      }
    }
    if (fenceStart !== -1) list.push({ start: fenceStart, end: total - 1, type: "code" });
    if (mathStart !== -1) list.push({ start: mathStart, end: total - 1, type: "math" });
    if (tableStart !== -1) list.push({ start: tableStart, end: total - 1, type: "table" });
    this.scanCache = { doc, list, fmEnd };
    return this.scanCache;
  }
  getContainers(editor) {
    return this.getScan(editor).list;
  }
  getFrontmatterEnd(editor) {
    return this.getScan(editor).fmEnd;
  }
  findContainerAt(editor, lineIndex) {
    for (const c of this.getContainers(editor)) {
      if (lineIndex >= c.start && lineIndex <= c.end) return c;
    }
    return null;
  }
  // 该行之前最后一个「大块」的结束行 + 1，用来防止向上回溯时跨过代码块
  getFloorLine(editor, lineIndex) {
    let floor = 0;
    for (const c of this.getContainers(editor)) {
      if (c.end < lineIndex) floor = Math.max(floor, c.end + 1);
    }
    return floor;
  }
  getBlockAtLine(editor, lineIndex) {
    const total = editor.lineCount();
    if (lineIndex < 0 || lineIndex >= total) return null;
    const fmEnd = this.getFrontmatterEnd(editor);
    if (fmEnd !== -1 && lineIndex <= fmEnd) return null;
    const container = this.findContainerAt(editor, lineIndex);
    if (container) return container;
    const line = editor.getLine(lineIndex);
    if (line.trim() === "") return { start: lineIndex, end: lineIndex, type: "empty" };
    const heading = line.match(/^(\s*)(#{1,6})\s/);
    if (heading) {
      const level = heading[2].length;
      let end = lineIndex;
      for (let i = lineIndex + 1; i < total; i++) {
        const m = editor.getLine(i).match(/^(\s*)(#{1,6})\s/);
        if (m && m[2].length <= level) break;
        end = i;
      }
      while (end > lineIndex && editor.getLine(end).trim() === "") end--;
      return { start: lineIndex, end, type: "heading" };
    }
    if (/^\s*>/.test(line)) {
      const floor = this.getFloorLine(editor, lineIndex);
      let start = lineIndex;
      while (start > floor && /^\s*>/.test(editor.getLine(start - 1))) start--;
      let end = lineIndex;
      for (let i = lineIndex + 1; i < total; i++) {
        if (/^\s*>/.test(editor.getLine(i))) end = i;
        else break;
      }
      const type = /^\s*>\s*\[!/.test(editor.getLine(start)) ? "callout" : "quote";
      return { start, end, type };
    }
    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+/);
    if (listMatch) {
      const indent = listMatch[1].length;
      let end = lineIndex;
      for (let i = lineIndex + 1; i < total; i++) {
        const l = editor.getLine(i);
        if (l.trim() === "") break;
        const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (ind > indent) end = i;
        else break;
      }
      return { start: lineIndex, end, type: "list" };
    }
    return { start: lineIndex, end: lineIndex, type: "line" };
  }
};

// src/selection.ts
var SelectionManager = class {
  constructor(ctx) {
    this.ctx = ctx;
    this.selection = null;
    this.layerEl = null;
  }
  init() {
    const layer = document.createElement("div");
    layer.className = "block-editor-selection-layer";
    document.body.appendChild(layer);
    this.layerEl = layer;
  }
  destroy() {
    var _a;
    (_a = this.layerEl) == null ? void 0 : _a.remove();
    this.layerEl = null;
    this.selection = null;
  }
  // 当前块参与了多选就返回整个选区，否则只返回自己
  actionRanges(block) {
    const sel = this.selection;
    if (sel && this.isInSelection(block) && sel.ranges.length > 0) return sel.ranges;
    return [{ start: block.start, end: block.end, type: block.type }];
  }
  isInSelection(block) {
    if (!this.selection || this.selection.editor !== block.editor) return false;
    return this.selection.ranges.some((r) => block.start <= r.end && block.end >= r.start);
  }
  toggleSelection(block) {
    if (!this.selection || this.selection.editor !== block.editor) {
      this.selection = { editor: block.editor, file: block.file, ranges: [] };
    }
    const ranges = this.selection.ranges;
    const idx = ranges.findIndex((r) => r.start === block.start && r.end === block.end);
    if (idx >= 0) ranges.splice(idx, 1);
    else ranges.push({ start: block.start, end: block.end, type: block.type });
    ranges.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
      else merged.push({ start: r.start, end: r.end, type: r.type });
    }
    this.selection.ranges = merged;
    if (!merged.length) this.clearSelection();
    else this.renderSelection();
  }
  clearSelection() {
    this.selection = null;
    this.renderSelection();
  }
  renderSelection() {
    const layer = this.layerEl;
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    const sel = this.selection;
    if (!sel) return;
    const cm = getCM(sel.editor);
    if (!cm) return;
    const doc = cm.state.doc;
    const cmRect = cm.dom.getBoundingClientRect();
    for (const r of sel.ranges) {
      if (r.start >= doc.lines || r.end >= doc.lines) continue;
      const from = cm.coordsAtPos(doc.line(r.start + 1).from);
      const below = doc.line(r.end + 1);
      const to = cm.coordsAtPos(below.to);
      if (!from || !to) continue;
      const box = document.createElement("div");
      box.className = "block-editor-selection";
      box.style.top = from.top + "px";
      box.style.height = Math.max(to.bottom - from.top, 4) + "px";
      box.style.left = cmRect.left + "px";
      box.style.width = cmRect.width + "px";
      layer.appendChild(box);
    }
  }
};

// src/convert.ts
var import_obsidian = require("obsidian");
var COL_START_RE = /^>\s*\[!multi-column(?:\|[^\]]*)?\]\s*$/;
var COL_SEP_RE = /^>\s*$/;
function buildColumnsMarkdown(segments, widths, bgs) {
  const n = segments.length;
  const head = widths && widths.length === n && widths.some((w) => Math.abs(w - 100 / n) > 0.5) ? `> [!multi-column|${widths.map((w) => Math.round(w)).join("-")}]` : "> [!multi-column]";
  const out = [head, ">"];
  segments.forEach((seg, i) => {
    if (i > 0) out.push(">");
    const bg = bgs == null ? void 0 : bgs[i];
    out.push(bg ? `>> [!col|bg=${bg}]` : ">> [!col]");
    for (const line of seg.split("\n")) out.push(line.trim() === "" ? ">>" : ">> " + line);
  });
  return out.join("\n");
}
var BlockConverter = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  stripBlockPrefix(text) {
    return text.replace(
      /^(#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s+(?:\[![\w-]+\][+-]?\s*)?)/,
      ""
    );
  }
  convertBlock(editor, block, type, lang = "") {
    const start = block.start;
    const src = block.type;
    const total = editor.lineCount();
    if (src === type && ["code", "table", "math"].includes(type)) {
      if (type === "code") {
        const line2 = editor.getLine(start);
        editor.setLine(start, line2.replace(/^(\s*(?:`{3,}|~{3,}))\s*\S*/, "$1" + lang));
      }
      return;
    }
    if (src === "code" || src === "math" || src === "table") {
      const end = Math.min(block.end, total - 1);
      const inner = src === "table" ? this.tableToText(editor, start, end) : getLines(editor, start + 1, end - 1).join("\n");
      editor.replaceRange(
        this.applyWrapOrPrefix(inner, type, lang),
        { line: start, ch: 0 },
        { line: end, ch: editor.getLine(end).length }
      );
      return;
    }
    const wraps = {
      code: ["```" + lang, "```"],
      mermaid: ["```mermaid", "```"],
      math: ["$$", "$$"]
    };
    const wrap = wraps[type];
    if (wrap) {
      editor.replaceRange(
        [wrap[0], this.readContent(editor, start), wrap[1]].join("\n"),
        { line: start, ch: 0 },
        { line: start, ch: editor.getLine(start).length }
      );
      return;
    }
    if (type === "table") {
      editor.replaceRange(
        [
          "| \u5217 1 | \u5217 2 |",
          "| --- | --- |",
          "| " + this.readContent(editor, start) + " |  |"
        ].join("\n"),
        { line: start, ch: 0 },
        { line: start, ch: editor.getLine(start).length }
      );
      return;
    }
    if (type === "divider") {
      editor.replaceRange(
        "---",
        { line: start, ch: 0 },
        { line: start, ch: editor.getLine(start).length }
      );
      return;
    }
    const prefixes = {
      paragraph: "",
      h1: "# ",
      h2: "## ",
      h3: "### ",
      h4: "#### ",
      h5: "##### ",
      h6: "###### ",
      ul: "- ",
      ol: "1. ",
      todo: "- [ ] ",
      quote: "> ",
      toggle: "> [!note]- "
    };
    const prefix = type === "callout" ? "> [!" + (lang || "note") + "] " : prefixes[type];
    if (prefix === void 0) return;
    const line = editor.getLine(start);
    const newLine = getIndent(line) + prefix + this.readContent(editor, start);
    if (newLine !== line) editor.setLine(start, newLine);
  }
  // 多选批量转换：自下而上逐块应用，避免行号失效
  convertRanges(editor, ranges, type, lang = "") {
    const sorted = [...ranges].sort((a, b) => b.start - a.start);
    for (const r of sorted) this.convertBlock(editor, r, type, lang);
  }
  // 把表格压成一行文字：丢掉分隔行，单元格用空格连起来
  tableToText(editor, start, end) {
    const cells = [];
    for (let i = start; i <= end; i++) {
      const line = editor.getLine(i);
      if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)) continue;
      for (const cell of line.split("|")) {
        const v = cell.trim();
        if (v) cells.push(v);
      }
    }
    return cells.join(" ");
  }
  // 拆壳后的多行 inner 按目标类型整体重排：包壳 / 前缀应用到全部行，
  // 避免代码块 / 公式块 / 表格转换时只有首行被处理、其余行悬空
  applyWrapOrPrefix(inner, type, lang) {
    if (type === "code") return "```" + lang + "\n" + inner + "\n```";
    if (type === "mermaid") return "```mermaid\n" + inner + "\n```";
    if (type === "math") return "$$\n" + inner + "\n$$";
    if (type === "divider") return "---";
    if (type === "table") {
      const body = inner.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => "| " + l + " |").join("\n");
      return "| \u5217 1 | \u5217 2 |\n| --- | --- |\n" + body;
    }
    const lines = inner.split("\n");
    const rest = lines.slice(1);
    switch (type) {
      case "paragraph":
        return inner;
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        return "#".repeat(Number(type[1])) + " " + lines[0] + (rest.length ? "\n" + rest.join("\n") : "");
      case "ul":
        return lines.map((l) => "- " + l).join("\n");
      case "ol":
        return lines.map((l, i) => i + 1 + ". " + l).join("\n");
      case "todo":
        return lines.map((l) => "- [ ] " + l).join("\n");
      case "quote":
        return lines.map((l) => "> " + l).join("\n");
      case "callout":
        return "> [!" + (lang || "note") + "] " + lines[0] + (rest.length ? "\n" + rest.map((l) => "> " + l).join("\n") : "");
      case "toggle":
        return "> [!note]- " + lines[0] + (rest.length ? "\n" + rest.map((l) => "> " + l).join("\n") : "");
      default:
        return inner;
    }
  }
  // 光标所在块直接转换（命令面板用，不依赖手柄）
  convertCurrentBlock(editor, type) {
    const cursor = editor.getCursor();
    const block = this.ctx.detector.getBlockAtLine(editor, cursor.line);
    if (!block) {
      new import_obsidian.Notice("\u8FD9\u4E00\u884C\u4E0D\u652F\u6301\u8F6C\u6362");
      return;
    }
    const ctxBlock = { editor, file: null, start: block.start, end: block.end, type: block.type };
    this.convertBlock(editor, ctxBlock, type);
  }
  // 取块首行内容（去掉缩进与块前缀）
  readContent(editor, lineIndex) {
    const line = editor.getLine(lineIndex);
    return this.stripBlockPrefix(line.slice(getIndent(line).length));
  }
  detectType(line) {
    const s = line.replace(/^\s*/, "");
    if (/^#\s/.test(s)) return "h1";
    if (/^##\s/.test(s)) return "h2";
    if (/^###\s/.test(s)) return "h3";
    if (/^####\s/.test(s)) return "h4";
    if (/^#####\s/.test(s)) return "h5";
    if (/^######\s/.test(s)) return "h6";
    if (/^[-*+]\s+\[[ xX]\]\s/.test(s)) return "todo";
    if (/^[-*+]\s/.test(s)) return "ul";
    if (/^\d+[.)]\s/.test(s)) return "ol";
    if (/^>\s*\[![\w-]+\][+-]?\s/.test(s)) {
      return /^>\s*\[![\w-]+\]-\s/.test(s) ? "toggle" : "callout";
    }
    if (/^>\s?/.test(s)) return "quote";
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(s)) return "divider";
    return "paragraph";
  }
  getFenceLang(block) {
    const line = block.editor.getLine(block.start);
    const match = line.match(/^\s*(?:`{3,}|~{3,})(.*)$/);
    return match ? match[1].trim() : "";
  }
  // ---- 分栏（multi-column callout）----
  // 块是否为分栏容器
  isColumnsBlock(editor, block) {
    return COL_START_RE.test(editor.getLine(block.start));
  }
  // 块是否位于某个分栏区间内部（首行不是外壳标记本身，但向上能回溯到外壳）。
  // 用于防止对分栏内部内容执行「添加分栏 / 组合为分栏」时截断原分栏结构。
  insideColumns(editor, block) {
    if (this.isColumnsBlock(editor, block)) return false;
    for (let i = block.start; i >= 0; i--) {
      const line = editor.getLine(i);
      if (COL_START_RE.test(line)) return true;
      if (!/^\s*>/.test(line)) return false;
    }
    return false;
  }
  // 组合分栏前预览可切段数（区间按空行切段，每段一栏；≥2 才有意义）。
  // 代码围栏 / 数学块内部的空行不算切段点。
  columnsSegmentCount(block) {
    const editor = block.editor;
    const ranges = this.ctx.selection.actionRanges(block);
    const start = Math.min(...ranges.map((r) => r.start));
    const end = Math.max(...ranges.map((r) => r.end));
    let count = 0;
    let inSeg = false;
    let fenceCh = null;
    for (let i = start; i <= end; i++) {
      const line = editor.getLine(i);
      if (fenceCh !== null) {
        const m = line.match(/^\s*(`{3,}|~{3,})/);
        if (m && m[1][0] === fenceCh) fenceCh = null;
        continue;
      }
      const f = line.match(/^\s*(`{3,}|~{3,})/);
      if (f) {
        fenceCh = f[1][0];
        if (!inSeg) {
          count++;
          inSeg = true;
        }
        continue;
      }
      if (line.trim() === "") {
        inSeg = false;
        continue;
      }
      if (!inSeg) {
        count++;
        inSeg = true;
      }
    }
    return count;
  }
  // 组合为分栏：区间整体按空行切段，每段包成一栏（单步撤销）。
  // 代码围栏 / 数学块内部的空行不切段，避免多行代码块被拆散。
  wrapBlockToColumns(block) {
    const editor = block.editor;
    const ranges = this.ctx.selection.actionRanges(block).slice().sort((a, b) => a.start - b.start);
    const start = ranges[0].start;
    const end = ranges[ranges.length - 1].end;
    const segments = [];
    let cur = [];
    let fenceCh = null;
    for (const line of getLines(editor, start, end)) {
      if (fenceCh !== null) {
        cur.push(line);
        const m = line.match(/^\s*(`{3,}|~{3,})/);
        if (m && m[1][0] === fenceCh) fenceCh = null;
        continue;
      }
      const f = line.match(/^\s*(`{3,}|~{3,})/);
      if (f) {
        fenceCh = f[1][0];
        cur.push(line);
        continue;
      }
      if (line.trim() === "") {
        if (cur.length) segments.push(cur);
        cur = [];
      } else {
        cur.push(line);
      }
    }
    if (cur.length) segments.push(cur);
    if (segments.length < 2) {
      new import_obsidian.Notice("\u7EC4\u5408\u4E3A\u5206\u680F\u81F3\u5C11\u9700\u8981\u4E24\u4E2A\u6BB5\u843D\u5757\uFF08\u7528\u7A7A\u884C\u5206\u9694\uFF09");
      return;
    }
    const out = buildColumnsMarkdown(segments.map((seg) => seg.join("\n")));
    const total = editor.lineCount();
    const prefix = start > 0 && editor.getLine(start - 1).trim() !== "" ? [""] : [];
    const suffix = end < total - 1 && editor.getLine(end + 1).trim() !== "" ? [""] : [];
    const text = [...prefix, ...out.split("\n"), ...suffix].join("\n");
    editor.replaceRange(
      text,
      { line: start, ch: 0 },
      { line: end, ch: editor.getLine(end).length }
    );
    this.ctx.handle.hideHandle();
  }
  // 取消分栏：剥掉外壳与栏标记，还原为普通块（单步撤销）
  unwrapColumns(block) {
    const editor = block.editor;
    if (!this.isColumnsBlock(editor, block)) {
      new import_obsidian.Notice("\u5F53\u524D\u5757\u4E0D\u662F\u5206\u680F");
      return;
    }
    const columns = [];
    let cur = null;
    const lines = getLines(editor, block.start, block.end);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0 && COL_START_RE.test(line)) continue;
      if (COL_SEP_RE.test(line)) {
        if (cur && cur.length) {
          columns.push(cur);
          cur = null;
        }
        continue;
      }
      if (/^>\s*>\s*\[!col(?:\|[^\]]*)?\]/.test(line)) {
        if (cur && cur.length) columns.push(cur);
        cur = [];
        continue;
      }
      const m = line.match(/^>\s*>\s?(.*)$/);
      if (m) {
        if (!cur) cur = [];
        cur.push(m[1]);
      }
    }
    if (cur && cur.length) columns.push(cur);
    const parts = columns.map((c) => {
      while (c.length && c[c.length - 1].trim() === "") c.pop();
      return c.join("\n");
    }).filter((s) => s.length > 0);
    if (!parts.length) {
      new import_obsidian.Notice("\u6CA1\u6709\u53EF\u8FD8\u539F\u7684\u680F\u5185\u5BB9");
      return;
    }
    editor.replaceRange(
      parts.join("\n\n"),
      { line: block.start, ch: 0 },
      { line: block.end, ch: editor.getLine(block.end).length }
    );
    this.ctx.handle.hideHandle();
  }
  // 在分栏末尾追加一个空栏，光标落入新栏内容行
  addColumn(block) {
    const editor = block.editor;
    editor.replaceRange("\n>\n>> [!col]\n>>", {
      line: block.end,
      ch: editor.getLine(block.end).length
    });
    editor.setCursor({ line: block.end + 3, ch: 2 });
    editor.focus();
    this.ctx.handle.hideHandle();
  }
  // 在当前块下方插入一个两栏空分栏空壳，光标落入第一栏内容行
  addEmptyColumns(block) {
    const editor = block.editor;
    const hasNext = block.end + 1 < editor.lineCount();
    const nextLine = hasNext ? editor.getLine(block.end + 1) : "";
    const suffix = hasNext && nextLine.trim() !== "" ? "\n" : "";
    editor.replaceRange(
      "\n> [!multi-column]\n>\n>> [!col]\n>>\n>\n>> [!col]\n>>" + suffix,
      { line: block.end, ch: editor.getLine(block.end).length }
    );
    editor.setCursor({ line: block.end + 4, ch: 2 });
    editor.focus();
    this.ctx.handle.hideHandle();
  }
};

// src/block-id.ts
var import_obsidian3 = require("obsidian");

// src/constants.ts
var HANDLE_W = 20;
var HANDLE_H = 20;
var TURN_INTO = [
  ["paragraph", "\u6B63\u6587"],
  ["h1", "\u6807\u9898 1"],
  ["h2", "\u6807\u9898 2"],
  ["h3", "\u6807\u9898 3"],
  ["h4", "\u6807\u9898 4"],
  ["h5", "\u6807\u9898 5"],
  ["h6", "\u6807\u9898 6"],
  ["ul", "\u65E0\u5E8F\u5217\u8868"],
  ["ol", "\u6709\u5E8F\u5217\u8868"],
  ["todo", "\u5F85\u529E\u6E05\u5355"],
  ["quote", "\u5F15\u7528"],
  ["callout", "Callout"],
  ["toggle", "\u6298\u53E0\u5757"],
  ["code", "\u4EE3\u7801\u5757"],
  ["mermaid", "Mermaid \u56FE"],
  ["math", "\u6570\u5B66\u516C\u5F0F"],
  ["table", "\u8868\u683C"],
  ["divider", "\u5206\u5272\u7EBF"]
];
var ID_WORDS = [
  "amber",
  "anchor",
  "arbor",
  "aspen",
  "autumn",
  "bamboo",
  "beacon",
  "birch",
  "bloom",
  "breeze",
  "brook",
  "candle",
  "canyon",
  "cedar",
  "cherry",
  "cinder",
  "clover",
  "coral",
  "cotton",
  "dawn",
  "delta",
  "drizzle",
  "dusk",
  "ember",
  "falcon",
  "fable",
  "fern",
  "flint",
  "forest",
  "frost",
  "garden",
  "glacier",
  "harbor",
  "harvest",
  "hazel",
  "hollow",
  "honey",
  "indigo",
  "ivory",
  "jade",
  "lantern",
  "linden",
  "meadow",
  "meteor",
  "mirror",
  "mist",
  "nectar",
  "north",
  "orchid",
  "pebble",
  "pepper",
  "pine",
  "pond",
  "poppy",
  "quartz",
  "quill",
  "raven",
  "ribbon",
  "river",
  "saffron",
  "shadow",
  "shell",
  "silver",
  "snow",
  "spark",
  "spring",
  "stone",
  "storm",
  "summit",
  "sunset",
  "thistle",
  "tide",
  "timber",
  "valley",
  "velvet",
  "violet",
  "walnut",
  "willow",
  "winter",
  "zephyr"
];
var CALLOUT_TYPES = [
  ["note", "\u5907\u6CE8"],
  ["abstract", "\u6458\u8981"],
  ["todo", "\u5F85\u529E"],
  ["tip", "\u63D0\u793A"],
  ["success", "\u6210\u529F"],
  ["question", "\u95EE\u9898"],
  ["warning", "\u8B66\u544A"],
  ["failure", "\u5931\u8D25"],
  ["danger", "\u5371\u9669"],
  ["bug", "\u7F3A\u9677"],
  ["example", "\u793A\u4F8B"],
  ["quote", "\u5F15\u7528"]
];
var CODE_LANGS = [
  ["", "\u7EAF\u6587\u672C"],
  ["js", "JavaScript"],
  ["ts", "TypeScript"],
  ["python", "Python"],
  ["java", "Java"],
  ["c", "C / C++"],
  ["go", "Go"],
  ["rust", "Rust"],
  ["sql", "SQL"],
  ["bash", "Bash"],
  ["json", "JSON"],
  ["yaml", "YAML"],
  ["html", "HTML"],
  ["css", "CSS"],
  ["mermaid", "Mermaid"]
];

// src/modal.ts
var import_obsidian2 = require("obsidian");
var ConfirmModal = class extends import_obsidian2.Modal {
  constructor(app, title, message, confirmText, onConfirm) {
    super(app);
    this.message = message;
    this.confirmText = confirmText;
    this.onConfirm = onConfirm;
    this.titleEl.setText(title);
  }
  onOpen() {
    this.contentEl.createEl("p", { text: this.message });
    const row = this.contentEl.createDiv("modal-button-container");
    const cancel = row.createEl("button", { text: "\u53D6\u6D88" });
    cancel.addEventListener("click", () => this.close());
    const ok = row.createEl("button", { text: this.confirmText, cls: "mod-warning" });
    ok.addEventListener("click", () => {
      this.close();
      this.onConfirm();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/block-id.ts
var BlockIdService = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  copyBlockLink(block) {
    if (!block.file) {
      new import_obsidian3.Notice("\u65E0\u6CD5\u5B9A\u4F4D\u5F53\u524D\u6587\u4EF6");
      return;
    }
    const id = this.ensureBlockId(block);
    navigator.clipboard.writeText(`[[${block.file.basename}#^${id}]]`).then(() => new import_obsidian3.Notice(`\u5DF2\u590D\u5236\u5757\u94FE\u63A5 #^${id}`));
    this.ctx.handle.hideHandle();
  }
  ensureBlockId(block) {
    const existing = this.findBlockId(block);
    if (existing) return existing;
    const id = this.generateBlockId(block.editor);
    this.attachBlockId(block, id);
    return id;
  }
  // 结构化块的 ID 必须单独成行，挂在末行会被当成块内容（代码块还会因此少一个闭合围栏）
  needsOwnLine(block) {
    switch (block.type) {
      case "line":
      case "empty":
      case "heading":
        return false;
      case "list":
      case "quote":
        return block.start !== block.end;
      default:
        return true;
    }
  }
  findBlockId(block) {
    const { editor, end } = block;
    if (!this.needsOwnLine(block)) {
      const m2 = editor.getLine(end).match(/\s\^([A-Za-z0-9-]+)\s*$/);
      return m2 ? m2[1] : null;
    }
    const line = this.findOwnLineIdLine(editor, end);
    if (line === null) return null;
    const m = editor.getLine(line).match(/^\s*\^([A-Za-z0-9-]+)\s*$/);
    return m ? m[1] : null;
  }
  // 结构化块的 ID 独立成行时，返回该行行号（紧跟块后或隔一个空行），没有则 null
  findOwnLineIdLine(editor, end) {
    const last = Math.min(editor.lineCount() - 1, end + 2);
    for (let i = end + 1; i <= last; i++) {
      const line = editor.getLine(i);
      const m = line.match(/^\s*\^([A-Za-z0-9-]+)\s*$/);
      if (m) return i;
      if (line.trim() !== "") break;
    }
    return null;
  }
  attachBlockId(block, id) {
    const { editor, end } = block;
    if (!this.needsOwnLine(block)) {
      editor.setLine(end, editor.getLine(end).replace(/\s*$/, "") + " ^" + id);
      return;
    }
    editor.replaceRange("\n\n^" + id + "\n", {
      line: end,
      ch: editor.getLine(end).length
    });
  }
  // 词表 + 序号，避开本文已有 ID
  generateBlockId(editor) {
    const used = /* @__PURE__ */ new Set();
    for (let i = 0; i < editor.lineCount(); i++) {
      const hits = editor.getLine(i).match(/\^([A-Za-z0-9-]+)/g);
      if (hits) for (const hit of hits) used.add(hit.slice(1));
    }
    for (let i = 0; i < 200; i++) {
      const word = ID_WORDS[Math.floor(Math.random() * ID_WORDS.length)];
      const id = `${word}-${1 + Math.floor(Math.random() * 99)}`;
      if (!used.has(id)) return id;
    }
    return "block-" + Math.random().toString(36).slice(2, 8);
  }
  // 光标所在块的链接（命令面板用，不依赖手柄）
  copyCurrentBlockLink(editor) {
    const cursor = editor.getCursor();
    const block = this.ctx.detector.getBlockAtLine(editor, cursor.line);
    if (!block) {
      new import_obsidian3.Notice("\u8FD9\u4E00\u884C\u6CA1\u6709\u53EF\u64CD\u4F5C\u7684\u5757");
      return;
    }
    this.copyBlockLink({
      editor,
      file: this.ctx.app.workspace.getActiveFile(),
      start: block.start,
      end: block.end,
      type: block.type
    });
  }
  // 清掉全文的块 ID（独立成行的和句尾的），破坏性操作先确认
  clearBlockIds(editor) {
    let removed = 0;
    for (let i = 0; i < editor.lineCount(); i++) {
      const line = editor.getLine(i);
      if (/^\s*\^[A-Za-z0-9-]+\s*$/.test(line)) removed++;
      else if (/\s\^[A-Za-z0-9-]+\s*$/.test(line)) removed++;
    }
    if (!removed) {
      new import_obsidian3.Notice("\u672C\u6587\u6CA1\u6709\u5757 ID");
      return;
    }
    new ConfirmModal(
      this.ctx.app,
      "\u6E05\u9664\u5757 ID",
      `\u5C06\u4ECE\u672C\u6587\u79FB\u9664 ${removed} \u4E2A\u5757 ID\uFF0C\u5F15\u7528\u5B83\u4EEC\u7684\u5757\u94FE\u63A5\u4F1A\u5931\u6548\u3002\u786E\u8BA4\u6E05\u9664\uFF1F`,
      "\u6E05\u9664",
      () => this.doClearBlockIds(editor)
    ).open();
  }
  doClearBlockIds(editor) {
    const total = editor.lineCount();
    const out = [];
    let removed = 0;
    for (let i = 0; i < total; i++) {
      let line = editor.getLine(i);
      if (/^\s*\^[A-Za-z0-9-]+\s*$/.test(line)) {
        removed++;
        continue;
      }
      const trailing = line.match(/\s\^[A-Za-z0-9-]+\s*$/);
      if (trailing) {
        line = line.slice(0, trailing.index);
        removed++;
      }
      out.push(line);
    }
    editor.replaceRange(
      out.join("\n"),
      { line: 0, ch: 0 },
      { line: total - 1, ch: editor.getLine(total - 1).length }
    );
    new import_obsidian3.Notice(`\u5DF2\u6E05\u9664 ${removed} \u4E2A\u5757 ID`);
  }
};

// src/ops.ts
var import_obsidian4 = require("obsidian");
var BlockOps = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  // 把 ranges 里的行整体搬到 insertLine 之前。整段重写一次，保证只产生一步撤销
  // quotePrefix 非空时给被搬行统一补引用前缀（拖入引用 / callout 嵌套），与 nestCol 互斥
  moveRanges(editor, ranges, insertLine, nestCol = null, quotePrefix = null) {
    if (!ranges.length) return;
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const total = editor.lineCount();
    const insertAt = Math.min(Math.max(insertLine, 0), total);
    const minLine = Math.min(insertAt, ...sorted.map((r) => r.start));
    const maxLine = Math.max(insertAt - 1, ...sorted.map((r) => r.end));
    if (maxLine < minLine) return;
    const span = getLines(editor, minLine, maxLine);
    const offsets = sorted.map((r) => ({ from: r.start - minLine, to: r.end - minLine }));
    const kept = span.filter((_, i) => !offsets.some((o) => i >= o.from && i <= o.to));
    let at = insertAt - minLine;
    for (const o of offsets) {
      if (o.to < insertAt - minLine) at -= o.to - o.from + 1;
    }
    at = Math.max(0, Math.min(at, kept.length));
    const moved = [];
    for (const r of sorted) moved.push(...getLines(editor, r.start, r.end));
    if (nestCol != null && moved.length) {
      const base = (moved[0].match(/^(\s*)/) || ["", ""])[1].length;
      if (base !== nestCol) {
        for (let i = 0; i < moved.length; i++) moved[i] = shiftIndent(moved[i], nestCol - base);
      }
    } else if (quotePrefix != null && moved.length) {
      for (let i = 0; i < moved.length; i++) moved[i] = quotePrefix + moved[i];
    }
    const out = kept.slice(0, at).concat(moved, kept.slice(at));
    const oldText = span.join("\n");
    const newText = out.join("\n");
    if (oldText === newText) return;
    editor.replaceRange(
      newText,
      { line: minLine, ch: 0 },
      { line: maxLine, ch: editor.getLine(maxLine).length }
    );
  }
  // 把 ranges 的副本插入 insertLine 之前（拖拽 + Alt），不移动原块
  copyRanges(editor, ranges, insertLine, nestCol = null, quotePrefix = null) {
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    if (!sorted.length) return;
    const lines = [];
    for (const r of sorted) lines.push(...getLines(editor, r.start, r.end));
    this.insertLines(editor, lines, insertLine, nestCol, quotePrefix);
  }
  // 把若干行文本插入 insertLine 之前，可按 nestCol 对齐首行缩进（子行保持相对缩进），
  // 或按 quotePrefix 统一补引用前缀（拖入引用 / callout 嵌套）
  insertLines(editor, lines, insertLine, nestCol = null, quotePrefix = null) {
    if (!lines.length) return;
    const moved = lines.slice();
    if (nestCol != null) {
      const base = (moved[0].match(/^(\s*)/) || ["", ""])[1].length;
      if (base !== nestCol) {
        for (let i = 0; i < moved.length; i++) moved[i] = shiftIndent(moved[i], nestCol - base);
      }
    } else if (quotePrefix != null) {
      for (let i = 0; i < moved.length; i++) moved[i] = quotePrefix + moved[i];
    }
    const text = moved.join("\n");
    const total = editor.lineCount();
    const insertAt = Math.min(Math.max(insertLine, 0), total);
    if (insertAt >= total) {
      editor.replaceRange("\n" + text, { line: total - 1, ch: editor.getLine(total - 1).length });
    } else {
      editor.replaceRange(text + "\n", { line: insertAt, ch: 0 });
    }
  }
  // 跨文档移动：文本插入目标文档，再从源文档删除。两份文档各产生一步撤销
  moveRangesTo(targetEditor, sourceEditor, ranges, insertLine, nestCol = null, quotePrefix = null) {
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    if (!sorted.length) return;
    const lines = [];
    for (const r of sorted) lines.push(...getLines(sourceEditor, r.start, r.end));
    if (!lines.length) return;
    this.insertLines(targetEditor, lines, insertLine, nestCol, quotePrefix);
    this.removeRanges(sourceEditor, sorted);
  }
  // 自下而上删除行区间，避免行号失效
  removeRanges(editor, ranges) {
    const sorted = [...ranges].sort((a, b) => b.start - a.start);
    for (const { start, end } of sorted) {
      if (end < editor.lineCount() - 1) {
        editor.replaceRange("", { line: start, ch: 0 }, { line: end + 1, ch: 0 });
      } else if (start > 0) {
        editor.replaceRange(
          "",
          { line: start - 1, ch: editor.getLine(start - 1).length },
          { line: end, ch: editor.getLine(end).length }
        );
      } else {
        editor.replaceRange("", { line: 0, ch: 0 }, { line: end, ch: editor.getLine(end).length });
      }
    }
  }
  // 原地复制一份块。副本剥掉块 ID，避免同文出现重复 ID；
  // 块 ID 独立成行时副本插到 ID 行之后，ID 才仍指向原块
  duplicateBlock(block) {
    const editor = block.editor;
    const ranges = [...this.ctx.selection.actionRanges(block)].sort((a, b) => a.start - b.start);
    for (let i = ranges.length - 1; i >= 0; i--) {
      const { start, end } = ranges[i];
      const idLine = this.ctx.ids.findOwnLineIdLine(editor, end);
      const insertAfter = idLine !== null ? idLine : end;
      let text = getLines(editor, start, end).join("\n");
      const stripped = text.split("\n").filter((l) => !/^\s*\^[A-Za-z0-9-]+\s*$/.test(l)).map((l) => l.replace(/\s\^[A-Za-z0-9-]+\s*$/, ""));
      if (stripped.join("\n").trim() !== "") text = stripped.join("\n");
      editor.replaceRange("\n" + text, {
        line: insertAfter,
        ch: editor.getLine(insertAfter).length
      });
    }
    this.ctx.handle.hideHandle();
  }
  // 光标所在块创建副本（命令面板用，不依赖手柄）
  duplicateCurrentBlock(editor) {
    const cursor = editor.getCursor();
    const block = this.ctx.detector.getBlockAtLine(editor, cursor.line);
    if (!block) return;
    this.duplicateBlock({ editor, file: null, start: block.start, end: block.end, type: block.type });
  }
  moveBlockVertically(block, dir) {
    const editor = block.editor;
    const ranges = [...this.ctx.selection.actionRanges(block)].sort((a, b) => a.start - b.start);
    if (dir < 0) {
      if (ranges[0].start === 0) return;
      this.moveRanges(editor, ranges, ranges[0].start - 1);
    } else {
      const last = ranges[ranges.length - 1].end;
      if (last >= editor.lineCount() - 1) return;
      this.moveRanges(editor, ranges, last + 2);
    }
    this.ctx.handle.hideHandle();
  }
  moveCurrentBlock(editor, dir) {
    const cursor = editor.getCursor();
    const block = this.ctx.detector.getBlockAtLine(editor, cursor.line);
    if (!block) return;
    this.moveBlockVertically({ editor, file: null, start: block.start, end: block.end, type: block.type }, dir);
  }
  deleteBlock(block) {
    this.removeRanges(block.editor, this.ctx.selection.actionRanges(block));
    this.ctx.handle.hideHandle();
  }
  // 在块的上面 / 下面开一个空行并落光标，接着就能直接写
  insertBlock(block, where) {
    const editor = block.editor;
    const total = editor.lineCount();
    let line;
    if (where === "above") {
      line = block.start;
      editor.replaceRange("\n", { line, ch: 0 });
    } else if (block.end >= total - 1) {
      line = total;
      editor.replaceRange("\n", { line: total - 1, ch: editor.getLine(total - 1).length });
    } else {
      line = block.end + 1;
      editor.replaceRange("\n", { line, ch: 0 });
    }
    editor.setCursor({ line, ch: 0 });
    editor.focus();
    this.ctx.handle.hideHandle();
  }
  indentCurrentBlock(editor, dir) {
    const cursor = editor.getCursor();
    const block = this.ctx.detector.getBlockAtLine(editor, cursor.line);
    if (!block) return;
    const lines = getLines(editor, block.start, block.end);
    const step = this.ctx.settings.indentStep > 0 ? this.ctx.settings.indentStep : this.detectIndentStep(editor);
    if (dir > 0) {
      for (let i = 0; i < lines.length; i++) lines[i] = shiftIndent(lines[i], step);
    } else {
      const base = getIndent(lines[0]).length;
      if (base === 0) return;
      const delta = -Math.min(base, step);
      for (let i = 0; i < lines.length; i++) lines[i] = shiftIndent(lines[i], delta);
    }
    editor.replaceRange(
      lines.join("\n"),
      { line: block.start, ch: 0 },
      { line: block.end, ch: editor.getLine(block.end).length }
    );
    editor.setCursor({ line: cursor.line, ch: Math.min(cursor.ch, editor.getLine(cursor.line).length) });
  }
  // 全文里最小的正缩进量当作一档，找不到就用 4 空格
  detectIndentStep(editor) {
    let min = 0;
    for (let i = 0; i < editor.lineCount(); i++) {
      const n = getIndent(editor.getLine(i)).length;
      if (n > 0 && (min === 0 || n < min)) min = n;
    }
    return min > 0 && min <= 8 ? min : 4;
  }
  blockLength(block) {
    const editor = block.editor;
    const end = Math.min(block.end, editor.lineCount() - 1);
    if (end < block.start) return 0;
    return getLines(editor, block.start, end).join("").replace(/\s/g, "").length;
  }
  copyBlockContent(block) {
    const editor = block.editor;
    const ranges = this.ctx.selection.actionRanges(block);
    let text = ranges.map((r) => getLines(editor, r.start, r.end).join("\n")).join("\n");
    const single = ranges.length === 1 && ranges[0].start === block.start && ranges[0].end === block.end;
    if (block.type === "code" && single) {
      const lines = text.split("\n");
      if (lines.length >= 2) text = lines.slice(1, -1).join("\n");
    }
    navigator.clipboard.writeText(text).then(() => new import_obsidian4.Notice("\u5DF2\u590D\u5236\u5757\u5185\u5BB9"));
    this.ctx.handle.hideHandle();
  }
};

// src/block-menu.ts
var import_obsidian5 = require("obsidian");
var MENU_GRID_CLASS = "block-editor-menu-grid";
function useGridLayout(menu) {
  var _a, _b;
  const m = menu;
  (_a = m.dom) == null ? void 0 : _a.classList.add(MENU_GRID_CLASS);
  (_b = m.scrollEl) == null ? void 0 : _b.classList.add(MENU_GRID_CLASS);
  return menu;
}
var BlockMenuController = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  openTypeMenu(e, block) {
    this.buildTypeMenu(block).showAtMouseEvent(e);
  }
  buildTypeMenu(block) {
    const editor = block.editor;
    const current = ["code", "table", "math"].includes(block.type) ? block.type : this.ctx.converter.detectType(editor.getLine(block.start) || "");
    const menu = useGridLayout(new import_obsidian5.Menu());
    const ranges = this.ctx.selection.actionRanges(block);
    const multi = ranges.length > 1;
    for (const [id, title] of TURN_INTO) {
      menu.addItem((mi) => {
        mi.setTitle(title);
        if (!multi && current === id) mi.setChecked(true);
        mi.onClick(() => {
          if (id === "code") this.openLangMenu(block);
          else if (id === "callout") this.openCalloutMenu(block);
          else this.ctx.converter.convertRanges(editor, ranges, id);
        });
      });
    }
    menu.addSeparator();
    menu.addItem((mi) => mi.setTitle("\u5728\u4E0A\u65B9\u63D2\u5165\u5757").onClick(() => this.ctx.ops.insertBlock(block, "above")));
    menu.addItem((mi) => mi.setTitle("\u5728\u4E0B\u65B9\u63D2\u5165\u5757").onClick(() => this.ctx.ops.insertBlock(block, "below")));
    menu.addSeparator();
    menu.addItem((mi) => mi.setTitle("\u590D\u5236\u5757\u5185\u5BB9").onClick(() => this.ctx.ops.copyBlockContent(block)));
    menu.addItem((mi) => mi.setTitle("\u590D\u5236\u5757\u94FE\u63A5").onClick(() => this.ctx.ids.copyBlockLink(block)));
    menu.addItem((mi) => mi.setTitle("\u521B\u5EFA\u526F\u672C").onClick(() => this.ctx.ops.duplicateBlock(block)));
    menu.addSeparator();
    menu.addItem((mi) => mi.setTitle("\u4E0A\u79FB").onClick(() => this.ctx.ops.moveBlockVertically(block, -1)));
    menu.addItem((mi) => mi.setTitle("\u4E0B\u79FB").onClick(() => this.ctx.ops.moveBlockVertically(block, 1)));
    menu.addSeparator();
    if (this.ctx.converter.isColumnsBlock(editor, block)) {
      menu.addItem((mi) => mi.setTitle("\u6DFB\u52A0\u4E00\u680F").onClick(() => this.ctx.converter.addColumn(block)));
      menu.addItem((mi) => mi.setTitle("\u53D6\u6D88\u5206\u680F").onClick(() => this.ctx.converter.unwrapColumns(block)));
    } else if (this.ctx.converter.insideColumns(editor, block)) {
      menu.addItem(
        (mi) => mi.setTitle("\u6DFB\u52A0\u5206\u680F").setDisabled(true)
      );
      menu.addItem(
        (mi) => mi.setTitle("\u7EC4\u5408\u4E3A\u5206\u680F").setDisabled(true)
      );
    } else {
      menu.addItem(
        (mi) => mi.setTitle("\u6DFB\u52A0\u5206\u680F").onClick(() => this.ctx.converter.addEmptyColumns(block))
      );
      menu.addItem(
        (mi) => mi.setTitle("\u7EC4\u5408\u4E3A\u5206\u680F").setDisabled(this.ctx.converter.columnsSegmentCount(block) < 2).onClick(() => this.ctx.converter.wrapBlockToColumns(block))
      );
    }
    menu.addSeparator();
    menu.addItem((mi) => mi.setTitle(`\u672C\u5757 ${this.ctx.ops.blockLength(block)} \u5B57`).setDisabled(true));
    menu.addItem(
      (mi) => mi.setTitle(block.type === "heading" ? "\u5220\u9664\u6574\u6BB5" : "\u5220\u9664").onClick(() => this.ctx.ops.deleteBlock(block))
    );
    return menu;
  }
  // 命令面板里没有鼠标事件，菜单就贴着块的左上角弹
  openMenuAtCursor(editor) {
    const cursor = editor.getCursor();
    const block = this.ctx.detector.getBlockAtLine(editor, cursor.line);
    if (!block) {
      new import_obsidian5.Notice("\u8FD9\u4E00\u884C\u6CA1\u6709\u53EF\u64CD\u4F5C\u7684\u5757");
      return;
    }
    const b = {
      editor,
      file: this.ctx.app.workspace.getActiveFile(),
      start: block.start,
      end: block.end,
      type: block.type
    };
    this.showMenuAtBlock(this.buildTypeMenu(b), b);
  }
  openLangMenu(block) {
    const current = block.type === "code" ? this.ctx.converter.getFenceLang(block) : null;
    const menu = useGridLayout(new import_obsidian5.Menu());
    for (const [lang, title] of CODE_LANGS) {
      menu.addItem((mi) => {
        mi.setTitle(title);
        if (current === lang) mi.setChecked(true);
        mi.onClick(
          () => this.ctx.converter.convertRanges(
            block.editor,
            this.ctx.selection.actionRanges(block),
            "code",
            lang
          )
        );
      });
    }
    this.showMenuAtBlock(menu, block);
  }
  // Callout 类型子菜单（多选时批量应用）
  openCalloutMenu(block) {
    const m = block.editor.getLine(block.start).match(/\[!([\w-]+)\][+-]?/);
    const current = m ? m[1].toLowerCase() : null;
    const menu = useGridLayout(new import_obsidian5.Menu());
    for (const [type, title] of CALLOUT_TYPES) {
      menu.addItem((mi) => {
        mi.setTitle(title);
        if (current === type) mi.setChecked(true);
        mi.onClick(
          () => this.ctx.converter.convertRanges(
            block.editor,
            this.ctx.selection.actionRanges(block),
            "callout",
            type
          )
        );
      });
    }
    this.showMenuAtBlock(menu, block);
  }
  showMenuAtBlock(menu, block) {
    const cm = getCM(block.editor);
    const doc = cm == null ? void 0 : cm.state.doc;
    if (cm && doc && block.start < doc.lines) {
      const coords = cm.coordsAtPos(doc.line(block.start + 1).from);
      if (coords) {
        menu.showAtPosition({ x: coords.left, y: coords.bottom + 2 });
        return;
      }
    }
    menu.showAtPosition({ x: 200, y: 200 });
  }
};

// src/handle.ts
var HandleController = class {
  constructor(ctx) {
    this.ctx = ctx;
    this.handleEl = null;
    this.highlightEl = null;
    this.hideTimer = null;
    this.currentBlock = null;
    this.cursorBlock = null;
  }
  init() {
    const highlight = document.createElement("div");
    highlight.className = "block-editor-hover-block";
    highlight.style.display = "none";
    document.body.appendChild(highlight);
    this.highlightEl = highlight;
    const handle = document.createElement("div");
    handle.className = "block-editor-handle";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "block-editor-handle-dots");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("viewBox", "0 0 16 16");
    for (const [cx, cy] of [
      [5, 4],
      [11, 4],
      [5, 8],
      [11, 8],
      [5, 12],
      [11, 12]
    ]) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(cx));
      circle.setAttribute("cy", String(cy));
      circle.setAttribute("r", "1.3");
      svg.appendChild(circle);
    }
    handle.appendChild(svg);
    handle.style.display = "none";
    document.body.appendChild(handle);
    this.handleEl = handle;
    this.ctx.registerDomEvent(handle, "mousedown", (e) => this.ctx.drag.onHandleMouseDown(e));
    this.ctx.registerDomEvent(handle, "mouseenter", () => this.clearHideTimer());
    this.ctx.registerDomEvent(handle, "mouseleave", () => this.scheduleHide());
  }
  destroy() {
    var _a, _b;
    this.clearHideTimer();
    (_a = this.handleEl) == null ? void 0 : _a.remove();
    this.handleEl = null;
    (_b = this.highlightEl) == null ? void 0 : _b.remove();
    this.highlightEl = null;
    this.currentBlock = null;
    this.cursorBlock = null;
  }
  onMouseMove(e) {
    var _a;
    if (!this.ctx.settings.showHandle) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if ((_a = this.handleEl) == null ? void 0 : _a.contains(target)) {
      this.clearHideTimer();
      return;
    }
    const cmContent = target.closest(".cm-content");
    if (!cmContent) {
      this.scheduleHide();
      return;
    }
    const found = getEditorFromContent(this.ctx.app, cmContent);
    if (!found) {
      this.scheduleHide();
      return;
    }
    const editor = found.editor;
    const cm = getCM(editor);
    if (!cm) {
      this.scheduleHide();
      return;
    }
    const pos = cm.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) {
      this.scheduleHide();
      return;
    }
    const lineIndex = cm.state.doc.lineAt(pos).number - 1;
    const block = this.ctx.detector.getBlockAtLine(editor, lineIndex);
    if (!block) {
      this.scheduleHide();
      return;
    }
    this.clearHideTimer();
    this.currentBlock = {
      editor,
      file: found.file,
      start: block.start,
      end: block.end,
      type: block.type
    };
    this.showHandle(editor, block);
  }
  showHandle(editor, block) {
    if (!this.ctx.settings.showHandle) return;
    const cm = getCM(editor);
    if (!cm) return;
    const doc = cm.state.doc;
    if (block.start < 0 || block.start >= doc.lines) {
      this.hideHandle();
      return;
    }
    const line = doc.line(block.start + 1);
    const coords = cm.coordsAtPos(line.from);
    if (!coords) {
      this.hideHandle();
      return;
    }
    const lineH = coords.bottom - coords.top || 20;
    const top = coords.top + (lineH - HANDLE_H) / 2;
    if (this.handleEl) {
      this.handleEl.style.display = "flex";
      this.handleEl.style.top = top + "px";
      this.handleEl.style.left = coords.left - HANDLE_W - 6 + "px";
    }
    this.showHighlight(editor, block);
  }
  setDragging(on) {
    var _a;
    (_a = this.handleEl) == null ? void 0 : _a.classList.toggle("is-dragging", on);
    if (on) this.hideHighlight();
  }
  hideHandle() {
    if (this.ctx.drag.isActive()) return;
    if (this.handleEl) this.handleEl.style.display = "none";
    this.hideHighlight();
    this.currentBlock = null;
  }
  // 滚动 / 窗口变化后按当前块重算高亮位置；拖拽中或手柄关闭时不显示
  renderHighlight() {
    if (!this.ctx.settings.showHandle || this.ctx.drag.isActive() || !this.currentBlock) {
      this.hideHighlight();
      return;
    }
    this.showHighlight(this.currentBlock.editor, this.currentBlock);
  }
  // 手柄对应块的浅色高亮，给「即将操作哪一块」以视觉反馈
  showHighlight(editor, block) {
    const el = this.highlightEl;
    if (!el) return;
    const cm = getCM(editor);
    if (!cm) return;
    const doc = cm.state.doc;
    if (block.start < 0 || block.end >= doc.lines) {
      this.hideHighlight();
      return;
    }
    const from = cm.coordsAtPos(doc.line(block.start + 1).from);
    const below = doc.line(block.end + 1);
    const to = cm.coordsAtPos(below.to);
    if (!from || !to) {
      this.hideHighlight();
      return;
    }
    const contentRect = cm.contentDOM.getBoundingClientRect();
    el.style.display = "block";
    el.style.top = from.top + "px";
    el.style.height = Math.max(to.bottom - from.top, 4) + "px";
    el.style.left = from.left + "px";
    el.style.width = Math.max(contentRect.right - from.left, 8) + "px";
  }
  hideHighlight() {
    if (this.highlightEl) this.highlightEl.style.display = "none";
  }
  scheduleHide() {
    this.clearHideTimer();
    this.hideTimer = window.setTimeout(() => this.fallbackHandle(), 150);
  }
  clearHideTimer() {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
  // 鼠标离开后不直接消失，退回「光标所在块」的手柄
  fallbackHandle() {
    this.hideTimer = null;
    if (this.ctx.drag.isActive()) return;
    if (!this.ctx.settings.handleFollowsCursor) {
      this.hideHandle();
      return;
    }
    const cb = this.cursorBlock;
    if (cb && cb.editor && getCM(cb.editor)) {
      this.currentBlock = cb;
      this.showHandle(cb.editor, cb);
      return;
    }
    this.hideHandle();
  }
  // 光标所在块的手柄常显（仅当编辑器本身获得焦点时生效）
  updateCursorBlock() {
    if (this.ctx.drag.isActive()) return;
    const block = this.getCursorBlock();
    this.cursorBlock = block;
    if (!block || !this.ctx.settings.handleFollowsCursor) return;
    this.currentBlock = block;
    this.showHandle(block.editor, block);
  }
  getCursorBlock() {
    var _a;
    const active = this.ctx.app.workspace.activeEditor;
    const editor = active == null ? void 0 : active.editor;
    if (!editor) return null;
    const cm = getCM(editor);
    if (!cm) return null;
    if (typeof cm.hasFocus === "function" && !cm.hasFocus()) return null;
    const cursor = editor.getCursor();
    const block = this.ctx.detector.getBlockAtLine(editor, cursor.line);
    if (!block) return null;
    return {
      editor,
      file: (_a = active.file) != null ? _a : this.ctx.app.workspace.getActiveFile(),
      start: block.start,
      end: block.end,
      type: block.type
    };
  }
};

// src/drag.ts
var COL_SHELL_RE = /^\s*>\s*\[!multi-column(?:\|[^\]]*)?\]/;
var DragController = class {
  constructor(ctx) {
    this.ctx = ctx;
    this.state = null;
    this.ghostEl = null;
    this.indicatorEl = null;
  }
  init() {
    const indicator = document.createElement("div");
    indicator.className = "block-editor-indicator";
    indicator.style.display = "none";
    document.body.appendChild(indicator);
    this.indicatorEl = indicator;
  }
  destroy() {
    var _a;
    this.stopAutoScroll();
    this.removeGhost();
    (_a = this.indicatorEl) == null ? void 0 : _a.remove();
    this.indicatorEl = null;
    this.state = null;
    document.body.classList.remove("block-editor-dragging");
  }
  isActive() {
    return this.state !== null;
  }
  onHandleMouseDown(e) {
    const block = this.ctx.handle.currentBlock;
    if (!block) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey) {
      this.ctx.selection.toggleSelection(block);
      return;
    }
    const inSelection = this.ctx.selection.isInSelection(block);
    const sel = this.ctx.selection.selection;
    const ranges = inSelection && sel ? sel.ranges : [{ start: block.start, end: block.end, type: block.type }];
    if (!inSelection) this.ctx.selection.clearSelection();
    this.state = {
      editor: block.editor,
      file: block.file,
      start: block.start,
      end: block.end,
      type: block.type,
      ranges,
      targetEditor: null,
      targetLine: null,
      nestCol: null,
      quotePrefix: null,
      startY: e.clientY,
      startX: e.clientX,
      lastX: e.clientX,
      lastY: e.clientY,
      edgeDir: 0,
      scrollTimer: null,
      moved: false
    };
    this.ctx.handle.setDragging(true);
    document.body.classList.add("block-editor-dragging");
  }
  onMouseUp(e) {
    const ds = this.state;
    if (!ds) return;
    this.state = null;
    this.stopAutoScroll(ds);
    this.removeGhost();
    this.ctx.handle.setDragging(false);
    document.body.classList.remove("block-editor-dragging");
    if (this.indicatorEl) this.indicatorEl.style.display = "none";
    if (!ds.moved) {
      this.ctx.menu.openTypeMenu(e, {
        editor: ds.editor,
        file: ds.file,
        start: ds.start,
        end: ds.end,
        type: ds.type
      });
      return;
    }
    if (ds.targetLine != null) {
      const cross = ds.targetEditor !== null && ds.targetEditor !== ds.editor;
      if (cross && ds.targetEditor) {
        if (e.altKey) {
          const lines = [];
          for (const r of [...ds.ranges].sort((a, b) => a.start - b.start)) {
            lines.push(...getLines(ds.editor, r.start, r.end));
          }
          this.ctx.ops.insertLines(ds.targetEditor, lines, ds.targetLine, ds.nestCol, ds.quotePrefix);
        } else {
          this.ctx.ops.moveRangesTo(
            ds.targetEditor,
            ds.editor,
            ds.ranges,
            ds.targetLine,
            ds.nestCol,
            ds.quotePrefix
          );
        }
      } else if (e.altKey) {
        this.ctx.ops.copyRanges(ds.editor, ds.ranges, ds.targetLine, ds.nestCol, ds.quotePrefix);
      } else {
        this.ctx.ops.moveRanges(ds.editor, ds.ranges, ds.targetLine, ds.nestCol, ds.quotePrefix);
      }
    }
    this.ctx.handle.hideHandle();
  }
  onDragMove(e) {
    var _a;
    const ds = this.state;
    if (!ds) return;
    ds.lastX = e.clientX;
    ds.lastY = e.clientY;
    if (!ds.moved) {
      const dist = Math.hypot(e.clientX - ds.startX, e.clientY - ds.startY);
      ds.moved = dist > 4 || this.isOutsideSourceEditor(ds, e.clientX, e.clientY);
      if (ds.moved) this.ghostEl = this.createGhost(ds);
    }
    if (!ds.moved) return;
    this.moveGhost(e);
    (_a = this.ghostEl) == null ? void 0 : _a.classList.toggle("is-copy", e.altKey);
    this.updateDropTarget(ds, e.clientX, e.clientY);
    this.updateAutoScroll(ds);
  }
  // 指针是否已经离开源编辑器区域
  isOutsideSourceEditor(ds, x, y) {
    const cm = getCM(ds.editor);
    if (!cm) return false;
    const r = cm.dom.getBoundingClientRect();
    return x < r.left || x > r.right || y < r.top || y > r.bottom;
  }
  // 按当前鼠标位置计算落点并画插入线。落点可以是另一篇文档的编辑器（跨文档拖拽）
  updateDropTarget(ds, x, y) {
    var _a;
    const over = this.editorAtPoint(x, y);
    if (!over) {
      this.clearDropTarget(ds);
      return;
    }
    const overCm = getCM(over.editor);
    if (!overCm) {
      this.clearDropTarget(ds);
      return;
    }
    const sameDoc = overCm.state.doc === ((_a = getCM(ds.editor)) == null ? void 0 : _a.state.doc);
    const editor = sameDoc ? ds.editor : over.editor;
    const cm = getCM(editor);
    if (!cm) {
      this.clearDropTarget(ds);
      return;
    }
    const cross = !sameDoc;
    const cmRect = cm.dom.getBoundingClientRect();
    const pos = cm.posAtCoords({ x, y });
    if (pos == null) {
      this.clearDropTarget(ds);
      return;
    }
    const doc = cm.state.doc;
    const lineInfo = doc.lineAt(pos);
    const lineIndex = lineInfo.number - 1;
    const lineCoords = cm.coordsAtPos(lineInfo.from);
    if (!lineCoords) {
      this.clearDropTarget(ds);
      return;
    }
    const mid = (lineCoords.top + lineCoords.bottom) / 2;
    let insertAt = y > mid ? lineIndex + 1 : lineIndex;
    let nestCol = null;
    let quotePrefix = null;
    const overSelf = !cross && ds.ranges.some((r) => lineIndex >= r.start && lineIndex <= r.end);
    const target = overSelf ? null : this.ctx.detector.getBlockAtLine(editor, lineIndex);
    if (target && ["list", "quote", "callout"].includes(target.type)) {
      const nestable = COL_SHELL_RE.test(editor.getLine(target.start)) ? null : target;
      const marker = editor.getLine(target.start).match(/^(\s*)([-*+]|\d+[.)])\s+/);
      if (marker && x > lineCoords.left + 24) {
        nestCol = marker[1].length + marker[2].length + 1;
        insertAt = target.end + 1;
      } else if (nestable && target.type !== "list") {
        const qm = editor.getLine(target.start).match(/^(\s*)((?:>\s*)+)/);
        if (qm && x > lineCoords.left + 24) {
          quotePrefix = qm[1] + qm[2];
          insertAt = target.end + 1;
        }
      }
    }
    if (nestCol == null && !overSelf) {
      const first = [...ds.ranges].sort((a, b) => a.start - b.start)[0];
      const firstLine = ds.editor.getLine(first.start);
      if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(firstLine)) {
        const baseIndent = getIndent(firstLine).length;
        const refIndent = getIndent(editor.getLine(lineIndex)).length;
        if (refIndent < baseIndent) nestCol = refIndent;
      }
    }
    if (!cross) {
      const noMove = ds.ranges.every((r) => insertAt >= r.start && insertAt <= r.end + 1);
      if (noMove && nestCol == null) {
        this.clearDropTarget(ds);
        return;
      }
    }
    ds.targetLine = insertAt;
    ds.nestCol = nestCol;
    ds.quotePrefix = quotePrefix;
    ds.targetEditor = cross ? editor : null;
    let left = cmRect.left;
    let width = cmRect.width;
    if (nestCol != null || quotePrefix != null) {
      left = lineCoords.left;
      width = Math.max(cmRect.right - left, 40);
    }
    const yPos = insertAt > lineIndex ? lineCoords.bottom : lineCoords.top;
    if (this.indicatorEl) {
      this.indicatorEl.style.display = "block";
      this.indicatorEl.style.top = yPos + "px";
      this.indicatorEl.style.left = left + "px";
      this.indicatorEl.style.width = width + "px";
    }
  }
  // 鼠标所在的 markdown 编辑器（任意分屏），不在任何编辑器内时返回 null
  editorAtPoint(x, y) {
    var _a;
    const leaves = this.ctx.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const view = leaf.view;
      const editor = view == null ? void 0 : view.editor;
      if (!editor) continue;
      const cm = getCM(editor);
      if (!cm) continue;
      const r = cm.dom.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return { editor, file: (_a = view == null ? void 0 : view.file) != null ? _a : null };
      }
    }
    return null;
  }
  // 拖到编辑区上 / 下边缘时持续滚动（悬停哪个编辑器就滚哪个）
  updateAutoScroll(ds) {
    var _a, _b;
    if (!this.ctx.settings.dragAutoScroll) return;
    const scroller = (_b = getCM((_a = ds.targetEditor) != null ? _a : ds.editor)) == null ? void 0 : _b.scrollDOM;
    if (!scroller) return;
    const r = scroller.getBoundingClientRect();
    const EDGE = 40;
    let dir = 0;
    if (ds.lastY < r.top + EDGE) dir = -1;
    else if (ds.lastY > r.bottom - EDGE) dir = 1;
    if (!dir) {
      this.stopAutoScroll(ds);
      return;
    }
    ds.edgeDir = dir;
    if (ds.scrollTimer) return;
    ds.scrollTimer = window.setInterval(() => {
      var _a2, _b2;
      const el = (_b2 = getCM((_a2 = ds.targetEditor) != null ? _a2 : ds.editor)) == null ? void 0 : _b2.scrollDOM;
      if (!el) return;
      const before = el.scrollTop;
      el.scrollTop = before + ds.edgeDir * 14;
      if (el.scrollTop !== before) this.updateDropTarget(ds, ds.lastX, ds.lastY);
    }, 16);
  }
  stopAutoScroll(ds) {
    const s = ds != null ? ds : this.state;
    if (!s) return;
    if (s.scrollTimer) {
      window.clearInterval(s.scrollTimer);
      s.scrollTimer = null;
    }
    s.edgeDir = 0;
  }
  clearDropTarget(ds) {
    if (this.indicatorEl) this.indicatorEl.style.display = "none";
    ds.targetLine = null;
    ds.nestCol = null;
    ds.quotePrefix = null;
    ds.targetEditor = null;
  }
  // 拖拽时跟随鼠标的浮动预览
  createGhost(ds) {
    const editor = ds.editor;
    const lines = [];
    for (const r of [...ds.ranges].sort((a, b) => a.start - b.start)) {
      for (let i = r.start; i <= r.end; i++) lines.push(editor.getLine(i));
    }
    let text = lines.join("\n");
    if (text.length > 300) text = text.slice(0, 300) + " \u2026";
    const el = document.createElement("div");
    el.className = "block-editor-drag-ghost";
    el.textContent = text;
    document.body.appendChild(el);
    return el;
  }
  moveGhost(e) {
    const el = this.ghostEl;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = e.clientX + 14;
    let y = e.clientY + 14;
    if (x + w > window.innerWidth - 8) x = Math.max(8, e.clientX - w - 14);
    if (y + h > window.innerHeight - 8) y = Math.max(8, e.clientY - h - 14);
    el.style.left = x + "px";
    el.style.top = y + "px";
  }
  removeGhost() {
    var _a;
    (_a = this.ghostEl) == null ? void 0 : _a.remove();
    this.ghostEl = null;
  }
};

// src/slash-suggest.ts
var import_obsidian6 = require("obsidian");
function fuzzyScore(text, query) {
  if (!query) return 0;
  if (text.startsWith(query)) return 100;
  const direct = text.indexOf(query);
  if (direct >= 0) return 60 - Math.min(direct, 30);
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (const ch of query) {
    const found = text.indexOf(ch, ti);
    if (found === -1) return -1;
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak;
    if (found === 0 || /[\s-]/.test(text[found - 1])) score += 2;
    ti = found + 1;
  }
  return score;
}
var SlashSuggest = class extends import_obsidian6.EditorSuggest {
  constructor(ctx) {
    super(ctx.app);
    this.ctx = ctx;
  }
  onTrigger(cursor, editor) {
    if (!this.ctx.settings.slashCommands) return null;
    const before = editor.getLine(cursor.line).slice(0, cursor.ch);
    const m = before.match(/(?:^|\s)\/(\S*)$/);
    if (!m) return null;
    const container = this.ctx.detector.findContainerAt(editor, cursor.line);
    if (container && container.type === "code") return null;
    return {
      start: { line: cursor.line, ch: cursor.ch - m[1].length - 1 },
      end: cursor,
      query: m[1]
    };
  }
  getSuggestions(context) {
    const q = context.query.toLowerCase();
    if (!q) return TURN_INTO.slice();
    return TURN_INTO.map((item) => ({
      item,
      score: Math.max(fuzzyScore(item[0], q), fuzzyScore(item[1].toLowerCase(), q))
    })).filter((s) => s.score >= 0).sort((a, b) => b.score - a.score).map((s) => s.item);
  }
  renderSuggestion(item, el) {
    el.setText(item[1]);
  }
  selectSuggestion([id]) {
    const sugg = this.context;
    if (!sugg) return;
    const editor = sugg.editor;
    editor.replaceRange("", sugg.start, sugg.end);
    const lineIndex = sugg.start.line;
    const detected = this.ctx.detector.getBlockAtLine(editor, lineIndex);
    const block = detected ? { editor, file: null, start: detected.start, end: detected.end, type: detected.type } : { editor, file: null, start: lineIndex, end: lineIndex, type: "empty" };
    this.ctx.converter.convertBlock(editor, block, id);
  }
};

// src/columns-preview.ts
var import_view = require("@codemirror/view");
var import_state = require("@codemirror/state");
var import_obsidian7 = require("obsidian");
var DEBUG = false;
function colLog(...args) {
  if (DEBUG) console.log("%c[BE-columns]", "color:#8b5cf6;font-weight:bold", ...args);
}
var editingWidgets = /* @__PURE__ */ new Set();
function flushEditingColumns() {
  for (const w of [...editingWidgets]) {
    w.flushEdit();
    editingWidgets.delete(w);
  }
}
var COL_START_RE2 = /^((?:>\s*)+)\[!multi-column(?:\|[^\]]*)?\][^\n]*$/;
var QUOTE_RE = /^>\s?/;
var COL_LOOSE_RE = /\[!multi-column(?:\|[^\]]*)?\]/;
var forceRecompute = import_state.StateEffect.define();
var lastDiagnostics = { regions: 0, markerLines: 0, livePreview: null, note: "", segmentsPreview: [] };
function getColumnsDiagnostics() {
  return { ...lastDiagnostics, segmentsPreview: [...lastDiagnostics.segmentsPreview] };
}
function stripAllQuotes(text) {
  return text.replace(/^(?:>\s*)+/, "");
}
function scanRegions(doc, stats) {
  const regions = [];
  let start = -1;
  let fenceCh = null;
  const push = (endLine) => {
    if (start === -1) return;
    const dividers = [];
    const bgs = [];
    for (let i = start + 1; i <= endLine; i++) {
      const text = doc.line(i + 1).text;
      if (QUOTE_RE.test(text) && /\[!col(?:\|[^\]]*)?\]/.test(text)) {
        dividers.push(i);
        const m = text.match(/\[!col\|([^\]]*)\]/);
        const bgm = m ? m[1].match(/(?:^|\s)bg=([#0-9a-fA-F]{3,8})/) : null;
        bgs.push(bgm ? bgm[1] : null);
      }
    }
    const bounds = [start, ...dividers, endLine + 1];
    const segments = [];
    const firstSeg = dividers.length > 0 ? 1 : 0;
    for (let k = firstSeg; k < bounds.length - 1; k++) {
      const lines = [];
      for (let i = bounds[k] + 1; i < bounds[k + 1]; i++) {
        const text = doc.line(i + 1).text;
        if (!QUOTE_RE.test(text)) continue;
        lines.push(stripAllQuotes(text));
      }
      while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
      segments.push(lines.join("\n"));
    }
    if (segments.length && (dividers.length > 0 || segments.some((s) => s.trim() !== ""))) {
      const hasBreak = endLine + 1 < doc.lines;
      let endPos;
      let replacedBreak = false;
      if (hasBreak && (endLine + 2 < doc.lines || doc.line(endLine + 2).text !== "")) {
        endPos = doc.line(endLine + 2).from;
        replacedBreak = true;
      } else if (hasBreak) {
        endPos = doc.length - 1;
      } else {
        endPos = doc.line(endLine + 1).to;
      }
      let widths;
      const meta = doc.line(start + 1).text.match(/\[!multi-column\|([^\]]*)\]/);
      if (meta) {
        const parsed = meta[1].split("-").map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x) && x > 0);
        if (parsed.length === segments.length) widths = parsed;
      }
      regions.push({
        startLine: start,
        endLine,
        startPos: doc.line(start + 1).from,
        endPos,
        hasBreak: replacedBreak,
        widths,
        // 有 col 子栏且解析出的 bg 数与栏段数一致时才采用（无 col 的整块结构不带 bg）
        bgs: dividers.length > 0 && bgs.length === segments.length ? bgs : void 0,
        segments
      });
    }
  };
  for (let i = 0; i < doc.lines; i++) {
    const text = doc.line(i + 1).text;
    if (stats && COL_LOOSE_RE.test(text)) stats.markerLines++;
    if (fenceCh !== null) {
      const m = text.match(/^\s*(`{3,}|~{3,})/);
      if (m && m[1][0] === fenceCh) fenceCh = null;
      continue;
    }
    const f = text.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      fenceCh = f[1][0];
      continue;
    }
    if (COL_START_RE2.test(text)) {
      if (start !== -1) push(i - 1);
      start = i;
      continue;
    }
    if (start === -1) continue;
    if (!QUOTE_RE.test(text)) {
      push(i - 1);
      start = -1;
    }
  }
  if (start !== -1) push(doc.lines - 1);
  return regions;
}
var _ColumnsWidget = class _ColumnsWidget extends import_view.WidgetType {
  constructor(ctx, region, path) {
    super();
    this.ctx = ctx;
    this.path = path;
    this.texts = [];
    this.widths = [];
    this.bgs = [];
    this.editCol = null;
    this.textareas = [];
    this.colEls = [];
    this.root = null;
    this.parentView = null;
    this.focusCol = -1;
    this.menuEl = null;
    this.colorPickerEl = null;
    this.onDocMouseDown = (ev) => {
      if (this.menuEl && !this.menuEl.contains(ev.target)) this.closeMenu();
      if (this.colorPickerEl && !this.colorPickerEl.contains(ev.target)) this.closeColorPicker();
    };
    this.region = region;
    this.texts = [...region.segments];
    this.widths = region.widths ? [...region.widths] : [];
    this.bgs = region.bgs ? [...region.bgs] : [];
  }
  /** 内容签名：内容/宽度/背景色变化时装饰层会重建 widget */
  get key() {
    return this.texts.join("\0") + "#" + this.widths.join(",") + "#" + this.bgs.join(",");
  }
  /** CM 更新期间禁止 dispatch：事件触发的写回统一延迟到微任务执行 */
  later(fn) {
    const view = this.parentView;
    if (!view) return;
    queueMicrotask(() => {
      try {
        fn(view);
      } catch (e) {
        console.error("[BE-columns] dispatch \u5931\u8D25", e);
      }
    });
  }
  eq(other) {
    return other === this;
  }
  ignoreEvent() {
    return true;
  }
  toDOM(view) {
    this.parentView = view;
    const wrap = document.createElement("div");
    wrap.className = "block-editor-columns-widget";
    wrap.dataset.regionStart = String(this.region.startPos);
    this.root = wrap;
    this.render();
    queueMicrotask(() => {
      var _a;
      try {
        const gs = (_a = wrap.ownerDocument.defaultView) == null ? void 0 : _a.getComputedStyle(wrap);
        colLog("widget \u8BA1\u7B97\u6837\u5F0F display =", gs == null ? void 0 : gs.display, (gs == null ? void 0 : gs.display) === "flex" ? "(CSS \u751F\u6548)" : "(CSS \u672A\u751F\u6548!)");
      } catch (e) {
      }
    });
    return wrap;
  }
  /** 结构或内容变更后写回文档（单步撤销） */
  commitDoc() {
    const view = this.parentView;
    if (!view) return;
    const text = buildColumnsMarkdown(this.texts, this.widths, this.bgs) + (this.region.hasBreak ? "\n" : "");
    view.dispatch({
      changes: { from: this.region.startPos, to: this.region.endPos, insert: text }
    });
  }
  render() {
    const wrap = this.root;
    if (!wrap) return;
    const focusTarget = this.editCol;
    wrap.textContent = "";
    this.textareas = [];
    this.colEls = [];
    this.closeMenu();
    this.closeColorPicker();
    const row = document.createElement("div");
    row.className = "block-editor-columns-row";
    wrap.appendChild(row);
    this.region.segments.forEach((seg, i) => {
      var _a, _b;
      if (i > 0) {
        const resizer = document.createElement("div");
        resizer.className = "block-editor-col-resizer";
        resizer.title = "\u62D6\u62FD\u8C03\u6574\u680F\u5BBD";
        resizer.addEventListener("mousedown", (e) => this.startResize(e, i - 1, row, resizer));
        row.appendChild(resizer);
      }
      const col = document.createElement("div");
      col.className = "block-editor-col-editor";
      const colWidth = (_a = this.widths[i]) != null ? _a : 100 / this.region.segments.length;
      col.style.flex = colWidth + " 1 0%";
      col.style.backgroundColor = (_b = this.bgs[i]) != null ? _b : "transparent";
      const grip = document.createElement("div");
      grip.className = "block-editor-col-grip";
      grip.textContent = "\u283F";
      grip.title = "\u62D6\u52A8\u6392\u5E8F\uFF1B\u70B9\u51FB\u6253\u5F00\u83DC\u5355";
      grip.addEventListener("mousedown", (e) => this.gripDown(e, i));
      col.appendChild(grip);
      if (this.editCol === i) {
        const ta = document.createElement("textarea");
        ta.className = "block-editor-col-textarea";
        ta.value = this.texts[i];
        ta.spellcheck = false;
        ta.addEventListener("input", () => {
          this.texts[i] = ta.value;
        });
        ta.addEventListener("blur", () => {
          this.later(() => {
            if (this.editCol === i) {
              this.texts[i] = ta.value;
              this.editCol = null;
              editingWidgets.delete(this);
              queueMicrotask(() => this.commitDoc());
            }
            this.render();
          });
        });
        ta.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            this.later(() => {
              this.editCol = null;
              editingWidgets.delete(this);
              queueMicrotask(() => this.commitDoc());
              this.render();
            });
          }
        });
        col.appendChild(ta);
        this.textareas.push(ta);
      } else {
        const content = document.createElement("div");
        content.className = "block-editor-col-content";
        content.addEventListener("dblclick", () => this.enterEdit(i));
        col.appendChild(content);
        if (!this.texts[i] || !this.texts[i].trim()) {
          content.classList.add("block-editor-col-empty");
        } else {
          import_obsidian7.MarkdownRenderer.render(this.ctx.app, this.texts[i], content, this.path, this.ctx).then(() => {
            var _a2;
            return (_a2 = this.parentView) == null ? void 0 : _a2.requestMeasure();
          }).catch(() => {
            content.setText("\u70B9\u51FB\u7F16\u8F91\u6B64\u680F");
          });
        }
      }
      this.colEls.push(col);
      row.appendChild(col);
    });
    if (focusTarget !== null && this.textareas[0]) this.textareas[0].focus();
  }
  enterEdit(i) {
    if (this.editCol !== null) return;
    this.editCol = i;
    editingWidgets.add(this);
    this.render();
  }
  /** 把当前编辑中的内容立即写回文档；DOM 已销毁的旧实例直接放弃。
   *  切换标签页 / 关闭文档时 blur 可能不触发，由 flushEditingColumns 兜底调用。 */
  flushEdit() {
    if (this.editCol === null) return;
    if (this.root && !this.root.isConnected) {
      this.editCol = null;
      return;
    }
    const ta = this.textareas[this.editCol];
    if (ta) this.texts[this.editCol] = ta.value;
    this.editCol = null;
    try {
      this.commitDoc();
    } catch (e) {
    }
  }
  /** 在当前栏（afterIndex）之后插入一栏；旧栏按比例缩小、新栏占 100/n */
  addColumnAt(afterIndex) {
    const n = this.texts.length + 1;
    const newW = Math.round(100 / n * 10) / 10;
    const scale = (100 - newW) / 100;
    this.widths = this.widths.map((w) => Math.round(w * scale * 10) / 10);
    this.widths.splice(afterIndex + 1, 0, newW);
    this.texts.splice(afterIndex + 1, 0, "");
    this.bgs.splice(afterIndex + 1, 0, null);
    queueMicrotask(() => this.commitDoc());
    this.render();
  }
  /** 删除指定栏；被删栏宽度按比例分给剩余栏（总和回到 100）；剩 1 栏时不执行 */
  removeColumn(i) {
    if (this.texts.length <= 1) return;
    this.texts.splice(i, 1);
    this.bgs.splice(i, 1);
    if (this.widths.length > 1) {
      this.widths.splice(i, 1);
      const sum = this.widths.reduce((a, b) => a + b, 0) || 1;
      this.widths = this.widths.map((w) => Math.round(w / sum * 100 * 10) / 10);
    } else {
      this.widths = [];
    }
    queueMicrotask(() => this.commitDoc());
    this.render();
  }
  // 按住栏间分隔条拖拽：调整相邻两栏的宽度（总和不变，最小 10%）
  startResize(e, i, row, resizer) {
    var _a, _b;
    e.preventDefault();
    e.stopPropagation();
    resizer.classList.add("is-active");
    const startX = e.clientX;
    const rowWidth = Math.max(row.getBoundingClientRect().width, 1);
    const w1 = (_a = this.widths[i]) != null ? _a : 100 / this.region.segments.length;
    const w2 = (_b = this.widths[i + 1]) != null ? _b : 100 / this.region.segments.length;
    const colEls = [this.colEls[i], this.colEls[i + 1]];
    const onMove = (ev) => {
      const delta = (ev.clientX - startX) / rowWidth * 100;
      let n1 = Math.max(10, Math.min(85, w1 + delta));
      const n2 = Math.max(10, w1 + w2 - n1);
      n1 = w1 + w2 - n2;
      this.widths[i] = Math.round(n1 * 10) / 10;
      this.widths[i + 1] = Math.round(n2 * 10) / 10;
      if (colEls[0]) {
        colEls[0].style.flex = this.widths[i] + " 1 0%";
        colEls[0].style.removeProperty("max-width");
      }
      if (colEls[1]) {
        colEls[1].style.flex = this.widths[i + 1] + " 1 0%";
        colEls[1].style.removeProperty("max-width");
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      resizer.classList.remove("is-active");
      this.later((view) => this.commitDoc());
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  // 按住栏顶手柄：位移超过阈值进入拖拽排序；未超阈值松手视为点击，弹出命令菜单。
  // 阈值区分解决“拖拽手柄”与“菜单入口”的冲突。
  gripDown(e, from) {
    e.preventDefault();
    e.stopPropagation();
    const THRESHOLD = 5;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let hover = -1;
    const clearDrop = () => this.colEls.forEach((c) => c.classList.remove("block-editor-col-drop"));
    const onMove = (ev) => {
      var _a, _b;
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) <= THRESHOLD) return;
      dragging = true;
      const el = (_b = (_a = document.elementFromPoint) == null ? void 0 : _a.call(document, ev.clientX, ev.clientY)) == null ? void 0 : _b.closest(".block-editor-col-editor");
      hover = el ? this.colEls.indexOf(el) : -1;
      this.colEls.forEach((c, k) => c.classList.toggle("block-editor-col-drop", k === hover && hover !== from));
    };
    const onUp = (ev) => {
      var _a, _b;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      clearDrop();
      if (!dragging) {
        this.showColMenu(ev, from);
        return;
      }
      const el = (_b = (_a = document.elementFromPoint) == null ? void 0 : _a.call(document, ev.clientX, ev.clientY)) == null ? void 0 : _b.closest(".block-editor-col-editor");
      const to = el ? this.colEls.indexOf(el) : -1;
      if (to !== -1 && to !== from) {
        this.later((view) => {
          const [t] = this.texts.splice(from, 1);
          this.texts.splice(to, 0, t);
          const [w] = this.widths.splice(from, 1);
          this.widths.splice(to, 0, w);
          const [b] = this.bgs.splice(from, 1);
          this.bgs.splice(to, 0, b);
          queueMicrotask(() => this.commitDoc());
          this.render();
        });
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  // ---- grip 命令菜单：设置背景色 / 新增栏 / 删除栏（横排纯图标） ----
  /** lucide 风格内联图标（不依赖 Obsidian setIcon，测试环境同样可用） */
  static iconEl(paths) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const d of paths) {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    }
    return svg;
  }
  closeMenu() {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
  }
  closeColorPicker() {
    if (this.colorPickerEl) {
      this.colorPickerEl.remove();
      this.colorPickerEl = null;
    }
  }
  /** 写入某栏背景色并同步到文档与渲染（color 为 null 表示清除背景） */
  applyBg(i, color) {
    this.bgs[i] = color;
    queueMicrotask(() => this.commitDoc());
    this.render();
  }
  showColMenu(e, i) {
    this.closeMenu();
    this.closeColorPicker();
    const menu = document.createElement("div");
    menu.className = "block-editor-col-menu";
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";
    const bgBtn = document.createElement("button");
    bgBtn.className = "block-editor-col-menu-item";
    bgBtn.title = "\u8BBE\u7F6E\u80CC\u666F\u8272";
    bgBtn.appendChild(_ColumnsWidget.iconEl(_ColumnsWidget.ICON_PALETTE));
    bgBtn.addEventListener("click", () => {
      this.closeMenu();
      this.openColorPicker(i, e.clientX, e.clientY);
    });
    const addBtn = document.createElement("button");
    addBtn.className = "block-editor-col-menu-item";
    addBtn.title = "\u65B0\u589E\u680F";
    addBtn.appendChild(_ColumnsWidget.iconEl(_ColumnsWidget.ICON_PLUS));
    addBtn.addEventListener("click", () => {
      this.closeMenu();
      this.addColumnAt(i);
    });
    const delBtn = document.createElement("button");
    delBtn.className = "block-editor-col-menu-item";
    delBtn.title = "\u5220\u9664\u680F";
    const single = this.texts.length <= 1;
    if (single) {
      delBtn.disabled = true;
      delBtn.title = "\u53EA\u5269 1 \u680F\uFF0C\u65E0\u6CD5\u5220\u9664";
    }
    delBtn.appendChild(_ColumnsWidget.iconEl(_ColumnsWidget.ICON_X));
    delBtn.addEventListener("click", () => {
      this.closeMenu();
      this.removeColumn(i);
    });
    menu.appendChild(bgBtn);
    menu.appendChild(addBtn);
    menu.appendChild(delBtn);
    document.body.appendChild(menu);
    this.menuEl = menu;
    setTimeout(() => {
      window.addEventListener("mousedown", this.onDocMouseDown, { once: true });
    }, 0);
  }
  /** 弹窗选色：预设色板 + 自定义 hex + 无背景色（清除） */
  openColorPicker(i, x, y) {
    var _a, _b;
    this.closeColorPicker();
    const picker = document.createElement("div");
    picker.className = "block-editor-col-picker";
    picker.style.left = x + "px";
    picker.style.top = y + "px";
    const title = document.createElement("div");
    title.className = "block-editor-col-picker-title";
    title.textContent = "\u7B2C " + (i + 1) + " \u680F\u80CC\u666F\u8272";
    picker.appendChild(title);
    const swatches = document.createElement("div");
    swatches.className = "block-editor-col-picker-swatches";
    for (const c of _ColumnsWidget.BG_PALETTE) {
      const sw = document.createElement("button");
      sw.className = "block-editor-col-picker-swatch";
      sw.style.backgroundColor = c;
      sw.title = c;
      sw.addEventListener("click", () => {
        this.closeColorPicker();
        this.applyBg(i, c);
      });
      swatches.appendChild(sw);
    }
    picker.appendChild(swatches);
    const customRow = document.createElement("div");
    customRow.className = "block-editor-col-picker-custom";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "block-editor-col-picker-native";
    colorInput.value = (_a = this.bgs[i]) != null ? _a : "#f1f3f5";
    colorInput.title = "\u81EA\u5B9A\u4E49\u989C\u8272";
    colorInput.addEventListener("input", () => {
      input.value = colorInput.value;
      input.classList.remove("is-invalid");
    });
    colorInput.addEventListener("change", () => {
      this.closeColorPicker();
      this.applyBg(i, colorInput.value);
    });
    const hexRow = document.createElement("div");
    hexRow.className = "block-editor-col-picker-hex";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "#RRGGBB";
    input.value = (_b = this.bgs[i]) != null ? _b : "";
    input.spellcheck = false;
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") applyHex();
    });
    const applyBtn = document.createElement("button");
    applyBtn.className = "block-editor-col-picker-apply";
    applyBtn.textContent = "\u5E94\u7528";
    const applyHex = () => {
      const v = input.value.trim();
      if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) {
        input.classList.add("is-invalid");
        return;
      }
      this.closeColorPicker();
      this.applyBg(i, v);
    };
    applyBtn.addEventListener("click", applyHex);
    hexRow.appendChild(input);
    hexRow.appendChild(applyBtn);
    customRow.appendChild(colorInput);
    customRow.appendChild(hexRow);
    picker.appendChild(customRow);
    const clearBtn = document.createElement("button");
    clearBtn.className = "block-editor-col-picker-clear";
    clearBtn.textContent = "\u65E0\u80CC\u666F\u8272\uFF08\u6E05\u9664\uFF09";
    clearBtn.addEventListener("click", () => {
      this.closeColorPicker();
      this.applyBg(i, null);
    });
    picker.appendChild(clearBtn);
    document.body.appendChild(picker);
    this.colorPickerEl = picker;
    setTimeout(() => {
      window.addEventListener("mousedown", this.onDocMouseDown, { once: true });
    }, 0);
  }
};
_ColumnsWidget.ICON_PALETTE = [
  "M12 22a10 10 0 1 1 10-10c0 2.21-1.79 4-4 4h-2.5c-1.1 0-2 .9-2 2 0 .55.23 1.05.59 1.41.37.36.59.86.59 1.41 0 1.1-.9 2-2 2z",
  "M7 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  "M12 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  "M17 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
];
_ColumnsWidget.ICON_PLUS = ["M5 12h14", "M12 5v14"];
_ColumnsWidget.ICON_X = ["M18 6 6 18", "M6 6l12 12"];
/** 5 个协调的柔和预设背景色 */
_ColumnsWidget.BG_PALETTE = ["#f1f3f5", "#ffe8e8", "#fff4d6", "#d8f3dc", "#d0ebff"];
var ColumnsWidget = _ColumnsWidget;
function path_of(state) {
  var _a, _b;
  const mv = state.field(import_obsidian7.editorInfoField);
  return (_b = (_a = mv == null ? void 0 : mv.file) == null ? void 0 : _a.path) != null ? _b : "";
}
var widgetCache = /* @__PURE__ */ new Map();
var sharedCtx = null;
function buildDecorations(state, regions) {
  var _a, _b, _c, _d;
  const ranges = [];
  const live = state.field(import_obsidian7.editorLivePreviewField);
  lastDiagnostics.livePreview = live;
  lastDiagnostics.regions = regions.length;
  lastDiagnostics.note = lastDiagnostics.markerLines > 0 && regions.length === 0 ? "\u5B58\u5728\u5206\u680F\u6807\u8BB0\u4F46\u672A\u8BC6\u522B\u51FA\u533A\u95F4" : "";
  lastDiagnostics.segmentsPreview = regions.flatMap(
    (r) => r.segments.map((seg) => seg.slice(0, 30).replace(/\n/g, "\u23CE"))
  );
  colLog("\u6784\u5EFA\u88C5\u9970", { live, markerLines: lastDiagnostics.markerLines, regions: regions.length });
  if (!(sharedCtx == null ? void 0 : sharedCtx.settings.livePreviewWidget) || !live) {
    lastDiagnostics.note = !(sharedCtx == null ? void 0 : sharedCtx.settings.livePreviewWidget) ? "\u5F00\u5173\u5173\u95ED\uFF1A\u672A\u6E32\u67D3 widget" : "\u6E90\u7801\u6A21\u5F0F\uFF1A\u672A\u6E32\u67D3 widget";
    widgetCache.clear();
    return import_view.Decoration.none;
  }
  const used = /* @__PURE__ */ new Set();
  for (const r of regions) {
    used.add(r.startPos);
    const key = r.segments.join("\0") + "#" + ((_b = (_a = r.widths) == null ? void 0 : _a.join(",")) != null ? _b : "") + "#" + ((_d = (_c = r.bgs) == null ? void 0 : _c.join(",")) != null ? _d : "");
    let entry = widgetCache.get(r.startPos);
    let widget;
    if (entry && entry.key === key) {
      widget = entry.widget;
      widget.region = r;
    } else {
      colLog("\u521B\u5EFA\u6E32\u67D3 widget", { startLine: r.startLine });
      widget = new ColumnsWidget(ctx_of(state), r, path_of(state));
      widgetCache.set(r.startPos, { key, widget });
    }
    ranges.push(import_view.Decoration.replace({ block: true, widget }).range(r.startPos, r.endPos));
  }
  for (const k of [...widgetCache.keys()]) if (!used.has(k)) widgetCache.delete(k);
  return import_view.Decoration.set(ranges, true);
}
function ctx_of(state) {
  return sharedCtx;
}
var columnsField = import_state.StateField.define({
  create: () => {
    colLog("\u5206\u680F\u5B57\u6BB5\u521B\u5EFA\uFF08\u7F16\u8F91\u5668\u521D\u59CB\u5316\uFF09");
    return { initialized: false, regions: [], decorations: import_view.Decoration.none };
  },
  update(value, tr) {
    let forced = false;
    for (const e of tr.effects) {
      if (e.is(forceRecompute)) {
        forced = true;
        colLog("\u6536\u5230\u5F3A\u5236\u91CD\u7B97\u6548\u679C");
      }
    }
    try {
      if (value.initialized && !tr.docChanged && !forced) return value;
      const stats = { markerLines: 0 };
      const regions = scanRegions(tr.state.doc, stats);
      lastDiagnostics.markerLines = stats.markerLines;
      colLog("\u626B\u63CF\u5B8C\u6210", {
        \u672A\u521D\u59CB\u5316\u91CD\u626B: !value.initialized,
        \u533A\u95F4\u6570: regions.length,
        \u533A\u95F4\u8303\u56F4: regions.map((r) => [r.startLine, r.endLine])
      });
      const decorations = buildDecorations({ doc: tr.state.doc, field: (f) => tr.state.field(f) }, regions);
      return { initialized: true, regions, decorations };
    } catch (e) {
      lastDiagnostics.note = e instanceof Error ? e.message : String(e);
      return value;
    }
  },
  // 关键：把字段中的装饰接到 decorations facet——
  // 没有这一步，装饰只存在于字段值里，视图根本看不到；
  // 且经 compute 提供的值是静态 DecorationSet，块替换才被 CM6 允许
  provide: (f) => import_view.EditorView.decorations.compute([f], (state) => state.field(f).decorations)
});
var columnsInteractions = import_view.ViewPlugin.fromClass(
  class {
    constructor(view) {
      colLog("\u7F16\u8F91\u5668\u6302\u8F7D \u2192 \u8865\u7B97\u88C5\u9970");
      const v = view;
      queueMicrotask(() => {
        try {
          v.dispatch({ effects: forceRecompute.of(null) });
        } catch (e) {
        }
      });
    }
  }
);
function columnsExtension(ctx) {
  sharedCtx = ctx;
  return import_state.Prec.highest([columnsField, columnsInteractions]);
}
function recomputeColumnsEditors(app) {
  app.workspace.iterateAllLeaves((leaf) => {
    const mv = leaf.view;
    const cm = (mv == null ? void 0 : mv.editor) ? getCM(mv.editor) : null;
    if (!cm) return;
    try {
      cm.dispatch({ effects: forceRecompute.of(null) });
    } catch (e) {
    }
  });
}

// src/commands.ts
var import_obsidian8 = require("obsidian");
var ColumnsDiagModal = class extends import_obsidian8.Modal {
  constructor(app, json) {
    super(app);
    this.json = json;
    this.titleEl.setText("\u5206\u680F\u8BCA\u65AD");
  }
  onOpen() {
    const pre = this.contentEl.createEl("pre", { text: this.json });
    pre.setAttribute(
      "style",
      "font-size:12px; white-space:pre-wrap; user-select:text; max-height:60vh; overflow:auto; margin:0;"
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};
function registerCommands(plugin) {
  plugin.addCommand({
    id: "move-block-up",
    name: "\u4E0A\u79FB\u5F53\u524D\u5757",
    hotkeys: [{ modifiers: ["Alt"], key: "ArrowUp" }],
    editorCallback: (editor) => plugin.ops.moveCurrentBlock(editor, -1)
  });
  plugin.addCommand({
    id: "move-block-down",
    name: "\u4E0B\u79FB\u5F53\u524D\u5757",
    hotkeys: [{ modifiers: ["Alt"], key: "ArrowDown" }],
    editorCallback: (editor) => plugin.ops.moveCurrentBlock(editor, 1)
  });
  plugin.addCommand({
    id: "open-block-menu",
    name: "\u6253\u5F00\u5757\u83DC\u5355",
    editorCallback: (editor) => plugin.menu.openMenuAtCursor(editor)
  });
  plugin.addCommand({
    id: "indent-block",
    name: "\u5F53\u524D\u5757\u7F29\u8FDB\u4E00\u7EA7",
    editorCallback: (editor) => plugin.ops.indentCurrentBlock(editor, 1)
  });
  plugin.addCommand({
    id: "outdent-block",
    name: "\u5F53\u524D\u5757\u51CF\u5C11\u4E00\u7EA7\u7F29\u8FDB",
    editorCallback: (editor) => plugin.ops.indentCurrentBlock(editor, -1)
  });
  plugin.addCommand({
    id: "copy-block-link",
    name: "\u590D\u5236\u5F53\u524D\u5757\u94FE\u63A5",
    editorCallback: (editor) => plugin.ids.copyCurrentBlockLink(editor)
  });
  plugin.addCommand({
    id: "duplicate-block",
    name: "\u91CD\u590D\u5F53\u524D\u5757",
    editorCallback: (editor) => plugin.ops.duplicateCurrentBlock(editor)
  });
  plugin.addCommand({
    id: "clear-block-ids",
    name: "\u6E05\u9664\u672C\u6587\u6240\u6709\u5757 ID",
    editorCallback: (editor) => plugin.ids.clearBlockIds(editor)
  });
  plugin.addCommand({
    id: "debug-columns-dom",
    name: "\u5F00\u53D1\uFF1A\u590D\u5236\u5206\u680F\u8BCA\u65AD\u4FE1\u606F",
    callback: () => {
      var _a, _b, _c;
      const mdView = plugin.app.workspace.getActiveViewOfType(import_obsidian8.MarkdownView);
      if (!mdView) {
        new import_obsidian8.Notice("\u5F53\u524D\u6CA1\u6709\u6D3B\u52A8\u7684\u7B14\u8BB0\u89C6\u56FE");
        return;
      }
      const diag = getColumnsDiagnostics();
      const info = {
        // Obsidian 中 Live Preview 的 MarkdownView.getMode() 返回 "source"（渲染变体），
        // 需结合 editorLivePreviewField 标注，避免误读为源码模式
        mode: mdView.getMode() + (diag.livePreview ? " (live-preview)" : ""),
        file: (_b = (_a = mdView.file) == null ? void 0 : _a.path) != null ? _b : null
      };
      const cm = getCM(mdView.editor);
      const dom = cm == null ? void 0 : cm.dom;
      if (dom) {
        info.widgetCount = dom.querySelectorAll(".block-editor-columns-widget").length;
        info.cmCalloutCount = dom.querySelectorAll(".cm-callout").length;
        info.multiColumnCalloutCount = dom.querySelectorAll(
          '.callout[data-callout="multi-column"]'
        ).length;
        const el = (_c = dom.querySelector(".cm-callout")) != null ? _c : dom.querySelector('.callout[data-callout="multi-column"]');
        info.sample = el ? el.outerHTML.slice(0, 2500) : "(\u7F16\u8F91\u5668\u5185\u672A\u627E\u5230 callout DOM)";
      } else {
        info.editorDom = "\u4E0D\u53EF\u7528";
      }
      info.columnsDetection = diag;
      const json = JSON.stringify(info, null, 2);
      new ColumnsDiagModal(this.app, json).open();
      navigator.clipboard.writeText(json).then(() => new import_obsidian8.Notice("\u8BCA\u65AD\u4FE1\u606F\u5DF2\u540C\u65F6\u590D\u5236\u5230\u526A\u8D34\u677F"));
    }
  });
  for (const [id, title] of TURN_INTO) {
    plugin.addCommand({
      id: "turn-into-" + id,
      name: "\u8F6C\u6362\u4E3A\uFF1A" + title,
      editorCallback: (editor) => plugin.converter.convertCurrentBlock(editor, id)
    });
  }
}

// src/settings.ts
var import_obsidian9 = require("obsidian");
var DEFAULT_SETTINGS = {
  showHandle: true,
  handleFollowsCursor: true,
  slashCommands: true,
  dragAutoScroll: true,
  indentStep: 0,
  livePreviewWidget: false
};
var BlockEditorSettingTab = class extends import_obsidian9.PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Block Editor \u8BBE\u7F6E" });
    new import_obsidian9.Setting(containerEl).setName("\u663E\u793A\u5757\u624B\u67C4").setDesc("\u5728\u7F16\u8F91\u5668\u5DE6\u4FA7\u663E\u793A Notion \u98CE\u683C\u7684\u5757\u624B\u67C4").addToggle(
      (t) => t.setValue(this.plugin.settings.showHandle).onChange(async (value) => {
        this.plugin.settings.showHandle = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian9.Setting(containerEl).setName("\u624B\u67C4\u8DDF\u968F\u5149\u6807").setDesc("\u5149\u6807\u79FB\u52A8\u540E\u624B\u67C4\u81EA\u52A8\u8DDF\u5230\u5F53\u524D\u5757\uFF1B\u5173\u95ED\u540E\u4EC5\u5728\u9F20\u6807\u60AC\u505C\u65F6\u663E\u793A").addToggle(
      (t) => t.setValue(this.plugin.settings.handleFollowsCursor).onChange(async (value) => {
        this.plugin.settings.handleFollowsCursor = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian9.Setting(containerEl).setName("\u5B9E\u9A8C\uFF1A\u5B9E\u65F6\u9884\u89C8\u81EA\u6E32\u67D3\u5206\u680F").setDesc("\u5F00\u542F\u540E\u5B9E\u65F6\u9884\u89C8\u4E2D\u5206\u680F\u533A\u57DF\u7531\u63D2\u4EF6\u81EA\u6E32\u67D3\uFF08\u53CC\u51FB\u8FDB\u5165\u7F16\u8F91\uFF09\uFF1B\u5173\u95ED\u65F6\u663E\u793A\u539F\u751F\u5D4C\u5957 callout\u3002\u66F4\u6539\u540E\u7ACB\u5373\u751F\u6548").addToggle(
      (t) => t.setValue(this.plugin.settings.livePreviewWidget).onChange(async (value) => {
        this.plugin.settings.livePreviewWidget = value;
        document.body.classList.toggle("be-columns-live-on", value);
        await this.plugin.saveSettings();
        recomputeColumnsEditors(this.plugin.app);
      })
    );
    new import_obsidian9.Setting(containerEl).setName("\u542F\u7528\u659C\u6760\u547D\u4EE4").setDesc("\u5728\u6B63\u6587\u4E2D\u8F93\u5165 / \u5FEB\u901F\u628A\u5F53\u524D\u5757\u8F6C\u6362\u4E3A\u5176\u4ED6\u7C7B\u578B").addToggle(
      (t) => t.setValue(this.plugin.settings.slashCommands).onChange(async (value) => {
        this.plugin.settings.slashCommands = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian9.Setting(containerEl).setName("\u62D6\u62FD\u81EA\u52A8\u6EDA\u52A8").setDesc("\u62D6\u52A8\u5757\u5230\u7F16\u8F91\u533A\u4E0A\u4E0B\u8FB9\u7F18\u65F6\u81EA\u52A8\u6EDA\u52A8").addToggle(
      (t) => t.setValue(this.plugin.settings.dragAutoScroll).onChange(async (value) => {
        this.plugin.settings.dragAutoScroll = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian9.Setting(containerEl).setName("\u7F29\u8FDB\u6B65\u957F").setDesc("\u5757\u7F29\u8FDB / \u51CF\u5C11\u7F29\u8FDB\u65F6\u7684\u7A7A\u683C\u6570\uFF0C0 \u8868\u793A\u81EA\u52A8\u68C0\u6D4B\u5168\u6587\u6700\u5C0F\u7F29\u8FDB").addSlider(
      (s) => s.setLimits(0, 8, 1).setValue(this.plugin.settings.indentStep).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.indentStep = value;
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/main.ts
var BlockEditorPlugin = class extends import_obsidian10.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.detector = new BlockDetector();
    this.selection = new SelectionManager(this);
    this.converter = new BlockConverter(this);
    this.ids = new BlockIdService(this);
    this.ops = new BlockOps(this);
    this.menu = new BlockMenuController(this);
    this.handle = new HandleController(this);
    this.drag = new DragController(this);
  }
  async onload() {
    console.log("[block-editor]", this.manifest.version, "onload");
    await this.loadSettings();
    document.body.classList.toggle("be-columns-live-on", this.settings.livePreviewWidget);
    this.handle.init();
    this.drag.init();
    this.selection.init();
    registerCommands(this);
    this.registerEditorSuggest(new SlashSuggest(this));
    this.registerEditorExtension(columnsExtension(this));
    this.registerMarkdownPostProcessor((el) => {
      if (!this.settings.livePreviewWidget) return;
      el.querySelectorAll('.callout[data-callout="col"]').forEach((callout) => {
        var _a;
        const meta = (_a = callout.getAttribute("data-callout-metadata")) != null ? _a : "";
        const m = meta.match(/(?:^|\s)bg=([#0-9a-fA-F]{3,8})(?:\s|$)/);
        if (m) callout.style.backgroundColor = m[1];
      });
      el.querySelectorAll('.callout[data-callout="multi-column"]').forEach((shell) => {
        var _a;
        const meta = (_a = shell.getAttribute("data-callout-metadata")) != null ? _a : "";
        const wm = meta.match(/(?:^|\s)(\d+(?:-\d+)+)(?:\s|$)/);
        if (!wm) return;
        const widths = wm[1].split("-").map((x) => Number(x));
        if (widths.length === 0 || widths.some((w) => !Number.isFinite(w) || w <= 0)) return;
        const content = shell.querySelector(":scope > .callout-content");
        if (!content) return;
        const cols = [];
        for (const child of Array.from(content.children)) {
          if (child.classList.contains("callout") && child.getAttribute("data-callout") === "col") {
            cols.push(child);
          } else if (child.classList.contains("cm-callout")) {
            const inner = child.querySelector(':scope > .callout[data-callout="col"]');
            if (inner) cols.push(inner);
          }
        }
        if (cols.length !== widths.length) return;
        cols.forEach((col, i) => {
          col.style.flex = `${widths[i]} 1 0`;
        });
      });
    });
    this.registerDomEvent(
      document,
      "mousemove",
      (e) => {
        if (this.drag.isActive()) this.drag.onDragMove(e);
        else this.handle.onMouseMove(e);
      },
      true
    );
    this.registerDomEvent(
      document,
      "mouseup",
      (e) => {
        this.drag.onMouseUp(e);
        this.handle.updateCursorBlock();
      },
      true
    );
    this.registerDomEvent(document, "keyup", () => this.handle.updateCursorBlock(), true);
    this.registerDomEvent(
      document,
      "keydown",
      (e) => {
        if (e.key === "Escape" && this.selection.selection) this.selection.clearSelection();
      },
      true
    );
    this.registerDomEvent(
      window,
      "scroll",
      () => {
        this.handle.scheduleHide();
        this.handle.renderHighlight();
        this.selection.renderSelection();
      },
      true
    );
    this.registerDomEvent(window, "resize", () => {
      this.handle.scheduleHide();
      this.handle.renderHighlight();
      this.selection.renderSelection();
    });
    this.registerEvent(
      this.app.workspace.on("editor-change", (editor) => {
        const sel = this.selection.selection;
        if (sel && sel.editor === editor) this.selection.clearSelection();
      })
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        flushEditingColumns();
        this.selection.clearSelection();
        this.handle.updateCursorBlock();
      })
    );
    this.registerEvent(this.app.workspace.on("quit", () => flushEditingColumns()));
    this.addSettingTab(new BlockEditorSettingTab(this));
  }
  onunload() {
    flushEditingColumns();
    this.drag.destroy();
    this.handle.destroy();
    this.selection.destroy();
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
