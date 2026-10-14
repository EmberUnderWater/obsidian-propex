<script lang="ts">
	export let budget: number | null = null;
	export let spent = 0;
	export let currency = "";
	export let budgetLabel = "Budget";
	export let spentLabel = "Spent";
	export let noBudgetLabel = "No budget";

	$: ratio = budget && budget > 0 ? Math.min(spent / budget, 1) : 0;
	$: percent = budget && budget > 0 ? Math.min((spent / budget) * 100, 999) : 0;
	$: barColor =
		percent >= 100
			? "var(--color-red)"
			: percent >= 70
				? "var(--color-orange)"
				: "var(--color-green)";
</script>

<div class="propex-budget">
	{#if budget === null || budget <= 0}
		<div class="propex-budget-empty">{noBudgetLabel}</div>
	{:else}
		<div class="propex-budget-row">
			<span>{budgetLabel}: {budget.toFixed(2)} {currency}</span>
			<span>{spentLabel}: {spent.toFixed(2)} {currency} ({percent.toFixed(1)}%)</span>
		</div>
		<div class="propex-budget-track">
			<div class="propex-budget-fill" style="width: {(ratio * 100).toFixed(2)}%; background: {barColor}"></div>
		</div>
	{/if}
</div>

<style>
	.propex-budget {
		display: flex;
		flex-direction: column;
		gap: var(--size-4-2);
	}

	.propex-budget-row {
		display: flex;
		justify-content: space-between;
		gap: var(--size-4-2);
		color: var(--text-normal);
		font-size: var(--font-ui-small);
	}

	.propex-budget-track {
		width: 100%;
		height: 10px;
		border-radius: var(--radius-s);
		background: var(--background-modifier-border);
		overflow: hidden;
	}

	.propex-budget-fill {
		height: 100%;
		border-radius: var(--radius-s);
	}

	.propex-budget-empty {
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}
</style>
