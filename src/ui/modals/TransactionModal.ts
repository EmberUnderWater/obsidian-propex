import { Modal, type App } from "obsidian";
import { t } from "../../locales";
import type PropexPlugin from "../../main";
import type { Transaction } from "../../types";
import TransactionForm from "../components/TransactionForm.svelte";

export interface TransactionModalOptions {
	transaction?: Transaction;
}

export class TransactionModal extends Modal {
	private form?: TransactionForm;

	constructor(
		app: App,
		private readonly plugin: PropexPlugin,
		private readonly options: TransactionModalOptions = {},
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.options.transaction ? t("modalEditTransaction") : t("modalAddTransaction"));
		this.contentEl.empty();

		this.form = new TransactionForm({
			target: this.contentEl,
			props: {
				app: this.app,
				plugin: this.plugin,
				transaction: this.options.transaction ?? null,
				onClose: () => this.close(),
			},
		});
	}

	onClose(): void {
		this.form?.$destroy();
		this.form = undefined;
		this.contentEl.empty();
	}
}
