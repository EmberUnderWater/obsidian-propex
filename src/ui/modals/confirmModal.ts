import { Modal, type App } from "obsidian";

export class ConfirmModal extends Modal {
	private readonly clickHandlers: Array<{ element: HTMLButtonElement; handler: (event: MouseEvent) => void }> = [];

	constructor(
		app: App,
		private readonly titleText: string,
		private readonly message: string,
		private readonly confirmLabel: string,
		private readonly cancelLabel: string,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.titleText);
		this.contentEl.empty();
		this.contentEl.createEl("p", { text: this.message });

		const actions = this.contentEl.createDiv({ cls: "modal-button-container" });

		const cancel = actions.createEl("button", { text: this.cancelLabel });
		const cancelHandler = () => this.close();
		cancel.addEventListener("click", cancelHandler);
		this.clickHandlers.push({ element: cancel, handler: cancelHandler });

		const confirm = actions.createEl("button", { text: this.confirmLabel, cls: "mod-warning" });
		const confirmHandler = () => {
			this.close();
			this.onConfirm();
		};
		confirm.addEventListener("click", confirmHandler);
		this.clickHandlers.push({ element: confirm, handler: confirmHandler });
	}

	onClose(): void {
		for (const { element, handler } of this.clickHandlers) {
			element.removeEventListener("click", handler);
		}
		this.clickHandlers.length = 0;
		this.contentEl.empty();
	}
}
