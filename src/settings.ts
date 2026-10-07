import { PluginSettingTab, setIcon } from 'obsidian';
import type {
  SettingDefinition,
  SettingDefinitionItem,
  SettingDefinitionRender,
  SliderComponent,
} from 'obsidian';
import type BlockEditorPlugin from './main';
import { DEFAULT_DATE_FORMAT, DEFAULT_TIME_FORMAT } from './constants';
import { recomputeColumnsEditors } from './columns-preview';
import { DONATE_CODES, type DonateCode } from './donate';
import { ImagePreviewModal } from './modal';
import { colValignToCss } from './util';

/** 点击内部链接时的打开位置；'current' 表示沿用 Obsidian 原生行为 */
export type LinkOpenMode = 'current' | 'tab' | 'split' | 'window';

export interface BlockEditorSettings {
  /** 显示块手柄 */
  showHandle: boolean;
  /** 手柄跟随光标所在块 */
  handleFollowsCursor: boolean;
  /** 悬停时高亮手柄对应的块 */
  blockHoverHighlight: boolean;
  /** 悬停高亮颜色（空串表示跟随主题 --background-modifier-hover） */
  blockHoverHighlightColor: string;
  /** 悬停高亮透明度（0~1） */
  blockHoverHighlightOpacity: number;
  /** 启用 / 斜杠命令 */
  slashCommands: boolean;
  /** 行内斜杠命令：非行首输入 / 触发（只给附件插入类） */
  slashInlineCommands: boolean;
  /** 拖拽到编辑区边缘自动滚动 */
  dragAutoScroll: boolean;
  /** 缩进步长（空格数），0 表示自动检测全文最小缩进 */
  indentStep: number;
  /** 实验：实时预览中由插件自渲染分栏（默认关闭；关闭时显示原生嵌套 callout） */
  livePreviewWidget: boolean;
  // M4：分栏默认外观（未在分栏外壳写 gap/valign/radius/border 参数时生效）
  /** 分栏默认栏间距（px） */
  columnsGap: number;
  /** 分栏默认圆角（px） */
  columnsRadius: number;
  /** 分栏默认垂直对齐 */
  columnsValign: 'top' | 'center' | 'bottom' | 'stretch';
  /** 分栏默认边框 */
  columnsBorder: boolean;
  // M4：手柄 / 拖拽阈值可调
  /** 块手柄尺寸（px） */
  handleSize: number;
  /** 拖拽判定阈值（px），小于该位移视为点击 */
  dragThreshold: number;
  /** 点击内部链接时的打开位置 */
  linkOpenMode: LinkOpenMode;
  // 斜杠「插入类」命令
  /** 日期格式（token：YYYY / MM / DD / ddd / dddd） */
  dateFormat: string;
  /** 时间格式（token：HH / mm / ss） */
  timeFormat: string;
  /** 命令开关：日期 */
  insDate: boolean;
  /** 命令开关：时间 */
  insTime: boolean;
  /** 命令开关：日期时间 */
  insDateTime: boolean;
  /** 命令开关：行内公式 */
  insMath: boolean;
  /** 命令开关：行内代码 */
  insInlineCode: boolean;
  /** 命令开关：高亮 */
  insHighlight: boolean;
  /** 命令开关：笔记链接 */
  insNote: boolean;
  /** 命令开关：嵌入笔记 */
  insEmbedNote: boolean;
  /** 命令开关：块引用 */
  insBlockRef: boolean;
  /** 命令开关：嵌入块 */
  insBlockEmbed: boolean;
}

// 除新增项外，默认值等于重构前的内置行为
export const DEFAULT_SETTINGS: BlockEditorSettings = {
  showHandle: true,
  handleFollowsCursor: true,
  blockHoverHighlight: true,
  blockHoverHighlightColor: '',
  blockHoverHighlightOpacity: 0.55,
  slashCommands: true,
  slashInlineCommands: true,
  dragAutoScroll: true,
  indentStep: 0,
  livePreviewWidget: true,
  columnsGap: 10,
  columnsRadius: 8,
  columnsValign: 'stretch',
  columnsBorder: false,
  handleSize: 20,
  dragThreshold: 4,
  linkOpenMode: 'current',
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
  insBlockEmbed: true,
};

/** M4：把分栏默认外观 / 手柄尺寸写到 body CSS 变量，styles.css 以 var() 消费。
 *  设置变更时调用；未开启实时预览的阅读模式同样吃到该变量。 */
export function applyColumnsCssVars(settings: BlockEditorSettings): void {
  const body = document.body;
  body.style.setProperty('--be-col-gap', settings.columnsGap + 'px');
  body.style.setProperty('--be-col-radius', settings.columnsRadius + 'px');
  body.style.setProperty('--be-col-valign', colValignToCss(settings.columnsValign));
  body.style.setProperty('--be-col-border', settings.columnsBorder ? '1px' : '0px');
  body.style.setProperty('--be-handle-size', settings.handleSize + 'px');
}

/** 块悬停高亮的颜色 / 透明度写到 body CSS 变量，styles.css 以 var() 消费。
 *  颜色为空串时回退到 Obsidian 主题的 --background-modifier-hover，深浅主题自动跟随。 */
export function applyHoverHighlightCssVars(settings: BlockEditorSettings): void {
  const body = document.body;
  const color = settings.blockHoverHighlightColor.trim();
  body.style.setProperty(
    '--be-hover-color',
    color || 'var(--background-modifier-hover)'
  );
  body.style.setProperty('--be-hover-opacity', String(settings.blockHoverHighlightOpacity));
}

/** 以数值（滑块）呈现、带「恢复默认值」入口的设置项 key */
type NumericSettingKey =
  | 'blockHoverHighlightOpacity'
  | 'indentStep'
  | 'columnsGap'
  | 'columnsRadius'
  | 'handleSize'
  | 'dragThreshold';

export class BlockEditorSettingTab extends PluginSettingTab {
  constructor(private plugin: BlockEditorPlugin) {
    super(plugin.app, plugin);
  }

  /**
   * 数值（滑块）设置项：声明式 control 不提供「恢复默认」入口，故用 render 自定义
   * ——滑块 + 恢复默认按钮（rotate-ccw）。滑块改动与恢复默认都经 setControlValue
   * 持久化并触发副作用，行为与声明式 control 一致。
   */
  private numericSetting(opts: {
    name: string;
    desc: string;
    key: NumericSettingKey;
    min: number;
    max: number;
    step: number;
  }): SettingDefinition {
    const def = DEFAULT_SETTINGS[opts.key];
    const item: SettingDefinitionRender = {
      name: opts.name,
      desc: opts.desc,
      render: (setting) => {
        setting.setName(opts.name).setDesc(opts.desc);
        let slider: SliderComponent | null = null;
        setting.addSlider((s) => {
          slider = s;
          s.setLimits(opts.min, opts.max, opts.step)
            .setValue(this.getControlValue(opts.key) as number)
            .onChange((v) => void this.setControlValue(opts.key, v));
        });
        setting.addExtraButton((b) =>
          b
            .setIcon('rotate-ccw')
            .setTooltip(`恢复默认值（${def}）`)
            .onClick(() => {
              // 先刷新滑块外观，再持久化并触发副作用
              slider?.setValue(def);
              void this.setControlValue(opts.key, def);
            })
        );
      },
    };
    return item;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: 'group',
        heading: 'Block Editor 设置',
        items: [
          {
            name: '显示块手柄',
            desc: '在编辑器左侧显示 Notion 风格的块手柄',
            control: { type: 'toggle', key: 'showHandle' },
          },
          {
            name: '手柄跟随光标',
            desc: '光标移动后手柄自动跟到当前块；关闭后仅在鼠标悬停时显示',
            control: { type: 'toggle', key: 'handleFollowsCursor' },
          },
          {
            name: '块悬停高亮',
            desc: '鼠标悬停在块上时，给手柄对应的块加一层浅色高亮背景',
            control: { type: 'toggle', key: 'blockHoverHighlight' },
          },
          {
            name: '高亮颜色',
            desc: '自定义悬停高亮的背景色；空值表示跟随当前 Obsidian 主题的悬停色',
            control: { type: 'color', key: 'blockHoverHighlightColor' },
          },
          this.numericSetting({
            name: '高亮透明度',
            desc: '悬停高亮背景的透明度，0 为完全透明，1 为完全不透明',
            key: 'blockHoverHighlightOpacity',
            min: 0,
            max: 1,
            step: 0.05,
          }),
          {
            name: '实验：实时预览自渲染分栏',
            desc: '开启后实时预览中分栏区域由插件自渲染（双击进入编辑）；关闭时显示原生嵌套 callout',
            control: { type: 'toggle', key: 'livePreviewWidget' },
          },
          {
            name: '启用斜杠命令',
            desc: '在正文中输入 / 快速把当前块转换为其他类型',
            control: { type: 'toggle', key: 'slashCommands' },
          },
          {
            name: '行内斜杠命令（插入附件）',
            desc: '非行首输入 /（如「文字/图」「sdfs /」）只提供图片 / 音频 / 视频 / PDF 插入；行首 / 仍是完整菜单。C:/、https:// 等路径形态不会触发',
            control: { type: 'toggle', key: 'slashInlineCommands' },
          },
          {
            name: '拖拽自动滚动',
            desc: '拖动块到编辑区上下边缘时自动滚动',
            control: { type: 'toggle', key: 'dragAutoScroll' },
          },
          this.numericSetting({
            name: '缩进步长',
            desc: '块缩进 / 减少缩进时的空格数，0 表示自动检测全文最小缩进',
            key: 'indentStep',
            min: 0,
            max: 8,
            step: 1,
          }),
          {
            name: '点击链接时的打开位置',
            desc: '点击内部链接 [[...]] 时在哪里打开；Ctrl/Cmd+点击等修饰键行为不受影响',
            control: {
              type: 'dropdown',
              key: 'linkOpenMode',
              options: { current: '当前标签页', tab: '新标签页', split: '分屏（右侧）', window: '新窗口（弹出）' },
            },
          },
          this.numericSetting({
            name: '默认栏间距',
            desc: '分栏外壳未写 gap= 参数时的栏间距（px），实时预览与阅读模式生效',
            key: 'columnsGap',
            min: 0,
            max: 48,
            step: 1,
          }),
          this.numericSetting({
            name: '默认圆角',
            desc: '分栏外壳未写 radius= 参数时的栏圆角（px）',
            key: 'columnsRadius',
            min: 0,
            max: 24,
            step: 1,
          }),
          {
            name: '默认垂直对齐',
            desc: '分栏外壳未写 valign= 参数时的栏垂直对齐方式',
            control: {
              type: 'dropdown',
              key: 'columnsValign',
              options: { stretch: '拉伸（等高）', top: '顶部对齐', center: '居中对齐', bottom: '底部对齐' },
            },
          },
          {
            name: '默认边框',
            desc: '分栏外壳未写 border 参数时是否显示栏边框',
            control: { type: 'toggle', key: 'columnsBorder' },
          },
          this.numericSetting({
            name: '手柄尺寸',
            desc: '编辑器左侧块手柄的大小（px）',
            key: 'handleSize',
            min: 12,
            max: 32,
            step: 1,
          }),
          this.numericSetting({
            name: '拖拽阈值',
            desc: '按住块手柄拖动的判定位移（px），小于该位移视为点击弹出块菜单',
            key: 'dragThreshold',
            min: 0,
            max: 16,
            step: 1,
          }),
        ],
      },
      {
        type: 'group',
        heading: '斜杠命令 · 插入类',
        items: [
          {
            name: '日期格式',
            desc: '可用 token：YYYY 年、MM 月、DD 日、ddd 周三、dddd 星期三；其余字符原样保留',
            control: { type: 'text', key: 'dateFormat' },
          },
          {
            name: '时间格式',
            desc: '可用 token：HH 时、mm 分、ss 秒；其余字符原样保留',
            control: { type: 'text', key: 'timeFormat' },
          },
          {
            name: '日期',
            desc: '插入今天的日期（按上面的日期格式）',
            control: { type: 'toggle', key: 'insDate' },
          },
          {
            name: '时间',
            desc: '插入当前时间',
            control: { type: 'toggle', key: 'insTime' },
          },
          {
            name: '日期时间',
            desc: '插入「日期 + 空格 + 时间」',
            control: { type: 'toggle', key: 'insDateTime' },
          },
          {
            name: '行内公式',
            desc: '插入 $ $，光标停在两个 $ 中间',
            control: { type: 'toggle', key: 'insMath' },
          },
          {
            name: '行内代码',
            desc: '插入一对反引号，光标停在其中',
            control: { type: 'toggle', key: 'insInlineCode' },
          },
          {
            name: '高亮',
            desc: '插入 == ==，光标停在中间',
            control: { type: 'toggle', key: 'insHighlight' },
          },
          {
            name: '笔记链接',
            desc: '选一篇笔记，插入指向它的链接',
            control: { type: 'toggle', key: 'insNote' },
          },
          {
            name: '嵌入笔记',
            desc: '选一篇笔记，把它的内容嵌入当前位置',
            control: { type: 'toggle', key: 'insEmbedNote' },
          },
          {
            name: '块引用',
            desc: '先选笔记再选块，插入指向该块的链接',
            control: { type: 'toggle', key: 'insBlockRef' },
          },
          {
            name: '嵌入块',
            desc: '先选笔记再选块，把该块内容嵌入当前位置',
            control: { type: 'toggle', key: 'insBlockEmbed' },
          },
        ],
      },
      ...this.donateGroups(),
    ];
  }

  /**
   * 「支持作者」分组：把打赏收款码渲染成可折叠区块（默认收起，点击展开）。
   * 收款码以 Base64 Data URI 内联在 src/donate.ts，构建时打包进 main.js；
   * 未配置任何图片时不生成该分组。
   */
  private donateGroups(): SettingDefinitionItem[] {
    const codes: DonateCode[] = DONATE_CODES.filter((c) => c.src.trim().length > 0);
    if (codes.length === 0) return [];
    return [
      {
        type: 'group',
        cls: 'be-donate-group',
        items: [
          {
            name: '打赏支持',
            aliases: ['打赏', '赞赏', '捐赠', '收款码', 'donate', 'sponsor'],
            render: (setting) => {
              setting.settingEl.addClass('be-donate-row');
              const details = setting.settingEl.createEl('details', { cls: 'be-donate' });
              const summary = details.createEl('summary', { cls: 'be-donate-summary' });
              const chevron = summary.createSpan({ cls: 'be-donate-chevron' });
              setIcon(chevron, 'chevron-right');
              summary.createSpan({ cls: 'be-donate-label', text: '打赏支持' });
              summary.createSpan({
                cls: 'be-donate-hint',
                text: '如果这个插件对你有帮助，欢迎请作者喝杯咖啡',
              });
              const body = details.createDiv({ cls: 'be-donate-body' });
              const list = body.createDiv({ cls: 'be-donate-codes' });
              for (const code of codes) {
                const fig = list.createEl('figure', { cls: 'be-donate-code' });
                const img = fig.createEl('img', {
                  attr: {
                    src: code.src,
                    alt: code.alt,
                    role: 'button',
                    tabindex: '0',
                    title: '点击放大',
                    'aria-label': `${code.alt}，点击放大`,
                  },
                });
                const openPreview = () =>
                  new ImagePreviewModal(this.app, code.src, code.label).open();
                img.addEventListener('click', openPreview);
                img.addEventListener('keydown', (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openPreview();
                  }
                });
                fig.createEl('figcaption', { text: `${code.label} · 点击放大` });
              }
            },
          },
        ],
      },
    ];
  }

  /**
   * 声明式设置（getSettingDefinitions）由框架直接持久化到 plugin.settings —— 框架
   * 不执行插件的「一次性副作用」（写 body CSS 变量、切 body class、重建 CM6 widget、
   * 刷新悬停高亮）。而声明式控件的变更都会经过 setControlValue（官方类型
   * SettingControlBase.key 即传入本方法），故在此统一收口分发，避免逐项遗漏。
   */
  async setControlValue(key: string, value: unknown): Promise<void> {
    await super.setControlValue(key, value);
    SETTING_SIDE_EFFECTS[key]?.(this.plugin, value);
  }
}

/** 需要「一次性副作用」的设置项：声明式设置在框架持久化后由此分发应用。
 *  惰性读取型设置（linkOpenMode / slashCommands / showHandle / indentStep /
 *  dragThreshold / handleFollowsCursor 等）无需登记，消费方按需读 plugin.settings。 */
const SETTING_SIDE_EFFECTS: Record<
  string,
  (plugin: BlockEditorPlugin, value: unknown) => void
> = {
  // 分栏实时预览总开关：切 body class 并立即重建分栏装饰
  livePreviewWidget: (plugin, value) => {
    document.body.classList.toggle('be-columns-live-on', Boolean(value));
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
  blockHoverHighlight: (plugin) => plugin.handle.renderHighlight(),
};

/** 分栏外观类设置的副作用：body CSS 变量 + 强制重建编辑器内的分栏 widget */
function applyColumnsSideEffects(plugin: BlockEditorPlugin): void {
  applyColumnsCssVars(plugin.settings);
  recomputeColumnsEditors(plugin.app);
}

/** 悬停高亮类设置的副作用：body CSS 变量 + 立即重绘当前高亮 */
function applyHoverSideEffects(plugin: BlockEditorPlugin): void {
  applyHoverHighlightCssVars(plugin.settings);
  plugin.handle.renderHighlight();
}
