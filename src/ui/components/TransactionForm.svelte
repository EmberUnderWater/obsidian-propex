<script lang="ts">
	import { onDestroy, onMount, tick } from "svelte";
	import { Notice, type App } from "obsidian";
	import { t } from "../../locales";
	import type PropexPlugin from "../../main";
	import type { CachedProject, Transaction, TransactionType } from "../../types";
	import { parseAmount } from "../../utils/calcParser";
	import { CategorySuggest } from "./categorySuggest";
	import { ProjectSuggestModal } from "../modals/projectSuggestModal";

	export let app: App;
	export let plugin: PropexPlugin;
	export let transaction: Transaction | null = null;
	export let onClose: () => void;

	const isEdit = transaction !== null;

	let type: TransactionType = transaction?.type ?? "expense";
	let amountRaw = transaction ? String(transaction.amount) : "";
	let category = transaction?.category ?? "";
	let projectId: string | null | undefined = transaction ? transaction.projectId : undefined;
	let projectTouched = isEdit;
	let date = transaction?.date ?? localToday();
	let comment = transaction?.comment ?? "";

	let categories: string[] = [...plugin.dataStore.settings.categories];
	let projects: CachedProject[] = plugin.projectCache.getProjects();

	let amountInput: HTMLInputElement;
	let categoryInput: HTMLInputElement;
	let categorySuggest: CategorySuggest | undefined;
	let isSaving = false;

	function localToday(): string {
		const now = new Date();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		return `${now.getFullYear()}-${month}-${day}`;
	}

	$: projectLabelText = (() => {
		if (projectId === null || projectId === undefined) return t("overheadOption");
		const cached = plugin.projectCache.getProject(projectId);
		return cached?.name ?? projectId;
	})();

	function openProjectPicker(): void {
		new ProjectSuggestModal(app, plugin.projectCache.getProjects(), (pick) => {
			projectId = pick.projectId;
			projectTouched = true;
			projects = plugin.projectCache.getProjects();
		}).open();
	}

	function normalizeAmountField(): void {
		const parsed = parseAmount(amountRaw);
		if (parsed.ok && parsed.value !== null) {
			amountRaw = String(parsed.value);
		}
	}

	async function ensureCategory(name: string, created: boolean): Promise<void> {
		if (!created) return;
		try {
			await plugin.dataStore.addCategory(name);
			categories = [...plugin.dataStore.settings.categories];
		} catch (error) {
			console.error("[Propex] Failed to save category", error);
			new Notice(t("errSaveData"));
		}
	}

	function validate(): Transaction | null {
		if (!amountRaw.trim()) {
			new Notice(t("errAmountRequired"));
			return null;
		}

		const parsed = parseAmount(amountRaw);
		if (!parsed.ok) {
			if (parsed.value !== null && parsed.value <= 0) {
				new Notice(t("errAmountPositive"));
			} else {
				new Notice(t("errAmountInvalid"));
			}
			return null;
		}

		if (!category.trim()) {
			new Notice(t("errCategoryRequired"));
			return null;
		}

		if (plugin.dataStore.settings.requireProject && !projectTouched) {
			new Notice(t("errProjectRequired"));
			return null;
		}

		if (!date.trim()) {
			new Notice(t("errDateRequired"));
			return null;
		}

		if (plugin.dataStore.settings.requireComment && !comment.trim()) {
			new Notice(t("errCommentRequired"));
			return null;
		}

		return {
			id: transaction?.id ?? "",
			type,
			date: date.trim(),
			amount: parsed.value ?? 0,
			currency: plugin.dataStore.settings.baseCurrency,
			projectId: projectId === undefined ? null : projectId,
			category: category.trim(),
			comment: comment.trim(),
			createdAt: transaction?.createdAt ?? "",
			updatedAt: transaction?.updatedAt ?? "",
		};
	}

	async function submit(keepOpen: boolean): Promise<void> {
		if (isSaving) return;
		normalizeAmountField();
		const draft = validate();
		if (!draft) return;

		const payload = {
			type: draft.type,
			date: draft.date,
			amount: draft.amount,
			currency: draft.currency,
			projectId: draft.projectId,
			category: draft.category,
			comment: draft.comment,
		};

		isSaving = true;
		try {
			if (isEdit && transaction) {
				await plugin.dataStore.updateTransaction(transaction.id, payload);
				onClose();
				return;
			}

			await plugin.dataStore.addTransaction(payload);

			if (!keepOpen) {
				onClose();
				return;
			}

			amountRaw = "";
			comment = "";
			await tick();
			amountInput?.focus();
		} catch (error) {
			console.error("[Propex] Failed to save transaction", error);
			new Notice(t("errSaveData"));
		} finally {
			isSaving = false;
		}
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== "Enter") return;
		event.preventDefault();
		event.stopPropagation();
		const keepOpen = event.shiftKey && !isEdit;
		void submit(keepOpen);
	}

	onMount(() => {
		const activeProject = plugin.projectCache.getProjectByActiveFile();
		if (!isEdit && activeProject) {
			projectId = activeProject.name.trim();
			projectTouched = true;
		} else if (!isEdit && plugin.dataStore.settings.smartContext) {
			const activeFile = app.workspace.getActiveFile();
			const smart = activeFile
				? plugin.projectCache.resolveSmartProject(activeFile.path)
				: undefined;
			if (smart) {
				projectId = smart.name.trim();
				projectTouched = true;
			}
		}

		categorySuggest = new CategorySuggest(
			app,
			categoryInput,
			() => plugin.dataStore.settings.categories,
			t("createCategoryOption"),
			(value, created) => {
				category = value;
				void ensureCategory(value, created);
			},
		);

		void tick().then(() => amountInput?.focus());
	});

	onDestroy(() => {
		categorySuggest?.close();
		categorySuggest = undefined;
	});
</script>

<div class="propex-tx-form">
	<div class="propex-type-toggle" role="group" aria-label={t("type")}>
		<button
			type="button"
			class="propex-type-btn"
			class:is-active={type === "expense"}
			on:click={() => (type = "expense")}
		>
			{t("expense")}
		</button>
		<button
			type="button"
			class="propex-type-btn"
			class:is-active={type === "income"}
			on:click={() => (type = "income")}
		>
			{t("income")}
		</button>
	</div>

	<label class="propex-field">
		<span class="propex-label">{t("amount")} *</span>
		<input
			class="propex-input"
			type="text"
			inputmode="decimal"
			bind:this={amountInput}
			bind:value={amountRaw}
			placeholder={t("amountPlaceholder")}
			on:blur={normalizeAmountField}
			on:keydown={handleKeydown}
		/>
	</label>

	<label class="propex-field">
		<span class="propex-label">{t("category")} *</span>
		<input
			class="propex-input"
			type="text"
			bind:this={categoryInput}
			bind:value={category}
			placeholder={t("categorySelectPlaceholder")}
			on:keydown={handleKeydown}
		/>
	</label>

	<div class="propex-field">
		<span class="propex-label">
			{t("project")}
			{plugin.dataStore.settings.requireProject ? "*" : ""}
		</span>
		<button type="button" class="propex-btn propex-btn-block" on:click={openProjectPicker}>
			{projectLabelText}
		</button>
	</div>

	<label class="propex-field">
		<span class="propex-label">{t("date")} *</span>
		<input class="propex-input" type="date" bind:value={date} on:keydown={handleKeydown} />
	</label>

	<label class="propex-field">
		<span class="propex-label">
			{t("comment")}
			{plugin.dataStore.settings.requireComment ? "*" : ""}
		</span>
		<input
			class="propex-input"
			type="text"
			bind:value={comment}
			placeholder={t("commentPlaceholder")}
			on:keydown={handleKeydown}
		/>
	</label>

	<div class="propex-actions">
		<button type="button" class="propex-btn" disabled={isSaving} on:click={onClose}>{t("cancel")}</button>
		<button type="button" class="propex-btn" disabled={isSaving} on:click={() => void submit(false)}>
			{t("save")}
		</button>
		{#if !isEdit}
			<button type="button" class="propex-btn mod-cta" disabled={isSaving} on:click={() => void submit(true)}>
				{t("saveAndContinue")}
			</button>
		{/if}
	</div>
</div>

<style>
	.propex-tx-form {
		display: flex;
		flex-direction: column;
		gap: var(--size-4-3);
	}

	.propex-type-toggle {
		display: flex;
		gap: var(--size-4-2);
	}

	.propex-type-btn {
		flex: 1;
		background: var(--background-secondary);
		color: var(--text-muted);
		border: 1px solid var(--background-modifier-border);
	}

	.propex-type-btn.is-active {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}

	.propex-field {
		display: flex;
		flex-direction: column;
		gap: var(--size-4-1);
	}

	.propex-label {
		font-size: var(--font-ui-small);
		color: var(--text-muted);
	}

	.propex-input {
		width: 100%;
		background: var(--background-primary);
		color: var(--text-normal);
		border: 1px solid var(--background-modifier-border);
	}

	.propex-btn-block {
		width: 100%;
		text-align: left;
	}

	.propex-btn {
		background: var(--interactive-normal);
		color: var(--text-normal);
		border: 1px solid var(--background-modifier-border);
		cursor: pointer;
	}

	.propex-btn-block {
		width: 100%;
		text-align: left;
	}

	.propex-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--size-4-2);
		margin-top: var(--size-4-2);
	}
</style>
