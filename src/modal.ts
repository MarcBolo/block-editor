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
