import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import { DataStore } from "./data/dataStore";
import { t } from "./locales";
import { makeNoteAProject } from "./services/makeProject";
import { ProjectCache } from "./services/projectCache";
import { PropexSlashSuggest } from "./ui/components/propexSlashSuggest";
import { TransactionModal } from "./ui/modals/TransactionModal";
import { PropexSettingTab } from "./ui/settings/PropexSettingTab";
import { PropexReportRenderChild } from "./ui/views/PropexReportRenderChild";
import { LEDGER_VIEW_TYPE, LedgerView } from "./ui/views/LedgerView";

export default class PropexPlugin extends Plugin {
	dataStore!: DataStore;
	projectCache!: ProjectCache;
	private settingTab!: PropexSettingTab;
	private slashSuggest?: PropexSlashSuggest;

	async onload(): Promise<void> {
		this.dataStore = new DataStore(this);
		await this.dataStore.load();

		if (this.dataStore.loadFailed) {
			new Notice(t("errLoadData"), 0);
		}

		this.projectCache = new ProjectCache(this.app, this.dataStore);
		this.projectCache.registerEvents(this);
		// Frontmatter may still be indexing at onload; re-scan once layout is ready.
		this.app.workspace.onLayoutReady(() => {
			this.projectCache.rebuild();
		});
		this.projectCache.init();

		this.settingTab = new PropexSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		this.registerView(LEDGER_VIEW_TYPE, (leaf) => new LedgerView(leaf, this));

		this.registerMarkdownCodeBlockProcessor("propex", (source, el, ctx) => {
			ctx.addChild(new PropexReportRenderChild(el, this, source, ctx.sourcePath));
		});

		this.slashSuggest = new PropexSlashSuggest(this.app);
		this.registerEditorSuggest(this.slashSuggest);

		this.addRibbonIcon("table", t("cmdOpenLedger"), () => {
			void this.activateLedgerView();
		});

		this.addCommand({
			id: "add-transaction",
			name: t("cmdAddTransaction"),
			callback: () => {
				new TransactionModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "open-ledger",
			name: t("cmdOpenLedger"),
			callback: () => {
				void this.activateLedgerView();
			},
		});

		this.addCommand({
			id: "make-project",
			name: t("cmdMakeProject"),
			callback: () => {
				void makeNoteAProject(this, this.app).catch((error: unknown) => {
					console.error("[Propex] Failed to make note a project", error);
					new Notice(t("errSaveData"));
				});
			},
		});
	}

	async activateLedgerView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(LEDGER_VIEW_TYPE);
		const first = existing[0];
		if (first) {
			void this.app.workspace.revealLeaf(first);
			return;
		}

		const leaf: WorkspaceLeaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: LEDGER_VIEW_TYPE, active: true });
		void this.app.workspace.revealLeaf(leaf);
	}

	onunload(): void {
		this.settingTab?.cancelPending();
		this.projectCache?.cancelPending();
		this.slashSuggest = undefined;
	}
}
