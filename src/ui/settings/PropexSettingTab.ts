import { Notice, PluginSettingTab, Setting, type App } from "obsidian";
import { t } from "../../locales";
import type PropexPlugin from "../../main";
import { createDefaultSettings, type PropexSettings } from "../../types";
import { debounce } from "../../utils/debounce";
import { ConfirmModal } from "../modals/confirmModal";

function normalizeCategory(value: string): string {
	return value.trim();
}

function findCategoryIndex(categories: string[], value: string): number {
	const needle = normalizeCategory(value).toLowerCase();
	return categories.findIndex((c) => c.toLowerCase() === needle);
}

export class PropexSettingTab extends PluginSettingTab {
	private readonly scheduleRebuild = debounce(() => {
		this.plugin.projectCache.rebuild();
	}, 400);
	private readonly domCleanups = new Set<() => void>();

	getSettingDefinitions(): never[] {
		return [];
	}

	cancelPending(): void {
		this.scheduleRebuild.cancel();
		this.clearDomListeners();
	}

	private clearDomListeners(): void {
		for (const cleanup of this.domCleanups) cleanup();
		this.domCleanups.clear();
	}

	constructor(
		app: App,
		private readonly plugin: PropexPlugin,
	) {
		super(app, plugin);
	}

	private async persist(operation: () => Promise<void>): Promise<boolean> {
		try {
			await operation();
			return true;
		} catch (error) {
			console.error("[Propex] Failed to save settings", error);
			new Notice(t("errSaveData"));
			return false;
		}
	}

	display(): void {
		this.clearDomListeners();
		const { containerEl } = this;
		const settings = this.plugin.dataStore.settings;
		containerEl.empty();

		new Setting(containerEl).setName(t("settingsTitle")).setHeading();
		this.renderDetection(containerEl, settings);
		this.renderNaming(containerEl, settings);
		this.renderCategories(containerEl, settings);
		this.renderGeneral(containerEl, settings);
		this.renderOverhead(containerEl, settings);
		this.renderExport(containerEl, settings);
		this.renderDangerZone(containerEl);
	}

	private renderDangerZone(containerEl: HTMLElement): void {
		new Setting(containerEl).setName(t("resetSettings")).setHeading();
		new Setting(containerEl).addButton((button) => {
			button
				.setButtonText(t("resetSettings"))
				.setWarning()
				.onClick(() => {
					new ConfirmModal(
						this.app,
						t("resetSettings"),
						t("resetSettingsConfirm"),
						t("yes"),
						t("no"),
						() => {
							void (async () => {
								if (!(await this.persist(() => this.plugin.dataStore.updateSettings(createDefaultSettings())))) return;
								this.plugin.projectCache.rebuild();
								new Notice(t("resetSettingsDone"));
								this.display();
							})();
						},
					).open();
				});
		});
	}

	private renderDetection(containerEl: HTMLElement, settings: PropexSettings): void {
		new Setting(containerEl).setName(t("detectionSection")).setHeading();
		new Setting(containerEl)
			.setName(t("detectionMode"))
			.setDesc(t("detectionModeDesc"))
			.addDropdown((dropdown) => {
				dropdown.addOption("frontmatter", t("modeFrontmatter"));
				dropdown.addOption("folder", t("modeFolder"));
				dropdown.setValue(settings.projectDetectionMode);
				dropdown.onChange(async (value) => {
					const mode = value as PropexSettings["projectDetectionMode"];
					if (!(await this.persist(() => this.plugin.dataStore.updateSettings({
						projectDetectionMode: mode,
						...(mode === "folder" ? { projectNameSource: "basename" as const } : {}),
					})))) {
						dropdown.setValue(this.plugin.dataStore.settings.projectDetectionMode);
						return;
					}
					this.scheduleRebuild();
					this.display();
				});
			});

		if (settings.projectDetectionMode === "frontmatter") {
			new Setting(containerEl)
				.setName(t("detectionValue"))
				.setDesc(t("detectionValueDesc"))
				.addText((text) => {
					text.setPlaceholder(t("detectionPlaceholderFrontmatter")).setValue(settings.projectDetectionKey).onChange(async (value) => {
						if (await this.persist(() => this.plugin.dataStore.updateSettings({ projectDetectionKey: value }))) this.scheduleRebuild();
						else text.setValue(this.plugin.dataStore.settings.projectDetectionKey);
					});
				});
			new Setting(containerEl)
				.setName(t("detectionExpectedValue"))
				.setDesc(t("detectionExpectedValueDesc"))
				.addText((text) => {
					text.setPlaceholder(t("detectionPlaceholderExpected")).setValue(settings.projectDetectionExpectedValue).onChange(async (value) => {
						if (await this.persist(() => this.plugin.dataStore.updateSettings({ projectDetectionExpectedValue: value }))) this.scheduleRebuild();
						else text.setValue(this.plugin.dataStore.settings.projectDetectionExpectedValue);
					});
				});
		}

		if (settings.projectDetectionMode === "folder") {
			new Setting(containerEl)
				.setName(t("detectionFolder"))
				.setDesc(t("detectionFolderDesc"))
				.addText((text) => {
					text.setPlaceholder(t("detectionPlaceholderFolder")).setValue(settings.projectDetectionFolder).onChange(async (value) => {
						if (await this.persist(() => this.plugin.dataStore.updateSettings({ projectDetectionFolder: value }))) this.scheduleRebuild();
						else text.setValue(this.plugin.dataStore.settings.projectDetectionFolder);
					});
				});
		}
	}

	private renderNaming(containerEl: HTMLElement, settings: PropexSettings): void {
		new Setting(containerEl).setName(t("nameSection")).setHeading();
		const isFolderMode = settings.projectDetectionMode === "folder";
		new Setting(containerEl).setName(t("nameSource")).addDropdown((dropdown) => {
			dropdown.addOption("basename", t("nameBasename"));
			if (!isFolderMode) dropdown.addOption("frontmatter", t("nameFrontmatter"));
			const value = isFolderMode && settings.projectNameSource === "frontmatter" ? "basename" : settings.projectNameSource;
			dropdown.setValue(value);
			dropdown.onChange(async (next) => {
				if (!(await this.persist(() => this.plugin.dataStore.updateSettings({ projectNameSource: next as PropexSettings["projectNameSource"] })))) {
					dropdown.setValue(this.plugin.dataStore.settings.projectNameSource);
					return;
				}
				this.scheduleRebuild();
				this.display();
			});
		});
		if (!isFolderMode && settings.projectNameSource === "frontmatter") {
			new Setting(containerEl).setName(t("nameKey")).setDesc(t("nameKeyDesc")).addText((text) => {
				text.setPlaceholder(t("nameKeyPlaceholder")).setValue(settings.projectNameFrontmatterKey).onChange(async (value) => {
					if (await this.persist(() => this.plugin.dataStore.updateSettings({ projectNameFrontmatterKey: value }))) this.scheduleRebuild();
					else text.setValue(this.plugin.dataStore.settings.projectNameFrontmatterKey);
				});
			});
		}
	}

	private renderCategories(containerEl: HTMLElement, settings: PropexSettings): void {
		const details = containerEl.createEl("details");
		details.addClass("propex-categories-details");
		const summary = details.createEl("summary", { text: t("categoriesSection") });
		summary.addClass("propex-categories-summary");
		let pendingNew = "";
		new Setting(details).setName(t("addCategory")).setDesc(t("addCategoryDesc"))
			.addText((text) => text.setPlaceholder(t("categoryPlaceholder")).onChange((value) => { pendingNew = value; }))
			.addButton((button) => button.setButtonText(t("add")).setCta().onClick(async () => {
				const value = normalizeCategory(pendingNew);
				if (!value) return void new Notice(t("noticeEnterCategory"));
				if (findCategoryIndex(settings.categories, value) !== -1) return void new Notice(t("noticeCategoryExists"));
				try {
					await this.plugin.dataStore.addCategory(value);
					this.display();
				} catch (error) {
					console.error("[Propex] Failed to add category", error);
					new Notice(t("errSaveData"));
				}
			}));
		if (settings.categories.length === 0) details.createEl("p", { text: t("noCategories") });

		settings.categories.forEach((category, index) => {
			new Setting(details).setName(t("categoryIndex", { n: index + 1 })).addText((text) => {
				text.setValue(category);
				const blurHandler = () => {
					void (async () => {
						const trimmed = normalizeCategory(text.getValue());
						if (trimmed === category) return;
						if (!trimmed) {
							text.setValue(category);
							new Notice(t("noticeCategoryEmpty"));
							return;
						}
						const existing = findCategoryIndex(settings.categories, trimmed);
						if (existing !== -1 && settings.categories[existing] !== category) {
							text.setValue(category);
							new Notice(t("noticeCategoryExists"));
							return;
						}
						try {
							await this.plugin.dataStore.renameCategory(category, trimmed);
						} catch (error) {
							console.error("[Propex] Failed to rename category", error);
							new Notice(t("errSaveData"));
						}
					})();
				};
				text.inputEl.addEventListener("blur", blurHandler);
				this.domCleanups.add(() => text.inputEl.removeEventListener("blur", blurHandler));
			}).addExtraButton((button) => {
				button.setIcon("trash").setTooltip(t("deleteCategory"));
				button.extraSettingsEl.setAttribute("aria-label", t("categoryDeleteLabel", { name: category }));
				button.onClick(async () => {
					try {
						await this.plugin.dataStore.deleteCategory(category);
						this.display();
					} catch (error) {
						console.error("[Propex] Failed to delete category", error);
						new Notice(t("errSaveData"));
					}
				});
			});
		});
		if (settings.categories.length > 0) details.createEl("p", { text: t("categoryRenameNote"), cls: "setting-item-description" });
	}

	private renderGeneral(containerEl: HTMLElement, settings: PropexSettings): void {
		new Setting(containerEl).setName(t("generalSection")).setHeading();
		new Setting(containerEl).setName(t("baseCurrency")).setDesc(t("baseCurrencyDesc")).addText((text) => {
			text.setPlaceholder(t("currencyPlaceholder")).setValue(settings.baseCurrency).onChange(async (value) => {
				if (!(await this.persist(() => this.plugin.dataStore.updateSettings({ baseCurrency: value.trim() })))) text.setValue(this.plugin.dataStore.settings.baseCurrency);
			});
		});
		new Setting(containerEl).setName(t("requireProject")).setDesc(t("requireProjectDesc")).addToggle((toggle) => {
			toggle.setValue(settings.requireProject).onChange(async (value) => { if (!(await this.persist(() => this.plugin.dataStore.updateSettings({ requireProject: value })))) toggle.setValue(this.plugin.dataStore.settings.requireProject); });
		});
		new Setting(containerEl).setName(t("requireComment")).setDesc(t("requireCommentDesc")).addToggle((toggle) => {
			toggle.setValue(settings.requireComment).onChange(async (value) => { if (!(await this.persist(() => this.plugin.dataStore.updateSettings({ requireComment: value })))) toggle.setValue(this.plugin.dataStore.settings.requireComment); });
		});
		new Setting(containerEl).setName(t("smartContext")).setDesc(t("smartContextDesc")).addToggle((toggle) => {
			toggle.setValue(settings.smartContext).onChange(async (value) => { if (!(await this.persist(() => this.plugin.dataStore.updateSettings({ smartContext: value })))) toggle.setValue(this.plugin.dataStore.settings.smartContext); });
		});
		new Setting(containerEl).setName(t("budgetKey")).setDesc(t("budgetKeyDesc")).addText((text) => {
			text.setPlaceholder(t("budgetKeyPlaceholder")).setValue(settings.budgetFrontmatterKey).onChange(async (value) => {
				if (!(await this.persist(() => this.plugin.dataStore.updateSettings({ budgetFrontmatterKey: value.trim() || "budget" })))) text.setValue(this.plugin.dataStore.settings.budgetFrontmatterKey);
			});
		});
	}

	private renderOverhead(containerEl: HTMLElement, settings: PropexSettings): void {
		new Setting(containerEl).setName(t("overheadSection")).setHeading();
		new Setting(containerEl).setName(t("overheadMode")).setDesc(t("overheadModeDesc")).addDropdown((dropdown) => {
			dropdown.addOption("separate", t("overheadSeparate"));
			dropdown.addOption("split_equally", t("overheadSplitEqually"));
			dropdown.addOption("proportional", t("overheadProportional"));
			dropdown.setValue(settings.overheadMode);
			dropdown.onChange(async (value) => {
				if (await this.persist(() => this.plugin.dataStore.updateSettings({ overheadMode: value as PropexSettings["overheadMode"] }))) this.display(); else dropdown.setValue(this.plugin.dataStore.settings.overheadMode);
			});
		});
		new Setting(containerEl).setName(t("overheadCriteria")).addDropdown((dropdown) => {
			dropdown.addOption("all_cached", t("criteriaAllCached"));
			dropdown.addOption("period_transactions", t("criteriaPeriodTransactions"));
			dropdown.addOption("frontmatter_flag", t("criteriaFrontmatterFlag"));
			dropdown.setValue(settings.overheadActiveCriteria);
			dropdown.onChange(async (value) => {
				if (await this.persist(() => this.plugin.dataStore.updateSettings({ overheadActiveCriteria: value as PropexSettings["overheadActiveCriteria"] }))) this.display(); else dropdown.setValue(this.plugin.dataStore.settings.overheadActiveCriteria);
			});
		});
		if (settings.overheadActiveCriteria === "frontmatter_flag") {
			new Setting(containerEl).setName(t("overheadFlagKey")).setDesc(t("overheadFlagKeyDesc")).addText((text) => {
				text.setPlaceholder(t("activeFlagKeyPlaceholder")).setValue(settings.overheadActiveFlagKey).onChange(async (value) => {
					if (!(await this.persist(() => this.plugin.dataStore.updateSettings({ overheadActiveFlagKey: value.trim() || "active" })))) text.setValue(this.plugin.dataStore.settings.overheadActiveFlagKey);
				});
			});
			new Setting(containerEl).setName(t("overheadActiveValue")).setDesc(t("overheadActiveValueDesc")).addText((text) => {
				text.setPlaceholder(t("activeFlagValuePlaceholder")).setValue(settings.overheadActiveValue).onChange(async (value) => {
					if (!(await this.persist(() => this.plugin.dataStore.updateSettings({ overheadActiveValue: value.trim() })))) text.setValue(this.plugin.dataStore.settings.overheadActiveValue);
				});
			});
		}
	}

	private renderExport(containerEl: HTMLElement, settings: PropexSettings): void {
		new Setting(containerEl).setName(t("csvSection")).setHeading();
		new Setting(containerEl).setName(t("csvSeparator")).addDropdown((dropdown) => {
			dropdown.addOption(";", t("sepSemicolon"));
			dropdown.addOption(",", t("sepComma"));
			dropdown.setValue(settings.csvSeparator);
			dropdown.onChange(async (value) => {
				if (!(await this.persist(() => this.plugin.dataStore.updateSettings({ csvSeparator: value as PropexSettings["csvSeparator"] })))) dropdown.setValue(this.plugin.dataStore.settings.csvSeparator);
			});
		});
	}
}
