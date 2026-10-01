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
  applyBlockColorToDom: () => applyBlockColorToDom,
  blockColorExtension: () => blockColorExtension,
  blockColorField: () => blockColorField,
  buildSlashItems: () => buildSlashItems,
  columnsExtension: () => columnsExtension,
  columnsField: () => columnsField,
  default: () => BlockEditorPlugin,
  getBlockColorDiagnostics: () => getBlockColorDiagnostics,
  getColumnsDiagnostics: () => getColumnsDiagnostics,
  parseBlockColorValue: () => parseBlockColorValue,
  scanBlockIds: () => scanBlockIds
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
  requestAnimationFrame(() => {
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
function openBlockColorPicker(opts) {
  const { x, y, current, onPick } = opts;
  const picker = document.createElement("div");
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
  const title = document.createElement("div");
  title.className = "block-editor-col-picker-title";
  title.textContent = "\u5757\u989C\u8272";
  picker.appendChild(title);
  const swatches = document.createElement("div");
  swatches.className = "block-editor-col-picker-swatches";
  for (const c of BLOCK_COLOR_PALETTE) {
    const sw = document.createElement("button");
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
  const customRow = document.createElement("div");
  customRow.className = "block-editor-col-picker-custom";
  const colorInput = document.createElement("input");
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
  const hexRow = document.createElement("div");
  hexRow.className = "block-editor-col-picker-hex";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "#RRGGBB";
  input.value = current != null ? current : "";
  input.spellcheck = false;
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") applyHex();
  });
  const applyBtn = document.createElement("button");
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
  const clearBtn = document.createElement("button");
  clearBtn.className = "block-editor-col-picker-clear";
  clearBtn.textContent = "\u6E05\u9664\u5757\u989C\u8272";
  clearBtn.addEventListener("click", () => {
    close();
    onPick(null);
  });
  picker.appendChild(clearBtn);
  document.body.appendChild(picker);
  setTimeout(() => window.addEventListener("mousedown", onDocDown, { once: true }), 0);
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
      if (rowEnds == null ? void 0 : rowEnds.includes(i - 1)) out.push(">> [!colrow]");
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
  ["pdf", "PDF"]
];
var MEDIA_EXTS = {
  image: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"],
  audio: ["mp3", "wav", "m4a", "ogg", "flac"],
  video: ["mp4", "webm", "mov", "mkv", "avi"],
  pdf: ["pdf"]
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
  });
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
  });
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
    navigator.clipboard.writeText(`[[${block.file.basename}#^${id}]]`).then(() => new import_obsidian4.Notice(`\u5DF2\u751F\u6210\u5757 ID #^${id} \u5E76\u590D\u5236\u94FE\u63A5`));
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
    const text = moved.join("\n");
    const total = editor.lineCount();
    const insertAt = Math.min(Math.max(insertLine, 0), total);
    keepViewport(getCM(editor), () => {
      if (insertAt >= total) {
        editor.replaceRange("\n" + text, { line: total - 1, ch: editor.getLine(total - 1).length });
      } else {
        editor.replaceRange(text + "\n", { line: insertAt, ch: 0 });
      }
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
  // 自下而上删除行区间，避免行号失效
  removeRanges(editor, ranges) {
    const sorted = [...ranges].sort((a, b) => b.start - a.start);
    keepViewport(getCM(editor), () => {
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
  // 就地复制一份块。副本剥掉块 ID，避免同文出现重复 ID；
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
    navigator.clipboard.writeText(text).then(() => new import_obsidian5.Notice("\u5DF2\u590D\u5236\u5757\u5185\u5BB9"));
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
    const handleSize = this.ctx.settings.handleSize || HANDLE_W;
    const top = coords.top + (lineH - handleSize) / 2;
    if (this.handleEl) {
      this.handleEl.style.display = "flex";
      this.handleEl.style.top = top + "px";
      this.handleEl.style.left = coords.left - handleSize - 6 + "px";
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
  }
  init() {
    const indicator = document.createElement("div");
    indicator.className = "block-editor-indicator";
    indicator.style.display = "none";
    document.body.appendChild(indicator);
    this.indicatorEl = indicator;
    const edgeLine = document.createElement("div");
    edgeLine.className = "block-editor-edge-line";
    edgeLine.style.display = "none";
    document.body.appendChild(edgeLine);
    this.edgeLineEl = edgeLine;
    const edgeBox = document.createElement("div");
    edgeBox.className = "block-editor-edge-box";
    edgeBox.style.display = "none";
    document.body.appendChild(edgeBox);
    this.edgeBoxEl = edgeBox;
  }
  destroy() {
    var _a, _b, _c;
    this.stopAutoScroll();
    this.removeGhost();
    (_a = this.indicatorEl) == null ? void 0 : _a.remove();
    this.indicatorEl = null;
    (_b = this.edgeLineEl) == null ? void 0 : _b.remove();
    this.edgeLineEl = null;
    (_c = this.edgeBoxEl) == null ? void 0 : _c.remove();
    this.edgeBoxEl = null;
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
    if (this.edgeLineEl) this.edgeLineEl.style.display = "none";
    if (this.edgeBoxEl) this.edgeBoxEl.style.display = "none";
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
          this.showEdgeLine(side, box);
          return;
        }
      }
    }
    if (ds.edgeSide !== null) {
      ds.edgeSide = null;
      ds.edgeTargetStart = null;
      if (this.edgeLineEl) this.edgeLineEl.style.display = "none";
      if (this.edgeBoxEl) this.edgeBoxEl.style.display = "none";
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
    const contentRect = cm.contentDOM.getBoundingClientRect();
    const left = contentRect.left;
    const width = Math.max(contentRect.width, 40);
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
    if (this.edgeLineEl) this.edgeLineEl.style.display = "none";
    if (this.edgeBoxEl) this.edgeBoxEl.style.display = "none";
    ds.targetLine = null;
    ds.nestCol = null;
    ds.quotePrefix = null;
    ds.targetEditor = null;
    ds.edgeSide = null;
    ds.edgeTargetStart = null;
    ds.listifyTargetLine = null;
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
    return {
      top: topC.top,
      bottom: botC.bottom,
      left: topC.left,
      right: cm.contentDOM.getBoundingClientRect().right
    };
  }
  /** 绘制贴边分栏视觉：目标块整体描边 + 侧边竖线（side=-1 贴左，1 贴右） */
  showEdgeLine(side, box) {
    if (this.indicatorEl) this.indicatorEl.style.display = "none";
    const h = Math.max(2, box.bottom - box.top);
    if (this.edgeLineEl) {
      const x = side === -1 ? box.left : box.right;
      this.edgeLineEl.style.display = "block";
      this.edgeLineEl.style.left = x + "px";
      this.edgeLineEl.style.top = box.top + "px";
      this.edgeLineEl.style.height = h + "px";
    }
    if (this.edgeBoxEl) {
      this.edgeBoxEl.style.display = "block";
      this.edgeBoxEl.style.left = box.left + "px";
      this.edgeBoxEl.style.top = box.top + "px";
      this.edgeBoxEl.style.width = Math.max(box.right - box.left, 8) + "px";
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
var import_obsidian7 = require("obsidian");
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
function buildSlashItems(query) {
  const items = [
    ...TURN_INTO.map(([id, title]) => ({ kind: "turn", id, title })),
    ...INSERT_ACTIONS.map(([id, title]) => ({ kind: "insert", id, title }))
  ];
  const q = query.toLowerCase();
  if (!q) return items;
  return items.map((item) => ({
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
    pickFile(this.ctx.app, MEDIA_EXTS[id], "\u9009\u62E9" + ((_a = TITLE_OF.get(id)) != null ? _a : "\u9644\u4EF6"), (file) => {
      const line = Math.min(pos.line, editor.lineCount() - 1);
      const ch = Math.min(pos.ch, editor.getLine(line).length);
      editor.replaceRange(`![[${file.path}]]`, { line, ch });
      editor.focus();
    });
  }
};
var SlashSuggest = class extends import_obsidian7.EditorSuggest {
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
    return buildSlashItems(context.query);
  }
  renderSuggestion(item, el) {
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
    const lineIndex = sugg.start.line;
    const detected = this.ctx.detector.getBlockAtLine(editor, lineIndex);
    const block = detected ? { editor, file: null, start: detected.start, end: detected.end, type: detected.type } : { editor, file: null, start: lineIndex, end: lineIndex, type: "empty" };
    this.ctx.converter.convertBlock(editor, block, item.id);
  }
};

// src/columns-preview.ts
var import_view3 = require("@codemirror/view");
var import_state2 = require("@codemirror/state");
var import_obsidian8 = require("obsidian");
var DEBUG = false;
function colLog(...args) {
  if (DEBUG) console.log("%c[BE-columns]", "color:#8b5cf6;font-weight:bold", ...args);
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
  ta.style.height = "auto";
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
function sourceOffsetFromPoint(content, source, x, y) {
  var _a, _b, _c, _d;
  const doc = content.ownerDocument;
  const empty = !source.trim();
  if (!hasCaretApi(doc)) return 0;
  const hit = caretAtPoint(doc, x, y);
  if (!hit || !content.contains(hit.node) || hit.node.nodeType !== 3) return empty ? 0 : null;
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
  const rect = content.getBoundingClientRect();
  const ratio = rect.height > 0 ? Math.min(1, Math.max(0, (y - rect.top) / rect.height)) : 0;
  const lines = source.split("\n");
  const target = Math.round(ratio * (lines.length - 1));
  let off = 0;
  for (let li = 0; li < target && li < lines.length; li++) off += lines[li].length + 1;
  return off;
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
    this.opts = region.opts ? { ...region.opts } : {};
    this.rows = region.rows ? [...region.rows] : [];
  }
  /** 内容签名：内容/宽度/背景色/行结构/外观参数变化时装饰层会重建 widget */
  get key() {
    return columnsContentKey(this.texts, this.widths, this.bgs, this.rows, this.opts);
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
  /** 单栏估算高度（与 estimatedHeight 每栏分量一致，同步占位防 0 高实测） */
  colEstimatedHeight() {
    const rows = this.rows.length ? this.rows.length : 1;
    return Math.max(28, Math.round(this.estimatedHeight / rows));
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
  /** 重建 widget DOM（交互操作入口专用：菜单/拖拽/进入退出编辑）。
   *  视口锁定：DOM 重建会改变 widget 实测高度，CM6 重算视口时整篇文档滚动条会
   *  跳离当前编辑位置；钉住 scrollTop 让视图停在原处。
   *  仅在「CM6 更新之外」的调用点使用——CM6 更新过程中（toDOM）读到的 scrollTop
   *  不可信，该路径直接走 renderInner()。 */
  render() {
    keepViewport(this.parentView, () => this.renderInner());
  }
  /** 结构 / 内容变更后的统一收尾：写回文档 + 重建 DOM。
   *  写回延迟到微任务（CM 更新期间禁止 dispatch）。 */
  mutate() {
    queueMicrotask(() => this.commitDoc());
    this.render();
  }
  renderInner() {
    var _a;
    const wrap = this.root;
    if (!wrap) return;
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
      const row = document.createElement("div");
      row.className = "block-editor-columns-row";
      if (ri < rowLens.length - 1) row.classList.add("block-editor-columns-row-mid");
      wrap.appendChild(row);
      if (this.opts.gap != null) wrap.style.setProperty("--be-col-gap", this.opts.gap + "px");
      if (this.opts.valign) wrap.style.setProperty("--be-col-valign", this.opts.valign);
      if (this.opts.radius != null) wrap.style.setProperty("--be-col-radius", this.opts.radius + "px");
      if (this.opts.border) row.classList.add("block-editor-columns-border");
      const rowLen = rowLens[ri];
      for (let j = 0; j < rowLen; j++, si++) {
        const i = si;
        if (j > 0) {
          const resizer = document.createElement("div");
          resizer.className = "block-editor-col-resizer";
          resizer.title = "\u62D6\u62FD\u8C03\u6574\u680F\u5BBD";
          resizer.addEventListener("mousedown", (e) => this.startResize(e, i - 1, row, resizer));
          row.appendChild(resizer);
        }
        const col = document.createElement("div");
        col.className = "block-editor-col-editor";
        const colWidth = (_a = this.widths[i]) != null ? _a : 100 / this.texts.length;
        col.style.flex = colWidth + " 1 0%";
        setColBgVars(col, this.bgs[i]);
        const grip = document.createElement("div");
        grip.className = "block-editor-col-grip";
        grip.textContent = "\u283F";
        grip.title = "\u62D6\u52A8\u6392\u5E8F\uFF1B\u70B9\u51FB\u6253\u5F00\u83DC\u5355";
        grip.addEventListener("mousedown", (e) => this.gripDown(e, i));
        col.appendChild(grip);
        if (this.editCol === i) {
          const ta = document.createElement("textarea");
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
        } else {
          const content = document.createElement("div");
          content.className = "block-editor-col-content";
          content.addEventListener("mousedown", (e) => {
            var _a2, _b;
            if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            if ((_b = (_a2 = e.target) == null ? void 0 : _a2.closest) == null ? void 0 : _b.call(_a2, "a")) return;
            if (this.editCol !== null && this.editCol !== i) return;
            const pos = sourceOffsetFromPoint(content, this.texts[i], e.clientX, e.clientY);
            if (pos === null) return;
            e.preventDefault();
            this.enterEdit(i, pos);
          });
          col.appendChild(content);
          content.style.minHeight = this.colEstimatedHeight() + "px";
          if (!this.texts[i] || !this.texts[i].trim()) {
            content.classList.add("block-editor-col-empty");
          } else {
            import_obsidian8.MarkdownRenderer.render(this.ctx.app, this.texts[i], content, this.path, this.ctx).then(() => {
              const rm = () => {
                var _a2;
                return (_a2 = this.parentView) == null ? void 0 : _a2.requestMeasure();
              };
              rm();
              requestAnimationFrame(rm);
              setTimeout(rm, 300);
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
    if (this.editCol !== null) return;
    installColumnsFormatBridge(this.ctx.app);
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
    const clearDrop = () => this.colEls.forEach((c) => c.classList.remove("block-editor-col-drop"));
    const detach = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", onCancel);
    };
    const onMove = (ev) => {
      var _a, _b;
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) <= THRESHOLD) return;
      dragging = true;
      const el = (_b = (_a = document.elementFromPoint) == null ? void 0 : _a.call(document, ev.clientX, ev.clientY)) == null ? void 0 : _b.closest(".block-editor-col-editor");
      hover = el ? this.colEls.indexOf(el) : -1;
      this.colEls.forEach((c, k) => c.classList.toggle("block-editor-col-drop", k === hover && hover !== from));
    };
    const onCancel = () => {
      detach();
      clearDrop();
    };
    const onUp = (ev) => {
      var _a, _b;
      detach();
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
          this.mutate();
        });
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("blur", onCancel);
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
    const splitBtn = document.createElement("button");
    splitBtn.className = "block-editor-col-menu-item";
    splitBtn.title = "\u62C6\u5206\u680F\uFF08\u4E00\u680F\u62C6\u4E24\u680F\uFF09";
    splitBtn.appendChild(_ColumnsWidget.iconEl(_ColumnsWidget.ICON_SPLIT));
    splitBtn.addEventListener("click", () => {
      this.closeMenu();
      this.splitColumnAt(i);
    });
    const mergeBtn = document.createElement("button");
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
    const rowBtn = document.createElement("button");
    rowBtn.className = "block-editor-col-menu-item";
    rowBtn.title = "\u8FFD\u52A0\u4E00\u884C\uFF08\u4E0E\u9996\u884C\u540C\u680F\u6570\uFF09";
    rowBtn.appendChild(_ColumnsWidget.iconEl(_ColumnsWidget.ICON_PLUS));
    rowBtn.addEventListener("click", () => {
      this.closeMenu();
      this.appendRow();
    });
    const delRowBtn = document.createElement("button");
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
      const rowUp = document.createElement("button");
      rowUp.className = "block-editor-col-menu-item";
      rowUp.title = "\u4E0A\u79FB\u6574\u884C";
      if (rIdx === 0) rowUp.disabled = true;
      rowUp.appendChild(_ColumnsWidget.iconEl(_ColumnsWidget.ICON_ROW_UP));
      rowUp.addEventListener("click", () => {
        this.closeMenu();
        this.moveRow(rIdx, -1);
      });
      const rowDown = document.createElement("button");
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
    setTimeout(() => {
      window.addEventListener("mousedown", this.onDocMouseDown, { once: true });
    }, 0);
  }
  /** 弹窗选色：预设色板 + 自定义 hex + 无背景色（清除） */
  openColorPicker(i, x, y) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
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
    const hexRow = document.createElement("div");
    hexRow.className = "block-editor-col-picker-hex";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "#RRGGBB";
    input.value = (_d = (_c = this.bgs[i]) == null ? void 0 : _c.light) != null ? _d : "";
    input.spellcheck = false;
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") applyHex();
    });
    const applyBtn = document.createElement("button");
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
    const darkSection = document.createElement("div");
    darkSection.className = "block-editor-col-picker-dark";
    const darkToggle = document.createElement("button");
    darkToggle.className = "block-editor-col-picker-dark-toggle";
    darkToggle.textContent = "\u8986\u76D6\u6DF1\u8272\u4E3B\u9898\u989C\u8272";
    darkToggle.addEventListener("click", () => {
      darkBody.hidden = !darkBody.hidden;
      darkToggle.textContent = darkBody.hidden ? "\u8986\u76D6\u6DF1\u8272\u4E3B\u9898\u989C\u8272" : "\u6536\u8D77\u6DF1\u8272\u8986\u76D6";
    });
    const darkBody = document.createElement("div");
    darkBody.className = "block-editor-col-picker-dark-body";
    darkBody.hidden = true;
    const darkRow = document.createElement("div");
    darkRow.className = "block-editor-col-picker-dark-row";
    const darkNative = document.createElement("input");
    darkNative.type = "color";
    darkNative.className = "block-editor-col-picker-native";
    darkNative.value = (_f = (_e = this.bgs[i]) == null ? void 0 : _e.dark) != null ? _f : "#f1f3f5";
    darkNative.title = "\u6DF1\u8272\u4E3B\u9898\u80CC\u666F\u8272";
    const darkInput = document.createElement("input");
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
    const darkApply = document.createElement("button");
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
    const darkReset = document.createElement("button");
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
_ColumnsWidget.ICON_SPLIT = ["M8 3v18", "M16 3v18"];
_ColumnsWidget.ICON_MERGE = ["M8 7l-4 5 4 5", "M16 7l4 5-4 5"];
_ColumnsWidget.ICON_ROW_UP = ["M18 15l-6-6-6 6"];
_ColumnsWidget.ICON_ROW_DOWN = ["M6 9l6 6 6-6"];
/** 5 个协调的柔和预设背景色 */
_ColumnsWidget.BG_PALETTE = ["#f1f3f5", "#ffe8e8", "#fff4d6", "#d8f3dc", "#d0ebff"];
var ColumnsWidget = _ColumnsWidget;
function path_of(state) {
  var _a, _b;
  const mv = state.field(import_obsidian8.editorInfoField);
  return (_b = (_a = mv == null ? void 0 : mv.file) == null ? void 0 : _a.path) != null ? _b : "";
}
var widgetCache = /* @__PURE__ */ new Map();
var sharedCtx = null;
function buildDecorations(state, regions) {
  var _a, _b;
  const ranges = [];
  const live = state.field(import_obsidian8.editorLivePreviewField);
  const docId = path_of(state) || "untitled";
  const owner = (_b = (_a = state.field(import_obsidian8.editorInfoField)) == null ? void 0 : _a.editor) != null ? _b : null;
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
    const key = columnsContentKey(r.segments, r.widths, r.bgs, r.rows, r.opts);
    let entry = widgetCache.get(r.startPos);
    let widget;
    if (entry && entry.path === docId && entry.owner === owner && entry.key === key) {
      widget = entry.widget;
      widget.region = r;
    } else {
      colLog("\u521B\u5EFA\u6E32\u67D3 widget", { startLine: r.startLine, doc: docId });
      widget = new ColumnsWidget(ctx_of(state), r, docId, owner);
      widgetCache.set(r.startPos, { path: docId, owner, key, widget });
    }
    ranges.push(import_view3.Decoration.replace({ block: true, widget }).range(clampStart, clampEnd));
  }
  for (const k of [...widgetCache.keys()]) {
    const e = widgetCache.get(k);
    if (!e || e.path !== docId || e.owner !== owner || !used.has(k)) widgetCache.delete(k);
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
      requestAnimationFrame(() => {
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
      new ColumnsDiagModal(this.app, json).open();
      navigator.clipboard.writeText(json).then(() => new import_obsidian9.Notice("\u8BCA\u65AD\u4FE1\u606F\u5DF2\u540C\u65F6\u590D\u5236\u5230\u526A\u8D34\u677F"));
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
var DEFAULT_SETTINGS = {
  showHandle: true,
  handleFollowsCursor: true,
  slashCommands: true,
  dragAutoScroll: true,
  indentStep: 0,
  livePreviewWidget: false,
  columnsGap: 18,
  columnsRadius: 5,
  columnsValign: "stretch",
  columnsBorder: false,
  handleSize: 20,
  dragThreshold: 4,
  linkOpenMode: "current"
};
function applyColumnsCssVars(settings) {
  const body = document.body;
  body.style.setProperty("--be-col-gap", settings.columnsGap + "px");
  body.style.setProperty("--be-col-radius", settings.columnsRadius + "px");
  body.style.setProperty("--be-col-valign", settings.columnsValign);
  body.style.setProperty("--be-col-border", settings.columnsBorder ? "1px" : "0px");
  body.style.setProperty("--be-handle-size", settings.handleSize + "px");
}
var BlockEditorSettingTab = class extends import_obsidian10.PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Block Editor \u8BBE\u7F6E" });
    new import_obsidian10.Setting(containerEl).setName("\u663E\u793A\u5757\u624B\u67C4").setDesc("\u5728\u7F16\u8F91\u5668\u5DE6\u4FA7\u663E\u793A Notion \u98CE\u683C\u7684\u5757\u624B\u67C4").addToggle(
      (t) => t.setValue(this.plugin.settings.showHandle).onChange(async (value) => {
        this.plugin.settings.showHandle = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian10.Setting(containerEl).setName("\u624B\u67C4\u8DDF\u968F\u5149\u6807").setDesc("\u5149\u6807\u79FB\u52A8\u540E\u624B\u67C4\u81EA\u52A8\u8DDF\u5230\u5F53\u524D\u5757\uFF1B\u5173\u95ED\u540E\u4EC5\u5728\u9F20\u6807\u60AC\u505C\u65F6\u663E\u793A").addToggle(
      (t) => t.setValue(this.plugin.settings.handleFollowsCursor).onChange(async (value) => {
        this.plugin.settings.handleFollowsCursor = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian10.Setting(containerEl).setName("\u5B9E\u9A8C\uFF1A\u5B9E\u65F6\u9884\u89C8\u81EA\u6E32\u67D3\u5206\u680F").setDesc("\u5F00\u542F\u540E\u5B9E\u65F6\u9884\u89C8\u4E2D\u5206\u680F\u533A\u57DF\u7531\u63D2\u4EF6\u81EA\u6E32\u67D3\uFF08\u53CC\u51FB\u8FDB\u5165\u7F16\u8F91\uFF09\uFF1B\u5173\u95ED\u65F6\u663E\u793A\u539F\u751F\u5D4C\u5957 callout\u3002\u66F4\u6539\u540E\u7ACB\u5373\u751F\u6548").addToggle(
      (t) => t.setValue(this.plugin.settings.livePreviewWidget).onChange(async (value) => {
        this.plugin.settings.livePreviewWidget = value;
        document.body.classList.toggle("be-columns-live-on", value);
        await this.plugin.saveSettings();
        recomputeColumnsEditors(this.plugin.app);
      })
    );
    new import_obsidian10.Setting(containerEl).setName("\u542F\u7528\u659C\u6760\u547D\u4EE4").setDesc("\u5728\u6B63\u6587\u4E2D\u8F93\u5165 / \u5FEB\u901F\u628A\u5F53\u524D\u5757\u8F6C\u6362\u4E3A\u5176\u4ED6\u7C7B\u578B").addToggle(
      (t) => t.setValue(this.plugin.settings.slashCommands).onChange(async (value) => {
        this.plugin.settings.slashCommands = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian10.Setting(containerEl).setName("\u62D6\u62FD\u81EA\u52A8\u6EDA\u52A8").setDesc("\u62D6\u52A8\u5757\u5230\u7F16\u8F91\u533A\u4E0A\u4E0B\u8FB9\u7F18\u65F6\u81EA\u52A8\u6EDA\u52A8").addToggle(
      (t) => t.setValue(this.plugin.settings.dragAutoScroll).onChange(async (value) => {
        this.plugin.settings.dragAutoScroll = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian10.Setting(containerEl).setName("\u7F29\u8FDB\u6B65\u957F").setDesc("\u5757\u7F29\u8FDB / \u51CF\u5C11\u7F29\u8FDB\u65F6\u7684\u7A7A\u683C\u6570\uFF0C0 \u8868\u793A\u81EA\u52A8\u68C0\u6D4B\u5168\u6587\u6700\u5C0F\u7F29\u8FDB").addSlider(
      (s) => s.setLimits(0, 8, 1).setValue(this.plugin.settings.indentStep).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.indentStep = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian10.Setting(containerEl).setName("\u70B9\u51FB\u94FE\u63A5\u65F6\u7684\u6253\u5F00\u4F4D\u7F6E").setDesc("\u70B9\u51FB\u5185\u90E8\u94FE\u63A5 [[...]] \u65F6\u5728\u54EA\u91CC\u6253\u5F00\uFF1BCtrl/Cmd+\u70B9\u51FB\u7B49\u4FEE\u9970\u952E\u884C\u4E3A\u4E0D\u53D7\u5F71\u54CD").addDropdown(
      (d) => d.addOption("current", "\u5F53\u524D\u6807\u7B7E\u9875").addOption("tab", "\u65B0\u6807\u7B7E\u9875").addOption("split", "\u5206\u5C4F\uFF08\u53F3\u4FA7\uFF09").addOption("window", "\u65B0\u7A97\u53E3\uFF08\u5F39\u51FA\uFF09").setValue(this.plugin.settings.linkOpenMode).onChange(async (value) => {
        this.plugin.settings.linkOpenMode = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "\u5206\u680F" });
    new import_obsidian10.Setting(containerEl).setName("\u9ED8\u8BA4\u680F\u95F4\u8DDD").setDesc("\u5206\u680F\u5916\u58F3\u672A\u5199 gap= \u53C2\u6570\u65F6\u7684\u680F\u95F4\u8DDD\uFF08px\uFF09\uFF0C\u5B9E\u65F6\u9884\u89C8\u4E0E\u9605\u8BFB\u6A21\u5F0F\u751F\u6548").addSlider(
      (s) => s.setLimits(0, 48, 1).setValue(this.plugin.settings.columnsGap).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.columnsGap = value;
        applyColumnsCssVars(this.plugin.settings);
        await this.plugin.saveSettings();
        recomputeColumnsEditors(this.plugin.app);
      })
    );
    new import_obsidian10.Setting(containerEl).setName("\u9ED8\u8BA4\u5706\u89D2").setDesc("\u5206\u680F\u5916\u58F3\u672A\u5199 radius= \u53C2\u6570\u65F6\u7684\u680F\u5706\u89D2\uFF08px\uFF09").addSlider(
      (s) => s.setLimits(0, 24, 1).setValue(this.plugin.settings.columnsRadius).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.columnsRadius = value;
        applyColumnsCssVars(this.plugin.settings);
        await this.plugin.saveSettings();
        recomputeColumnsEditors(this.plugin.app);
      })
    );
    new import_obsidian10.Setting(containerEl).setName("\u9ED8\u8BA4\u5782\u76F4\u5BF9\u9F50").setDesc("\u5206\u680F\u5916\u58F3\u672A\u5199 valign= \u53C2\u6570\u65F6\u7684\u680F\u5782\u76F4\u5BF9\u9F50\u65B9\u5F0F").addDropdown(
      (d) => d.addOption("stretch", "\u62C9\u4F38\uFF08\u7B49\u9AD8\uFF09").addOption("top", "\u9876\u90E8\u5BF9\u9F50").addOption("center", "\u5C45\u4E2D\u5BF9\u9F50").addOption("bottom", "\u5E95\u90E8\u5BF9\u9F50").setValue(this.plugin.settings.columnsValign).onChange(async (value) => {
        this.plugin.settings.columnsValign = value;
        applyColumnsCssVars(this.plugin.settings);
        await this.plugin.saveSettings();
        recomputeColumnsEditors(this.plugin.app);
      })
    );
    new import_obsidian10.Setting(containerEl).setName("\u9ED8\u8BA4\u8FB9\u6846").setDesc("\u5206\u680F\u5916\u58F3\u672A\u5199 border \u53C2\u6570\u65F6\u662F\u5426\u663E\u793A\u680F\u8FB9\u6846").addToggle(
      (t) => t.setValue(this.plugin.settings.columnsBorder).onChange(async (value) => {
        this.plugin.settings.columnsBorder = value;
        applyColumnsCssVars(this.plugin.settings);
        await this.plugin.saveSettings();
        recomputeColumnsEditors(this.plugin.app);
      })
    );
    containerEl.createEl("h3", { text: "\u624B\u67C4\u4E0E\u62D6\u62FD" });
    new import_obsidian10.Setting(containerEl).setName("\u624B\u67C4\u5C3A\u5BF8").setDesc("\u7F16\u8F91\u5668\u5DE6\u4FA7\u5757\u624B\u67C4\u7684\u5927\u5C0F\uFF08px\uFF09").addSlider(
      (s) => s.setLimits(12, 32, 1).setValue(this.plugin.settings.handleSize).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.handleSize = value;
        applyColumnsCssVars(this.plugin.settings);
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian10.Setting(containerEl).setName("\u62D6\u62FD\u9608\u503C").setDesc("\u6309\u4F4F\u5757\u624B\u67C4\u62D6\u52A8\u7684\u5224\u5B9A\u4F4D\u79FB\uFF08px\uFF09\uFF0C\u5C0F\u4E8E\u8BE5\u4F4D\u79FB\u89C6\u4E3A\u70B9\u51FB\u5F39\u51FA\u5757\u83DC\u5355").addSlider(
      (s) => s.setLimits(0, 16, 1).setValue(this.plugin.settings.dragThreshold).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.dragThreshold = value;
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/main.ts
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
    console.log("[block-editor]", this.manifest.version, "onload");
    await this.loadSettings();
    document.body.classList.toggle("be-columns-live-on", this.settings.livePreviewWidget);
    applyColumnsCssVars(this.settings);
    installLinkOpenBridge(this.app, () => this.settings.linkOpenMode);
    this.handle.init();
    this.drag.init();
    this.selection.init();
    registerCommands(this);
    this.registerEditorSuggest(new SlashSuggest(this));
    this.registerEditorExtension(columnsExtension(this));
    this.registerEditorExtension(blockColorExtension(this));
    this.registerMarkdownPostProcessor((el) => {
      applyBlockColorToDom(el);
      if (!this.settings.livePreviewWidget) return;
      el.querySelectorAll('.callout[data-callout="col"]').forEach((callout) => {
        var _a;
        const meta = (_a = callout.getAttribute("data-callout-metadata")) != null ? _a : "";
        setColBgVars(callout, parseColBgMeta(meta));
      });
      el.querySelectorAll('.callout[data-callout="multi-column"]').forEach((shell) => {
        var _a;
        const meta = (_a = shell.getAttribute("data-callout-metadata")) != null ? _a : "";
        const shellEl = shell;
        const gapM = meta.match(/(?:^|\s)gap=(\d+)(?:\s|$)/);
        if (gapM) shellEl.style.setProperty("--be-col-gap", gapM[1] + "px");
        const valignM = meta.match(/(?:^|\s)valign=(top|center|bottom|stretch)(?:\s|$)/);
        if (valignM) shellEl.style.setProperty("--be-col-valign", valignM[1]);
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
          const cmCol = !isCol && child.classList.contains("cm-callout") ? child.querySelector(':scope > .callout[data-callout="col"]') : null;
          if (cmCol) {
            cur.push(cmCol);
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
              col.style.flex = `${w[ci]} 1 0`;
            });
          });
        } else {
          cols.forEach((col, i) => {
            col.style.flex = `${flat[i]} 1 0`;
          });
        }
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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
