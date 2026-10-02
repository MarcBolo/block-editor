import { Modal } from 'obsidian';
import type { App } from 'obsidian';

/** 破坏性操作的通用确认框 */
export class ConfirmModal extends Modal {
  constructor(
    app: App,
    title: string,
    private message: string,
    private confirmText: string,
    private onConfirm: () => void
  ) {
    super(app);
    this.titleEl.setText(title);
  }

  onOpen(): void {
    this.contentEl.createEl('p', { text: this.message });
    const row = this.contentEl.createDiv('modal-button-container');
    const cancel = row.createEl('button', { text: '取消' });
    cancel.addEventListener('click', () => this.close());
    const ok = row.createEl('button', { text: this.confirmText, cls: 'mod-warning' });
    ok.addEventListener('click', () => {
      this.close();
      this.onConfirm();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** 收款码等图片的放大预览：把 Data URI 铺满弹窗，便于手机扫码。Esc / 点击遮罩关闭。 */
export class ImagePreviewModal extends Modal {
  constructor(
    app: App,
    private src: string,
    private label: string
  ) {
    super(app);
    this.modalEl.addClass('be-image-preview-modal');
    this.titleEl.setText(label);
  }

  onOpen(): void {
    const box = this.contentEl.createDiv({ cls: 'be-image-preview-box' });
    box.createEl('img', { cls: 'be-image-preview', attr: { src: this.src, alt: this.label } });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
