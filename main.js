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
  BLOCK_COLOR_RE: () => BLOCK_COLOR_RE,
  BLOCK_COLOR_SPAN_RE: () => BLOCK_COLOR_SPAN_RE,
  BlockConverter: () => BlockConverter,
  BlockInserter: () => BlockInserter,
  INSERT_SPECS: () => INSERT_SPECS,
  INSERT_TOGGLE_KEY: () => INSERT_TOGGLE_KEY,
  applyBlockColorFromSource: () => applyBlockColorFromSource,
  applyBlockColorToDom: () => applyBlockColorToDom,
  blockColorExtension: () => blockColorExtension,
  blockColorField: () => blockColorField,
  buildColumnsMarkdown: () => buildColumnsMarkdown,
  buildSlashItems: () => buildSlashItems,
  columnsExtension: () => columnsExtension,
  columnsField: () => columnsField,
  default: () => BlockEditorPlugin,
  enabledInsertIds: () => enabledInsertIds,
  filterSlashItems: () => filterSlashItems,
  formatDateTime: () => formatDateTime,
  getBlockColorDiagnostics: () => getBlockColorDiagnostics,
  getColumnsDiagnostics: () => getColumnsDiagnostics,
  isBlockedContext: () => isBlockedContext,
  parseBlockColorValue: () => parseBlockColorValue,
  planListColumns: () => planListColumns,
  resolveSnippet: () => resolveSnippet,
  scanBlockIds: () => scanBlockIds,
  slashTrigger: () => slashTrigger
});
module.exports = __toCommonJS(main_exports);
var import_obsidian11 = require("obsidian");

// src/util.ts
function getCM(editor) {
  const cm = editor.cm;
  return cm != null ? cm : null;
}
function getIndent(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1] : "";
}
function colValignToCss(v) {
  if (v === "top") return "flex-start";
  if (v === "bottom") return "flex-end";
  return v;
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
function keepViewport(cm, fn) {
  const sd = cm == null ? void 0 : cm.scrollDOM;
  if (!sd) {
    fn();
    return;
  }
  const top = sd.scrollTop;
  fn();
  if (sd.scrollTop !== top) sd.scrollTop = top;
  window.requestAnimationFrame(() => {
    if (sd.scrollTop !== top) sd.scrollTop = top;
  });
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
    const layer = createEl("div");
    layer.className = "block-editor-selection-layer";
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
    const editorDom = cm.dom;
    const editorRect = editorDom.getBoundingClientRect();
    if (layer.parentElement !== editorDom) editorDom.appendChild(layer);
    const doc = cm.state.doc;
    for (const r of sel.ranges) {
      if (r.start >= doc.lines || r.end >= doc.lines) continue;
      const from = cm.coordsAtPos(doc.line(r.start + 1).from);
      const below = doc.line(r.end + 1);
      const to = cm.coordsAtPos(below.to);
      if (!from || !to) continue;
      const top = Math.max(from.top - editorRect.top, 0);
      const bottom = Math.min(to.bottom - editorRect.top, editorRect.height);
      if (bottom - top < 4) continue;
      const box = createEl("div");
      box.className = "block-editor-selection";
      box.style.top = top + "px";
      box.style.height = bottom - top + "px";
      box.setCssStyles({ left: "0" });
      box.style.width = editorRect.width + "px";
      layer.appendChild(box);
    }
  }
};

// src/convert.ts
var import_obsidian = require("obsidian");

// src/block-color.ts
var import_view2 = require("@codemirror/view");
var import_state = require("@codemirror/state");

// src/col-bg.ts
var COL_META_BG_RE = /(?:^|[\s|])bg=([#0-9a-fA-F]{3,8})(?:$|[\s|])/;
var COL_META_BG_DARK_RE = /(?:^|[\s|])bg-dark=([#0-9a-fA-F]{3,8})(?:$|[\s|])/;
function parseColBgMeta(meta) {
  const lm = meta.match(COL_META_BG_RE);
  const dm = meta.match(COL_META_BG_DARK_RE);
  return normalizeColBg(lm ? lm[1] : null, dm ? dm[1] : null);
}
function normalizeColBg(light, dark) {
  if (!light) return null;
  if (dark && /^#[0-9a-fA-F]{3,8}$/.test(dark)) return { light, dark };
  return { light, dark: deriveDarkColor(light) };
}
function hexToRgba(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 && h.length !== 8) h = h.slice(0, 6).padEnd(6, "0");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a];
}
function rgbaToHex(r, g, b, a) {
  const to = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  let hex = "#" + to(r) + to(g) + to(b);
  if (a < 1) hex += to(a * 255);
  return hex;
}
function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  const hue2rgb = (p2, q2, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p2 + (q2 - p2) * 6 * t;
    if (t < 1 / 2) return q2;
    if (t < 2 / 3) return p2 + (q2 - p2) * (2 / 3 - t) * 6;
    return p2;
  };
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  ];
}
function relativeLuminance(r, g, b) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function deriveDarkColor(light) {
  const [r, g, b, a] = hexToRgba(light);
  const [h, s, l] = rgbToHsl(r, g, b);
  let nl;
  if (l > 0.5) {
    nl = 0.08 + (l - 0.5) * (0.25 - 0.08) / 0.5;
  } else {
    nl = Math.max(l, 0.08);
  }
  const ns = Math.max(0, Math.min(1, s * 0.5));
  const [br, bg, bb] = hexToRgba("#1e1e1e");
  const lumBg = relativeLuminance(br, bg, bb);
  let curL = nl;
  let nr = 0;
  let ng = 0;
  let nb = 0;
  for (let guard = 0; guard < 60; guard++) {
    [nr, ng, nb] = hslToRgb(h, ns, curL);
    const lum = relativeLuminance(nr, ng, nb);
    if ((lum + 0.05) / (lumBg + 0.05) >= 1.4 || curL >= 0.45) break;
    curL += 0.01;
  }
  return rgbaToHex(nr, ng, nb, a);
}
function pickContrastText(bg) {
  const [r, g, b] = hexToRgba(bg);
  const yiq = (r * 299 + g * 587 + b * 114) / 1e3;
  return yiq >= 150 ? "#1a1a1a" : "#f2f2f2";
}
function setColBgVars(el, bg) {
  var _a, _b;
  const set = (name, v) => {
    if (v) el.style.setProperty(name, v);
    else el.style.removeProperty(name);
  };
  set("--col-bg-light", (_a = bg == null ? void 0 : bg.light) != null ? _a : null);
  set("--col-bg-text-light", (bg == null ? void 0 : bg.light) ? pickContrastText(bg.light) : null);
  set("--col-bg-dark", (_b = bg == null ? void 0 : bg.dark) != null ? _b : null);
  set("--col-bg-text-dark", (bg == null ? void 0 : bg.dark) ? pickContrastText(bg.dark) : null);
}

// src/cm6-deco-guard.ts
var import_view = require("@codemirror/view");
function guardDecorations(set, docLength) {
  if (set === import_view.Decoration.none || !set || typeof set.iter !== "function") {
    return set;
  }
  const len = Number.isFinite(docLength) && docLength >= 0 ? docLength : 0;
  let bad = false;
  const kept = [];
  try {
    const iter = set.iter();
    while (iter.value !== null) {
      const { from, to, value } = iter;
      if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
        bad = true;
        iter.next();
        continue;
      }
      if (from > len || to < 0) {
        bad = true;
        iter.next();
        continue;
      }
      if (from >= 0 && to <= len) {
        kept.push(value.range(from, to));
        iter.next();
        continue;
      }
      const nf = Math.max(0, from);
      const nt = Math.min(len, to);
      if (nf > nt) {
        bad = true;
        iter.next();
        continue;
      }
      bad = true;
      kept.push(value.range(nf, nt));
      iter.next();
    }
  } catch (e) {
    return import_view.Decoration.none;
  }
  if (!bad) return set;
  return import_view.Decoration.set(kept, true);
}
function safeDecoCompute(compute, log = () => {
}) {
  return (state) => {
    try {
      const set = compute(state);
      const doc = state == null ? void 0 : state.doc;
      const len = doc && typeof doc.length === "number" ? doc.length : 0;
      return guardDecorations(set, len);
    } catch (e) {
      log("decorations.compute \u5F02\u5E38\u5DF2\u6536\u655B\uFF0C\u672C\u6B21\u8FD4\u56DE\u7A7A\u88C5\u9970", e);
      return import_view.Decoration.none;
    }
  };
}

// src/block-color.ts
var BLOCK_COLOR_RE = /%%\s*block-color:\s*([^%]+?)\s*%%/;
var BLOCK_COLOR_COMMENT_RE = /block-color:\s*([^%]+?)\s*(?:%%\s*)?$/;
var BLOCK_COLOR_SPAN_RE = /<span\b[^>]*\bdata-block-color=["']([^"']+)["'][^>]*>\s*<\/span>/gi;
var BLOCK_COLOR_PALETTE = [
  "#f1f3f5",
  "#ffe8e8",
  "#fff4d6",
  "#d8f3dc",
  "#d0ebff",
  "#ffd6e7",
  "#e5dbff",
  "#e6fcf5"
];
var NAMED_COLORS = /* @__PURE__ */ new Set([
  "red",
  "blue",
  "green",
  "yellow",
  "orange",
  "purple",
  "pink",
  "gray",
  "grey",
  "brown",
  "black",
  "white",
  "cyan",
  "teal",
  "indigo",
  "violet",
  "magenta",
  "lime",
  "olive",
  "navy",
  "maroon",
  "silver",
  "gold",
  "coral",
  "salmon",
  "tomato",
  "khaki",
  "beige",
  "mint",
  "lavender",
  "turquoise",
  "tan",
  "plum",
  "orchid",
  "crimson",
  "darkred",
  "darkblue",
  "darkgreen",
  "darkorange",
  "darkgray",
  "darkgrey",
  "lightgray",
  "lightgrey",
  "lightblue",
  "lightgreen",
  "lightyellow",
  "lightpink"
]);
function normalizeBlockColor(raw) {
  const v = raw.trim().toLowerCase();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v)) return v;
  if (NAMED_COLORS.has(v)) return v;
  return null;
}
var HEX_RE = /^#[0-9a-f]{3,8}$/;
function parseBlockColorValue(raw) {
  var _a, _b;
  const v = raw.trim();
  if (!v) return null;
  const parts = v.split("|");
  const light = normalizeBlockColor((_a = parts[0]) != null ? _a : "");
  if (!light) return null;
  const darkRaw = ((_b = parts[1]) != null ? _b : "").trim();
  const dark = darkRaw ? normalizeBlockColor(darkRaw) : null;
  const lightIsHex = HEX_RE.test(light);
  if (lightIsHex) return normalizeColBg(light, dark);
  return dark && HEX_RE.test(dark) ? { light, dark } : { light, dark: null };
}
function hasBlockColorMarker(source) {
  BLOCK_COLOR_SPAN_RE.lastIndex = 0;
  const hit = BLOCK_COLOR_SPAN_RE.test(source);
  BLOCK_COLOR_SPAN_RE.lastIndex = 0;
  return hit || BLOCK_COLOR_RE.test(source);
}
function firstBlockColor(source) {
  BLOCK_COLOR_SPAN_RE.lastIndex = 0;
  const sm = BLOCK_COLOR_SPAN_RE.exec(source);
  BLOCK_COLOR_SPAN_RE.lastIndex = 0;
  const m = sm != null ? sm : BLOCK_COLOR_RE.exec(source);
  return m ? parseBlockColorValue(m[1]) : null;
}
function setBlockColorVars(el, bg) {
  var _a, _b;
  const set = (name, v) => {
    if (v) el.style.setProperty(name, v);
    else el.style.removeProperty(name);
  };
  const light = (_a = bg == null ? void 0 : bg.light) != null ? _a : null;
  const dark = (_b = bg == null ? void 0 : bg.dark) != null ? _b : null;
  set("--be-block-color-light", light);
  set("--be-block-color-text-light", light && HEX_RE.test(light) ? pickContrastText(light) : null);
  set("--be-block-color-dark", dark);
  set("--be-block-color-text-dark", dark && HEX_RE.test(dark) ? pickContrastText(dark) : null);
}
var blockColorDiagnostics = { note: "", lastScan: { lines: 0, hits: 0, skipped: 0 } };
function getBlockColorDiagnostics() {
  return { ...blockColorDiagnostics, lastScan: { ...blockColorDiagnostics.lastScan } };
}
function computeBlockColorDecorations(doc) {
  var _a, _b;
  const ranges = [];
  const diag = { lines: doc.length, hits: 0, skipped: 0 };
  const pushColor = (from, to, raw, lineFrom) => {
    if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(lineFrom) || from < 0 || to > doc.length || from > to || lineFrom < 0 || lineFrom > doc.length) {
      diag.skipped++;
      console.warn(LOG_TAG, "[deco-skip]", { from, to, docLen: doc.length, raw });
      return;
    }
    const bg = parseBlockColorValue(raw);
    if (!(bg == null ? void 0 : bg.light)) return;
    diag.hits++;
    ranges.push(import_view2.Decoration.mark({ attributes: { style: "display:none" } }).range(from, to));
    const light = bg.light;
    const dark = bg.dark;
    const lightHex = HEX_RE.test(light);
    const style = `--be-block-color-light:${light};` + (lightHex ? `--be-block-color-text-light:${pickContrastText(light)};` : "") + (dark ? `--be-block-color-dark:${dark};` : "") + (dark ? `--be-block-color-text-dark:${pickContrastText(dark)};` : "") + "background-color:var(--be-block-color);color:var(--be-block-color-text);";
    ranges.push(import_view2.Decoration.line({ attributes: { style } }).range(lineFrom, lineFrom));
  };
  for (let i = 0; i < doc.lines; i++) {
    const line = doc.line(i + 1);
    const m = BLOCK_COLOR_RE.exec(line.text);
    if (m) {
      const from = line.from + ((_a = m.index) != null ? _a : 0);
      pushColor(from, from + m[0].length, m[1], line.from);
      continue;
    }
    BLOCK_COLOR_SPAN_RE.lastIndex = 0;
    for (const sm of line.text.matchAll(BLOCK_COLOR_SPAN_RE)) {
      const idx = (_b = sm.index) != null ? _b : 0;
      pushColor(line.from + idx, line.from + idx + sm[0].length, sm[1], line.from);
    }
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  blockColorDiagnostics.lastScan = { lines: diag.lines, hits: diag.hits, skipped: diag.skipped };
  return import_view2.Decoration.set(ranges, true);
}
var blockColorField = import_state.StateField.define({
  create: () => {
    return { initialized: false, decorations: import_view2.Decoration.none };
  },
  update(value, tr) {
    try {
      if (value.initialized && !tr.docChanged) return value;
      const next = { initialized: true, decorations: computeBlockColorDecorations(tr.state.doc) };
      return next;
    } catch (e) {
      blockColorDiagnostics.note = e instanceof Error ? e.message : String(e);
      return value;
    }
  },
  provide: (f) => import_view2.EditorView.decorations.compute(
    [f],
    safeDecoCompute(
      (state) => state.field(f).decorations,
      (msg) => {
        blockColorDiagnostics.note = msg;
      }
    )
  )
});
function blockColorExtension(ctx) {
  return import_state.Prec.highest([blockColorField]);
}
var BLOCK_TAGS = /* @__PURE__ */ new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "BLOCKQUOTE",
  "PRE",
  "TD",
  "TH"
]);
var LOG_TAG = "[be-block-color]";
function applyColorToBlock(node, bg, done, root) {
  if (!bg.light) return false;
  let el = node;
  while (el && el !== root && !BLOCK_TAGS.has(el.tagName)) {
    el = el.parentElement;
  }
  if (!el) return false;
  if (done.has(el)) return false;
  if (el === root && !BLOCK_TAGS.has(el.tagName)) return false;
  done.add(el);
  setBlockColorVars(el, bg);
  el.setAttribute("data-block-color", bg.light);
  return true;
}
function applyBlockColorToDom(root) {
  var _a, _b, _c, _d, _e;
  const done = /* @__PURE__ */ new Set();
  const carriers = Array.from(root.querySelectorAll("[data-block-color]"));
  for (const carrier of carriers) {
    if (BLOCK_TAGS.has(carrier.tagName)) continue;
    const raw = (_a = carrier.getAttribute("data-block-color")) != null ? _a : "";
    if (!raw) continue;
    const bg = parseBlockColorValue(raw);
    if (!(bg == null ? void 0 : bg.light)) continue;
    applyColorToBlock(carrier, bg, done, root);
  }
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT
  );
  let node;
  while (node = walker.nextNode()) {
    const isComment = node.nodeType === Node.COMMENT_NODE;
    const raw = isComment ? (_b = node.nodeValue) != null ? _b : "" : (_c = node.textContent) != null ? _c : "";
    if (raw.length < 4) continue;
    const m = (_d = BLOCK_COLOR_RE.exec(raw)) != null ? _d : BLOCK_COLOR_COMMENT_RE.exec(raw);
    if (!m) continue;
    const bg = parseBlockColorValue(m[1]);
    if (!(bg == null ? void 0 : bg.light)) continue;
    const parent = node.parentElement;
    if (parent && applyColorToBlock(parent, bg, done, root)) {
      if (!isComment) {
        const textNode = node;
        const cleaned = (_e = textNode.textContent) != null ? _e : "";
        textNode.textContent = cleaned.replace(BLOCK_COLOR_RE, "").replace(/[ \t]+$/u, "");
      }
    }
  }
}
var SOURCE_BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th, tr";
function normalizeAnchor(raw) {
  let s = raw;
  s = s.replace(/^[\s>]+/, "");
  s = s.replace(/^#{1,6}\s*/, "");
  s = s.replace(/^(?:[-*+]|\d+[.)])\s+/, "");
  s = s.replace(/^\[[ xX]?\]\s*/, "");
  s = s.replace(/!?\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, a, b) => b != null ? b : a);
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/[*_~`]/g, "");
  s = s.replace(/==/g, "");
  s = s.replace(/\|/g, "");
  s = s.replace(/\s+/g, "");
  return s;
}
function applyBlockColorFromSource(el, source) {
  var _a;
  if (!source) return 0;
  const entries = [];
  for (const raw of source.split("\n")) {
    BLOCK_COLOR_SPAN_RE.lastIndex = 0;
    let hit = false;
    for (const m of raw.matchAll(BLOCK_COLOR_SPAN_RE)) {
      const bg = parseBlockColorValue(m[1]);
      if (!(bg == null ? void 0 : bg.light)) continue;
      entries.push({ light: bg.light, bg, anchor: normalizeAnchor(raw.replace(BLOCK_COLOR_SPAN_RE, "")), atStart: false });
      hit = true;
    }
    if (hit) continue;
    const mm = BLOCK_COLOR_RE.exec(raw);
    if (mm) {
      const bg = parseBlockColorValue(mm[1]);
      if (bg == null ? void 0 : bg.light) {
        entries.push({ light: bg.light, bg, anchor: normalizeAnchor(raw.replace(BLOCK_COLOR_RE, "")), atStart: true });
      }
    }
  }
  if (entries.length === 0) return 0;
  const candidates = Array.from(el.querySelectorAll(SOURCE_BLOCK_SELECTOR));
  if (el.matches(SOURCE_BLOCK_SELECTOR)) candidates.unshift(el);
  const done = /* @__PURE__ */ new Set();
  let from = 0;
  let applied = 0;
  for (const entry of entries) {
    let best = null;
    let bestLen = Infinity;
    let lastHit = -1;
    let found = false;
    for (let i = from; i < candidates.length; i++) {
      const c = candidates[i];
      if (done.has(c)) {
        if (found) break;
        continue;
      }
      const t = normalizeAnchor((_a = c.textContent) != null ? _a : "");
      const ok = entry.anchor ? entry.atStart ? t.startsWith(entry.anchor) : t.endsWith(entry.anchor) : t === "";
      if (ok) {
        found = true;
        if (t.length <= bestLen) {
          bestLen = t.length;
          best = c;
          lastHit = i;
        }
      } else if (found) {
        break;
      }
    }
    if (!best) continue;
    done.add(best);
    setBlockColorVars(best, entry.bg);
    best.setAttribute("data-block-color", entry.light);
    applied++;
    from = lastHit + 1;
  }
  return applied;
}
function openBlockColorPicker(opts) {
  const { x, y, current, onPick } = opts;
  const picker = createEl("div");
  picker.className = "block-editor-col-picker";
  picker.style.left = x + "px";
  picker.style.top = y + "px";
  const close = () => {
    picker.remove();
    window.removeEventListener("mousedown", onDocDown);
  };
  const onDocDown = (ev) => {
    if (!picker.contains(ev.target)) close();
  };
  const title = createEl("div");
  title.className = "block-editor-col-picker-title";
  title.textContent = "\u5757\u989C\u8272";
  picker.appendChild(title);
  const swatches = createEl("div");
  swatches.className = "block-editor-col-picker-swatches";
  for (const c of BLOCK_COLOR_PALETTE) {
    const sw = createEl("button");
    sw.className = "block-editor-col-picker-swatch";
    sw.style.backgroundColor = c;
    sw.title = c;
    sw.addEventListener("click", () => {
      close();
      onPick(c);
    });
    swatches.appendChild(sw);
  }
  picker.appendChild(swatches);
  const customRow = createEl("div");
  customRow.className = "block-editor-col-picker-custom";
  const colorInput = createEl("input");
  colorInput.type = "color";
  colorInput.className = "block-editor-col-picker-native";
  colorInput.value = current != null ? current : "#f1f3f5";
  colorInput.title = "\u81EA\u5B9A\u4E49\u989C\u8272";
  colorInput.addEventListener("input", () => {
    input.value = colorInput.value;
    input.classList.remove("is-invalid");
  });
  colorInput.addEventListener("change", () => {
    close();
    onPick(colorInput.value);
  });
  const hexRow = createEl("div");
  hexRow.className = "block-editor-col-picker-hex";
  const input = createEl("input");
  input.type = "text";
  input.placeholder = "#RRGGBB";
  input.value = current != null ? current : "";
  input.spellcheck = false;
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") applyHex();
  });
  const applyBtn = createEl("button");
  applyBtn.className = "block-editor-col-picker-apply";
  applyBtn.textContent = "\u5E94\u7528";
  const applyHex = () => {
    const v = normalizeBlockColor(input.value);
    if (!v) {
      input.classList.add("is-invalid");
      return;
    }
    close();
    onPick(v);
  };
  applyBtn.addEventListener("click", applyHex);
  hexRow.appendChild(input);
  hexRow.appendChild(applyBtn);
  customRow.appendChild(colorInput);
  customRow.appendChild(hexRow);
  picker.appendChild(customRow);
  const clearBtn = createEl("button");
  clearBtn.className = "block-editor-col-picker-clear";
  clearBtn.textContent = "\u6E05\u9664\u5757\u989C\u8272";
  clearBtn.addEventListener("click", () => {
    close();
    onPick(null);
  });
  picker.appendChild(clearBtn);
  document.body.appendChild(picker);
  window.setTimeout(() => window.addEventListener("mousedown", onDocDown, { once: true }), 0);
}

// src/convert.ts
var COL_START_RE = /^>\s*\[!multi-column(?:\|[^\]]*)?\]\s*$/;
var MERMAID_KINDS = /* @__PURE__ */ new Set([
  "graph",
  "flowchart",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "gantt",
  "pie",
  "quadrantChart",
  "requirementDiagram",
  "gitGraph",
  "mindmap",
  "timeline",
  "block-beta",
  "sankey",
  "journey",
  "xychart-beta",
  "zenuml",
  "architecture-beta",
  "packet-beta",
  "kanban",
  "example"
]);
function isMermaidContent(content) {
  var _a, _b;
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("%%")) continue;
    const word = (_b = (_a = t.match(/^[A-Za-z][\w-]*/)) == null ? void 0 : _a[0]) != null ? _b : "";
    return MERMAID_KINDS.has(word);
  }
  return false;
}
var COL_SEP_RE = /^>\s*$/;
var QUOTE_RE = /^>\s?/;
function buildColumnsMarkdown(segments, widths, bgs, rowEnds, opts) {
  const n = segments.length;
  const params = [];
  if (widths && widths.length === n) {
    let needsWidth = false;
    if (rowEnds && rowEnds.length) {
      let start = 0;
      for (const re of rowEnds) {
        const group = widths.slice(start, re + 1);
        if (group.some((w) => Math.abs(w - 100 / group.length) > 0.5)) {
          needsWidth = true;
          break;
        }
        start = re + 1;
      }
      if (!needsWidth && start < n) {
        const last = widths.slice(start);
        if (last.some((w) => Math.abs(w - 100 / last.length) > 0.5)) needsWidth = true;
      }
    } else {
      needsWidth = widths.some((w) => Math.abs(w - 100 / n) > 0.5);
    }
    if (needsWidth) {
      if (rowEnds && rowEnds.length) {
        const groups = [];
        let start = 0;
        for (const re of rowEnds) {
          groups.push(widths.slice(start, re + 1).map((w) => Math.round(w)).join("-"));
          start = re + 1;
        }
        if (start < n) groups.push(widths.slice(start).map((w) => Math.round(w)).join("-"));
        params.push(groups.join("/"));
      } else {
        params.push(widths.map((w) => Math.round(w)).join("-"));
      }
    }
  }
  if ((opts == null ? void 0 : opts.gap) != null) params.push(`gap=${opts.gap}`);
  if (opts == null ? void 0 : opts.valign) params.push(`valign=${opts.valign}`);
  if ((opts == null ? void 0 : opts.radius) != null) params.push(`radius=${opts.radius}`);
  if (opts == null ? void 0 : opts.border) params.push("border");
  const head = params.length ? `> [!multi-column|${params.join("|")}]` : "> [!multi-column]";
  const out = [head, ">"];
  segments.forEach((seg, i) => {
    if (i > 0) {
      out.push(">");
      if (rowEnds == null ? void 0 : rowEnds.includes(i - 1)) {
        out.push(">> [!colrow]");
        out.push(">");
      }
    }
    const bg = bgs == null ? void 0 : bgs[i];
    if (bg && bg.light) {
      const colParams = [`bg=${bg.light}`];
      if (bg.dark && bg.dark !== deriveDarkColor(bg.light)) colParams.push(`bg-dark=${bg.dark}`);
      out.push(`>> [!col|${colParams.join("|")}]`);
    } else {
      out.push(">> [!col]");
    }
    for (const line of seg.split("\n")) out.push(line.trim() === "" ? ">>" : ">> " + line);
  });
  return out.join("\n");
}
var LIST_ITEM_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+/;
function indentWidth(line) {
  return (line.match(/^(\s*)/) || ["", ""])[1].length;
}
function planListColumns(lines, level = 0) {
  const isItem = (l) => LIST_ITEM_RE.test(l);
  const itemIdx = [];
  for (let i = 0; i < lines.length; i++) if (isItem(lines[i])) itemIdx.push(i);
  if (!itemIdx.length) return { segments: [], reason: "no-list" };
  const indents = [];
  for (const i of itemIdx) {
    const n = indentWidth(lines[i]);
    if (!indents.includes(n)) indents.push(n);
  }
  indents.sort((a, b) => a - b);
  const cutIndent = indents[Math.min(level, indents.length - 1)];
  const baseIndent = indents[0];
  let head = [];
  if (level > 0 && cutIndent !== baseIndent) {
    const parents = itemIdx.filter((i) => indentWidth(lines[i]) === baseIndent);
    if (parents.length > 1) return { segments: [], reason: "multi-parent" };
    const firstCut = itemIdx.find((i) => indentWidth(lines[i]) === cutIndent);
    for (let i = 0; i < (firstCut != null ? firstCut : lines.length); i++) {
      if (lines[i].trim() !== "") head.push(lines[i]);
    }
  }
  const groups = [];
  let cur = null;
  let fenceCh = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fenceCh !== null) {
      const m = line.match(/^\s*(`{3,}|~{3,})/);
      if (m && m[1][0] === fenceCh) fenceCh = null;
      if (cur) cur.push(line);
      continue;
    }
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      fenceCh = f[1][0];
      if (cur) cur.push(line);
      continue;
    }
    if (isItem(line) && indentWidth(line) === cutIndent) {
      groups.push(cur = []);
    }
    if (!cur) continue;
    cur.push(line);
  }
  if (groups.length < 2) return { segments: [], reason: "need-two" };
  const dedent = (s) => s.split("\n").map((l) => {
    if (l.trim() === "") return "";
    const n = indentWidth(l);
    return " ".repeat(Math.max(n - cutIndent, 0)) + l.slice(n);
  }).join("\n").replace(/\s+$/, "");
  const segments = groups.map((g) => dedent(g.join("\n")));
  const lead = head.length ? dedent(head.join("\n")) : "";
  return lead ? { segments, lead } : { segments };
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
      if (type === "mermaid" && !isMermaidContent(inner)) {
        new import_obsidian.Notice("\u5185\u5BB9\u4E0D\u662F\u6709\u6548\u7684 mermaid \u56FE\u8BED\u6CD5\uFF0C\u672A\u8F6C\u6362\u4E3A mermaid");
        return;
      }
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
      const content = this.readContent(editor, start);
      if (type === "mermaid" && !isMermaidContent(content)) {
        new import_obsidian.Notice("\u5185\u5BB9\u4E0D\u662F\u6709\u6548\u7684 mermaid \u56FE\u8BED\u6CD5\uFF0C\u672A\u8F6C\u6362\u4E3A mermaid");
        return;
      }
      editor.replaceRange(
        [wrap[0], content, wrap[1]].join("\n"),
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
    const co = s.match(/^>\s*\[!([\w-]+)\]([+-])?\s/);
    if (co) return co[2] ? "toggle" : "callout";
    if (/^>\s?/.test(s)) return "quote";
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(s)) return "divider";
    return "paragraph";
  }
  getFenceLang(block) {
    const line = block.editor.getLine(block.start);
    const match = line.match(/^\s*(?:`{3,}|~{3,})(.*)$/);
    return match ? match[1].trim() : "";
  }
  // 折叠块当前状态：`[!type]-` 折叠 / `[!type]+` 展开；非折叠块返回 null
  foldStateOf(block) {
    const s = block.editor.getLine(block.start).replace(/^\s*/, "");
    const m = s.match(/^>\s*\[![\w-]+\]([+-])\s/);
    if (!m) return null;
    return m[1] === "-" ? "collapsed" : "expanded";
  }
  // 折叠块展开态切换：把参与操作的每个折叠块首行 `-` 与 `+` 互换（单步撤销）
  toggleFoldState(block) {
    const editor = block.editor;
    const ranges = this.ctx.selection.actionRanges(block);
    let hit = 0;
    for (const r of ranges) {
      const line = editor.getLine(r.start);
      const next = line.replace(
        /^(\s*>\s*\[![\w-]+\])([+-])(\s)/,
        (_m, head, sign, sp) => head + (sign === "-" ? "+" : "-") + sp
      );
      if (next !== line) {
        editor.setLine(r.start, next);
        hit++;
      }
    }
    if (!hit) new import_obsidian.Notice("\u5F53\u524D\u5757\u4E0D\u662F\u6298\u53E0\u5757");
    this.ctx.handle.hideHandle();
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
  /**
   * 列表转分栏的作用范围：多选时用选区，否则把光标所在的**整个同级列表**
   * 纳入范围（向上找同缩进的列表项起点、向下并入其所有子项）。
   *
   * 不这样做的话，光标停在单个子项上时范围只有一行 → 切不开栏，菜单项永远置灰。
   */
  listColumnRange(block) {
    const sel = this.ctx.selection.selection;
    if (sel && sel.editor === block.editor && this.ctx.selection.isInSelection(block) && sel.ranges.length > 1) {
      const rs = sel.ranges.slice().sort((a, b) => a.start - b.start);
      return { start: rs[0].start, end: rs[rs.length - 1].end };
    }
    const editor = block.editor;
    let start = block.start;
    let base = indentWidth(editor.getLine(block.start));
    for (let i = block.start - 1; i >= 0; i--) {
      const line = editor.getLine(i);
      const m = LIST_ITEM_RE.exec(line);
      if (m) {
        const ind = m[1].length;
        if (ind < base) {
          start = i;
          base = ind;
        } else if (ind === base) {
          start = i;
        }
      } else if (line.trim() === "") break;
      else if (indentWidth(line) >= base) continue;
      else break;
    }
    return { start, end: block.end };
  }
  /**
   * 嵌套列表可切出的栏数（供菜单置灰判断）。
   * `by='parent'` 按最浅层列表项数，`by='child'` 按一层子项数。
   * 不足 2 栏返回 0，表示不可转换。
   */
  listColumnCount(block, by = "parent") {
    const r = this.listColumnRange(block);
    const plan = planListColumns(
      getLines(block.editor, r.start, r.end),
      by === "parent" ? 0 : 1
    );
    return plan ? plan.segments.length : 0;
  }
  /**
   * 嵌套列表转分栏：按父项（`parent`）或按一层子项（`child`）各切一栏，
   * 产物复用 `buildColumnsMarkdown`，与「组合为分栏」同样前后贴空行（单步撤销）。
   *
   * 已有分栏内不允许再套一层；栏数不足 2 时提示并终止。
   */
  wrapListToColumns(block, by = "parent") {
    const editor = block.editor;
    if (this.isColumnsBlock(editor, block) || this.insideColumns(editor, block)) {
      new import_obsidian.Notice("\u5206\u680F\u5185\u90E8\u4E0D\u80FD\u518D\u5957\u5206\u680F");
      return;
    }
    const r = this.listColumnRange(block);
    const plan = planListColumns(
      getLines(editor, r.start, r.end),
      by === "parent" ? 0 : 1
    );
    if (!plan || plan.segments.length < 2) {
      new import_obsidian.Notice(
        (plan == null ? void 0 : plan.reason) === "multi-parent" ? "\u6309\u5B50\u9879\u8F6C\u4E3A\u5206\u680F\u8981\u6C42\u6574\u6BB5\u53EA\u6709\u4E00\u4E2A\u7236\u9879" : by === "parent" ? "\u6309\u7236\u9879\u8F6C\u4E3A\u5206\u680F\u81F3\u5C11\u9700\u8981\u4E24\u4E2A\u5217\u8868\u9879" : "\u6309\u5B50\u9879\u8F6C\u4E3A\u5206\u680F\u81F3\u5C11\u9700\u8981\u4E24\u4E2A\u540C\u7EA7\u5B50\u9879"
      );
      return;
    }
    const out = buildColumnsMarkdown(plan.segments);
    const total = editor.lineCount();
    const prefix = r.start > 0 && editor.getLine(r.start - 1).trim() !== "" ? [""] : [];
    const suffix = r.end < total - 1 && editor.getLine(r.end + 1).trim() !== "" ? [""] : [];
    const lead = plan.lead ? [...plan.lead.split("\n"), ""] : [];
    const text = [...prefix, ...lead, ...out.split("\n"), ...suffix].join("\n");
    editor.replaceRange(
      text,
      { line: r.start, ch: 0 },
      { line: r.end, ch: editor.getLine(r.end).length }
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
      if (/^>\s*>\s*\[!colrow(?:\|[^\]]*)?\]/.test(line)) {
        if (cur && cur.length) columns.push(cur);
        cur = null;
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
  // H2：在分栏末尾追加一行（栏数与首行一致，含 `>> [!colrow]` 行标记），
  // 供块菜单「追加一行」与源码态使用；实时预览编辑态走 widget 内 addRow。
  appendColumnRow(block) {
    const editor = block.editor;
    if (!this.isColumnsBlock(editor, block)) {
      new import_obsidian.Notice("\u5F53\u524D\u5757\u4E0D\u662F\u5206\u680F");
      return;
    }
    const lines = getLines(editor, block.start, block.end);
    let firstRowCols = 0;
    for (const l of lines) {
      if (/^>\s*>\s*\[!colrow(?:\|[^\]]*)?\]/.test(l)) break;
      if (/^>\s*>\s*\[!col(?:\|[^\]]*)?\]/.test(l)) firstRowCols++;
    }
    const perRow = Math.max(firstRowCols, 1);
    const rowText = "\n>> [!colrow]\n>>\n>" + Array.from({ length: perRow }, () => "\n>> [!col]\n>>").join("\n>");
    editor.replaceRange(
      rowText,
      { line: block.end, ch: editor.getLine(block.end).length }
    );
    this.ctx.handle.hideHandle();
  }
  // ---- H2 分栏行列编辑增强（文本命令，供块菜单入口）----
  /** 定位分栏区间并解析结构：分栏块自身或内部块均可（内部块向上回溯外壳行） */
  parseColumnsAt(editor, block) {
    let shellStart = block.start;
    if (!COL_START_RE.test(editor.getLine(block.start))) {
      shellStart = -1;
      for (let i = block.start; i >= 0; i--) {
        const line = editor.getLine(i);
        if (/^((?:>\s*)+)\[!multi-column(?:\|[^\]]*)?\]/.test(line)) {
          shellStart = i;
          break;
        }
        if (!QUOTE_RE.test(line)) break;
      }
      if (shellStart === -1) return null;
    }
    let shellEnd = shellStart;
    for (let i = shellStart + 1; i < editor.lineCount(); i++) {
      if (!QUOTE_RE.test(editor.getLine(i))) break;
      shellEnd = i;
    }
    return this.parseColumnsRange(editor, shellStart, shellEnd);
  }
  /** 把分栏区间解析为结构（栏内容 / 宽度 / 背景 / 行结构 / 外观参数），解析失败返回 null */
  parseColumnsRange(editor, shellStart, shellEnd) {
    const lines = getLines(editor, shellStart, shellEnd);
    const segments = [];
    const bgs = [];
    const colLines = [];
    const colRels = [];
    const rowMarks = [];
    let cur = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0) continue;
      if (COL_SEP_RE.test(line)) continue;
      if (/^>\s*>\s*\[!colrow(?:\|[^\]]*)?\]/.test(line)) {
        if (cur !== null) segments.push(cur.join("\n"));
        cur = null;
        rowMarks.push(i);
        continue;
      }
      if (/^>\s*>\s*\[!col(?:\|[^\]]*)?\]/.test(line)) {
        if (cur !== null) segments.push(cur.join("\n"));
        cur = [];
        colLines.push(shellStart + i);
        colRels.push(i);
        const meta2 = line.match(/\[!col\|([^\]]*)\]/);
        bgs.push(parseColBgMeta(meta2 ? meta2[1] : ""));
        continue;
      }
      const m = line.match(/^>\s*>\s?(.*)$/);
      if (m) {
        if (!cur) cur = [];
        cur.push(m[1]);
      }
    }
    if (cur !== null) segments.push(cur.join("\n"));
    if (!segments.length) return null;
    if (bgs.length !== segments.length) bgs.length = 0;
    let rows = [];
    if (rowMarks.length) {
      let start = 0;
      for (const rm of rowMarks) {
        let cnt = 0;
        while (start < colRels.length && colRels[start] < rm) {
          cnt++;
          start++;
        }
        rows.push(cnt);
      }
      rows.push(colRels.length - start);
      if (rows.some((r) => r <= 0)) rows = [];
    }
    let widths = [];
    const opts = {};
    const meta = lines[0].match(/\[!multi-column\|([^\]]*)\]/);
    if (meta) {
      const wm = meta[1].match(/^(\d+(?:-\d+)+(?:\/\d+(?:-\d+)+)*)/);
      if (wm) {
        const groups = wm[1].split("/").map((g) => g.split("-").map((x) => Number(x)));
        const flat = groups.flat();
        if (flat.length === segments.length && flat.every((w) => Number.isFinite(w) && w > 0)) {
          widths = flat;
        }
      }
      const gapM = meta[1].match(/(?:^|\s)gap=(\d+)(?:\s|$)/);
      const valignM = meta[1].match(/(?:^|\s)valign=(top|center|bottom|stretch)(?:\s|$)/);
      const radiusM = meta[1].match(/(?:^|\s)radius=(\d+)(?:\s|$)/);
      const hasBorder = /(?:^|\s)border(?:\s|$)/.test(meta[1]);
      if (gapM) opts.gap = Number(gapM[1]);
      if (valignM) opts.valign = valignM[1];
      if (radiusM) opts.radius = Number(radiusM[1]);
      if (hasBorder) opts.border = true;
    }
    return {
      shellStart,
      shellEnd,
      segments,
      widths,
      bgs: bgs.length ? bgs : segments.map(() => null),
      rows,
      opts,
      colLines
    };
  }
  /** 当前块所在栏索引（按栏头行号定位，默认首栏） */
  columnIndexOf(p, line) {
    let idx = 0;
    for (let k = 0; k < p.colLines.length; k++) {
      if (p.colLines[k] <= line) idx = k;
      else break;
    }
    return idx;
  }
  /** 栏 colIdx 所在行号（单行时恒 0） */
  rowIndexOf(rows, colIdx) {
    if (!rows.length) return 0;
    let acc = 0;
    for (let r = 0; r < rows.length; r++) {
      if (colIdx < acc + rows[r]) return r;
      acc += rows[r];
    }
    return rows.length - 1;
  }
  /** 行 r 的全局栏区间 [start, end) */
  rowRange(rows, r) {
    const start = rows.slice(0, r).reduce((a, b) => a + b, 0);
    return [start, start + rows[r]];
  }
  /** 每行栏数 → buildColumnsMarkdown 的行末栏索引（[1,3] 表示 0-1 / 2-3 两行） */
  rowsToEnds(rows) {
    if (!rows.length) return void 0;
    const ends = [];
    let acc = 0;
    for (let r = 0; r < rows.length - 1; r++) {
      acc += rows[r];
      ends.push(acc - 1);
    }
    return ends.length ? ends : void 0;
  }
  /** 按解析结构整体重写分栏区间（单步撤销），返回生成文本（供光标定位） */
  writeColumns(editor, p) {
    const rowEnds = this.rowsToEnds(p.rows);
    const hasOpts = Object.keys(p.opts).length > 0;
    const out = buildColumnsMarkdown(
      p.segments,
      p.widths.length === p.segments.length ? p.widths : void 0,
      p.bgs.length === p.segments.length ? p.bgs : void 0,
      rowEnds,
      hasOpts ? p.opts : void 0
    );
    editor.replaceRange(
      out,
      { line: p.shellStart, ch: 0 },
      { line: p.shellEnd, ch: editor.getLine(p.shellEnd).length }
    );
    this.ctx.handle.hideHandle();
    return out;
  }
  /** 光标落入新栏内容行（colIdx 为写回后栏序号，0-based） */
  focusColumn(editor, p, colIdx, out) {
    const outLines = out.split("\n");
    let seen = 0;
    for (let li = 0; li < outLines.length; li++) {
      if (/^>\s*>\s*\[!col(?:\|[^\]]*)?\]/.test(outLines[li])) {
        seen++;
        if (seen === colIdx + 1) {
          editor.setCursor({ line: p.shellStart + li + 1, ch: 2 });
          break;
        }
      }
    }
    editor.focus();
  }
  /** 拆分当前栏：原栏保留前半，新栏承接后半（切点取当前块所在行），宽度对半、背景沿用 */
  splitColumn(block) {
    var _a, _b;
    const editor = block.editor;
    const p = this.parseColumnsAt(editor, block);
    if (!p || !p.colLines.length) {
      new import_obsidian.Notice("\u5F53\u524D\u5757\u4E0D\u5728\u5206\u680F\u5185");
      return;
    }
    const i = this.columnIndexOf(p, block.start);
    const lines = ((_a = p.segments[i]) != null ? _a : "").split("\n");
    const rel = Math.max(0, block.start - (p.colLines[i] + 1));
    const mid = Math.max(1, Math.min(rel, lines.length - 1 || 1));
    const left = lines.slice(0, mid).join("\n");
    const right = lines.slice(mid).join("\n");
    if (!p.widths.length) {
      const avg = Math.round(100 / p.segments.length * 10) / 10;
      p.widths = p.segments.map(() => avg);
    }
    const w = p.widths[i];
    p.segments[i] = left;
    p.segments.splice(i + 1, 0, right);
    p.widths[i] = w / 2;
    p.widths.splice(i + 1, 0, w / 2);
    p.bgs.splice(i + 1, 0, (_b = p.bgs[i]) != null ? _b : null);
    if (p.rows.length) p.rows[this.rowIndexOf(p.rows, i)]++;
    const out = this.writeColumns(editor, p);
    this.focusColumn(editor, p, i + 1, out);
  }
  /** 合并当前栏与右侧相邻栏：内容按顺序拼接、宽度合并；行末栏禁止跨行合并 */
  mergeColumn(block) {
    var _a, _b, _c, _d;
    const editor = block.editor;
    const p = this.parseColumnsAt(editor, block);
    if (!p || !p.colLines.length) {
      new import_obsidian.Notice("\u5F53\u524D\u5757\u4E0D\u5728\u5206\u680F\u5185");
      return;
    }
    const i = this.columnIndexOf(p, block.start);
    if (p.segments.length <= 1) {
      new import_obsidian.Notice("\u53EA\u5269 1 \u680F\uFF0C\u65E0\u6CD5\u5408\u5E76");
      return;
    }
    if (p.rows.length) {
      const r = this.rowIndexOf(p.rows, i);
      if (i + 1 >= this.rowRange(p.rows, r)[1]) {
        new import_obsidian.Notice("\u5DF2\u662F\u884C\u672B\u680F\uFF0C\u65E0\u6CD5\u8DE8\u884C\u5408\u5E76");
        return;
      }
    }
    const right = (_a = p.segments[i + 1]) != null ? _a : "";
    p.segments[i] = p.segments[i] + (right.trim() ? "\n" + right : "");
    p.widths[i] = ((_b = p.widths[i]) != null ? _b : 1) + ((_c = p.widths[i + 1]) != null ? _c : 1);
    p.bgs[i] = (_d = p.bgs[i]) != null ? _d : p.bgs[i + 1];
    p.segments.splice(i + 1, 1);
    p.widths.splice(i + 1, 1);
    p.bgs.splice(i + 1, 1);
    if (p.rows.length) p.rows[this.rowIndexOf(p.rows, i)]--;
    this.writeColumns(editor, p);
  }
  /** 在当前栏与下一栏之间插入一个空栏，后续栏宽按既有分配策略重排（与 widget addColumnAt 一致） */
  insertColumn(block) {
    const editor = block.editor;
    const p = this.parseColumnsAt(editor, block);
    if (!p || !p.colLines.length) {
      new import_obsidian.Notice("\u5F53\u524D\u5757\u4E0D\u5728\u5206\u680F\u5185");
      return;
    }
    const i = this.columnIndexOf(p, block.start);
    const n = p.segments.length + 1;
    const newW = Math.round(100 / n * 10) / 10;
    const scale = (100 - newW) / 100;
    if (p.widths.length === p.segments.length) {
      p.widths = p.widths.map((w) => Math.round(w * scale * 10) / 10);
      p.widths.splice(i + 1, 0, newW);
    } else {
      p.widths = [];
    }
    p.segments.splice(i + 1, 0, "");
    p.bgs.splice(i + 1, 0, null);
    if (p.rows.length) p.rows[this.rowIndexOf(p.rows, i)]++;
    const out = this.writeColumns(editor, p);
    this.focusColumn(editor, p, i + 1, out);
  }
  /** 整行上移 / 下移：交换相邻两行的栏内容、宽度与背景，保持各栏宽度与行结构 */
  moveColumnRow(block, dir) {
    const editor = block.editor;
    const p = this.parseColumnsAt(editor, block);
    if (!p || !p.colLines.length) {
      new import_obsidian.Notice("\u5F53\u524D\u5757\u4E0D\u5728\u5206\u680F\u5185");
      return;
    }
    if (!p.rows.length || p.rows.length <= 1) {
      new import_obsidian.Notice("\u5F53\u524D\u5206\u680F\u4E3A\u5355\u884C\uFF0C\u65E0\u9700\u884C\u6392\u5E8F");
      return;
    }
    const i = this.columnIndexOf(p, block.start);
    const r = this.rowIndexOf(p.rows, i);
    const t = r + dir;
    if (t < 0 || t >= p.rows.length) {
      new import_obsidian.Notice(dir === -1 ? "\u5DF2\u662F\u9996\u884C\uFF0C\u65E0\u6CD5\u4E0A\u79FB" : "\u5DF2\u662F\u672B\u884C\uFF0C\u65E0\u6CD5\u4E0B\u79FB");
      return;
    }
    const [s1, e1] = this.rowRange(p.rows, r);
    const [s2, e2] = this.rowRange(p.rows, t);
    const swap = (arr) => {
      const a = arr.slice(s1, e1);
      const b = arr.slice(s2, e2);
      arr.splice(0, arr.length, ...arr.slice(0, s1), ...b, ...arr.slice(e1, s2), ...a, ...arr.slice(e2));
    };
    const hasW = p.widths.length === p.segments.length;
    const hasB = p.bgs.length === p.segments.length;
    swap(p.segments);
    if (hasW) swap(p.widths);
    if (hasB) swap(p.bgs);
    const tmp = p.rows[r];
    p.rows[r] = p.rows[t];
    p.rows[t] = tmp;
    this.writeColumns(editor, p);
  }
  /** 分栏内部块的菜单状态：当前栏索引与各操作可用性（不在分栏内返回 null） */
  columnsMenuState(editor, block) {
    const p = this.parseColumnsAt(editor, block);
    if (!p || !p.colLines.length) return null;
    const colIdx = this.columnIndexOf(p, block.start);
    const canMerge = p.segments.length > 1 && (!p.rows.length || colIdx + 1 < this.rowRange(p.rows, this.rowIndexOf(p.rows, colIdx))[1]);
    const rIdx = p.rows.length ? this.rowIndexOf(p.rows, colIdx) : 0;
    return {
      colIdx,
      rows: p.rows,
      canMerge,
      canUp: p.rows.length > 1 && rIdx > 0,
      canDown: p.rows.length > 1 && rIdx < p.rows.length - 1
    };
  }
  /**
   * H4 贴边快速分栏：把拖动块 A（可多选）与目标块 B 合成两栏分栏。
   * side=-1 时 A 在左栏（拖到 B 左边缘），side=1 时 A 在右栏（拖到 B 右边缘）。
   * 目标为分栏外壳 / 分栏内部块时返回 false（调用方回退普通插入，避免截断分栏结构）。
   */
  wrapToEdgeColumns(editor, a, b, side) {
    if (!a.length) return false;
    if (a.some((r) => r.start <= b.end && b.start <= r.end)) return false;
    if (this.isColumnsBlock(editor, b) || this.insideColumns(editor, b)) return false;
    const rs = [...a].sort((x, y) => x.start - y.start);
    const lines = [];
    for (const r of rs) lines.push(...getLines(editor, r.start, r.end));
    const bLines = getLines(editor, b.start, b.end);
    if (bLines.every((l) => l.trim() === "")) return false;
    const left = side === -1 ? lines : bLines;
    const right = side === -1 ? bLines : lines;
    const out = buildColumnsMarkdown([left.join("\n"), right.join("\n")]);
    const start = Math.min(rs[0].start, b.start);
    const end = Math.max(rs[rs.length - 1].end, b.end);
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
    return true;
  }
  /** 解析块首行的颜色标记（无标记 / 颜色非法返回 null；span 形态写在块末行，
   *  首行无 %% 时回溯末行再解析 span） */
  blockColorOf(block) {
    const first = this.parseBlockColor(block.editor.getLine(block.start));
    if (first) return first;
    if (block.end > block.start) return this.parseBlockColor(block.editor.getLine(block.end));
    return null;
  }
  /** 解析单行文本中的块颜色标记（无 / 非法返回 null；双值语法取浅色；
   *  兼容存量 %% 形态与 span 元素承载形态） */
  parseBlockColor(line) {
    var _a, _b, _c;
    const m = (_a = BLOCK_COLOR_RE.exec(line)) != null ? _a : BLOCK_COLOR_SPAN_RE.exec(line);
    if (!m) return null;
    return (_c = (_b = parseBlockColorValue(m[1])) == null ? void 0 : _b.light) != null ? _c : null;
  }
  /**
   * 给当前块打颜色标记：在块末行行尾写入空元素
   * `<span data-block-color="<color>"></span>` 承载（阅读模式元素形态直接上色），
   * 替换旧的行尾 `%% block-color:<color> %%` 写回形态；已有标记（%% 或 span）
   * 均替换颜色值。存量 `%%...%%` 不迁移存量文档，但写回时清理避免同块双标记。
   * 颜色属性值格式与 %% 语法体一致（支持手写 `light|dark` 双主题覆盖深色）。
   * 分栏 callout 内写回不阻断，但提示阅读模式仅实时预览生效。
   */
  setBlockColor(block, color) {
    const editor = block.editor;
    const norm = normalizeBlockColor(color);
    if (!norm) {
      new import_obsidian.Notice("\u4E0D\u652F\u6301\u7684\u989C\u8272\uFF1A" + color);
      return;
    }
    const first = editor.getLine(block.start);
    const firstNext = first.replace(BLOCK_COLOR_RE, "").replace(/[ \t]+$/u, "");
    if (firstNext !== first) editor.setLine(block.start, firstNext);
    const endIdx = block.end;
    const endLine = editor.getLine(endIdx);
    const next = endLine.replace(BLOCK_COLOR_SPAN_RE, "").replace(BLOCK_COLOR_RE, "").replace(/[ \t]+$/u, "") + `<span data-block-color="${norm}"></span>`;
    editor.setLine(endIdx, next);
    if (this.insideColumns(editor, block)) {
      new import_obsidian.Notice(
        "\u8BE5\u5757\u4F4D\u4E8E\u5206\u680F callout \u5185\uFF1A\u9605\u8BFB\u6A21\u5F0F\u53D7 Obsidian \u6E32\u67D3\u9650\u5236\uFF0C\u989C\u8272\u4EC5\u5B9E\u65F6\u9884\u89C8\u751F\u6548\uFF1B\u5EFA\u8BAE\u6539\u7528\u5206\u680F bg \u5143\u6570\u636E |bg= \u505A\u6574\u680F\u914D\u8272",
        6e3
      );
    }
    this.ctx.handle.hideHandle();
  }
  /** 清除当前块的颜色标记（span 形态或存量 %% 形态；无标记时提示） */
  clearBlockColor(block) {
    const editor = block.editor;
    let found = false;
    for (let i = block.start; i <= block.end; i++) {
      const line = editor.getLine(i);
      const next = line.replace(BLOCK_COLOR_SPAN_RE, () => {
        found = true;
        return "";
      }).replace(BLOCK_COLOR_RE, () => {
        found = true;
        return "";
      }).replace(/[ \t]+$/u, "");
      if (next !== line) editor.setLine(i, next);
    }
    if (!found) {
      new import_obsidian.Notice("\u5F53\u524D\u5757\u6CA1\u6709\u989C\u8272\u6807\u8BB0");
      return;
    }
    this.ctx.handle.hideHandle();
  }
};

// src/block-id.ts
var import_obsidian4 = require("obsidian");

// src/constants.ts
var HANDLE_W = 20;
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
  ["quote", "\u5F15\u7528"],
  // M5：更多官方 callout 类型
  ["cite", "\u5F15\u6587"],
  ["info", "\u4FE1\u606F"],
  ["help", "\u5E2E\u52A9"],
  ["check", "\u5B8C\u6210"],
  ["cross", "\u5426\u5B9A"],
  ["key", "\u8981\u70B9"],
  ["pencil", "\u7B14\u8BB0"],
  ["search", "\u68C0\u7D22"],
  ["love", "\u559C\u6B22"],
  ["rocket", "\u542F\u52A8"],
  ["image", "\u56FE\u7247"],
  ["location", "\u4F4D\u7F6E"],
  ["home", "\u4E3B\u9875"],
  ["target", "\u76EE\u6807"]
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
  ["mermaid", "Mermaid"],
  // M5：代码语言扩展
  ["cpp", "C++"],
  ["csharp", "C#"],
  ["php", "PHP"],
  ["ruby", "Ruby"],
  ["swift", "Swift"],
  ["kotlin", "Kotlin"],
  ["dart", "Dart"],
  ["shell", "Shell"],
  ["powershell", "PowerShell"],
  ["latex", "LaTeX"],
  ["docker", "Dockerfile"],
  ["xml", "XML"],
  ["scss", "SCSS"],
  ["less", "Less"],
  ["graphql", "GraphQL"]
];
var INSERT_ACTIONS = [
  ["image", "\u56FE\u7247"],
  ["audio", "\u97F3\u9891"],
  ["video", "\u89C6\u9891"],
  ["pdf", "PDF"],
  ["date", "\u65E5\u671F"],
  ["time", "\u65F6\u95F4"],
  ["datetime", "\u65E5\u671F\u65F6\u95F4"],
  ["math", "\u884C\u5185\u516C\u5F0F"],
  ["inlinecode", "\u884C\u5185\u4EE3\u7801"],
  ["highlight", "\u9AD8\u4EAE"],
  ["note", "\u7B14\u8BB0\u94FE\u63A5"],
  ["embednote", "\u5D4C\u5165\u7B14\u8BB0"],
  ["blockref", "\u5757\u5F15\u7528"],
  ["blockembed", "\u5D4C\u5165\u5757"]
];
var DEFAULT_DATE_FORMAT = "YYYY-MM-DD";
var DEFAULT_TIME_FORMAT = "HH:mm";
var MEDIA_EXTS = {
  image: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"],
  audio: ["mp3", "wav", "m4a", "ogg", "flac"],
  video: ["mp4", "webm", "mov", "mkv", "avi"],
  pdf: ["pdf"]
};
var INSERT_SPECS = {
  image: { kind: "pick", exts: MEDIA_EXTS.image },
  audio: { kind: "pick", exts: MEDIA_EXTS.audio },
  video: { kind: "pick", exts: MEDIA_EXTS.video },
  pdf: { kind: "pick", exts: MEDIA_EXTS.pdf },
  date: { kind: "dynamic", dyn: "date" },
  time: { kind: "dynamic", dyn: "time" },
  datetime: { kind: "dynamic", dyn: "datetime" },
  // 光标落在两个标记中间（caret = 1 或 2），否则插完还得手动往回挪
  math: { kind: "snippet", text: "$$", caret: 1 },
  inlinecode: { kind: "snippet", text: "``", caret: 1 },
  highlight: { kind: "snippet", text: "====", caret: 2 },
  note: { kind: "note", embed: false },
  embednote: { kind: "note", embed: true },
  blockref: { kind: "blockref", embed: false },
  blockembed: { kind: "blockref", embed: true }
};

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
var ImagePreviewModal = class extends import_obsidian2.Modal {
  constructor(app, src, label) {
    super(app);
    this.src = src;
    this.label = label;
    this.modalEl.addClass("be-image-preview-modal");
    this.titleEl.setText(label);
  }
  onOpen() {
    const box = this.contentEl.createDiv({ cls: "be-image-preview-box" });
    box.createEl("img", { cls: "be-image-preview", attr: { src: this.src, alt: this.label } });
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/picker.ts
var import_obsidian3 = require("obsidian");
function scoreName(text, query) {
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
    ti = found + 1;
  }
  return score;
}
var FileSuggest = class extends import_obsidian3.SuggestModal {
  constructor(app, files, placeholder, onPick) {
    super(app);
    this.files = files;
    this.onPick = onPick;
    this.setPlaceholder(placeholder);
  }
  getSuggestions(query) {
    const q = query.trim().toLowerCase();
    if (!q) return this.files;
    return this.files.map((f) => ({ f, score: scoreName(f.basename.toLowerCase(), q) })).filter((s) => s.score >= 0).sort((a, b) => b.score - a.score).map((s) => s.f);
  }
  renderSuggestion(file, el) {
    el.createDiv({ text: file.basename });
    el.createDiv({ cls: "block-editor-picker-path", text: file.path });
  }
  onChooseSuggestion(file) {
    this.onPick(file);
  }
};
var BlockSuggest = class extends import_obsidian3.SuggestModal {
  constructor(app, items, onPick) {
    super(app);
    this.items = items;
    this.onPick = onPick;
    this.setPlaceholder("\u9009\u62E9\u5757");
  }
  getSuggestions(query) {
    const q = query.trim().toLowerCase();
    if (!q) return this.items;
    return this.items.map((it) => ({ it, score: Math.max(scoreName(it.id.toLowerCase(), q), scoreName(it.preview.toLowerCase(), q)) })).filter((s) => s.score >= 0).sort((a, b) => b.score - a.score).map((s) => s.it);
  }
  renderSuggestion(item, el) {
    el.createDiv({ text: `^${item.id}` });
    el.createDiv({ cls: "block-editor-picker-path", text: item.preview || "(\u7A7A)" });
  }
  onChooseSuggestion(item) {
    this.onPick(item.id);
  }
};
function previewBefore(lines, i) {
  for (let j = i - 1; j >= 0; j--) {
    const t = lines[j].trim();
    if (t) return t.slice(0, 60);
  }
  return "";
}
function pickFile(app, exts, placeholder, onPick) {
  const set = new Set(exts.map((e) => e.toLowerCase()));
  const files = app.vault.getFiles().filter((f) => set.has(f.extension.toLowerCase()));
  new FileSuggest(app, files, placeholder, onPick).open();
}
function pickNote(app, onPick) {
  pickFile(app, ["md"], "\u9009\u62E9\u7B14\u8BB0", onPick);
}
function scanBlockIds(text) {
  var _a;
  const lines = text.split("\n");
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const own = lines[i].match(/^\s*\^([A-Za-z0-9-]+)\s*$/);
    if (own) {
      items.push({ id: own[1], preview: previewBefore(lines, i) });
      continue;
    }
    const tail = lines[i].match(/\s\^([A-Za-z0-9-]+)\s*$/);
    if (tail) items.push({ id: tail[1], preview: lines[i].slice(0, (_a = tail.index) != null ? _a : 0).trim() });
  }
  return items;
}
function pickBlock(app, file, onPick) {
  app.vault.cachedRead(file).then((text) => {
    const items = scanBlockIds(text);
    if (!items.length) {
      new import_obsidian3.Notice("\u8BE5\u7B14\u8BB0\u6CA1\u6709\u5757 ID");
      return;
    }
    new BlockSuggest(app, items, onPick).open();
  }).catch(() => new import_obsidian3.Notice("\u8BFB\u53D6\u7B14\u8BB0\u5931\u8D25"));
}
var notesWithBlocks = null;
function invalidateNotesWithBlocks() {
  notesWithBlocks = null;
}
function openNoteSuggest(app, paths, onPick) {
  const set = new Set(paths);
  const files = app.vault.getFiles().filter((f) => f.extension === "md" && set.has(f.path));
  if (!files.length) {
    new import_obsidian3.Notice("\u6CA1\u6709\u627E\u5230\u542B\u5757 ID \u7684\u7B14\u8BB0");
    return;
  }
  new FileSuggest(app, files, "\u9009\u62E9\u542B\u5757 ID \u7684\u7B14\u8BB0", onPick).open();
}
function pickNoteWithBlocks(app, onPick) {
  if (notesWithBlocks) {
    openNoteSuggest(app, notesWithBlocks, onPick);
    return;
  }
  const files = app.vault.getFiles().filter((f) => f.extension === "md");
  Promise.all(
    files.map(async (f) => ({
      path: f.path,
      hit: scanBlockIds(await app.vault.cachedRead(f)).length > 0
    }))
  ).then((results) => {
    const paths = results.filter((r) => r.hit).map((r) => r.path);
    if (!paths.length) {
      new import_obsidian3.Notice("\u6CA1\u6709\u627E\u5230\u542B\u5757 ID \u7684\u7B14\u8BB0");
      return;
    }
    notesWithBlocks = paths;
    openNoteSuggest(app, paths, onPick);
  }).catch(() => new import_obsidian3.Notice("\u626B\u63CF\u5757 ID \u7B14\u8BB0\u5931\u8D25"));
}

// src/block-id.ts
var BlockIdService = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  copyBlockLink(block) {
    if (!block.file) {
      new import_obsidian4.Notice("\u65E0\u6CD5\u5B9A\u4F4D\u5F53\u524D\u6587\u4EF6");
      return;
    }
    const id = this.ensureBlockId(block);
    navigator.clipboard.writeText(`[[${block.file.basename}#^${id}]]`).then(() => new import_obsidian4.Notice(`\u5DF2\u751F\u6210\u5757 ID #^${id} \u5E76\u590D\u5236\u94FE\u63A5`)).catch(() => new import_obsidian4.Notice("\u590D\u5236\u5757\u94FE\u63A5\u5931\u8D25"));
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
      new import_obsidian4.Notice("\u8FD9\u4E00\u884C\u6CA1\u6709\u53EF\u64CD\u4F5C\u7684\u5757");
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
  /** 图形化引用：选含块 ID 的笔记 → 选块 → 在当前块下方插入 [[目标笔记#^id]] 链接 */
  referenceOtherBlock(block) {
    pickNoteWithBlocks(this.ctx.app, (file) => {
      pickBlock(this.ctx.app, file, (id) => {
        this.ctx.ops.insertLines(block.editor, [`[[${file.basename}#^${id}]]`], block.end + 1);
        new import_obsidian4.Notice(`\u5DF2\u63D2\u5165\u5757\u5F15\u7528 #^${id}`);
      });
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
      new import_obsidian4.Notice("\u672C\u6587\u6CA1\u6709\u5757 ID");
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
    new import_obsidian4.Notice(`\u5DF2\u6E05\u9664 ${removed} \u4E2A\u5757 ID`);
  }
};

// src/ops.ts
var import_obsidian5 = require("obsidian");

// src/list-number.ts
var LIST_RE = /^[\t ]*(?:>[\t ]*)*(?:[-*+]|\d{1,9}[.)])[\t ]+/;
var ORDERED_NUM_RE = /[\t ]*(?:>[\t ]*)*(\d{1,9})[.)][\t ]+/;
var DELIM_RE = /(?:^|[\t >])(?:[-*+]|\d{1,9}([.)]))[\t ]/;
function listContext(line) {
  const m = line.match(/^([\t ]*)((?:>[\t ]*)*)/);
  const lead = m ? m[1] : "";
  const quotes = m ? m[2] : "";
  return {
    indent: lead.length + quotes.replace(/>/g, "").length
  };
}
function layerKey(line) {
  const ctx = listContext(line);
  const d = line.match(DELIM_RE);
  const delim = d && d[1] ? d[1] : "";
  return `${ctx.indent}|${delim}`;
}
var layerKeyOf = layerKey;
function seqOf(line) {
  const m = line.match(ORDERED_NUM_RE);
  return m ? parseInt(m[1], 10) : 0;
}
function replaceMarkerNum(line, n) {
  return line.replace(
    /^([\t ]*(?:>[\t ]*)*)(\d{1,9})([.)])/,
    (_all, pre, _num, delim) => pre + n + delim
  );
}
function collectLayerStarts(lines) {
  const starts = /* @__PURE__ */ new Map();
  let fence = null;
  let math = false;
  const seen = /* @__PURE__ */ new Set();
  for (const line of lines) {
    const fenceMark = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMark) {
      const ch = fenceMark[1][0];
      if (fence === null) fence = ch;
      else if (fence === ch) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (/^\s*\$\$\s*$/.test(line)) {
      math = !math;
      continue;
    }
    if (math) continue;
    if (!LIST_RE.test(line)) {
      if (line.trim() === "" || listContext(line).indent === 0) seen.clear();
      continue;
    }
    const key = layerKey(line);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!starts.has(key)) starts.set(key, []);
    starts.get(key).push(seqOf(line));
  }
  return starts;
}
function renumberOrdered(lines, opts = {}) {
  var _a, _b;
  const out = lines.slice();
  const layerStarts = opts.layerStarts;
  const cursor = /* @__PURE__ */ new Map();
  let active = [];
  const allLayers = [];
  let fence = null;
  let math = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMark = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMark) {
      const ch = fenceMark[1][0];
      if (fence === null) fence = ch;
      else if (fence === ch) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (/^\s*\$\$\s*$/.test(line)) {
      math = !math;
      continue;
    }
    if (math) continue;
    const m = line.match(LIST_RE);
    if (!m) {
      if (line.trim() === "") {
        active = [];
      } else {
        const ind2 = listContext(line).indent;
        const shallowest = active.length ? Math.min(...active.map((l) => Number(l.key.split("|")[0]))) : -1;
        if (!(active.length && ind2 > shallowest)) active = [];
      }
      continue;
    }
    const marker = line.match(DELIM_RE);
    const delim = marker && marker[1] ? marker[1] : "";
    const kind = delim === "" ? "ul" : delim === ")" ? ")" : ".";
    const key = layerKey(line);
    let layer = (_a = active.find((l) => l.key === key && l.kind === kind)) != null ? _a : null;
    if (!layer && kind !== "ul") {
      layer = { key, kind, items: [] };
      allLayers.push(layer);
    }
    const ind = Number(key.split("|")[0]);
    active = active.filter((l) => Number(l.key.split("|")[0]) < ind);
    if (layer) {
      active.push(layer);
      layer.items.push({ index: i, num: seqOf(line) });
    }
  }
  let changed = false;
  for (const layer of allLayers) {
    if (!layer.items.length) continue;
    let start;
    if (layerStarts) {
      const queue = layerStarts.get(layer.key);
      const at = (_b = cursor.get(layer.key)) != null ? _b : 0;
      cursor.set(layer.key, at + 1);
      start = queue && queue.length ? queue[Math.min(at, queue.length - 1)] : layer.items[0].num;
    } else {
      start = layer.items[0].num;
    }
    layer.items.forEach((it, k) => {
      const want = start + k;
      if (it.num === want) return;
      out[it.index] = replaceMarkerNum(lines[it.index], want);
      changed = true;
    });
  }
  return { lines: changed ? out : lines.slice(), changed };
}

// src/ops.ts
var LIST_MARK_RE = /^[\t ]*(?:>[\t ]*)*(?:[-*+]|\d{1,9}[.)])[\t ]+/;
function expandToListSpan(editor, from, to) {
  const keyOf = (i) => layerKeyOf(editor.getLine(i));
  const isItem = (i) => LIST_MARK_RE.test(editor.getLine(i));
  const anchorKey = keyOf(from);
  let lo = from;
  let hi = to;
  for (let i = from; i >= 0; i--) {
    if (!isItem(i) || keyOf(i) !== anchorKey) break;
    lo = i;
  }
  for (let i = to + 1; i < editor.lineCount(); i++) {
    if (!isItem(i) || keyOf(i) !== anchorKey) break;
    hi = i;
  }
  return { from: lo, to: hi };
}
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
    const expanded = expandToListSpan(
      editor,
      Math.min(insertAt, ...sorted.map((r) => r.start)),
      Math.max(insertAt - 1, ...sorted.map((r) => r.end))
    );
    const minLine = expanded.from;
    const maxLine = expanded.to;
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
    const renumbered = renumberOrdered(out, {
      layerStarts: collectLayerStarts(span)
    });
    const newText = renumbered.lines.join("\n");
    if (oldText === newText) return;
    keepViewport(getCM(editor), () => {
      editor.replaceRange(
        newText,
        { line: minLine, ch: 0 },
        { line: maxLine, ch: editor.getLine(maxLine).length }
      );
    });
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
    const total = editor.lineCount();
    const insertAt = Math.min(Math.max(insertLine, 0), total);
    const anchorLine = Math.min(insertAt, total - 1);
    const expanded = expandToListSpan(editor, anchorLine, anchorLine);
    const from = expanded.from;
    const to = expanded.to;
    const at = Math.max(0, Math.min(insertAt - from, to - from + 1));
    const span = getLines(editor, from, to);
    const out = span.slice(0, at).concat(moved, span.slice(at));
    const renumbered = renumberOrdered(out, { layerStarts: collectLayerStarts(span) });
    const newText = renumbered.lines.join("\n");
    const oldText = span.join("\n");
    if (oldText === newText) return;
    keepViewport(getCM(editor), () => {
      editor.replaceRange(
        newText,
        { line: from, ch: 0 },
        { line: to, ch: editor.getLine(to).length }
      );
    });
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
  /**
   * 删除若干行区间。整段重写一次 —— 既保证多段删除只产生一步撤销，
   * 也能在同一段文本里顺带重编号有序列表（删中间项后序号会断层）。
   * span 向外扩到列表段边界，避免只修到被删行附近而漏掉后续项。
   */
  removeRanges(editor, ranges) {
    if (!ranges.length) return;
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const total = editor.lineCount();
    const expanded = expandToListSpan(
      editor,
      Math.min(...sorted.map((r) => r.start)),
      Math.max(...sorted.map((r) => r.end))
    );
    const from = expanded.from;
    const to = Math.min(expanded.to, total - 1);
    if (to < from) return;
    const span = getLines(editor, from, to);
    const kept = span.filter(
      (_, i) => !sorted.some((r) => from + i >= r.start && from + i <= r.end)
    );
    const oldText = span.join("\n");
    const newText = renumberOrdered(kept, { layerStarts: collectLayerStarts(span) }).lines.join(
      "\n"
    );
    if (oldText === newText) return;
    keepViewport(getCM(editor), () => {
      editor.replaceRange(
        newText,
        { line: from, ch: 0 },
        { line: to, ch: editor.getLine(to).length }
      );
    });
  }
  // 拖入普通段落 / 标题：Markdown 下只有列表项具备父子结构，故把目标首行「列表化」
  // （加 `- ` 前缀），并把被拖块插入为其缩进子项；被拖块首行若为普通段落（非列表/
  // 标题/引用/围栏等），同样补 `- ` 使其成为子列表项。整段重写一次，单步撤销。
  // copy=true 时保留源块（Alt 拖拽）。
  nestUnderPlainBlock(editor, ranges, targetLine, nestCol, copy) {
    if (!ranges.length) return;
    const sources = [...ranges].sort((a, b) => a.start - b.start);
    if (sources.some((r) => targetLine >= r.start && targetLine <= r.end)) return;
    const minLine = Math.min(targetLine, sources[0].start);
    const maxLine = Math.max(targetLine, sources[sources.length - 1].end);
    const span = getLines(editor, minLine, maxLine);
    const inSource = (abs) => sources.some((r) => abs >= r.start && abs <= r.end);
    const kept = [];
    const keptAbs = [];
    for (let i = 0; i < span.length; i++) {
      const abs = minLine + i;
      if (!copy && inSource(abs)) continue;
      kept.push(span[i]);
      keptAbs.push(abs);
    }
    const tIdx = keptAbs.indexOf(targetLine);
    if (tIdx < 0) return;
    const tLine = kept[tIdx];
    const tIndent = getIndent(tLine);
    kept[tIdx] = tIndent + "- " + tLine.slice(tIndent.length);
    const moved = [];
    for (const r of sources) moved.push(...getLines(editor, r.start, r.end));
    const base = getIndent(moved[0]).length;
    const delta = nestCol - base;
    const listifyMoved = sources[0].type === "line";
    for (let i = 0; i < moved.length; i++) {
      if (i === 0 && listifyMoved) {
        moved[0] = " ".repeat(nestCol) + "- " + moved[0].slice(base);
      } else if (delta !== 0) {
        moved[i] = shiftIndent(moved[i], delta);
      }
    }
    const out = kept.slice(0, tIdx + 1).concat(moved, kept.slice(tIdx + 1));
    const oldText = span.join("\n");
    const newText = out.join("\n");
    if (oldText === newText) return;
    keepViewport(getCM(editor), () => {
      editor.replaceRange(
        newText,
        { line: minLine, ch: 0 },
        { line: maxLine, ch: editor.getLine(maxLine).length }
      );
    });
    this.ctx.handle.hideHandle();
  }
  /**
   * 就地复制一份块。副本剥掉块 ID，避免同文出现重复 ID；
   * 块 ID 独立成行时副本插到 ID 行之后，ID 才仍指向原块。
   *
   * 整段重写一次：多块副本只产生一步撤销，且能在同一段里重编号有序列表
   * （副本行标 volatile，序号顺着新位置连）。
   */
  duplicateBlock(block) {
    const editor = block.editor;
    const ranges = [...this.ctx.selection.actionRanges(block)].sort((a, b) => a.start - b.start);
    if (!ranges.length) return;
    const copies = [];
    let lo = Infinity;
    let hi = -1;
    for (const { start, end } of ranges) {
      const idLine = this.ctx.ids.findOwnLineIdLine(editor, end);
      const insertAfter = idLine !== null ? idLine : end;
      let text = getLines(editor, start, end).join("\n");
      const stripped = text.split("\n").filter((l) => !/^\s*\^[A-Za-z0-9-]+\s*$/.test(l)).map((l) => l.replace(/\s\^[A-Za-z0-9-]+\s*$/, ""));
      if (stripped.join("\n").trim() !== "") text = stripped.join("\n");
      copies.push({ after: insertAfter, lines: text.split("\n") });
      lo = Math.min(lo, start);
      hi = Math.max(hi, insertAfter);
    }
    if (!copies.length || hi < lo) return;
    const expanded = expandToListSpan(editor, lo, hi);
    const from = expanded.from;
    const to = expanded.to;
    const span = getLines(editor, from, to);
    const out = [];
    for (let i = 0; i < span.length; i++) {
      out.push(span[i]);
      for (const c of copies) {
        if (from + i !== c.after) continue;
        for (const l of c.lines) out.push(l);
      }
    }
    const oldText = span.join("\n");
    const newText = renumberOrdered(out, { layerStarts: collectLayerStarts(span) }).lines.join(
      "\n"
    );
    if (oldText === newText) return;
    keepViewport(getCM(editor), () => {
      editor.replaceRange(
        newText,
        { line: from, ch: 0 },
        { line: to, ch: editor.getLine(to).length }
      );
    });
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
    navigator.clipboard.writeText(text).then(() => new import_obsidian5.Notice("\u5DF2\u590D\u5236\u5757\u5185\u5BB9")).catch(() => new import_obsidian5.Notice("\u590D\u5236\u5757\u5185\u5BB9\u5931\u8D25"));
    this.ctx.handle.hideHandle();
  }
};

// src/block-menu.ts
var import_obsidian6 = require("obsidian");
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
    const menu = useGridLayout(new import_obsidian6.Menu());
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
    const fold = this.ctx.converter.foldStateOf(block);
    if (fold !== null) {
      menu.addItem(
        (mi) => mi.setTitle(fold === "collapsed" ? "\u5C55\u5F00" : "\u6298\u53E0").onClick(() => this.ctx.converter.toggleFoldState(block))
      );
    }
    menu.addSeparator();
    menu.addItem((mi) => mi.setTitle("\u5728\u4E0A\u65B9\u63D2\u5165\u5757").onClick(() => this.ctx.ops.insertBlock(block, "above")));
    menu.addItem((mi) => mi.setTitle("\u5728\u4E0B\u65B9\u63D2\u5165\u5757").onClick(() => this.ctx.ops.insertBlock(block, "below")));
    menu.addSeparator();
    menu.addItem((mi) => mi.setTitle("\u590D\u5236\u5757\u5185\u5BB9").onClick(() => this.ctx.ops.copyBlockContent(block)));
    menu.addItem(
      (mi) => mi.setTitle("\u751F\u6210\u5757 ID").onClick(() => this.ctx.ids.copyBlockLink(block))
    );
    menu.addItem(
      (mi) => mi.setTitle("\u5F15\u7528\u5176\u4ED6\u5757\u2026").onClick(() => this.ctx.ids.referenceOtherBlock(block))
    );
    menu.addItem((mi) => mi.setTitle("\u521B\u5EFA\u526F\u672C").onClick(() => this.ctx.ops.duplicateBlock(block)));
    menu.addSeparator();
    menu.addItem((mi) => mi.setTitle("\u4E0A\u79FB").onClick(() => this.ctx.ops.moveBlockVertically(block, -1)));
    menu.addItem((mi) => mi.setTitle("\u4E0B\u79FB").onClick(() => this.ctx.ops.moveBlockVertically(block, 1)));
    menu.addSeparator();
    if (this.ctx.converter.isColumnsBlock(editor, block)) {
      menu.addItem((mi) => mi.setTitle("\u6DFB\u52A0\u4E00\u680F").onClick(() => this.ctx.converter.addColumn(block)));
      menu.addItem((mi) => mi.setTitle("\u8FFD\u52A0\u4E00\u884C").onClick(() => this.ctx.converter.appendColumnRow(block)));
      menu.addItem((mi) => mi.setTitle("\u53D6\u6D88\u5206\u680F").onClick(() => this.ctx.converter.unwrapColumns(block)));
    } else if (this.ctx.converter.insideColumns(editor, block)) {
      const colState = this.ctx.converter.columnsMenuState(editor, block);
      const canMerge = !!colState && colState.canMerge;
      const multiRow = !!colState && colState.rows.length > 1;
      menu.addItem((mi) => mi.setTitle("\u62C6\u5206\u4E00\u680F").onClick(() => this.ctx.converter.splitColumn(block)));
      menu.addItem(
        (mi) => mi.setTitle("\u5408\u5E76\u53F3\u680F").setDisabled(!canMerge).onClick(() => this.ctx.converter.mergeColumn(block))
      );
      menu.addItem((mi) => mi.setTitle("\u63D2\u5165\u4E00\u680F").onClick(() => this.ctx.converter.insertColumn(block)));
      if (multiRow) {
        menu.addSeparator();
        menu.addItem(
          (mi) => mi.setTitle("\u884C\u4E0A\u79FB").setDisabled(!colState || !colState.canUp).onClick(() => this.ctx.converter.moveColumnRow(block, -1))
        );
        menu.addItem(
          (mi) => mi.setTitle("\u884C\u4E0B\u79FB").setDisabled(!colState || !colState.canDown).onClick(() => this.ctx.converter.moveColumnRow(block, 1))
        );
      }
      menu.addSeparator();
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
      if (block.type === "list") {
        const byParent = this.ctx.converter.listColumnCount(block, "parent");
        const byChild = this.ctx.converter.listColumnCount(block, "child");
        menu.addItem(
          (mi) => mi.setTitle("\u5217\xB7\u7236\u9879").setDisabled(byParent < 2).onClick(() => this.ctx.converter.wrapListToColumns(block, "parent"))
        );
        menu.addItem(
          (mi) => mi.setTitle("\u5217\xB7\u5B50\u9879").setDisabled(byChild < 2).onClick(() => this.ctx.converter.wrapListToColumns(block, "child"))
        );
      }
    }
    menu.addSeparator();
    const hasColor = this.ctx.converter.blockColorOf(block) !== null;
    menu.addItem(
      (mi) => mi.setTitle("\u5757\u989C\u8272").onClick((ev) => {
        openBlockColorPicker({
          x: ev.clientX,
          y: ev.clientY,
          current: this.ctx.converter.blockColorOf(block),
          onPick: (color) => {
            if (color === null) this.ctx.converter.clearBlockColor(block);
            else if (color !== this.ctx.converter.blockColorOf(block)) this.ctx.converter.setBlockColor(block, color);
          }
        });
      })
    );
    if (hasColor) {
      menu.addItem(
        (mi) => mi.setTitle("\u6E05\u9664\u5757\u989C\u8272").onClick(() => this.ctx.converter.clearBlockColor(block))
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
      new import_obsidian6.Notice("\u8FD9\u4E00\u884C\u6CA1\u6709\u53EF\u64CD\u4F5C\u7684\u5757");
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
    const menu = useGridLayout(new import_obsidian6.Menu());
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
    const menu = useGridLayout(new import_obsidian6.Menu());
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

// src/handle-layout.ts
var HANDLE_GAP = 6;
var HANDLE_INSET = 2;
var HANDLE_MIN_SIZE = 14;
function isDodgeableFold(foldLeft, lineLeft, editorLeft) {
  if (foldLeft == null || !Number.isFinite(foldLeft) || !Number.isFinite(lineLeft)) return false;
  if (foldLeft <= editorLeft) return false;
  return foldLeft < lineLeft - 1;
}
function computeHandleLeft(input) {
  var _a, _b, _c;
  const handleSize = Math.max(1, input.handleSize);
  const gap = Math.max(0, (_a = input.gap) != null ? _a : HANDLE_GAP);
  const inset = Math.max(0, (_b = input.inset) != null ? _b : HANDLE_INSET);
  const minSize = Math.min(handleSize, Math.max(6, (_c = input.minHandleSize) != null ? _c : HANDLE_MIN_SIZE));
  const hasFold = isDodgeableFold(input.foldLeft, input.lineLeft, input.editorLeft);
  const anchor = hasFold ? input.foldLeft : input.lineLeft;
  const room = anchor - gap - inset - input.editorLeft;
  const size = room >= handleSize ? handleSize : Math.max(minSize, Math.floor(room));
  const rightLimit = Math.max(inset, input.editorWidth - size - inset);
  const rawLeft = anchor - gap - size - input.editorLeft;
  const left = Math.min(Math.max(rawLeft, inset), rightLimit);
  const overlapped = hasFold && left + size > input.foldLeft - input.editorLeft + 0.5;
  return { left, size, squeezed: size < handleSize || overlapped };
}

// src/handle.ts
var _HandleController = class _HandleController {
  constructor(ctx) {
    this.ctx = ctx;
    this.handleEl = null;
    this.highlightEl = null;
    this.hideTimer = null;
    this.currentBlock = null;
    this.cursorBlock = null;
  }
  init() {
    const highlight = createEl("div");
    highlight.className = "block-editor-hover-block";
    this.highlightEl = highlight;
    const handle = createEl("div");
    handle.className = "block-editor-handle";
    const svg = createSvg("svg");
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
      const circle = createSvg("circle");
      circle.setAttribute("cx", String(cx));
      circle.setAttribute("cy", String(cy));
      circle.setAttribute("r", "1.3");
      svg.appendChild(circle);
    }
    handle.appendChild(svg);
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
    const cmEl = target.closest(".cm-content");
    const cmContent = cmEl instanceof HTMLElement ? cmEl : null;
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
    const editorDom = cm.dom;
    const editorRect = editorDom.getBoundingClientRect();
    const lineH = coords.bottom - coords.top || 20;
    const handleSize = this.ctx.settings.handleSize || HANDLE_W;
    const foldLeft = this.findFoldIndicatorLeft(cm, line.from);
    const layout = computeHandleLeft({
      lineLeft: coords.left,
      foldLeft,
      editorLeft: editorRect.left,
      editorWidth: editorRect.width,
      handleSize
    });
    if (!_HandleController.dodgeLogged) {
      _HandleController.dodgeLogged = true;
      console.log("[block-editor] handle-dodge:", {
        type: block.type,
        lineLeft: Math.round(coords.left),
        foldLeft: foldLeft == null ? null : Math.round(foldLeft),
        left: Math.round(layout.left),
        size: layout.size,
        squeezed: layout.squeezed
      });
    }
    const top = coords.top - editorRect.top + (lineH - layout.size) / 2;
    if (this.handleEl) {
      if (this.handleEl.parentElement !== editorDom) editorDom.appendChild(this.handleEl);
      this.handleEl.setCssStyles({ position: "absolute", display: "flex" });
      this.handleEl.style.top = top + "px";
      this.handleEl.style.left = layout.left + "px";
      this.handleEl.style.width = layout.size + "px";
      this.handleEl.style.height = layout.size + "px";
      this.handleEl.classList.toggle("is-squeezed", layout.squeezed);
    }
    this.showHighlight(editor, block);
  }
  /**
   * 取该行折叠图标（`.list-collapse-indicator` / `.collapse-indicator`）左缘的视口 x。
   * 量不到（源码模式无图标、图标未渲染、隐藏元素 rect 全 0）一律返回 null，
   * 由 computeHandleLeft 退回「贴行首左侧」的旧位置。
   */
  findFoldIndicatorLeft(cm, pos) {
    try {
      const at = cm.domAtPos(pos);
      let node = at.node;
      let lineEl = null;
      while (node) {
        if (node instanceof HTMLElement && node.classList.contains("cm-line")) {
          lineEl = node;
          break;
        }
        node = node.parentNode;
      }
      if (!lineEl) return null;
      const ind = lineEl.querySelector(".list-collapse-indicator, .collapse-indicator");
      if (!(ind instanceof HTMLElement)) return null;
      const r = ind.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return null;
      return r.left;
    } catch (e) {
      return null;
    }
  }
  setDragging(on) {
    var _a;
    (_a = this.handleEl) == null ? void 0 : _a.classList.toggle("is-dragging", on);
    if (on) this.hideHighlight();
  }
  hideHandle() {
    if (this.ctx.drag.isActive()) return;
    if (this.handleEl) this.handleEl.setCssStyles({ display: "none" });
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
    if (!this.ctx.settings.blockHoverHighlight) {
      this.hideHighlight();
      return;
    }
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
    const editorDom = cm.dom;
    const editorRect = editorDom.getBoundingClientRect();
    const contentRect = cm.contentDOM.getBoundingClientRect();
    if (el.parentElement !== editorDom) editorDom.appendChild(el);
    const top = Math.max(from.top - editorRect.top, 0);
    const bottom = Math.min(to.bottom - editorRect.top, editorRect.height);
    if (bottom - top < 4) {
      this.hideHighlight();
      return;
    }
    el.setCssStyles({ position: "absolute", display: "block" });
    el.style.top = top + "px";
    el.style.height = bottom - top + "px";
    el.style.left = from.left - editorRect.left + "px";
    el.style.width = Math.max(contentRect.right - from.left, 8) + "px";
  }
  hideHighlight() {
    if (this.highlightEl) this.highlightEl.setCssStyles({ display: "none" });
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
    if (!block) {
      this.hideHandle();
      return;
    }
    if (!this.ctx.settings.handleFollowsCursor) return;
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
/** 一次性诊断开关：只打第一条，避免悬停时刷屏 */
_HandleController.dodgeLogged = false;
var HandleController = _HandleController;

// src/columns-preview.ts
var import_view3 = require("@codemirror/view");
var import_state2 = require("@codemirror/state");
var import_obsidian7 = require("obsidian");

// src/columns-droptarget.ts
var COL_GAP_BAND = 18;
function hitColumnsLayout(layout, x, y) {
  for (const row of layout.rows) {
    if (!row.cols.length) continue;
    const first = row.cols[0].getBoundingClientRect();
    const last = row.cols[row.cols.length - 1].getBoundingClientRect();
    if (y < first.top || y > last.bottom) continue;
    const rects = row.cols.map((c) => c.getBoundingClientRect());
    const toBox = (r2) => ({ left: r2.left, right: r2.right, top: r2.top, bottom: r2.bottom });
    for (let i = 0; i < rects.length - 1; i++) {
      const boundary = (rects[i].right + rects[i + 1].left) / 2;
      if (Math.abs(x - boundary) > COL_GAP_BAND) continue;
      const gi2 = row.globalIdx[i + 1];
      return {
        kind: "gap",
        insertIndex: gi2,
        colIndex: gi2,
        box: { left: boundary - 1.5, right: boundary + 1.5, top: rects[i].top, bottom: rects[i].bottom }
      };
    }
    for (let i = 0; i < rects.length; i++) {
      const r2 = rects[i];
      if (x < r2.left || x > r2.right) continue;
      const gi2 = row.globalIdx[i];
      const mid = (r2.left + r2.right) / 2;
      if (x < mid) {
        return { kind: "before", insertIndex: gi2, colIndex: gi2, box: toBox(r2) };
      }
      return { kind: "after", insertIndex: gi2 + 1, colIndex: gi2, box: toBox(r2) };
    }
    const r = rects[rects.length - 1];
    const gi = row.globalIdx[rects.length - 1];
    return { kind: "after", insertIndex: gi + 1, colIndex: gi, box: toBox(r) };
  }
  return null;
}
function buildColLayout(colEls, rowLens) {
  const lens = rowLens.length ? rowLens : [colEls.length];
  const rows = [];
  let si = 0;
  for (const len of lens) {
    const cols = colEls.slice(si, si + len);
    const globalIdx = [];
    for (let k = 0; k < cols.length; k++) globalIdx.push(si + k);
    rows.push({ cols, globalIdx });
    si += len;
  }
  return { rows, total: colEls.length };
}
function stripQuotePrefixes(lines) {
  const out = [];
  let fenceCh = null;
  for (const l of lines) {
    if (l.trim() === "") {
      out.push("");
      continue;
    }
    let i = 0;
    while (l[i] === ">") i++;
    let t;
    if (i > 0) {
      if (l[i] === " ") i++;
      t = l.slice(i);
    } else {
      t = l.replace(/^\s+/, "");
    }
    const fence = t.match(/^(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (fenceCh === null) fenceCh = fence[1][0];
      else if (fence[1][0] === fenceCh && fence[2].trim() === "") fenceCh = null;
    }
    out.push(t);
  }
  return out.join("\n");
}
function resolveExtractLine(shellStart, shellEnd, line) {
  if (line < 0) return null;
  if (line < shellStart) return line;
  if (line > shellEnd) return line;
  return null;
}
function buildExtractInsertText(plain, lines, line, region) {
  var _a, _b, _c;
  const body = plain.trim();
  if (!body) return "";
  void region.hasBreak;
  if (line >= lines.length) {
    const lastEmpty = ((_a = lines[lines.length - 1]) != null ? _a : "") === "";
    return (lastEmpty ? "\n" : "\n\n") + body;
  }
  let prevBlank;
  if (line === 0) prevBlank = true;
  else if (line > region.end && line === region.end + 1) {
    prevBlank = false;
  } else prevBlank = ((_b = lines[line - 1]) != null ? _b : "") === "";
  const nextLine = (_c = lines[line]) != null ? _c : "";
  const lead = prevBlank ? "" : "\n";
  const trail = nextLine.trim() === "" ? "\n" : "\n\n";
  return lead + body + trail;
}
function columnToPlainBlock(text) {
  return text.replace(/\s+$/, "").replace(/^\n+/, "");
}
function buildCombinedChanges(regionFrom, regionTo, regionText, outside) {
  const changes = [
    { from: regionFrom, to: regionTo, insert: regionText }
  ];
  if (outside && outside.text) changes.push({ from: outside.pos, to: outside.pos, insert: outside.text });
  return changes;
}
function shouldUnwrapAfterExtract(remaining) {
  return remaining < 2;
}
function collectDraggedLines(editor, ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const lines = [];
  for (const r of sorted) lines.push(...getLines(editor, r.start, r.end));
  return lines;
}

// src/columns-preview.ts
function colLog(..._args) {
}
var FENCE_RE = /^\s*(`{3,}|~{3,})/;
var HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
var editingWidgets = /* @__PURE__ */ new Set();
function flushEditingColumns() {
  for (const w of [...editingWidgets]) {
    w.flushEdit();
    editingWidgets.delete(w);
  }
}
var columnEditTarget = null;
function setColumnEditTarget(ta, owner = null) {
  columnEditTarget = ta ? { ta, owner } : null;
}
function activeColumnTarget() {
  const t = columnEditTarget;
  return t && t.ta.isConnected ? t : null;
}
function isTargetEditor(target, self) {
  return target.owner == null || target.owner === self;
}
function guardTextareaEditing(ta) {
  for (const type of ["copy", "cut", "paste"]) {
    ta.addEventListener(type, (e) => e.stopPropagation());
  }
  ta.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "a") e.stopPropagation();
  });
}
function syncTextareaRows(ta) {
  const lines = Math.max(2, ta.value.split("\n").length);
  if (ta.rows !== lines) ta.rows = lines;
}
function autosizeTextarea(ta) {
  if (!ta.isConnected) return;
  ta.setCssStyles({ height: "auto" });
  const h = ta.scrollHeight;
  if (h > 0) ta.style.height = h + "px";
}
var FORMAT_MARKERS = {
  bold: ["**", "**"],
  italic: ["*", "*"],
  strikethrough: ["~~", "~~"],
  highlight: ["==", "=="],
  code: ["`", "`"],
  comment: ["%%", "%%"]
};
function applyMarkerToTextarea(ta, open, close) {
  const v = desentinelize(ta.value);
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const sel = v.slice(s, e);
  if (sel.length >= open.length + close.length && sel.startsWith(open) && sel.endsWith(close)) {
    const inner = sel.slice(open.length, sel.length - close.length);
    ta.value = v.slice(0, s) + inner + v.slice(e);
    ta.selectionStart = s;
    ta.selectionEnd = s + inner.length;
  } else if (sel) {
    ta.value = v.slice(0, s) + open + sel + close + v.slice(e);
    ta.selectionStart = s + open.length;
    ta.selectionEnd = e + open.length;
  } else {
    ta.value = v.slice(0, s) + open + close + v.slice(e);
    ta.selectionStart = ta.selectionEnd = s + open.length;
  }
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  ta.focus({ preventScroll: true });
  syncMarkerDisplay(ta);
}
function posToOffsetIn(text, pos) {
  if (!pos || typeof pos.line !== "number") return 0;
  const lines = text.split("\n");
  const line = Math.max(0, Math.min(pos.line, lines.length - 1));
  let off = 0;
  for (let i = 0; i < line; i++) off += lines[i].length + 1;
  const ch = typeof pos.ch === "number" ? Math.max(0, Math.min(pos.ch, lines[line].length)) : 0;
  return off + ch;
}
function offsetToPosIn(text, offset) {
  var _a;
  const off = Math.max(0, Math.min(offset, text.length));
  const head = text.slice(0, off);
  const line = ((_a = head.match(/\n/g)) != null ? _a : []).length;
  const ch = off - (head.lastIndexOf("\n") + 1);
  return { line, ch };
}
function applyTextToTextarea(ta, from, to, text) {
  const v = desentinelize(ta.value);
  const a = Math.max(0, Math.min(from, v.length));
  const b = Math.max(a, Math.min(to, v.length));
  ta.value = v.slice(0, a) + text + v.slice(b);
  const caret = a + text.length;
  ta.setSelectionRange(caret, caret);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  ta.focus({ preventScroll: true });
  syncMarkerDisplay(ta);
}
var patchedEditorProtos = /* @__PURE__ */ new WeakSet();
var editorProtoPatches = [];
var BRIDGE_MISS = Symbol("column-bridge-miss");
function isWholeDocSelection(editor, from, to) {
  const f = from;
  const t = to;
  if (!f || !t || f.line !== 0 || f.ch !== 0 || typeof t.line !== "number") return false;
  try {
    const api = editor;
    const last = api.lineCount() - 1;
    return t.line === last && t.ch === api.getLine(last).length;
  } catch (e) {
    return false;
  }
}
function installColumnsFormatBridge(app) {
  var _a;
  const editor = (_a = app.workspace.activeEditor) == null ? void 0 : _a.editor;
  if (!editor) return;
  const proto = Object.getPrototypeOf(editor);
  if (!proto || patchedEditorProtos.has(proto)) return;
  const origFormat = proto.toggleMarkdownFormatting;
  if (typeof origFormat !== "function") return;
  proto.toggleMarkdownFormatting = function(format) {
    const target = activeColumnTarget();
    const marker = FORMAT_MARKERS[format];
    if (target && marker && isTargetEditor(target, this)) {
      applyMarkerToTextarea(target.ta, marker[0], marker[1]);
      return;
    }
    return origFormat.call(this, format);
  };
  const origSetSelection = proto.setSelection;
  const patchedSetSelection = typeof origSetSelection === "function";
  if (patchedSetSelection) {
    proto.setSelection = function(from, to) {
      const target = activeColumnTarget();
      if (target && isTargetEditor(target, this) && isWholeDocSelection(this, from, to)) {
        target.ta.focus({ preventScroll: true });
        target.ta.select();
        return;
      }
      return origSetSelection.call(this, from, to);
    };
  }
  const extra = [];
  const patchMethod = (name, fn) => {
    const orig = proto[name];
    if (typeof orig !== "function") return;
    proto[name] = function(...args) {
      const target = activeColumnTarget();
      if (target && isTargetEditor(target, this)) {
        const out = fn(target.ta, args);
        if (out !== BRIDGE_MISS) return out;
      }
      return orig.apply(this, args);
    };
    extra.push({ name, orig });
  };
  patchMethod("getSelection", (ta) => desentinelize(ta.value.slice(ta.selectionStart, ta.selectionEnd)));
  patchMethod("somethingSelected", (ta) => ta.selectionStart !== ta.selectionEnd);
  patchMethod("replaceSelection", (ta, args) => {
    const text = args[0];
    if (typeof text !== "string") return BRIDGE_MISS;
    applyTextToTextarea(ta, ta.selectionStart, ta.selectionEnd, text);
    return void 0;
  });
  patchMethod("replaceRange", (ta, args) => {
    const text = args[0];
    const from = args[1];
    if (typeof text !== "string" || !from) return BRIDGE_MISS;
    const v = desentinelize(ta.value);
    const a = posToOffsetIn(v, from);
    const to = args[2];
    applyTextToTextarea(ta, a, to ? posToOffsetIn(v, to) : a, text);
    return void 0;
  });
  patchMethod("getRange", (ta, args) => {
    const from = args[0];
    const to = args[1];
    if (!from || !to) return BRIDGE_MISS;
    const v = desentinelize(ta.value);
    const a = posToOffsetIn(v, from);
    const b = posToOffsetIn(v, to);
    return v.slice(Math.min(a, b), Math.max(a, b));
  });
  patchMethod("getCursor", (ta, args) => {
    const which = args[0];
    const off = which === "from" || which === "anchor" ? ta.selectionStart : ta.selectionEnd;
    return offsetToPosIn(desentinelize(ta.value), off);
  });
  patchMethod("setCursor", (ta, args) => {
    const v = desentinelize(ta.value);
    const pos = args[0];
    const ch = args[1];
    const off = typeof pos === "number" && typeof ch === "number" ? posToOffsetIn(v, { line: pos, ch }) : posToOffsetIn(v, pos);
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(off, off);
    syncMarkerDisplay(ta);
    return void 0;
  });
  patchMethod(
    "posToOffset",
    (ta, args) => posToOffsetIn(desentinelize(ta.value), args[0])
  );
  patchMethod(
    "offsetToPos",
    (ta, args) => offsetToPosIn(desentinelize(ta.value), typeof args[0] === "number" ? args[0] : 0)
  );
  patchedEditorProtos.add(proto);
  editorProtoPatches.push({ proto, origFormat, origSetSelection, patchedSetSelection, extra });
}
function uninstallColumnsFormatBridge() {
  var _a;
  for (const p of editorProtoPatches) {
    p.proto.toggleMarkdownFormatting = p.origFormat;
    if (p.patchedSetSelection) p.proto.setSelection = p.origSetSelection;
    for (const e of (_a = p.extra) != null ? _a : []) p.proto[e.name] = e.orig;
    patchedEditorProtos.delete(p.proto);
  }
  editorProtoPatches.length = 0;
}
var COL_START_RE2 = /^((?:>\s*)+)\[!multi-column(?:\|[^\]]*)?\][^\n]*$/;
var QUOTE_RE2 = /^>\s?/;
var COL_LOOSE_RE = /\[!multi-column(?:\|[^\]]*)?\]/;
var forceRecompute = import_state2.StateEffect.define();
var lastDiagnostics = { regions: 0, markerLines: 0, livePreview: null, note: "", segmentsPreview: [] };
function getColumnsDiagnostics() {
  return { ...lastDiagnostics, segmentsPreview: [...lastDiagnostics.segmentsPreview] };
}
function countQuoteDepth(text) {
  const m = text.match(/^(?:>\s*)+/);
  if (!m) return 0;
  let depth = 0;
  for (let i = 0; i < m[0].length; i++) if (m[0][i] === ">") depth++;
  return depth;
}
function stripToColLevel(text, colDepth) {
  const m = text.match(/^(?:>\s*)+/);
  if (!m) return text;
  const depth = countQuoteDepth(text);
  if (depth <= colDepth) return text.slice(m[0].length);
  const keep = depth - colDepth;
  const firstKeep = depth - keep + 1;
  let startIdx = -1;
  let seen = 0;
  for (let i = 0; i < m[0].length; i++) {
    if (m[0][i] === ">") {
      seen++;
      if (seen === firstKeep) {
        startIdx = i;
        break;
      }
    }
  }
  const kept = startIdx === -1 ? "" : m[0].slice(startIdx);
  return kept + text.slice(m[0].length);
}
function computeEndPos(doc, endLine) {
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
  return { endPos, hasBreak: replacedBreak };
}
function scanRegions(doc, stats) {
  return scanRegionsIn(doc, stats, 0, doc.lines - 1);
}
function findOpenFence(doc, startLine) {
  const from = Math.max(0, startLine - 300);
  let fenceCh = null;
  for (let i = from; i < startLine; i++) {
    const text = doc.line(i + 1).text;
    if (fenceCh !== null) {
      const m = text.match(FENCE_RE);
      if (m && m[1][0] === fenceCh) fenceCh = null;
      continue;
    }
    const f = text.match(FENCE_RE);
    if (f) fenceCh = f[1][0];
  }
  return fenceCh;
}
function scanRegionsIn(doc, stats, startLine, endLine) {
  const regions = [];
  let start = -1;
  let fenceCh = findOpenFence(doc, startLine);
  const push = (endLine2) => {
    if (start === -1) return;
    const shellDepth = countQuoteDepth(doc.line(start + 1).text);
    const dividers = [];
    const rowMarks = [];
    const bgs = [];
    let divFence = null;
    for (let i = start + 1; i <= endLine2; i++) {
      const text = doc.line(i + 1).text;
      if (divFence !== null) {
        const m = text.match(FENCE_RE);
        if (m && m[1][0] === divFence) divFence = null;
        continue;
      }
      const f = text.match(FENCE_RE);
      if (f) {
        divFence = f[1][0];
        continue;
      }
      if (!QUOTE_RE2.test(text)) continue;
      if (/\[!colrow(?:\|[^\]]*)?\]/.test(text)) {
        rowMarks.push(i);
        continue;
      }
      if (/\[!col(?:\|[^\]]*)?\]/.test(text)) {
        dividers.push(i);
        const m = text.match(/\[!col\|([^\]]*)\]/);
        bgs.push(parseColBgMeta(m ? m[1] : ""));
      }
    }
    const rowBounds = rowMarks.length ? [start, ...rowMarks, endLine2 + 1] : [start, endLine2 + 1];
    const segments = [];
    const rows = [];
    const colDepth = shellDepth + (dividers.length > 0 ? 1 : 0);
    for (let ri = 0; ri < rowBounds.length - 1; ri++) {
      const rowStart = rowBounds[ri];
      const rowEnd = rowBounds[ri + 1];
      const rowDivs = dividers.filter((d) => d > rowStart && d < rowEnd);
      const bounds = [rowStart, ...rowDivs, rowEnd];
      const firstSeg = rowDivs.length > 0 ? 1 : 0;
      for (let k = firstSeg; k < bounds.length - 1; k++) {
        const lines = [];
        let segFence = null;
        for (let i = bounds[k] + 1; i < bounds[k + 1]; i++) {
          const text = doc.line(i + 1).text;
          if (!QUOTE_RE2.test(text)) continue;
          const stripped = stripToColLevel(text, colDepth);
          if (segFence !== null) {
            lines.push(stripped);
            const m = stripped.match(FENCE_RE);
            if (m && m[1][0] === segFence) segFence = null;
            continue;
          }
          const f = stripped.match(FENCE_RE);
          if (f) segFence = f[1][0];
          lines.push(stripped);
        }
        while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
        segments.push(lines.join("\n"));
      }
      rows.push(bounds.length - 1 - firstSeg);
    }
    if (segments.length && (dividers.length > 0 || segments.some((s) => s.trim() !== ""))) {
      const endInfo = computeEndPos(doc, endLine2);
      const endPos = endInfo.endPos;
      const replacedBreak = endInfo.hasBreak;
      let widths;
      let opts;
      const meta = doc.line(start + 1).text.match(/\[!multi-column\|([^\]]*)\]/);
      if (meta) {
        const wm = meta[1].match(/^(\d+(?:-\d+)+(?:\/\d+(?:-\d+)+)*)/);
        if (wm) {
          const groups = wm[1].split("/").map((g) => g.split("-").map((x) => Number(x)));
          const flat = groups.flat();
          if (flat.length === segments.length && flat.every((w) => Number.isFinite(w) && w > 0)) {
            widths = flat;
          }
        }
        const gapM = meta[1].match(/(?:^|\s)gap=(\d+)(?:\s|$)/);
        const valignM = meta[1].match(/(?:^|\s)valign=(top|center|bottom|stretch)(?:\s|$)/);
        const radiusM = meta[1].match(/(?:^|\s)radius=(\d+)(?:\s|$)/);
        const hasBorder = /(?:^|\s)border(?:\s|$)/.test(meta[1]);
        if (gapM || valignM || radiusM || hasBorder) {
          opts = {};
          if (gapM) opts.gap = Number(gapM[1]);
          if (valignM) opts.valign = valignM[1];
          if (radiusM) opts.radius = Number(radiusM[1]);
          if (hasBorder) opts.border = true;
        }
      }
      regions.push({
        startLine: start,
        endLine: endLine2,
        startPos: doc.line(start + 1).from,
        endPos,
        hasBreak: replacedBreak,
        widths,
        // 有 col 子栏且解析出的 bg 数与栏段数一致时才采用（无 col 的整块结构不带 bg）
        bgs: dividers.length > 0 && bgs.length === segments.length ? bgs : void 0,
        opts,
        // 二维行：多行时各行栏数（单行不携带，widget 按栏数均分）
        rows: rowMarks.length > 0 && rows.length > 1 ? rows : void 0,
        segments
      });
    }
  };
  for (let i = startLine; i <= endLine; i++) {
    const text = doc.line(i + 1).text;
    if (stats && COL_LOOSE_RE.test(text)) stats.markerLines++;
    if (fenceCh !== null) {
      const m = text.match(FENCE_RE);
      if (m && m[1][0] === fenceCh) fenceCh = null;
      continue;
    }
    const f = text.match(FENCE_RE);
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
    if (!QUOTE_RE2.test(text)) {
      push(i - 1);
      start = -1;
    }
  }
  if (start !== -1) push(endLine);
  return regions;
}
function hasCaretApi(doc) {
  return typeof doc.caretRangeFromPoint === "function" || typeof doc.caretPositionFromPoint === "function";
}
function caretAtPoint(doc, x, y) {
  var _a, _b;
  const r = (_a = doc.caretRangeFromPoint) == null ? void 0 : _a.call(doc, x, y);
  if (r) return { node: r.startContainer, offset: r.startOffset };
  const p = (_b = doc.caretPositionFromPoint) == null ? void 0 : _b.call(doc, x, y);
  return p ? { node: p.offsetNode, offset: p.offset } : null;
}
function plainProjection(src) {
  const drop = /* @__PURE__ */ new Set(["*", "_", "~", "=", "`", "#", ">", "[", "]", "|"]);
  let plain = "";
  const map = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "]" && src[i + 1] === "(") {
      const close = src.indexOf(")", i);
      if (close !== -1) {
        i = close;
        continue;
      }
    }
    if (c === "\n" || c === "\r" || drop.has(c)) continue;
    plain += c;
    map.push(i);
  }
  return { plain, map };
}
function looseMap(s) {
  let norm = "";
  const idx = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === " " || c === "	" || c === "\n" || c === "\r") continue;
    norm += c;
    idx.push(i);
  }
  return { norm, idx };
}
function estimateOffsetByRatio(content, source, y) {
  const rect = content.getBoundingClientRect();
  const ratio = rect.height > 0 ? Math.min(1, Math.max(0, (y - rect.top) / rect.height)) : 0;
  const lines = source.split("\n");
  const target = Math.round(ratio * (lines.length - 1));
  let off = 0;
  for (let li = 0; li < target && li < lines.length; li++) off += lines[li].length + 1;
  return off;
}
function hitIsMedia(node, content) {
  const el = node.nodeType === 1 ? node : node.parentElement;
  if (!el || el === content) return false;
  const media = el.closest("img, video, audio, canvas, svg, .internal-embed, .media-embed, .file-embed");
  return !!media && (media === content || content.contains(media));
}
function sourceOffsetFromPoint(content, source, x, y) {
  var _a, _b, _c, _d;
  const doc = content.ownerDocument;
  const empty = !source.trim();
  if (!hasCaretApi(doc)) return 0;
  const hit = caretAtPoint(doc, x, y);
  if (!hit || !content.contains(hit.node) || hit.node.nodeType !== 3) {
    if (empty) return 0;
    if (hit && content.contains(hit.node) && hitIsMedia(hit.node, content)) {
      return estimateOffsetByRatio(content, source, y);
    }
    return null;
  }
  let renderedOffset = hit.offset;
  const walker = doc.createTreeWalker(content, 4);
  for (let n = walker.nextNode(); n && n !== hit.node; n = walker.nextNode()) {
    renderedOffset += (_b = (_a = n.textContent) == null ? void 0 : _a.length) != null ? _b : 0;
  }
  const rendered = (_c = content.textContent) != null ? _c : "";
  const start = Math.max(0, renderedOffset - 24);
  const needle = rendered.slice(start, renderedOffset + 24);
  const { plain, map } = plainProjection(source);
  if (map.length) {
    const pm = looseMap(plain);
    const nn = looseMap(needle);
    const at = nn.norm ? pm.norm.indexOf(nn.norm) : -1;
    if (at >= 0) {
      const before = looseMap(needle.slice(0, renderedOffset - start)).norm.length;
      const plainIdx = pm.idx[Math.min(at + before, pm.idx.length - 1)];
      return (_d = map[plainIdx]) != null ? _d : 0;
    }
  }
  return estimateOffsetByRatio(content, source, y);
}
var MARKER_SENTINELS = {
  "*": "\u2061",
  "_": "\u2062",
  "~": "\u2063",
  "=": "\u2064",
  "`": "\u2060"
};
var SENTINEL_TO_MARKER = {
  "\u2061": "*",
  "\u2062": "_",
  "\u2063": "~",
  "\u2064": "=",
  "\u2060": "`"
};
var INLINE_FORMAT_PATTERNS = [
  { pre: 3, re: /\*\*\*(?=\S)[^\n]*?\S\*\*\*/g },
  // ***粗斜体***
  { pre: 2, re: /\*\*(?=\S)[^\n]*?\S\*\*/g },
  // **加粗**
  { pre: 1, re: /\*(?=\S)[^*\n]*?\S\*/g },
  // *斜体*
  { pre: 2, re: /(?<!\w)__(?=\S)[^\n]*?\S__(?!\w)/g },
  // __加粗__
  { pre: 1, re: /(?<!\w)_(?=\S)[^_\n]*?\S_(?!\w)/g },
  // _斜体_
  { pre: 2, re: /==(?=\S)[^\n]*?\S==/g },
  // ==高亮==
  { pre: 2, re: /~~(?=\S)[^\n]*?\S~~/g },
  // ~~删除线~~
  { pre: 1, re: /`(?=\S)[^`\n]*?\S`/g }
  // `行内代码`
];
function findInlineSpans(line) {
  const found = [];
  for (const p of INLINE_FORMAT_PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(line)) !== null) {
      found.push({ start: m.index, end: m.index + m[0].length, pre: p.pre });
      if (m[0].length === 0) p.re.lastIndex++;
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  let lastEnd = -1;
  for (const s of found) {
    if (s.start < lastEnd) continue;
    kept.push(s);
    lastEnd = s.end;
  }
  return kept;
}
function sentinelize(source, activeFrom, activeTo) {
  const lines = source.split("\n");
  let out = "";
  let base = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const marks = new Array(line.length).fill(null);
    for (const sp of findInlineSpans(line)) {
      for (let k = 0; k < sp.pre; k++) {
        marks[sp.start + k] = sp;
        marks[sp.end - 1 - k] = sp;
      }
    }
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const sp = marks[i];
      const sent = MARKER_SENTINELS[c];
      if (sp && sent) {
        const active = activeFrom <= base + sp.end && activeTo >= base + sp.start;
        out += active ? c : sent;
      } else {
        out += c;
      }
    }
    base += line.length + 1;
    if (li < lines.length - 1) out += "\n";
  }
  return out;
}
function desentinelize(display) {
  return display.replace(/[\u2060-\u2064]/g, (ch) => {
    var _a;
    return (_a = SENTINEL_TO_MARKER[ch]) != null ? _a : ch;
  });
}
function syncMarkerDisplay(ta) {
  const next = sentinelize(desentinelize(ta.value), ta.selectionStart, ta.selectionEnd);
  if (next === ta.value) return;
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  ta.value = next;
  ta.setSelectionRange(s, e);
}
function columnsContentKey(segments, widths, bgs, rows, opts) {
  var _a, _b, _c;
  return segments.join("\0") + "#" + ((_a = widths == null ? void 0 : widths.join(",")) != null ? _a : "") + "#" + ((_b = bgs == null ? void 0 : bgs.map((b) => b ? b.light + "/" + b.dark : "").join(",")) != null ? _b : "") + "#" + ((_c = rows == null ? void 0 : rows.join(",")) != null ? _c : "") + "#" + JSON.stringify(opts != null ? opts : {});
}
function settingsAppearanceKey(s) {
  return `#${s.columnsValign}|${s.columnsGap}|${s.columnsRadius}|${s.columnsBorder}`;
}
var _ColumnsWidget = class _ColumnsWidget extends import_view3.WidgetType {
  constructor(ctx, region, path, ownerEditor = null) {
    super();
    this.ctx = ctx;
    this.path = path;
    this.ownerEditor = ownerEditor;
    this.texts = [];
    this.widths = [];
    this.bgs = [];
    this.opts = {};
    /** 二维行：每行的栏数（空数组 = 单行） */
    this.rows = [];
    this.editCol = null;
    /** 进入编辑态后要落到 textarea 的光标偏移（单击定位用；渲染完成时消费一次） */
    this.pendingCaret = null;
    /** 编辑态 selectionchange 监听器的生命周期（每次 render 重建、旧监听注销） */
    this.editAbort = null;
    this.textareas = [];
    this.colEls = [];
    /** 进入编辑态前栏的渲染高度：让 textarea 初始高度与渲染态一致，消除切换跳变 */
    this.preEditHeight = 0;
    this.root = null;
    /** 快照渲染挂载用的短生命周期组件：每次 renderInner 重建前 unload，避免
     *  使用主插件实例作 component（生命周期过长会积累泄漏）。 */
    this.renderChild = null;
    this.parentView = null;
    this.focusCol = -1;
    this.menuEl = null;
    this.colorPickerEl = null;
    /** 需求 B：拖出分栏时的落点插入线（挂在 .cm-editor 上，随拖拽重建/移除） */
    this.outLineEl = null;
    this.onDocMouseDown = (ev) => {
      if (this.menuEl && !this.menuEl.contains(ev.target)) this.closeMenu();
      if (this.colorPickerEl && !this.colorPickerEl.contains(ev.target)) this.closeColorPicker();
    };
    this.region = region;
    this.texts = [...region.segments];
    this.widths = region.widths ? [...region.widths] : [];
    this.bgs = region.bgs ? [...region.bgs] : [];
    this.opts = region.opts ? { ...region.opts } : {};
    this.rows = region.rows ? [...region.rows] : [];
  }
  /** 内容签名：内容/宽度/背景色/行结构/外观参数变化时装饰层会重建 widget。
   *  额外纳入分栏默认外观设置（gap/radius/valign/border）：用户在设置里改动时，
   *  若仅用外壳参数判断会命中缓存、复用旧 DOM，导致内联 alignSelf、边框不更新。 */
  get key() {
    return columnsContentKey(this.texts, this.widths, this.bgs, this.rows, this.opts) + settingsAppearanceKey(this.ctx.settings);
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
  /**
   * viewport 行高防御（CM6 链 1 根因之一）：
   * 不实现 estimatedHeight 时，CM6 在初次布局 / 异步渲染完成前把本 block
   * widget 视为 0 高块，若随后内容高度突变（MarkdownRenderer 异步填充），
   * 行高映射与实际布局错位，mousedown → posAtCoords 会基于错位映射算出
   * 越界 pos → doc.lineAt(pos) → lineInner 崩（undefined.length）。
   * 提供稳定下限估算，让 CM6 初始行高映射留出余量，requestMeasure 修正前
   * 点击不再越界。
   */
  get estimatedHeight() {
    const rows = this.rows.length ? this.rows.length : 1;
    let maxLines = 1;
    for (const t of this.texts) {
      let lines = 1;
      for (let i = 0; i < t.length; i++) if (t.charCodeAt(i) === 10) lines++;
      if (lines > maxLines) maxLines = lines;
    }
    return Math.max(48, rows * (64 + maxLines * 24));
  }
  /** 单栏内容估算高度：按该栏自身文本行数估算。
   *  此前用整组估算（最高栏行数）给每栏内容设 min-height，短栏被占位
   *  高度撑到与最高栏齐平，min-height 优先级高于 align-self，导致
   *  顶部/居中/底部对齐下短栏无法收缩到内容高。 */
  colContentEstimatedHeight(i) {
    var _a;
    const t = (_a = this.texts[i]) != null ? _a : "";
    let lines = 1;
    for (let k = 0; k < t.length; k++) if (t.charCodeAt(k) === 10) lines++;
    return Math.max(28, lines * 24);
  }
  ignoreEvent() {
    return true;
  }
  /**
   * 供外部（drag.ts）做落点命中用的布局信息：各行的栏 DOM 元素 + 全局下标。
   * 走 DOM 而非 CM 坐标的原因见 columns-droptarget.ts 顶部说明。
   */
  getLayoutInfo() {
    return buildColLayout(this.colEls, this.rows);
  }
  /** 当前分栏区间的文档行范围（需求 B 判定"紧邻上行/下行"合法落点用） */
  getLineRange() {
    return { start: this.region.startLine, end: this.region.endLine };
  }
  /** 区间起点在 CM6 文档中的偏移（合并写回时定位 regionFrom） */
  getRegionStartPos() {
    return this.region.startPos;
  }
  /** 区间终点在 CM6 文档中的偏移（不含） */
  getRegionEndPos() {
    return this.region.endPos;
  }
  /** 区间末尾是否吞掉了换行（写回时决定要不要补 '\n'） */
  hasBreak() {
    return this.region.hasBreak;
  }
  toDOM(view) {
    this.parentView = view;
    const wrap = createEl("div");
    wrap.className = "block-editor-columns-widget";
    wrap.dataset.regionStart = String(this.region.startPos);
    this.root = wrap;
    widgetByRoot.set(wrap, this);
    this.renderInner();
    return wrap;
  }
  /** 结构或内容变更后写回文档（单步撤销） */
  commitDoc() {
    const view = this.parentView;
    if (!view) return;
    const text = buildColumnsMarkdown(
      this.texts,
      this.widths,
      this.bgs,
      this.rowEnds,
      Object.keys(this.opts).length ? this.opts : void 0
    ) + (this.region.hasBreak ? "\n" : "");
    const curText = view.state.doc.sliceString(this.region.startPos, this.region.endPos);
    if (curText === text) return;
    keepViewport(view, () => {
      view.dispatch({
        changes: { from: this.region.startPos, to: this.region.endPos, insert: text }
      });
    });
  }
  /** 每行栏数 → buildColumnsMarkdown 的行末栏索引（[1,3] 表示 0-1 / 2-3 两行） */
  get rowEnds() {
    if (!this.rows.length) return void 0;
    const ends = [];
    let acc = 0;
    for (let r = 0; r < this.rows.length - 1; r++) {
      acc += this.rows[r];
      ends.push(acc - 1);
    }
    return ends.length ? ends : void 0;
  }
  /**
   * 当前内存状态对应的分栏 markdown 区间文本（含 hasBreak 的尾随换行）。
   * 供外部拖拽路径拼装"区间重写 + 区间外插入"的单事务 changes。
   */
  buildRegionText() {
    return buildColumnsMarkdown(
      this.texts,
      this.widths,
      this.bgs,
      this.rowEnds,
      Object.keys(this.opts).length ? this.opts : void 0
    ) + (this.region.hasBreak ? "\n" : "");
  }
  /**
   * 在指定全局栏位置插入一栏（需求 A：文档块拖入分栏）。
   * 只改内存状态不写回 —— 写回由调用方合并进单事务，保证单步撤销。
   *
   * @param insertIndex 全局插入下标（0 = 最前，texts.length = 末尾）
   * @param text        新栏内容（已剥引用前缀的裸 markdown）
   * @returns 是否插入成功（越界或空内容时 false）
   */
  insertColumnAt(insertIndex, text) {
    const at = Math.max(0, Math.min(insertIndex, this.texts.length));
    if (!text.trim()) return false;
    const n = this.texts.length + 1;
    const newW = Math.round(100 / n * 10) / 10;
    const scale = (100 - newW) / 100;
    if (this.widths.length === this.texts.length) {
      this.widths = this.widths.map((w) => Math.round(w * scale * 10) / 10);
      this.widths.splice(at, 0, newW);
    }
    this.texts.splice(at, 0, text);
    this.bgs.splice(at, 0, null);
    if (this.rows.length) {
      const r = this.rowIndexOf(at);
      this.rows[r]++;
    }
    return true;
  }
  /**
   * 移除指定栏并返回其内容（需求 B：栏拖出分栏）。
   * 只改内存状态不写回 —— 同 insertColumnAt，由调用方合并进单事务。
   *
   * 宽度按比例分给剩余栏；剩 1 栏时清空宽度元数据（配合调用方降级为取消分栏）。
   *
   * @returns 被移除栏的文本；下标非法返回 null
   */
  removeColumnAt(i) {
    if (i < 0 || i >= this.texts.length) return null;
    const removed = this.texts[i];
    this.texts.splice(i, 1);
    this.bgs.splice(i, 1);
    if (this.widths.length === this.texts.length + 1) {
      this.widths.splice(i, 1);
      const sum = this.widths.reduce((a, b) => a + b, 0) || 1;
      this.widths = this.widths.map((w) => Math.round(w / sum * 100 * 10) / 10);
    } else {
      this.widths = [];
    }
    if (this.rows.length) {
      const r = this.rowIndexOf(i);
      this.rows[r]--;
      if (this.rows[r] <= 0 && this.rows.length > 1) this.rows.splice(r, 1);
    }
    return removed;
  }
  /** 剩余栏数（需求 B 判定是否降级为取消分栏） */
  columnCount() {
    return this.texts.length;
  }
  /**
   * 剩余栏全部拼成普通段落文本（降级为取消分栏时用）。
   * 与 convert.ts 的 unwrapColumns 语义一致：栏间用空行分隔、剥掉引用前缀。
   */
  buildUnwrappedText() {
    return this.texts.map((t) => t.replace(/\s+$/, "")).filter((t) => t.length > 0).join("\n\n");
  }
  /** 重建 widget DOM（交互操作入口专用：菜单/拖拽/进入退出编辑）。
   *  视口锁定：DOM 重建会改变 widget 实测高度，CM6 重算视口时整篇文档滚动条会
   *  跳离当前编辑位置；钉住 scrollTop 让视图停在原处。
   *  仅在「CM6 更新之外」的调用点使用——CM6 更新过程中（toDOM）读到的 scrollTop
   *  不可信，该路径直接走 renderInner()。 */
  render() {
    keepViewport(this.parentView, () => this.renderInner());
  }
  /** 卸载快照渲染挂载的短生命周期组件并置空（widget 重建 / 弃用时调用） */
  disposeRenderChild() {
    if (this.renderChild) {
      try {
        this.renderChild.unload();
      } catch (e) {
        console.error("[BE-columns] \u5378\u8F7D\u6E32\u67D3\u7EC4\u4EF6\u5931\u8D25", e);
      }
      this.renderChild = null;
    }
  }
  /** widget 被缓存淘汰 / 文档切换 / 开关关闭时调用：卸载快照渲染组件 */
  destroy() {
    this.disposeRenderChild();
  }
  /** 结构 / 内容变更后的统一收尾：写回文档 + 重建 DOM。
   *  写回延迟到微任务（CM 更新期间禁止 dispatch）。 */
  mutate() {
    queueMicrotask(() => this.commitDoc());
    this.render();
  }
  renderInner() {
    var _a, _b;
    const wrap = this.root;
    if (!wrap) return;
    this.disposeRenderChild();
    if (this.editAbort) {
      this.editAbort.abort();
      this.editAbort = null;
    }
    const focusTarget = this.editCol;
    wrap.textContent = "";
    this.textareas = [];
    this.colEls = [];
    this.closeMenu();
    this.closeColorPicker();
    if (this.editCol === null) setColumnEditTarget(null);
    const rowLens = this.rows.length ? this.rows : [this.texts.length];
    let si = 0;
    for (let ri = 0; ri < rowLens.length; ri++) {
      const row = createEl("div");
      row.className = "block-editor-columns-row";
      if (ri < rowLens.length - 1) row.classList.add("block-editor-columns-row-mid");
      wrap.appendChild(row);
      if (this.opts.gap != null) wrap.style.setProperty("--be-col-gap", this.opts.gap + "px");
      if (this.opts.valign) wrap.style.setProperty("--be-col-valign", colValignToCss(this.opts.valign));
      if (this.opts.radius != null) wrap.style.setProperty("--be-col-radius", this.opts.radius + "px");
      if (this.opts.border) row.classList.add("block-editor-columns-border");
      const rowLen = rowLens[ri];
      for (let j = 0; j < rowLen; j++, si++) {
        const i = si;
        if (j > 0) {
          const resizer = createEl("div");
          resizer.className = "block-editor-col-resizer";
          resizer.title = "\u62D6\u62FD\u8C03\u6574\u680F\u5BBD";
          resizer.addEventListener("mousedown", (e) => this.startResize(e, i - 1, row, resizer));
          row.appendChild(resizer);
        }
        const col = createEl("div");
        col.className = "block-editor-col-editor";
        const colWidth = (_a = this.widths[i]) != null ? _a : 100 / this.texts.length;
        col.style.flex = colWidth + " 1 0%";
        const v = (_b = this.opts.valign) != null ? _b : this.ctx.settings.columnsValign;
        col.style.alignSelf = colValignToCss(v);
        setColBgVars(col, this.bgs[i]);
        const grip = createEl("div");
        grip.className = "block-editor-col-grip";
        grip.textContent = "\u283F";
        grip.title = "\u62D6\u52A8\u6392\u5E8F\uFF1B\u70B9\u51FB\u6253\u5F00\u83DC\u5355";
        grip.addEventListener("mousedown", (e) => this.gripDown(e, i));
        col.appendChild(grip);
        if (this.editCol === i) {
          const ta = createEl("textarea");
          ta.className = "block-editor-col-textarea";
          ta.value = sentinelize(this.texts[i], -1, -1);
          ta.spellcheck = false;
          syncTextareaRows(ta);
          setColumnEditTarget(ta, this.ownerEditor);
          guardTextareaEditing(ta);
          let composing = false;
          ta.addEventListener("compositionstart", () => {
            composing = true;
          });
          ta.addEventListener("compositionend", () => {
            composing = false;
            syncMarkerDisplay(ta);
            autosizeTextarea(ta);
          });
          const ac = new AbortController();
          this.editAbort = ac;
          document.addEventListener(
            "selectionchange",
            () => {
              if (composing) return;
              if (document.activeElement !== ta) return;
              if (ta.selectionStart !== ta.selectionEnd) return;
              syncMarkerDisplay(ta);
            },
            { signal: ac.signal }
          );
          ta.addEventListener("input", () => {
            this.texts[i] = desentinelize(ta.value);
            syncTextareaRows(ta);
            autosizeTextarea(ta);
          });
          ta.addEventListener("copy", (e) => {
            var _a2;
            const s = ta.selectionStart;
            const en = ta.selectionEnd;
            if (s === en) return;
            (_a2 = e.clipboardData) == null ? void 0 : _a2.setData("text/plain", desentinelize(ta.value.slice(s, en)));
            e.preventDefault();
          });
          ta.addEventListener("cut", (e) => {
            var _a2;
            const s = ta.selectionStart;
            const en = ta.selectionEnd;
            if (s === en) return;
            (_a2 = e.clipboardData) == null ? void 0 : _a2.setData("text/plain", desentinelize(ta.value.slice(s, en)));
            e.preventDefault();
            const val = ta.value.slice(0, s) + ta.value.slice(en);
            ta.value = val;
            ta.setSelectionRange(s, s);
            this.texts[i] = desentinelize(val);
            syncMarkerDisplay(ta);
          });
          ta.addEventListener("blur", () => {
            this.later(() => {
              if (this.editCol === i) {
                this.texts[i] = desentinelize(ta.value);
                this.editCol = null;
                editingWidgets.delete(this);
                setColumnEditTarget(null);
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
                setColumnEditTarget(null);
                queueMicrotask(() => this.commitDoc());
                this.render();
              });
            }
          });
          col.appendChild(ta);
          this.textareas.push(ta);
          if (this.preEditHeight > 0) {
            ta.style.height = this.preEditHeight + "px";
            ta.style.minHeight = this.preEditHeight + "px";
          }
        } else {
          const content = createEl("div");
          content.className = "block-editor-col-content";
          content.addEventListener("mousedown", (e) => {
            var _a2, _b2;
            if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            if ((_b2 = (_a2 = e.target) == null ? void 0 : _a2.closest) == null ? void 0 : _b2.call(_a2, "a")) return;
            if (this.editCol !== null && this.editCol !== i) return;
            const pos = sourceOffsetFromPoint(content, this.texts[i], e.clientX, e.clientY);
            if (pos === null) return;
            e.preventDefault();
            this.enterEdit(i, pos);
          });
          col.appendChild(content);
          content.style.minHeight = this.colContentEstimatedHeight(i) + "px";
          if (!this.texts[i] || !this.texts[i].trim()) {
            content.classList.add("block-editor-col-empty");
          } else {
            if (!this.renderChild) this.renderChild = new import_obsidian7.Component();
            import_obsidian7.MarkdownRenderer.render(this.ctx.app, this.texts[i], content, this.path, this.renderChild).then(() => {
              const rm = () => {
                var _a2;
                return (_a2 = this.parentView) == null ? void 0 : _a2.requestMeasure();
              };
              rm();
              window.requestAnimationFrame(rm);
              window.setTimeout(rm, 300);
            }).catch(() => {
              content.setText("\u70B9\u51FB\u7F16\u8F91\u6B64\u680F");
            });
          }
        }
        this.colEls.push(col);
        row.appendChild(col);
      }
    }
    for (const ta of this.textareas) autosizeTextarea(ta);
    if (focusTarget !== null && this.textareas[0]) {
      const ta = this.textareas[0];
      ta.focus({ preventScroll: true });
      const caret = this.pendingCaret;
      this.pendingCaret = null;
      if (caret !== null) {
        const p = Math.max(0, Math.min(caret, ta.value.length));
        ta.setSelectionRange(p, p);
      }
      syncMarkerDisplay(ta);
    }
  }
  /** 进入编辑态；caretPos 为光标要落到的源码偏移（单击定位，不传则等同旧行为） */
  enterEdit(i, caretPos = null) {
    var _a, _b;
    if (this.editCol !== null) return;
    installColumnsFormatBridge(this.ctx.app);
    this.preEditHeight = (_b = (_a = this.colEls[i]) == null ? void 0 : _a.offsetHeight) != null ? _b : 0;
    this.editCol = i;
    this.pendingCaret = caretPos;
    editingWidgets.add(this);
    this.render();
  }
  /** 把当前编辑中的内容立即写回文档；DOM 已销毁的旧实例直接放弃。
   *  切换标签页 / 关闭文档时 blur 可能不触发，由 flushEditingColumns 兜底调用。 */
  flushEdit() {
    var _a;
    if (this.editCol === null) return;
    if (this.root && !this.root.isConnected) {
      this.editCol = null;
      setColumnEditTarget(null);
      return;
    }
    const ta = this.textareas[this.editCol];
    if (ta) this.texts[this.editCol] = desentinelize(ta.value);
    this.editCol = null;
    setColumnEditTarget(null);
    try {
      this.commitDoc();
    } catch (e) {
    }
    if ((_a = this.root) == null ? void 0 : _a.isConnected) this.render();
  }
  /** 当前栏所在行号（单行时恒 0） */
  rowIndexOf(colIdx) {
    if (!this.rows.length) return 0;
    let acc = 0;
    for (let r = 0; r < this.rows.length; r++) {
      if (colIdx < acc + this.rows[r]) return r;
      acc += this.rows[r];
    }
    return this.rows.length - 1;
  }
  /** 行 r 的全局栏区间 [start, end) */
  rowRange(r) {
    const start = this.rows.slice(0, r).reduce((a, b) => a + b, 0);
    return [start, start + this.rows[r]];
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
    if (this.rows.length) this.rows[this.rowIndexOf(afterIndex)]++;
    this.mutate();
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
    if (this.rows.length) {
      const r = this.rowIndexOf(i);
      this.rows[r]--;
      if (this.rows[r] <= 0 && this.rows.length > 1) this.rows.splice(r, 1);
    }
    this.mutate();
  }
  /** H2：把第 i 栏拆成两栏（文本按行对半，宽度对半，背景沿用） */
  splitColumnAt(i) {
    var _a, _b, _c;
    const t = (_a = this.texts[i]) != null ? _a : "";
    const lines = t.split("\n");
    const mid = Math.max(1, Math.ceil(lines.length / 2));
    const left = lines.slice(0, mid).join("\n");
    const right = lines.slice(mid).join("\n");
    const w = (_b = this.widths[i]) != null ? _b : 100 / this.texts.length;
    this.texts[i] = left;
    this.texts.splice(i + 1, 0, right);
    this.widths.splice(i + 1, 0, w / 2);
    this.widths[i] = w / 2;
    this.bgs.splice(i + 1, 0, (_c = this.bgs[i]) != null ? _c : null);
    if (this.rows.length) this.rows[this.rowIndexOf(i)]++;
    this.mutate();
  }
  /** H2：把第 i 栏与下一栏合并（行末栏禁止跨行合并；剩 1 栏时不执行） */
  mergeColumns(i) {
    var _a, _b, _c;
    if (this.texts.length <= 1) return;
    if (this.rows.length && i + 1 >= this.rowRange(this.rowIndexOf(i))[1]) return;
    const right = this.texts[i + 1];
    this.texts[i] = this.texts[i] + (right.trim() ? "\n" + right : "");
    this.widths[i] = ((_a = this.widths[i]) != null ? _a : 1) + ((_b = this.widths[i + 1]) != null ? _b : 1);
    this.bgs[i] = (_c = this.bgs[i]) != null ? _c : this.bgs[i + 1];
    this.texts.splice(i + 1, 1);
    this.widths.splice(i + 1, 1);
    this.bgs.splice(i + 1, 1);
    if (this.rows.length) this.rows[this.rowIndexOf(i)]--;
    this.mutate();
  }
  /** H2：分栏末尾追加一行（栏数与首行一致，含 `>> [!colrow]` 行标记） */
  appendRow() {
    const perRow = this.rows.length ? this.rows[0] : this.texts.length;
    for (let k = 0; k < perRow; k++) {
      this.texts.push("");
      this.widths.push(Math.round(100 / perRow * 10) / 10);
      this.bgs.push(null);
    }
    this.rows = this.rows.length ? [...this.rows, perRow] : [perRow, perRow];
    this.mutate();
  }
  /** H2：删除整行（移除该行全部栏；删后仅剩 1 行时回到单行模式，colrow 标记一并剥离） */
  removeRowAt(r) {
    if (this.rows.length <= 1) return;
    const [s, e] = this.rowRange(r);
    this.texts.splice(s, e - s);
    this.widths.splice(s, e - s);
    this.bgs.splice(s, e - s);
    this.rows.splice(r, 1);
    if (this.rows.length === 1) this.rows = [];
    this.mutate();
  }
  /** H2：整行上移 / 下移（交换相邻两行的栏块、宽度、背景与行宽数组） */
  moveRow(r, dir) {
    const t = r + dir;
    if (t < 0 || t >= this.rows.length) return;
    const [s1, e1] = this.rowRange(r);
    const [s2, e2] = this.rowRange(t);
    const swap = (arr) => {
      const a = arr.slice(s1, e1);
      const b = arr.slice(s2, e2);
      arr.splice(0, arr.length, ...arr.slice(0, s1), ...b, ...arr.slice(e1, s2), ...a, ...arr.slice(e2));
    };
    swap(this.texts);
    swap(this.widths);
    swap(this.bgs);
    const tmp = this.rows[r];
    this.rows[r] = this.rows[t];
    this.rows[t] = tmp;
    this.mutate();
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
    const finish = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", finish);
      window.removeEventListener("blur", finish);
      resizer.classList.remove("is-active");
      this.later((view) => this.commitDoc());
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", finish);
    window.addEventListener("blur", finish);
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
    let outLine = null;
    const dbg = (...a) => {
      console.log("[block-editor] col-drag:", ...a);
    };
    dbg("gripDown", { from, cols: this.colEls.length, start: this.region.startLine, end: this.region.endLine });
    const clearDrop = () => this.colEls.forEach((c) => c.classList.remove("block-editor-col-drop"));
    const setDragging = (on) => {
      const c = this.colEls[from];
      if (c) c.classList.toggle("block-editor-col-dragging", on);
    };
    const detach = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", onCancel);
    };
    const removeOutLineEl = () => {
      if (this.outLineEl) {
        this.outLineEl.remove();
        this.outLineEl = null;
      }
    };
    const clearOutLine = () => {
      removeOutLineEl();
      outLine = null;
    };
    const computeOutLine = (ev) => {
      var _a, _b, _c, _d, _e;
      const view = this.parentView;
      if (!view) return null;
      if (this.root && ((_c = (_b = (_a = document.elementFromPoint) == null ? void 0 : _a.call(document, ev.clientX, ev.clientY)) == null ? void 0 : _b.closest) == null ? void 0 : _c.call(_b, ".block-editor-columns-widget")) === this.root) {
        return null;
      }
      if (!editorDomAtPoint(ev.clientX, ev.clientY, view)) return null;
      const pos = view.posAtCoords({ x: ev.clientX, y: ev.clientY });
      if (pos == null) return null;
      const { start, end } = this.getLineRange();
      const doc = view.state.doc;
      const l = doc.lineAt(pos);
      const top = (_d = view.coordsAtPos(l.from)) == null ? void 0 : _d.top;
      const bottom = (_e = view.coordsAtPos(l.to)) == null ? void 0 : _e.bottom;
      const mid = top != null && bottom != null ? (top + bottom) / 2 : null;
      const after = mid != null && ev.clientY >= mid;
      const target = l.number - 1 + (after ? 1 : 0);
      return resolveExtractLine(start, end, target);
    };
    const showOutLine = (ev, line) => {
      var _a;
      const view = this.parentView;
      if (!view || !view.dom) return;
      const doc = view.state.doc;
      const editorRect = view.dom.getBoundingClientRect();
      const contentRect = view.contentDOM.getBoundingClientRect();
      if (line >= doc.lines) {
        const last = doc.line(doc.lines);
        const c2 = view.coordsAtPos(last.to);
        if (!c2) return;
        removeOutLineEl();
        const el2 = createEl("div");
        el2.className = "block-editor-indicator block-editor-col-outline";
        el2.style.left = `${contentRect.left - editorRect.left}px`;
        el2.style.width = `${Math.max(contentRect.width, 40)}px`;
        el2.style.top = `${((_a = c2.bottom) != null ? _a : c2.top) - editorRect.top - 1}px`;
        view.dom.appendChild(el2);
        this.outLineEl = el2;
        return;
      }
      const l = doc.line(line + 1);
      const c = view.coordsAtPos(l.from);
      if (!c) return;
      removeOutLineEl();
      const el = createEl("div");
      el.className = "block-editor-indicator block-editor-col-outline";
      el.style.left = `${contentRect.left - editorRect.left}px`;
      el.style.width = `${Math.max(contentRect.width, 40)}px`;
      el.style.top = `${c.top - editorRect.top - 1}px`;
      view.dom.appendChild(el);
      this.outLineEl = el;
    };
    const onMove = (ev) => {
      var _a, _b;
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) <= THRESHOLD) return;
      if (!dragging) {
        dragging = true;
        setDragging(true);
        dbg("drag start");
      }
      const el = (_b = (_a = document.elementFromPoint) == null ? void 0 : _a.call(document, ev.clientX, ev.clientY)) == null ? void 0 : _b.closest(".block-editor-col-editor");
      hover = el ? this.colEls.indexOf(el) : -1;
      this.colEls.forEach((c, k) => c.classList.toggle("block-editor-col-drop", k === hover && hover !== from));
      if (hover !== -1) clearOutLine();
      else {
        const line = computeOutLine(ev);
        if (line !== outLine) dbg("outLine", line, { hover });
        outLine = line;
        if (line === null) clearOutLine();
        else showOutLine(ev, line);
      }
    };
    const onCancel = () => {
      detach();
      clearDrop();
      setDragging(false);
      clearOutLine();
    };
    const onUp = (ev) => {
      var _a, _b;
      detach();
      clearDrop();
      setDragging(false);
      const finalOutLine = outLine;
      clearOutLine();
      dbg("up", { finalOutLine, hover, dragging, alt: ev.altKey });
      if (!dragging) {
        this.showColMenu(ev, from);
        return;
      }
      if (finalOutLine !== null && hover === -1) {
        const done = this.extractColumnTo(from, finalOutLine, ev.altKey);
        dbg("extract", done);
        if (done) return;
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
          this.mutate();
        });
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("blur", onCancel);
  }
  /**
   * 需求 B 落地：把第 i 栏移出分栏，作为普通块插入到 line 行之前。
   *
   * 单步撤销：「区间重写（分栏少一栏）」+「区间外插入（普通块）」合并进同一
   * Transaction，理由同 commitColumnDrop。
   *
   * 边界规则（已与用户确认）：
   *  - 拖出后剩 1 栏 → 自动降级为取消分栏，整段还原为普通段落
   *  - 被拖出栏的宽度按比例分给剩余栏（removeColumnAt 内部处理）
   *  - 空栏禁止拖出（拖出去也没有内容）
   *  - 行末栏可拖出到分栏外（跨行合并由 mergeColumns 负责，此处不拦）
   *
   * @param line  目标插入行号（0-based，插到该行之前）
   * @param copy  Alt = 复制到分栏外，栏仍保留
   * @returns 是否已提交
   */
  extractColumnTo(i, line, copy) {
    var _a;
    const view = this.parentView;
    if (!view) return false;
    const text = (_a = this.texts[i]) != null ? _a : "";
    if (!text.trim()) return false;
    const plain = columnToPlainBlock(text).trim();
    if (!plain) return false;
    const doc = view.state.doc;
    const regionFrom = this.region.startPos;
    const regionTo = this.region.endPos;
    const lines = [];
    for (let k = 1; k <= doc.lines; k++) lines.push(doc.line(k).text);
    const insert = buildExtractInsertText(plain, lines, line, {
      start: this.region.startLine,
      end: this.region.endLine,
      hasBreak: this.region.hasBreak
    });
    if (!insert) return false;
    const lineFrom = line >= doc.lines ? doc.length : doc.line(line + 1).from;
    if (copy) {
      keepViewport(view, () => {
        view.dispatch({ changes: buildCombinedChanges(regionFrom, regionTo, this.buildRegionText(), { pos: lineFrom, text: insert }) });
      });
      return true;
    }
    const removed = this.removeColumnAt(i);
    if (removed === null) return false;
    const regionText = shouldUnwrapAfterExtract(this.columnCount()) ? this.buildUnwrappedText() + (this.region.hasBreak ? "\n" : "") : this.buildRegionText();
    keepViewport(view, () => {
      view.dispatch({ changes: buildCombinedChanges(regionFrom, regionTo, regionText, { pos: lineFrom, text: insert }) });
    });
    this.render();
    return true;
  }
  // ---- grip 命令菜单：设置背景色 / 新增栏 / 删除栏（横排纯图标） ----
  /** lucide 风格内联图标（不依赖 Obsidian setIcon，测试环境同样可用） */
  static iconEl(paths) {
    const svg = createSvg("svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const d of paths) {
      const p = createSvg("path");
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
  /** 写入某栏背景色并同步到文档与渲染（color 为 null 表示清除背景）。
   *  仅设置浅色：深色由算法自动推导并写入内存模型（不落库，读取端可复现）；
   *  显式覆盖深色请用 applyBgDark。 */
  applyBg(i, color) {
    this.bgs[i] = color ? { light: color, dark: deriveDarkColor(color) } : null;
    this.mutate();
  }
  /** 覆盖/清除某栏深色主题背景：dark 为 null 时恢复为自动推导值 */
  applyBgDark(i, dark) {
    const cur = this.bgs[i];
    if (!(cur == null ? void 0 : cur.light)) return;
    this.bgs[i] = { light: cur.light, dark: dark != null ? dark : deriveDarkColor(cur.light) };
    this.mutate();
  }
  showColMenu(e, i) {
    this.closeMenu();
    this.closeColorPicker();
    const menu = createEl("div");
    menu.className = "block-editor-col-menu";
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";
    const bgBtn = createEl("button");
    bgBtn.className = "block-editor-col-menu-item";
    bgBtn.title = "\u8BBE\u7F6E\u80CC\u666F\u8272";
    bgBtn.appendChild(_ColumnsWidget.iconEl(_ColumnsWidget.ICON_PALETTE));
    bgBtn.addEventListener("click", () => {
      this.closeMenu();
      this.openColorPicker(i, e.clientX, e.clientY);
    });
    const addBtn = createEl("button");
    addBtn.className = "block-editor-col-menu-item";
    addBtn.title = "\u65B0\u589E\u680F";
    addBtn.appendChild(_ColumnsWidget.iconEl(_ColumnsWidget.ICON_PLUS));
    addBtn.addEventListener("click", () => {
      this.closeMenu();
      this.addColumnAt(i);
    });
    const delBtn = createEl("button");
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
    const splitBtn = createEl("button");
    splitBtn.className = "block-editor-col-menu-item";
    splitBtn.title = "\u62C6\u5206\u680F\uFF08\u4E00\u680F\u62C6\u4E24\u680F\uFF09";
    splitBtn.appendChild(_ColumnsWidget.iconEl(_ColumnsWidget.ICON_SPLIT));
    splitBtn.addEventListener("click", () => {
      this.closeMenu();
      this.splitColumnAt(i);
    });
    const mergeBtn = createEl("button");
    mergeBtn.className = "block-editor-col-menu-item";
    mergeBtn.title = "\u5408\u5E76\u5230\u4E0B\u4E00\u680F";
    const rowEnd = this.rows.length ? this.rowRange(this.rowIndexOf(i))[1] : this.texts.length;
    if (single || i + 1 >= rowEnd) {
      mergeBtn.disabled = true;
      mergeBtn.title = single ? "\u53EA\u5269 1 \u680F\uFF0C\u65E0\u6CD5\u5408\u5E76" : "\u5DF2\u662F\u884C\u672B\u680F\uFF0C\u65E0\u6CD5\u8DE8\u884C\u5408\u5E76";
    }
    mergeBtn.appendChild(_ColumnsWidget.iconEl(_ColumnsWidget.ICON_MERGE));
    mergeBtn.addEventListener("click", () => {
      this.closeMenu();
      this.mergeColumns(i);
    });
    const rowBtn = createEl("button");
    rowBtn.className = "block-editor-col-menu-item";
    rowBtn.title = "\u8FFD\u52A0\u4E00\u884C\uFF08\u4E0E\u9996\u884C\u540C\u680F\u6570\uFF09";
    rowBtn.appendChild(_ColumnsWidget.iconEl(_ColumnsWidget.ICON_PLUS));
    rowBtn.addEventListener("click", () => {
      this.closeMenu();
      this.appendRow();
    });
    const delRowBtn = createEl("button");
    delRowBtn.className = "block-editor-col-menu-item";
    delRowBtn.title = this.rows.length > 1 ? "\u5220\u9664\u6574\u884C" : "\u4EC5\u5269 1 \u884C\uFF0C\u65E0\u6CD5\u5220\u9664\u6574\u884C";
    if (this.rows.length <= 1) delRowBtn.disabled = true;
    delRowBtn.appendChild(_ColumnsWidget.iconEl(_ColumnsWidget.ICON_X));
    delRowBtn.addEventListener("click", () => {
      this.closeMenu();
      this.removeRowAt(this.rowIndexOf(i));
    });
    menu.appendChild(bgBtn);
    menu.appendChild(addBtn);
    menu.appendChild(splitBtn);
    menu.appendChild(mergeBtn);
    menu.appendChild(delBtn);
    menu.appendChild(rowBtn);
    menu.appendChild(delRowBtn);
    if (this.rows.length > 1) {
      const rIdx = this.rowIndexOf(i);
      const rowUp = createEl("button");
      rowUp.className = "block-editor-col-menu-item";
      rowUp.title = "\u4E0A\u79FB\u6574\u884C";
      if (rIdx === 0) rowUp.disabled = true;
      rowUp.appendChild(_ColumnsWidget.iconEl(_ColumnsWidget.ICON_ROW_UP));
      rowUp.addEventListener("click", () => {
        this.closeMenu();
        this.moveRow(rIdx, -1);
      });
      const rowDown = createEl("button");
      rowDown.className = "block-editor-col-menu-item";
      rowDown.title = "\u4E0B\u79FB\u6574\u884C";
      if (rIdx === this.rows.length - 1) rowDown.disabled = true;
      rowDown.appendChild(_ColumnsWidget.iconEl(_ColumnsWidget.ICON_ROW_DOWN));
      rowDown.addEventListener("click", () => {
        this.closeMenu();
        this.moveRow(rIdx, 1);
      });
      menu.appendChild(rowUp);
      menu.appendChild(rowDown);
    }
    document.body.appendChild(menu);
    this.menuEl = menu;
    window.setTimeout(() => {
      window.addEventListener("mousedown", this.onDocMouseDown, { once: true });
    }, 0);
  }
  /** 弹窗选色：预设色板 + 自定义 hex + 无背景色（清除） */
  openColorPicker(i, x, y) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    this.closeColorPicker();
    const picker = createEl("div");
    picker.className = "block-editor-col-picker";
    picker.style.left = x + "px";
    picker.style.top = y + "px";
    const title = createEl("div");
    title.className = "block-editor-col-picker-title";
    title.textContent = "\u7B2C " + (i + 1) + " \u680F\u80CC\u666F\u8272";
    picker.appendChild(title);
    const swatches = createEl("div");
    swatches.className = "block-editor-col-picker-swatches";
    for (const c of _ColumnsWidget.BG_PALETTE) {
      const sw = createEl("button");
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
    const customRow = createEl("div");
    customRow.className = "block-editor-col-picker-custom";
    const colorInput = createEl("input");
    colorInput.type = "color";
    colorInput.className = "block-editor-col-picker-native";
    colorInput.value = (_b = (_a = this.bgs[i]) == null ? void 0 : _a.light) != null ? _b : "#f1f3f5";
    colorInput.title = "\u81EA\u5B9A\u4E49\u989C\u8272";
    colorInput.addEventListener("input", () => {
      input.value = colorInput.value;
      input.classList.remove("is-invalid");
    });
    colorInput.addEventListener("change", () => {
      this.closeColorPicker();
      this.applyBg(i, colorInput.value);
    });
    const hexRow = createEl("div");
    hexRow.className = "block-editor-col-picker-hex";
    const input = createEl("input");
    input.type = "text";
    input.placeholder = "#RRGGBB";
    input.value = (_d = (_c = this.bgs[i]) == null ? void 0 : _c.light) != null ? _d : "";
    input.spellcheck = false;
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") applyHex();
    });
    const applyBtn = createEl("button");
    applyBtn.className = "block-editor-col-picker-apply";
    applyBtn.textContent = "\u5E94\u7528";
    const applyHex = () => {
      const v = input.value.trim();
      if (!HEX_COLOR_RE.test(v)) {
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
    const darkSection = createEl("div");
    darkSection.className = "block-editor-col-picker-dark";
    const darkToggle = createEl("button");
    darkToggle.className = "block-editor-col-picker-dark-toggle";
    darkToggle.textContent = "\u8986\u76D6\u6DF1\u8272\u4E3B\u9898\u989C\u8272";
    darkToggle.addEventListener("click", () => {
      darkBody.hidden = !darkBody.hidden;
      darkToggle.textContent = darkBody.hidden ? "\u8986\u76D6\u6DF1\u8272\u4E3B\u9898\u989C\u8272" : "\u6536\u8D77\u6DF1\u8272\u8986\u76D6";
    });
    const darkBody = createEl("div");
    darkBody.className = "block-editor-col-picker-dark-body";
    darkBody.hidden = true;
    const darkRow = createEl("div");
    darkRow.className = "block-editor-col-picker-dark-row";
    const darkNative = createEl("input");
    darkNative.type = "color";
    darkNative.className = "block-editor-col-picker-native";
    darkNative.value = (_f = (_e = this.bgs[i]) == null ? void 0 : _e.dark) != null ? _f : "#f1f3f5";
    darkNative.title = "\u6DF1\u8272\u4E3B\u9898\u80CC\u666F\u8272";
    const darkInput = createEl("input");
    darkInput.type = "text";
    darkInput.placeholder = "#RRGGBB";
    darkInput.value = (_h = (_g = this.bgs[i]) == null ? void 0 : _g.dark) != null ? _h : "";
    darkInput.spellcheck = false;
    darkNative.addEventListener("input", () => {
      darkInput.value = darkNative.value;
      darkInput.classList.remove("is-invalid");
    });
    const applyDarkHex = () => {
      const v = darkInput.value.trim();
      if (!HEX_COLOR_RE.test(v)) {
        darkInput.classList.add("is-invalid");
        return;
      }
      this.closeColorPicker();
      this.applyBgDark(i, v);
    };
    const darkApply = createEl("button");
    darkApply.className = "block-editor-col-picker-apply";
    darkApply.textContent = "\u5E94\u7528";
    darkApply.addEventListener("click", applyDarkHex);
    darkInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") applyDarkHex();
    });
    darkNative.addEventListener("change", () => {
      this.closeColorPicker();
      this.applyBgDark(i, darkNative.value);
    });
    const darkReset = createEl("button");
    darkReset.className = "block-editor-col-picker-dark-reset";
    darkReset.textContent = "\u6062\u590D\u81EA\u52A8\u63A8\u5BFC";
    darkReset.addEventListener("click", () => {
      this.closeColorPicker();
      this.applyBgDark(i, null);
    });
    darkRow.appendChild(darkNative);
    darkRow.appendChild(darkInput);
    darkRow.appendChild(darkApply);
    darkBody.appendChild(darkRow);
    darkBody.appendChild(darkReset);
    darkSection.appendChild(darkToggle);
    darkSection.appendChild(darkBody);
    picker.appendChild(darkSection);
    const clearBtn = createEl("button");
    clearBtn.className = "block-editor-col-picker-clear";
    clearBtn.textContent = "\u65E0\u80CC\u666F\u8272\uFF08\u6E05\u9664\uFF09";
    clearBtn.addEventListener("click", () => {
      this.closeColorPicker();
      this.applyBg(i, null);
    });
    picker.appendChild(clearBtn);
    document.body.appendChild(picker);
    this.colorPickerEl = picker;
    window.setTimeout(() => {
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
_ColumnsWidget.ICON_SPLIT = ["M8 3v18", "M16 3v18"];
_ColumnsWidget.ICON_MERGE = ["M8 7l-4 5 4 5", "M16 7l4 5-4 5"];
_ColumnsWidget.ICON_ROW_UP = ["M18 15l-6-6-6 6"];
_ColumnsWidget.ICON_ROW_DOWN = ["M6 9l6 6 6-6"];
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
var widgetByRoot = /* @__PURE__ */ new WeakMap();
function columnsWidgetAtPoint(x, y) {
  var _a;
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const root = el.closest(".block-editor-columns-widget");
  if (!(root instanceof HTMLElement)) return null;
  return (_a = widgetByRoot.get(root)) != null ? _a : null;
}
function editorDomAtPoint(x, y, view) {
  const dom = view == null ? void 0 : view.dom;
  if (!dom) return false;
  const r = dom.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
function buildDecorations(state, regions) {
  var _a, _b;
  const ranges = [];
  const live = state.field(import_obsidian7.editorLivePreviewField);
  const docId = path_of(state) || "untitled";
  const owner = (_b = (_a = state.field(import_obsidian7.editorInfoField)) == null ? void 0 : _a.editor) != null ? _b : null;
  lastDiagnostics.livePreview = live;
  lastDiagnostics.regions = regions.length;
  lastDiagnostics.note = lastDiagnostics.markerLines > 0 && regions.length === 0 ? "\u5B58\u5728\u5206\u680F\u6807\u8BB0\u4F46\u672A\u8BC6\u522B\u51FA\u533A\u95F4" : "";
  lastDiagnostics.segmentsPreview = regions.flatMap(
    (r) => r.segments.map((seg) => seg.slice(0, 30).replace(/\n/g, "\u23CE"))
  );
  colLog("\u6784\u5EFA\u88C5\u9970", { live, markerLines: lastDiagnostics.markerLines, regions: regions.length });
  if (!(sharedCtx == null ? void 0 : sharedCtx.settings.livePreviewWidget) || !live) {
    lastDiagnostics.note = !(sharedCtx == null ? void 0 : sharedCtx.settings.livePreviewWidget) ? "\u5F00\u5173\u5173\u95ED\uFF1A\u672A\u6E32\u67D3 widget" : "\u6E90\u7801\u6A21\u5F0F\uFF1A\u672A\u6E32\u67D3 widget";
    for (const e of widgetCache.values()) e.widget.destroy();
    widgetCache.clear();
    return import_view3.Decoration.none;
  }
  const used = /* @__PURE__ */ new Set();
  const docLen = state.doc.line(state.doc.lines).to;
  for (const r of regions) {
    const clampStart = Math.max(0, Math.min(r.startPos, docLen));
    const clampEnd = Math.max(clampStart, Math.min(r.endPos, docLen));
    if (!Number.isFinite(r.startPos) || !Number.isFinite(r.endPos) || r.startPos < 0 || r.startPos > docLen || r.endPos > docLen || r.startPos > r.endPos || clampEnd <= clampStart) {
      lastDiagnostics.note = `\u8DF3\u8FC7\u8D8A\u754C\u5206\u680F\u533A\u95F4 line=${r.startLine} pos=[${r.startPos},${r.endPos}] doc.length=${docLen}`;
      colLog("\u8DF3\u8FC7\u8D8A\u754C\u533A\u95F4", { startLine: r.startLine, startPos: r.startPos, endPos: r.endPos, docLen });
      continue;
    }
    used.add(r.startPos);
    const key = columnsContentKey(r.segments, r.widths, r.bgs, r.rows, r.opts) + settingsAppearanceKey(sharedCtx.settings);
    let entry = widgetCache.get(r.startPos);
    let widget;
    if (entry && entry.path === docId && entry.owner === owner && entry.key === key) {
      widget = entry.widget;
      widget.region = r;
    } else {
      if (entry) entry.widget.destroy();
      colLog("\u521B\u5EFA\u6E32\u67D3 widget", { startLine: r.startLine, doc: docId });
      widget = new ColumnsWidget(ctx_of(state), r, docId, owner);
      widgetCache.set(r.startPos, { path: docId, owner, key, widget });
    }
    ranges.push(import_view3.Decoration.replace({ block: true, widget }).range(clampStart, clampEnd));
  }
  for (const k of [...widgetCache.keys()]) {
    const e = widgetCache.get(k);
    if (!e || e.path !== docId || e.owner !== owner || !used.has(k)) {
      if (e) e.widget.destroy();
      widgetCache.delete(k);
    }
  }
  return import_view3.Decoration.set(ranges, true);
}
function ctx_of(state) {
  return sharedCtx;
}
function insertsQuote(tr) {
  let hit = false;
  tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    if (inserted.toString().includes(">")) hit = true;
  });
  return hit;
}
var columnsField = import_state2.StateField.define({
  create: () => {
    colLog("\u5206\u680F\u5B57\u6BB5\u521B\u5EFA\uFF08\u7F16\u8F91\u5668\u521D\u59CB\u5316\uFF09");
    return { initialized: false, regions: [], decorations: import_view3.Decoration.none };
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
      if (!value.initialized || forced) return fullRescan(tr);
      if (value.regions.length === 0 && !insertsQuote(tr)) return value;
      colLog("\u6587\u6863\u53D8\u66F4 \u2192 \u5168\u91CF\u91CD\u626B\uFF08\u589E\u91CF\u5F03\u7528\uFF09");
      return fullRescan(tr);
    } catch (e) {
      lastDiagnostics.note = e instanceof Error ? e.message : String(e);
      return value;
    }
  },
  // 关键：把字段中的装饰接到 decorations facet——
  // 没有这一步，装饰只存在于字段值里，视图根本看不到；
  // 且经 compute 提供的值是静态 DecorationSet，块替换才被 CM6 允许。
  // 消费 tip 逃逸防御：compute 回调在 CM6 事务应用期执行，包 try-catch +
  // range 归一化，杜绝非法 range / 字段异常冒泡到 dispatch（lineAt 越界）。
  provide: (f) => import_view3.EditorView.decorations.compute([f], safeDecoCompute((state) => state.field(f).decorations, (msg, e) => colLog(msg, e)))
});
function fullRescan(tr) {
  const stats = { markerLines: 0 };
  const regions = scanRegions(tr.state.doc, stats);
  lastDiagnostics.markerLines = stats.markerLines;
  colLog("\u626B\u63CF\u5B8C\u6210", {
    \u533A\u95F4\u6570: regions.length,
    \u533A\u95F4\u8303\u56F4: regions.map((r) => [r.startLine, r.endLine])
  });
  const decorations = buildDecorations({ doc: tr.state.doc, field: (f) => tr.state.field(f) }, regions);
  return { initialized: true, regions, decorations };
}
var columnsInteractions = import_view3.ViewPlugin.fromClass(
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
var undoViewportGuard = import_view3.ViewPlugin.fromClass(
  class {
    update(update) {
      if (!update.docChanged) return;
      const isUndoRedo = update.transactions.some(
        (tr) => tr.isUserEvent("undo") || tr.isUserEvent("redo")
      );
      if (!isUndoRedo) return;
      const view = update.view;
      const state = view.state.field(columnsField, false);
      if (!state || !state.regions.length) return;
      const sd = view.scrollDOM;
      const top = sd.scrollTop;
      if (top <= 0) return;
      const snap = view.scrollSnapshot();
      const restore = () => {
        if (!view.dom.isConnected) return;
        try {
          view.dispatch({ effects: snap });
        } catch (e) {
        }
      };
      queueMicrotask(restore);
      window.requestAnimationFrame(() => {
        if (Math.abs(sd.scrollTop - top) > 1) restore();
      });
    }
  }
);
function columnsExtension(ctx) {
  sharedCtx = ctx;
  return import_state2.Prec.highest([columnsField, columnsInteractions, undoViewportGuard]);
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

// src/drag.ts
var COL_SHELL_RE = /^\s*>\s*\[!multi-column(?:\|[^\]]*)?\]/;
var EDGE_BAND = 36;
var EDGE_BAND_MIN = 12;
var NEST_OFFSET = 24;
var NEST_INDENT = 4;
var EDGE_BAND_NESTABLE = NEST_OFFSET - 4;
var NESTABLE_TYPES = ["list", "quote", "callout"];
var LISTIFY_TYPES = ["line", "heading"];
function isNestTarget(type) {
  return NESTABLE_TYPES.includes(type) || LISTIFY_TYPES.includes(type);
}
var DragController = class {
  constructor(ctx) {
    this.ctx = ctx;
    this.state = null;
    this.ghostEl = null;
    this.indicatorEl = null;
    this.edgeLineEl = null;
    this.edgeBoxEl = null;
    /** 需求 A：分栏内「新栏插在这里」的位置竖条 */
    this.colSlotEl = null;
  }
  init() {
    const indicator = createEl("div");
    indicator.className = "block-editor-indicator block-editor-insert-line";
    this.indicatorEl = indicator;
    const edgeLine = createEl("div");
    edgeLine.className = "block-editor-edge-line";
    this.edgeLineEl = edgeLine;
    const edgeBox = createEl("div");
    edgeBox.className = "block-editor-edge-box";
    this.edgeBoxEl = edgeBox;
    const colSlot = createEl("div");
    colSlot.className = "block-editor-col-slot";
    this.colSlotEl = colSlot;
  }
  /**
   * 落点视觉的显隐（唯一入口）。
   *
   * 为什么不用 setCssStyles 写内联 display：内联样式优先级高于样式表，
   * 一旦写进去，styles.css 里的显隐规则就再也观察不到效果 —— 两条线
   * （drag.ts 的可复用插入线 / columns-preview 的一次性落点线）虽然共用
   * 外观基类，但显隐必须各自独立、且都在 CSS 里可见。统一走 .is-visible
   * 状态类后，「谁在显示」这件事只有一处真相：grep 这个类名即可。
   */
  setVisual(el, visible) {
    el == null ? void 0 : el.classList.toggle("is-visible", visible);
  }
  /** 隐藏全部落点视觉（插入线 / 贴边线 / 描边盒 / 新栏竖条） */
  hideAllVisuals() {
    this.setVisual(this.indicatorEl, false);
    this.setVisual(this.edgeLineEl, false);
    this.setVisual(this.edgeBoxEl, false);
    this.setVisual(this.colSlotEl, false);
  }
  destroy() {
    var _a, _b, _c, _d;
    this.stopAutoScroll();
    this.removeGhost();
    (_a = this.indicatorEl) == null ? void 0 : _a.remove();
    this.indicatorEl = null;
    (_b = this.edgeLineEl) == null ? void 0 : _b.remove();
    this.edgeLineEl = null;
    (_c = this.edgeBoxEl) == null ? void 0 : _c.remove();
    this.edgeBoxEl = null;
    (_d = this.colSlotEl) == null ? void 0 : _d.remove();
    this.colSlotEl = null;
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
      edgeSide: null,
      edgeTargetStart: null,
      listifyTargetLine: null,
      colHit: null,
      colWidget: null,
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
    this.hideAllVisuals();
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
    if (ds.colHit && ds.colWidget) {
      if (this.commitColumnDrop(ds, ds.colWidget, ds.colHit, e.altKey)) {
        this.ctx.handle.hideHandle();
        return;
      }
    }
    if (ds.edgeSide !== null && ds.edgeTargetStart !== null && ds.targetEditor === null) {
      const t = this.ctx.detector.getBlockAtLine(ds.editor, ds.edgeTargetStart);
      if (t && this.ctx.converter.wrapToEdgeColumns(ds.editor, ds.ranges, t, ds.edgeSide)) {
        this.ctx.handle.hideHandle();
        return;
      }
    }
    if (ds.listifyTargetLine != null && ds.nestCol != null && ds.targetEditor === null) {
      this.ctx.ops.nestUnderPlainBlock(
        ds.editor,
        ds.ranges,
        ds.listifyTargetLine,
        ds.nestCol,
        e.altKey
      );
      this.ctx.handle.hideHandle();
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
  /**
   * 需求 A 落地：把被拖块作为一栏插入目标分栏的 hit.insertIndex 位置。
   *
   * 单步撤销的实现要点：这里是「区间重写（分栏插入新栏）」+「区间外删除（源块）」
   * 两处编辑，必须合并进**同一个 Transaction**。若先写回分栏、再单独删除源块，
   * 会产生两步撤销，Ctrl+Z 一次只能撤一半。
   * CM6 的 state.update({changes: [...]}) 接受多段编辑并作为整体回滚，
   * 已用 temp/verify-single-trx.mjs 验证 invert() 能干净还原。
   *
   * 源块可能位于分栏区间之前或之后，两处编辑互不重叠，CM6 可安全合并。
   *
   * @param copy Alt = 复制到新栏，源块保留
   * @returns 是否已提交（false 表示落点已失效，调用方应回退普通移动）
   */
  commitColumnDrop(ds, widget, hit, copy) {
    const cm = getCM(ds.editor);
    if (!cm) return false;
    const lines = collectDraggedLines(ds.editor, ds.ranges);
    const text = stripQuotePrefixes(lines);
    if (!text.trim()) return false;
    const range = widget.getLineRange();
    const doc = cm.state.doc;
    if (range.start < 0 || range.end >= doc.lines) return false;
    if (!widget.insertColumnAt(hit.insertIndex, text)) return false;
    const changes = buildCombinedChanges(
      widget.getRegionStartPos(),
      widget.getRegionEndPos(),
      widget.buildRegionText(),
      null
    );
    if (!copy) {
      const sorted = [...ds.ranges].sort((a, b) => a.start - b.start);
      for (const r of sorted) {
        const from = doc.line(r.start + 1).from;
        const to = r.end < doc.lines - 1 ? doc.line(r.end + 2).from : doc.line(r.end + 1).to;
        changes.push({ from, to, insert: "" });
      }
    }
    keepViewport(cm, () => {
      cm.dispatch({ changes });
    });
    return true;
  }
  onDragMove(e) {
    const ds = this.state;
    if (!ds) return;
    ds.lastX = e.clientX;
    ds.lastY = e.clientY;
    if (!ds.moved) {
      const dist = Math.hypot(e.clientX - ds.startX, e.clientY - ds.startY);
      ds.moved = dist > (this.ctx.settings.dragThreshold || 4) || this.isOutsideSourceEditor(ds, e.clientX, e.clientY);
      if (ds.moved) this.ghostEl = this.createGhost(ds);
    }
    if (!ds.moved) return;
    this.moveGhost(e);
    this.updateDropTarget(ds, e.clientX, e.clientY);
    this.applyActionHint(ds, e.altKey);
    this.updateAutoScroll(ds);
  }
  // 把「松手会执行什么」写到 ghost 的 data-action，由 styles.css 渲染成跟随光标的动作标签
  applyActionHint(ds, altKey) {
    const el = this.ghostEl;
    if (!el) return;
    const action = this.resolveAction(ds, altKey);
    if (action) el.dataset.action = action;
    else delete el.dataset.action;
  }
  // 当前落点对应的动作状态；无有效落点（拖回自身 / 无效区域）返回 null，此时不显示标签
  resolveAction(ds, altKey) {
    if (ds.colHit) return altKey ? "col-new-copy" : "col-new";
    if (ds.edgeSide === -1) return "column-left";
    if (ds.edgeSide === 1) return "column-right";
    if (ds.targetLine == null) return null;
    if (ds.targetEditor !== null) return altKey ? "copy-cross" : "move-cross";
    if (altKey) return "copy";
    if (ds.nestCol != null || ds.quotePrefix != null) return "nest";
    return "move";
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
    var _a, _b, _c;
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
    if (!cross) {
      const colWidget = columnsWidgetAtPoint(x, y);
      if (colWidget) {
        if (this.tryColumnDropTarget(ds, colWidget, x, y)) return;
        this.clearDropTarget(ds);
        return;
      }
    }
    if (ds.colHit !== null) {
      ds.colHit = null;
      ds.colWidget = null;
    }
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
    let listifyTargetLine = null;
    const overSelf = !cross && ds.ranges.some((r) => lineIndex >= r.start && lineIndex <= r.end);
    const target = overSelf ? null : this.ctx.detector.getBlockAtLine(editor, lineIndex);
    const indentStep = this.ctx.settings.indentStep > 0 ? this.ctx.settings.indentStep : NEST_INDENT;
    let dragTextLeft = null;
    if (!cross) {
      const firstRange = [...ds.ranges].sort((a, b) => a.start - b.start)[0];
      const firstCoords = cm.coordsAtPos(doc.line(firstRange.start + 1).from);
      dragTextLeft = firstCoords ? firstCoords.left : null;
    }
    if (target && !cross && this.canEdgeColumnSource(ds, target)) {
      const box = this.blockBox(cm, target);
      if (box && y >= box.top - 1 && y <= box.bottom + 1) {
        const width2 = Math.max(box.right - box.left, 1);
        const band = Math.max(EDGE_BAND_MIN, Math.min(EDGE_BAND, width2 * 0.22));
        const edgeBand = isNestTarget(target.type) ? Math.min(band, EDGE_BAND_NESTABLE) : band;
        const dl = x - box.left;
        const dr = box.right - x;
        const side = dl >= -2 && dl <= edgeBand && dl <= dr ? -1 : dr >= -2 && dr <= edgeBand && dr < dl ? 1 : null;
        if (side !== null) {
          ds.edgeSide = side;
          ds.edgeTargetStart = target.start;
          ds.targetLine = insertAt;
          ds.nestCol = null;
          ds.quotePrefix = null;
          ds.targetEditor = null;
          this.showEdgeLine(side, box, cm);
          return;
        }
      }
    }
    if (ds.edgeSide !== null) {
      ds.edgeSide = null;
      ds.edgeTargetStart = null;
      this.setVisual(this.edgeLineEl, false);
      this.setVisual(this.edgeBoxEl, false);
    }
    if (target && isNestTarget(target.type)) {
      const targetText = editor.getLine(target.start);
      const targetLeft = (_c = (_b = cm.coordsAtPos(doc.line(target.start + 1).from)) == null ? void 0 : _b.left) != null ? _c : lineCoords.left;
      const nestGate = Math.max(dragTextLeft != null ? dragTextLeft : targetLeft, targetLeft) + NEST_OFFSET;
      if (!COL_SHELL_RE.test(targetText) && x > nestGate) {
        const marker = targetText.match(/^(\s*)([-*+]|\d+[.)])\s+/);
        if (marker) {
          nestCol = marker[1].length + indentStep;
          insertAt = target.end + 1;
        } else if (target.type === "quote" || target.type === "callout") {
          const qm = targetText.match(/^(\s*)((?:>\s*)+)/);
          if (qm) {
            quotePrefix = qm[1] + qm[2];
            insertAt = target.end + 1;
          }
        } else {
          nestCol = getIndent(targetText).length + indentStep;
          listifyTargetLine = target.start;
          insertAt = target.start + 1;
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
    ds.listifyTargetLine = listifyTargetLine;
    ds.targetEditor = cross ? editor : null;
    const editorDom = cm.dom;
    const editorRect = editorDom.getBoundingClientRect();
    const contentRect = cm.contentDOM.getBoundingClientRect();
    const left = contentRect.left - editorRect.left;
    const width = Math.max(contentRect.width, 40);
    const yPos = insertAt > lineIndex ? lineCoords.bottom : lineCoords.top;
    if (this.indicatorEl) {
      if (this.indicatorEl.parentElement !== editorDom) editorDom.appendChild(this.indicatorEl);
      this.setVisual(this.indicatorEl, true);
      this.indicatorEl.style.top = yPos - editorRect.top + "px";
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
    this.hideAllVisuals();
    ds.targetLine = null;
    ds.nestCol = null;
    ds.quotePrefix = null;
    ds.targetEditor = null;
    ds.edgeSide = null;
    ds.edgeTargetStart = null;
    ds.listifyTargetLine = null;
    ds.colHit = null;
    ds.colWidget = null;
  }
  /**
   * 需求 A：指针命中分栏 widget 时的落点判定 + 视觉。
   *
   * 资格校验（任一不满足即返回 false，不给落点）：
   *  - 拖源不得是分栏外壳行、不得位于分栏内部（否则等于把分栏塞进自己的栏里）
   *  - 拖源区间不得与目标分栏区间重叠（防自拖）
   *  - 被拖内容剥掉引用前缀后不能为空（空栏无意义）
   *
   * @returns true 表示已命中分栏落点（调用方应 return，不再走后续行号逻辑）
   */
  tryColumnDropTarget(ds, widget, x, y) {
    const lines = collectDraggedLines(ds.editor, ds.ranges);
    const text = stripQuotePrefixes(lines);
    if (!text.trim()) return false;
    const range = widget.getLineRange();
    for (const r of ds.ranges) {
      if (COL_SHELL_RE.test(ds.editor.getLine(r.start))) return false;
      if (this.ctx.converter.insideColumns(ds.editor, r)) return false;
      if (r.start <= range.end && range.start <= r.end) return false;
    }
    const hit = hitColumnsLayout(widget.getLayoutInfo(), x, y);
    if (!hit) return false;
    ds.colHit = hit;
    ds.colWidget = widget;
    ds.targetLine = null;
    ds.nestCol = null;
    ds.quotePrefix = null;
    ds.targetEditor = null;
    ds.edgeSide = null;
    ds.edgeTargetStart = null;
    ds.listifyTargetLine = null;
    this.showColumnSlot(hit, widget);
    return true;
  }
  /**
   * 需求 A 的落点视觉：
   *  - kind='gap'  → 在两栏之间画一条竖线（复用 edgeLine，明确"插在缝里"）
   *  - kind='before'/'after' → 给参照栏描边（复用 edgeBox，与贴边分栏同一视觉语言）
   * 另加一个 colSlot 条：命中时在被插位置显示一条 accent 竖条，让"插在哪"一眼可见。
   */
  showColumnSlot(hit, widget) {
    var _a;
    this.setVisual(this.indicatorEl, false);
    const ds = this.state;
    if (!ds || !hit.box) return;
    const editorDom = (_a = getCM(ds.editor)) == null ? void 0 : _a.dom;
    if (!editorDom) return;
    const editorRect = editorDom.getBoundingClientRect();
    const top = hit.box.top - editorRect.top;
    const height = `${Math.max(2, hit.box.bottom - hit.box.top)}px`;
    if (hit.kind === "gap" && this.edgeLineEl) {
      if (this.edgeLineEl.parentElement !== editorDom) editorDom.appendChild(this.edgeLineEl);
      this.setVisual(this.edgeLineEl, true);
      this.edgeLineEl.style.left = `${hit.box.left - editorRect.left}px`;
      this.edgeLineEl.style.top = `${top}px`;
      this.edgeLineEl.style.height = height;
      this.setVisual(this.edgeBoxEl, false);
    } else if (this.edgeBoxEl) {
      if (this.edgeBoxEl.parentElement !== editorDom) editorDom.appendChild(this.edgeBoxEl);
      this.setVisual(this.edgeBoxEl, true);
      this.edgeBoxEl.style.left = `${hit.box.left - editorRect.left}px`;
      this.edgeBoxEl.style.top = `${top}px`;
      this.edgeBoxEl.style.width = `${Math.max(hit.box.right - hit.box.left, 8)}px`;
      this.edgeBoxEl.style.height = height;
      this.setVisual(this.edgeLineEl, false);
    }
    if (this.colSlotEl) {
      const slotX = (hit.kind === "before" ? hit.box.left : hit.box.right) - editorRect.left;
      if (this.colSlotEl.parentElement !== editorDom) editorDom.appendChild(this.colSlotEl);
      this.setVisual(this.colSlotEl, true);
      this.colSlotEl.style.left = `${slotX - 1}px`;
      this.colSlotEl.style.top = `${top}px`;
      this.colSlotEl.style.height = height;
    }
  }
  /** 贴边分栏目标判定：目标不能为空行、不能是分栏外壳，也不能在分栏内部（避免截断结构） */
  isEdgeColumnTarget(editor, target) {
    if (target.type === "empty") return false;
    if (COL_SHELL_RE.test(editor.getLine(target.start))) return false;
    return !this.ctx.converter.insideColumns(editor, target);
  }
  /** 贴边分栏资格（目标 + 拖动源双向校验，任一不干净即回退普通移动）：
   *  拖动源不得是分栏外壳 / 位于分栏内部（否则会把整个分栏塞进新栏形成嵌套分栏），
   *  且不得与目标区间重叠（合成时按 min/max 取范围会吞掉中间内容）。 */
  canEdgeColumnSource(ds, target) {
    if (!this.isEdgeColumnTarget(ds.editor, target)) return false;
    for (const r of ds.ranges) {
      if (r.start <= target.end && target.start <= r.end) return false;
      if (COL_SHELL_RE.test(ds.editor.getLine(r.start))) return false;
      if (this.ctx.converter.insideColumns(ds.editor, r)) return false;
    }
    return true;
  }
  /** 目标块的可视盒：与 handle.showHighlight 同一锚点（左 = 首行文本起点，右 = 内容区右缘，
   *  上 = 首行顶，下 = 末行底）。贴边热区与目标描边都基于它，保证
   *  「用户看到的悬停高亮块」 == 「贴边分栏的落区」，消除位置口径不一致带来的混淆。 */
  blockBox(cm, block) {
    const doc = cm.state.doc;
    if (block.start < 0 || block.end >= doc.lines) return null;
    const topC = cm.coordsAtPos(doc.line(block.start + 1).from);
    const botC = cm.coordsAtPos(doc.line(block.end + 1).to);
    if (!topC || !botC) return null;
    const contentRect = cm.contentDOM.getBoundingClientRect();
    return {
      top: Math.max(topC.top, contentRect.top),
      bottom: Math.min(botC.bottom, contentRect.bottom),
      left: topC.left,
      right: contentRect.right
    };
  }
  /** 绘制贴边分栏视觉：目标块整体描边 + 侧边竖线（side=-1 贴左，1 贴右） */
  showEdgeLine(side, box, cm) {
    this.setVisual(this.indicatorEl, false);
    const editorDom = cm.dom;
    const editorRect = editorDom.getBoundingClientRect();
    const top = box.top - editorRect.top;
    const bottom = box.bottom - editorRect.top;
    const left = box.left - editorRect.left;
    const right = box.right - editorRect.left;
    const h = Math.max(2, bottom - top);
    if (this.edgeLineEl) {
      if (this.edgeLineEl.parentElement !== editorDom) editorDom.appendChild(this.edgeLineEl);
      const x = side === -1 ? left : right;
      this.setVisual(this.edgeLineEl, true);
      this.edgeLineEl.style.left = x + "px";
      this.edgeLineEl.style.top = top + "px";
      this.edgeLineEl.style.height = h + "px";
    }
    if (this.edgeBoxEl) {
      if (this.edgeBoxEl.parentElement !== editorDom) editorDom.appendChild(this.edgeBoxEl);
      this.setVisual(this.edgeBoxEl, true);
      this.edgeBoxEl.style.left = left + "px";
      this.edgeBoxEl.style.top = top + "px";
      this.edgeBoxEl.style.width = Math.max(right - left, 8) + "px";
      this.edgeBoxEl.style.height = h + "px";
    }
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
    const el = createEl("div");
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
var import_obsidian8 = require("obsidian");

// src/insert-actions.ts
var WEEKDAYS = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
var pad = (n) => String(n).padStart(2, "0");
function formatDateTime(now, format) {
  const y = now.getFullYear();
  const table = {
    YYYY: String(y),
    YY: pad(y % 100),
    MM: pad(now.getMonth() + 1),
    DD: pad(now.getDate()),
    HH: pad(now.getHours()),
    mm: pad(now.getMinutes()),
    ss: pad(now.getSeconds()),
    ddd: WEEKDAYS[now.getDay()],
    dddd: "\u661F\u671F" + WEEKDAYS[now.getDay()].slice(1)
  };
  return format.replace(/YYYY|YY|MM|DD|HH|mm|ss|dddd|ddd/g, (m) => {
    var _a;
    return (_a = table[m]) != null ? _a : m;
  });
}
var clamp = (n, max) => Math.max(0, Math.min(n, max));
var atEnd = (text) => ({ text, caret: text.length });
function resolveSnippet(spec, ctx) {
  if (spec.kind === "snippet") {
    return { text: spec.text, caret: clamp(spec.caret, spec.text.length) };
  }
  if (spec.kind === "dynamic") {
    if (spec.dyn === "date") return atEnd(formatDateTime(ctx.now, ctx.dateFormat));
    if (spec.dyn === "time") return atEnd(formatDateTime(ctx.now, ctx.timeFormat));
    return atEnd(
      formatDateTime(ctx.now, ctx.dateFormat) + " " + formatDateTime(ctx.now, ctx.timeFormat)
    );
  }
  return null;
}
var INSERT_TOGGLE_KEY = {
  date: "insDate",
  time: "insTime",
  datetime: "insDateTime",
  math: "insMath",
  inlinecode: "insInlineCode",
  highlight: "insHighlight",
  note: "insNote",
  embednote: "insEmbedNote",
  blockref: "insBlockRef",
  blockembed: "insBlockEmbed"
};
function enabledInsertIds(ids, settings) {
  if (!settings) return [...ids];
  return ids.filter((id) => {
    const key = INSERT_TOGGLE_KEY[id];
    if (!key) return true;
    return settings[key] !== false;
  });
}

// src/slash-trigger.ts
var PATH_PREV = /[:/\\]/;
var BLOCK_PREFIX = /^(\s|(?:[-*+>]|\d+[.)])\s*)*/;
function countOf(text, ch) {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === ch) n++;
  return n;
}
function isBlockedContext(before) {
  if (before.lastIndexOf("[[") > before.lastIndexOf("]]")) return true;
  const lp = before.lastIndexOf("](");
  if (lp !== -1 && before.indexOf(")", lp) === -1) return true;
  if (countOf(before, "`") % 2 === 1) return true;
  if (countOf(before, "$") % 2 === 1) return true;
  return false;
}
function slashTrigger(before) {
  const i = before.lastIndexOf("/");
  if (i === -1) return null;
  const query = before.slice(i + 1);
  if (/[\s/]/.test(query)) return null;
  const head = before.slice(0, i).replace(BLOCK_PREFIX, "");
  const inline = head !== "";
  if (inline && PATH_PREV.test(before.charAt(i - 1))) return null;
  if (isBlockedContext(before)) return null;
  return { ch: i, query, inline };
}
function filterSlashItems(items, inline) {
  return inline ? items.filter((i) => i.kind === "insert") : items;
}

// src/slash-suggest.ts
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
var TITLE_OF = new Map(INSERT_ACTIONS.map(([id, title]) => [id, title]));
function buildSlashItems(query, inline = false, settings = null) {
  const enabled = new Set(enabledInsertIds(INSERT_ACTIONS.map(([id]) => id), settings));
  const items = [
    ...TURN_INTO.map(([id, title]) => ({ kind: "turn", id, title })),
    ...INSERT_ACTIONS.filter(([id]) => enabled.has(id)).map(
      ([id, title]) => ({ kind: "insert", id, title })
    )
  ];
  const pool = filterSlashItems(items, inline);
  const q = query.toLowerCase();
  if (!q) return pool;
  return pool.map((item) => ({
    item,
    score: Math.max(fuzzyScore(item.id.toLowerCase(), q), fuzzyScore(item.title, q))
  })).filter((s) => s.score >= 0).sort((a, b) => b.score - a.score).map((s) => s.item);
}
var BlockInserter = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  run(id, editor, pos) {
    var _a;
    const spec = INSERT_SPECS[id];
    if (!spec) return;
    const title = (_a = TITLE_OF.get(id)) != null ? _a : "\u5185\u5BB9";
    switch (spec.kind) {
      case "pick":
        pickFile(this.ctx.app, spec.exts, "\u9009\u62E9" + title, (file) => {
          this.insertAt(editor, pos, `![[${file.path}]]`);
        });
        return;
      case "snippet":
      case "dynamic": {
        const r = resolveSnippet(spec, {
          now: /* @__PURE__ */ new Date(),
          dateFormat: this.ctx.settings.dateFormat || DEFAULT_DATE_FORMAT,
          timeFormat: this.ctx.settings.timeFormat || DEFAULT_TIME_FORMAT
        });
        if (r) this.insertAt(editor, pos, r.text, r.caret);
        return;
      }
      case "note":
        pickNote(this.ctx.app, (file) => {
          this.insertAt(editor, pos, this.linkTo(file, "", spec.embed));
        });
        return;
      case "blockref":
        pickNoteWithBlocks(this.ctx.app, (file) => {
          pickBlock(this.ctx.app, file, (blockId) => {
            this.insertAt(editor, pos, this.linkTo(file, "#^" + blockId, spec.embed));
          });
        });
        return;
      default:
        return;
    }
  }
  /** 生成笔记链接：交给 Obsidian 生成，自动跟随「使用 Wikilinks」设置与相对路径 */
  linkTo(file, subpath, embed) {
    var _a, _b;
    const source = (_b = (_a = this.ctx.app.workspace.getActiveFile()) == null ? void 0 : _a.path) != null ? _b : "";
    const link = this.ctx.app.fileManager.generateMarkdownLink(file, source, subpath || void 0);
    return embed ? "!" + link : link;
  }
  /**
   * 在 pos 处插入文本并落光标。
   * @param caret 光标相对插入起点的偏移；省略或越界时落在插入文本末尾
   */
  insertAt(editor, pos, text, caret) {
    const line = Math.min(pos.line, editor.lineCount() - 1);
    const ch = Math.min(pos.ch, editor.getLine(line).length);
    editor.replaceRange(text, { line, ch });
    const offset = caret === void 0 ? text.length : Math.max(0, Math.min(caret, text.length));
    editor.setCursor({ line, ch: ch + offset });
    editor.focus();
  }
};
var _SlashSuggest = class _SlashSuggest extends import_obsidian8.EditorSuggest {
  constructor(ctx) {
    super(ctx.app);
    this.ctx = ctx;
  }
  /**
   * 从建议上下文**实时**判定是否行内触发，不用实例字段记录。
   * 理由：实例字段依赖 onTrigger 一定早于 getSuggestions 执行，一旦 Obsidian 复用
   * 上一次会话或回调顺序变化，就会读到上一轮的脏值（表现为「行内却给出了全部条目」）。
   * 这里拿 end.ch 之前的文本重跑一次 slashTrigger，结果与触发时刻必然一致。
   */
  isInlineContext(sugg) {
    var _a, _b;
    try {
      const before = sugg.editor.getLine(sugg.start.line).slice(0, sugg.end.ch);
      return (_b = (_a = slashTrigger(before)) == null ? void 0 : _a.inline) != null ? _b : false;
    } catch (e) {
      return false;
    }
  }
  onTrigger(cursor, editor) {
    if (!this.ctx.settings.slashCommands) return null;
    const before = editor.getLine(cursor.line).slice(0, cursor.ch);
    const t = slashTrigger(before);
    if (!t) return null;
    if (t.inline && !this.ctx.settings.slashInlineCommands) return null;
    const fmEnd = this.ctx.detector.getFrontmatterEnd(editor);
    if (fmEnd !== -1 && cursor.line <= fmEnd) return null;
    if (this.ctx.detector.findContainerAt(editor, cursor.line)) return null;
    return {
      start: { line: cursor.line, ch: t.ch },
      end: cursor,
      query: t.query
    };
  }
  getSuggestions(context) {
    const inline = this.isInlineContext(context);
    const items = buildSlashItems(
      context.query,
      inline,
      this.ctx.settings
    );
    if (!_SlashSuggest.logged) {
      _SlashSuggest.logged = true;
      let before = "(\u8BFB\u53D6\u5931\u8D25)";
      try {
        const line = context.editor.getLine(context.start.line);
        before = line.slice(Math.max(0, context.end.ch - 24), context.end.ch);
      } catch (e) {
      }
      console.log("[block-editor] slash:", {
        before,
        query: context.query,
        inline,
        count: items.length,
        kinds: [...new Set(items.map((i) => i.kind))]
      });
    }
    return items;
  }
  renderSuggestion(item, el) {
    const container = el.parentElement;
    if (container && !container.classList.contains("block-editor-slash-grid")) {
      container.classList.add("block-editor-slash-grid");
    }
    el.classList.add("block-editor-slash-item");
    el.setText(item.title);
  }
  selectSuggestion(item) {
    const sugg = this.context;
    if (!sugg) return;
    const editor = sugg.editor;
    editor.replaceRange("", sugg.start, sugg.end);
    if (item.kind === "insert") {
      this.ctx.inserter.run(item.id, editor, sugg.start);
      return;
    }
    if (this.isInlineContext(sugg)) return;
    const lineIndex = sugg.start.line;
    const detected = this.ctx.detector.getBlockAtLine(editor, lineIndex);
    const block = detected ? { editor, file: null, start: detected.start, end: detected.end, type: detected.type } : { editor, file: null, start: lineIndex, end: lineIndex, type: "empty" };
    this.ctx.converter.convertBlock(editor, block, item.id);
  }
};
/** 一次性诊断开关：只打第一条，避免每次输入都刷屏 */
_SlashSuggest.logged = false;
var SlashSuggest = _SlashSuggest;

// src/commands.ts
var import_obsidian9 = require("obsidian");
var ColumnsDiagModal = class extends import_obsidian9.Modal {
  constructor(app, json) {
    super(app);
    this.json = json;
    this.titleEl.setText("\u5206\u680F\u8BCA\u65AD");
  }
  onOpen() {
    const pre = this.contentEl.createEl("pre", { text: this.json });
    pre.classList.add("block-editor-diag-pre");
  }
  onClose() {
    this.contentEl.empty();
  }
};
function registerCommands(plugin) {
  plugin.addCommand({
    id: "move-block-up",
    name: "\u4E0A\u79FB\u5F53\u524D\u5757",
    editorCallback: (editor) => plugin.ops.moveCurrentBlock(editor, -1)
  });
  plugin.addCommand({
    id: "move-block-down",
    name: "\u4E0B\u79FB\u5F53\u524D\u5757",
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
    name: "\u751F\u6210\u5757 ID",
    editorCallback: (editor) => plugin.ids.copyCurrentBlockLink(editor)
  });
  plugin.addCommand({
    id: "reference-block",
    name: "\u5F15\u7528\u5176\u4ED6\u5757\u2026",
    editorCallback: (editor) => {
      const cursor = editor.getCursor();
      const block = plugin.detector.getBlockAtLine(editor, cursor.line);
      if (!block) {
        new import_obsidian9.Notice("\u8FD9\u4E00\u884C\u6CA1\u6709\u53EF\u64CD\u4F5C\u7684\u5757");
        return;
      }
      plugin.ids.referenceOtherBlock({
        editor,
        file: plugin.app.workspace.getActiveFile(),
        start: block.start,
        end: block.end,
        type: block.type
      });
    }
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
      const mdView = plugin.app.workspace.getActiveViewOfType(import_obsidian9.MarkdownView);
      if (!mdView) {
        new import_obsidian9.Notice("\u5F53\u524D\u6CA1\u6709\u6D3B\u52A8\u7684\u7B14\u8BB0\u89C6\u56FE");
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
      new ColumnsDiagModal(plugin.app, json).open();
      navigator.clipboard.writeText(json).then(() => new import_obsidian9.Notice("\u8BCA\u65AD\u4FE1\u606F\u5DF2\u540C\u65F6\u590D\u5236\u5230\u526A\u8D34\u677F")).catch(() => new import_obsidian9.Notice("\u590D\u5236\u8BCA\u65AD\u4FE1\u606F\u5931\u8D25"));
    }
  });
  for (const [id, title] of TURN_INTO) {
    plugin.addCommand({
      id: "turn-into-" + id,
      name: "\u8F6C\u6362\u4E3A\uFF1A" + title,
      editorCallback: (editor) => plugin.converter.convertCurrentBlock(editor, id)
    });
  }
  const currentBlockOf = (editor) => {
    const cursor = editor.getCursor();
    const block = plugin.detector.getBlockAtLine(editor, cursor.line);
    if (!block) {
      new import_obsidian9.Notice("\u8FD9\u4E00\u884C\u6CA1\u6709\u53EF\u64CD\u4F5C\u7684\u5757");
      return null;
    }
    return {
      editor,
      file: plugin.app.workspace.getActiveFile(),
      start: block.start,
      end: block.end,
      type: block.type
    };
  };
  plugin.addCommand({
    id: "set-block-color",
    name: "\u8BBE\u7F6E\u5757\u989C\u8272",
    editorCallback: (editor) => {
      var _a, _b;
      const b = currentBlockOf(editor);
      if (!b) return;
      const cm = getCM(editor);
      const rect = cm == null ? void 0 : cm.dom.getBoundingClientRect();
      openBlockColorPicker({
        x: ((_a = rect == null ? void 0 : rect.left) != null ? _a : 0) + 320,
        y: ((_b = rect == null ? void 0 : rect.top) != null ? _b : 0) + 160,
        current: plugin.converter.blockColorOf(b),
        onPick: (color) => {
          if (color === null) plugin.converter.clearBlockColor(b);
          else if (color !== plugin.converter.blockColorOf(b)) plugin.converter.setBlockColor(b, color);
        }
      });
    }
  });
  plugin.addCommand({
    id: "clear-block-color",
    name: "\u6E05\u9664\u5757\u989C\u8272",
    editorCallback: (editor) => {
      const b = currentBlockOf(editor);
      if (!b) return;
      plugin.converter.clearBlockColor(b);
    }
  });
}

// src/link-open.ts
var original = null;
var targetProto = null;
function installLinkOpenBridge(app, getMode) {
  if (original) return;
  const proto = Object.getPrototypeOf(app.workspace);
  if (!proto) return;
  const fn = proto.openLinkText;
  if (typeof fn !== "function") return;
  const patched = function(linktext, sourcePath, newLeaf, openViewState) {
    const mode = getMode();
    const unspecified = newLeaf == null || newLeaf === false;
    const internal = !/^(?:https?|mailto|tel):/i.test(linktext);
    const next = unspecified && internal && mode !== "current" ? mode : newLeaf;
    return fn.call(this, linktext, sourcePath, next, openViewState);
  };
  proto.openLinkText = patched;
  original = fn;
  targetProto = proto;
}
function uninstallLinkOpenBridge() {
  if (targetProto && original) targetProto.openLinkText = original;
  original = null;
  targetProto = null;
}

// src/settings.ts
var import_obsidian10 = require("obsidian");

// src/donate.ts
var DONATE_CODES = [
  { label: "\u5FAE\u4FE1", alt: "\u5FAE\u4FE1\u6536\u6B3E\u7801", src: "data:image/png;base64,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Uk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAMAUExURQAAAP////7+/gXBYD0rLC8jJNTMzWhcXlxUVnxkbIRsdHRkbPzc7HpsdPns9DAjLIBzfB8UHAwEDBQMFLSstLy0vNzU3Pz0/FBMVAQEDAwMFCQkLFRUXFxcZGxsdHR0fKystLS0vNTU3MzM1PT0/Ozs9Nzc5OTk5SssNIyPlJqfpHqAhAQMDAwUFBQcHCAsLCw0NGx0dPT8/BolJMr89Nr89er8+Lz87MT87Mz87Nju5gS0bAu8dCCsdEycfAS8bAnGdAmsZAy0bBq6c9D05ATEbAS0ZAy8bBS0bBrGdyi3di/QhTykdF/boqP608D74ATMbAS8ZAjUdAzEbAy0ZBirZimpazOudDy+gFDIj06zg4Xvu2q/lgTEZAS0XAeqVwy8ZA7NbCS2bDycbILSqqbnxsz85Nj86gTVaATMZAS8XAzEZAy0WxTEaBa6ZCiaXjykbKHUuQTMXATEXAS0VAzMZAy8XBixXHqzkwTUXATEVAS8VAzMXAzEXBW8XL7u0gTMVBTEXCS8YBm3VFRsXFx0ZNT03IyckOf56ik0KhQcFGx0bPT89CIsHgcMBBIUC/f47BwcEiQkG3x8dLS0rNzc1Pz89DEtInFtY4R8bNnUy3l0bFNQTIR0ZCccEmldUjAkGo18b+Xb0yEUC4hsWHxtY8a0p62HcKtwUJx0XsGSeGpSRGFIO0IyKtOkjYxyZGBTTHFiWoR0bKBjR755WJdpVDMVCXE7JYlbSD8qIXhYSvbPvnFJO2A/M6l6aVJAOUk5M4NMOquJfox0bJSBe827tfDg20sjGFIyKYphVbOclZpRP5d0a1pJRffr6N3Lx9/U0h4KB35jX5Z4dJqJhzIbGYVsaqVrZ5lraIV1dLipqA0EBCEUFGdUVHRkZHxsbHRsbHx0dPz09B0cHC0sLGVkZPz8/PT09Ozs7Nzc3NTU1MzMzMTExLy8vLS0tKioqJycnJSUlIiIiHx8fHR0dGxsbFxcXFRUVEhISDw8PDQ0NCQkJBQUFAwMDAQEBP///8+UBFsAAAEAdFJOU////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////wBT9wclAAAACXBIWXMAAAsTAAALEwEAmpwYAAFCOUlEQVR4nOz9fXxcx3XnDX6rGhQBAiDZZHeTfetSkkmIkCiRIpQ4erEte2ySycZKVk7Gz8iKldnZjxMnsZ3A8NjP7jzZJ5PP+rM7Ox4jSOzE40l2MrPxyJr1rK1PRp4nFvVJbNmW5MexQQkyLUgQLYm3boPoJpsk3kgCXbV/3H65/XKBBggSL+zfpSh2971169atqlOnzvmdI2K00EILzUKudgVaaGE9oTVgWmhhCWgNmBZaWAJaA6aFFpaA1oBpoYUloDVgWmhhCWgNmBZaWAJaA6aFFpaA1oBpoYUloDVgWmhhCWgNmBZaWAJaA6aFFpaA1oBpoYUloDVgWmhhCWgNmBZaWAJaA6aFFpaA1oBpoYUloDVgWmhhCWgNmBZaWALalnzFv7pM+2WmN1vENahPCy1cKwz1V32cTV2OyU1MTW/5PI8+Do8+3kwhS5UwH/3oDO10du5op30iuO8sQ62jdaz5g381OzQ7NDs0Ozs72z7LpU42m0vYzi30f/RxeLS5ASCWEDXmU5c2TaQYoh/gVN8bHiKdSWe6ptKZ9Fs3v3VzJv2zt7WO1rFGj/YtU11TXVNdU8DuKSDeNT+ZRMx+mX4mePxTn1/pAfOx9sIEPM5vb2FmqrubM5kuptIXZrq7proAuLCt+cJaaOH64kLln1MA3MOkZQsTj/MopGITf9NMKbElrMn62pjuunLw4LnXJ6b2vHjzlf/7/H//2uXE7be/7WOXPzb5scn/5299avJjraN1rNHjU3PlQ9zxv/zpP/9fvz3+Wiz2+jg/dxAevzu25YVmBsFSJMwfCCa6plITTF1Myald4ja2MANsab6IFlpYI5jh1TO221wxU7t5/NFbz3Yw1MxlS9klm90y9Njs7E9k904z+hH4OIdPFH+xS61tCy1cd9Tu6noPPeUe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cRM7hyjfyEsvvPvzL/50ezv/14s/27Pce/jq9PRP1d9w6EA80N7W3na9+83TB5qO1y0duOm48Xw60vETPlYbZdm7dF2uX5kbPnalHU69xAvwAi98oyUj2MuQjJOn4AScfv8XT9I3S3nh2Kuda+fme/ZQUCLx2rEEQPvyW2aovMwXT265jH879mQwNCbdTjTSL3EEWOxafPYJmGD42fcP762oROI14dnVf99/kFNPrP/UIrfQw5yGE9n0g5OVEqAGH2a+h5ksdTGJO58ZWHvmP8ECPZ+DRpjk1rPIm9iDC9NYjVk5XX2C06e+2NFDZ0dnx2L1t6vaeUQ7+450avqT/tzpfyp9lWq1WqlUq088++yRns/xxBOrrbvakg3sbUhWBWpVJk8/gfTMre59uZj2wEzcfSx2UXuCZ6u16tortVZu25PBVGuNv6q1au23f/cmk5w8Xd3ilkTibqDGNsr+zexpSEa1Wl3rZn530zbm1T0VlUjcQVS3WTq2ib3oMNXamTNnqrUz1Vr18RqPnXnvhb5Li+uYxc38wYPpSMcdd6zSDUDt8dqZM2ce58yZlozglnyYWmNYdrl/BiqT68cW628mK+lIxx13NChX/61Va9VWJ8n21MPAmTNnznDmDGfgDGde+PMXXnjhG2/+/E9//j2feuGFb7zwjc2851PNx08PpiMdr9mx0RQbPA7Uzpw5wxnOvOEPTzy6Tfrxmy3mR+Fklp08efLkye3Pn3zqZNPf6UjHa3isN8XVn5966qmnsuyptabaUpPfq9K/wXqgzWSFRodWvdWiEonXhho89QzAidMndtinr4k9jcg2EpufOHHi9AmguvpSrcqmWbNE4o6nyjOcBE6fmGvthlvvYRKJe5C96TCJxD1OMphEYg8kg0kk9kAymERiDySDSST2QDKYRGIPJINJJPZAMphEYg8kg0kk9kAymERiDySDSST2QDKYRGIPJINJJPZAMphEYg8kg0kk9kAymERiDySDSST2QDKYRGIPJINJJPZAMphEYg8kg0kk9kAymERiDySDSST2QDKYRGIPJINJJPbA/w9IIgkK80YxPwAAAABJRU5ErkJggg==" },
  { label: "\u652F\u4ED8\u5B9D", alt: "\u652F\u4ED8\u5B9D\u6536\u6B3E\u7801", src: "data:image/png;base64,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Uk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAMAUExURQAAAP////7+/hZ4/wEBAblESWszNcxASGAfI649Q+tVX8dMVKA4QVBERddEVIA9RkcxNPPi5IIoNpQxP7ZEVak/T5xsdcWnrdrGypBdaDUhJ8i6vzwpNPDk7BcMFIV8g/Xs9AwEDBwUHIyEjJSMlPzz/MjEzB8cJAQEDAwMFBQUHCQkLDw8RExMVFxcZHR0fHx8hIyMlOzs9fT0/MfR5x5h6iRs+z903ICEjAxc7Bxs/Bdp9RZh3jR89CpmxgRk7Axr9wxk6RR0/Bx0/Bx09CV4+DJ96gx0/Axt7BR08hdu5xVkzhx8/CFt2IS09ARy/ARs7Ax09A1s4xR8/Bx89CR75TF81Lu/xARz8gRs5Ax8/Ax89BR89Bx85D9+xEqN2Gai5AR9/Oz0/AR/9Ax+6RSF8hl1x2+fzVSUxbba9lSUvI692p/Q69/x+7G7wKSssMvw+gQMDAwUFBQcHCk3NzQ8POH8/FRcXGRsbOz8/OT09ISMjMTMzPT8/Oz09OTs7FxpZ8Lp4TxHRJSgnOH88Oz89BQcFBwkHDxEPHyEfLS8tPT89Oz36Sw0KL7Eu/n56vz89PvspaiiiPnkkomAY/bRjvLFfebRrZRvNrSCQFlBIdCiYrqQWdyxdfOzYnFcQ+3l2zklD3JQLvW0cIhsT0QwHZqDcKp3ULRkKpFWK1YqDYJFHaViN+maZ9eVa7ZsQvicZ9KGWiYQBWRKPfWievWJXHgtEfeIZumHZfXs6fXMwOl2W/iola+KgfR6XvSOeOBkTOp5ZSkXFKNjV/e0qMaXjtpnV9pzZOWon35wbuRoWOtsXOOEeOuViuy9t6o2KtZXTMtVTM5/eOVZUNlbVcpZVg0EBNVMS8ZLSrtZV8lnZY9RUbJycu7X1/z09Pz8/PT09Ozs7OTk5Nzc3NTU1MzMzMTExLy8vLS0tKysrKSkpJycnJSUlIyMjISEhHx8fHR0dGxsbGRkZFxcXFRUVExMTERERDw8PDQ0NCwsLCQkJBwcHBQUFAwMDAQEBP///8PkPAcAAAEAdFJOU////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////wBT9wclAAAACXBIWXMAAAsTAAALEwEAmpwYAAEeLklEQVR4nOz9eZQk13XfiX9u5KvIqup9AUGABInKgMytm3SDAiDT1GCRD/XTOT5syCiN2BKgMRsS7bHnUAAoC+IC2yMSkKmRmhjpN14oo+URKHMrWGj5N5bMIxPA2KJFgESLbmglIwpggwAI9FLV1V1VGfUy3u+PWPJFZkZUZFZWdxWQ3yLRmRkvXrz34m333e+9V2qMMMIIOTiXugAjjLDhMBoVI4zQidGoGGGEToxGxQgjdGI0KkYYoROjUTHCCJ0YjYoRRujEaFSMMEInRqNihBE6MRoVI4zQidGoGGGEToxGxQgjdGI0KkYYoROjUTHCCJ0YjYoRRujEaFSMMEInRqNihBE6MRoVI4zQidGoGGGEToxGxQgjdGI0KkYYoROjUTHCCJ0YjYoRRujEaFSMMEInRqNihBE6MRoVI4zQidGoGGGEToxGxQivGtyY/a0Ro1ExwqsFNz6R/a0xp9GoGOFVAmtQPLHGrGTkqX+EVwmGNihQwyhOv7g1/fDo6PfR70P8/dEhDYtLMioeTf69dfT76Pdh/j6s1eISjIpb0w+Pjn4f/T6834coV1yKteLR9EPdHu2P1r84+n30e3+/2xjeoIDaxcdtP1WL/2q3jX4f/T6032+5rXZL8rdGXIpRUavdlvz9lPV32+j30e99/n5brlfdYv2tDZdiVKT1+9Hb7Or91Oj30e/9/m5jeIOiNgR9xU08zk8CzYnliX8Ptz5666O3PvqTp/d8cdU7Rxhhbbh5JzC+9CjArY9yqzC3Exj//NqyHYq0fZN5iV2wtDieqdqbfzSMjEcYoRSvP73n9OQSt9ab43zhpscfvckwF115enyN2Q5hrTj0EjvnMDwO/PgckUgkV7wojx1ac84jjFCOV2DP6a11BzgdAjw+lGyHwvi4CWfnWdhRp5n8cnYXnF37AdkII6yOG4Ul0Nvg8Zsev/EJ+Mm1bt6Hw4O6CYRo16M/yRd/8qVdZ3ed3fUot849vmZG7wgjlOIJuFEk/vwYNz7BrY/+ZPPsrk4FX78Yyqi4NdXM3fh6aNab5/ec/qOf/CI3DSHrEUYohbBzAqDebDU5vweadQfWKG0PYVT8FCaqA7/DTQsKGUt3Ue6acx5hhNUQ1oEdW+rQbJ7f5UAzcmTusbVlOoQzqBd3GqgvqZ86s/BWJpeEM2vPc4QRKmI3GF4cY/fZPc3zrDSdJ25sboAzqJuWvn4rLtuWJ8Yug5osw2Hg2N1rznmEEcoQCxT3nq+x65UVOfPC9i1nzeM3Ims+ihqKFm/J2bVrYkztlfptnn8U7vcBPrvmnEcYoRwz4ON7Pp75YP17b3yGHa2Vr94oZo3Hn0MYFT8qWya3ys7DR9keLnOYo/Gg4Oiacx5hhHIc5n1f4dj75dj7xTvC9+eWFi9Mno12PbrGbNc+Kt5/maMm6/cfeb+87wOHj0K8VByDe9aa8wgjrIJPnt99bs89+B4+j/KRjze3zLrf210//fusiU4+4Kj44CJfvMlpvb7e/G5j53hdq+2MHcQDAyDJvyOMsL6IJQsjGOQI9/gNuffcwvhiVK85Sz7jT9xab45/of9sB/TxsUjzEK1d9bkF78/v/rX4JOso6WAwZjQoRriIMAYMB/HEqN27nbO1c0vRWXf8CWiOywD5DTgqXvrivFzx+vOzek/tx44e4P7DjHHYGyyvEUYYFMaYbAo+6OEje/TE9qufC18K/mDrlbfy6MTy0gDZDqqvePeuZbc+rt78L4+snON+ZjjojbZNI1xS+J4H5nUv1+vvuPDSzhuvMAZO7xlEzT2otH2TY3aMbXffPGbkoOeDx5F7RqNihEuIwAP8R+EMh3/16WjblCx94SZ57O8MYNMw4A7qVvPVxxYvjG1ThnvAwzvij46cRrik8DDgAbv3vO/fXOu4y8aAuXUQQ58BR8XEFX/3RudN23eLfMTzwOMe8JFBJJsRRhgKjvhijPmIiBz0/b3XvenM3BdvhEdvHSCrwXZQN165NLY9vOJyOH0YW8ge7aFGuFQI8Ex8VutzbCX8ujk9LhN/8MNb/6D/rAZbK56I2Lp8zeWG0xwdnTyNsCHgeSQKjKOeUfV37FlptsZ+rD7AoBh0B/XFpXB33cjdHL7/iP37aAs1wqWCMUbizcr9aGqXb3u7qIn6Hw1i+jbgqHhfbfs2ZOVX9xw7cjD78eN8fLSDGuFSQUQSydbnnD74/nsmG1ub2weyBx1wVDh7Fr8w/f0zoTG8j5gM+HHu//j9g+U2wghrx8c/Dv4R3wcPfe5HObZ320SdXYPwofqQtn/8DE/8+MS//7u7m+e+/7YtO9V29REf70jGAjQyWilGuKQQTMzBu+YrM2fU/R8OX7rg8JX+8+ljrZirPwHcuIWJ6PUT/4RxBXi0N1CjA6gRLjGMyXHwfkOa1PYMsIfqZwc1+XeYe7EOc+HL3/xtXOSIB8f6f+YII6wzfM6p+2FsS5MXBthC9TEqzKN7bo3MHji7/LZ3fk+BwR9ZUYywERGLukcuW54c5GC2r7XiVjn7BMsT56IdE/+OwzLSZI+wUXHsGIf9I4bG1h8e5PZ+RsUEu2D8TF2dej1vOKaMwWO0WIywEbEC74PJvZOTg5xB9XcyW4fTW5rLb1s2h4nPhjPRZmRoNMJGwv3eV4DmYF6Y+hkVsf3G0tldWz4dcJB4mRiNhhE2HGRl2vc9YM8btg6ixuvL6shw66PcVH/5jRyDg3DPkXtGOooRNh4MeD4IqInm6sm70IcW7+bo9Ujz9/jRy668nIMZKdBIWpARRtggCDz8Gabf949Pn3x54tG+b+9jB7XzSmD8xhuRy7PfjoxGwwgbEB7eMYD3f2rrIP7J+xgVEy/AhABbD5rUqGJ0ADXCxoRP7O+4teXv9H9zH3LFC/LFnzl79vUTL/7JUe7PHD+N9k4jbEyMfZqvHJO6yI19+xLsY1Q8nvy7BTSIYUQIHGFDQwGt8ZUtzX4dCfZzMnsjzfoTMPfew4rROjHCxsZB0ACydHZnv5q8PkbFjU9Qf+kmLkjrqGY0IEbY0PC9gygwE7ArdZRWWXXRn267uetxtgBqNChG2NjwjoDm/VKbGD87kfxWecnoY1Q8AXVu4sKOC/djRhbaI2xsHPRQ/L6vltj1QvLTeq0VPC5b5rdweDQmRtjoOBI7BJ/g0SuTX9ZjrSBZK7gAox3UCBsZPnAP7OGYhlvXc624EZrAUAJ0jzDCeuIYvofRB0GxvmvFE1CPhXqfkeenETYy7sHzEZXsaNZZrgDkPIzcBY6wsXEE8BP/mty6OxkO67FWtHdQRxjJFSNsaMReoY6BhrNpSNX1WCvkRngUszjiBI6w0XGPd+SY/4kPHeQgzsQT66mvaIsSfh83jTDCJYAfx1V5PwBLySKxfnIFJPEzRhhhI+MIwO/Hn5/I/bM6+hgVj0Md2Fn9jhFGuETwoL2nSXdQ67FW3BRL23PV7xhhhEuE3CY/ZQeui1yRbZv8kbZihA0PL5MrWE+5IhsKI7lihI0Pn1SumFhHuSIZCTur3zHCCJcIObliPe0rkqVirvodI4xwiZCTK9ZVX/F4+5EjuWKEjQ7vougr5Kb280ZyxQgbHW25Yj31FY+tUV+x/p79RyvY2lC5/XomXN/W7zP3tekr+vB8cxM0b51jbokjx/pdLMSAn3Bt140v4hHg+Xhx2cTHKyQxCn5D/J4pg9xSKJgArw+voXFK3/OxbpPM8WiCrqenyUqcCYlvsZV9LzMSTj1z+Y2g0bvvVHNQFOfvZ7Hci+Hj5fMUfBqp15d1GB2GAM/30i8V4B8Djh7mKAygr+jH+/LjCLDYxx0pBCHtBTQGyKAqpo8kL0X80gcZ4doZeqZsBAeOWwmRBtLHJBCnbADEr9EEgGdyWRQ83Qim8FF5T0MeYuyBZoQGjV43l+WZS+cjxvcaVi2K0OhMYgIa2ShZl911Q/yBRtvhz7J0Y+oPqrJbqH5GxU2PAzDBwX6D4RkBgqO7D66ack0QMwONdPBJMH1H0QPFcAdeV8rpR257BB6xBon4MogvOAHj+elHOPBIblD0fjqIEYzX+2lGPA7MJtemPzAtGMvORQ48gqFXQcvy7E4cmCpzgBi5bcbKU5DZdTUuEDGYAzP9G/YchYn/eCgJA1bdLVStOn6k9tO3/chPHfzhww8+KP3BmZ2dldONxsrKyspK4yONB9bl/yvnnWdnZ7NnPttcKURJysYZx7GK/sJKmBW6OL9uhM85jjiO4zjO7Oyzs+f1Svuv19P1il5ZWVl5y8oLhY0ozzZXVh5ofKTxwMpKY2Vl5W/E+ccXnTONlZWVjzQe6PgrzzP/kpx3O+cbKyuNxkpnLl15hrk8Hee0XklrsR5/Kysr52XWqu8qVXFmH3zwvvuc2Qfv++g/OlS7LenAt1Tt6X146r+Jxz+wPHf5afPG+47d3d+IFb8RePu/1d9N/WN5IhATT8LiN559Y3Hdlif9Yw/P9E55dndgLRYvXDFYWaKTVweJHCXG4yP/R8Wn8+KV9IT4jWevcvIp27sq4fSu4sIU5ZnLHx8aixOrp4zxq/da95ozJU8fDv7JrwWp/LUqBP8YB49y+NhpPf/Cfzz0+T6f1Z9cAcBS/9GETUMwj+3uK4RM/9AGGokwbwBDhFuQ0nh+smvJpwwd8ha4dxEZcfoteehEWTYe+I1ftkdF76drBaGr7yrYrxkgSssZ0nF8aACU7rqrPM9cDpLd0Z1NPs8QcO64t8fvLrpHIdYMpZX+5V+rvn9qS1yHP8sES/3KFf1o8W6Cs8AERbv1Ygget6DXFxjxTCpXNHgIHKcwJQ3P604JqkM4fRDETQZFpUIAaIf9YFIA19mt0fvpaI0DNxR14AZk5XQdx8WQ5h6jV39cJc8cPM/jOtI6FEN3dRsDKIXrar3akBoIGs11tFuzIu6Ho7B0YxruaJ3sKwDGB1grAJ/HBrirP1xvyA4VhTtLDi2uzx0rlqWE9typKiBOiHrGyh+P2ys//VB5WZISKaD6NrZSnmDIl7MIbn+B44YCdXsfR74Sbxji/048kXpfXif7CnbB8iBrxcVB7pXKQyWzSvWUA0Lvy32Vz1V++l2Vn3FD5ZTV8/zc6kkuDfSH+0icnM6lW651ta94PN5BDbZWXAzkXqkpWwFKUxbe17VTKtxTwTO5O01uIJQ+vXpf/3rllNXzrLRWXBr0r6/4OByGpRub62lfcVP8zyZZKzD7CpKtlnIoK0fHw4vXis6nV9zt0E9fP0TX4WVByg27VuS2nRURyxXtHdQ6yRXjDCxXrAc6d7f5VyrPUIjPYUcKL0sJ9D6U0QW/J0XryPKp/NPbb9h0PF3d1ZFT8RRZbfzoHnkWd7DOtaK3ANH7ZK/0lgHRzuzJPu4SgKMXxb7iJlhmCHJFLJVGShFFVeTXYoRRKt7GKNqvq0hF2M/iSXy5NhAhlswMUZpP2KMbRhHWrinOMoxC0ruyGqkoFbm1IeZDiviB72Noy+I8SRD4ySsL5CHr6aDtFUCCIPAliCf3APbbKatJCypS+TzBPxD4Pr1XjNzEoiIVRj3OGMKw15PSH8OoXdM1QCkVRVE4UE7m48BhPN5/GJbW3b5iF0OTK8IwiswajvF0GDrkp+uC/boK3dCdys9v4vn/oX2ILyRdO3Q7G+QuwHi6s2NoDFeFJsz6ug4NISbUACoCuNb343GHkIggcXIBIdnUdMkVtrRgPCQhjiDAiVwXqbSDCk0Ydq4qxwWvYAnKTSyhCR2irnekzTvSAvWAglBXO68rBYQYl/YAHESu+H1gYn39Qd00uL6iC9pxeYcja5hSlOsqQgrXCnu/rglvDe23K8Z3fs+kqmGzLx1dbhh1POYGMHW/q5yKurnVrTuka4hyaiHNelqeyEgQEwB9GsD19lqBSMZh8njI4Fply60VPvjJCaPxeEhy6oAqOyhFrWO7ZPxjvmkUEZftiUUhHj12REq+3SymI4PjRj0Xk/6gQ+8jYm/WBpEr3s9F0FcMT65QUWiecUv3p6shJHS8sHCtaO/XtRu55tdROS3ezN9L/YJ6yAncuHuHLtycm5V+CgS63nJIKL/OVdZEqiJM9hJd952GYykn3TM8SRiG2c7DwIG4r/s+Pwuh1fNyfV1+uyHHpj1jjMHIncbe0XdJC73ROcyFh6XxmemC1PbEoo3xW73rXmIOoN0oxA2raDxLofB/zV3L6DqKH68V/esr+rOvSOWKNQ8LHQ3mtdCGg8NsTqF7+0ety/LQP00+KRyM5J5XM9PTtPn6ikwn7fB4B6XH6TV3xL/47fbrrNFfXB2r2UwDaODYV4UpJOZaNeDNK7k778o951NmKvtspnKdRN/wpa5idUE7kbi07Im2IQSeKdiPdEwsPV9S/OPDhc90Q2ftbxft0AohHHjmPHzU8xML1eSXdbKvYNfccOQK5Sy/NATrlP/7f821WYFcoVWEc/4lxGR/p0m36wj+33vJMfHvgJzPFexffb+IQ2TErNQVOm5E5TTzNZp8z38X+KE/wSDmb53/vnXp/L6vSbpPNsgPRPYWKtfXp76/NcpSfvKfOpFrzQKV9BXKBbXnfPuHH/qT868P/CJO0e2/ZH2pLbwkxm629A9g+ZcK2iXEWZrvcVPff1tqkb2DGkiuOMhFsK84KwPZV+QQv9bWlcNQC3w2Jwrm1gpLrtBuSPNKrAYHk1rcGTyugPR3yFspfPKXi54thgtxZZIa5di1ErEVlN4Sf22+0br2/IltuZwce8E79BH7kjtpffl0tqgBHeOnFBYRVukt81Bob5FfK8IrEHr019KHuRBd0Wss9fv3cjwkFHELFy1vxbj/8PsZyL7ikukrHEOmT6rC/u8GBPxcLs9CfYUGxxjaf9jqCmNEJP1dJMjlYpCgt5mykfz01a4IwKyGlBUVgWObrTt0HClbXb1DWjBEJGnjoy8L1fV91rO0UlGJ5Jo/sHAIDJiuv3Jobuh1U79//J3K9euJVK7YHPqKIULyo2JgdpOdslOOlOKJtRgCdl/sY0XW5eet9rC4q58S9c6iC8PRbfejcSuEqT7qe+Jw4vlmU+kr1gHVeVBFEPA6BkFf3OUhoERa6OB4V2d8VEcXD2ow6W8oHg06bIX6z9PfbPqKdUF1HlQn1qHn7x/wvn7YTcPHcNaK3xhKc3bUr/88vc2mrxgGuiaP6jyoXLpcPkMbHs90H/RXQmFf77QGqqiv6A8da0U/3k0s9MP6Lka/dqUdWIO+YjPLFV0vbDC5wl4nzPCWDdPFoStmqtq4q+oDVpFA0lSdDK5ydKwVF3fz2IFD0Hf5E9zvteWK9beveLXLFRsA62FfUR2vFrkiJg7w+1wM+4pXq1yxgbAe9hXVMST7io0kV7zG7CuGJFdsLPQhLayHtD0cuWI4WKNcwWtTXzEkuWJjoZq0AAysryjFhpMr1oLNrq8wfaA4lzK5opM6uvYidzoadijwLB2iiWwvNUVuqgDNT+aeAU5PXzQaHcfOzVC1gpoCD7wGDN/s+LGn69rVccnlCmAN9hWXgAfVA/5Y5SqbgzMUUtsKeFBEMHbSZrdFby7wyloG8RHl2E6PV5azz0aa4nttH9MJFIS4keuebGdjXNWbCapCN+T0yVxbLBeWxpx73qqRGSPMBlvISrFvcLP0fPuzYN6UdHzxPd9rNjtT9uYogZ4qab70kmCQ55yCTLoyNSv2eD30p/k8K/eRNGHMgxpAX9HHqHj8pliuODPstUJoLI1XTaz8qxPS5upyheWpsiXb7WvL5tqZvp2jG8/MXplbXH/yy21zPhMEps3EteHCD1yW+0Wjo+5xoXDAXJEzhN33P0zBLGnkQs77ZdRyYzdRaOW87T81ij3+n3qD/XXJBKlvT2F2R0nKfGEfqDSn+B7msj5erv1tGHLFQZsduB6+A29aL7nCgKlmwx0pliH12V5Zrohw8XJ0vBYz0Jv1VwqJMmO7SEV8xrS5iuIZ8f3uQmmX0PxZbn8TOabHoECjIiN5Lt9jJrh2tiulf8A3Qe5JSnnoMDaCUiEnHAo92xtBRSlUJlEbT3yJgu6UvfJQkb6jIHsbgocvrar2qjRzdRqSXLFJ9RXiA54Dq+pr3JhIUYkGbdlt44bih9arQYitLwdAmJoVdxTD972j5rd7ZKqb4OT6Bc4+01PxfRU4obILCtN3mO4FaCYe0lbC0P+FyPbpJ9N+Edf4ZkKDGyMEk9pwB+ARSBAEgZ2y1+TUXGWhSJveN4GY6juSfbllcUhyxWbWV8y24m5bnipUzxTtKCjRV4TGwQ3bAIjfVz+QeCWIc3AJ4W7JXf6g8/90z9BRJF5d5UdB9G0xYVdVVeh7dZUfVzfLI7d2V9djRvKjUrvuZ0xbWhFMEuyhx2nFY5C6XQjdtghw4NFpYwQ8z0udf8cpCfPANGWVTppkauRZc1sfkd9O5F7JmvUV929mfYVpAEri/hb/VOiST+9rN3JVfYV2kMgN3TZi368DnK4I4DqO4+jQBR60OlujgWc+0H2LCydDak6uGtA7ioAfhrO55fKrxmAa3T37XgN2Myl0JBZL3Mh0h29muwogjtJax45+kkQfOHic1MuCMSY5VRBxtJOHFnErKjLM3/NmzPVV3W4jD9k3v8b1FcJ1aCdu/VLei3Y4gUmjGVWWK5TrgGs3v8Fjqn9pGzLXwy5OrUNj4JnGdLcthnbQ+Q2Uch3tKKfbo4zjOo6rrD4EAlM9dmWe8Rq5WUFrXCfZhGoHjpqZIsNaboa6G3t5s16/+UVMw3jW6bfhZnB6CECuU5X42Dhu+vLSeaf95TWvr6jecELx4l2sr1BdTL3BzuEfyn99sCNT6THQlHI694WFbgd1BzNWc3NBbQU/7/0/vjn9vO/OwuNreKzAHKpB50zzWNGGtsttVlfxsn+9fhi0ucdfOn3FBpErqtNvyshNffCgBlTa3rnK9Z5vzj5T6pcBWjZflkwlJ0ozrV6AwpSryH+55u2jOx+10w5Jrti89hXV1wrrfVfmQQ3GRu4BeWj1NAUYsAxle+uSqWQNBR0+rls9SYo77a4/JLli89pXVF8rLBO3i8+DMqutFUPHgGvFxS9oMaQPuWKkr7BRveHKiLB92FcMSNRZZQouGIeWg0G1+ulzDoOuFf27iRkq7KebPtjpuR3Ua15fUb3hyhaAjrFlUtczKDr9ZBs/6N/Xjs+dMdcPIFSKu6xXJb4hwLR937SddKvMZ2a6jYoylXG3gjeHx4pq7Hd4/7egFEZSHlQvj0HQw6u4iARB7gagTTqMVBRFKtYwosKwfJufu9jPGdRIX2GhesNZO6gyuUKA/dmBjsYJw65NfT9E3VglAUJyoqpB586gTEOM52chDQ2kKgqXUNtnYBrlZES+3IF9WFEQlmI+B6A1klna9tDiFXQv3xcvEOsGMODG41kRuo4b6nRcO31M3X2sFWVnUP1jc+sr+mk4S9oukysM8tCJNkNBRcbYLudjJ2v9rxYYlRK2CKOchZAER66188xWgQi8yB6TKgojJ4yUiqff3DoRhVGFDZaBhhQfBCllkMLaxarIHnmKOdJBEyFb8LTrLkcpaSaCVh/bwOpT3r7cULt0+opL5Ge2Ezn3pqUom6LycsUHX0iobvK9WZ7fvte6ptwf+PwvNLFZ09XwN78SPC+zAOZ7RmZbX7aeV//H/0jM/mY7ZfLp+Vkjz7/OykQ3X5GTz8ssfA8Cm0v9vdnvmd+ssFwInm+CV4Kiy+al1zdNwkHf//f/3Ylft/4npnf0cPF8Hn76dTkmuZUyhOYriV/F54PnZbZZRpjJXas+5T1z0v42DLniIIPE294Y9hX96Cv+sPiaZV8hfluNZQBO66i9LuoaH83ZYlRF9N1UsR6/9xwPagxgrJ0ye75gLti5mKvb61ynA1c5b8erL4IP8OZiVqyv2oySj+KS+x9Rbw/403fMNGpjuZ8iN9nTKVy9eHX7CauULy9XVJ7y8j1/YPuKFAPbV2w6uaKivsJ4+JnXcRG4BdeeAbp3L1VAJCblkwZB0Ml7i6YS2VRFRJJt4AMfrrfTiTkwG8RbHPyg/UcQVDs8MkBhuCJ8MU4uqlgeKnJ7R8yeOdjApsiiIkKdyP8uiEmb1O+qehn6kCvWgwd1ceJXwEHuWbNF73Vggmw670Nf0V4ruuUKa/43FvlCEPPYrtzORKt+Iyyo5IQ1C1KUsOfsgpx041TajcsZrycNhKcmrNB3MNNInaLbxAzjGcntPZQu6PwNKZk64yxdVMFezNWqh9ba0JCgYWvcFG4W2kOTaOOMYPq016q+Vpg7P2l961gr+sfA8SsG0FfAMBaL20u+laGyvsJCL1vvtau6u3ulk+WqrXIm3TdHmS3qVlLRR1s5k7s8D617WoLHuN0+FOu6Vhm5wlWf8vIr5abSVwwHnyv5VoY+9BUXHTmFSGnKS6tjK0HZi/hc9VIPqq84an/ZFPoKHo/lir4KVohB14qK+opLjkGdL1/i8VL2IgaddPp4LevBg1pffcXjN6VyxTAw6FpRUV9xydHFWi3SXneg14zYWz+9LvicrWzvvDagLHmJeVDra19x0+OZXDEEDLpWVNZX5G7qtHwu7pn9HFWXwSpnj85kcp9MScreMLnb+ro1hy7x4vYepiDZter5DihXrAsP6uLYVwwHg64V1e0r2hC/s9eEkYpUGoar/UmpKCwZFxH7CxyhAdxFSJRwNpT1vCSCmG33TACJCi6gbQIVBAQdkbmNcMDvYWYa4BPYfA454Pv4qVWq2d/t2T+PTEud+TqRAPiwfVNIGIWhUoCKIj4nYDBGgoCUNFWQ+0biQa2vvmJjyBXV7Sva8PEkz8Mz4IWxRb+KCCEmM+gQJ+oKRN+GeuYhodseOt7UPIgbmuQxYbt4Ejj4ZE41XNcFwT/gxYQ8ML4fs5qMCF4aPSsZGmLMI90bJhM4xHzErAj+cRo+BEEQBLPICcJydQwQe3kgHeiB0zngnbAdb8C4PGniqhpxxO9Dp3aJeVDra1+xMeSKyvYVbYhH53QrNH1TTwgNDm7iHUO5qN4aLoi9WB42ninc2Tc9sUK5JA5rjIk+0TGAxcj0HbFGrIEviUsNxDQCX36jY1sT9PJIYKaCaaYaVraej6T92wRCRC7ufW+4tVb7S2PKQXLaxghPUhPtWpiFvxEzFUxLL3Py3rjEPKj11VdsDLliEH2FD9ySo6e64En8vrUb0XQSLmjohu5VRboM5WKcXruGjIp6ktjBDi77s3QN7/B01y0zBwXf9/0AAr89R98m5sPxoEw3W9LTxLwBj/iBxYMy/rSXffUwuKtEb4/zjwSTqP0E8/fEPJnTq5hb3YxJDpi4KX3Mlx8JgsKtJAPLFc+sh932APqKAXhQw8G66Ct6c5sMnuGJHTk3AUZOZhxpN6wlA0E7OMwWKYW1gjcXF8BQw8nmmb8g4UqJ7zWCRs0easKUfWOQKbh9TKoKTLIR0+1jAMBMIflV5LiZysZPA7PahJddTQlTJoC8Nal2aP16sp5qIEqUjw249xcpoibGmdlfLjEPaoB42/1xZseB8cW+SlaEfA+u3nAW46OqXCEQcP5l+02NSearWEeuedmOrL6laJZVIWbf1wrnrNb3nXY3lWg5ccRsPPwGP/N9K+X5hcjagpnTDT/dC3nIGTslLJhP3df7eX9LXWWV2ntx6y+3E5ql9Eq5w2MkN9FN8Ue5sbSlFkVZKHjlLgAG+eR9fPIT73HfWNAOXbiUPKiDYOkr1oEz+/hNj28AueLE97KPpTwoC8YzeMYeRebk7jYVyNXm9ZbXfXOqYKUAF822wpI1d0LykJj/ZNJiNuDLX8rSCSf35m58LqFExeymNyQ+v2O880/h0wUP/Pd2C5j6FjthNupW8wIOkviwagBcafOw5OW4zoB2UBmd9tPwaWpIoQFTHpeYBzXSV/SGoWGwjzGpgcVZ2j9rspMlv7RJlCqeRyIQEdvJWK4I7Y/GIbJUZK125zKG5C/FIfKnRmk5IhR5/8fGjmDRus8yCiz5i5uloKBi/o59xbY+JyofEBuJBzXSVwyGEw9Vb/FhafksHC15+ucHjE98eMCy5DHwKdBG4kGN9BWDQe7sv8WHiLKnD9ov+/Us3Rtr3tkDl5wHNdJXDIZ9l3RQlE6Cg/aM4XhJG048yle1P6iNIVcMoq9YNc9LS1Qt20EN2jMOD6VKA8/WG4kHNbKvGAymD7liHVC2gxq0Xw5nB3VoNTZVETYSD2pkXzEYLrFcUfbwQdeK4eygLrpcsR48qJF9xWC4tHLFvrKFasCeMSQ/sxdbrtgo/qA2nVwxkH3FKri0csUz67BWDMnP7MWWK9aFBzXSVwyGSyxXrMNakT/4HxgXXV9Rtla85vQV8mTl+4alrwgthVxluULbCt4+HlYOWwborFP1fnlz7ptVo+5BVzQMu37/UEHCvjSL0kesow3iD2pDyBW+qd7FVPvllcoVElybvzhrv3PBsXp4rZ2n73W5PlORSj2ORWH7TGZNrnMc62in9inrgunom717hgoz91QZ/gtEbXJIRg4MggOdLYEfBN2xxiUIfMmH26agf2gHJya4l6+xIr4v/bzc+nrExRtAX9GPl7THYz+zw4HN5PM4f67qRjiaDyiK+Wb7JPd5ZEvK1ROMhDmnsq0F88BHkyc+8LFoPiAN8+g3ls/ZKf82Yep/UoUG65qBiVWMGArQWjBGHvhY+jUrmYBxLlxtJy1kyIUw/7L13eTX8KOSkrFkZubLW+zOLeEbpIedrUEa/vRL+WFwzoj5lY91Jn3gYwZnvqBg8TOyGevAseD8ubKkuTLkduhD8jO7dGPzIviZHQ5yu51gT+X7xARe0QjKcWYbz15mX5t/o817eyNIyjCVTyN+PM7E93y5Ipfnd90wdGKDC+1qvSN3Mec9tjJkZTvW8zvWvBcrnE5qXB1FHUcfCifKfI23yadGvvCLzdzoncOf7rVLvy348tO7cinP7sgVNKvApwEpU4mklzz/+COyZ0DlyaWzr9gIcoX4M8G1EgSr+3QRCQiy2A1lcoUBdDrmIxVxY65RRT5zIN1FmEB8LzVh9cUX29MMSoNKI8Yrns2uBrOzA3qgMY3g2tkgMfcOeLaV8WKnoqmOaMWFu4gI6TDMDmkPivYO6ti0eUTsvZbiJpjpNfPeYX5CdM7zjSGYne12vOMHs9fOVqqq7x3ABD1c9xRFEbBx6fQVG8G+wvATZkZMsfeMNjzP9/x0/1RqXxEnio09AR7bbZO5A7zAePEDvUZAkqeZnmn4+Q4TD684s9DJZiyfxmxjsCkQAu9I5ivEs6txK77z4JfspAU9ww3dMC1X4pjAxQ3Ryftse26/h5lpc73NMne+uicNNm9DPB4+nqtR6NzS8+THxwvuMH7BNtaGwefRW6u82AQ5T6OXzr5iY8gVptdGN4/0HTRKLCPtXZnhoX+WfHRDwHSQIIKp1Jm/j3cgNVU47vkz+dd9NzjKTXZQyEOJJqBBMBX0G8a+jYcPJqXxfNslwW/+Jp1rxZ/2ul3hRNRyL8+JCNt+GLJAEEZ8b5qnJuy7haketuBGfM9vSO586at76BFC3MOfupaDfkn1k9oJjeBgjxFYDZsqfsVw8PMfRdrNZTJptxxCWcK8Ld6d+9JJ3lFtn0sxGohYMvvx41lBvA7fUQ9+0YndciuIjcWSq570FTPXRoPjjXRIebDPmvU1q6wV6V6uPQKyABPZSkG+C3mY3E7ZZHJUB/zOlIjn91gtxJMZ7544q95IRX1PPHrlUAmbIn7FcOUKG4aqOppcVLdV9BUmo9d2D317B+vZPUTyX7vusw7UjTe4C8+2s3tjlROtO4taejqZ8xzu5urZLqdnqs6ynteZ8rcK34pXXas28Ir6GtRXDAGr8KDWQ1+d5xfJUNw9l5bzIvOgOpq04OmmbYZbAQO/h9egfcV6IN9Jh0MbzWN/bhk3w3H3XEZiGQoPqrMDV+6nA/fL9WBhvRbsK9YD+U66HvTwZ/Ii+3BCA5QZUq0LD6pywwy8hxmWdcfa8tx89hWsvenK5YpS2mgiDdpRqCvB5BegoawVpY8umq1X45vkpoTqs2xHyuEwyQfFa9C+AoLElWRlFU+XMqlTjst30pLpUgKy3igiQRDEUagF4xvfLhJ3gUYp0JoQ7syugeHnO7L1/exyO5ZkkjxX9CD1VI7dE7Xq8lpo9wwVtR3mRKnD6OQXZVP2NCZ7rh+HKbB1c4LvWXG1bUpUxwj9ENlhlRCIWC1DkQpTocgS2i3QJ+AxCNfENtt89hWGBnhmLfDE5M+XcmvFKgKnMRlTyECiLzdGvMDLeY76DKiEEqidOE18we9WnJjsVgwknsbxA/+A7eLJGJj+jKWfqShXRCHo1A0sGjfnIjQMnewqYNKSeD4NI7lod4aGabe8P+1XWEsEwfhBkqnvl0fwM/l1eCCAIXQjuwj9YvPZV0DgDawcjmGgLOxI2VvzfAlMls5Lj2MlAPycQlFQFr/VdmFJ0KmvEOu81fMasWZFMHJHXkdp/OMHLb1LRbnCddx2OEoHHUZW3RU5nrvVgxo9u1P68IDGTJWtrPFxgqx6jQamm3WbIAz7UYKVw44mchHtKy6Vn1lVbw5hL3ZgW85Tcl6uOPrPOpO3r528bMm0SbTmfpvJcWqbTa8NT4qlFn/x9dY10zxrK4LPNY1wINUHmhen2q/xx6fO1a2UzVOBpXcplyv+1L7vJTu0xvOvs75oZ+6kNWZz5Txw/OxJKyli168ZbrO6d+F8LPhRfe9ydt1IyQrX3Ncsvlgdb8UdzEVcitjPbJsduPH9zNZWT1IBY5G92OV022U7KOPkqKHK/2QS+tsDarlrS29CMj2YCdzc4vrCm6x+dM1fAxk/L2q72D/28HEzZme67PnHHg7SxaKqviJ0TJhN/AbhvF0F/e72jk46yum+8Cbrm5zKVTD3PgtHqIHGi7n7Xryyd0oN8heTaw/cDEROfpvYLy5GvO2hyhVaqbbwWBqUpyxeTxS5hXLFKitu25YoYjnra4Y4UkPbr6uRwEi8nwaciCRWWKSAu+Mbfd/3ffMEURtpvAeAgx/oID0Y4x2caX+tKFe48O+ykswGGDsCi+ZDBLMJO9XgZItKIl9bYqwBlTZ5pFa3HQJAPI+fb7+oKOLzxXe5aSvZ5wF9Q0Wucqxp+7Wgr9BaO6lFmh4IgOvoYrmibI2H2M02EJuVNUwqBGQlilNdH++fRETweUgSSUa7KMWDsVDZaDQaDQDXSQJ9OchDqTTvefd6eQnECA3PSwl0pqJcoeGwacQlYarRWd3PC8aTdPhmU036SEuMvYUwbfJ4Kk5Z9KaYomkw3NAW9l2XQ0WzjutqR+febEn9yuBqlCU3vkb0FWuE1p2n9kU8qN5Q2b/28BG5JZfoKbyMxuhxp2k/s8fb1ukGSuU0Bsbke/D1uRdcOnqttcKeco1Ax7nwIVNgothVzMfaZhi6g+FYPB8b4evpGlO+7x54FHRhrVL7ZtRXDB+D8qByw8fkVFeDv+H81JYbsB3Kv67Q3Ba6NFnpseXqKSsiV5jS+fiGAZ9wybD59BXrgYF5UBWMQvtG3ntsru91lLNs+FbXLg+qh67OWrm0mu7XiL5i+BiYB5Vr8CG9/PzjS9aK0nJWH6Il0m8pqrNW7hrsAcPCRdRXbGK5ohufA8tiuc2D6rUNsn/Lb+wHXyvaJ5e68yV2rxXJdVPu5q+PtWJAlWheydN12dqtrbKDGszfyXpio9tXGB9uXo84QTncji9+kNJo2jyoXs+NCKMwieh1wvIH5fPVXDqD7yfabkPb+bMKw6grWn0YRamTnDgkcHqb5CXjJ+NyAiBGDKFS0PME8/NtflPIfshrlO0Tns7BrEvOf7II9VHEU+2fg2mu7/Bm4M0mapAg4FCJlGUIw3DwM/ae5+5xS6blvJ6EqlYdG92+QoBDaqiN1qMZPyye72RBGttavDB0yXHUkok6nt1C5CFJziSTf6w8hemM5BbAicQVWazwu4uuPOnKs2dz+CJxNHtf2F84WwiPYdH+nilbVvrZ+LlZnm672L5w3DyVK4sAEsQUwgZ3qa55wErnDmqeXQGhcXiqg4pTARtcXyE+Hj83tBO7wscY34luS3W82etWLnBTx5bGeC7xKaKLudN4cX/r9WYfMY14tPhmVjJnGa4fUwdzeZq0u9l5duM3DGLiHm4w5oT2Cub0LnMhM124T6ouV9zUHmdOiGSehIwEmI6C+I2GB+BN+Xym8AUaBPwBQ/hVgFtrDXLbBtdXGDwfGVRdV1mtZ2Tm73kzSc+W9g4qJOSnEEuRJfyCHxKGkYqIrbFjJZ7vJXxAS1UI/jS+j+95xuC68YUQuYYcu1ZAwpiioK08e+DDiPG8WOHmIeAXrBZJdw3DMAxDFwMzhX2/qlwhPN7OU3nx64mvmDz5XnMzBH5SO4FC/oVw8/oNCYBIwPZ+UQ0b3R9UIwBnDYf/1VAz09PpJGzvoNzQ5c5fsnqNtPhMMs87QO25T8a2Ggbfk3w5hSli9y8NaLQ7eswqt58eJdyueFhkefaAYcr+HOLqLsOK5Oliz1vquRIPJ9UPCew8Z7PP4vl88JO1XOUPfatNAp4iIiycRB/f2c/82jcccLit37s2uD8o8T3k/MurJ1wbzkhD2k7OrP7jhu7WnLPT1ssWJ1yipSDmm4pngul8OS/kPOCaZq5X1u1MC/LsAde+zThOVEyCu/BKR56Fw+LQtwoudMCInSecSTw+GZm+4x75mVzlx/6R/a2mnILuYoLzr2CGE3WsCGeDIvfChdjo/qA8g7xxfVsNyDt5ypgUWtG58WsmxwZicv8aEWauyhXzZN4FrrQ/GFjO8cM7jiKKqzuW+6a0StaXHsgXhqBkraj8at6YL1vqMNbMePDlL+dGzLaOWxPfU2Hn8PBMWX2HATHiG/rTWmxwf1CxZdX6D4r8Qy0ih9Nx7tkiPjhtWx6l6HSKVCNS7Xtb99G+Q8idyaR5WikqQJXNTAm3o20UWjJbVtZXGPIc2vT3ZM3IX4mqzZv99tf+YTB9O5ba6PqKSwG7h1ZdEgtZRgn2DSfenI3qq3X5YtCHXFGQUc+f11vHtJ7Y6PqKS4FSHtSAO8HSGHYD5jkkXGKW0kbEBtdXXBKsS7jgS9vzyzAoD+pVjA2ur7gUKOcXDTpiyhagdZebSjEoD+pVjJF9BXR6PWurpNZkEZZ/wtDliiply9erANXlih5OZnr+vOmH2ci+ogvlHXjA7UbpAjSSKzYYRvYV3ViXqW44cazXAyO5ogsj+4ouSGkHHnTIlInwI7lig2Gkr+jC8EUAuNQ9vwxDMqx9NWGkr+hGaQfuZ7thy8J5a+y8R80Sg4qLgLxcsb8g1WsKm1pfIVISAbILaUBg8t60k2tB0Pb1XeZRJhdKjMyBeHeeGqIwzAgjyQ5KJPAFnrZTKkNmYYdcaz0LE3NDeuiJlbJN+rQuGa9BMNuZZ9tmTXEnjfa50dUnULF9XxiqsJNiFQTXBkFMIelq+sDigOCQc7iVeLVToYm68ixDLk8b/b34PtLGGFhfcan8zNow4r1Yo1o0QCMXEh6aADzvYiT7i5bwDsxk3KZnir121l5yaN/JYkoSjPO0smQswvPbzZRm7k/P+HB+wcrzfJAFghUf2ZJWyCBEhUUJDe/843b13vu1+YKEcuzWoy+nBRDA5N6dGv++tJtQrNjbIdH8962UTvMqjiRUvgMzPJfFVzUCS2+238Lyecup1Xv/u5sOhXo7TzGlf4AsvrngzQae99zkKnvSrL6tAg+eJYj9zFr6inXgzA7Xz6wF8Ru7q5vCP3d1/K8haDCZ29K948+F4xmBrmSQqbHL83kmhhM98kTLLBlFNItj7UFjVvbmXulzUSOI3awbzzx7Wf6JUe9VWVNfPrG9/V22SRH39KC5M59n7uU18+NOxaYQWoEbXpOfZs8abjUNAcwM3vdymf6q/SV4ff4+nZYZp2Uqb6bVAxRtZ31vbG/VbJqmRzjkcgxsX7ER5AoDLVRUCWR7DAm8gHzP+Ebg+34WjaGUB6VaU6lpdpREQemZp4rkGstrq8WDagQYKzaKSBARtK2JeFtmia+izMtBN1x4ViRIcG2JT0uvgVaZdf9U1LIZu1paUUslTgqIVEikAIXrhObb+SY0EiR7F4kbP0ozjbjDfqQEWcGCWaHW5g5HIlElK/ypqKXvoLdCMLZ1T0pVlEFaaFr4/R51DKyvuGTxti2IB/0YOPqJkUHcg9o10DRsy5RSHpTuCHtflCfwnXrYjmSdmTQFYKbvyMetvm0mcW0uwAmVxOkuXQZV6IBJzEJM8IgptKAQvwE6bSfn7vxaqFxohsnJgIqHsdKgVeSGpsMrjSH1vul9Gsga39RzyZi69ki7Pf2GSWMxuSEYqdJ1wo+UOels+Ny1msecxONE5EjfRkcb3b6iHCZZYN3V4QAkuxS8Bjd35uX56bxUpobW7lTdzR7I/pI8XamH1jBJFyDxGjBzt0X5N43GzHTiST8uQxIhKQzd4gMx7SAPYTzf930Cpo5RtFoYD/aj4hKjPtOVIBSS5SmMt2satMINXcm/5Vuy/mW4Fys0Qa1jagpmHsZPCuR7SDrocHGUG5t+F5Q2gfubbrF3NQEerORGKrR9kVTHZtdXXI/rOFUcFlhHjg0jPJYLbXUdniVOlGnxQh/LNr/t6LUrz9jzeeZjO1WCGGNoeOS9Gfgcz7a+0vaT6aAdp+bQw9pOKaXiPD3P84yH3NMonhHloWcS3pTj0G4wALTW6aQBrovrOPGYjMPT52p0CD+O7SQC3AXacRzHcUlln/TEyPNm4tGYh0Y7KB3fVf62NKHLg+SsmzKYOHZShdfuOHB9/+Nis+srnqq8k2vv7Lub+XZM+x2WavFcF9we28cey4tj+y/LLUCdxmGe1X/sp6/Sxtk4FxqlXsHNne0Sd/ljB50donZ6a88VQPGh3NLV9gjYNWsbPC+toz02Cu1pu6B02VJQ6dQxxVOrJ+nEptZXQB++v/eVtGT1qC7WLLsa8kOnMg+q+sR2or2srNJLTD9KAgulU87Xs0/r6rvmUuC1Y19R5tY+58y1nAc1KKqaMvXxdBlinn2M9hRl3mM3Lr+lEl479hVlVIZ+IgsPiMouA6o/fd865NkHShnom9vG4rVjX1FmOV05sjCrxespxNGqW+Hq3emZyrvrAbto+dpxV8WG2ITjY4PbV0iAEATSG4F1GKmUUqhOnU47riQm89pC1yHm52KuRfxIxBTrmbSOLJ/i+7M3biR9/amErclFkC7e7QgG3297qTFVx53pCOuSMrI6ETNdknaIMgZUORRhGGltVR1uZjqII1z6+NygizISkaDNPgowhNUemkJDFLYddsbtErCq/JQUPepwu1Pkm6QQG9y+wjSEawuveh7Z69Y61FGYO64jDCFMTsrj7GJIp27hKfAl0YAmGoMC5F6ueiYn7kpSkOQiYWhNt8UzpjFBu2jpvVXQlit8cwA/LX9ve9FMaAjDavmHQBR1nMw+DY1Go9HwjMcHChcTg9+gIdnJc6Xa5KCBkLutyojvJczKCiV3lbar2Ldue4PrKyTAn8HrftPZC1fpfKxQBsd+T9ojPTXU2N7WDB2xJoDGVHZcWnbup0O8rOoZ4QPpdgavr3K9dvDqkhMwCRqm0XbLavZXDZu4r12f4A6fEl9gVpwax3F0pTMjF4PJv+XPp0rLpC3DgtEVHPBozwONAbZQChc4Yv1i4gW+Ql7K2CfMmt4O40sxsL7i4viZBZ/GK8sHjvf8expUusihXWpzJ22tQP113mwUpio358q3Hye5Tbhw0mZonrO9wEr00smiPmzqbjjbrnrG+QN8b+F7BkxCBqV+ZbNOlD79mZOFNTQ/2jTtePUHrvwzp8CjcieeeT4tMRyEc3UjcOB4V7oDx6OX0upiBBNWyt+lWXu52ea2YrZuyYppkP1RkUrB87dvO3DcYv6Wk1d6QBNBpN9uvWtZMIHnV/G+KedOCimzGU4FZRNGT8R+ZpdubG5MP7MGz0e5apIef7oORPY63nqTffPz+JhawuwHF1dlt519k0Vl5vncW1PfLmxFOaktqjUnvpeW0wP/6pinnryNk1rCNme2bBvxs5PtGijtqsitNixMGpkbz5+eaSy59NR+Ke0y66VVFQMXKmSuiYCVN1u0eU5X7dyNs5M51V7h+ClE5IZ4s8p+13MlftVzcLxZQ0pVB4JGv55sYx7UxH889Afx9w0mV9AwXt4pqwWlVPuaUoBD0Ab34CIqjf1OlETcUSqOPWH9OURRFMXjJ2LZocssKYERXEtrJRm7CYPnC/HUKAjcEzMm0qQlRNxv6ozGqkIVhVVVk7a+YiYWsXrNVVqhHSNGEET8IOD6KrkrcBHTbiUBFFYIMIrWHIPRGUtXTbX6HxQKYDYKM0QREUiVcaH5hgkCEQTxJQgGcO+8seNXSOzxt6QU7bDoKnSBRju13PBFa8JylE79xWvg5twO9S5i1k/M1KFkJypY8z/mzk8mH8h4P2m+D36xZ8oeePCLiKtiUp6jqk83+/4g+5jMhr17qY6J3wZAGgQ8NVHw9nJSmasj5277qgBp8ZRjtb0bQueWX6Vb+8ipqb7Dj2tHuZ1MEsFU2gspDZ4fl6chjVLP0wXY+PYVvrmlWkIXckPIHLK5CIqcpiGvgvpMP3E8VfsV2+wm06W5ysV4KaXuuO20fXSf9glYdV5Qwj0vZOV14MHcvdCeDSuftLp9ncmmUPSceKt18JuthAPt3De4vgLoz41XlwO7gl42HMcW+6qvzaWki8GIRJ36inVBdY+AvfmtlwKHrLlqIF+GG1xfAaypBxcuAbmRNui7VM+Umu3lsA4unSvzoIb1vIHuGoBhtVZ8fq3tssH1FcBaXD4Wv4zP2zpg84VBsz9cOe06dODKPKhuFGjuy2+q8jjZCCvGmn2Ebgb7ivxaUZ2j33WbhUPd3+wUFftbGTu9A5V5UNVRnQdlofpIitujI7aRrRxLv1zchaAC1rw93gz2FfkeHAFRSLeMGIZlrzwiJFnOVeTyoY7LIWGE1qAU+zMXQkEcSb0w0zJ2euJTKf6EuTOOsduDzQXgZl4LlIqKJm1FFKkoihK77lK5QikyupZqn+RJEOAXN5MiOZ8GoqhL9yaEUUhMOAvDMCNJhSiICVJZWp08XkVRFFG4DlnljL0iqMQbVTMk5zoqBALPT2rhUyaMHVrrDLQZ7Cvsoa9DQ4jxuvcAIW5HfDkLKiSEMFRKqahp6LLbdjFJHPWQEzDtx4xE3ztQNr1KqVwRhsbopGxA4PvFA8x4MV8rCkMIe+9wUB6h52ZqglK5IozcVLcQIg8lhEgjpe8tjFxIxoVnumyrDXzEi68aN1aNAvoq40JsK9s+I4pM4nbKOK6rintwu5yErknyTPyx2IwSB9oWh/Fha+Heb0hyxca2r7DXCuXUMM16D/6ES0hJD3Zww0T4Fgk7eFCG8B312PdE/EJmwPd9Gvgf8EukzDLDBQNGUn8WU0auLTlXNM36ySSl47ph4RmBj/GbbqoGKZErcr3ExdyZ9CcxU7PFRcZ6tjpZMz38Cfz6yRBQ1ELjJHO58mvNzl5/c0z0UEpRazWLiVd2OUNCoRkv2NqFZkczGCRZ5syUT6f7ERtDkis2sr6iY5uoolDo5SIiBEzRZKzdiGZqsg8ukqz48bLvwJ+lSVOnEJ7n4cO9ZU5gy7QQgrnGTfZsrn+vmcErHLRyTbIf0G4UNt1Cyq7r7kOyjUWJXKFDQ5jlg5CyJTxzm1CsrwhJpw7CSLycviLOIB42YeRJZNykU0fX5J9uOISIIQzDEEWHW5yicjp4OBIPlJSNb5GVQfxkXhFBhETr3SPXIckVG9sf1KE/bX/WUdF4dACnqJcq3LCW3hn/Y7sUiInLOv08lapQG2Iom1z3/WHJ7opaNndoh8ThTK/0Gk4mc3RczkLoltCmkbR5UF1Q1LU1c9Wew0+qFACFT9AOUTIstBNxklauwJLl6IBDK/0S+W5Hyg/d65A+v9btL6p3OR0cTE0pHRMVwqb9pjW1mNwEmAAjJfPyof9ReKkaBvYHdRH9zNpDXznNl4sH2PmgYJOiI9ecsl+bmbcv15QTxbQFFKE3H8l7/1tySZby3iFtqGf+98JrEr4C6SgQ+PWP8d4/NiB/+487/v5bLXLTObirnDmYMcG9yk+HhZSwSJzziwIQs3HNYuBlI2hKzr5SkL+AkTRivAvR8rxV4P/2P+XuU7WE3xS5oHbPv/ePs/ryP71iz0+1WiETyiqnJHlqUBC6yNkV+1VfEC/N1PNlJVcW2WWP9M/35QOkB2I/s2124Eb0M2uvFaAvL0gGJTwwV5ucW9TT23OXlXIzSwxXbwOy6/PFy4HmcGG/NG+OCxR/AfMvYJcG1C7yf9tR6JQ93lnOPE7uQvkZPWTfHxRuyTTNuJkkcbKaNIyRBnBF8RNYqbWd5Cg3V+DtZ/bYKb9LtiXVismkejHO7LHfxHdxYrpNjzPcdjkNcDL1teUSuvqkTYGOB0/82TTIsaNhxf5y6FslFayCmAe1mfQVN0iJxWFhD9bsfzYVmyUQ8twqlU9qXVCle8rV9RUp3+BZnfKnepCPLBM/u5zdqOWY4qX6ih8hPlTO7CHa/xY1kojwbFsLoVMfhu2C5o6pVXv3H6fUpOdCIG3asVBm6+7E5TQYRKjlFCK5u0qZG/flmuI1qK+4fcBjt2dK8izDYyXXyvUVg+HEKuymtnhZyoNa85l9D/xW5aavnrIMd1VOmT8LfM3pK+DDA+aSf0/DYQeW6ysGzLMyu6k05ZrP7Hvg59YhZRnKPE7l0fFyX2v6isGR9wc1nDzXw9FSdXZTacpXQ7zgr6+eJEaHG7jXnr5iYIZr3h/UkNaKtR529EB1dlNpynWJAVm9tkNpl8prRcfsdOn0FZfOvmLA5TEvGefzHJTt3Id9RTmsp5dbTejYQkmtmnI95Io+mr4z5UAtXH3Ozz9uSHLFq9a+wkJeMh5Knv3YV1TGBpYrLjLUXVVTduygRvYVlbEOckU/9hWVMZIrUuhBd1CvQfuKjSRX9GFfURkjuSJDZWl72AeMm09fsR5yxaBYD31FdWvszSRXDITqJ7P5EOmvQX3FoMj34E6ro8EwLGE7l+ellCvKFTCdzlbW2wivD2k7p6P90EhfkUAkCPLRodFEYRilPlracoUvXR6BIxWpxEuaarscB61xCncDIWaqpETXSiCBEDtOs/3ldCGKLEcyq8kVMblCa02tzNu21WgSdDqwtu6S9jVjjPlkmU+bP8JmXfR0XpdR103mXtZkUcdURKRyTaYRvC4fvQrCyA3LR13OkZ1Y5ECN4Ptr8jkysL7iYvmZpVuu6N1tfDzzvGtfUwrvZGbPZXl6vS1oNM+bT933yeTP1AjdlEkRet+59xPtR8licctG0StFfg2h9cWZLCKAD+eKs6mBCrNpJvMe2yvPCxGSlPoTmLNBsSGT1Wg+j0wmHwUjhuU3Wwln3LG21sU4KXu3F+ov2ZVwFoq1Nfr79reM5OVGbviRT9ltJhfwe1ciJJr7fq8LMVpvsL+Zc+1Z+pP3XUBuK76zAmI/sxMs9etnVkrMADpwE49/4EW5/PTiD9x37J6+dpyCIWj8i3utIagXtyC9MgnENM7uzU0vWmqpfR287Q+vjseT+OCZzCGsEcN3r4pIWKsqdLSbuB2LvbLmAlm/cIUiCaKtra7cA+/4c/ETWx8h9hjeuxOZ715F5GR+mvUvf6rQOCmhvybOkOHa46Z9ZXHCTvvpj2Yhvf3Gs2/O5fPilfa3uR32t6gdIbYDnavd8mTvdBg4vTv3SxpjFRXinNSenVR8z/fiimFeuCJ+EiFO6wc61v4cwnrPXkA8lfmen/fkWA0C/jEOHr3fN/LZ+RfOTS5WXiVibDS5QmiAsaOQqEjEmpYyucIwHW892n5mFaDiVUW7itnEm0EQcK3MFrWswo33Pr2NrJ8Sv0Eab8EjuLbIdy1KRW6UdbkSacGYYHZWfDEYjAlEjhe3R16u0KkNd6Sm8sub0CJKbbWzf3tBhxGRakVKxX4HjDnQ20xRAoRIx00TRVGkkmGgotAF1WhbQQYEfleMHQCc6Be+3RmjJ3uxLUUrf5vtHULEP3ZgTfL+wPqKS2ZfUQSvs3G12/Rm2w7E92de9Y/NdK7ahrboGDpIFg3Jl5LoCyFQaKjvXG8kaCSznY/nz/R+++AZbTuvtbzHdkE8fxqSabARlHmYtGwMrEQh+jv5CdQgeCrbNoVuGBZNeE4UmdAFNBjBcAd+7wLIzda06flh5kTB7cw88HymZ7q2YtqN+PXCurmETkndfc+jzNp+dWw++4rC6nodzaSoz0btYmb6Crmn0dmkd4OjMnsX+bfty8b3Stu3p90wEId5bo8p3+ssXgZzN07Ydl5eqoXwmQmmk4+B1x3KrA2r0UzsEF1rrR03qrldTXgyhNQIOnTcoglP4dVcQCscMSAHvd7xdhrmqzjZxDkLtfizdkJH5fnhng8z3S2stNP2VhBaSH5xMcW7o4bv+43+XS5bGFhfcYnstilqDCOYTn82oesql7isOovAYkQaks/mwS862a45dLjzk9K2cjaF3uEdFGHRLpzrxHixgRmmgUChP+0bvmh7XirVQni+5x+PC+SB16stEr/rlu2ymDtJpQVN5HadV4TpVYVWJbEzHBULVenaVuw3/xZUkqeDctqezF3gwS9ZDSGQtlKSRBMTvdyszI5dr6QgXJ+ve+5LKqgMjI0evwL60Vd0nOHmDlNsfUXVISqe1yhOqxQ4mfVZJ+y4rOUnhF/PnfyX6ys8GvaZY3G+RfqKngdMblYLVTbfWR1TwfUl5XzMMo7SOY+DnWPOK16Ly7qYeqrkohkk6JiNV42+AigfP2XxtkuwygAq7kKfq/xm8irc1fQVFUf0+vOgbl89ydpQth1ZXwXiq8u+oqwrlMXb7sAAHvC7z6BuL9v155Av9UDeY7uxLjyoHD637k+4ZHh12VeUdYU+mHxD8YD/Oakau/Ou3LchRaVYFx5UDrev+xMuGTalfUVhp+1aK6yFdhUm39CX5PwGw5QM5vwOakhRKQa0MdDVG6L6FnHTYfPZVwhBUOTa+1/m/Mqgw8zVt2Y/4tvRFfK3RlG6jbXF0dJIOZoQwkIrs583+JLGc/ADP/BTKTlzdJ5cPEQ7tKIqWwrFN36HR/GsBkEcLTKT+7/aqcBRqStm3fWIjO1CGIWZJ/Mo6jhECEONDrOYtE+12zAIiilHiePoOMtYWJD2+YPv45O8Fx8x5E4vcu6VQ0KNal/uevtrhzEfB47ivS/+von0FTDt5yJTpQGqAnblJDQdkXkzgmdMYTR7AEKd3VttD6NCK4hoqNFhLqaoibklxhiD35g+Np0IRAF+w/eNIRt0d0EYhvbgKni+aQTgS3cFfB8Pybtuwk+HhQ/t4WuIctkLtIdF6JK51gkhDG09uIII5aQH2Ji0/MYX/MLJIwxJnYDqxMu4IY0hKB6+1z6yNlLoYldB2I64HMZ5VI5OVh0eHObjX0m+bRq5wtA43ujVDKbBV+31X0WO47SLKY8Wt12Eca0g11X3MK5L2kkcNG7HqUljKimnafD0PU+nPwcEklNdfAbSgmqNQ1fYyawK0mg0ep06NjobJDc8PXCygtYcp2OtELR24q7naMdNtXguxvVynl4dF5sTkiqkDY2pRqOIz6Jct0k63B1H51cqYzyyaCH48nDvTACtXcKUp9sjZuuw4APcn3yZ6Ne+4hL5mdXKLd6JmVqOwRY+n0RdB+DFf/i/Ft4oUxK6VIv93oZL8+WW9X2rvfnqKKd5qRF7SfWnZ449fPycnXQlV84XomKzjZN7e9NUjWBkzibbyoJ4vmAEBKIXctdy+vjgnH3NubyeKCRCpFl7OZd0m5OuHdoNW9n+AjBSePAdwsLphIuJEcz/mWuYhcssDmAgP13c19tPB1r5Dfkn/nEZp78feEc4Cu/7x969WPqKqsPiEvGgypwzYpEzAR1dlaOdl80tEZQSYHsidMyViftTASOv6MiKsN1RzudM7BnaM8cenmmM2U66l69CYiOMuHsHRUpj87u/WFKcF65qjxgDQcNLyEA+XBX/LDEPWHKt8uaYXp6kCHXC3nWbCCtXWQ+QV8AN09g3HfFh8jzcHJwLV4lJPcnCUs5B+ZzNYCuxVxHy7pY7Xtb/Vnhjn/CPcfiozzH/s7CJ9BVRLAf2oqm2RWYAhGDWz6SxZ3VehrM/x4yEPuUKgGfxfUwcatsINoUoiumiMcnTWsLknuMZHyEuyA/G4qfv+37gc61PoWr2DhVNRXGorDyUihArBpdI4KUnw8ZjejYIgiAIfJ8giAXzNgIQk0jNzGY/h3INiC3T5o0vnIwuHEVRVBjyW+PixCEnkEAIMDkh2mBTDIMexyjJC7SersGNlNUJeNvQtlPx1JV6M9g0PChX4fQybFMoN7+hvk5opK7yxTz0z3Su0DavBuXY26c7P1mptA77/zCVEAS4BW09wMXVaTkdaBMSLdpPfPX2j/p4aTwNOV5El4pvOOmqHnZB8S9eO3Ox2UUNmUq/SKNTjdLI/JYnTK1EwnEB7u5YYZ3kFAlHqWxddECVeYPnOkl6vkcA16Fz7y+bI0rJS8LNsfNzYjqVi2tl8sz/PixjYf8Yqad+skViU+grVK/QuF23qafagVsM3LmvKwXZutHHMb198zNtX9+mh5/mdjlLc/mcTeFd5TjFjQ+E89DEB8rGZGoRYylIjK0t6THeO3QpqadxQqfLn4CyPlibxXJuhro9Pf7Dx+Mp+/1hMQDKqy5fJex4SdaKM7zQ4/fQdi6V7qA2vr6iMnRHFzjRK/DVoGWKn9BzoPWdSz+EohBwi0xIe2tjBj/XV334nimBzhxmGw/kuuTXPtvf/FbJxeG5wfaOWE6+NpW+YjD0PCXp+W4qyxXPrJ6kAgYhFA1vaJeiuu+ZUtjtaQZlFZb5Od/3twfMtDdSuWLz6CsGRnXnTZWX46GsFf2ST1cZBMPU9Q6p6fOc8/VgFf7YHw+rxn78n5hJ3re+YkPaV3TDeh9i7fKLpZEKyLqlKlsrNKt24CSXAbrJ4MuDobr+Sxd7etX9lOJJ+/mSfOu3/Uu7/a8OTa7wsOSKjWpfIQKHCiPh5ncRcRzbNq7Dz7wG+bCPKM6HKKNH9ZDaNftW6TeZw6hSuSICooRngW0K3nk0qp9CTJdPJJAgoAfFSEVxsZPQ7UoppUK6RfCe8P34dLb3aiIB7E9zikI30g/2SKW11jrqbOxcPgCE2cwj4vuS5B8Y+20m6TM+VckiZwSiIkVr4QlUIFLC0eoBH0uu2KD6CoOPfL5X5+06ggpxMx1TjNvBdxImIZLtoFQIDoW78YgTxefmQKiNSe8tXit0aAh5R1zyKLSGgfx297zXuHamW0A20xL4vnRYaYRNL+tNYZj4JentsawHGuJ45dPuCRJ3IJgQOkmUmGZy1cWlzI9ZdiQQhhiDh4jg+UyL/TYBPMttlvFLWh5Ms2Ag7pOC84VpfDhQsXXi0rAGfcXFkSvE9zBfrZY2hDBnif/zIFH76FSyJd9xo2ZxP4qMBGUGQ616PX1K8VqhnHroNb+d5fk3sjzNB4OOmc2I/x+mu7uq3NFwxOvUXhjxlVIJYzfpeYrxZrUocmKiQPypAsMPEx80xHHmkS76uyFMumfohugwp5/J54POlkkyhqx/4Nj0Ix0VtbV4DTqdHHakLJz0C2XGGV8IZvrYXuXkio2rryj3sdGGS+iaPGtVZm7zEuqZ115ktRthhCjsDdcVkyoQerFrvbZfjzK5QoX4hPF2xHXdvzaxkw+/l6c8I1M9DPf8gxjj+3nfIEbc2OdFhNvMJmsX4P+sIi80PCAoGvMed5pkqLkerpBrArkFiAmDblyLgplbgAiiKIr3qmIIfN/3eeThGcx1VsqQNjfQEDBTyGsujyolD/UgURtjQIx3W19ecNakr7hIPCjPp+FUE+scqOVWAGPuNW2W8tVvzUwn3NCUWsqXNGKL79R1W674w6J0OsrPG2meDcRMdcgthika3TtjDzOF+L7lT0GoWfNRLUpYulqFbpOVSmK0mUIOzBRdtDwEzjp0sGvNY7sc0gV31sHUO+/Pyim52gsZv6kB3xhvv06HWvYMgemnKYSRkpm4VnDJNEAe6ce5gXeEw9mw6FtfcbH8zHrIhVOVTk0EM5Ejbrj3fhR54GPxFyNbU1cqOqJ2oYjAK8DYr3xUHvjYAx9L723jgV3UIjfjOhT7hFVO82XHnt/GfuVjD6R/H/2VnB5ubO5XejwKHvgY5ofHrsJkLkTDU/FGIvYDKh6hk7oMrUWL9/bIowfMDx+7qve4F3zzyt/6k8RjJ0ZQdp4PmFPGcuc5VivqA0YWT5t0jIqRC/NGeOBjD3zM/MrHzK8snrKELBZtBsodx3bcX1SJB8wpUywSjf1Kz/se+BjoPQX3FCP1ksaG9DObdYcqS6CBV/aWJUinQUXonL6sOJfSIirQGYfqbX94tXXpjG30pBe3dOU7CH71XuuLxP0i7bYrtajtjKzQ5V8X1AO/VGTAEVNq40GHGJZzy8Gnf6k9IjEn35hyQxToHGc2aMS5JdU++UY7l+fbY9IAAZZP2BffWLwtOLNHipuxpHmb431wpD5x+BgHjx7m2MHPzp/90qF+lQIXR65IqTFFm017CxlA+Ui1j50cU5AnyH2tiithqb6CnHD47NsqnxNZ+aPUHfYPRoIgpjgZMLM5c1pn9XO65CSXOwr7lklZU/GKRCt3+UMEpLQpU9bYXnZqJCK516IiatiNLZ6XLhYCptJeuQtyX6vokqLwUk9sCn3FpUDlYHf98KAGJIfou/LfvbbpRQf3p/qWtrznDc0GuvezC8MArAnDi0+4GfQVlwJ9xNAu7er5bPYNpEbvZCIZi1dq7uyLzr9hcNegN5Zr+Aa5rwc2g77ikqA6/7J0rchPls8MSNIoYyINuN+4xBiYcVgiHZS+sr5Euk2ir7jokMrL8WpyhY0BiYSlMaeHxYgb+gOK+qGCjnGeqYHWhOqvbHVsFvuKi4zy5VhrnfHPS+WK68EOvzeoXFE8s3bZFKxOFtNadVrudGEoXmSMMT17vKLnDmqtY6OPTe9q2DT2FRcb1XdQZV29gx8+qFxRbPfTEXp9PTA0A7cEGtawgyrp+qWvrP8hsxnsKy42qrOSy9aKDn74oHJFWR8adqe9OBjYZqOkuqWvbHC5YiPbV1xkSOX1uFSu6FwrBixNWR/asHJFGUolpQFR/ZWtipG+ogBHV08So1Su6FwrBizMXYVXhmerfFFRIikNjsqvbFWM9BW9YQ5XtjK7CHJFcR/KyRV97M/68SBQdvGu6vlYz9aDe0go0VcUi1idPi1Ww+bUV3RWMbg2c20hFeuvtUPHGw8kkNhsT4JOitcUhWivFRKQc3+seZhADhzJEjwTs6eUIlKqg/zRUpFK/LeqyLqm0fwUZJXOVc9wdS02g43Pw7SO6KnhVnae2oFO7knQfoBYBg4xsyNn3Cipfy0MfCbzbK21jv2ppQlnc+XseN4R8giCbn26UkRRZ8Pnz6nyjm0L6bugTMXoOsBa9RUX0c9sDubZCcv/lyxffWTGAxAfv9G8UFWyeu9L9rfo7/peGqFZfM5ZbFcz5hYGhFRtzqxP0PH0lTl8uCf9KR1AOjIhLNodxbkmdKZS766Ge+9rV1YcezrJ1x0s/qGRT36qkEzhfWch14WW7crLSij4ngHERyYyAiBiOgj3xy+ko8cAtfPZhU/eJ3N2luZ5ZX3hb5//5H1pws6nh2/C657MtIrc8Nb7c8NpJf/K3mB/MyVe+C7g9eNC7Z4jPfQVlYdFrTp+pPbTt/zIT/3oDx+efdBxCiwQK+Mnc6V4SWbf7TiO48y+W2Znq+eSX7uaIk5WsnfnyuicKmmDtz2XpnK6nu48925p5/RcK/HmrVTUitRJESeFnGy7AlUR2pHkooiIPOuISJpNvu5IkjJ+3gXovVZESksuz2bu+pxIUnRnVp7ruNfyN9DpemCpnacjzqzjWO0239G86SWn6+lnRWZn4wo6Ii9apY44mWvQM7n7QunoSk4vxE1Y1hE6cJ/z4IOz983OPjj70X90qHZbH528VqvVCrn1PbAm+4ouPPjFFokZZYhjaHxmpiGJC99gtZsBvADTMHb/0ZH4pJF/O/Jo1Ep8lWdrhZGgc8rzzQfuONg2ekrkCqUjBK3s3ZACVEwE165idsqID3gSgDG+ZaNq1Z3QedsfXp0QU32mH5kqmi21o3g23Y0EeH7D5gSHjuFaZhspg74dWlhd5edC3OgIJ3Kb0m762J+0kQMf+Alje4sV0yJyoqScro6ILRB9Op+OtjdwFiLcEGW/jIbQ2vdnjgJCb5Zr83vggsoHMnXtB0xQHAK5Nwa2r7iIfmY7ISbpGC5ArjtOz1SIRXfbHQch76zVMH08sWH1fM/3kh2Uj2BKxNPMFk98poNOE+tppttGb8/EwopWdmihGHcBOh57KnQgNZD1e+hss7prl2dOZj97Qcl7jxyIBxoeEkCnR5BHGsnOO2681GDjI26+lZwoMqEbF9YIv5F4j5WubbtBMGkHMaFjiPfrni8HJPd0F8P0HQe7iqxwe9iLyDOoEODk1OxTk8WOPeyiBHGBKiPnZ3bi0fjHja+vMJZoFYJkbu2PTUOR6WUOMwc9Adqm2gDHs9Banm/FzmogxRNAW19hpo89gp9rfG+K6ePtAZvIFYpuJzUPgqMSM0EXeSjzLj6FQexhbtVd2e/a86dKjlpcLHOdbmKFoZHO88bysBjym2F+6lCuV3PRWiuFGD5niMvpNTwz3WmOXktrKW3eiz/9aMcLChGOdw8KtBM6KnfKFQuP6W2zmD76esWonWnaNegrLmL8ijzuBnDSeDyYhsQ2X55/t0eFphI8I+YWbBnaNrA3eJl41gj8RslRpmW3PUMDPzd5iXi2+/FsrXBii+5cOV3LSbe585OYuCbi4TeIj9cgpvto2jEyss4uiCfxprDnds+Q7A/Fi7/k5zTfGjTP1JIM3DD2sW/XN1mcNMqJuP2j8XwkCF7aa7NqqaSBlQvXpU/n6Xvg+lyuN+P38kWuXAUPfim//LrJGVqPWha89obliKsa/GOW3fbm0Vc8CFbHsBDPy6WyVGJTI36HyvgpPNPee7anU1lllmnrKxoNY/Kv0BjbL3hbX6F6HBV1vuOkJvSa5trOfSzHuV5ZjNZVkHPdf7Q93bld5VI6tWfUwOdy7p7zuDkLgQBwe2ycl6TMK3IO9eYj6p6TkbXKSsUKm873sgo2p74iwVrdDlczyDUGbi653qHbLntPg/KgeiCt+zPDicydw52lSr7cZFTmHjc/6XwuV8680n9IrrXL0FcrvabtK6pT1EpSXgT7ijLkgzZUf/dlKftYccrc4+b7+u25XLvWio2F17J9RfUpqiTlRbDbLkNhgMZVUNLzpQ9CUR9rRe4RF32t6Aub2r6if4/i+b5wqOK9XmnKftaK0gf2tb1K6/5MrkproZVngkW5zUa+lH2sFfYXs8HXCtj49hUiBEHnmh9i+zD1k3QFSM28Aj9N5fvwoY5+eAC/hwpQBD6Uc6YaRVGLqXRAlq0VEhc9/hzLFQqUDkO3yxdLFIWJ5jsEJDni9c0Bv8tXeURcecI0bHAbq8taxg/MLNfnfxPSpwRgVFQY0SsKVRYhEp4EH2OMb5czOdX4KlEWzT7kw5K+hQCfD+fy/BCNwG75tjftKXJnJ5jUQekqELn2V21SVn/WhZvDvsIXkdl8tYxJ+TEhRo5Ml2eQnH4Ywc+ax6Nz4jseNHr4P/aNL7mUCgeJ0p66ulzhxY/3weCFGrTC6aayGWMdTKUH/IbgDhq2L6z4eqgBlbiQabdMJblCaEijY+9znfGduA8F03IUXXjoHhpC1XaqLHE7itddTqHtqsp1s35pwBe5viOGqjh20cMk+/AjHfNBnKgwOED7kMt8euYnxPcHXDs3g32F+A3/tnwUZkOt5iTngw6Yu5+u4ELNGKasBaVzAhagRzxf43We/2mnBSZVdZTJFWKMoZH4YmsQoXxXgcJVYQeL1FCr6bhK2sF5KNnQCHK3N5srlcFx4hN7je47PjhgPN/3Ozjg36Bx9ZQBaDxtPlh8r6LmOEk5cRwSL87GdJXTGCytuDW/m4Y3ZZ6yDcwRzNVTae0waQRX7XzGIe/J7pa43gUVs6aNe8Gv6rO7C2uzr7g4PChDIE8737V7hrNiJzjTQWcrwY/PpHmCRI2/si6F4jeunek+1/a7UiKeL9kLL/Yzi5lVkaXVE0k6h46MG/KyXWxnxbbHXzn8yUTV7PmBmFz9avmU2PHqq82NvkwFQSvXhAvPWdwJZ3/xi3V1JNbjm2Ji1V13ObkZCDM9qfNsepNgiHJPP5+7Ua2k+Zv9z3S83O0l7lLlWftLNFXodX1VeEdo86CWNiwPqsH2y+zt5PLzNRMl3Bkxl7+heU2VFjD15f9wdZC+RWHhq3aHnp41wbHpHm7Bu1LWr7SFgmKf5OBe2Urr7H1HTNKdtEJCw+vslEvP/7sPZnGyzfSXDyRFDqQRNBa3WZVfft4xtyWDO+V79wXBBMLLud92tL3Aej5/VnivZmGPj9z2gS984Asz048YJ7gtLkd3Oc3TNTLygKve9uO/lj3hx3/t+9amQcyORvs+I83nsyr95xeiy99g5wk5D6I5BFdaC6f7cl98kDzWFm/74thXCARTqZo/xlKDoCHHY8MFuaBrFXcSQjLPmoCpoJFrtcBMzR68p6sdxffw8ylfAG82rbwqWStEaIehr0HkRGHqKrmWJywsNeSXM11tMMPxtMANH3KVX2oQHE/ZE37Db1gTQqVpx3Ds4Zkcw0LMGYco7cEOSke9b0Xpm00DeJqnpcGU+DMzsWDRXU5U5LRlP3f2SGZppI4ceaEdesAgp7QTte/8J+nwEQMs5vIkcqKwwNZFJB8ZIM1hAKzJvuLiyBXG6yIBX4c0JNlDirmu4vhU7Ms4IR7imRw1pDElU/b+KZUOPYyXP8Ew1E4qkqOeMrnC3EU9jLROxUpXuQ6gtes4HSye6wBJHiMeDRomkUY67QCvI2iYhD3hY3rJQqvAu+fp/JmMASKX9tmScgoOsjSHUma3QTCNX/Q8A73KGQcII66vbaURoRDb+7KRmPIU38X/nsp+RpAcPU0pXCgyADP7yE7qVcxlG1Ta3hz6ik4mUP4A5SlVbP2Qh3W63+icWUV6H+2aLnqREFnPKzuDehDcXiO2m+Fze644DcvQtrvubRJuoyG5Y7OqvUAavaqaFtQpm2UsLYQB68izs5yx2Wo7y+wpbo8BF6a/6VyewFO2IYZG4xS9a3mms9T98GS7sNH1Fd3nRR3Ko8r6r33tvtDVK/ryXWe1/3BoHHaNjKGkJDahSKqaqXei9K7ShXcwjdsaXERXfrllRjD9YXPoK7pQRjQoQ/Ug9JVRmQdVzmWsXqPbS0bu8JmCXdho7Iw2ZGg0s82gr+iBMqJBGQZlDZWgHx5UCarXaNC6Dwkbkp0RY2hz3ib1B3W7tYPuR6J6ZkDxqxvtSX84lL/bqVqTslVlaNVL0GNpu7hrRT8VGh6nfjPYV/So7OfaDoRiG2TLk1Jm2ROfp1jEAo2RnKY0r/i2EBSa0iTQUdHZZQfCkDA9Fkmjb9nh19s16vRulJTE94N83/h5/MzA3/d9k7KPfAK/uMh61XUyjZVsjwQValIvVQkO9SyndJVTKSIVRXEtw7bOQYVhr7ZLfovdZCVNH/hBzzzjVxyFXJfrG3ca8nvUjNkVBFlc+x4V78ZmsK8w/gG4OdednpRpCfzkTDqmjCmllApxozDnYswQ0ow908d+yQJZHQEY/JI+hooMySmmKc6Tu8BLjifDUBGGYZHY+aT4/HbQbUUY19CqPAaMk3NckKT89DTGTplDxImsnPZd7V9S5VgUhiFhPJs0I9XJxfs5PM9PminI+pvPNCB2OYloujHVQ8WHTPHvrgfcRf7p7ke8eNIIweAT/yzTHXUPI5q48Qs2rrod384l974MMB0Xc9oDDvSz7mwC+wrhEfhq/ifzyG1m2s9YkfYRnH0UqnQtpFlPf4nM0aCKBa9H2YjAQDNjs0WmxNfOZzB+4s3DIcQta7Dp4IO931unW2Fhdir9ySNIKu+/b3qm7EQqMlJYToPgZhQWJzbXBhDVNN1KMz934hk7XeDpY/mn69CYa7Kx5tBeIHxj+EzH88NfP5ldFxHf930/oHFHvu4az2QFrYX65+0Xn3O5Gxc5YQDMHBGCmT6cM69NX3GReFCx8rQDx3nE+B74RgQfN3Moc5X9FlWI95301bihHI4qnmEHRgq1Y4L3HSeKEsc7yxR7Grqba04mTjIil6tORoUuCOEOevi3E/ACujb4WRjewEjinMM70DNlCicSkzqmSnRk1lPMTW3+nhPRTP3yuJER7GGh9C346cTitfORII6saqVEzGzS07UbkYU9jmKNs13TW3DDticRMSb2FjTte7fmaqTwP/KbYfrZagjoMAtRGgTje4Dn32q8A3cEfWovNni8bQhozO2wf1ietHPIB4ROqQuK2KlXvsSVnzlbbAD/4utzX53i2jyfc/lI1O0cIMWFrSXshFwFw3pgLY5+NiTFdKbsQFndX9kbtd1DdHhhinKj4vTeYh7FUn6D3BJw0cTRzXOXnn+TnceZ3DlMczx5Qq8atYREux3hXNiau7ZibxJO53mEs8nbrNLz1hhv+6LxoODCafunxbORZNw4eftp4IavAzf8iZgJiz2mnOYpucFygF3LAqyX/8EcXR7PUqycJpdnYeQEY05bPciIVxwm3j3bvVWChFdx4TQ3fD39Oxt4fjJHGkHOtAlFYrhwup0w/2eXM41g335KHVfHi5+OXHPaiJH0NrPfHshR82zvcgqGRfvpfzJRi1IueYizfF6SSnDDn0jtjJWFiU4bfihr0Qtns9Wss0Z/MlGbajszVGNniXsBADYNSkfNs1gTgd7bzwGVd6SXvmIdOLNr8AdlpCHkJ92Tb7S/Pb8XkL2AvM5wyuYO0LosvpLmVfmpzzUKBZA3UTXPZm7ylLuOFDpHHisry/NXIXvTP4SU5SEY2dmRsp0w/7d63d2kybTZKwbS27gwaaea6HVrr6e/7uV49VGAC63LsizldSa/AvzNbyFkLdrxcjvynM1IjKqQPUsnWUq9paTU3dgU/qC6/RzVUJar+5rlGSjosWVqn1E8+7aqz9SUuhAySc5BeZ7vxvZAP/ur/XMSlCKiFrdB/IfJUaTbT1dRxEfE0PuP+7psYnPISEsu+581kjxROkIfaFep3u6dURE1+4mmZqXTiVc4Ey8AHX77H8M+U7O25T3ztJ9eOC/nB4W+oy83aZtBX9ET1gF4P7f1o3JbZc01ELdfiUp1UGZKH8g//YbiBeHOykr4E2X6sEKrad05c9+c+9aPKFn8Sm8uvFKO/ggBm0FfMUwM2SNTLBQWX78I7Iz800v4GKbyjCDVQ2Vm0KA7rF7XgxsyaJ59Tk+bQF8xTKyDR6aykXYR1or80+8qTlhd3Nw3KHEkH6lsPbghg+bZ3/S0SewrhoZBI9OVoWQHdRHWio4dVHHCPiKID0YoUh3R7jrm9aGwlC7SWgGbwb5iaBiip9cM+4v3wbfbthCVM+xmSXUj427l6U0lvab6tsiUyRVx7IouKIXmwdxPnwebPz8U5uLga0U/OrxNal8xMNbD02vJruxzwyaxrvL0kjjWfYSjHkSu6IHNK1dsUvuKgbEOckWZscv6yxX5p5fFsa7uPXZguSKPzStXbFL7ioHxqpQrrB1XcRzrcu+xOQwoV3Ri88oVm1ZfMSDWR64oxO3D6V8JelDVO59+Q3HK6gtAqVxRHR3z+qWVK/qq0UhfsUaY9ZArrKGrV3Oa+WeZRKsdp2wurWhxQ7lcUT2Kjljk/9xNawjJxKHOzCqizNi9B9akr7hkcfEK4XsdL9+eJA1XV24c9Vy1dGKkVvyevjlOMD2TeQTraC/7q8591tFf8k403P2fv/WWsT972d5+xNQFL328Xtn3dwHYc/pf/No/aac0bca4AJ+4/6FHGvzlW3VtlsjIX77V7X5uin1/kGQeBwPuIEaHmdGEzv3qdowYYyB0FRpF6Op8y+df0s3Ybuhabc45kOep/Ny97WfomIRcCZ/ra63yjlg8qA1qX9EX/EZ4wf7efNH+JluqTZg/9CfRmaDEbqKN4DYWiifzJUFmki7gw4KTHQQZMe8MLJ6QXrYOiYz8JYSO+sjWh//oe1996JfvDJJI1QDH4PQe/GMHjx0EHr2V//zl2x657ZHbHtnyfx76HsHRtpwYwwP/2MGZj3/wMNE7VqKnxq93VIj5H+8sLLXlDXH6yEEW7QY1Y3QEZAZiazs4azf279QJvTTCQejUXkirJ0bMP8+9pDAXlH4sGXWxHWouT7jAD/33lPn7t366mIPcgds/Wi2dhYHtK6gesP5HfqT207f8yE/96A8fnn3QcQosOivjRaKMHah4USTO0Zl1Zmcll/v38gWu/ghntlIpnWdLkz33rDgJZmdn89cWbdvLxfw1Ddz7k0mtOp7g2Hiw/bOI4zizyc+O82A7kTiO48ymd353Dv689ecUaEUU+p/Gj3QcZ9Z59p/lH++hItV9r5rKuY6Lf4tie3qloqmOB30vl+eZ/MXE2JsootWR51mxX+/JwigbnVXaJ330uftmH3xw9r7Z2QdnP/qPDtVur97JY1wc+4p+4HtIzoDyd4naBpdaf+/qKochRnzP9/wqcTfNVJCLzd15+ba2CZjni5/G4SVgKh9XhdnUVI5P33vfr6Lu/yUxvHn+T/V//WH+a3EBfjuJs8w3vnPNf+WKJ5KV/2jHUewP88Tl/4IfHnszn7javLynFr21+OXJnZ9M28j7ePTBv2+1p994anfT7V4rYDZCujY0EVpptMIHJ3K10qgQN3Sc+C34gAdCZBLriKnZtmmWq6ckt0kKHcNnbo3byZeGUZWFjP7Wis1gX1EdhngnbP1yxy96/lUZEV8gKO7CkAU69/yK1GOJR09vzakPj0zNmtTnPj5tG+8Gt/9SvvDie74H+L/t/9YC/+yXMNcs/u70Ox+8C76RJnrp9f/Tl4DbHrnixSt4KvHB+tRzb16cfM54F95rF6RVS/Yer3/p9RDx89/4QR782B/91HuNXH6ldvJc7hxSuQJ877Dcdod1yZNbCmiz3fllyRTghsoNY5N6E1r7QfBpAJKEzz4ZoU26L1L+Rx71O552z8MzMVvZ9xumILR4N/rUV6zJvmLDyRWe3209eWv6ArRi3x9Wi0fu4x2I4wCsntL3Aq8w0wbXNvx48fKhPSCl4Tc+/EuZJS0IYlJB+juMPfDP/xlcfv7szVvVL6Ca7wEwzO+Y3zH/OtD/jejyiHdHnAb2nJ58Zc8rk6/sCcdP7/mb6RNUHK+oWY/37JGqHajzCws/5vz91/33a148gxv2nPIhJ1cYTPuwAMA8dlmtx4BSoRsidgj0EDfMaufqqcTdhwbhOx0CvCEzE9Kg6qHSgAodfrPDskgwqZzmGaTyeVTfa8VmiF9RGV7sh9/+6Td/3dXxjKJ55vlKIjQeHD9+d5UHNhA8Gr1rZgRmGo1cyviL5W4jfbGN1AZbfvQ7J2t37Lz7ylecOkJzYmnivAYnOgE037P8nidNyLm49WuyMvbiJIvzqMUXJ+bVi/8FMGwnpnhc/+T1T8YKDfW193ztPTXcOs3FWbj8n//z4jql+gojnnh0TjQ6wul689rVjgrtidsNcVAhGrRCnUzsL1T8a7KotXPObOfcLICTdpVD5FohCTVQ1NZl0P2vFWuIX7EB9RWSxaETkfYprYqlvn1U07H244jZGFNEMZLY1b6dMvno+UiHXIEfG54KX5Hf+rPGPd8570wqBSy1zmsFkfMuoP41/tik9bpJhDEmNZNzislJmZubBGOEc+fOYUB/TT8dLxVKv4f3fC0u1OSPXWG48x630H4o01cYgC7pynV7CukKJ+ezy0WppLNrrEh7yc3tJha5hfYMmzveVap7AA40tT7ZX/LXlH2FXg/zioFgvB4shFS/8D7/l78UeM82JwVoQi3ePacelcbOgbCDlj6GMXpu7vzc3OLc3AtzL7B17rwaG6sppbZhiIwxUf3EiRMnThxXfI33xNmJc35n8KaxLtu5DHkeVB9c3wGvmRLd4zowdFbHa82+YiOhYFUXeB+f4NSPxYMiNvtXwIkTNJtNFDvm5+e//529sHVuvnV+cevi4uLk4uLk4uTiy4vMzc2BZuHcAkKiCtjPfngPNaAOZktz0pOtxXvyIfGgquMi+K7tv0qvIfuKDQTTtVakF/jKJ7Y30pm8CS205sSJeIioeeYRuar+F1ww8DKTL9cn663JemuyNTlZB5jXaAXnTi0mGZzYf0JraMV64pbhd75j7nwrFBwnDYkHVR0Xwc95X4yP14B9he1JcB3MKzpQtfX9wrXCyFeO6nOMO3FerVYrq4K77JqVyXkwtbmtdVoXYJLW5ESrNtGamGhNtFoTLYALFwTA3a6S8pzYfwKtoUUTFJNv+ra0hL8sKNuQ7CuqY6PFxNik9hV3kU1zSgOS+uX2fd/3847GpwiTGHahPgGpz2YJ8owpCYLgWoIqHDqR2diDZIb204JKkc+DAJHbc76KCRq+bwSE9x1WECLQbLYAFJyApmlKKEqBcCFaVOwAaq1aa4nW0sTSEktMLLHIIuyoQQinUBjTBE7ggE4oTcIPYqIf453/Iz2bVVHbeXtI50GDrffFEPbQnSl0GBaK7zZ0GHZNHdZaoVAq1W2HTR32WM3Su4MSZ9M2qOo/PsMmta+4IXsxic/sJFRcL220nzRdXnAzPgeO5Hq2NLhjdrrK04OggTfdPXwC36+8f/UwHWtFI/ASt0g+Gpg0Ai1qoDUn9kPsYvLcuTFgO8DL1GottwWYiZgzsAR1JmF+HjUJ7qk46yadVLsX4f+AbLUIPdx2/2vPDD3jGbg9PKtrrXAd7NjyMeKOaf8AdLr9bK8VKlQ6TBz7K+rKaRaKP36DXrrDbiigv2iqm9S+4hAOjgNpLFs/CacaeODlhobBcZyUaY1IGnFUPGbuyYVMnZqdPoitxy2CmCljzPHuZm40Gmaq0rjwvAC+YfUhBF+M56U8iPthMc4o6cgngNAIF1CLY0bOwvLL9Va41AoBI4tZ6MYWwM6d86BUuBcFbjPJQGkmiE9qE9XRW+PMlTurtY6bSTtIVLoR7K3aDl2iHjTzrrhn2nG6krXXCu0SuU76arWm5hadQjUCBKdrGPaA4yCmV3CQIqzNvuKS8aAibXjLX6W6prfjBYlyzpfGrDzUNjszjn7HM/CWv45TtkzKkvI9aczmJhD58UcwB+9Z/eFGvmseuhMjD92Z/4OH7jRTlSrgGyTHfGsKNjfk4/czaaTJ1qVYqth/gtg9LErvWRKjt37rh56nFrohsWdBMHJhC1BrQW0OWue3KPdcyF7dlOQkSyvO1+LPbzdfzikpH/jdb5mklWBl7NmjRZZ7xkly6oAbhu/ggX/71xXqfu/v/ZW8PfeLLVeENN/5p/9HnJGBfX9e5E86QCJdxRj9b/yV0OxP3l5TvO0+fJJz0xp8kndh1vm3d2L48hdmZr7wiBNNJVYU4nuYMzv4y9969NZHb3301ke/I8v/1/+MgYf+0x0PPwLcNhNHYRbfw5zeaefZ3BKY6ZlGhaX2e69/xzNwjc9fvtX+876DMLenQqRf8fFmDV/+wh0Pp3+PiDHgmdiq4bOfNq9vCjRb8VbxBNDEwCJqktO4vHD1K7V40q61lmt1YLHWmlycFKDW2nF+6/ktYgjd7WjEDeu861v7QW1dgjqm9aUfm/3//EX0l29NVcpn52Z+gi9/4Y6HZ2Z+4rbfu8K55juFta83pdu+QoWA88KXTv+ndpXuePiOh2dmvvCBL3zAqudMrKi0Jw8x/+LeKHVyq0Jn6SWBL38hTvl7/2DC1m2f3Z25ZTDiixhuyz+wx9/pO3n0zAd77q574xP3H7F8kt/6aOUbk/r04an/cT6wPDekUSGYoBH7DBcDwoGZRnLhwPHTOfFlaYuxfYsHnp/EJhffy6dc3DJLw68SufyFK1qFFT+7O8caKkgVII0DT+eqdODpa2e82EbI57PqU69vIk0mzqN3zJ/Yf4ImRgyLKFiaaM3vmJtcJAIcaNab9Sb1xVprslkXEjuhHfM70Gw3ooV6s85+UFpRg7pp/fOPzL6xzv94Z9wXlT6zNy2rGJ59Q1kA86hNQW7/qEKXZu0nv9QdgKNXEwSesX4X864/TUeFInQWtwQZLSdoXJjsPSpMQJUZLHmEFdFgdcSj4n7fyGfnz37p1rN98qAulVxhoIE0ko8YkwS1Ecwd+XMJjAkaQpAEqwo8GokI0iO2/JTxvWpEj1rUa/OoVISRKuxDr2GYyS3+5rgcb5icY2UBzsOOeYhVFYY5lEYmW+xYvmxpHMdZcRgfV4s0d9Dc0tqyCK4xRtdqtdr5nfOa8JSAMc06nMg2Pk3h7TAVd8P4BEwMFkdG2heyNOlnXN3jDEo7UOPB7mmgR3OKNEy+P6dyhVKELtdL2oODoFEopglINatbEfFpkKcAlWKT6isM+fZuZMtBt1zgAV6MmMtv/W7juiyYVgUUsiVuMZXykEbns9ocKb8tsLW2btXzsVTRRMCFkEXD/Ivn0Oek1WrJ4oUzzXpLzY+rV+paWuOLIuPSCpswt0PhuqdOZQI36K20APMNMFvICc5+tljIQ5SIjArl9JaAq0qZeZ/qkJMr3FC1bay9sraMT1UqGBEBXn+67U2qryhG75m6KFaqjeH4bqqqpi17Sx4aaUGTrefn2HGCEzFTg0WFniRcml9qhd++MLbw/HL0rD6jo+V6U+mW23xxPHr5wsLCqefOLJyfH2/Nt5QK9+7VKu79J0DNxQ//QYwUuhdf1UfO0LlJuUbTH6541/op4DepvqIPVG674fhuGoKa1vPJJtOtML//BDSbLhCCmpctgJxbiZ47t+fUubFo7Py5OXbAS2OvbH/x3NnmK+fmzcK8rr+wSE3jnjqlNCY5kE13Pt9AbrxA4ZKXzRyqYB81ZHQ02sWmYXVhk+orquP6ykLWcHw3HRpCLu8DqNEEDDtOwLubEBoWJzWaxZWlhrNzeemCiSKazQuOWdYX5pYv1E7inF9Wi/XzmqULZ1/QNeYVanLvKaVwacYnWZpWC34wmfoKVouL3S3zC2z1V7ZeeNX7g6pOrB+OT9jPD+mVSguOTwDz7wXquKBCrVA7QvizV569cndrrMau+thlc1tqzK2cdnbX1fkbxtkVqcnJ8d1XbkW13HlgcS9gO9Go/Ve+gblxS9FKYYfo1VQ1jV6L+7n8WtGnLcR6YDPYV0gQXLuaWJUmBWzeAb+Bnx5wi4iQBZ0OEJOPbA/4/iqPSR4VhToClFJRlBF3FKHHYwOeOksgaUR3fNT9AAfOnxf4by5fa7qhgUm0Yp6w/jf27GlFe15nnLm90csOk6+rnb8MvefKrX+Gxtm+tPS6ReOwMgHzAounNBi3mfr+bP0wB+B/uQDvzMbFzcwcSNrQN3dCGLdeqAjDqJvH0aWxVlGkS2hQEkhQcgJUnTN7M585IIl86Pu+yYmMZP8xxsfPDhCqSJU5bAb7CvGR46st6ml/8nJBn/PSgt9OKYF0n8zOyHQlq+67wLRINtkuKStOw0ny24/yMWz/4uML037Cg7rfN5ynxdY5ePc3m66LQS1qFPM7t7aa3/kbTg2mdkW7W6+XrU797M7tK/OtLfPR3/ybbIt27dmpL3OieF02wB6AsG7YTzKnT8AKCggJwzAMeYx7Z9pVNxAppRReM8St0pO0l9rV9UTgHTjGgcK2rSpXKL7K3TNHJAiCIPBzPhGypyc9oRHge/5atoIb3r7Ca/jBgYpuCLgu94N9suTRPnxtTHUz+X4i1Xusgs9guCbZk8dmxQmbbXD4096MkadTm2QfYStbYScnvkk9eZZSsJPzExN856f3bbt8/Oecf9ja/ZZ301z+/qnzzQvnL/Ddv95z4a0X/r5jroi231FfCl0EQWooMMIJTqCw/OiELq7rui4/KH5SdwMPSSqH+2KMrlXZHJ2slwWjNAceORjMFGqXO9aKwmGoAeFgSpCmce2xYj3pGrAZ9BXG843cdodfSRHg86Fc97TWCuMHvpAsqMG1vVu/osZCTnqu1lrrUDVdEzeExu0mSVeEN2P+ZzEBBvA5Cj4tzjNn2P9uCN1m5gpkzg3ZufSlb7+R7/zLd/7Lf/jC8/+vs+MtIshlyFh9x0/zgvvb/6D1/M9e8/+CC3NiOCVzKBM22X9iPxp+GOAfoLMzqJAPGflsXHXxcvFfhKinxrIDKkwVqr0AjxjPFK8BFQ/udISInymfpuGOg11MgviJgpn2goHfxpr0FRfNH1Qgx5++e/VkeCC/ldtB2S5PGuJn9JspaXBLLqXDVEXCcUQNZtO7ahGZVsuhnG5aUvLZyDPxBOf5h/HYW2sBgvtNmtn2X5ij5S7x5uULL9ded/m3t3xS1bd9vwnbFurnwsu/e/nc5+cuH9e/w+t/96+3OIYQELP31N7FSaWFEwkjvTkBR7/brr3DP/ylhh97zzASO+JILgBRBbeV2qXepGi5MA1IuAg9cehPV30AgHKJTEbzaEiDWxu51m5/MQ0Jpqb64cna2Az+oASmn36hLPq5DVPPBU235QpBzrRNB4R/81/slBfOGpAqbBdzWuC69KhETD1MeUGRO/nOyq2Xg/7tzxIks+mxg0eB8zvOs8MQ8u5vmhASYXbnHItwWre0en5lx/zli/NjMr5sFuqywNnLF91Ft/nyblrPxWSoWgtgcc+pyXPblcRkKGjVlt4i4TXmKXOEj1z31HVPGVmM2wcQH3PNk0ntrn8SiYrdHuRRUztL9sg/WMLOq6yviJpn7Iv6MrGmsWv/yL62dOW1d/QT9cvGZvAHZcTzG5M7KqfPufrOuccykhP4/2bOddZ33wgovXP1BzQnDMje5JuEOnNmROhQIYNeed5rSN1tHgRgK+j5HZx49zebrttEhSCwUKPepFY7te0sY/PMwwogyDLbQha2rTDPmd01xlYinMV6rQVyQU+iFvV2SNaKusPH8WWPwAOyR/YAQsLYE89vsJfL4mJdZuBCj+L2gmJrydWwiBFO11pRQg/Pz41N7NX9P1xmL/3zHC/NqQybxh9UVMUWsYfy1V4rDLwty08pDuU2vzWqDvMoo2GJwKx1Vu+6ql9ryAQtIx3vsNUuTnrKZaAVb3Sb2xaAsTStYXnbNly2AbD7DGdWxogn3TnMJLH+A+AEmlqTv7o/XZkMJq5HQpc0NAyWRDAc1zcKXZJPZUKAQ86qN79jMznP5jdiZqqcz/TEZtBX9IWOcdHBbsqidblh98uozmeQHp8AS4BdO2qgdwA0cV04BcgcNahFNOvs4oqFhbGxMZaXlxFYWFhYWWAF2M1udrdWVhwMrRoICtEo1LvjgK+tOj/wcd6X7zMWszvHRb0Yeu7K+opSykm+pGvxG7IZ9BVrQge7qR0vy4WvDv+NDyfA2FFIJsJ5ADdsMjdJTCVnyThRvdli118bs0C4DNAywPgyK4yNvW5BLQDUiepLtWRDp1VNo78ZrxU0+XeHyZ/prT/LoqSxh8ODygcUXzMhbcPrK9aAorUC4LfWoStUj5BVgmSi0g47ThAHUdkDINBaciJWImiy7S2YheY2AAfq6Tp8Fr0tlrWd5gQwB0iok662P35ph4/mzqAruw9dA0oeUVVfUY68v561rBWbQV+xJnSsFdY0pDecG6I2DvtQg4il90LsBhNYvAC1Gk40tgI0+WugvoAxRFHMdFpmZWVlZeHMGVpEERGwsBNBT6pkX+/EwVei+6s5Z784GMqL6AgovpY8N5N9RRV3Dl1UndvBnnwsN2mKx9ZQmPWEd/SzxOLAvP5vfAOXWKzYEgGtKGKlTo05tgmtZRAZ2zWZVHGMMcZWxnZTYwWcJVqtuTkjanExaYVvxTLxv+NwkVa0D76QhS5mVD8Yju/AfEDxryKlRktleNXbV3SsFSd6p9qY0MC7DG4T5lgk8Q4FK2PNmPe3DSeS+p7Ldiy+9QfE0IKV5ZWxlbFtC0DdIZoA2CmGyUm2o5qw/wSaFod9z1j2dxcD6y1XdBpLrUFofNXbV3TIFSWxsTcYvpb8K4R12MkksDNxorAC7BiDXULkbt+2ZW78m4S6BSxvg7GV1jagCc7SUq3GnMEY8yPn0PVEYVHLXvxFxLrLFfnb1iI0vurtK/JrRVls7A2Ew+C9B4BvkRldL8pc6j95DJhfgbNQv2ILV+ziHf4+MSstti2MsTI2vwCxjssBECYneXJ7HNz3BNk5/4YRLIYjV+R3UD+3lrxedfqKDuTXCll/98vDwNGsx74LCFHMwSQ752o1YGVsBdg9BmyD81dc8Z4PTry47bs4SpmFbayMrexYSXOqx6dRi+diIwsAJ4ugfVGXijIMRa5Y1dy8Ol5r+oohyRUXZTtu4ATfelf2MDNXa7EEYysAZwAWZEz4oei//vTK3PsPLc4DCytjK2Pzu9NYvUu0WrU50Yo9JIT3yF4rLpYtqq4sV7hlKTvl+VzKLnuZtWHD6yt8rzMwYKQi1c1wVqqL9vwNbFrl1SkrQYHucN3bIiQMeyhPo04WR7u9jTHtPFeB6nKNrSi49TDwNWQH+3nXn1JH13YCsjPuzStjkLE9ll2A363t/Ly6cwfCtmXGVsYWdi8AzWRdcOeU5nQtVku8C4AZAC/rSdcWFdpgij0cd9eoBLWSmeQJYt+z8TnWdaZwazdlH0SC5E7LGvmNwLDkir71FRfLz6z4jTB3oxD2CuumlQvveNKeJcIXBPm/70juEqI4VJtWIY77AvI7P5P83eEqwlhjloMKXWhqO8/rX5Cs0eV3/pc0z3Ko0HAhzcXIDX9i6mNFaY/GcsU8J971LZouijkWJ5nbOQfpWrEytrK8bds5VoD3PNI8845H9zoYYdvCtjFItNsAtVYLwj2nW1AP63zrXRE1M/2L0NZuyx3HlOkyToSHfwaIivwkqiaeblabk2/4+lLxRWlaL9fIyk6viNDvr2ix7DTCF8Q8/DO/8zO/cweAs7cPB6+lWFu87YvjZzaYfrrzjX33qginh9fHCIcze+xfvncldlBmFcYdWIVO5Gqsga1ZcWoRbhdpQ4Wuzuf5A3/dlWD1WqjQ0blhIOcnraItbhET8z8F/M9+iNYNwvwJ3vWnNKEmpybFyFyNJWAFlF5YGVsZW8DUr7wCvrM0ZiLmJhbjF7KNld20aowBE7R2zu3QTILE42S/Yssv/SJ2tFk5s7O45FHRliAy9YXJgmtdkE98sIBLLkEj/3pnUysYwbCY8zN7TWCP3vjl0pNoc2aPpJzZfleNTxw+ZvmZPdTvWcDFkSu8meDAEZGgjXjv0R1FQbmuImc8jBAplfoyilR7iYkIFZZqkMjp+f6TW+ynP0EUpXmqSPWKPNIN7SielaRwQTA7W/KusrWCd30LBCWnwMgcLXBYAfQCYytjK+NoOQ8vUqv9r+PvHCeKNXALC3vGFmqMOTjxCcr8BRYXswlZI9M+0pYrxERERD3QiqYKd0mREW0IKvh/CGZF/L9ftKoYc4DZNJ+AQEyR2wPFUyYwfpqSu1NDwV506Uumr7hI9hUcm+FgnrdDbyJe6IZO10NCkzrRdiIyAyHcsKP81/hEPRmvBsR+vAESx9xxrPUqPFkVOmASe2Ixq7rI/toNsmMe3vUtY+DU3lMICQtkbAWImeQLqOX3+lfw05+73d3/jDFpncaXxrbB8jhRsw5zuLhccC/siD32K8zMbVhyhUEwPXu/fOQ79lKbgxvC9TLtVzjLMj5eif/jO2YISLwTCEnAlt4ZiQSpV4qgccMXS5p+QNsK2CT2Fd49XuJRL4HcDY7quW9xu9ZLg0AYhiFR5GaOwVw3JMxl4Prg9Hz/tbz3WLmbbCZy3dAtdDaWg3aRh1Ije8PUKsqCZK3gW4a60ntPxR24lSwVoHbBygqgz154kX974M9aL9VXxEWBwB5qKMad+Gh2p9uKFha2Lss8TfZzQsM5D5PXV9SIHRvk4fymFApN2oUnzfFqvAqvuKfDw2Km4/Bt4ON7RYHmNZgGSTwqM7N+USbXpK+4SHbbBjzscO48+EVH9VgstKNCp1MGqYduPJtrN2y/YY2jwlwWCjc7FbJ+146KnMd223k++EUnmz9V6uajSj3u/GRsG42fKQusJ1kipsLfi0mCuTSpmb2nEHYutsIoPnxa2HZmbGwBwP3m3vM/E038//79i2PvfPmsYrzJtpUlQNcXGWdpYtvc4paF7Wc5u8u4tev5xv4TCv42dOgrVK/er1TX6YOF2HS1wq69gZiSEAgNGv4d6esNvGLr+bjRj8dulwGqHHMMAO+IZbe9gfUVVelqPW2M07iSsSlXO21H8Qtq09MnfyyUKKVwewT+KYYnZKeJhSv8x7MSnQDCOq3TpyaJOeExFibPxOdMhlA3l/5V/bdeQNQyBmmyLaadEzHpMMFcbWmhtTQ+Pr6iGXsS19mv4Y87HnlzkWXIKq/4+orblK64CDZETOPuVAYp31neIskSJ8Xb6DTXaiUrxIbXVwwL5d13UH9Og9533WoJdkTsj/dAewEWd7Zabtzo2xZ3sIAxJoK3hbvvbt51R8uJlps7FbCwErKttTC2UluMWIJa4qrJZfEcSAQxVd1G4V5klcrd3u/5Tm9YbgXLO/Mhk26gVsUl01dsAh7UBkZhaID7439kAU4gBlpmD8JkTNWIAFbmxzBEEZq/Uj87uffU77a2tFbGTM0Ak60FFretwDhMQHSBcSaZRGsZizdl/FWHMDAoE2k4jtyr4/NUCui5Rmwm+4pXGaSwR8U7KG0i9sdTXo3TpBuouM3HxgAcx1FKzasFJs9yrqVbRjCmVuN1WTsvAePji5yahElWlp+MldudzJdB5dbhBP2ojkMkHlDWFa96+4oODCKcrXbPgAKfWaVHKXBO7Icw5S3tBGJFZXz8FCs/CN0/h8nx6DxvufLcsuDubM0zv42YFDIR02wn9wJMsjK2IwL4/0KOM7uJ1oqqGNlXVIIOQ6Z0SoRSSkXW57wOyHalE0YuN3dkFUKYCu5hVHwwG0VRFDsyzuIvGkQELwg6e1RA4AMYc392OycQF2rsySKEOU4E7GZl27Z4M67cf/vy4uKu+bdEE7NT2rjbnXlOjy0sxGYYS3Ah27YuapbjDcH/BrkzqK/2LL5Ch2FJ7cLMq74EBEHFqHNd6BnrHkTwr8XYHuY5lE0G+LMkhyc9ZB+FGN9Phn1gaRorFehVb18BYTabu07TjxIlhQ7DsJj3ZkEbA4/ZCnNyarsQ4/RUC0dRFOFA1F5MBOOLYAy+Zzp3Hw3Sh3wcEquj/SQnaEug56EZOjE78Mzu3bANMBJt3dtqvXiq/hf/8L//7MtIyznD2Ni2xDUUMDEOiUe3SbVCHLm1w/pKoJfWRWuF6xR64oprFCf1oFFJz10d+P6xDyDW4zU/Zwvm3FWoKkqaPPB93/c9fPxV9EN5bAZ9xdrgkDaSphYlI1mFLlf5yagu3wLVAJM70jAQpUoK7Ya1rjPeNqYckhVJRw4tEpV2Q0xDPvxLuaRtdff95hNHeY92cb5FMgInlhYn3UVpbbmgGFuB3cCus4AQNTlW+4G/+L+3fI5HZreu7DnD2HKsyoixpJg8lQwLrRLL9T/On5UaiEwP534RjiqkQcVNGUcBNhI0ApkqSjkYkgCq9uu5BXN18i4a8JkvXlV4c0QjU3x4pszLbTfWpq+4OH5m1wTTMjnVv5vRF5q1aKXqkr/wrP1NVJhxa1X5oHIytgmu2v+f7WxMrrfJfT+b8d6O3vlvP3g/yhDtz6TiRVfYena8Rf3M5NgKZ3af2Z1sSJ1w+9z/dW/tQvR2mHdWTouzbK8ULSBhQC0qBc/scyI4/CmZzT0epAfJ0Q2jd5TWz3LXJ799+NnCdIPh6GFilyQZzi3YF6Vksb9lVix97kMmMEUa8wKkfmbZmH5m14R//bNGzEPxiYIY50odpe++zsJ8tTzE7Hhj7ofmO74dJsMidKMXInnocK/7oH5Fy73Kd2IyI0SYd6Y2svu+lSMcv/3byL4TcQP90194Id7yOxEgpt6sQXhBnWV8efzC7jPjsPvM7gViNpTTlLfNRf/qd3/iTTc2Hzgz3lLL22EhHRZLbjuwxGQ70MYMb/qNX20/3YA32013UiH8mfvdQsni6GEni42NL1Pv+FZRyoGw7xljnF//nxFz9Hd+5rAYxGxvv4h/asR4t/5671sV3/zVe1MqlNn/zL1bA69678vxoCYejX/ccPYVg0M+9UnByKcADMymHAHtRDhmCnqfVdgaIDFwJk+Zj76ddhTtaoka8Knej38ewphHQpiQ1NOclKusbqhmVeQynv7w4pcAITqx/wQG6hpciRhn/FtvuVCDM7vjYbEQl++l8/4/fd+Ff/HE5KMuLT2ecAcTLI8xOQnxiqHgxP5IsZ/d/8HuUErllo4MLk1N0cZI+JSRlPTn+XD7sAwcEtSAF94AAp/6lBGDvPNPbWKzahb1dK0UH7MyKrHu6IG12VdsfH2FAWPiQGod/lNdECQIglXlsO5gYY52HRettUazT4xfEM3ECDWIUzoOtOeRKNJ5tpXCCUNN4kr18wiaHew/AZK4r93SGmeZd0ELdhOvFQAmOm1qf/Sv/x/99R9/o6q3VmgyeWYbMFZ3HCYYh8VTsMjk5OQkiaD9FvN7451+dXvxyqBecsRpwGRrRWOqWAMzIBSKu0kOqTBgHkMRqSiKokipiJrr9iw4aNV2SqsU163KUbbxqtdXGNozv8l5SXOAOG7OKlk0umOFodsmxM+szgpP7rEGguN0vEwd/5ZCkiLubzOiv8vy8jiMswUgtszexjhCTZbP/esT/NF/+fULtRqwK16QVyIiB5bjMKqTxPunv03Mq/3xZ2zO8EAOzox1CmEMYp4cfoB6bsh9uxlcRzuO4zhaO7qk3Jq21zbNk31t3l9L+goAy/ONoihgVQcVcZUG3Sfr4BPAgIr1Fc3QAEzKm9Nj7QuMAbtXYNvC+DKmtnJ654VtX3vg38xsic41Fea7kzvOtAAHpw6T8YgAcMOxcWJCtvzevnaIpo2MQ13fBin1b/TFinoN6CtyWAfPN+vhjvAQyVKynzqgaCnzIsvjAOOwAmfiYbEcD1oZPzv35d3RUsS4IHx/fkcNIIqWILQ2+3qFeVDwV+bHq5mF9IP1OExRd+W+DqqD/3B/yV/t/qA6sA5e0tbDHeHnAUV2RKapwRX8VfyttjwGu1kYg2SmUWZc7YQLYTLrxAdQ9chxHNjabvRFNRlnJ2/h94YYaiPBevgD0vkd1LrZGeXwqvcH1YF9nca9lVkAhXhmPTqDgGYHnIC6oOAc53hLfE2NrwAL2xKq03hrbJkVYM/2sXHc+nbgdTXYQY2oDue3kZpsK71iAIVB8nLFxsXXc98G9jLY/0t+zdhXwDPr0BGkbJZUbjgIfdBAjXnYnyjKbtjeVszVHIBtC6ywwjaI6u4c/4Srzi63Wsu4bNvGWcWOZQwTS7Dl1K7JWI+3qFWWCeskVww9yyGtFYPLFa8B+4r18Kj5UOnVgYbhIaDFDgDqzSY8DjC+DLCcOHra1trN2AK0zPKW12/717fP7doJ2+IVeVe8VxUm4MKOc8uwyOKiUsq8N+63f8UmkSs6xsHFCTnyWrOvWAe5Yoj+TTN8nmStYD/U67QmFllZjgfFFqEJC5ypLUyyjW2xPmPn584uTOxwFuAsu0Cr5njmwWO8thyTJMe2M4dWIG8xm0Su4K7ct4sjV7zq9RUd6JQrhgBZg4uV4kyhhQJOQDOkJjdtN1cALNNsRXW4rDXG5CJhGBqJdr/00rPzEn7vAnWYDM+C0jvmYRJa7FRs27W8fH55ecLEXgyAzSNX5HdQF0eueM3pK9ahIxxdPUnfMFBDQ2K4jX6SvWFteXmZ2kSNiNYFJlssb4+iiJo6H20b+37YUibaubx8JlpeDptqfhxZrLV27pzDhOGuXTt37TLbD5Dt/DevvmIgvNb1FUU8SmPg6lzj/GDKJVgTzKeKc2gVXSiGjlXg8VlRClWDU5zbwq6d25ZcGIvbcbd2aisrzeaZ1tmzoYThysr3V1ZWxp2Vs2da4xfESKu2cGGHsJ3z4YoJt7+HJXZowMyYG+F/VCtR1UoMfwOlu6Syf2BprPvIhv4IWqlc4cHmtq/IiqK2lxEQHZWm1Ki/0MXravRKVWOB8Qslj0NbLotar7RH7N2fYbc9RSyfufszcPdnAL7A/GfuppW9yXrTKK0wVyw555cmJpZqF85iVlpONgFEakWx6BBPCXNErdrLobx+0m3BNoxiG+6piYkD3+S94TzUkP38m7t4J4lTLaXPnbd8MDmXZRRGQF22CHDdU/FP51+XnbmJ4fnddnXH0JknaqXf+Ye2Xyd3b3EznTuf1LwH/lU+5Qv2t3yedvN24pV+Bu393HNkz2ne94+PfD9aepXYVxR6+gZyRe7pOyrDc1WfpydWuZ59MldY29svyXk7VeuNfEngSzETUY4INVK3YM33/LFWbDdLk3PsON+aOP0SMtZqL4q18XBr00xy3onNuh2i2koUUWvBTgyTwMoOXf/m/jjLiSX+nLfmCrnyRsvVt1nJXUuskZJqzuUCddfylVfgZQ7kHttrb+e/W9JEK28QvtRjhjJdMtubxViZ5vPMNW8+m5JnF+MrxwBubPZrX7Eh5YrYlDeKEsqkZZJtW2fr+FsUKRX1sr1srcOByv5nM+IVfod/PDG+GHwBkCDxk6Z0LFh8rQ6aJQyc3zrBJFHL6rjRWMvd/TeyJSmKIjBEb4ub28QUcqNpNjkBWrEEb+8ommMCyQp3X74X5VsmX2yTuxppjZ/tcBwCISO8fqSkYX4EfDHdrDRMl3s8k+bYnafcJwWstgF3ye8H2LVzE8sVuXDCqOzUUYVhGLbtjNtQve30swi56yBD5xlTxROYz/aDBmh7JQzRMDnJjh07z4c0sTb7Ds7Klst4cbtZtF5H1OIvdlGDOclm+Xr9BCRr15+XbJOlwISqHFqDqxSd/PQUN/T8NcagMnRHnncOdyZ73+8DE4+me7ZNr69QZIfxYfs/uUGgQlwn7nU9N1L71kELkWdMFb9C79g5T2AJlQ6L94gCzsE8OzvC2UQObP8+KFWLSF6JQxShztCCHYZFSQnX796fdtq380Sh6qZrw1Hi5sOGBrRb5Pm1rOcPet46nNirRfgKB+EFrky+bnZ9hSKM53yllOO6rutorXFzvV87jo47SP5MI11V1oPdVKpCtLvi6e0Yzk+0paBvGq002zU7YdLNHwpF1Jd5eeGMWWm/DsdRjjZbYQeLi3vjqHR1+OaJVMz5c24sVvN3KesrqPt0z48W7ioRQgddKzryPDo0xVFsiPb+Y7Dr1s9vYn2FyjwDKZW5qtY6nmxzjafTAZOJG7oLrAt9oXSgGc+Pg2SIcPjcEdi6FI/Y/fupI6IV57YvAnNLnZN5c05RByeKovidRPESch7mmeQUgI7DHMVtUeft/JuuAmTF69yJ5AbFzcRljAOq0dGeKhNDIA6QkeZ1Q8mB6qBrRUeew9tBxecJvw+c5cc3sVwRQ4OquN4ncMmLk9mFcnbTQMjvoLqHnd/+92Ac6EIl6m0ADaf2jIN72RwATmxCAbT0YmtxeTlyHCeC+MDWiWIpe57JvacAF94NKKW3Al1nULmClZ7ZrDqvF7T/13v+WjHPAnTkOeTl/X0Au86muW5GuSKermK3FMPAerCb8tJ26Ts85nE+PpuF/bw7jlG0fS/L42x58R3XRtSIWo5Tw4kiapGz4kQRETg4OEBtHLXnMrZu2aEX9V6QkObX3r0fvVWdrwFvl78sfnhy0NB5PhGjdF7X0LFTzVAmbQ+8VuS+7Rvy8v4VDgJPbH4elIpC3H5WsO4ckhVjPdhNpTlaF72jHDRszVzW7P9mHQSNPj2+pBfGv/k0Tn1ysiZCzRmbnHDH3Ul3cnLL5PibxsfdK6+cHHfHmo6GLQYd7lUacJuqxgnUebYCS5jitaJ8Qiid1xW6SPdcdt+ga0X+viGKgm254tXAgwqHF/1mHU5mS2ns9is9zDHhfLMWu9UEYlcbcc22b/1bgvPWen3Xrl27dl3u7Grt3Ltr77a923bu3buyd9s2Y3bt2hONveVt8UhzYyFJavDkfgVbz1Nn4s/L1oq4KAXScem8Hh+C97x0V8ltg64VHXkObx5ryxXcmDqC2xxyRc/e7zq6vZvqcU91Es3h4R9Clesr2s/7+FEOUttab9Xek/zybqiDwOlJzurwnVvGjjtTd01NTdWd1zmXyfjE+I6JMYmiLRPu2NVXv8GZM9vnJt65cn5lLF74qGdRtc7XaHK+bK0QKNQ6dM/rSYPq2KeGW/BezMXQVwxZFHwfwMQTqRZvU8gVduNHUfxLSBh/bHd/HRL+/9v79zA7qvNMFH+/2qXqbrUQumEu5qKuhZ2YSElaNsKJ7SPAOWQyZx6LjPpnowzyL2lizxnnObYQjrGNsSdgcHCCIM4zycQeOueJeQZsNwly5kwcTgxoYnwRMW0HBScxq7auiIvu6tuurl3f+aNua9XeVV17996tbqnehlZX1ap1q3X71veu70Pkg9j1la/oeZ7nGcHXbNyDqsSWO6RsaMFmzKYyTTNFvsnh0iXStjMoJGuMtQo58d/33QegPo4KvluBCRPrfxg+WbPm9JKVL45h4G3vODXx1dOnx167auXKlUtrM7VeXrV0FWiir//oG6dWv+UXBte/6Y3+lf3UWz/tgXuAjSBYHirLgB627qF//kmy2vGgWu/hAY6K58J1Xb1mHoMdMipDG00RPCDoFFGcdU2n/H6FtZWus/8IiKjbKvUQQD1BvEF9wHi/FrCDoqDEZoinsBnGYuJB+b/7e8kF90BEdjItoOZdtyd5aCBxse0y8piDegrHHCSucN0pdeYwLBiuEcXJkwA23vrorR9jbNxzLWX44QWw91D4B2HbKGh63R4A+NKjtz5668emMfTENyInvRK7GAaA9+C7vxz3fwKdXk6YEfhHMRFZsTpRme5Fz2T/NKYx3Y+l1IdJqw73CPqt08vB6J9YMoNaD74Lvq7PrYQf+fF/g4nr9mzc84cf37hn4x7gbSrrzoCP0G+yC1jTPjbuiX5QSwa2r26DOcnXPY/AXhrxekdtEX94mLD9umAeIF4Smfg1Ga6Y9jfe+mj481E6QzKqbEfgs/9JrWx3bdIraNuuZCjZ/jCWaC5DibO8TLYKuQviLon3iTvRl3Bmi3YLKk7QvR7P3nKELj42+Za7d+2Y6x5aZMYxrK/xpbc/aAAw4YqD3nGVSMkHrvBhmB5gAq515bftIqtPBgEy8PpJUkhAtdzLB9cislRsBnHGGeOjq7Oj9Q6vjcI59uBfXUVhYgCAfWwPjkIAYJLYtWPNyQvwd+9BHfBMDy8G57crmKxMTQKRo2WJt1QMf3qSwKume08snehHX0C2tZaAAMws4RnuRw/w9h/QRtdEBeipWXXjFACE9p4JOKpxX/1ER3H1P+OwZmT3mBZyql/5lDS+1ISHhJWsod4TVRmTcSgxJk4cVHL4SaX9yqXqa0cuU9v6iRVanL4qRdZ/7/Od6RUkd2HzyH1y1+Yvnzrx9eLdIcTZsjPLQhIiF9jSJjz0h6H1UQnjK+ruEX08yGjARsC/HnYK+EwHQQoZe4iWQkKd1u2KV4cbLB/DOEMIaRtZPtsBrP9WUoKXn/AdESYGAJIhhXqjYgDvASp//8umB6x/ET21iBglheqnyDpyqTuw56Le3tcrtX70ufW+eh3L3CV0one6d3rZ+IrlMxVg/Yt1/HAweKMHAHZuVnImCH5sPd21ol9wYdQrhlp6m1BfNy0B4JqXLA9ctcPWTLo9Wm/g5YpvRdFYLjicXl0QUFEGJwIkZDA6OMS0PVxrWS5Si3RiH74RTGQuLNfSe95t9zap9HYgdiKu4Zv7wr2Abtgk7+z5CgkmUhjNPizTg2dacPFh1S0EP/Q1RJ/YhAeyqZh7DxnVCqOB3wpQQkYK4hQA5JAEZbroBfDi4eTvPx/eMpp6LOIF1K7NgXzy9+/B378HMOG9CKCnBlTqFaxZczR65aanANC+y/+pd9I7dDn+5RePuuhD5QIP/XQC6EUvltHp5bzuRayHFU4VqFl4/NeOjQwDCPsXA7i6JyyT5SKZK/zGQYT2/hwA4CV2jXBehYRw9EoyD5LPsbduF1a4l2OGCSSQEMBQUBu2A1z3tWj9ZtVI22diEDiWSa4AWHOu0bH9Ebkr+fvJ6I8Fr68g2MQMKaWUELg20Rx5RqpuHgesaJ51M92bN0DEdt2p+eQSWhqP4pRSSoyG5oGzs53kfxjb9HjtAZnMALvAfw3gV4D3oALPw3oANYDcCnD0aLxGfAq9y1ef+f9Xl124rDpT/cnPoMeyUHcn4QLoBUzTw0yUtAtU6kANPcAtDIwIQEopAIEbcI18KSwYrIhn3swFPcOilyzLsiyDBBjRV5A2sLGxwHEHcCtxzaQVrUICY2FtCGBr2CUty+1p1P4lvmcOqnECneRBASI+tx1tkHXjLF5H/VewTTZkvNjfszRcxHqAb+gWxLfuUDcL130LRVZQAGBHFjIAOzZHH8EwEQgyceBwIYA8UzdxHEwk5ObNqtFmIYWSs5klNO4z1dDzd8FcgfUvogc14Pq/B3A0ni3EdN9P8N9WHgWw5kTvP/2CAbhY4aGfTvQCwZKLpnuxDjC9FePRSc1/+N8/dwz3hQkKACfwUux9xrVeMoKSWQCq0KvsxngeMS0PiKVkANizVLHnbAJGuPA3AhZz5CPB8tTKgO5txU7q0IQLbL0jPZIF8RgwDZjauNyxFRQAOYLQf8VUuHRa+PoKAmBHwzl9SWuJN6TCevFqwMCL2QaXG60vh9HbINhQ/bWpUKtAzmreXIGw9cAi2RsVM9iMDwLo6am9B6gEvI/1qPVYv/xtABL/Nn4JmMTKI2fOTJw5NT29rN+CiwuZAfQCSwN7BTPgvYC5LHynBzz5+oEdQY6jJNVp3FLMHFgwU7qyZzSmE0W+/AAW9CUlnAnDME0rIAsgcGoQoLHV2EldsLJm8qyGsOoC1UuPQJ0lB0Z1E1lJW/j6iuiEVdCCdbcJ2Sohs7D2U7VMTsjTmmrTZUseCRviTE6IDp0exeQT44ya6quOekDfvQDAdWv+5xp8EEDgBnL69KWYXvVzF6J/Bi6w4hQAnABMmMES6EwFWOGdNMeXoQc9DGALHsB9iHayguDNjaY1rKFu0G5eG2UZQPpDZCkCG2/rI83DOWHz9H2d40Fp33GR2plNOa7Oow90w3Rgko9Wpoo8OALH7zq5ykg6hQcELa+HgDU4iqNr/iJK9fL+JUfW9F782pF+VCaw1MKygONtWpFc2+sD41iByhTQAxeTy9+883EAUsqQ10IrkXGKoqGrPKPdVKqeUh8ixczvDPI+bkePxCRyxWK1M1t0ruiK6cCuwAPoP7w42cM1AKhUTABYvx4I+obEmqNrPggAkysBzPTXVh3xL4WHfgt9XPEYWAa4wKQHANPTG7AM48vqQK0Ga8J/YWzmBUhAhJ1Cct5c8bB2Q58r9KrvtK+jRuRyQxrnihZ8bKcggUVuZzY9V2TJADA7N1fMefhrMrBFt4QEPLnEuGCCeoI9l2UmAHwV+AVgGvg9YA3+Yg2wxgT+yfM8q163TntqHB42W27oeq/i7sFJE+MAesCP9n//ygfv/Mz/FPKmqBgCOXNFyoNE87mCAE5/iCzMpepyeYQd40FpckXLdmbnS19B7EBkCFPE+Ngn/dAVowkDW3+czmTsMteLORfBuFJoym0WyDd8hPs0WPetIAjnRWjCM6MTfsFo3+gAmp1Q4CYBKR6QN/U/+W+nlrEFkL8UNeC3/x5Lrv9ObXLp/zy6BliDNZg0l/T+3KvbAAB/sQSDfo9nejBBp6eX7XLhBp9oyRKzpyfIInuVt+4xJG7GfRCM+5LUr2m2D+vCqlUe/rp6S50rfOPR6JT30KhDA+Fc0aTZRx8IgM+VlAvvFlY+W38EhNrAdOPzWN2DIkBG24gOhBShdqtIWncN70LkWXiqdTuz88SDIimGnnAGmj9kADB81wJg1tDj/cdPpkqufKR1sXaZHQyNtuRCUIVhWiHj0DWSnpYLHwZGyLEDNgnsNAkuQDS52aChl+myF3vO1CtHIgbEJPAj7O+3juKDzwGABNacOWNc9v9Eb78e/VGxVgGI9Rr/+1/+CADwy9/95Qu/+2+eEpAi4AwpGwovNZkq3FAwUSuUAb7iYPgYzy9NFPuDCFtEQ68wXQsu90TGI3K8ZM+GP4EZ6QAbUtF4UJLsuDaFlII1M1ZFcBe+uRnoi3dmF5i/bYJNt3B+Aw6GD6+CtEVNhuqKVpkrBHa22ykYPoxoqlB6Wi4smPitewaCLNmADVI+IjEAW21/PAYWwSaRDJhjtHOzAHbueMDtv+MvTwMYxuiSHTt37LwdICmwE2AKeRy7AGz+Nu68C8uBLcsvE5C4SeKtEMYtI1KIRn3mNU1WUJaLa15KDa/PrPIi9lvgbzPqWfwC9ixFBgI3557yXntYsd/LfF2rT8GxxgmwgepAq8cv7ht+H4Cp1s9XzA8Piskh+/37eOS2R5r88J//ll+PDd+t24vTVfVl8hUOmZm0YCkc+/i+9nYtyIRVj1hDZsG5whuQbNx92yO3gTFyG0aGyVdmP64a8TIMI3/x7AhwG7DpwMsAos7LO24HcDvBmgnsI45g+bEHNm8e/QyAkTuXzQD0uzsADjvZ7YR7geMm/vzDkKP/3bpl9WYAI/AEmq4krn658d4V/wyTqv/+r349/GHcWOeYE/8i/eLdoQkB+vW/yrbR51k+aj6t37tu77q96/6RQK8VqrMG0NMrwGysa7prohq2Y9pH/+02PDIMAAQGV9lupVuMhF7o+/56698Ed7rBmcX17XNmHcA+dmHWU994409uA8AjwyO3MT1y+3KmdXsR/Mfr96LHheXBBODVD60Ncy4FODvO2XC1jBbXrvG2b4VxgsA43nz72QRcJNpBBkCvqlzUwxcHJDsmpoEqE9PvfhGYnvK+AKUFXfwaLv7WBaf/ljCCYWDkvruA4XAjycOHMfob8UC6HQ9v/4OvBH8PQ9wJE8PYtRn0jSGR7hTEv/Cjn23SJ1wAjHUTymqPTp8ixDajHvnIRetfXLd33d51L65/Ef4v/KT5Cgo+jMnXKTKR+chvg9c2hInz8sqlEcHSdC3vyGXqwyr5I7c9chvTI8MjDT+2WqqjK8AIGgKDpi9oQa74zHDAmWX68qkTX7/5yQKvaCVogUn+LG6ZPtleryBJA8dXZkxNHvDK5SEfGkxMP7/XS0J68K3g2KoJwEtaMEiKY+0qUHzLRShtu0bc02brFZarz/3a937lUr/gwuLyw1fPLJlpYk33qZvw8ptfVZvkVQcFngqYJBIAxFM3AcBTKf4KiH/hRxG/VYd7zUupFcsJlUlOV/+r9jCo9yZyhYHJfidasJLMWbrm9wpwKD40G/e1UoUfwgzy87sPNguTgaBXYHjX5i+feuX00smFKFcQIAYpr8aJQcFATCDeeqcWyoDlxeTuvYfiI1/cYtdUYZiG6TaXK9J8kxAezIBIEXZP00sRzrfD8kW49gvO0phR0CSQCwveileeEi9TyK4V8W8pIJ2Bf12aBHcN4CkBKaQUuOu+u+6LKOgNnQJotDwbRGEh5eXCU6w0S8G7L/WjSTPelGtSesv0KJbiCHZxmqYOJgdC3SfICQrfML3I5vo9f9jyqe5ArkhWUAtOXyFHsyvBCzIRUvlY4k8aQjTfIW9fEW2aML2o7Ka+xs1UM0XDX9S5PZ1f9DBgSTP1guepB2hDozK3MiTtkkkZgk4BOSIfQchECk7fAgwI3CUhcd9d4S6sGEl3ihxYjVqMGyFjvQqQGLqx8nzEeEAyvDO3T1likbVDnwLFyQKm13p6I7FXlwWrr8jPRKrNr9zf+TSapBr94elzRWFzFaZ33dczHmWoubwo2REsP42d2LxrMzAyPAKJXcd2HVsNLNdz533kk6MSI8MYGb7rvs8T7rrvLgC46765UCOeWTV7mO6h8IA/V/bH8MhC11dAyBamv60/ajOVNqHvQbWQep41vRiNVfzRTw8H55N2YDMwjGEAwX6s2ImPftIF4gH+TzAEDAPDGL6PgPtCrV3TFvOS1XQN1YCMJeJCR+tLNtmuvmL+eFAtlGl+nM8m0FkkLaSeZwsmNvPp/iOSH9eFi40sIISEhBRCCCEgIIQAbsJ/Cd/9Z7hw4eJHQMhYFFLOwui9Bk02oZrgmUKhFhxanzsCdmAb+op5kytaCTw/zmdjFJUrGjGLFb4AxjVIfiwLMEESUo7cNXJXyAMXdwkJCCHxFAGwYP08LFiwzBswAgQ9JzwbndM4CtrnvQHQmfYLE3NllUdyxQK2ByVANyCLk+xhuzY/zsIk7/S39NqeK7bnRhuL2J7yA1jeHoaEuO/z930+sPnNfF9MZ+ONsBL52NuK4ajtCiGEyBBzGQBeyrAPm8YzQA4XtbO88UYUFtQZOZbeZsF9AhhOPAuHdxfg+QrOG1j1pch8M8nbnivyV1DN4HmeF46CgXeshvF6TxLQ07poPLg3H+Pzs3013AiZcsXVgfWobqPdGaqluUMCIpwrpjbVFvD5irwxWP+kjzW3vA9gLqeOisbZwlzR5lLv2lhY6GAK+dl+GVaIbLni5aZMqgWDduWKZAW14OQK5H7g1AGAvJBdmCvalitS2S6MvEMMqRGxeBfNzfbVLq4OflwrZ64oJq3PE+Z+WrVtfcX8ndumnA/s6UuRvJBdOKHatlzhtb6CAhAdeKPMo1UKOjRXvGzh5eAne65wXy4qrs8P5i4+hntQresr5lGueDbn4ftVMyrYmnNi+MW1cYQt1lvaQVjTOLmlZZFmO9iH5xmF5NQ9gfnjRthsp1bdRbso49s5Tz1PKT5ugJ3YSVFtTV9dUFyfNS+6/eoca9azxKOh9bkj3INq3X/FvPCgGIDAmSPqPWt1dLgNANZMqM/e1jxkYERoUq2sX86JM0TIADwz3hgy/NvU42xI3TOb6KpNAKaW7RntPboom3dpTWQ+Anq0xJRjicTVi3Kq34TlNf2aroXB/6ne+Ivvqlcx98lym7ILi4D4tWXqtZGUwfJSHzeVuZXq5qNeQFP3ZFJ8DAwikZFue6GerwDAuFK7Pqhd6cLK8dXZIY3CIXW4KnGzQ3Hq2Z5eoW4vU85ipIVK1+YK6s8N66F5t4D311rhr7yzeW6KacabgqyM00oe8iXRmtbY0wWc4w5x2+crzhoPKnsk9Q1ttuROhATeC0dkhUwqwUOaDZ7LtFdrz2MQR5ZzmT4z66zacGq5WSDtCDu/7ScZzT4vHQu4Q6umsVVNOeftTxUAM3xrlkasVVb0h7660go4d6VJMFe0oa84a/4rcqHaV84/g1p4Rbf1x4p+fZY42+RIQ7H83bJ/kow2oM8Ve3uah8pFQ1u/sXk4y7WaneUrhs5wq3IL2PpnCc5tT22qLcxz2y3iRi5Klf5KYY+Qj1HROG9sd/ODABHnp8WdgKwH+lyRtURqDU+vamojx52DYNEhQmduAVv/LAv+fEVLeLpwyA8VDrm1cKUWT10HsXLAjDrkqlKfK+It5Bat+j2sxQI0tadmzUWJ1y6hc6M221Nn990Xgb6iNRTYyi+I0GrwhxrizPbd0lLkSuOkZJFWYAVVqGXr28QvZsSTm46V4mtlDw8vo83VPOOZ2TtUk/KaeF63ybMXBeqkMBaBvqIVFO8KhUJq58giZO8RdWSV2CEKozYGPzJ7ztw04F6dDjOIDCuDZwHXaleUt6Jv/bPc1a6+YoHYmU2heJMqHHKwC3HmoUOLAW2uuG32nFkpXAPrpbSd2ZXIGxPmFzr55ZG8qaoNuWKhn69oFSlHFHPHyi7EmQfuDGFLnSuowNbC1amfl4Fr0oz3p7Fw5grN2jMNdzbyBX++4qyjXRm6XXRos06dK7jA/PNy6sdtYjltEAt0rii8oVgQi+B8RTNkzZep2smRvNoOqSaeemsu3yaehjpkXVuXK/a2ujHrWni5oQOsRNO5IjBGkhlVd04i6Z4BciutXbliYZ+vSCPrCxjBHmcMH1C/ia+ejtCdfs0SUomzDhe+HwR14Svn5gwY7KDI5pebaikEtu345Ofn85TivumbvgkApmmmLRlrLV+TK4ZzmmYQi5eC4Xme4WGnWlH4dnKW1XNdZc/HC+MxtTjVAuqXClQtXkOJMuP08EPN4/NtWUo8D6i0PpPc1+75innjQaXhT3NmMX/p8O0PJVfmFKsr6tjXrQkLS97yLNoJucSEkFHhazylPMI4RIH6dy0A02ozmTmsal/pwuxICG7smtdlnoxCXvs8p02aZegrGmBatTo1XYIwXfv8GcUhMq6/AdfUQnqXf81LnktRQE5sQyVxRtGA3MOxfToC3LVqzp5eFZtV9IGCcYLpc6HJtPD6dHalfS7zSSZk5C0yvF7wPCh63wvZD4+vxNeSq6mlmq5/phKYYjZdywX+VeW9ZYY0TJ+1kPC4GjfMnumliIY+BsEpYuTXAjwcu1xxhXdYSwCUzVE4eLnvGpG6pGe6H5Ex0aUAadzelCuPF7M/lzd+UeYmQv+ktkVimi8ZPxuY9RcvG5MaI29CmY08jK9RHtEhrYAaQ5i/olyIavE44ajsm4GsEgCgFo0vY+H7r2gAjzkU2MVL3a+CbQ7MwAIALI8VD8TgfbF/W+sKy428KQIAskP6FkgvKZEfm8wD9g0EhzVI2gSnyFTt+ZZRrxjqMuJRDEgrcD9jhlaim0fEFQQGWAF4FrBvINL+DT2Rbhi6XJE9Xnogduxq0DGUSpUQkMJXv7OHq6/xYy/x2BjTJuXQLZ/QY30vqgPxCscm+GGVueLmh/SQH4p5uCaq2BgVXAKUKlES59ATtgRr3aKxwoKaGRoV2DLa6hJqgfuvaALGliea3CYOqHuJ63MDGLqlyqGNGBvrI8dHLtBAfcsK2bjlIqqxeVVD2f1wIOxiVnpc62qoFn3sbZ94mWvxeY48ldt2JKYiw9QDwzZjDZvy2lyRr68gchqfC+mkd/p96yVc81J4cUV1z7LIoKdwONUrtv4YDoa2bQYwNBo3WRdWjVK9Qk/g+aUxQbnBIVQS5yg7HHVkDY0fYBskdmWnmIG2/VecPX/bYhsDkKkaYBG4D9XwjTu3hDVl0yN7ER14swSMVHv/xp1PDjWENGEBhh6w52A07sHA+qjhyCY5ag7TgisbLN8QiVCjDM5pwtcBhhl5dAc9AoaUUgpb2unhsri+4ka2o3elgqG0dsa1XFhhp7CuOYjIcawQ0gZt1MJ+GDy0a3QzAIwCHwuHEctye1I6EC1jlsfRdCVgy1SJgjgDZ+EMZ0AT4oI8NxZuMwRub9mscNv6ClSK472V/3Dje3/jV98zXH3YMGiOMAzDeLthGFVDi8sgo0ontClskgyKwhi0P16kmiYQ7uQkIQ1qEtI30xsjpmmaibEhb7+aLdLKdgRJQM1KiG8CR1Ih40RM1D+bXfYjCJIP3bvvD2rDoOrbjaqhStQmHqBq+NQwaP/b0NRGCQDgOFWrzeqZyDC0DRLT9+PETR+TUchq1ajS70ON/zgZ+6L6NOgIknrwcUSrp19E8paPdXHqVaNqTGbFGRZ7VkShjOLhqw8/XL3bqDrVT31ka2VLC428UqlUKmdVXzGGYA2sFAjgIWrY8tQ2d6I/PA8mDKWpBre5MaQF02zcoU/OnVKyT85c9Di40bj69BS3G+velbfBrhpZX5/c3gaR53p8Vn1F0xSJWZ8BDD3rStUDH9VC3kjM4citVUqjDy91B9nC8/HfouFQgBInChIN2qUjLEZ9RRa2pWtAv9Z3J/OaSXEm0nAb4lKTlNVbv/Zc0Tj3JhLIZuS6Hs/TV+SAUmyj1FST0+Cy6ffp0rdgoWf+zHi2ra9YeDyoyFtiFpryi5pSj4szkVo65lWM5/zFAlS+ACkJJGeuaK6vCCfKrzR7FuLRnGcaUj35scIK5RzDKG3HOWecQ+crGNBW8OnnxWeA4iE75vw8ARWOc712RTlzRfPzFSHyDmDlmWXTkFprbS1MVG3FmltLkwVpy+vWsFjPVzSlsOaXPndtrUWVEzI11Lezgppltlj3rqIR7dUynStX5GYz52F6rkiJbQr2ZKeu7TqlS58zV6Q+7zy6YVjw5yuIHEfr7Hp/4LjyiJqNJQpZhr1gAjGhWv4CAGzEBjiOGhIAYAbbt+oOko9EJWKCZ+VoR9OW67rhBfxGQ3uumWwU/9rPhuVxCFRtEiNC6pHJ0W4CCWAQH9X2D56BSJptstTyYZo+tMmU2G7uD4GhSL8APA9+eDwpdLEK/XFUnyaeAQ1F0SunNFwfdej7Gh9KSu67iE2eS0lOTpwEB05W1RORE7WTcLe2xWMAC/18BUk51EzJFIDhJA2fgetTJz/B0feW9AjBhddczN6DURk2osBKiBs0G9dy3ZoW0nKviP40XbwVGCyiz/ZcCMP1Xdd1Xb9J502Menn4IgCHABZwwJkDuel6GIET8CElBrfRxlThE18uSt+14Hpp8h6omEln3/fguQgsMac4f1o2PQByW/hARncCb7JBJWtLGzf4JsFuXzLecWackCBgKEs/JB0ZJyEgISVaXEQt8PMVJG3xxDcy7c1QpI8GAIfoN/SngGOH79p8GwLdXDN5lyCGOHHKTDAi5qhhVPSR3ahG1i89Az8dcRo2vprA9C1UTSNCxdA7BsP1rbA+TYDBNgNgtrlBOZfAAoYxwAAz2xi7nbVxHTfQUKwmTs5XePANCEs7Cc0YLOg6x4ABI6gawwCwQapztl4ke3NQ82wzMULtkBXO7QoPNymeZ7jxM9iiwcpQEidsZrs6ltGVCQN2YvlT2EwCEi1JF22fr5gfHhTDIdt5f1bLG/ltHzIwGsPO0Ch/6L+qJ2VcB0MP3Q4AoMFR8uuZy50aSeFEn4GYIxNcTGBS9RVe3TewLt6jessz/uYdRWZmV/h+1ADW7WV6UF0a3W4G7BEAcK3131KfGb+eRYZ0LVCVHglOoZGj5BoArn56zWjofBjAI4q5JN83Pv4HasivYBR5XrAjmFb9LT9Vrmu0LZMjTFXQvrhiIiqZ53OPa2rLwi1AVHjTtZIlIzHxFj12PU5scbh5pllUidXdQc5ca2ShbXtQrXihx7O3HKH2vNA7gG1bWVsob/3p65c5IWFGguwqpQZhW4beaB2CwZS5x/7IMIe+qEkSDKZHhomBkdsYF65QTQRO3//bycdm8reMZlmLeuVSM7ZR5IJf+W/x4p7Iv0hTDRIqoQE90+V/eQv58bj21p++erkWZ+SQG3DFy2/5l3Aqeeu/MhtHa1qUa52YPsHVKypmlBPA+OIHogKM3MZByMYGRgziyT7ljnn0FEaGMXJbUDP066MBo1LCduwJxTKmiWlW2elcQdjuG0xfM/XWKFhAmq7l1evJGoS5orSxdJzTy2Wmzbqj734xmoT4Z/51+gIn0PnO3vIIkLuweeQ+yfTlUye+vrVVCX9+zleQkIQfrshMrOegwvO0nQG96I6QIhgvCSzCxVEzcJWH4uZty6sAupcJwD3AMa2o/ud/S3CyonbGipTCg/G2v7nnnujoAIBJrUS+4cdsRd2GMioa71pDlZwl0d8mgFfW6o8VGVrVVxgDuPXN0X3cA5Bk2ymiePH8tYR7CPcQmO4hripzry4DpK2L+pYZ8HyveJlSpkZN13JDFjBcq0crvKnYGErHOZWdYTJU+6HmNFDQUXeMBX6+gglb8koU1BoDgAiX4wlIcDw0iWA5BG6ueRugiEnONgkCOByukyMTQVLEgp2g/xAkbBQxLGhaePGwkq5j63ZbLCA8NeEZ6vd0M4U3D6ZhGklDMT3TS3V4myOjhxSdr/AAyzUP4vagEYckeLZnsxQagcLTQBy8O6DI23otWCZcxOZjfSM6E+JaFd/QzWl5RhJQHRB8y9O3cbU4TQ/IPDTBjCQV03tHwdIpaPt8xTzpK1iMzhqEo39Y190www5rhJk5DpgRCcd/crz/0aTiGXaQCti2C5tVURZvBBvPa4OKl1i91zYDrJyxx9M5RaaX5uGy4kcu0Vd4Blzdnk0Lo+gNkLptspx3jcTovhE3bwum1VikqMiG2qaMVKdIxYnZtFNJR9vTuk5pwesrFhzaox1o6vI0izFr5m3NnkaO/6TCJJJ8tOLNryk9d462/dpzjPql1gu/0PUVrUIzUtDlVFp4oRte+dLIbrONusb26idH9pw3ilIBpPLy0eah8rDA9RXnCrrhlS+N7ZlPitiDKoLi7IyzirnnZZHag1p0mIe5ImcF1bo9qKaYMxMp8+RTV9GuXLFwz1eQbPl4YUegrZHmsBqOVtLr8j9OJyxp54zkbZ6vaCEFHVnyw1zkiuDddvpVu3LFQj5fsZDm5rYxD3JFng/vDq2gFqdc0QbOofMVCxnzIFfk+vDOO19RHOeZXLFw9RXnCuZBrvhB9qMC/iuKYB5POHQSpb5ioWIe9qAWlr5iAaHUV3QWzHbqMAIr55zy4cOLtbYefrI20Z2nGXIdwvtznpmIxVzPaDhfURQZc4Vtw27TfWz74GzNOumtsziNNUbb+oqz5m+7OA6tCBjJs//MrKSA4QMAqK4xoicAL9HZOOMU8MuZmJiPDoT3CdJ+bRkr6dVfBfAXH4xevEDLikaZrWkTKa1p4zN6ANZMxNEDmLg45DoBDP8I4S8+GGbmLz64dCKzJpISNYFij5CYDqxSiou3F8qn6ZnesRn1Tv8FMS/KhFfLWVP0X2AGpjwBeLDG9Ywnnxr0y6+q7x0tlDMN55i/bQ2V/tnDBNDP29Gy7JCpYu9XL6yl6tX0hQAQWVGlnPG5fql2OZMRbDboc/FJKHvadpCVMDN3TuVM2/uzH+lzBZtacYu3h6kr1KujUDmQqapAKqSVcGDy0nsgJ5ZCaPt8xSKQKxiJrbv8kHXt6pF6RrDG97RJ/HrNwogPCk8WExGqXvZ3pDgkANzdvmScFNTE9VmJORSvoJSKiWqpnrcS0uUK1s6JF9dC3KHmBu/Vc5cpGlPQ4jTj/cqXDY/kB3f+BM7cXOgufH3FvKMVJ2uac+yOCKNzcPFmuq7rmmFbL2BnKQifGjXy3H13Zg9K3xVoo9J0PWCQ+UDBF96a84Znqa9oQAuucdapzrFpDo1mKP5rDi7eAlvrYdPIyUw0HbjJr3hlopUojc7sQek7yJ3oaem1wJzzWeorAKS2tIubPtMsMnHqY7TSvLclf7ZveM2wLMsyvGDrq0DLCMID6rpkb94KamHMFam1WhMGyZzzufj0FdpqEugM2UBrCy3s7mtpfzgnzgSNcs61gZ3Y1lNPxxz+8kwzahm5cQXhU8SkvNqMWzBp6/8WqU16P3is4LEJBmDBUtMK/zbhpqaLtueKaLO31Fc0oIh36ggdsaipGf1rJfU8FLffqiOvRB2ZK1J8rU6syqxUt5xzPsvzFY3IEzh1cN4qvDB0s5XFU89FAbmi6bOuyxUpvtacW7DfuIbqkFxx3p+vUIfPFpp67sBeeMzX5orOdLS2W0ZuiTojV+jSdjdYJB2SKxbu+Yp5Amde5CNvYC8cjT5XdIg60W7LyCtRZ1pwh+cKy2uQTOacz0Wpr/A6c4gmA62s69sSjdPWK3S5YrYVVMGitytX5JUo3YLb+wpb01dz+5hNTAc/NtexZfHpKzzP9SO7pR4AlhQYvEGepwIzdEjXHASGIyODOcTh4GP68FNu8QDT9P1oH2ldZKKOIIcaYpUAqIm9Qh86P+9jAOBEqd8Wf2XP8hutfLh138xAUlJ4+BDEoAzrxSGK7Q8zJEfW0ZPwYYJmUqJmeCY2GQ4JMMLsZeWnWRbN9Pnyx2D5bhCFG1ZlJrzEGrwJ04QZbqClu9XTEE5sIa51NbdoX19xFnlQhtIn6wHJhxH80nwwq3At18juyAaguGFby4jppQYM31I2A3XXbj8hSMEA2MGorVkrggmyZYNbcJiuxTV9TDHAdmLJa+1M5NfYh1XTv3i9hdGIeCyMk204kS9tByDFsV8KXlKiRpien+TSBvyW1gsJHvxGEj/jmZVeZC/KAIz8QT5K0IMX8QTDax2kmKC14RQyZadi8fnbdjc+qyiA6yojkv6TyGI0Wy6fzI5z8qimUzaVSFhf+Lkbn41H0027r+fITYCQhKlTauJngOZWf2vEOKNSrSaPbvyBYpuSEmWMy7hAK+BJNgp+YH4D2Bi7WjkTktcDjxdnTma/dsrJeuSh93WtH2THkgv/DS1BLZapo9mUdD2kYanzqH9G06cqKWzc419c0OR6grb9bc+Pndkm8P5R3c/S6Z+nvp71lmtNZ2+D0YHL9WvVN8NR1QAxvH9cGT+jlRRarwVJ4TiX6R/UCWncqexbNfR4B65Sbh16M9Yol9EY7FnAFXWNVj6t5SUXx1cDWB1d7R8IGjsLSFTXZL0EwMm2yZqy9NpCZlTQpPbJjmuf5fBl2S8Krb8e0LO2QotztXKx2m1dzxvYme37661/E1x3gzPbWbmCmKrRIrwKxkA9okv6OVKR5fG+zAUmV+D79Vha8PYhNs3ppApK7AxywHAl0OCu0PUDQ9pwNqgGPR2bBTXSmky3Ag9LlJAw4Pv1eIIYwBWh1OHWvIM9mjDko+pUM338qNkE4NeDeEzT9KIFFOSgbdsbMrzFEVG1udsjADCtuj/gxwBnexvKypVTdaqsylQmAApLRI4DyhT+fHwYFPqjInJgeqppRdqnVihgDoTxmD681u3BLUZ9hTNATmCYhsGQFNAc4Bp4Old9wDKzWyhOhdSvEsgFphZSjDqhdC/ltq8+oQxEPKq6K4ED2VR09Q0fgIwBBnMyJcg7ZMTd6PFdF64iqwIgu8j+CgMwopy7CBwQACCMPSTltizbgVKChjJryQVXLVgxe6oNKBaToxLFviZYfdAACx8C01DoHwwAtEywVvXwXr4jZIMAaFmsCPeg2tBXnDW54lpscSK/RDYAww9y48L0shelHtZ/K9s29e0gKy2zMYIB9obUfRl9WxZyhxwIkwwypBZSSBGYQU9ZsQ/Xw0pebgfBjCrUNMyHwtNplmd5fspnPQsWTR0ApsEww57mGeb6b8XiJ28WcvPt8Tk9/R3bseVYVhvyLMAMnZWZhonY5nlhaId7w1olxkBYQTagOkPTYYJAUW3b4S3EBztUYhbfkJQdRmBTrFhOgzjkSHAWL1lBLXh9hXkrXhCRSX4CYIZbEZbl4oacF1/M3vSjh6DuH61PPh4Dz2hBvwTYdrQba2vW4m1b23BiwU3PFnsGLP3OdbCsxIJY7AvGC82OK866NkIUpEnRjepVbGGEbbJhZ7sosjP8B0V5RzTGm2hHJ2BD2KT7IL5B+Sy5duT0jKb2d3VjEVtT83vLlvoXnb7CyzOmm6fUXJ/9iB/XajHPeNKj6rfTT46lF+rZjSalhdgK7aPnzMK3Zq/6U9Bo7Zp5++zjbuEp75zG3gljmCkPyO3qoXUNuWZYqOGgS8vrlEV4vqJNok7eyYFbiiZQ3C17Kyjc2B6dPUgEvSq6YoGjzUWxPqy1y/hI9aZOHXQJsPjOV2zM+cJ5A8+6wpWTZ7vp0Y7JRwo8eChkQbWFPqlXRTdyDdZ86KhoIZJ254rt+qWWZKqnnQ/2oPaoF6n6zxt4ctZFpJ/oyltB3ZrLIyzoPcNK3/AyL3S0O1cUtdFGGjWkGzOMTH+zducKfQXVIFfMDYvxfIVSrRw3Ig+ulZKMVeQOwkzwfT9ypAYCSG3V6ruPqier2YHUFvpFRk7fTxnaCe5FPk5d+NndImOuIILjaEkRtsINZx7TxIvIJYklkHDCYsBxqAptn1QL6WJj0xgAQAaqhzBv5FCkf3McUYXqE9DEM4gehqFyvhRTsmu8Fa5iK36vsjMLfBixRRW/JYtwzHcBGIHA+wSwqOxBFdqYTCPb8SIAbAdTsvmz7ltBMoAU0tYH71s/lWw0ySZDXxbiUCYsswdAoqi1ASD0LAwLNfgNc0mErLlC2rDJYRF7pGR86E4rcKoYeh+VjQ7ttUMlQKCh3xJSySh0PJq1UWpgzzIpmgv/wgEodvzLtkNhYkOjbOP5CzReGURouYohBaNGVlPHZ5bHICcckqQAq14DvXXfSkrDuB5mDRUzzn0e47Eh7zsxPHIXvim/DMRK7YXPg2rLCoZnIc+O5UNfq8CM+el7D0bLBxtpnZkiV7DI4tE1gY+I82fBhaE5uN4OI54gPFT87DXUrZ9qepvFBkHOgHaPEvqcgbc+nXAoc8A28ejAhlEBAIKdHNchHkCcuec54Awh8VZMcdpjtiNSHY0R14UN3A4yspYhN4IHwnjsMAsxgk8W4ZlVXiVhHG5EXkHSkLsA3BeaH+p7Mvh34fOgNBTtIKZr4c8d2tLUIeuur5IvXsbV0cDnG87o46PArq8+AYa28Y9bP5UkuXMI+/xCMxeBYAadwvPZctWpArs+8BiDB4LUhWRYZla3yJwrdo1V/31VK90NiCZI84qD/3qv/L+H0bz0ej6ZHtocjNwO2VLAFzLrZ0r+eRaT0OAxJyQhMxxQ1D+2PNHAmCRn6An6+uO3PH7L40/QX33gMc5c8pw8BWKMPn7L46MYfdzw1dHRp4e+esvjwc/oLvLFy8FD8TJhelkjyT8bYicQ73+37G8bleJ4b+U/3Pje3/jV9wxXHzaMrH2L5jCqRPr+1SQlURg0GRvNMH0TJ7R3jyi2A/36wBfsL8zcP+M1/txhTxw4fCDG5w7V7JmZ++37r5mZucN2daN/68ggwzAMw6DqPmN/zf7CjO3dP8t/9//MzEzd98MzG6Zfr3vq44kDBw8cDBM/eODQ27IPgvw+VckwGuvQqL59nzFx/8wd9v1e8J/rmX5MBar77szMzMz9tv6j5XLGm/FmZmZq+41qUL5qtbrvs/sPZOPVmZ/JKrInjIffXg3yVq3SB7yZGD/jqnRhE7Z7f/zsC/Z4TnrHvZkZ+357xp6ZsWfun9CeHXSvmbHDn5lrTigPDhw4WN1XvNXdXX344erd1erD1U99ZGvl1hYaeaVSqVRa6BXvrVT+w5bO9QqjjV7h+7li1xQlXc0w9ukWNbUm+vtxrzAMg/brq5Y8+GbcSH1fb/ZTpNbK3Tm2N9c17xVGtVrdR1N6WB9KPyycTXN/mIRhVKuGQzk4nBPNSXp7Ncxl1aAjqTQy/gYwlZOe3gymtWdVrYS/SKRW6durLfQKI+gVTvVTH9la2XJj0IJvLNrUz9657Xb2Cy3LAvysU2y4FhSflGDF46jZ0KJUuUKCXy5m9d43TQtG5IrdsIz0Eomj9ufgtwE3S3GRsQfFGBIN/dOCFXGK3GAvJr2P1Kwm3gKIkDtoC1ydWSICjJzDjYxt0VreZjyGaDfMNGFqe2yembL8l3m8A4Dp+8GYYvrwtZB/rhm9fRqOI2PWM40VpUEB4eJJhIyPSKBY+PoKDYUFbw+GmX0Y71bE/D4CeG8yhKVlP1VfIUDrGnUPzWAoThK9hlPn1wIEKSUgZcCQy4onS64Qo0zajieQeM/wDMsyLSs8dJu10xq+82I86jBmdcmdxeQDbsCO+G+KqQMeADNVOk8zsnZt4+FFJU5YhmcYhhEch1Ql/XdpCouvAEJEG7V2i67Fd2Aklisixsdi0FcoKFzc4KSv1xyp1kap91RoIemRF9OcpnZwq1KO/G6eq9vOfNgJ9lKLyFYc5SOvgFuRWRR67tfUy7nYDRE7kdi/XkTnK7rAXkh9jBxVcMp2U0fyEvQ0IYL/Zw/Z6sNuGkRpDbN6Fs4rYKqta9qW276oPuqYlbRoklj4PKhu8BBSH2Nv81BAmgfFHXF3V5zd1N5csYC6xWy4NWeYyeEDptxhzmWukMGvQK7oO8fligBZ0rbeoPK6nc6Dopz+UxwRO3325W97c8XZ7hYtfKRHW7BGpUKXK+YyVwjVUNyiOV+ho/C8kSFRqHJFk8MvjTO+LldwjmScD1XevRVgIbjhgEYj2pwrcs2Gz7qqaYqsim8mx7cwuc8mV2Thub3q4aw5zhWJXHFunK9oF+3KFSNzlGSDBvQoZMGW0+5c0W10TJ5vU65IZWGOc4VizeD8liv0Ki4sV9zW0tqk6a6oGfS0Yl297bli1ly1924URWBTsQN9o1254jZWP0TH5IpzXV+Rj/xTE+2FLIJg7VJ8kF+Yc0XcGzI6RvflipQl9TntQe1Q5IpzXV+Rj2x9RW7IWS0lz4Zmsn4eujFXdB/zIFfoH6LUV3QE/0CROQ5mYG0lh8utXrToayJL1t9ONjg6NoO1JjLF34/CRqaqtuhc4WVvPbQkIcSM9+BNLR5944AKLzQ/mtOF/mOyZ+ABFV1foYU8e/qKxXW+IoEJAK5x5w4wxT/jZ/iXvp8kMBE9AMDLlqnGilP6iqKJevVjfhIngCR+4vEz70wSB08EJ4CYmMC0okeJxxpXY/WPaeSnWz+pJnjnjjgVJlodW2HzTN84HinkgySClMIbKY6hAuLX+vmXvkfv/D6Ad34f3qvRyxzmF3GNqvlkuK8mT1IlSkEp4Du/Ryc0f/Xjr0bVwiA+lrOUnZNcsQuRRc1z/nxFA574ovKhcGgN0J88NJSvjaPae+r5CtDI54qmxxeTEmf8dQFix7rEUxIPZ+Ho62v9IFXp+7Urfa74xJo4FWLMaM8mr4xyFbfksCZzuzlZ/cAy0+sHTK8f0yvjbhDmNxlo9A+zltQhaCInCWUXwluGV7VnV0TJBAlpOdM/xNYf5xUjH2JnM31F0W6xyOWKD4WWkYIfA74Z8zrhVTl80GhnVmt6rfgK28eI4iSiOH5isg3PR+IT423V2FooObn9vq57dtTX5AacKBWmu/VYKtEJZwq8oZJ0aFYTDAAzfNMPma8m3sEOgSJjlpCOlE5Uo9TwJsdnIQuNZKZn+umvGxtR5fSxytSHKPUVbaJ5xc2+u1hcC57CI1FLCY3LhhfhSWuFSdqCunxYq4psuaJTvvZu0K72RKkH/VwIMRuNq3vQP0Spr2gTW9vsW7pcQTn6vhRuiwZi27ZtO33e2U24ty0UT19G5OzfzBZnweast7YvNRnKu2KNrQD0D1HqK9rEY02+XxE1VEpfUXhgD2xVJs1GNxql0kZ0y5+5BdRXUNlzRe4OMjesRzKht7aUadOz1SGCxLUPUeorWoUXnPp5OjsA1iNqtfGtGMU1G3qc9Ei40uBQrgjeF0EcrmVZ0d6obqMtr4CphZE6V4Q5DkuRsYJSbMUUqUfGVuTwvoJy5duJIyakT0c1Q8tqcv1DlPqKNuA1i0Vp+XvjVtL4ZfVlyiPpx9kYzt/kSZIvXryURjc9VyirotkbfaHh5TFY7eVUQze0jfqHKM9XtImv5MSSZ5E2xYMqnpds1xrp1AtHmdLo5rS2FuSfPOQxkYqjG8wU/UOU5ytmRXOm9Idy3ihsZ5ZaUCg+AgRzz2xboHrquQnobSGntTWXfwpsxuqYs8d4AF2ZKzrIgzqvzle0ghxPF6mmV5wHxbcVOVXUmHruK/rDvLmiSMKzY84rEwCgbswVneNBndf6inQsqhCZ5+miXR5U8WmlBX3FSEF9RSvyTx7SJxwiyaWlCYcLzhWtcPSb8KDaHS/PB32F6zehpvi+hfRmiQs/1BiYSY8hQtoY40dJkmKHPCcvgXW2WC84EjtDUox0J0uYJJctFG843PmBBAF7UvbDlaNMLcg/eXgaNdcNcuoCxFIiNIguszuG48CJld0kZXpHNwsNhrYUhXkQp/KsgQclQ7+sRI2a9lycB/oKwzCasE+NBiNlHoSvOOZShtZRzWMeYCZGSEkCZvaQ5tXcmgs3avBRwyRn5yAcTYvngRUDOgX1FaYPtjkyaGYzk6HSVmEoNMpW5J8ckIGKYQTxGx4MCDs0udSgldQK4NjRbMKcE1KD64PT7jtlNdrSFnB0s9i21i2+Ddu2Qwo0c6oDzYY56Sta2FF+9vpnz4pcUT/NMY1MG1gIqL+hhqyYL9/xYLyI4tvujQLSKE2fVhMZZ+LYR6TDJ4zMBlcBKj73IOw6cSS7vvoC4TV1UDFBscVy4EXNUmVOAX0+6ic7W8TTp5SHNAVQbDO9OIsxDzx9mpW9tKk3wr/f+QOGMX5VRkXYDg4sjV4iBhdrOUwwL1A/EtXeXA2t/5ME9vdr+x5vUd/tfV3Jyzu/ezFJFDYfKHZiOO4Wi8p/RUFcyckwqW8dAcfWaEHr+OMHXSt+nnSlx+UleqQObMexoyGLs3dc919p+twT+cTASBiQb3fAtrtEDToAN5FrChbPs+Cu0u4cvkIrJCUaiw7xoJzLtLIeviz6azWAIw3Bw7QdwQ98Qr3jZ5pcV2B5Zq1W0W6dhB0vXW28sjrzXV9fx6yAw5Ci8NY4gMCzMM5J/xWMKtvVoDLUiXvwCba1Ang+DF8cjK+jsYIJY1SFeoqBBDtRaxMBt685h4iXwOOKaUZiYzT/EIQUGrPbdC0DfmydMvApUwAu6j1Rb3IBQ5u2HLBIxoLOiBXCAaLyStgUup9xYfg5C2oB/BB1MgCY8HwUlKN9iwxfM9npkwyrmm1ihp9l0NMKRBLLBWC5hhdmuli3mNv5ikUgV5CzBV/cojbaQDZ9AjZ0X76W5d9RTdb2tymtiW1b4WgQ4AzZYbJyaHRL1Ck4DQB+j+/GDvfiTyIhHKimDQD4PtyolxbUV5gucHUsC1nphm/bIvFCPOeTtFFWtsQuxQngMHUrxzlTsNp5GGSZpmnC9Ys2G9eosa/7H7sh9iFDJIHImnWDNQbTZcCCBcuyAr9Jwm4+cjXD3PQVi0CukEJi6M6gLtWzQgNwbNIK4PkWzGQVoyzWSWiJcLgdyQBIYIwRdpGG1svbIZD0vWgGIAhIYKPaKQ3Tyhw/OazpJs8N0/ONsBheym0WE8CR+NOhFRSTDUSjgM2gaGS0XAhsz/gWgVuyoGo9wIQRNuGwTWelZpLlWl5SdhPPrI4mCyYBQrgQa6gZz3ItF8G7XpBwC07j5C5FrjgX9RUCdkGKtGlAVVkkeoDGtJiTI94cd4omuA4HlSgTHQgzOKVxa8NKGTzDhGmZkerei3IUEQKZle7cIWUnAwi3nZgQN2nPcGXKp6n2Et8edQHDgKH3g6wT5AYMz9BWuaBk8ptFQWLACDOXs0eYgfNAX1G4A+mfqiPb+z9QD02ks9IB/W4rgl2HeFCE5lVqIl/vHfcYM23iPRNptxYtoXAqTXDO6ytUnk8+wzn9YitZaJAowkRSg2f6NGmWydsUivVrM+0VIp3HjtjDzc3B9pyHP2j6xtyts3UF5+X5igLI48wWhz54akv7oeJcoM4UsHMbgFnwMldQAOU8yxgczl5vWbTnK7p96kvjQbWd2Hbty2rq5W1FuUD5qSdOk7xZtjs7xIPKhJUxHwRgbYAottBv9AjVPlofExb8+QqhiHUAgI28AU7AIyIA8N3I35yLGwrVgMqLaWYpDBRHI6WTfpfgFKrmhz0gkBdN30Ric8nZIG7OlCuCTZeILyWTpIIB1PRNH5E1EM+PuVtwU+77yHEcigyK5AtKWUwhx0G1mZO6YJOagO1Jrl2Bh7UgjuMo724P6xnwAL+YumLA87P9SDnNMpZkR/kNtDiwLYbzFSQhcb2mW7gVo46IHT5sjO+7AJ4uVgMMXB+91mTqTuKQzXa6lb0QIDqZ2QAAcH0rtMoGDuubQaMyvQellA6geGDn9LxouoabmOzzUbOi3pLamAXTEMnByLd1Hg+K4DgE2awAjk1663MGAQlmIpKSHoIbdlCfpR7pIADl3WgF5XlwvWL+Ne84aFq17OlC3fRugO+6ruu1uQhbDOcrWEiiZ9Q73scghjhoq84G3AojZMUZXsG5kuAM4Tcy7Vt6oPiEqs2pTUBiBnSGW5a0vR2GwcEAaYQ+JwkgDAgAH8vckgSGw9QZsAdAakjLN4woPx7Q41lhnj3DUMZuAHwL7NG4PnK0eCx5IHSpqEPYCPIal13aLzDs4OCULRihF0zPEymPujxGQ0LZs45XUKZvQOT7EgnxkAe3krmDYMusJ2EGIv1265jb+Yp54kFJDEBVsAGAFE7A4BAPvPDRz7jhQChk2mBRBtjBqP2huzKnZ4sD3WkAg21lwOYq+UOj4UW+LuThJ2pXU/xt/EccEdrYkyDKrD7XYnJEmDw5ZLOZZNRyUScr1IKbgBuyXyxXSO55+PeVDNHjd1YTdUWuFo/2Dchmshqxgy0vJNcsZLgMFAAkDJPDiRDgHih1BsKYo5hI2J4wn3zf4EINVkhRv7qakWOAsmOxxMs9tWgxGgYvDrETCQ9qamHyoEigOnCmekiZyd+4m2S4tOChoePVw2Hl/69DOOSvLbaEIhqvHsp65rx6SS25/JnntRitN/nfj5hYNeTBdY78r0OBLEFg+s2QwUoA4LyRtTA+XH31EiOOeN0/1o45h4gR/Oe8fkk9TtW1akf8IH7n8O7D5Cxfo2boqYs4oYzlVYp99NqmBWEC/+x33qzeWf5nv8ugoOBMNecVBwAOgUDOci2SM9oUe93XojwDb6m+GnbzuFjN/qP/deh/Hf5J5qLbdtzDWYVycMYjWMqJlZbOV6g8qJb1FfNjZ5YdsDOgFotRtR0OKNIEwdFQwFE1zwoCBqpXZY4gjKqpkjV14iaZRRifAPC7fxilxgCxE2SQSYIYWbTrdOo9eGUtmML/cDWUkc/jzWPBFw9a0h1/oEZ0kolj0lIOk5zYcJZkPDM9NZsE49OfVq6n1yIhJKdTJyhCUbQ/ZQKWa/hrw6JS9n/B21kWaZmcvHmaj4HdNj2zATt2NtFXFO0W86SvEEKA1YNzwAAG4oU9x7IvOQQqtGnLArAz5QFWNcEm0mfCGPD9zF12VWq/BwQnYIiAGELYzEHqAyI39SQx3zRxe8AwCUgcu1GBFbGPsP4vWVLwEsPhe1IZjTvFLCsoht9UP+CbniarMN8A3w+rwzThh6kzEyidOiOZoWJ9RcBKiij14Oz/AEcikqmaZzqnDm8EpbcfCmNR6CuY2U4vAGKGD9sARyRxARRcQjbGmHq+V1c16E89Q6fyZEnN14KDbeUwxzEP1wbbyECwdxXFb3heWkVuJuwj7GWIeBc3HeUNKnk+p7icVWem5UHbbwWegRHp0D0AJHLiFUnyib7CC+2tF+AX5NJc2c6NYysMtVOcg/qKAohG2U5hRN/0S8VcVO/atoGXhLNkmrn8olwd/FaNJtwZHlRq3Zxf5Ury29tIaS7q+MdayWcKi0Ff0QI61jcomUEbJu8WvlXbBECNs5TDLzL35qmsNXsc3edB5SKH8dEVnO/2oLoBVbY3gRu1Z8Wj6YwxsBx+kacsgBuhtYzu86By0RE7Ui3gfLQH1XV0xmhp23PFOm36z+EX5a6gtJbRHR5U4b62vU09c7tIfbLW9BXBr0V3vqLrUFhDnpkz8HiZOyQA8Hy4KdsSGMCLWpSpucJVNlfyLH/qLWO2AyOtn3oykZBtZsV1HSP6FUPqk7UvVyzS8xXdQJ7R0vlYiuhppKcqpYHlWf7UWkaH7EGlcGvh1pYz33UF57v/iq4gx2hpt0nsQNoo+fbsgMXnio5YM0ij8BIx73xFV3A++q/oNjrtvLlV6I097zRPXixqy+iUXzwdhbcTeL6rcC5yBYBzQ1/RaegTQmfM07cAfWGUp6/Ii0V7rytT3KPFpe1uJJ+DjskVi19f0TmQQkTy9BppYdhJXOm2iJ8kR+w8mF/Vkzci9rYH/HRtrOFlTn+Rx0JrJMycNsOKunaVR2Gtp669yESv5+GFnNL54FiBz/SHOSl0A7vhGUk1VWZ/QcGisAdFAL/aP3u4ueHdP1Ydm/uvqo3/jBqQbwe8YuZUrDM5D09ekfGAU6lj+k7lovaa+oj6lJD33n1Ge7hEpceRoYjpFlZrWVvS3BKCZwKpkDNaCsdyhohl2nvZ7ZJSH3dmVSEqGzEOrlBv8LGB+Bmg18QHWxqc5mYPat7szEq7d1m77xaF26Ne2Tlf5uGvuQVnydwKejX7USp1remtVW+npqIHDl+uXv6+2ptUeMnHVm41D5gKeeKSJDecu7HVk/0oBf3j/lzhFmzqjWK/eqEPOa2JFXM7XzGPcsWsp1QUoxAabbXo/XSz6OpOk+nDzHeNWjQv+zwkRUqbev1QsZOgLSDwiRGBOrRLvUlj7D5f+D2G6fum6fumaZp4m/aMUiFbwTmjrzBd13WbWExp9f65hG4rVjrGOuvI/pTZQZ7XuaKvcJNf7lzuL0yo/rmLgwe7kZcuYA5bfJYV/N+at7BZcM7oKwzLsoKzOJbV5v2zTJ/rAhaLgkifKza20v9VExCdXfSeC/qKwM6uSkkK6qr4/blXarfWY1mtZNbVy9NzTbmhRJHLgYa1EwGMa9tKhPFhZQfMxPNFVmUUyjSKpNgZc49Aqa9Y5Ch85qeTyD4g1xnifEt9y0PcVXPJLy2hPF9xDmM+CFsaOuNFu9W+FU33nRsEyvMVCc49uWK+0Zm5oqW+ZbrxceFOncAtz1eomPeh9ZzDWZkr3MgFWudWUOeMvmK+ka0KXjjozOTXQpnanyvURFrqW55leYFN0U7O9YtVX+H7DQaTAc03Tv59D67reijgeYscpIz8bYdl+m4zo81+nEDrJSInMj5OqilxIuh7Po4DJzKOTMB6eF5QCDOteFEnP1Nx/mP6um4/Gx5c+GqJAt1201nVcVLt2TSLGkNhDLgwIzdIe9L1nfGSBOCGb5mm2cEzuHPTV5wtf9um19I01RSegZRf2qz9T+EM6bSkB7/mwWg6iBrI9SWaA+LEli3bcCLbVlI4rNt5sqsOZPTUxk8Rb8Tk1YkLUY1puAZUE6zZMF2La77qRcKDAYVDmUASE17Qyu75QJbjXx0GqkYQOzygormAzoSDxFclAKCy/94i7xXFovO37c1MEuMLn549ZDaY/N70naYBHdDYIUtpB0SnGaD7P934A7+nTSuO+/oZAd2OCYyJaDweesB2cET9+P6U0igdPmr49IVP3/9pMPCFu05mkBpNiJcn7v8UAOALn+YvfNrvX1Lg64n/q6dG4yqZiqaA0FquCgIIGD+t3OIeoxgLi7h2hu8PPyaDJlC1C8l4VD+jhuOOya1z87dNxWnr1z+L36zSxRPH33L3rh0tCrYEaR/XNrAm+5H269AGjq4O/g1c1072U9NR0IHA8RXKDXO8L7QO3PADen1NphdgNQrXML0jlyU36P/3NS3A/rWBFVWmwVHYrmoE1u1BNRpMJQIHrkG+Ceyo7ZWOrop8W5uu4S2JGK5MYLpmbxEyfJ1gHLhKu0VSNNmZcDD0BAa0W0dXZ7gvNV3jyGVBfoN3bf1jkhP2CgJjUqPsnljlIDZgLbPNL2IumyefuW8njmEYuzZ/+dSJr9/8ZHB3odmZbcRGUHWO0iRRwezbkLqy1fNRlVUH1PDjONza8ZYY/DDqsQcj0/Qiv8Ykx0YFPFWF66Ea50cAVZLgwCamhKO1BfVvC2/dF1cYwynkf8w0K2xhCRzHcUJZplpt2ikAY5Rt3QEUJW6YZkF1Q3UwSAAgcjBQpEVLiKIup1rFItVXPA9pO7N49cgHyYZTchkVTAIgVbQGCGQ3axpCoLVlpYqKFXkwclXbZ/LOVDkJEIk4SlvCx+zELi+a4Qr8K1gGYvuGKgMfLZIn1++JG7aUUkpp2wJNkiH4NCRDd0nhPYYR+dnIBQFP2GPh3wQWxdq6kBLVPCu37WNu+oqzJVfgWiIeGm1vsghMDUs49o3QLO7nnKDx9SURM2A3Gj+fy7y9HaYLK0jFwPpvsR1HN6RzIK4FS8iQdmETIOAAEBjCrh1Z0XsHzfXfinI3uoVAGwusn4IQ2wNpn4CgjthuVlG2Mwq9jRrwrSLjJgsGtB2FPGk77PqBd4KmtT33VjY3/xVnTV9xKzPGCu1UZEHYwDPFgnK6oinjszHLtj/Jw4ARC+rm3ihNsm1sw60KNdR8XvU+RgwbEEII2GNIdQo1L573YsxgsseAgh5cDQAPR8fCw0Pgzbo+2ySaEKSK6ToYWpTFjmwwbLvBCHunsDj1FY8CkHMbE+YmlMwp6SzEixUv+SgEbNb0AJ6evHIcroHHqreu9fqDYrqywqsBms0ZWudBnToK2IBFer7iVnThIywkHtSwmhnqCL9or95JOsNZisHxr3MFi+98RXEzRC1gIX1TTWbhR9U9qPYOMTTYae4MZ0lDlOfiJwfVkM0dM58VLNLzFSnzpsXbc4da/lyj8axZltwKeUGmzvff2pB8sDtEDcYF9CuVPMcdnytaqpOims6zNU4t0vMV+raidIpVoAQcjragAGRKg0RwYlZSM/nFEZIahUKiZFXXQJLSCFO+Cz/Dml7ABbotbtKOIL1wj8JpxhMS0mGHtT1NvhHwIyaYnn+KqjA3n6YVyDqNwzgRERyHnGhIJ3YSdUgs4MSp+4EhDgDwfdSCsid+ANWrBI4jq9rUGLCwpBq+SU0EGwIaGQFO5oHGZlik+gqQKlWIgqK3YCdvKzx5wqgOkS0dZR5X+8+1IG62ae8EvTPXdj+A4OtaKX9zylMXDBqUMujrcoQ0e/i3goagyda2bds2Qzio6h1IO6FKj4SUQ6iLk1w38HBdzhbfCJBgKQGAJATHrMWo2gx2wxJZgBGYjTBhuYSHM3qaBiHAdKvSnwvTd/XeIuEAsgX11iI9X7ExKTXzIGzYWb40dceadoNdMQXJfZL2NnZEEKnNac/2t4Idu8mm4MAAg8JPl9vaPGO2mmMes21msIT4LX5ePbT/KHgsyqw6Xgq2ha2vmghWbP0SGI5qgeXAQKG9Bc9ApYpmw3hQMxCiagsiAguHyRFaZTPMihXG43mohzvPlgdgO2XEmYrB5o+l/BOKXBeSTWGzLaqihdcW6fmKPfFf7FRHAXYaR5rGtxwHQ6LYRCpvtiniODh2yizAxyCay4IFV3IATLg5QU2QMvsJPeTzGJLNNuCYHJmaMhmeXzfj50pGNxTLJuDnMPwcwUBVSgmCHCKHtZUdAV6kJfVNWFcH/A/PHbCAhwqteDcIJ1VLN4KpdU4DQXJLVIg56Svmyc5sHgjfuPPUO14sFDHT5GsDg2NFYmWaMuI4a2xoWvAlUwY3T6+G8YMFogeAw4f/a+Yzly+txSlM+8YJNdLTNd9oWlw2fOM1tRHR+CE+zNXw6tWLa8mj5/Q4s3MJ4+AFtayn06gtDzjvJKSAOP1WVaSfSFJ4pYqeNwVCtglpcd3PjFPF98BTahsz8TyvfxGF3tVRu7CVTiF2KnZmF835ClUGEPITS/6lMH17P4825SvocTLb+3SygkYNySv2iSsL5YOYuJEykjzWC/TWnyoXh/MKe0SNU14FZY+3ukRjLr5SLKMAPv4H2c+mEVanhARXtA/xiz9O/iY+BLjhUxdQScDF4flG8Q0sDVOcRxJrirbPV5w1ueJLyrcX8GH6jS21cUfFx9uYRAG5AgKP+FHjN03fbLaMaBK/b+KGgGCaf5qMCE5T4gQAz/MMJAfnTBM+/k81wO1AnJ+IrojouOF2NU6bSNlcUPxtmzAL6iwJhHsyn5rgsNexgBhIPX1aE+sNGFZwOsoyYBQbT00TEY84jMQ0/TbOOZpBDgtjkeor1J1ZJsAzmp0XTcMw9xY8k8G4jZIdD6NoQS3XfAZCCCFE7uZK4NghMyumYcQn5TyYhm5b7zogNomu+Kr0PMBMeUVi2JEsTrrCwuuILsCLOWIEu6GffSWh4BMjnm8NmEU7BWCaVuqOUXgjSkcrOsFFqq/QwF8quJYzvfbUfWZO9PpGJryO2CRO9+nt6sVW5BRX98mYTRQycXtbOUsjz4dqhvVYs32yPVD0JPjcsGj1FepFoaMCja/lPpzdt2K+T+FZ9hwLQJnxtBkg13F1cZ+MnfHemKchn3dngh3D4tdXtIRcQ1panLcVtLmVv2brEPQVVN4SonhL7EybzSOkzbszwY5h0esr0NKKsbghLS7oDUFbQXUJ5nb1Ks9xtR6yeJxtI8/f9uKdKxbp+QoNDMymS2692aY5EUXesdq07zEbPG21k7f08VLSdvZazWtlBZU1H5r4WM5bj6HpiDWXESR4t8szM+4TOzGcrKDCu4tNruhGnB2zuNUJaNND7hCcN5G0G7JdLN65Ql9BLRq54kud2FdMQ5crFtJpC13aLhyyeJzF0YIc9Vgnh655kd80BHNFbZHqK7ozb+Q5B513pPUVBUMWj7Mr2LqQBpYWQMEeVDBX9CxafUUX4iywMzuP2K5e5Dbn7XkP2wzZLhb5HlQkVyxWfUUX4uTbupBAHnx4sdpW2yDwPOBBNWv1PP3uHxaumOIrqErWVgY8GMnRIeZUe9gKOxqxOChgO+jE1klrCPN8VyhXLB57UBu7scDR4sybgGqn1CtaVcxeIHF1VY7FqddzXu1RE9RDKql78LBay9rkJZRZkq13qFevLlUu+HhMaWIwjuVk7cxp7UoLea32TM/2hZqL+vFJ9WpJNHp6gG+cmMlOXUfRD1EQ9w0HckXL+opWekUoV0zOGrAI9vQrF12ZN0Y+l/3Qu1gLWtgzMS3Pfja9IufFKVUcq2khU6kv1a5OxdbUGpDSV/ReoF7t155dhkzQgTXq5eHL1avf1+LUCkhntGimtQo9oD2buCI7+VRmOuQimoAdOyMraT2JvqILnNlFJlfkrqCuUwlG9JnCvZLflnlMGu9AcrJYIxISAe9QY/GhMGEbUtcizZn0U/oKjXZcz9mW1liOilldE6YPQ32MDyGmGgcFjKIAsd5yfgXkRFVK+Lj2rNIk3eaUy2rHhkexEyj1FU3izOtqGvmnBQmE9mZPrnuU1PVTmgw8n/lefup5gnmevmJ4tuoNrIq0ZJJrT06cej5zJJ4g3QxuWadUTPGZ/Db1FWdNrvhS1+UKyuFBPVq4/6QSyHGlkq+BSYmWQwVTz9sFuu7r2c9y+PbBk/DQOiF1HisHeQXU89m0v2rpNkfHVUyhvuLJ4KrUV+TzoDTyDxXfw83raVm836aF21Yw9by5Iu9ZwVE3v+JTT/OIzQXmiqyz+EqITo2UJAUgSn1FE+TVsGZ2r5U93BQ5Ud1m3BgZS2+WkbS5wM3ZqWtblx/OMWW8vcm9UHOcjjRzJS8RTmOxvrlVujwAmPgwpEgKv1V9FCG0BJfXNzqlYmKBHdgJ3ATAnyr1FQryhkv9UEHxTvlITq5zTfnlPGx7SMhZvXdHsV84zqYHSIITjnmvdVzF9NT7dgHYdHLR8KDaPV+Ri8I8KF2uyFsX6ciNM+/F9ENFriieegp5K6iuKPYLf7LcAySdSKAovgkAKycXDQ+q3fMVhZE7XOqHCoqexJglzrw30w8TuaJ46inknq/oiNza9mdpk83bgoBXDDcBwIknI3VNKVfkD5f60F1cXZG7r9VwR1lDpx9uVkIVTT2F3PMVHanRjq3tGmSJ5tJF51dQ2AxcdnOpr4iRW8X60F18m/yRHH1Fu3LFLKnHK/GGNtowIqtHpppVb3unz/PjbJZM87WdVJD5ZscQJPG+XcDUk32LRq7o/vmK5ML04esq40chKdFEx8sNEy6nLNI6DmKr3YzheIcInuvq/LZHQU7gPywIThQ2PEmkn3i7VtEnEJTe2+zkwaATpq4aqDJheg0jsufGhIm0f+WMPkAAODY7Piv5L/tYIACSMpwDHHBiA8qNk294S1JiNj7MT2oq9iN1valo5oohGEy+CeDEza8sGrmi++cr1BVUPUVjfQG0Uw6G1ZxIC54LMr+tRWOTMxoGJEdxT+4hbX95D1gIZkR7qRyZV7aZ9dXCC3A4tMJGMmZEAEjzSD34GIsMQtlYa2oB36+FvQEwjMiaurm2eaWkwGxTPftxC5/Fx4Ad2c+2qR75QjN9cNTZbAVBOLZtW6pVo4lYJmB4Rmwqq9KGa6ybAOCyJ6MVzmKyM4tu86BM4OrqtKsMn+8eB27m0aiaVR6h8Hpe01jf03SnpNBbusOniIne9dy7nnvXdwBeqpqVNF81MlTKbPD0zz/3rvhnI0BbRsOHDp+i+z8d/H3/p1NxoudVQ1GC9IDCOL4Dfk+fxmGtLInSfvd33v2d4oZccyxjtvBZ9HwuAZNnAnBhXYFlOYxdf1JlP6oVb3pT7nueC/Lw7u+AJuBwq64ln9q1+ctoQ1+xEOzMdg7NeRyej4OYWKM+Xu3AdqIAav+x/q8/XuGpFIif+SlXObDlyACvAIGxHMtxIYgnlORMU6ONpnB473IkP1XwaPCFWUCuIDwQ5v6L0ON09fnICNNejgsJWNavzizHl8flu5AubKFB50wWKWTTSPzUvOmLgyYAWHBxR54w6k6q3+wRZXjyMLkGUZkuBODEA0kRyF1AIFcAU4vGzmz39RXxItW0UIMBVdokDMgmcqwH96EranVPkUB+i53YvqkAqiSjxXNVX+d68P0B+L7pxz6BgtT9uu/DYJWoatugSEyQ2BAuyAF2tAUFPMv3gxh93/RRdzhw6wKnKiXXlU5hAnAcGTkP3ve2YhVm+r4ZuKMogmwDoqj7A35QcBO+b3LVAwDPrRnWH+d4CoBnq5Hq+8kGHFDw1eA4hLFWllCJXIFN0cS58OWKrusrlEWqa/WkyBgsHBqIxDdNAvElkTqBfgyU2MKmIY7MRww5A+mtRYb02YKlm8/x0JOSNCXkIEX5kUO7bhEyEMylYwstrAmGZbmWZVkWLKyjkP9ICCSVpPd6YNjRYE7gvbM4BgvhAm72oYaWPstBK9wD8wGXgkWICRpw3cwFiekDqt/7RnVQdOSKhEDLJslDuaJv94qwO5RyhfJNPQuuka5vAcjAPwwre7gWANdy47+Ba8HJpDLgCCmYANgOaIv+ES3PN3xqHHetICdJGW3aOcq2E+VjVIRSCwGQmhcCz+xRXXi/eDiOxnaAjdqmkQEa0MpeZAYwYMLNHBmzPgsx6cwuL6i3wIOmYcKNyFWwXMwyF0nFxLwq4JkeIGKPUACp/acgQrmi1FckUPQAXtoDGAGgWHbTatszYAWDMwBgDwmOQ5BAyIEj25ZjqdRNw2zuF6zh5g5hU7x0sBF7bxIQDTxCK4pTHcAE2WkdiFJAxiOFPdB5XvEmoFWvlrrnAUbwD5C4R/MaZk497VTSuSqmFrUrib4Cm2qlviKGvkhtoliKP7K2TW6amm28rHw2G7rM4ua21aOA6n3ZqO9rHiel9eVb1Xi6YwtLi1RL3ZyjmfJmCcwNilyxMlpBLXy5Yr7tQeUd32nORAq6huZnow19cMvQWlumLQxGeq54TMlYhyizuZEU8vbdmi2P7vCg+p58JbwseVBpHlQewTT99efTvl0DZmltEYOIRXquUC8607zyPgvlUoTbTK8rPKhXYmMOpVyRruK8uSLNRFIsBHcin03HyswWV7y1peYKNfIu2MLy1KpgsJ5628admquY5o5Erlh582OLRq5Q/W0HNVNshF6f91BdRAAcx2laeCbzJcJtHC2K1Rk//JMlRQQfomAHvTm01YLpwzQRFKiJxz+ZsJpkwogC0HSuiGKOy85wKH1iVJErlLIHHDCYSNb9Jpo5pvOaCwZWnHk/XpcRHEemUk/cF5tq/KZv+rofPO2pCd15ettHTRqh8KDw663KFQvDHhQIfhHPmmawO1nYT2IIFzCQSS6bTTdEEoNjwa45CE4hOo4P+FZsNiatEJCATLJHkOEZfwHkzhUvHkbsqloi5Un2Md2UQ/iv6cIHfGX0C4gYjaOh5weUwiSWYMM43Li9gsEINZ+SmCjddlzLDbZgXQOuFTxzEbhUSxDSQOABpuf5hpYgeG9HraThpt8BsPJEzIPqgm67i3JFgAKSWeA4tIDDyIANGm4nNbqlEAnCsSp7eGAg3INlhijGUQvSC3Z4G1zpBtvCUfMWKfszWXJFlMHwmGfDwJDIFVrZLQhjQM2AB9/iZvNXQ6QiVqIBpiQAwQFTuWsLwJo/Pdeyor7vwUc0EFgWYGmMkiB11/V93/UHglSy0p87nsJmALsXJQ+KpE3FuqcH9MgMmwF6nAygNxqmgrjVsVXpVjawdiZvd1+lpDFl2/JTYLrqeGMAek+2tWiFPotlzRUegLUICHI2MSi1Ck/kCq3sngFUNU1dzfKajsgGAPipWKOgnhGwsMLUbeAfej31XTPS1gV/GPEDVLQ2pqVuwNDqU+VBzRFz4kEtCHtQAp9zi+0lDo75rzkQWYGT+ySBcSN6CUwTB4iVH+0tA36mArZyQOlqxPV8g0YRLBfuYDjDDL5AwBtKY+O7PwwAHDiyB9e1PnPrJ5tHabrwD8Wrd2JivQlt/cf4mVJ2MIjZV7bTTbryJ8TY8EI6ARp8AXRCM4bJydqPN4y5B5JTIQxPXReysSTxwM3uz/2IBscGxwbHBl/YMOabWupTflz9g2OoaV+ig2oWsRNomwd11uSKj35KuXDEF51iLOEeh4ZGC8y0DOIjUZQ9AI7lGDv1kd0nl7xZncXq99xbZK6Aa00feSk0T0y9AEl1rvhPl0KxTVY/vFaNM1uuuONJqc2o/kNqT07kCq3sBCaMa9SQ470AqA86GNQHntRu/+KPlYueV65IqLGm98qblWd0DMZAkDsPMCZ7gR70oId60YNJ1bKccXy1EqVOsey4ZZKbfgdA319v/ZvgcrHIFSHFU6Vf5MOx7RcEMzPP0jiFzSKZOZy8oKaBSuYSyjBMdRE+zHagyWOAGtgZETzLS7Z7mYD0yQATfpzgOmaVOJolV3jWQ9JIdnqQ/naKvkItO8tovRgtqUBwmpxWBZiZ9BI9rV7QdiVFL7WlyvAPhjt+lrI+40DG8bT31I9hw1b0op3W4j2FzVisPCjWaiYftr6VlxlncAQuus25gpwHI68eEq8UJtapMk0TdkbyDiUqA45/Kc8T+Xev/ih7rjCNZJXixb8iKPoKteywiRs8zdtOs2GCQPy8tolKcOJzvMQPJzvdzZYYXlIk9dtSQ9WrqWvDRSfVLIuTB9X98xU6bsh+1AL2jmifOGcXNX/n3YSbNCw9zhzddq46Z2tGvydQQ5y5Q0QOzCZ/NbuVzDjNUspO/bznQe2ZPUjnQJ1yIse6PJjTgov7BU/JmO0yKR7LaVJdYGfoSDX0QhypJrGUPKj5BIM64+KNdHJITmvL1cHr0Jtzmy0qt9u3G2dhpHpkm72w5EF1/3yFjs7MFevepV3mtLYWDAIWXpXlIq/bd32uSKHdXnje86C6f75Cf9KJucLD3ufiA0iA0K08Fc1KAwquymZhZWfJFblxdhZxDtvthQuFB7Uwzld0G52SKzQZM/8YcdsrqPNYrmjb5G4WbgKAlSeiminlCg18U2fkCq/4yre4tL1Ob1LnsVyxYHhQ54lc8VSH5Iri2tfixSusr8jHuSBXdMovHjR9Rev+ts8XfUVH5Aq0oH1tYYXcobni7MsVMdrthZ3kQQFYfPagfgDO9m1VBMxsJ45v80FDxWskFz36d8s5DZC3giJFXx6wtBS0L1dk12axOBmstQcv1ToostULz0sxPsiAEZ/WAn6oxann61qwnUnvUQS3dOrtYNHZg/qj9c+96zm867n2f/Cu5961LIwt+CBpYkMExqg480Ynch3Zu2QAgnFcjXTJCtMzY93w+m9lRkJ/+oZK79VsaGZzZgHUT+QMI5UlTHHl/P2JgUJxEuNgbH3z3d/Bu8e1ahqHiDPK9KfJM6aYXBSW4Q11bTm+/jtxAu9+Tp82986o3/3Z1Spt0n9d7Wvjc96pbdceFOUMdylc/yxumT558bHJt9y9a0eLGSZI+3hKKDE9M9tNbwF4JjzdKe7UUpJ2xpGkAieV5oiDl6u9on5obWZI4mb5IQCQ9s9l78N4Vk4hjq1Sxjhvf5w6AazHeWIVRaf/iHHkEvXZoRxqsZLlJrWp3jp0lWrsM72bbMKLczqZmik7BILchWPD4G++duLV00snWzxfcdbkCsCDp5nPbxXwvKKmwNAlMyIa9PElLz3Oe54jA6yv5mbAT6qzXlxfzrHtTZg+KvEJ9ebZbvyz4RYBhmqpt+EbeZ7iNyG3RHPA4uRBnetoQV+hI+/cds5rqWas7wrM9x7UQkHJg1pgaIEdqCNvrsh5TR+91+l6lfneg1ooWHw8qHMcbatjcsb1vYWXgR3SgXQfG7uhtgIWKw+qG7gWEN2XqouhLUYPI3dcX1e8Cc2qA6HgFwHBIj/Jw9zshpIS56yCg4nnO30oNcLi5EF1AwtpodD2CqozckVhxvtZxrVd3QYpeVBYWB+/bWm7I3IFLxa5ors5W3w8qC5gIX38ttmfHZErUnythTRc6OhazhYnD6obWEgfv+2FQWfkCn1ndiENFzq6lrPFwYNq3Vly61hIH7+9FRS3L1fcqF0WPQs+zzYlGtDdgaxdHtT8yBUEOOiIN5xcfFSx8H024JoRlcHEiy1vzjKDHOBWZNhmN0GPZMfJTyP2HhnEFdwnyMbhQopokHIQvobADuicwUqcswEunkdTNXqHsLDtQbGUDKMFfkZ7MMlBNdcgWndheJEfBw8mIFv93lKCsCPLCrWHym05cRowYk4rTMKgAwAkJQaxIxXSDkcPlgoTNnFnNyek4szl7BiozHKksW3MyR7UvNmZJUyPd3scn8i2yzwPqI8z3vVc8Pe7nvNPtNE9iYGJMxkPmXLjrCXVy+SfcBLFzRMDWpw0QYOJP3eqr/+u8uxEJ/Q9epw5eNdz4zQkC5qNbA2KndmVfaFFzQVmZ5YgHOfSbilsYnAVsxna7B5o5gKAlgcmJOlCyJY94RJsieqq7HZJOXE6l4KDvScGcUyKhZBAVTHtCgZJskO7t0LKy7E8GEs4SGHOUOPMBYMu5Oo3uvjFAjuzX4/miIVnZ3aAnHzGZwfgMNtOl2bkWcFwqMoOOFjTOxhqIwZh8wY0cFZDGqszuCs7TuEMOuRIR0rHgSMxFNQDS7I5yFWktK46NCBDkdiBcJwN0QxUdeTQ3KcKB8JxHKfBkG0DiKQkvrOLK4iFzYNiIWnLN+ZBEKZqV6bjgonLAYdARAQpgSda7Z80xI6DJ7IeS9zy1Sey6pCAJxB5q5ECo3E07JDYIikBb0nGcRsSNCaCcM4Ahra1mOcmsCFBosh3kAjmsm5gMfCg2MbYkJh9+JgbBOx8O8vdBIkBEOw4J2JAtJqTbTbbzXhIUZxDYwNZOzYsbTtykMK2FEMDIpxzbNjyBWWVIrGNYQc3CIA9IBEkOEQY2zHn2gviLBKSbVt0bct+Tjyo1s7i/WaVLp443sZZvPlB4LHlbOdiDojX982f5hVN81WjSHBpFzbR42gFpZxdJHDagVI70OI8SyBgJ44N3/Q7eO3Eq6dXPhncXXhyxbyAmtiFX0SYJev5TU0tOTW/3fhYCLVTdKbuxILhLZc8qHMBc7J50kIqygpNSbJx5dZ2Ah2IZK4oeVDnDua7PZ1twkf3sDh4UCUKoatNqmOzwWLBwuZBzRPOha/ebv6L7NF1NqeLAAubB1WixDxjcfrFK1GimyjtQZUo0RSlPagSJdJY2DyoEiXmGYuBB1WixPyitAdVokRTlPagSpRIo+RBlSihoORBlSiRRsmDKlGiKUoeVIkSaZQ8qBIlFJQ8qBIl0ih5UCVKNEXJgypRIo2SB1WihIKSB1WiRBolD6pEiaYoeVAlSqRR8qBKlFBQ8qBKlEij5EGVKNEUJQ+qRIk0Sh5UiRIKSh5UiRJplDyoEiWaouRBlSiRRsmDKlFCQcmDmldE/k2dHNdAFP6mXNdLRCAiJ4hpA8GZg6shIgKyvXE7TtUhcnDWvAbOO0oe1LyCAx8TjnCymzxX9+/b70gHgHSowVNwAGLpgCUgQIwxOaf2ylIePJDTrwiCIeA4c+p7iw0lD2oecVAcPfZJhpSZ3cK66E0rDQGwY4euJRrDSEcQCDYYXH21KuRcXLqQba1evXJZ5nPbPniY4QhwF52+LziUPKj5AgH//Z+WLftTskW2C5bbzQqBhaQh2FlhbMCGFA4RsPR/W31ojqubvsrn+rPcNDpUfW3V6gMMhnOeOHeZEw/KbCGh65/FifNo+s0AE7bx3feBHWE7IqOJPeSH3n23/WW2o2BfCikY0sbBkR9f8yN3y1xydWBp/V7vjzO6hZBLLmQsd4Qj8v0TnzsQO4GSBzWv4HuZCdLJ8Y0NYjBw87LV71vVFH96AUEKSUIQlt2OfxrnJ+aQI7regDF5b0Z+2HbPgHuW5q76zkGUPKj5AgEgYrAthN341Al2p5iJ4NjMS/qe70nBsnqsnp7P9wAAJCQf7uXK+OWwQQARqq8fF/tAFPoPj0T1Q8eOPRBep+V3QvVDbMxMNOsU5BCB7AkX6N9n01Dna2ThouRBzReYgbsZADWbKRhEAvBBDAgC4Ddx2ugzeB0/KYQEBoXzRwZmJiEgQQRgZNmF/2QgdAtPgAz2Xa0L3/VhgAApAUDds2LceLtPk2ub5tdm6UhcNWnwkj7Yo/L8WEHNiQdVyhXt4N7sRzZJm9gAg8COTRPh3MrEFIgaXOn/7O9d872/H9+8GRBy21jvvXVjYi0xCSYwYdir1BkAQ8IGMaQNAurej8YBMAkpbYJ9qMcPYwaoH1SnI80EdiZ/itgRU0stLK0O4DzZg1LkipV9fxPcKzxXtNIrQrlisoVXzknkjQwkbRsMJv6l/wHYGGgSZv/Sz/PuiwmStoxJwdTPhjcJaYMhAQEO3G5zdYtNBGeL4CpsAOQzIIeeGBAAmP63n3phhEzwH/ooLTN4w1g6Md+oTF0KcqT9iuVbSwGZtUNwDuKm3wHQ9/VojthUtFuUckXryGtVTBuCP+h7AG2AKggQEYgcGMRMkMDAKIRDB+5lml6LQHlh2xKC1+MRSGfgBTCAbYyBgcFqtA08NgBmksR7GIxBDDJ+vl7nj1UMg/FCw3KN1jPDYRuozZDfVz1PpooAJQ9qPnF39nzx9W8fO3bsWH+djeXHfv7vjj/ApDqIJ4khCmcbaQcLqk2f5/okOQDLI6/thw3mFzFMtl195Y0q88DtB14/RGMD2A4wWPDBNw5DQsKvTdemvzf9vVrtHxiA576jVnNr17q1a93kx3Wfn56BcCQG19YIpomh82OqKHlQ3Qeh+vor1YDZBODeZL7Y99pbQHDiPaHhZf39/Ut74Bv9y/YsfeefkZQIWBZhiG1hjEIQBEu7+mMYrgcBwHxwxerjr1RBxMyH7D9dufxOOED/ipUnXz+AnQBj/6snV67or9oATbzn2PEb/uzoHxw/etogo37skW8eP37s+DePHf/mf30y/jl67Pim02DAHsVEnSp9vG1eK+6sYU48KKoUTuf6Z/GbVbp44vhb7t61Yy7shEUIxz70Jn9m4lImSIHDKwgTawiM6oolVm3TCyCOFHqvX+gTGHffQwAIZy5y1O1b+sww2wf/zT/wiTc7AgCYDu+8p3LiUjAxjlzk++R7M0uWzNQsi8g3xldLu3pRj8/kuf5SrsGqEIDXrqzaHOrjiHGy1zdOXtJ0U4yi3TJiwid+j2oX8vmgxiNgJ44N3/Q7eO3Eq6dXPhncLeWKTsOqc4+JDVLazMn6aYu5pL7kr1V9ce3k6ZMnT9fvIf/0yVMnT9WAA4cOxtj/W7ZNvEeJl637qT7DDBB5p6Z8Nqy+il/p79lAnjtRc2yiiQkPMJcu9dHbVyH2Jt8GsgHACTLySq9vuJNwIFE9sP/AZx1dkKFAC0KMO8g3989XhS0ElDyoboJs9BJ7k3gioGtH/YLGxsF+vwOicKqgKy6++NJLLr6H8HuTl11yycUu0cpVq1avXrV69erVq9+03IbDgVwRvlA1f5FmPIAAvnL1hcdPjc/cDTB7z534hWMrL2XC2otXHD1xzbQHIt93z5w4uqrqSWaABYEcri5n4O3CsSWBVqy5aHvGPE48w6j0nCezfGkPah6wvwLy6pKBIQCfDZsW82U1g3oscLRfy0SQ2P+fie4mdhwHGDGMzxkVs1IxK2R8gaQIVzqhFs5Y8g/GoA0CGHBw+cWrj/9nw/gcn1x58cu248CR5OCqS51jUyBUatdfNHUVS9hA0JEGgf4lMCZfZhAGQEalQo0a9xBeHdTKVvxiRmkPqutg9FaYagMChDEQ7gnvU5UnmbGUgVhlLCHQQ58BACEADPu45x3Td7vu9Az7n2IwQITro6grlT/i7wcCAkEQAb0V9u+pLIXzgIQNFhKOU2XjeqqDrW8yOY4twlxJZ9Q+tOwu1MeZIIUDvBO8CcquF4JfQW7rLvmVDfNTZQsCJQ+qW3AcALCIUQPEgGAocgVjaobQcwBSxPcI6KHfAwMSNhiEP/p/j3/k2LFj4wQKWCCMZyGCVlvB7f5M0I6lhMN4dTnVj3tG3xv2nQAJASEEBvat+iFNn+LKygMDAlUGEYEgYDvLjHtp4soqCyEBfJ/5WSgqEg5+Bf3E9ukz5l/New2ePZQ8qC6CsN/yjZkZRMNu3C8EBqaJK0tJREsoOQQcsIjYQHiwCPiYZ69du3bgo8YgiKUet8Go14M/beFswcHloPHLT3u44FWOFIZS4IIezPzRpS5VVmzgoScdimeA/l6fauMOEyCidZUGKUFRmj7dYxjnB2mntAfVVdiCAMtko5awNyK5ApIwXTfQuy9uwdjG3GvWQXXrdbIxGO2eEvAwjzWKuiaB/fBvyWPVCyuYnqTLJxgXHBRRE+dX+33/9L18us7vfD9e2Bz1FmkfuICJT4MEpJTBuW1WV1AEW0gnOvlU98k4HzZmUdqD6i6IAKY+n+ofidpoIlewkLhy6ud9sy8ksoJwO5weAGyuXHEB7CeUkbnZIE0G6N6oV5C9c4Xl+6ds0LgLc8X+sH2Lw8tRmbjMoStPGz+8/XXYgVYctrj7QoONM1faA8y2bdtghKedIjA7EhwoEIl8BrXyxRc7SntQ3YJkYL8Fqj8QDfSJXEEAYerHBvfus4ObLAhWT90HE+oXvIEBZcHUdJAm4DMRN8l2vno9VcavrEoMnGFCeLqVmMiYGYcYdC6ZrDDBCcd74o/1+oY7fff+A/v379+/f/8+kwH67L79CoxdQ1H8zNy8b56rKHlQXQLbAHoNwvRA0p6SfiHgzNQIZk+kfwBjKfxpqvznM+ALjiAY1oPgTbZ/JFg9/T32Vycn/tgBJF0+MXnsytCUDV32xtTpAZLbgPHaB9/khK2cAIvwmcrqT61ZfdFFF1100UVvWlXx/Z5PvumiGG+6uHfHaLjIZoDB58lcUfKgugqH2OnZAH9KOeeT6CsYsCd9GL1VAMEhvUO97LnEn5k4Q/zg4WBYD5Y1LzSLn5I+xjZw8crfwoANxukVa4MNKzDjqhVTgH277Vyx/BtAeMqUJZjpXqrAqAQ7TgZ8g2Boum0wZCRXMKVXWOcsSntQ3YQDUI/1Q8xsjmeDRK4AABvTHnGvxQQihoM+w/gzn2DQmybp3tUHExm9aXPk4HxRdGUDth3a/0AyizDbzABsMLNtR/cdgEH+3VEEPirM5N+dRE8MCCTHWYnOExsfAEp7UF2DEIylBqM2pigpFLkCBDFFbPSGLdM+2Gd4X+P1AOG0b9YVg37NmqO9qf2VPgEfOnnq1MnTd5w69aWTJ0+ePHnqTJ0qG0/ecTLAqZMnT56sIeldFNl4O0/QLg+qBQLA9c8CK0+2kqlzAezYB3rrVJ9ihfzK0eBLzEQ83W/4vfuvIiZiLK/w9Bi9yD7jqsPLN7xcBWK5ouGkHPAMMVWbndgrkDUhv/H16OJOAMC+pYRn14SyOJjAgCPsiE1rELDp/NialbuAhAcV9IducGbPU7lCoLeCa6avUulFsb4i4DRdOW2w2Re0/Vd7/PoEGz4IcC4/+hHnkeS1ZnJFHTDmJgA7BFQ3hFKEwcqcRAA5BMQWeoy3o/7t86JTlDyoroJ4f69PL01BxgeLFH1F+G/NJ79vHzPjwAWg6SsB0C8RQQ5stm9DYOcDYBpsjN9H2yoEkgCIhng/7G2h9ZBAlnYcJ8qcgJ2Y6jR+RP750SkClDyoLkFi6XV11FyCTOsrOPrTqf1ng80eOA6WmFwfJ7DB32MWcGxm4NqlRx44cuRIrz+G0BxOgveAjf/eZt6EgCMfeGH/6hPOjshEVJAjIe5+4xAzWEpJtu2EhwgrjLo/S6TnEkoeVJdg7+t7gWjKlhCJWJzI2wEdaeDjDFoKAXZdY/LKeAtXBBtJz/df+NEVKx5cCrqfqil7TH/n4Rd+q72sMVgSfaJ64ZeWrjmgLumcIey/Y8WqV8AOhA2Ksl6tDBoz7ckwiw4lD6qLIPSZ/A53Cpodpc9qOzkkMFUnvvcQC1w17Y2noqgYFapUDOM+w6DPMA8RrlWefs2jF5e0vQsl2Mby3ttJlaAJYgxLN3rGitfIFkzMBJZgoLJkjL3s2M4plDyoLoL3X7CBX5iwSUAm+5v36GGk49UMPNEH6WD61ICjWZfhyYmNE+Pj4xMTExPjk8Ao0/PK40/MUL1nX5u5c6Tg1/t9wzt+JUJ3AAwAgzzxfWLjQhtMg6EvF8fBkorvuecT5aPkQXULM89X3jENSGlH/lC4sWGJaXjfn3AAXHEZQVsk2WtW/Xj16lWrV61atWrVxYRR7UXCjA+jvQNyJFnwa8v5s/7JK2OtCAHg0epVJ8eJ+Z+OEY/BYYaAEE6vT/WrzieFRcmD6g6ofsPxM/+vTQyhmNBI9Qsh5MyxYxd7JITjUOwarHFQZkA8DlZWUEx/elGF25x/aQhHljN/fvzNjpIYA2AHa04TuP/n93Eg20jmyhLA5Ww3YecUSh5UF8E0esWaSwGy4+NC4VaP0uqZcdVlax3YzEJIFiHtKFSmOSE/kAhwpByDtoKSnz/A6NkXm5oqBHIAOOCxVy4kpsmLgt2wIILw/JHAm06B/B+s2Ad7QxC8xyT/l3I99Z1DKHlQ3YRtR61VCIcAp+qAPou3A1Im7dgGIGwGOO4TEdiOelCgEZfhTBNuVAme8rGxD040vBWDQ45g+5WVhl+ZXgXHFhscCQm808cNAMhmci45BYM3rqziFnIcEtWlgPfUebR+KnlQ3QOFtFZiQBIJZq7cyy8AEFJrx6z9k4YkkIQgMUQAro33tAadmoexBx2mFjzWsSApGEcuBFemToEIcnQX2Aa+D9oKAESS+JKTTD/uWbnvEwww91o+TdnnyQIqQGkPqotgBiTAwmZm26YHDUSGw/OgLlVYDEq2GQPOKFvE/8ChSE7bhsQk1e9ZarfC8A5Yfq+vIKapBweqcgvZuF04gGkQfTgII9ihS04xcd/K/ULA3rAUlZlp3nWemF8u7UF1GQxy2Gbaf/jwwQMHDhw6/nv1z/IM7MCyTd57KkZ3VUGMARxaZnDdi+aKzdt4asbgZfvQAnmWIWwcvZBgTJ/4vGNjtLoPxLZzoN8Ah7YRICBxySkGWyZLG/+j16epq5zNLS3UFi9KHlR3wUCgHKYVq1avWbNmdS/7975jJs/pe7NYxPtXnjhqH7VXrjK8ysxAdG6JbqaBCcB8b4skb3J8EF17wh5kSaJvzcrjx95YsaqH4f9yZG0EguiSk7ThSzUCVR9mw52AgDxPJgug5EF1DYFqjAHiej043AbfNJ69Cs6QLL7qIYe5d+myl5b9pJdg+JNM4emMAZY05Rr84kG04IeeIfGm497krfbgtiFsYX9JX2//BX0VRsV9KtodACBx6cln7rQB7r/Xx/gA5Czz27mFkgfVZTBj4N1GxagYRKZ3+gwIoyJ7dOcNDeuhP6sTiFB5O/mnLndCkwTSAeTAGZ+XLN/QghMiYhvOpcdP3im37RjFNnh1g5iJDJo8HROdBGATLrmYSNoHlw9SbYrp/DhcgZIHNX/4f8YnJiYnJ88cP3qRcCRyWrFR+bGur2bQqqnaO6anp6e+c+boJRyt7gUg4Fy+7qGZ2hOtnagWwrnClkObJWiz8+XpDTOe5352+uTxK6qK4EBwAEhBPP0CnRlwJJ8vJ1TnxIMq/eIVB10eO0596KuBjiILMyfg+6Q2c4HNpzF8jDgw8Gc7golBEFLaVTy97NgVTX2yZoABhu0AYyAeoJ2fH/4fxwzGf1oJdvR8CQcQwJV0xLgcsOGcR27x2vaL10KvePb6Z89DuUIFBTu0QgI6h7Yh4JUEhsYSlBAM2sEAYXB0aExIwQCTFNJhWV8Nkrn9rBmEhMP2zg2jYtDmwEKhTOcr8DPmwL6USQqS5xMNCk/t2vzlkgfVXTDIAQQcgaHNuUIrO2CiIXUPVACOIyXgSDyBMSnDMw8isP1PVactn78MuXlUyFHpgCIPrvrWKwGMLfSZnQ4gZWif6tzHnHhQrXgAw7O3HKGLj02ehx7AAESrp4C1Mcs6hJjS+goCOPbZBQouAgO0TEyM1gRhQjIzsGM7IvDwHUYfpRjMRoH7AA7SPC+WUBR4AMMuvHbiJ2vor1p8vdRXFEcgp3JgkWmWoIEBNf3tSCER7vWGpyGC+wVU5U0yE26zkk02c5xBLRzBBmDbHHgYIJot6+cSSh7U+YxcIizlXp7TKHlQJUooKHlQJUqkUfKgSpRoipIHdR6CFTR/HIVRw6eDEbVwCnCR4C5IbA7kCqPkQZXQcZ7QOxohdwEQeB+APkTSdilXlCghA7kCkRavlCtKnN/YEfwjANy8tZQrSpQAxM7gXwngycfCm6VcUaJEIFcAW8PrUq4oURQZO1iLGzL4FcgVU6VcUaIEgB0Yif/uK+WKEiUAsRPD8UWpryhRIkIkV6DkQZUokZIrohVUKVeUOK8hoMgV0QqqlCtKnNeQ2DEMEfDIUZ6vKFECIZFcggEfm06WckWJEoAERiInmSsnS7miRAkAwDCCM+wnnows35RyRYksEJ2LJypSEMAIJAjAZTeX+ooSJQIMI7ADPPVkX9flilovIGbOR3NQ5wqyTuSdjbx0DRIA7gKNANh0sutyRU8f0KrtohIl5h8jGAYDmF7ZE97pnlxRm5o9ZIkSZxkCGMYIaBjoPdF9fUXPNPrlktayWKLE2UEwV7wSXnVRX1EK3CUWPmSwgiIAvU+u6uL5imeB3t3AFJ7b1VoOS5SYb4jw1whgbOJWz1e0YpP8WXzAoPox/+c+NptJ7hLnAAiLd1flIRwb3sXHh3fhtVdO/XXLr7eygrr5A8d6+742w97ITeeHd9oSixUMD4zl+C88fqSN7aEWegXh2Mz01M0A8FTrCZUoMX+gwInXCKiC2myBG9FCr2CsXgI8ufsSRilYlFjQ2LwDNnB6+CnULuyZPXgaLc0VmHnlCDa9OjE8e+ASJc4iBO4jomHsQmVipvXXW+gVz+BV7MYmLG+j85UoMb+QO7F5BLwDU4X3YxNUineLTX31Z67H7rUX8k8u+D9aT6lEiXkCEbCW8d1h/pfBl1et2d9yBC3MFbvxdwA27e4/fub2xbpjV+I8gQQ876Zv0lTva23MFS34277+yZv7jgA3T/lGa+4+S5SYZ9yF9+0CnhL4yEQ7XIxW9BU4AcLuFTg5/vE2UipRYh7xqwCEwIEev42XW+oVuwm4eaq35/iZc4uMX+LchHz546/1TbbxYku94uYeoK8P8K1yBVViIWP5TSCA6WlMrm7j9ZbYgU9O49mpqandJ0/+LhznoYcecj5D9FAbqZYo0SUQkQPgI3+LLz/1zTvfvvrUsXYiKc4OTPArvZd/fOj03+7Ccc8c3nV7GzGUKNEVEHYC2LGT8SeA/NzhM2eO/6CNWNrpFXjPNZUdu4DNI8B9i5ZXWeIcBAES2IXNQ2M7+fjrh1YcoWdbj6UluSJ56x/9L4NDT98lSiwgSOwSmyFOP+h5J35SO4Jn24ijBX2Fgt3XvbFkZgmkuGsY97UVQ4kFh2BfcZHP/ExCboaA+B3G4TPWZL/xK3/XeiztzRW4wDv5xrHNwOpdZacosbAgsCOwBOUs4T5uq4G32StWL7X+2Rt98kHsgCx1F+cGmtuJWmxgKQWAvwX2vWmcjZVuO5G0t4IC9R0aP2leWGGUh1VLLCCQBCDBu7D/9dcv61l2EsvaiKXNuaJv8qT/wplTkzcLlIdVSywkCEgh/hKTJ6p/b6zef4qWthFHm71i6tgP+tZMnxn/8vLyXF6JBQQWgxBS8pGfyuXvISxb1oJljwRtrqAev/lXltQPrqmt+Leju7L2Lkp5Y3Eh+IKL66uprS4gckuIQYiPv/7G9zZdDuz+QI27yyRXsQmX09S0FD1fWr6EF1lNljiXIaQ4LUa+98bK3zROnHj2gwZemf2dBrTZK3ACqxg9x/kjx035zc0C+Axw307siAPIUse36LF49lEIkF8278NOALfgzJ5DJ3v92iRwuufVNqaKtveggMlaD0//pG/Fz1798i7cBQDySewEsHnXZowoHixLLA4sxhk/zvNO7IIH+SSwqzbxxvjfBmaR8eT1bRmAbY8Hheuf3Yqpnlen+2u4ht5cwypg868+NVIqukt0Hcmmp9jJAEDAZmDkcXwEoNd6qxNnZp6dWxJt9gpcfyn82pOb0LtsBdwVfRczQDjmfTjMLgBAlmuoEt3FgyAEfWIY/E3w5Kl/np5cgZ4TuwFs2r2pneUT2u8Vmy4D3gD+7gNTq+sYf5PxX3YyQDOnlSDlvFGi+5ACgISQI6to859OnnljevemHjx184mwS7TVMdrtFTf3HVv9GH5lNXpqOGaYqy64aPoBfgg7dgaPGcAd7cVcokRhCCme2oXNYucO8Cd73xj/KXp24waAnwXmMFm02Ss+cGxZ36s+dm/a/QGcmLn0WMXv7zvxZnPFfbgLQHAocAekKBdRJToNKZIf3IXhEQDwTlbGJ6fqp1b2TvSfBJ7Bpt2bVj7Z5lTRdq/AsWW13pP8LIB/3wuewpMbK5f19cIE1UPbgu2o2kuUaAWTAGoV9kBjPdT7d7+G+hrgFYSHKjbt3rR0ch5XUB84trp2ImCLcPj/7k3gldO9U/3AKQDTvStKf/WLFtO9C/oH0X8EYAr1U/AN9OzGr58EP4sP9OD0k5t2b9r9a5PtdYr254qvAbgBwIUngy6xG/iVNfTYr/U8CdyEmSVow+htiRKzwidw+B8TWQBWH2PUsHQKK09iSQ24pMf4vwGEckU7a6h2pW0Am3bfjL5XsHvTkpnd1zOwZDWIjqw82dt7AgBQOlst0W30YsnMkjV9AIFPnlwxUQOwZDX1/XksV6x8so1o2+wVNzyDTbt/ZTVQA3oJwNSJ3ZsI2iHZm4N/emrlz6L7aatRnAXs8y4AAIJPIPiXAH1UO3Iay9D+tiwAVNrGjZVKpbKlUtmy5dZbt8Q3KpVK5d9V/l2lUtmyZcuWLVt+tVL+LL6fLZXfWAw/W94boPLv3lup3Fip3LjlN7bceut73/veoDneqDbKVjCHFVSJEuco2jx1VKLEOYyyV5QokUbZK0qUSKPsFSVKpFH2ihIl0ih7RYkSaZS9okSJNMpeUaJEGmWvKFEijbJXlCiRRtkrSpRIo+wVJUqkUfaKEiXSKHtFiRJplL2iRIk0yl5RokQaZa8oUSKNsleUKJFG2StKlEij7BUlSqRR9ooSJdIoe0WJEmmUvaJEiTTKXlGiRBplryhRIo2yV5QokUbZK0qUSKPsFSVKpFH2ihIl0ih7RYkSaZS9okSJNMpeUaJEGmWvKFEijf8PMoBIxyzvobUAAAAASUVORK5CYII=" }
];

// src/settings.ts
var DEFAULT_SETTINGS = {
  showHandle: true,
  handleFollowsCursor: true,
  blockHoverHighlight: true,
  blockHoverHighlightColor: "",
  blockHoverHighlightOpacity: 0.55,
  slashCommands: true,
  slashInlineCommands: true,
  dragAutoScroll: true,
  indentStep: 0,
  livePreviewWidget: true,
  columnsGap: 10,
  columnsRadius: 8,
  columnsValign: "stretch",
  columnsBorder: false,
  handleSize: 20,
  dragThreshold: 4,
  linkOpenMode: "current",
  dateFormat: DEFAULT_DATE_FORMAT,
  timeFormat: DEFAULT_TIME_FORMAT,
  insDate: true,
  insTime: true,
  insDateTime: true,
  insMath: true,
  insInlineCode: true,
  insHighlight: true,
  insNote: true,
  insEmbedNote: true,
  insBlockRef: true,
  insBlockEmbed: true
};
function applyColumnsCssVars(settings) {
  const body = document.body;
  body.style.setProperty("--be-col-gap", settings.columnsGap + "px");
  body.style.setProperty("--be-col-radius", settings.columnsRadius + "px");
  body.style.setProperty("--be-col-valign", colValignToCss(settings.columnsValign));
  body.style.setProperty("--be-col-border", settings.columnsBorder ? "1px" : "0px");
  body.style.setProperty("--be-handle-size", settings.handleSize + "px");
}
function applyHoverHighlightCssVars(settings) {
  const body = document.body;
  const color = settings.blockHoverHighlightColor.trim();
  body.style.setProperty(
    "--be-hover-color",
    color || "var(--background-modifier-hover)"
  );
  body.style.setProperty("--be-hover-opacity", String(settings.blockHoverHighlightOpacity));
}
var BlockEditorSettingTab = class extends import_obsidian10.PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }
  /**
   * 数值（滑块）设置项：声明式 control 不提供「恢复默认」入口，故用 render 自定义
   * ——滑块 + 恢复默认按钮（rotate-ccw）。滑块改动与恢复默认都经 setControlValue
   * 持久化并触发副作用，行为与声明式 control 一致。
   */
  numericSetting(opts) {
    const def = DEFAULT_SETTINGS[opts.key];
    const item = {
      name: opts.name,
      desc: opts.desc,
      render: (setting) => {
        setting.setName(opts.name).setDesc(opts.desc);
        let slider = null;
        setting.addSlider((s) => {
          slider = s;
          s.setLimits(opts.min, opts.max, opts.step).setValue(this.getControlValue(opts.key)).onChange((v) => void this.setControlValue(opts.key, v));
        });
        setting.addExtraButton(
          (b) => b.setIcon("rotate-ccw").setTooltip(`\u6062\u590D\u9ED8\u8BA4\u503C\uFF08${def}\uFF09`).onClick(() => {
            slider == null ? void 0 : slider.setValue(def);
            void this.setControlValue(opts.key, def);
          })
        );
      }
    };
    return item;
  }
  getSettingDefinitions() {
    return [
      {
        type: "group",
        heading: "Block Editor \u8BBE\u7F6E",
        items: [
          {
            name: "\u663E\u793A\u5757\u624B\u67C4",
            desc: "\u5728\u7F16\u8F91\u5668\u5DE6\u4FA7\u663E\u793A Notion \u98CE\u683C\u7684\u5757\u624B\u67C4",
            control: { type: "toggle", key: "showHandle" }
          },
          {
            name: "\u624B\u67C4\u8DDF\u968F\u5149\u6807",
            desc: "\u5149\u6807\u79FB\u52A8\u540E\u624B\u67C4\u81EA\u52A8\u8DDF\u5230\u5F53\u524D\u5757\uFF1B\u5173\u95ED\u540E\u4EC5\u5728\u9F20\u6807\u60AC\u505C\u65F6\u663E\u793A",
            control: { type: "toggle", key: "handleFollowsCursor" }
          },
          {
            name: "\u5757\u60AC\u505C\u9AD8\u4EAE",
            desc: "\u9F20\u6807\u60AC\u505C\u5728\u5757\u4E0A\u65F6\uFF0C\u7ED9\u624B\u67C4\u5BF9\u5E94\u7684\u5757\u52A0\u4E00\u5C42\u6D45\u8272\u9AD8\u4EAE\u80CC\u666F",
            control: { type: "toggle", key: "blockHoverHighlight" }
          },
          {
            name: "\u9AD8\u4EAE\u989C\u8272",
            desc: "\u81EA\u5B9A\u4E49\u60AC\u505C\u9AD8\u4EAE\u7684\u80CC\u666F\u8272\uFF1B\u7A7A\u503C\u8868\u793A\u8DDF\u968F\u5F53\u524D Obsidian \u4E3B\u9898\u7684\u60AC\u505C\u8272",
            control: { type: "color", key: "blockHoverHighlightColor" }
          },
          this.numericSetting({
            name: "\u9AD8\u4EAE\u900F\u660E\u5EA6",
            desc: "\u60AC\u505C\u9AD8\u4EAE\u80CC\u666F\u7684\u900F\u660E\u5EA6\uFF0C0 \u4E3A\u5B8C\u5168\u900F\u660E\uFF0C1 \u4E3A\u5B8C\u5168\u4E0D\u900F\u660E",
            key: "blockHoverHighlightOpacity",
            min: 0,
            max: 1,
            step: 0.05
          }),
          {
            name: "\u5B9E\u9A8C\uFF1A\u5B9E\u65F6\u9884\u89C8\u81EA\u6E32\u67D3\u5206\u680F",
            desc: "\u5F00\u542F\u540E\u5B9E\u65F6\u9884\u89C8\u4E2D\u5206\u680F\u533A\u57DF\u7531\u63D2\u4EF6\u81EA\u6E32\u67D3\uFF08\u53CC\u51FB\u8FDB\u5165\u7F16\u8F91\uFF09\uFF1B\u5173\u95ED\u65F6\u663E\u793A\u539F\u751F\u5D4C\u5957 callout",
            control: { type: "toggle", key: "livePreviewWidget" }
          },
          {
            name: "\u542F\u7528\u659C\u6760\u547D\u4EE4",
            desc: "\u5728\u6B63\u6587\u4E2D\u8F93\u5165 / \u5FEB\u901F\u628A\u5F53\u524D\u5757\u8F6C\u6362\u4E3A\u5176\u4ED6\u7C7B\u578B",
            control: { type: "toggle", key: "slashCommands" }
          },
          {
            name: "\u884C\u5185\u659C\u6760\u547D\u4EE4\uFF08\u63D2\u5165\u9644\u4EF6\uFF09",
            desc: "\u975E\u884C\u9996\u8F93\u5165 /\uFF08\u5982\u300C\u6587\u5B57/\u56FE\u300D\u300Csdfs /\u300D\uFF09\u53EA\u63D0\u4F9B\u56FE\u7247 / \u97F3\u9891 / \u89C6\u9891 / PDF \u63D2\u5165\uFF1B\u884C\u9996 / \u4ECD\u662F\u5B8C\u6574\u83DC\u5355\u3002C:/\u3001https:// \u7B49\u8DEF\u5F84\u5F62\u6001\u4E0D\u4F1A\u89E6\u53D1",
            control: { type: "toggle", key: "slashInlineCommands" }
          },
          {
            name: "\u62D6\u62FD\u81EA\u52A8\u6EDA\u52A8",
            desc: "\u62D6\u52A8\u5757\u5230\u7F16\u8F91\u533A\u4E0A\u4E0B\u8FB9\u7F18\u65F6\u81EA\u52A8\u6EDA\u52A8",
            control: { type: "toggle", key: "dragAutoScroll" }
          },
          this.numericSetting({
            name: "\u7F29\u8FDB\u6B65\u957F",
            desc: "\u5757\u7F29\u8FDB / \u51CF\u5C11\u7F29\u8FDB\u65F6\u7684\u7A7A\u683C\u6570\uFF0C0 \u8868\u793A\u81EA\u52A8\u68C0\u6D4B\u5168\u6587\u6700\u5C0F\u7F29\u8FDB",
            key: "indentStep",
            min: 0,
            max: 8,
            step: 1
          }),
          {
            name: "\u70B9\u51FB\u94FE\u63A5\u65F6\u7684\u6253\u5F00\u4F4D\u7F6E",
            desc: "\u70B9\u51FB\u5185\u90E8\u94FE\u63A5 [[...]] \u65F6\u5728\u54EA\u91CC\u6253\u5F00\uFF1BCtrl/Cmd+\u70B9\u51FB\u7B49\u4FEE\u9970\u952E\u884C\u4E3A\u4E0D\u53D7\u5F71\u54CD",
            control: {
              type: "dropdown",
              key: "linkOpenMode",
              options: { current: "\u5F53\u524D\u6807\u7B7E\u9875", tab: "\u65B0\u6807\u7B7E\u9875", split: "\u5206\u5C4F\uFF08\u53F3\u4FA7\uFF09", window: "\u65B0\u7A97\u53E3\uFF08\u5F39\u51FA\uFF09" }
            }
          },
          this.numericSetting({
            name: "\u9ED8\u8BA4\u680F\u95F4\u8DDD",
            desc: "\u5206\u680F\u5916\u58F3\u672A\u5199 gap= \u53C2\u6570\u65F6\u7684\u680F\u95F4\u8DDD\uFF08px\uFF09\uFF0C\u5B9E\u65F6\u9884\u89C8\u4E0E\u9605\u8BFB\u6A21\u5F0F\u751F\u6548",
            key: "columnsGap",
            min: 0,
            max: 48,
            step: 1
          }),
          this.numericSetting({
            name: "\u9ED8\u8BA4\u5706\u89D2",
            desc: "\u5206\u680F\u5916\u58F3\u672A\u5199 radius= \u53C2\u6570\u65F6\u7684\u680F\u5706\u89D2\uFF08px\uFF09",
            key: "columnsRadius",
            min: 0,
            max: 24,
            step: 1
          }),
          {
            name: "\u9ED8\u8BA4\u5782\u76F4\u5BF9\u9F50",
            desc: "\u5206\u680F\u5916\u58F3\u672A\u5199 valign= \u53C2\u6570\u65F6\u7684\u680F\u5782\u76F4\u5BF9\u9F50\u65B9\u5F0F",
            control: {
              type: "dropdown",
              key: "columnsValign",
              options: { stretch: "\u62C9\u4F38\uFF08\u7B49\u9AD8\uFF09", top: "\u9876\u90E8\u5BF9\u9F50", center: "\u5C45\u4E2D\u5BF9\u9F50", bottom: "\u5E95\u90E8\u5BF9\u9F50" }
            }
          },
          {
            name: "\u9ED8\u8BA4\u8FB9\u6846",
            desc: "\u5206\u680F\u5916\u58F3\u672A\u5199 border \u53C2\u6570\u65F6\u662F\u5426\u663E\u793A\u680F\u8FB9\u6846",
            control: { type: "toggle", key: "columnsBorder" }
          },
          this.numericSetting({
            name: "\u624B\u67C4\u5C3A\u5BF8",
            desc: "\u7F16\u8F91\u5668\u5DE6\u4FA7\u5757\u624B\u67C4\u7684\u5927\u5C0F\uFF08px\uFF09",
            key: "handleSize",
            min: 12,
            max: 32,
            step: 1
          }),
          this.numericSetting({
            name: "\u62D6\u62FD\u9608\u503C",
            desc: "\u6309\u4F4F\u5757\u624B\u67C4\u62D6\u52A8\u7684\u5224\u5B9A\u4F4D\u79FB\uFF08px\uFF09\uFF0C\u5C0F\u4E8E\u8BE5\u4F4D\u79FB\u89C6\u4E3A\u70B9\u51FB\u5F39\u51FA\u5757\u83DC\u5355",
            key: "dragThreshold",
            min: 0,
            max: 16,
            step: 1
          })
        ]
      },
      {
        type: "group",
        heading: "\u659C\u6760\u547D\u4EE4 \xB7 \u63D2\u5165\u7C7B",
        items: [
          {
            name: "\u65E5\u671F\u683C\u5F0F",
            desc: "\u53EF\u7528 token\uFF1AYYYY \u5E74\u3001MM \u6708\u3001DD \u65E5\u3001ddd \u5468\u4E09\u3001dddd \u661F\u671F\u4E09\uFF1B\u5176\u4F59\u5B57\u7B26\u539F\u6837\u4FDD\u7559",
            control: { type: "text", key: "dateFormat" }
          },
          {
            name: "\u65F6\u95F4\u683C\u5F0F",
            desc: "\u53EF\u7528 token\uFF1AHH \u65F6\u3001mm \u5206\u3001ss \u79D2\uFF1B\u5176\u4F59\u5B57\u7B26\u539F\u6837\u4FDD\u7559",
            control: { type: "text", key: "timeFormat" }
          },
          {
            name: "\u65E5\u671F",
            desc: "\u63D2\u5165\u4ECA\u5929\u7684\u65E5\u671F\uFF08\u6309\u4E0A\u9762\u7684\u65E5\u671F\u683C\u5F0F\uFF09",
            control: { type: "toggle", key: "insDate" }
          },
          {
            name: "\u65F6\u95F4",
            desc: "\u63D2\u5165\u5F53\u524D\u65F6\u95F4",
            control: { type: "toggle", key: "insTime" }
          },
          {
            name: "\u65E5\u671F\u65F6\u95F4",
            desc: "\u63D2\u5165\u300C\u65E5\u671F + \u7A7A\u683C + \u65F6\u95F4\u300D",
            control: { type: "toggle", key: "insDateTime" }
          },
          {
            name: "\u884C\u5185\u516C\u5F0F",
            desc: "\u63D2\u5165 $ $\uFF0C\u5149\u6807\u505C\u5728\u4E24\u4E2A $ \u4E2D\u95F4",
            control: { type: "toggle", key: "insMath" }
          },
          {
            name: "\u884C\u5185\u4EE3\u7801",
            desc: "\u63D2\u5165\u4E00\u5BF9\u53CD\u5F15\u53F7\uFF0C\u5149\u6807\u505C\u5728\u5176\u4E2D",
            control: { type: "toggle", key: "insInlineCode" }
          },
          {
            name: "\u9AD8\u4EAE",
            desc: "\u63D2\u5165 == ==\uFF0C\u5149\u6807\u505C\u5728\u4E2D\u95F4",
            control: { type: "toggle", key: "insHighlight" }
          },
          {
            name: "\u7B14\u8BB0\u94FE\u63A5",
            desc: "\u9009\u4E00\u7BC7\u7B14\u8BB0\uFF0C\u63D2\u5165\u6307\u5411\u5B83\u7684\u94FE\u63A5",
            control: { type: "toggle", key: "insNote" }
          },
          {
            name: "\u5D4C\u5165\u7B14\u8BB0",
            desc: "\u9009\u4E00\u7BC7\u7B14\u8BB0\uFF0C\u628A\u5B83\u7684\u5185\u5BB9\u5D4C\u5165\u5F53\u524D\u4F4D\u7F6E",
            control: { type: "toggle", key: "insEmbedNote" }
          },
          {
            name: "\u5757\u5F15\u7528",
            desc: "\u5148\u9009\u7B14\u8BB0\u518D\u9009\u5757\uFF0C\u63D2\u5165\u6307\u5411\u8BE5\u5757\u7684\u94FE\u63A5",
            control: { type: "toggle", key: "insBlockRef" }
          },
          {
            name: "\u5D4C\u5165\u5757",
            desc: "\u5148\u9009\u7B14\u8BB0\u518D\u9009\u5757\uFF0C\u628A\u8BE5\u5757\u5185\u5BB9\u5D4C\u5165\u5F53\u524D\u4F4D\u7F6E",
            control: { type: "toggle", key: "insBlockEmbed" }
          }
        ]
      },
      ...this.donateGroups()
    ];
  }
  /**
   * 「支持作者」分组：把打赏收款码渲染成可折叠区块（默认收起，点击展开）。
   * 收款码以 Base64 Data URI 内联在 src/donate.ts，构建时打包进 main.js；
   * 未配置任何图片时不生成该分组。
   */
  donateGroups() {
    const codes = DONATE_CODES.filter((c) => c.src.trim().length > 0);
    if (codes.length === 0) return [];
    return [
      {
        type: "group",
        cls: "be-donate-group",
        items: [
          {
            name: "\u6253\u8D4F\u652F\u6301",
            aliases: ["\u6253\u8D4F", "\u8D5E\u8D4F", "\u6350\u8D60", "\u6536\u6B3E\u7801", "donate", "sponsor"],
            render: (setting) => {
              setting.settingEl.addClass("be-donate-row");
              const details = setting.settingEl.createEl("details", { cls: "be-donate" });
              const summary = details.createEl("summary", { cls: "be-donate-summary" });
              const chevron = summary.createSpan({ cls: "be-donate-chevron" });
              (0, import_obsidian10.setIcon)(chevron, "chevron-right");
              summary.createSpan({ cls: "be-donate-label", text: "\u6253\u8D4F\u652F\u6301" });
              summary.createSpan({
                cls: "be-donate-hint",
                text: "\u5982\u679C\u8FD9\u4E2A\u63D2\u4EF6\u5BF9\u4F60\u6709\u5E2E\u52A9\uFF0C\u6B22\u8FCE\u8BF7\u4F5C\u8005\u559D\u676F\u5496\u5561"
              });
              const body = details.createDiv({ cls: "be-donate-body" });
              const list = body.createDiv({ cls: "be-donate-codes" });
              for (const code of codes) {
                const fig = list.createEl("figure", { cls: "be-donate-code" });
                const img = fig.createEl("img", {
                  attr: {
                    src: code.src,
                    alt: code.alt,
                    role: "button",
                    tabindex: "0",
                    title: "\u70B9\u51FB\u653E\u5927",
                    "aria-label": `${code.alt}\uFF0C\u70B9\u51FB\u653E\u5927`
                  }
                });
                const openPreview = () => new ImagePreviewModal(this.app, code.src, code.label).open();
                img.addEventListener("click", openPreview);
                img.addEventListener("keydown", (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openPreview();
                  }
                });
                fig.createEl("figcaption", { text: `${code.label} \xB7 \u70B9\u51FB\u653E\u5927` });
              }
            }
          }
        ]
      }
    ];
  }
  /**
   * 声明式设置（getSettingDefinitions）由框架直接持久化到 plugin.settings —— 框架
   * 不执行插件的「一次性副作用」（写 body CSS 变量、切 body class、重建 CM6 widget、
   * 刷新悬停高亮）。而声明式控件的变更都会经过 setControlValue（官方类型
   * SettingControlBase.key 即传入本方法），故在此统一收口分发，避免逐项遗漏。
   */
  async setControlValue(key, value) {
    var _a;
    await super.setControlValue(key, value);
    (_a = SETTING_SIDE_EFFECTS[key]) == null ? void 0 : _a.call(SETTING_SIDE_EFFECTS, this.plugin, value);
  }
};
var SETTING_SIDE_EFFECTS = {
  // 分栏实时预览总开关：切 body class 并立即重建分栏装饰
  livePreviewWidget: (plugin, value) => {
    document.body.classList.toggle("be-columns-live-on", Boolean(value));
    recomputeColumnsEditors(plugin.app);
  },
  // 分栏默认外观：写 body CSS 变量 + 重建 widget（gap / radius / border 变化须重建）
  columnsGap: applyColumnsSideEffects,
  columnsRadius: applyColumnsSideEffects,
  columnsValign: applyColumnsSideEffects,
  columnsBorder: applyColumnsSideEffects,
  // 手柄尺寸：仅需更新 body 变量
  handleSize: (plugin) => applyColumnsCssVars(plugin.settings),
  // 悬停高亮：颜色 / 透明度写 body 变量后立即重绘当前高亮
  blockHoverHighlightColor: applyHoverSideEffects,
  blockHoverHighlightOpacity: applyHoverSideEffects,
  // 悬停高亮开关：重绘即可（是否可见由 handle 内按设置判定）
  blockHoverHighlight: (plugin) => plugin.handle.renderHighlight()
};
function applyColumnsSideEffects(plugin) {
  applyColumnsCssVars(plugin.settings);
  recomputeColumnsEditors(plugin.app);
}
function applyHoverSideEffects(plugin) {
  applyHoverHighlightCssVars(plugin.settings);
  plugin.handle.renderHighlight();
}

// src/main.ts
function ownSourceText(source, info) {
  if (!source || !info) return source;
  const lines = source.split("\n");
  if (info.lineStart < 0 || info.lineEnd < info.lineStart || info.lineEnd >= lines.length) {
    return source;
  }
  return lines.slice(info.lineStart, info.lineEnd + 1).join("\n");
}
async function readVaultText(app, path) {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof import_obsidian11.TFile)) return "";
  try {
    return await app.vault.cachedRead(file);
  } catch (e) {
    return "";
  }
}
function backfillCalloutMetaFromSource(el, source) {
  if (!source) return;
  const srcList = [];
  const re = /^\s*>+\s*\[!([^\]\n]+)\]/;
  for (const line of source.split("\n")) {
    const m = re.exec(line);
    if (!m) continue;
    let kind = m[1];
    let meta = "";
    const bar = kind.indexOf("|");
    if (bar !== -1) {
      meta = kind.slice(bar + 1).trim();
      kind = kind.slice(0, bar);
    }
    srcList.push({ kind: kind.trim().toLowerCase(), meta });
  }
  if (srcList.length === 0) return;
  const domList = Array.from(el.querySelectorAll(".callout[data-callout]"));
  if (domList.length !== srcList.length) return;
  domList.forEach((callout, i) => {
    const src = srcList[i];
    if (!src || callout.getAttribute("data-callout") !== src.kind) return;
    if (!src.meta || callout.getAttribute("data-callout-metadata")) return;
    callout.setAttribute("data-callout-metadata", src.meta);
  });
}
var BlockEditorPlugin = class extends import_obsidian11.Plugin {
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
    this.inserter = new BlockInserter(this);
  }
  async onload() {
    await this.loadSettings();
    document.body.classList.toggle("be-columns-live-on", this.settings.livePreviewWidget);
    applyColumnsCssVars(this.settings);
    applyHoverHighlightCssVars(this.settings);
    installLinkOpenBridge(this.app, () => this.settings.linkOpenMode);
    this.handle.init();
    this.drag.init();
    this.selection.init();
    registerCommands(this);
    this.registerEditorSuggest(new SlashSuggest(this));
    this.registerEditorExtension(columnsExtension(this));
    this.registerEditorExtension(blockColorExtension(this));
    const applyReadingMode = (el, source) => {
      let blockColor = 0;
      const carriers = el.querySelectorAll("[data-block-color]").length;
      if (carriers > 0) {
        applyBlockColorToDom(el);
        blockColor = carriers;
      } else if (source) {
        blockColor = applyBlockColorFromSource(el, source);
        if (blockColor === 0 && el.matches(SOURCE_BLOCK_SELECTOR)) {
          const bg = firstBlockColor(source);
          if (bg == null ? void 0 : bg.light) {
            setBlockColorVars(el, bg);
            el.setAttribute("data-block-color", bg.light);
            blockColor = 1;
          }
        }
      }
      if (!this.settings.livePreviewWidget) return { blockColor, colBg: 0 };
      backfillCalloutMetaFromSource(el, source);
      let colBg = 0;
      el.querySelectorAll('.callout[data-callout="col"]').forEach((callout) => {
        var _a;
        const meta = (_a = callout.getAttribute("data-callout-metadata")) != null ? _a : "";
        const bg = parseColBgMeta(meta);
        if (bg) colBg++;
        setColBgVars(callout, bg);
      });
      el.querySelectorAll('.callout[data-callout="multi-column"]').forEach((shell) => {
        var _a;
        const meta = (_a = shell.getAttribute("data-callout-metadata")) != null ? _a : "";
        const shellEl = shell;
        const gapM = meta.match(/(?:^|\s)gap=(\d+)(?:\s|$)/);
        if (gapM) shellEl.style.setProperty("--be-col-gap", gapM[1] + "px");
        const valignM = meta.match(/(?:^|\s)valign=(top|center|bottom|stretch)(?:\s|$)/);
        if (valignM) shellEl.style.setProperty("--be-col-valign", colValignToCss(valignM[1]));
        const radiusM = meta.match(/(?:^|\s)radius=(\d+)(?:\s|$)/);
        if (radiusM) shellEl.style.setProperty("--be-col-radius", radiusM[1] + "px");
        const hasBorder = /(?:^|\s)border(?:\s|$)/.test(meta);
        const content = shell.querySelector(":scope > .callout-content");
        if (!content) return;
        const rows = [];
        let cur = [];
        for (const child of Array.from(content.children)) {
          const isCol = child.classList.contains("callout") && child.getAttribute("data-callout") === "col";
          const isRow = child.classList.contains("callout") && child.getAttribute("data-callout") === "colrow";
          if (isRow) {
            if (cur.length) rows.push(cur);
            cur = [];
            continue;
          }
          const isCmCol = !isCol && child.classList.contains("cm-callout") && !!child.querySelector(':scope > .callout[data-callout="col"]');
          if (isCmCol) {
            cur.push(child);
            continue;
          }
          const cmRow = !isCol && child.classList.contains("cm-callout") ? child.querySelector(':scope > .callout[data-callout="colrow"]') : null;
          if (cmRow) {
            if (cur.length) rows.push(cur);
            cur = [];
            continue;
          }
          if (isCol) cur.push(child);
        }
        if (cur.length) rows.push(cur);
        const cols = rows.flat();
        if (hasBorder) {
          for (const col of cols) col.classList.add("be-col-border");
        }
        const wm = meta.match(/(?:^|\s)(\d+(?:-\d+)+(?:\/\d+(?:-\d+)+)*)(?:\s|$)/);
        if (!wm) return;
        const groups = wm[1].split("/").map((g) => g.split("-").map((x) => Number(x)));
        const flat = groups.flat();
        if (flat.length !== cols.length || flat.some((w) => !Number.isFinite(w) || w <= 0)) return;
        if (groups.length > 1 && groups.length === rows.length) {
          rows.forEach((row, ri) => {
            const w = groups[ri];
            if (!w || w.length !== row.length) return;
            row.forEach((col, ci) => {
              col.style.flex = `${w[ci]} 1 0%`;
            });
          });
        } else {
          cols.forEach((col, i) => {
            col.style.flex = `${flat[i]} 1 0%`;
          });
        }
      });
      return { blockColor, colBg };
    };
    this.registerMarkdownPostProcessor((el, ctx) => {
      const attempt = (n) => {
        var _a;
        let info = null;
        try {
          info = typeof ctx.getSectionInfo === "function" ? ctx.getSectionInfo(el) : null;
        } catch (e) {
          info = null;
        }
        const source = (_a = info == null ? void 0 : info.text) != null ? _a : "";
        const own = ownSourceText(source, info);
        const ownHasMarkers = hasBlockColorMarker(own);
        const hasColMarkup = !!el.querySelector(
          '.callout[data-callout="col"], .callout[data-callout="multi-column"]'
        );
        let r = { blockColor: 0, colBg: 0 };
        try {
          r = applyReadingMode(el, own);
        } catch (e) {
        }
        if (!source && ctx.sourcePath && n === 0) {
          void readVaultText(this.app, ctx.sourcePath).then((text) => {
            if (!text) return;
            try {
              applyReadingMode(el, text);
            } catch (e) {
            }
          });
        }
        const shouldRetry = n < 3 && el.isConnected && (source === "" || ownHasMarkers && r.blockColor === 0 || hasColMarkup && r.colBg === 0);
        if (shouldRetry) window.setTimeout(() => attempt(n + 1), n === 0 ? 0 : 80);
      };
      attempt(0);
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
    const onActiveDocumentChange = () => {
      flushEditingColumns();
      this.selection.clearSelection();
      this.handle.hideHandle();
      this.handle.updateCursorBlock();
    };
    this.registerEvent(this.app.workspace.on("active-leaf-change", onActiveDocumentChange));
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        var _a;
        if (((_a = this.app.workspace.getActiveFile()) == null ? void 0 : _a.path) !== (file == null ? void 0 : file.path)) return;
        onActiveDocumentChange();
      })
    );
    this.registerEvent(this.app.workspace.on("quit", () => flushEditingColumns()));
    this.registerEvent(this.app.vault.on("modify", () => invalidateNotesWithBlocks()));
    this.registerEvent(this.app.vault.on("create", () => invalidateNotesWithBlocks()));
    this.registerEvent(this.app.vault.on("delete", () => invalidateNotesWithBlocks()));
    this.addSettingTab(new BlockEditorSettingTab(this));
    installColumnsFormatBridge(this.app);
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => installColumnsFormatBridge(this.app))
    );
  }
  onunload() {
    flushEditingColumns();
    uninstallColumnsFormatBridge();
    uninstallLinkOpenBridge();
    this.drag.destroy();
    this.handle.destroy();
    this.selection.destroy();
  }
  async loadSettings() {
    const data = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...data };
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
