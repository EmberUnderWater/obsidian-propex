import { ItemView, type WorkspaceLeaf } from "obsidian";
import { t } from "../../locales";
import type PropexPlugin from "../../main";
import LedgerApp from "../components/LedgerApp.svelte";

export const LEDGER_VIEW_TYPE = "propex-ledger";

export class LedgerView extends ItemView {
	private component?: LedgerApp;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: PropexPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return LEDGER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t("ledgerTitle");
	}

	getIcon(): string {
		return "table";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.component = new LedgerApp({
			target: this.contentEl,
			props: {
				app: this.app,
				plugin: this.plugin,
			},
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = undefined;
		this.contentEl.empty();
	}
}
