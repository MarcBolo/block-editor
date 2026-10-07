/**
 * 手柄水平定位：避开 Obsidian 在实时预览里给列表 / 标题渲染的折叠图标
 * （`.list-collapse-indicator` / `.collapse-indicator`）。
 *
 * 背景（真实 bug）：折叠图标画在行首**左侧的留白里**，而手柄旧逻辑固定画在
 * 「行首左侧 size + 6px」处 —— 两者落在同一块留白上，视觉重叠成一个糊团，
 * 且手柄遮住图标后折叠点不到。
 *
 * 修法：手柄右缘改为贴「折叠图标左缘 - gap」，把图标整块让出来；
 * 左侧留白不够时按比例压缩手柄（而不是让它压回图标上），实在放不下才标记
 * squeezed 交给调用方降级。
 *
 * 本模块**纯几何、不碰 DOM**，可在 Node 里离线断言（scripts/handle-layout-spec.mjs）。
 */

/** 手柄与行首 / 折叠图标之间的间隙 */
export const HANDLE_GAP = 6;
/** 手柄距编辑器左右缘的最小留白（防止被 overflow:hidden 裁掉） */
export const HANDLE_INSET = 2;
/** 空间不足时允许压缩到的最小边长 */
export const HANDLE_MIN_SIZE = 14;

export interface HandleLeftInput {
  /** 行首（coordsAtPos(line.from).left）的视口 x */
  lineLeft: number;
  /** 折叠图标左缘的视口 x；null 表示该行没有可见的折叠图标 */
  foldLeft: number | null;
  /** .cm-editor 左缘的视口 x */
  editorLeft: number;
  /** .cm-editor 宽度 */
  editorWidth: number;
  /** 手柄边长（设置项 handleSize，缺省回退 20） */
  handleSize: number;
  /** 覆盖默认间隙 */
  gap?: number;
  /** 覆盖默认最小留白 */
  inset?: number;
  /** 覆盖默认最小边长 */
  minHandleSize?: number;
}

export interface HandleLeftResult {
  /** 相对 .cm-editor 左缘的 x（已钳制在编辑器内） */
  left: number;
  /** 实际使用的边长（空间不足时被压缩） */
  size: number;
  /** true = 压缩过、或压缩后仍与折叠图标有重叠（调用方可据此降级） */
  squeezed: boolean;
}

/** 折叠图标是否值得避让：必须在编辑器内、且在行首左侧，否则视为无效量测 */
export function isDodgeableFold(foldLeft: number | null, lineLeft: number, editorLeft: number): boolean {
  if (foldLeft == null || !Number.isFinite(foldLeft) || !Number.isFinite(lineLeft)) return false;
  // 隐藏元素（display:none）的 rect 全 0，会被这条挡掉
  if (foldLeft <= editorLeft) return false;
  // 图标在行首右侧（异常主题 / 量测到了别的元素）：不避让，否则手柄会飞到行中间
  return foldLeft < lineLeft - 1;
}

export function computeHandleLeft(input: HandleLeftInput): HandleLeftResult {
  const handleSize = Math.max(1, input.handleSize);
  const gap = Math.max(0, input.gap ?? HANDLE_GAP);
  const inset = Math.max(0, input.inset ?? HANDLE_INSET);
  const minSize = Math.min(handleSize, Math.max(6, input.minHandleSize ?? HANDLE_MIN_SIZE));

  const hasFold = isDodgeableFold(input.foldLeft, input.lineLeft, input.editorLeft);
  // 让位基准：有图标贴图标左边，没图标贴行首左边
  const anchor = hasFold ? (input.foldLeft as number) : input.lineLeft;

  // 基准左侧到编辑器左缘的可用宽度（还要扣掉间隙与留白）
  const room = anchor - gap - inset - input.editorLeft;
  const size = room >= handleSize ? handleSize : Math.max(minSize, Math.floor(room));

  const rightLimit = Math.max(inset, input.editorWidth - size - inset);
  const rawLeft = anchor - gap - size - input.editorLeft;
  const left = Math.min(Math.max(rawLeft, inset), rightLimit);

  // 压缩或钳制后，手柄右缘若仍越过图标左缘 = 还是有重叠
  const overlapped = hasFold && left + size > (input.foldLeft as number) - input.editorLeft + 0.5;
  return { left, size, squeezed: size < handleSize || overlapped };
}
