<script lang="ts">
	import { Notice } from "obsidian";
	import { onDestroy, onMount } from "svelte";
	import { t } from "../../locales";
	import type PropexPlugin from "../../main";
	import type { DisplayRow } from "../../types";
	import { parsePropexBlock } from "../../services/blockParser";
	import { buildReportModel, type ReportModel } from "../../services/reportBuilder";
	import BudgetProgress from "./BudgetProgress.svelte";
	import CategoryDonut from "./CategoryDonut.svelte";
	import CategoryMultiSelect from "./CategoryMultiSelect.svelte";
	import CompareBarChart from "./CompareBarChart.svelte";
	import BalanceLineChart from "./BalanceLineChart.svelte";

	export let plugin: PropexPlugin;
	export let source = "";
	export let sourcePath = "";

	let model: ReportModel | null = null;
	let unsubscribe: (() => void) | undefined;
	let selectedCategories: string[] = [];
	let mounted = false;
	let tableExpanded = false;

	function refresh(): void {
		const config = parsePropexBlock(source);
		model = buildReportModel(config, sourcePath, plugin, {
			categoryFilter: selectedCategories,
		});
	}

	function projectNameOf(row: DisplayRow): string {
		if (row.projectId === null) return t("overheadOption");
		const cached = plugin.projectCache.getProject(row.projectId);
		return cached?.name ?? row.projectId;
	}

	function signedAmount(row: DisplayRow): number {
		return row.type === "income" ? row.amount : -row.amount;
	}

	function formatAmount(value: number): string {
		const sign = value > 0 ? "+" : value < 0 ? "-" : "";
		return `${sign}${Math.abs(value).toFixed(2)} ${currency}`.trim();
	}

	function chartTitle(m: ReportModel): string {
		if (m.chart.kind === "line") return t("reportBalanceDynamics");
		if (m.chart.kind === "bar") return t("reportIncomeVsExpense");
		if (m.chart.kind === "category" && m.chart.mode === "split") return t("reportIncomeAndExpense");
		return m.chart.dataScope === "income" ? t("reportIncomeByCategory") : t("reportExpensesByCategory");
	}

	function categorySummary(label: string, amount: number, count: number): string {
		return t("chartSummaryCategories", { label, amount: amount.toFixed(2), currency, count });
	}

	function ohBadge(fraction: number | undefined): string {
		if (typeof fraction !== "number") return "";
		if (Math.abs(fraction - 1) < 1e-9) return "OH";
		if (Math.abs(fraction - 0.5) < 1e-9) return "OH ½";
		const pct = Math.round(fraction * 100);
		return `OH ${pct}%`;
	}

	function showOverheadDetails(): void {
		new Notice(t("reportOhShare"));
	}

	/** Collapsed table: `limit` caps the total number of rows. */
	function collapsedRows(m: ReportModel, limit: number): DisplayRow[] {
		if (limit === 0 || tableExpanded) return m.rows.all;
		return m.rows.all.slice(0, limit);
	}

	onMount(() => {
		mounted = true;
		refresh();
		const unsubData = plugin.dataStore.onChange(refresh);
		const unsubProjects = plugin.projectCache.onChange(refresh);
		unsubscribe = () => {
			unsubData();
			unsubProjects();
		};
	});

	onDestroy(() => {
		mounted = false;
		unsubscribe?.();
	});

	$: if (mounted) selectedCategories, refresh();

	$: currency = plugin.dataStore.settings.baseCurrency;
	$: availableCategories = model?.filterCategories ?? [];
	$: overheadSeparate = model?.allocation.overheadSeparate ?? 0;
	$: limit = model?.config.tableLimit ?? 5;
	$: rowsVisible = model ? collapsedRows(model, limit) : [];
	$: totalRows = model?.rows.all.length ?? 0;
	$: hiddenCount = Math.max(0, totalRows - rowsVisible.length);
	$: showTable = model?.config.showTable ?? true;
	$: summary = model?.summary ?? { spent: 0, income: 0, net: 0 };
</script>

<div class="propex-report">
	{#if !model}
		<div class="propex-report-empty"></div>
	{:else if model.scope.kind === "missing"}
		<div class="propex-report-empty">
			{model.scope.reason === "not_found" ? t("reportProjectNotFound") : t("reportNotAProject")}
		</div>
	{:else}
		{#if model.scope.kind === "project"}
			<div class="propex-report-title">{model.scope.project.name}</div>
		{/if}

		<div class="propex-report-filter">
			<span>{t("filterCategory")}</span>
			<CategoryMultiSelect categories={availableCategories} bind:selected={selectedCategories} />
		</div>

		<div class="propex-report-stats">
			{#if model.config.dataScope !== "income"}
				<span>{t("reportSpent")}: {summary.spent.toFixed(2)} {currency}</span>
			{/if}
			{#if model.config.dataScope !== "expenses"}
				<span>{t("reportIncome")}: {summary.income.toFixed(2)} {currency}</span>
			{/if}
			<span>
				{t("reportNet")}:
				{summary.net.toFixed(2)}
				{currency}
			</span>
		</div>

		{#if overheadSeparate > 0 && model.config.dataScope !== "income"}
			<div class="propex-report-overhead">
				{t("reportOverhead")}: {overheadSeparate.toFixed(2)} {currency}
				<div class="propex-report-note">{t("reportOverheadNote")}</div>
			</div>
		{/if}

		<section class="propex-report-section">
			<h4>{chartTitle(model)}</h4>
			{#if model.chart.kind === "category" && model.chart.mode === "split" && model.chart.pair}
				<div class="propex-split-charts">
					<section class="propex-split-item">
						<h4>{t("reportExpensesByCategory")}</h4>
						<CategoryDonut
							chartType={model.chart.chartType}
							items={model.chart.pair.expense}
							summary={categorySummary(
								t("reportExpensesByCategory"),
								model.chart.pair.expense.reduce((sum, item) => sum + item.amount, 0),
								model.chart.pair.expense.length,
							)}
							{currency}
							emptyLabel={t("emptyLedger")}
						/>
					</section>
					<section class="propex-split-item">
						<h4>{t("reportIncomeByCategory")}</h4>
						<CategoryDonut
							chartType={model.chart.chartType}
							items={model.chart.pair.income}
							summary={categorySummary(
								t("reportIncomeByCategory"),
								model.chart.pair.income.reduce((sum, item) => sum + item.amount, 0),
								model.chart.pair.income.length,
							)}
							{currency}
							emptyLabel={t("emptyLedger")}
						/>
					</section>
				</div>
			{:else if model.chart.kind === "category"}
				<CategoryDonut
					chartType={model.chart.chartType}
					items={model.chart.slices}
					summary={categorySummary(
						model.chart.dataScope === "income" ? t("reportIncome") : t("reportSpent"),
						model.chart.slices.reduce((sum, item) => sum + item.amount, 0),
						model.chart.slices.length,
					)}
					{currency}
					emptyLabel={t("emptyLedger")}
				/>
			{:else if model.chart.kind === "bar"}
				<CompareBarChart
					series={model.chart.series}
					summary={t("chartSummaryCategories", {
						label: t("reportIncomeVsExpense"),
						amount: summary.net.toFixed(2),
						currency,
						count: model.chart.series.groups.length,
					})}
					{currency}
					emptyLabel={t("emptyLedger")}
				/>
			{:else}
				<BalanceLineChart
					series={model.chart.series}
					summary={t("chartSummaryNet", { amount: summary.net.toFixed(2), currency })}
					{currency}
					emptyLabel={t("emptyLedger")}
				/>
			{/if}
		</section>

		{#if model.budget !== null}
			<BudgetProgress
				budget={model.budget}
				spent={summary.spent}
				{currency}
				budgetLabel={t("reportBudget")}
				spentLabel={t("reportSpent")}
				noBudgetLabel={t("reportNoBudget")}
			/>
		{/if}

		{#if showTable}
			<section class="propex-report-section">
				<div class="propex-report-table-head">
					<h4>{t("reportRecent")}</h4>
					{#if totalRows > rowsVisible.length || tableExpanded}
						<button class="propex-link" type="button" on:click={() => (tableExpanded = !tableExpanded)}>
							{tableExpanded
								? t("reportTableCollapse")
								: t("reportTableExpand", { n: hiddenCount })}
						</button>
					{/if}
				</div>

				<div class="propex-chips">
					{#if model.config.dataScope !== "income"}
						<span class="propex-chip">{t("reportSpent")}: {model.rows.expense.length}</span>
					{/if}
					{#if model.config.dataScope !== "expenses"}
						<span class="propex-chip">{t("reportIncome")}: {model.rows.income.length}</span>
					{/if}
					{#if model.config.dataScope === "all"}
						<span class="propex-chip">{t("totalLabel")}: {totalRows}</span>
					{/if}
				</div>

				{#if rowsVisible.length === 0}
					<div class="propex-report-empty">{t("emptyLedger")}</div>
				{:else}
					<div class="propex-report-table-wrap">
						<table class="propex-report-table">
							<thead>
								<tr>
									<th>{t("colDate")}</th>
									<th>{t("colProject")}</th>
									<th>{t("colCategory")}</th>
									<th>{t("colComment")}</th>
									<th class="propex-num">{t("colAmount")}</th>
								</tr>
							</thead>
							<tbody>
								{#each rowsVisible as row (row.id)}
									<tr class:propex-row-oh={row.overheadFraction !== undefined}>
										<td>{row.date}</td>
										<td>
											{projectNameOf(row)}
											{#if row.overheadFraction !== undefined}
												<button
													class="propex-oh-badge"
													type="button"
													aria-label={t("overheadNoticeLabel")}
													title={t("reportOhShare")}
													on:click={showOverheadDetails}
												>
													{ohBadge(row.overheadFraction)}
												</button>
											{/if}
										</td>
										<td>{row.category}</td>
										<td>{row.comment}</td>
										<td
											class="propex-num"
											class:propex-income={row.type === "income"}
											class:propex-expense={row.type === "expense"}
										>
											{formatAmount(signedAmount(row))}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if !tableExpanded && hiddenCount > 0}
						<div class="propex-report-note">{t("reportTableMore", { n: hiddenCount })}</div>
					{/if}
				{/if}
			</section>
		{/if}
	{/if}
</div>

<style>
	.propex-report {
		display: flex;
		flex-direction: column;
		gap: var(--size-4-3);
		padding: var(--size-4-2);
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		background: var(--background-primary);
		color: var(--text-normal);
	}

	.propex-report-title {
		font-size: var(--font-ui-large);
		font-weight: var(--font-semibold);
	}

	.propex-report-stats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-4-3);
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}

	.propex-split-charts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-4-3);
	}

	.propex-split-item {
		flex: 1 1 280px;
		min-width: 260px;
	}

	.propex-split-item h4 {
		margin: 0 0 var(--size-4-2);
		font-size: var(--font-ui-small);
		color: var(--text-muted);
	}

	.propex-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-4-1);
		margin-bottom: var(--size-4-2);
	}

	.propex-chip {
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--background-secondary);
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	.propex-report-overhead {
		padding: var(--size-4-2);
		border-radius: var(--radius-s);
		background: var(--background-secondary);
	}

	.propex-report-note {
		margin-top: var(--size-4-1);
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	.propex-report-section h4 {
		margin: 0 0 var(--size-4-2);
		font-size: var(--font-ui-small);
		color: var(--text-muted);
	}

	.propex-report-table-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--size-4-2);
	}

	.propex-link {
		border: none;
		background: transparent;
		color: var(--text-accent);
		cursor: pointer;
		font-size: var(--font-ui-smaller);
		padding: 0;
	}

	.propex-report-filter {
		display: flex;
		flex-direction: column;
		gap: var(--size-4-1);
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}

	.propex-report-table-wrap {
		width: 100%;
		max-width: 100%;
		overflow-x: auto;
	}

	.propex-report-table {
		width: 100%;
		min-width: 36rem;
		border-collapse: collapse;
		font-size: var(--font-ui-small);
	}

	.propex-report-table th,
	.propex-report-table td {
		padding: var(--size-4-1);
		border-bottom: 1px solid var(--background-modifier-border);
		text-align: left;
	}

	.propex-row-oh {
		color: var(--text-muted);
		font-style: italic;
	}

	.propex-oh-badge {
		display: inline-block;
		margin-left: 4px;
		padding: 0 4px;
		border-radius: 4px;
		background: var(--background-secondary);
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
		font-style: normal;
		font-weight: var(--font-semibold);
	}

	.propex-num {
		text-align: right !important;
		font-variant-numeric: tabular-nums;
	}

	.propex-income {
		color: var(--color-green);
	}

	.propex-expense {
		color: var(--color-red);
	}

	.propex-report-empty {
		color: var(--text-muted);
		padding: var(--size-4-2);
	}
</style>
