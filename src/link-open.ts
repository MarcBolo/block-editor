import type { App, PaneType } from 'obsidian';
import type { LinkOpenMode } from './settings';

/** openLinkText 的宽松签名（避免额外导入 OpenViewState 等类型） */
type OpenLinkText = (
  linktext: string,
  sourcePath: string,
  newLeaf?: PaneType | boolean,
  openViewState?: unknown
) => Promise<void>;

let original: OpenLinkText | null = null;
let targetProto: Record<string, unknown> | null = null;

/** 安装链接打开桥接；重复调用幂等（已安装时直接返回） */
export function installLinkOpenBridge(app: App, getMode: () => LinkOpenMode): void {
  if (original) return;
  const proto = Object.getPrototypeOf(app.workspace) as Record<string, unknown> | null;
  if (!proto) return;
  const fn = proto.openLinkText as OpenLinkText | undefined;
  if (typeof fn !== 'function') return;

  const patched = function (
    this: unknown,
    linktext: string,
    sourcePath: string,
    newLeaf?: PaneType | boolean,
    openViewState?: unknown
  ): Promise<void> {
    const mode = getMode();
    // 仅在「调用方未指定打开位置」时套用设置：
    // Ctrl/Cmd+点击（Obsidian 传 'tab'）、Ctrl/Cmd+Alt+点击（传 'split'）、
    // 其它插件传入的显式值都原样放行，修饰键行为天然保留。
    const unspecified = newLeaf == null || newLeaf === false;
    const internal = !/^(?:https?|mailto|tel):/i.test(linktext);
    const next = unspecified && internal && mode !== 'current' ? (mode as PaneType) : newLeaf;
    return fn.call(this, linktext, sourcePath, next, openViewState);
  };

  proto.openLinkText = patched;
  original = fn;
  targetProto = proto;
}

/** 卸载并还原原始方法（插件卸载时调用） */
export function uninstallLinkOpenBridge(): void {
  if (targetProto && original) targetProto.openLinkText = original;
  original = null;
  targetProto = null;
}
