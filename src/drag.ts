import type { Editor, MarkdownView, TFile } from 'obsidian';
import type { BlockContext, BlockRange, BlockType, CMView } from './types';
import type BlockEditorPlugin from './main';
import { getCM, getIndent, getLines, keepViewport } from './util';
import { columnsWidgetAtPoint } from './columns-preview';
import {
  buildCombinedChanges,
  collectDraggedLines,
  hitColumnsLayout,
  stripQuotePrefixes,
} from './columns-droptarget';
import type { ColDropHit } from './columns-droptarget';

interface DragState {
  editor: Editor;
  file: TFile | null;
  start: number;
  end: number;
  type: BlockType;
  ranges: BlockRange[];
  /** 落点所在的目标编辑器；null 表示仍在源编辑器内（或同文档分屏） */
  targetEditor: Editor | null;
  targetLine: number | null;
  nestCol: number | null;
  /** 拖入引用 / callout 时套用的引用前缀（如 `> ` / `>> `），null 表示不嵌套引用 */
  quotePrefix: string | null;
  /** H4 贴边分栏：-1 贴目标块左边缘（拖动块作左栏），1 贴右边缘（作右栏），null 未命中 */
  edgeSide: -1 | 1 | null;
  /** H4 贴边目标块首行（onMouseUp 时重新取块，拖拽期间文档不变、行号稳定） */
  edgeTargetStart: number | null;
  /** 拖入普通段落/标题时需「列表化」的目标首行（null 表示非此类嵌套） */
  listifyTargetLine: number | null;
  /** 需求 A：命中分栏 widget 的落点（新增一栏），null 表示未命中分栏 */
  colHit: ColDropHit | null;
  /** 需求 A：命中分栏所属的 widget（写回时用其区间与状态） */
  colWidget: ColumnsWidgetLike | null;
  startY: number;
  startX: number;
  lastX: number;
  lastY: number;
  edgeDir: number;
  scrollTimer: number | null;
  moved: boolean;
}

/**
 * drag.ts 实际用到的 ColumnsWidget 表面（局部声明避免与 columns-preview 形成
 * 类型环：columns-preview 不 import drag.ts，此处用结构化子类型解耦）。
 */
interface ColumnsWidgetLike {
  getLayoutInfo(): ReturnType<typeof import('./columns-droptarget').buildColLayout>;
  getLineRange(): { start: number; end: number };
  getRegionStartPos(): number;
  getRegionEndPos(): number;
  hasBreak(): boolean;
  insertColumnAt(insertIndex: number, text: string): boolean;
  buildRegionText(): string;
}


/** 分栏外壳标记（拖拽嵌套引用时排除，避免插入点落在分栏内部截断结构） */
const COL_SHELL_RE = /^\s*>\s*\[!multi-column(?:\|[^\]]*)?\]/;

/** 四向落区：目标块盒左右外缘带的贴边分栏热区宽度上限 */
const EDGE_BAND = 36;
/** 窄块时贴边带下限，避免热区过小不可命中 */
const EDGE_BAND_MIN = 12;
/** 缩进嵌套热区起点（指针须超过行文本左缘 + NEST_OFFSET 才算嵌套） */
const NEST_OFFSET = 24;
/** 嵌套插入的一步缩进字符数（设置里未指定步长时使用） */
const NEST_INDENT = 4;
/** 目标为列表 / 引用 / callout 时，左侧贴边带收缩到嵌套起点之前，避免与嵌套争抢 */
const EDGE_BAND_NESTABLE = NEST_OFFSET - 4;
/** 可作为缩进嵌套目标（需为其让出边缘热区）的块类型 */
const NESTABLE_TYPES = ['list', 'quote', 'callout'];
/** 普通段落 / 标题：Markdown 无父子结构，拖入时把目标「列表化」再嵌套 */
const LISTIFY_TYPES = ['line', 'heading'];

/** 是否为「缩进为子块」的落点目标（列表/引用/Callout + 需列表化的普通段落/标题） */
function isNestTarget(type: BlockType): boolean {
  return NESTABLE_TYPES.includes(type) || LISTIFY_TYPES.includes(type);
}

/** 拖拽排序：幽灵预览、插入指示线、边缘自动滚动、列表嵌套 / 降级 */
export class DragController {
  private state: DragState | null = null;
  private ghostEl: HTMLElement | null = null;
  private indicatorEl: HTMLElement | null = null;
  private edgeLineEl: HTMLElement | null = null;
  private edgeBoxEl: HTMLElement | null = null;
  /** 需求 A：分栏内「新栏插在这里」的位置竖条 */
  private colSlotEl: HTMLElement | null = null;

  constructor(private ctx: BlockEditorPlugin) {}

  init(): void {
    // 指示器 / 贴边线 / 描边盒不在 init 时挂入 DOM，使用时动态挂到目标编辑器的
    // .cm-editor 上：absolute 定位 + overflow:hidden 物理裁剪，不溢出到标签页栏。
    // 拖拽幽灵（ghost）仍挂 body，需高于一切 UI 跟随鼠标。
    const indicator = createEl('div');
    indicator.className = 'block-editor-indicator';
    this.indicatorEl = indicator;
    // H4 贴边分栏竖线（横向插入线之上，视觉区分：竖线 = 贴边合成）
    const edgeLine = createEl('div');
    edgeLine.className = 'block-editor-edge-line';
    this.edgeLineEl = edgeLine;
    // 贴边分栏目标块整体描边（与竖线共同构成「此块将合成分栏」的明确视觉，
    // 与「横向插入线 = 移动」形成一眼可辨的区分，避免两种落点模式混淆）
    const edgeBox = createEl('div');
    edgeBox.className = 'block-editor-edge-box';
    this.edgeBoxEl = edgeBox;
    // 需求 A：分栏内插入位置竖条（accent 色，宽度 2px，与 edge-line 区分：
    // edge-line 是"贴边合成分栏"的语义竖线，本条是"新栏插这里"的插入位）
    const colSlot = createEl('div');
    colSlot.className = 'block-editor-col-slot';
    this.colSlotEl = colSlot;
  }

  destroy(): void {
    this.stopAutoScroll();
    this.removeGhost();
    this.indicatorEl?.remove();
    this.indicatorEl = null;
    this.edgeLineEl?.remove();
    this.edgeLineEl = null;
    this.edgeBoxEl?.remove();
    this.edgeBoxEl = null;
    this.colSlotEl?.remove();
    this.colSlotEl = null;
    this.state = null;
    document.body.classList.remove('block-editor-dragging');
  }

  isActive(): boolean {
    return this.state !== null;
  }

  onHandleMouseDown(e: MouseEvent): void {
    const block = this.ctx.handle.currentBlock;
    if (!block) return;

    e.preventDefault();
    e.stopPropagation();

    // Shift + 点击手柄：把块加入 / 移出多选
    if (e.shiftKey) {
      this.ctx.selection.toggleSelection(block);
      return;
    }

    const inSelection = this.ctx.selection.isInSelection(block);
    const sel = this.ctx.selection.selection;
    const ranges =
      inSelection && sel
        ? sel.ranges
        : [{ start: block.start, end: block.end, type: block.type }];
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
      moved: false,
    };
    this.ctx.handle.setDragging(true);
    document.body.classList.add('block-editor-dragging');
  }

  onMouseUp(e: MouseEvent): void {
    const ds = this.state;
    if (!ds) return;
    this.state = null;
    this.stopAutoScroll(ds);
    this.removeGhost();

    this.ctx.handle.setDragging(false);
    document.body.classList.remove('block-editor-dragging');
    if (this.indicatorEl) this.indicatorEl.setCssStyles({ display: 'none' });
    if (this.edgeLineEl) this.edgeLineEl.setCssStyles({ display: 'none' });
    if (this.edgeBoxEl) this.edgeBoxEl.setCssStyles({ display: 'none' });
    if (this.colSlotEl) this.colSlotEl.setCssStyles({ display: 'none' });

    if (!ds.moved) {
      // 视为点击 -> 打开块菜单
      this.ctx.menu.openTypeMenu(e, {
        editor: ds.editor,
        file: ds.file,
        start: ds.start,
        end: ds.end,
        type: ds.type,
      });
      return;
    }

    // 需求 A：拖入分栏新增栏。放在贴边分栏之前 —— 分栏命中时 ds.edgeSide 必为 null，
    // 两者几何互斥，顺序不影响正确性；置前让"进分栏"优先于"贴边合成"。
    if (ds.colHit && ds.colWidget) {
      if (this.commitColumnDrop(ds, ds.colWidget, ds.colHit, e.altKey)) {
        this.ctx.handle.hideHandle();
        return;
      }
    }

    // 四向落区·贴边分栏：松手时若仍命中贴边热区（同文档），把拖动块与目标块
    // 合成两栏分栏；合成失败（目标已变 / 结构异常）时 ds.targetLine 仍保留着
    // 拖拽期间算出的纵向插入点，自然回退到下方的普通移动分支。
    if (ds.edgeSide !== null && ds.edgeTargetStart !== null && ds.targetEditor === null) {
      const t = this.ctx.detector.getBlockAtLine(ds.editor, ds.edgeTargetStart);
      if (t && this.ctx.converter.wrapToEdgeColumns(ds.editor, ds.ranges, t, ds.edgeSide)) {
        this.ctx.handle.hideHandle();
        return;
      }
    }

    // 普通段落 / 标题嵌套：把目标列表化后插入子项（单步撤销；Alt 为复制）
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
          // 跨文档复制：源不动
          const lines: string[] = [];
          for (const r of [...ds.ranges].sort((a, b) => a.start - b.start)) {
            lines.push(...getLines(ds.editor, r.start, r.end));
          }
          this.ctx.ops.insertLines(ds.targetEditor, lines, ds.targetLine, ds.nestCol, ds.quotePrefix);
        } else {
          // 跨文档移动：目标插入 + 源删除，各文件一步撤销
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
  private commitColumnDrop(
    ds: DragState,
    widget: ColumnsWidgetLike,
    hit: ColDropHit,
    copy: boolean
  ): boolean {
    const cm = getCM(ds.editor);
    if (!cm) return false;

    const lines = collectDraggedLines(ds.editor, ds.ranges);
    const text = stripQuotePrefixes(lines);
    if (!text.trim()) return false;

    const range = widget.getLineRange();
    // 拖拽期间文档未变，但保险起见复核区间未越界（结构被外部改动时放弃本次落点）
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
      // 删除源块：多选时按行号升序逐段删除，每段含行尾换行（与 ops.removeRanges 同语义）
      const sorted = [...ds.ranges].sort((a, b) => a.start - b.start);
      for (const r of sorted) {
        const from = doc.line(r.start + 1).from;
        // 末行块不能带换行（会越过文档尾），改为删到本行行尾
        const to =
          r.end < doc.lines - 1 ? doc.line(r.end + 2).from : doc.line(r.end + 1).to;
        changes.push({ from, to, insert: '' });
      }
    }

    // 视口锁定：区间重写 + 源块删除会让 CM6 重算视口，钉住 scrollTop 停在原位置
    keepViewport(cm, () => {
      cm.dispatch({ changes });
    });
    return true;
  }

  onDragMove(e: MouseEvent): void {
    const ds = this.state;
    if (!ds) return;

    ds.lastX = e.clientX;
    ds.lastY = e.clientY;

    // 任意方向位移超过 4px 即进入拖拽；已离开源编辑器也算（跨分屏拖拽几乎纯横向，
    // 旧逻辑只看纵向位移，导致分屏拖拽永远无法启动、松手被当成点击弹菜单）
    if (!ds.moved) {
      // M4：拖拽阈值取设置值（默认 4px），小于阈值视为点击（打开块菜单）
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
  private applyActionHint(ds: DragState, altKey: boolean): void {
    const el = this.ghostEl;
    if (!el) return;
    const action = this.resolveAction(ds, altKey);
    if (action) el.dataset.action = action;
    else delete el.dataset.action;
  }

  // 当前落点对应的动作状态；无有效落点（拖回自身 / 无效区域）返回 null，此时不显示标签
  private resolveAction(ds: DragState, altKey: boolean): string | null {
    // 需求 A：命中分栏 → 新增一栏（该路径优先于贴边，几何上已互斥）
    if (ds.colHit) return altKey ? 'col-new-copy' : 'col-new';
    // 贴边分栏优先：松手直接与目标块合成两栏（该路径不响应 Alt）
    if (ds.edgeSide === -1) return 'column-left';
    if (ds.edgeSide === 1) return 'column-right';
    if (ds.targetLine == null) return null;
    if (ds.targetEditor !== null) return altKey ? 'copy-cross' : 'move-cross';
    if (altKey) return 'copy';
    if (ds.nestCol != null || ds.quotePrefix != null) return 'nest';
    return 'move';
  }

  // 指针是否已经离开源编辑器区域
  private isOutsideSourceEditor(ds: DragState, x: number, y: number): boolean {
    const cm = getCM(ds.editor);
    if (!cm) return false;
    const r = cm.dom.getBoundingClientRect();
    return x < r.left || x > r.right || y < r.top || y > r.bottom;
  }

  // 按当前鼠标位置计算落点并画插入线。落点可以是另一篇文档的编辑器（跨文档拖拽）
  private updateDropTarget(ds: DragState, x: number, y: number): void {
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
    // 同一个文档对象（如分屏打开同一文件）按文档内拖拽处理，避免行号错乱
    const sameDoc = overCm.state.doc === getCM(ds.editor)?.state.doc;
    const editor = sameDoc ? ds.editor : over.editor;
    const cm = getCM(editor);
    if (!cm) {
      this.clearDropTarget(ds);
      return;
    }
    const cross = !sameDoc;

    // 需求 A：命中分栏 widget → 新增一栏。
    // 必须放在 posAtCoords 之前：widget 是 ignoreEvent 的 block 替换装饰，
    // posAtCoords 对栏内只能给出整个区间的替换位置，取不到"第几栏"。
    // 命中即 return，不进入后面的行号 / 嵌套 / 贴边判定（几何互斥）。
    if (!cross) {
      const colWidget = columnsWidgetAtPoint(x, y);
      if (colWidget) {
        if (this.tryColumnDropTarget(ds, colWidget, x, y)) return;
        // 命中分栏但资格校验不过（拖源是分栏本身 / 与区间重叠）：不给落点提示
        this.clearDropTarget(ds);
        return;
      }
    }
    // 未命中分栏：清掉上一轮残留的分栏态，避免指针从分栏移出后仍走建栏分支
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

    // 拖到列表 / 引用 / callout 块正文右侧：变成它的子块
    // 文档内拖动时，落点落在被拖动范围内不算，否则「拖到自己身上」会莫名多一级缩进
    let nestCol: number | null = null;
    let quotePrefix: string | null = null;
    let listifyTargetLine: number | null = null;
    const overSelf = !cross && ds.ranges.some((r) => lineIndex >= r.start && lineIndex <= r.end);
    const target = overSelf ? null : this.ctx.detector.getBlockAtLine(editor, lineIndex);

    // 嵌套插入的一步缩进：设置里指定了步长就用设置值，否则固定 4 个字符
    const indentStep = this.ctx.settings.indentStep > 0 ? this.ctx.settings.indentStep : NEST_INDENT;
    // 被拖动块首行的文本左缘。嵌套门槛以它为基准（而非落点行文本左缘）：
    // 手柄位于文本左侧，从手柄垂直拖动时指针 x 恒小于「自身文本起点 + NEST_OFFSET」，
    // 因此上下移动途中不会被判成缩进 —— 保证块能稳定上下重排。
    let dragTextLeft: number | null = null;
    if (!cross) {
      const firstRange = [...ds.ranges].sort((a, b) => a.start - b.start)[0];
      const firstCoords = cm.coordsAtPos(doc.line(firstRange.start + 1).from);
      dragTextLeft = firstCoords ? firstCoords.left : null;
    }

    // 四向落区：以目标块可视盒为锚点划分落点，两种意图几何互斥、一眼可辨——
    //   左右外缘带 → 贴边分栏（竖线 + 目标块描边）；其余位置 → 移动（横向插入线）。
    // 两道闸门保证边界清晰（不再与「移动」混淆）：
    //   1) 纵向：指针须落在目标块垂直范围内 —— 块与块之间的空隙一律回退移动；
    //   2) 横向：指针须落在块盒左 / 右外缘带内（带以块盒为基准，与悬停高亮块一致）。
    // 目标为列表 / 引用 / callout 时，左侧带收缩到嵌套起点之前，避免与缩进嵌套争抢。
    if (target && !cross && this.canEdgeColumnSource(ds, target)) {
      const box = this.blockBox(cm, target);
      if (box && y >= box.top - 1 && y <= box.bottom + 1) {
        const width = Math.max(box.right - box.left, 1);
        const band = Math.max(EDGE_BAND_MIN, Math.min(EDGE_BAND, width * 0.22));
        // 嵌套目标（列表/引用/Callout/普通段落/标题）两侧热区都收窄，
        // 给「缩进为子块」让出正文区域
        const edgeBand = isNestTarget(target.type) ? Math.min(band, EDGE_BAND_NESTABLE) : band;
        const dl = x - box.left;
        const dr = box.right - x;
        const side: -1 | 1 | null =
          dl >= -2 && dl <= edgeBand && dl <= dr
            ? -1
            : dr >= -2 && dr <= edgeBand && dr < dl
              ? 1
              : null;
        if (side !== null) {
          ds.edgeSide = side;
          ds.edgeTargetStart = target.start;
          // 保留纵向插入点作为兜底：贴边合成失败（目标已变 / 结构异常）时不至于整块不动
          ds.targetLine = insertAt;
          ds.nestCol = null;
          ds.quotePrefix = null;
          ds.targetEditor = null;
          this.showEdgeLine(side, box, cm);
          return;
        }
      }
    }

    // 未命中贴边热区：清除上一轮可能残留的贴边态与视觉。
    // 否则指针先经过贴边热区、再移到普通落点时，松手会优先走贴边分栏分支（吞掉嵌套/移动）。
    if (ds.edgeSide !== null) {
      ds.edgeSide = null;
      ds.edgeTargetStart = null;
      if (this.edgeLineEl) this.edgeLineEl.setCssStyles({ display: 'none' });
      if (this.edgeBoxEl) this.edgeBoxEl.setCssStyles({ display: 'none' });
    }

    if (target && isNestTarget(target.type)) {
      const targetText = editor.getLine(target.start);
      // 嵌套门槛取「拖动块文本左缘」与「目标行文本左缘」的较大者 + NEST_OFFSET：
      // - 下限含目标左缘：指针移到目标正文右侧即可嵌套（缩进块拖到较浅目标也能命中，
      //   若只用拖动块左缘，门槛会被自身缩进推远，表现为「拖到正文右侧不嵌套」）；
      // - 下限含拖动块左缘：从手柄垂直拖动时指针恒在自身文本左缘之左，不会误判为嵌套。
      const targetLeft = cm.coordsAtPos(doc.line(target.start + 1).from)?.left ?? lineCoords.left;
      const nestGate = Math.max(dragTextLeft ?? targetLeft, targetLeft) + NEST_OFFSET;
      // 分栏外壳不作为嵌套目标：拖到外壳行会截断分栏结构
      if (!COL_SHELL_RE.test(targetText) && x > nestGate) {
        const marker = targetText.match(/^(\s*)([-*+]|\d+[.)])\s+/);
        if (marker) {
          // 列表项：缩进为子项
          nestCol = marker[1].length + indentStep;
          insertAt = target.end + 1;
        } else if (target.type === 'quote' || target.type === 'callout') {
          // 引用 / callout 嵌套：给被拖行统一补一层 `> ` 前缀（保留原缩进）
          const qm = targetText.match(/^(\s*)((?:>\s*)+)/);
          if (qm) {
            quotePrefix = qm[1] + qm[2];
            insertAt = target.end + 1;
          }
        } else {
          // 普通段落 / 标题：Markdown 无父子结构，落点触发「列表化目标」的嵌套
          nestCol = getIndent(targetText).length + indentStep;
          listifyTargetLine = target.start;
          insertAt = target.start + 1;
        }
      }
    }

    // 向左拖出：落点行的缩进更浅时，把被拖的列表项降级到该层级
    if (nestCol == null && !overSelf) {
      const first = [...ds.ranges].sort((a, b) => a.start - b.start)[0];
      const firstLine = ds.editor.getLine(first.start);
      if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(firstLine)) {
        const baseIndent = getIndent(firstLine).length;
        const refIndent = getIndent(editor.getLine(lineIndex)).length;
        if (refIndent < baseIndent) nestCol = refIndent;
      }
    }

    // 位置没变化（同级移动）时不给落点提示（仅文档内拖动）
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

    // 插入线宽度取编辑器「系统行宽」：以内容区（.cm-content，即 Obsidian 可读行宽
    // 约束后的文本列）为基准整列铺满，不再随目标行/当前块文本长短变化
    // （否则同一块内各行长短不一，落点指示忽长忽短）。
    // 挂到目标编辑器 .cm-editor，absolute 定位 + overflow:hidden 物理裁剪。
    const editorDom = cm.dom;
    const editorRect = editorDom.getBoundingClientRect();
    const contentRect = cm.contentDOM.getBoundingClientRect();
    const left = contentRect.left - editorRect.left;
    const width = Math.max(contentRect.width, 40);

    const yPos = insertAt > lineIndex ? lineCoords.bottom : lineCoords.top;
    if (this.indicatorEl) {
      if (this.indicatorEl.parentElement !== editorDom) editorDom.appendChild(this.indicatorEl);
      this.indicatorEl.setCssStyles({ position: 'absolute', display: 'block' });
      this.indicatorEl.style.top = yPos - editorRect.top + 'px';
      this.indicatorEl.style.left = left + 'px';
      this.indicatorEl.style.width = width + 'px';
    }
  }

  // 鼠标所在的 markdown 编辑器（任意分屏），不在任何编辑器内时返回 null
  private editorAtPoint(x: number, y: number): { editor: Editor; file: TFile | null } | null {
    const leaves = this.ctx.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      const view = leaf.view as MarkdownView | null;
      const editor = view?.editor;
      if (!editor) continue;
      const cm = getCM(editor);
      if (!cm) continue;
      const r = cm.dom.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return { editor, file: view?.file ?? null };
      }
    }
    return null;
  }

  // 拖到编辑区上 / 下边缘时持续滚动（悬停哪个编辑器就滚哪个）
  private updateAutoScroll(ds: DragState): void {
    if (!this.ctx.settings.dragAutoScroll) return;
    const scroller = getCM(ds.targetEditor ?? ds.editor)?.scrollDOM;
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
      const el = getCM(ds.targetEditor ?? ds.editor)?.scrollDOM;
      if (!el) return;
      const before = el.scrollTop;
      el.scrollTop = before + ds.edgeDir * 14;
      // 已经滚到顶 / 底，落点不会变
      if (el.scrollTop !== before) this.updateDropTarget(ds, ds.lastX, ds.lastY);
    }, 16);
  }

  private stopAutoScroll(ds?: DragState): void {
    const s = ds ?? this.state;
    if (!s) return;
    if (s.scrollTimer) {
      window.clearInterval(s.scrollTimer);
      s.scrollTimer = null;
    }
    s.edgeDir = 0;
  }

  private clearDropTarget(ds: DragState): void {
    if (this.indicatorEl) this.indicatorEl.setCssStyles({ display: 'none' });
    if (this.edgeLineEl) this.edgeLineEl.setCssStyles({ display: 'none' });
    if (this.edgeBoxEl) this.edgeBoxEl.setCssStyles({ display: 'none' });
    if (this.colSlotEl) this.colSlotEl.setCssStyles({ display: 'none' });
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
  private tryColumnDropTarget(
    ds: DragState,
    widget: ColumnsWidgetLike,
    x: number,
    y: number
  ): boolean {
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
  private showColumnSlot(hit: ColDropHit, widget: ColumnsWidgetLike): void {
    if (this.indicatorEl) this.indicatorEl.setCssStyles({ display: 'none' });
    const ds = this.state;
    if (!ds || !hit.box) return;
    // 竖线 / 描边挂在源编辑器 .cm-editor（同文档拖拽，坐标同源；overflow:hidden 会裁剪）
    const editorDom = getCM(ds.editor)?.dom;
    if (!editorDom) return;
    const editorRect = editorDom.getBoundingClientRect();
    const top = hit.box.top - editorRect.top;
    const height = `${Math.max(2, hit.box.bottom - hit.box.top)}px`;

    if (hit.kind === 'gap' && this.edgeLineEl) {
      if (this.edgeLineEl.parentElement !== editorDom) editorDom.appendChild(this.edgeLineEl);
      this.edgeLineEl.setCssStyles({ position: 'absolute', display: 'block' });
      this.edgeLineEl.style.left = `${hit.box.left - editorRect.left}px`;
      this.edgeLineEl.style.top = `${top}px`;
      this.edgeLineEl.style.height = height;
      if (this.edgeBoxEl) this.edgeBoxEl.setCssStyles({ display: 'none' });
    } else if (this.edgeBoxEl) {
      if (this.edgeBoxEl.parentElement !== editorDom) editorDom.appendChild(this.edgeBoxEl);
      this.edgeBoxEl.setCssStyles({ position: 'absolute', display: 'block' });
      this.edgeBoxEl.style.left = `${hit.box.left - editorRect.left}px`;
      this.edgeBoxEl.style.top = `${top}px`;
      this.edgeBoxEl.style.width = `${Math.max(hit.box.right - hit.box.left, 8)}px`;
      this.edgeBoxEl.style.height = height;
      if (this.edgeLineEl) this.edgeLineEl.setCssStyles({ display: 'none' });
    }

    // 插入位置竖条：before 画在参照栏左缘，after/gap 画在参照栏右缘
    if (this.colSlotEl) {
      const slotX = (hit.kind === 'before' ? hit.box.left : hit.box.right) - editorRect.left;
      if (this.colSlotEl.parentElement !== editorDom) editorDom.appendChild(this.colSlotEl);
      this.colSlotEl.setCssStyles({ position: 'absolute', display: 'block' });
      this.colSlotEl.style.left = `${slotX - 1}px`;
      this.colSlotEl.style.top = `${top}px`;
      this.colSlotEl.style.height = height;
    }
  }

  /** 贴边分栏目标判定：目标不能为空行、不能是分栏外壳，也不能在分栏内部（避免截断结构） */
  private isEdgeColumnTarget(editor: Editor, target: BlockRange): boolean {
    if (target.type === 'empty') return false;
    if (COL_SHELL_RE.test(editor.getLine(target.start))) return false;
    return !this.ctx.converter.insideColumns(editor, target);
  }

  /** 贴边分栏资格（目标 + 拖动源双向校验，任一不干净即回退普通移动）：
   *  拖动源不得是分栏外壳 / 位于分栏内部（否则会把整个分栏塞进新栏形成嵌套分栏），
   *  且不得与目标区间重叠（合成时按 min/max 取范围会吞掉中间内容）。 */
  private canEdgeColumnSource(ds: DragState, target: BlockRange): boolean {
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
  private blockBox(
    cm: CMView,
    block: BlockRange
  ): { top: number; bottom: number; left: number; right: number } | null {
    const doc = cm.state.doc;
    if (block.start < 0 || block.end >= doc.lines) return null;
    const topC = cm.coordsAtPos(doc.line(block.start + 1).from);
    const botC = cm.coordsAtPos(doc.line(block.end + 1).to);
    if (!topC || !botC) return null;
    // 钳制到编辑器内容区可视范围：块首行贴近顶部时 coordsAtPos 的 top
    // 可能小于内容区上缘，导致贴边分栏描边 / 竖线向上溢出覆盖标签页。
    const contentRect = cm.contentDOM.getBoundingClientRect();
    return {
      top: Math.max(topC.top, contentRect.top),
      bottom: Math.min(botC.bottom, contentRect.bottom),
      left: topC.left,
      right: contentRect.right,
    };
  }

  /** 绘制贴边分栏视觉：目标块整体描边 + 侧边竖线（side=-1 贴左，1 贴右） */
  private showEdgeLine(
    side: -1 | 1,
    box: { top: number; bottom: number; left: number; right: number },
    cm: CMView
  ): void {
    if (this.indicatorEl) this.indicatorEl.setCssStyles({ display: 'none' });
    // 挂到目标编辑器 .cm-editor，视口坐标转编辑器坐标，overflow:hidden 物理裁剪
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
      this.edgeLineEl.setCssStyles({ position: 'absolute', display: 'block' });
      this.edgeLineEl.style.left = x + 'px';
      this.edgeLineEl.style.top = top + 'px';
      this.edgeLineEl.style.height = h + 'px';
    }
    if (this.edgeBoxEl) {
      if (this.edgeBoxEl.parentElement !== editorDom) editorDom.appendChild(this.edgeBoxEl);
      this.edgeBoxEl.setCssStyles({ position: 'absolute', display: 'block' });
      this.edgeBoxEl.style.left = left + 'px';
      this.edgeBoxEl.style.top = top + 'px';
      this.edgeBoxEl.style.width = Math.max(right - left, 8) + 'px';
      this.edgeBoxEl.style.height = h + 'px';
    }
  }

  // 拖拽时跟随鼠标的浮动预览
  private createGhost(ds: DragState): HTMLElement {
    const editor = ds.editor;
    const lines: string[] = [];
    for (const r of [...ds.ranges].sort((a, b) => a.start - b.start)) {
      for (let i = r.start; i <= r.end; i++) lines.push(editor.getLine(i));
    }
    let text = lines.join('\n');
    if (text.length > 300) text = text.slice(0, 300) + ' …';

    const el = createEl('div');
    el.className = 'block-editor-drag-ghost';
    el.textContent = text;
    document.body.appendChild(el);
    return el;
  }

  private moveGhost(e: MouseEvent): void {
    const el = this.ghostEl;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = e.clientX + 14;
    let y = e.clientY + 14;
    if (x + w > window.innerWidth - 8) x = Math.max(8, e.clientX - w - 14);
    if (y + h > window.innerHeight - 8) y = Math.max(8, e.clientY - h - 14);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }

  private removeGhost(): void {
    this.ghostEl?.remove();
    this.ghostEl = null;
  }
}
