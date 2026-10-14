<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { Notice, type App } from "obsidian";
	import { t } from "../../locales";
	import type PropexPlugin from "../../main";
	import type { CachedProject, Transaction } from "../../types";
	import { buildCsvExport, csvExportFileName } from "../../utils/csvExport";
	import { parseTransactionsCsv } from "../../utils/csvImport";
	import { debounce } from "../../utils/debounce";
	import { ConfirmModal } from "../modals/confirmModal";
	import { TransactionModal } from "../modals/TransactionModal";
	import CategoryMultiSelect from "./CategoryMultiSelect.svelte";

	export let app: App;
	export let plugin: PropexPlugin;

	const PROJECT_ALL = "all";
	const PROJECT_OVERHEAD = "__overhead__";

	type SortKey = "date" | "project" | "category" | "comment" | "amount";
	type SortDir = "asc" | "desc";

	let transactions: Transaction[] = [...plugin.dataStore.transactions];
	let categories: string[] = [...plugin.dataStore.settings.categories];
	let projects: CachedProject[] = plugin.projectCache.getProjects();
	let currency = plugin.dataStore.settings.baseCurrency;
	let importInput: HTMLInputElement;

	let dateFrom = "";
	let dateTo = "";
	let projectFilter: string = PROJECT_ALL;
	let categoryFilter: string[] = [];
	let search = "";
	let searchDebounced = "";
	const applySearchDebounced = debounce((value: string) => {
		searchDebounced = value;
	}, 300);

	let sortKey: SortKey = "date";
	let sortDir: SortDir = "desc";

	let unsubscribe: (() => void) | undefined;
	let unsubscribeProjects: (() => void) | undefined;

	function refresh(): void {
		transactions = plugin.dataStore.transactions;
		categories = [...plugin.dataStore.settings.categories];
		currency = plugin.dataStore.settings.baseCurrency;
		projects = plugin.projectCache.getProjects();
	}

	function signedAmount(transaction: Transaction): number {
		return transaction.type === "income" ? transaction.amount : -transaction.amount;
	}

	function projectName(projectId: string | null): string {
		if (projectId === null) return t("overheadOption");
		const cached = plugin.projectCache.getProject(projectId);
		return cached?.name ?? projectId;
	}

	function formatAmount(value: number): string {
		const sign = value > 0 ? "+" : value < 0 ? "-" : "";
		return `${sign}${Math.abs(value).toFixed(2)} ${currency}`.trim();
	}

	function buildProjectOptions(
		projectList: CachedProject[],
		txList: Transaction[],
	): Array<{ value: string; label: string }> {
		const options = [
			{ value: PROJECT_ALL, label: t("filterAllProjects") },
			{ value: PROJECT_OVERHEAD, label: t("overheadOption") },
			...projectList.map((project) => ({ value: project.filePath, label: project.name })),
		];

		const known = new Set(projectList.map((p) => p.filePath));
		for (const transaction of txList) {
			if (transaction.projectId && !known.has(transaction.projectId)) {
				options.push({ value: transaction.projectId, label: transaction.projectId });
				known.add(transaction.projectId);
			}
		}

		return options;
	}

	function matchesFilters(
		transaction: Transaction,
		from: string,
		to: string,
		project: string,
		categoriesSelected: string[],
		queryText: string,
	): boolean {
		if (from && transaction.date < from) return false;
		if (to && transaction.date > to) return false;

		if (project === PROJECT_OVERHEAD) {
			if (transaction.projectId !== null) return false;
		} else if (project !== PROJECT_ALL) {
			if (transaction.projectId !== project) return false;
		}

		if (categoriesSelected.length > 0 && !categoriesSelected.includes(transaction.category)) {
			return false;
		}

		const query = queryText.trim().toLowerCase();
		if (query && !transaction.comment.toLowerCase().includes(query)) return false;

		return true;
	}

	function compare(
		a: Transaction,
		b: Transaction,
		key: SortKey,
		dir: SortDir,
		projectNames: Map<string, string>,
	): number {
		let result = 0;
		switch (key) {
			case "date":
				result = a.date.localeCompare(b.date);
				break;
			case "project":
				result = (a.projectId === null ? t("overheadOption") : projectNames.get(a.projectId) ?? a.projectId)
					.localeCompare(b.projectId === null ? t("overheadOption") : projectNames.get(b.projectId) ?? b.projectId);
				break;
			case "category":
				result = a.category.localeCompare(b.category);
				break;
			case "comment":
				result = a.comment.localeCompare(b.comment);
				break;
			case "amount":
				result = signedAmount(a) - signedAmount(b);
				break;
		}
		if (result === 0) result = a.id.localeCompare(b.id);
		return dir === "asc" ? result : -result;
	}

	function toggleSort(key: SortKey): void {
		if (sortKey === key) {
			sortDir = sortDir === "asc" ? "desc" : "asc";
		} else {
			sortKey = key;
			sortDir = key === "amount" || key === "date" ? "desc" : "asc";
		}
	}

	function sortIcon(key: SortKey): string {
		if (sortKey !== key) return "";
		return sortDir === "asc" ? " ↑" : " ↓";
	}

	function ariaSort(key: SortKey): "ascending" | "descending" | "none" {
		if (sortKey !== key) return "none";
		return sortDir === "asc" ? "ascending" : "descending";
	}

	function editRow(transaction: Transaction): void {
		new TransactionModal(app, plugin, { transaction }).open();
	}

	function deleteRow(transaction: Transaction): void {
		new ConfirmModal(
			app,
			t("confirmDeleteTitle"),
			t("confirmDeleteMessage"),
			t("yes"),
			t("no"),
			() => {
				void plugin.dataStore.deleteTransaction(transaction.id).catch((error) => {
					console.error("[Propex] Failed to delete transaction", error);
					new Notice(t("errSaveData"));
				});
			},
		).open();
	}

	function exportCsv(): void {
		const csv = buildCsvExport(filtered, plugin.dataStore.settings.csvSeparator);
		const fileName = csvExportFileName();
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = fileName;
		anchor.click();
		URL.revokeObjectURL(url);
		new Notice(t("csvExported", { name: fileName }));
	}

	async function importCsv(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (!file) return;

		try {
			const parsed = parseTransactionsCsv(await file.text(), plugin.dataStore.settings.csvSeparator);
			if (!parsed.ok) {
				new Notice(t(parsed.error === "empty" ? "importCsvEmpty" : "importCsvHeaderError"));
				return;
			}

			let imported = 0;
			let errors = parsed.invalidRows;
			for (const transaction of parsed.transactions) {
				try {
					await plugin.dataStore.addTransaction(transaction);
					imported++;
				} catch (error) {
					console.error("[Propex] Failed to import CSV transaction", error);
					errors++;
				}
			}
			new Notice(t("importCsvDone", { success: imported, errors }));
		} catch (error) {
			console.error("[Propex] Failed to import CSV", error);
			new Notice(t("importCsvReadError"));
		}
	}

	$: projectOptionList = buildProjectOptions(projects, transactions);
	$: filtered = transactions.filter((tx) =>
		matchesFilters(tx, dateFrom, dateTo, projectFilter, categoryFilter, searchDebounced),
	);
	$: projectNames = new Map(projects.map((project) => [project.filePath, project.name]));
	$: sorted = [...filtered].sort((a, b) => compare(a, b, sortKey, sortDir, projectNames));
	$: total = sorted.reduce((sum, transaction) => sum + signedAmount(transaction), 0);
	$: applySearchDebounced(search);

	onMount(() => {
		unsubscribe = plugin.dataStore.onChange(refresh);
		unsubscribeProjects = plugin.projectCache.onChange(refresh);
	});

	onDestroy(() => {
		applySearchDebounced.cancel();
		unsubscribe?.();
		unsubscribeProjects?.();
	});
</script>

<div class="propex-ledger">
	<div class="propex-ledger-toolbar">
		<div class="propex-filters">
			<label class="propex-filter">
				<span>{t("filterDateFrom")}</span>
				<input type="date" bind:value={dateFrom} />
			</label>
			<label class="propex-filter">
				<span>{t("filterDateTo")}</span>
				<input type="date" bind:value={dateTo} />
			</label>
			<label class="propex-filter">
				<span>{t("filterProject")}</span>
				<select bind:value={projectFilter}>
					{#each projectOptionList as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
			<div class="propex-filter">
				<span id="propex-category-filter-label">{t("filterCategory")}</span>
				<CategoryMultiSelect
					{categories}
					bind:selected={categoryFilter}
					labelledBy="propex-category-filter-label"
				/>
			</div>
			<label class="propex-filter propex-filter-search">
				<span>{t("filterSearch")}</span>
				<input type="search" bind:value={search} placeholder={t("filterSearchPlaceholder")} />
			</label>
		</div>
		<button type="button" class="propex-btn" on:click={exportCsv}>{t("exportCsv")}</button>
		<button type="button" class="propex-btn" on:click={() => importInput?.click()}>{t("importCsv")}</button>
		<input bind:this={importInput} type="file" accept=".csv,text/csv" hidden on:change={importCsv} />
	</div>

	<div class="propex-table-wrap">
		<table class="propex-table">
			<thead>
				<tr>
					<th aria-sort={ariaSort("date")}><button type="button" class="propex-th" on:click={() => toggleSort("date")}>{t("colDate")}{sortIcon("date")}</button></th>
					<th aria-sort={ariaSort("project")}><button type="button" class="propex-th" on:click={() => toggleSort("project")}>{t("colProject")}{sortIcon("project")}</button></th>
					<th aria-sort={ariaSort("category")}><button type="button" class="propex-th" on:click={() => toggleSort("category")}>{t("colCategory")}{sortIcon("category")}</button></th>
					<th aria-sort={ariaSort("comment")}><button type="button" class="propex-th" on:click={() => toggleSort("comment")}>{t("colComment")}{sortIcon("comment")}</button></th>
					<th class="propex-num" aria-sort={ariaSort("amount")}><button type="button" class="propex-th" on:click={() => toggleSort("amount")}>{t("colAmount")}{sortIcon("amount")}</button></th>
					<th>{t("colActions")}</th>
				</tr>
			</thead>
			<tbody>
				{#if sorted.length === 0}
					<tr>
						<td colspan="6" class="propex-empty">{t("emptyLedger")}</td>
					</tr>
				{:else}
					{#each sorted as transaction (transaction.id)}
						<tr>
							<td>{transaction.date}</td>
							<td>{projectName(transaction.projectId)}</td>
							<td>{transaction.category}</td>
							<td>{transaction.comment}</td>
							<td class="propex-num" class:propex-income={transaction.type === "income"} class:propex-expense={transaction.type === "expense"}>
								{formatAmount(signedAmount(transaction))}
							</td>
							<td class="propex-actions">
								<button type="button" class="propex-btn" on:click={() => editRow(transaction)}>
									{t("actionEdit")}
								</button>
								<button type="button" class="propex-btn" on:click={() => deleteRow(transaction)}>
									{t("actionDelete")}
								</button>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
			<tfoot>
				<tr>
					<td colspan="4">{t("totalLabel")}</td>
					<td class="propex-num" class:propex-income={total > 0} class:propex-expense={total < 0}>
						{formatAmount(total)}
					</td>
					<td></td>
				</tr>
			</tfoot>
		</table>
	</div>
</div>

<style>
	.propex-ledger {
		display: flex;
		flex-direction: column;
		gap: var(--size-4-3);
		padding: var(--size-4-3);
		height: 100%;
		overflow: auto;
	}

	.propex-ledger-toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-4-3);
		align-items: flex-end;
		justify-content: space-between;
	}

	.propex-filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-4-2);
		align-items: flex-end;
	}

	.propex-filter {
		display: flex;
		flex-direction: column;
		gap: var(--size-4-1);
		font-size: var(--font-ui-small);
		color: var(--text-muted);
	}

	.propex-filter input,
	.propex-filter select {
		background: var(--background-primary);
		color: var(--text-normal);
		border: 1px solid var(--background-modifier-border);
	}

	.propex-filter-search input {
		min-width: 14rem;
	}

	.propex-table-wrap {
		width: 100%;
		max-width: 100%;
		overflow-x: auto;
		overflow-y: auto;
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-s);
	}

	.propex-table {
		width: 100%;
		border-collapse: collapse;
		color: var(--text-normal);
	}

	.propex-table th,
	.propex-table td {
		padding: var(--size-4-2);
		border-bottom: 1px solid var(--background-modifier-border);
		text-align: left;
		vertical-align: top;
	}

	.propex-table thead th {
		background: var(--background-secondary);
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.propex-th {
		all: unset;
		cursor: pointer;
		color: var(--text-normal);
		font-weight: var(--font-semibold);
	}

	.propex-th:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
		border-radius: var(--radius-s);
	}

	.propex-num {
		text-align: right !important;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.propex-income {
		color: var(--color-green);
	}

	.propex-expense {
		color: var(--color-red);
	}

	.propex-actions {
		white-space: nowrap;
	}

	.propex-actions .propex-btn + .propex-btn {
		margin-left: var(--size-4-1);
	}

	.propex-btn {
		background: var(--interactive-normal);
		color: var(--text-normal);
		border: 1px solid var(--background-modifier-border);
		cursor: pointer;
	}

	.propex-empty {
		text-align: center;
		color: var(--text-muted);
	}
</style>
