import { PluginSettingTab, Setting } from 'obsidian';
import type BlockEditorPlugin from './main';
import { recomputeColumnsEditors } from './columns-preview';
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
}

// 除新增项外，默认值等于重构前的内置行为
export const DEFAULT_SETTINGS: BlockEditorSettings = {
  showHandle: true,
  handleFollowsCursor: true,
  blockHoverHighlight: true,
  blockHoverHighlightColor: '',
  blockHoverHighlightOpacity: 0.55,
  slashCommands: true,
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

export class BlockEditorSettingTab extends PluginSettingTab {
  constructor(private plugin: BlockEditorPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Block Editor 设置' });

    new Setting(containerEl)
      .setName('显示块手柄')
      .setDesc('在编辑器左侧显示 Notion 风格的块手柄')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showHandle).onChange(async (value) => {
          this.plugin.settings.showHandle = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('手柄跟随光标')
      .setDesc('光标移动后手柄自动跟到当前块；关闭后仅在鼠标悬停时显示')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.handleFollowsCursor).onChange(async (value) => {
          this.plugin.settings.handleFollowsCursor = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('块悬停高亮')
      .setDesc('鼠标悬停在块上时，给手柄对应的块加一层浅色高亮背景')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.blockHoverHighlight).onChange(async (value) => {
          this.plugin.settings.blockHoverHighlight = value;
          // 关闭后立即抹掉当前已显示的高亮（否则要等鼠标移动才消失）
          this.plugin.handle.renderHighlight();
          await this.plugin.saveSettings();
        })
      );

    // 高亮颜色：跟随主题开关 + 自定义颜色选择器（跟随主题时禁用选择器）
    // 注：当前 Obsidian 版本 Setting 无 addColor，故手动挂一个原生 <input type="color">
    let colorInput: HTMLInputElement | undefined;
    const colorSetting = new Setting(containerEl)
      .setName('高亮颜色')
      .setDesc('自定义悬停高亮的背景色；开启「跟随主题」则使用当前 Obsidian 主题的悬停色')
      .addToggle((t) => {
        t
          .setTooltip('跟随主题颜色')
          .setValue(this.plugin.settings.blockHoverHighlightColor === '')
          .onChange(async (value) => {
            if (value) {
              this.plugin.settings.blockHoverHighlightColor = '';
            } else if (colorInput) {
              // 关闭「跟随主题」时，以颜色选择器当前值作为自定义色
              this.plugin.settings.blockHoverHighlightColor = colorInput.value;
            }
            if (colorInput) colorInput.disabled = value;
            applyHoverHighlightCssVars(this.plugin.settings);
            this.plugin.handle.renderHighlight();
            await this.plugin.saveSettings();
          });
      });

    // 手动添加原生颜色选择器到控制区
    colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = this.plugin.settings.blockHoverHighlightColor || '#808080';
    colorInput.disabled = this.plugin.settings.blockHoverHighlightColor === '';
    colorInput.style.marginLeft = '8px';
    colorInput.addEventListener('change', async () => {
      this.plugin.settings.blockHoverHighlightColor = colorInput!.value;
      applyHoverHighlightCssVars(this.plugin.settings);
      this.plugin.handle.renderHighlight();
      await this.plugin.saveSettings();
    });
    colorSetting.controlEl.appendChild(colorInput);

    // 高亮透明度：0~1，步长 0.05
    new Setting(containerEl)
      .setName('高亮透明度')
      .setDesc('悬停高亮背景的透明度，0 为完全透明，1 为完全不透明')
      .addSlider((s) =>
        s
          .setLimits(0, 1, 0.05)
          .setValue(this.plugin.settings.blockHoverHighlightOpacity)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.blockHoverHighlightOpacity = value;
            applyHoverHighlightCssVars(this.plugin.settings);
            this.plugin.handle.renderHighlight();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('实验：实时预览自渲染分栏')
      .setDesc('开启后实时预览中分栏区域由插件自渲染（双击进入编辑）；关闭时显示原生嵌套 callout。更改后立即生效')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.livePreviewWidget).onChange(async (value) => {
          this.plugin.settings.livePreviewWidget = value;
          document.body.classList.toggle('be-columns-live-on', value);
          await this.plugin.saveSettings();
          recomputeColumnsEditors(this.plugin.app);
        })
      );

    new Setting(containerEl)
      .setName('启用斜杠命令')
      .setDesc('在正文中输入 / 快速把当前块转换为其他类型')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.slashCommands).onChange(async (value) => {
          this.plugin.settings.slashCommands = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('拖拽自动滚动')
      .setDesc('拖动块到编辑区上下边缘时自动滚动')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.dragAutoScroll).onChange(async (value) => {
          this.plugin.settings.dragAutoScroll = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('缩进步长')
      .setDesc('块缩进 / 减少缩进时的空格数，0 表示自动检测全文最小缩进')
      .addSlider((s) =>
        s
          .setLimits(0, 8, 1)
          .setValue(this.plugin.settings.indentStep)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.indentStep = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('点击链接时的打开位置')
      .setDesc('点击内部链接 [[...]] 时在哪里打开；Ctrl/Cmd+点击等修饰键行为不受影响')
      .addDropdown((d) =>
        d
          .addOption('current', '当前标签页')
          .addOption('tab', '新标签页')
          .addOption('split', '分屏（右侧）')
          .addOption('window', '新窗口（弹出）')
          .setValue(this.plugin.settings.linkOpenMode)
          .onChange(async (value) => {
            this.plugin.settings.linkOpenMode = value as LinkOpenMode;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl('h3', { text: '分栏' });

    new Setting(containerEl)
      .setName('默认栏间距')
      .setDesc('分栏外壳未写 gap= 参数时的栏间距（px），实时预览与阅读模式生效')
      .addSlider((s) =>
        s
          .setLimits(0, 48, 1)
          .setValue(this.plugin.settings.columnsGap)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.columnsGap = value;
            applyColumnsCssVars(this.plugin.settings);
            await this.plugin.saveSettings();
            recomputeColumnsEditors(this.plugin.app);
          })
      );

    new Setting(containerEl)
      .setName('默认圆角')
      .setDesc('分栏外壳未写 radius= 参数时的栏圆角（px）')
      .addSlider((s) =>
        s
          .setLimits(0, 24, 1)
          .setValue(this.plugin.settings.columnsRadius)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.columnsRadius = value;
            applyColumnsCssVars(this.plugin.settings);
            await this.plugin.saveSettings();
            recomputeColumnsEditors(this.plugin.app);
          })
      );

    new Setting(containerEl)
      .setName('默认垂直对齐')
      .setDesc('分栏外壳未写 valign= 参数时的栏垂直对齐方式')
      .addDropdown((d) =>
        d
          .addOption('stretch', '拉伸（等高）')
          .addOption('top', '顶部对齐')
          .addOption('center', '居中对齐')
          .addOption('bottom', '底部对齐')
          .setValue(this.plugin.settings.columnsValign)
          .onChange(async (value) => {
            this.plugin.settings.columnsValign = value as BlockEditorSettings['columnsValign'];
            applyColumnsCssVars(this.plugin.settings);
            await this.plugin.saveSettings();
            recomputeColumnsEditors(this.plugin.app);
          })
      );

    new Setting(containerEl)
      .setName('默认边框')
      .setDesc('分栏外壳未写 border 参数时是否显示栏边框')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.columnsBorder).onChange(async (value) => {
          this.plugin.settings.columnsBorder = value;
          applyColumnsCssVars(this.plugin.settings);
          await this.plugin.saveSettings();
          recomputeColumnsEditors(this.plugin.app);
        })
      );

    containerEl.createEl('h3', { text: '手柄与拖拽' });

    new Setting(containerEl)
      .setName('手柄尺寸')
      .setDesc('编辑器左侧块手柄的大小（px）')
      .addSlider((s) =>
        s
          .setLimits(12, 32, 1)
          .setValue(this.plugin.settings.handleSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.handleSize = value;
            applyColumnsCssVars(this.plugin.settings);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('拖拽阈值')
      .setDesc('按住块手柄拖动的判定位移（px），小于该位移视为点击弹出块菜单')
      .addSlider((s) =>
        s
          .setLimits(0, 16, 1)
          .setValue(this.plugin.settings.dragThreshold)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.dragThreshold = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
