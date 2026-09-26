import { PluginSettingTab, Setting } from 'obsidian';
import type BlockEditorPlugin from './main';
import { recomputeColumnsEditors } from './columns-preview';

export interface BlockEditorSettings {
  /** 显示块手柄 */
  showHandle: boolean;
  /** 手柄跟随光标所在块 */
  handleFollowsCursor: boolean;
  /** 启用 / 斜杠命令 */
  slashCommands: boolean;
  /** 拖拽到编辑区边缘自动滚动 */
  dragAutoScroll: boolean;
  /** 缩进步长（空格数），0 表示自动检测全文最小缩进 */
  indentStep: number;
  /** 实验：实时预览中由插件自渲染分栏（默认关闭；关闭时显示原生嵌套 callout） */
  livePreviewWidget: boolean;
}

// 除新增项外，默认值等于重构前的内置行为
export const DEFAULT_SETTINGS: BlockEditorSettings = {
  showHandle: true,
  handleFollowsCursor: true,
  slashCommands: true,
  dragAutoScroll: true,
  indentStep: 0,
  livePreviewWidget: false,
};

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
  }
}
