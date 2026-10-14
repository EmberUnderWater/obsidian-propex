<script lang="ts">
	import { onDestroy } from "svelte";
	import { t } from "../../locales";

	export let categories: string[] = [];
	export let labelledBy: string | undefined = undefined;
	/** Empty set = all categories. */
	export let selected: string[] = [];

	const panelId = `propex-category-list-${Math.random().toString(36).slice(2)}`;
	let open = false;
	let root: HTMLDivElement;
	let trigger: HTMLButtonElement;

	$: selectedSet = new Set(selected);

	function toggle(category: string): void {
		if (selectedSet.has(category)) {
			selected = selected.filter((c) => c !== category);
		} else {
			selected = [...selected, category];
		}
	}

	function clearAll(): void {
		selected = [];
	}

	function onDocumentClick(event: MouseEvent): void {
		if (!root) return;
		if (!root.contains(event.target as Node)) open = false;
	}

	function onDocumentKeydown(event: KeyboardEvent): void {
		if (!open || event.key !== "Escape") return;
		open = false;
		trigger?.focus();
	}

	function detachDoc(): void {
		if (typeof document !== "undefined") {
			document.removeEventListener("click", onDocumentClick);
			document.removeEventListener("keydown", onDocumentKeydown);
		}
	}

	$: if (typeof document !== "undefined") {
		if (open) {
			document.addEventListener("click", onDocumentClick);
			document.addEventListener("keydown", onDocumentKeydown);
		} else {
			detachDoc();
		}
	}

	onDestroy(() => {
		open = false;
		detachDoc();
	});
</script>

<div class="propex-multi" bind:this={root}>
	<button
		type="button"
		class="propex-btn propex-multi-trigger"
		bind:this={trigger}
		aria-label={labelledBy ? undefined : t("filterCategory")}
		aria-labelledby={labelledBy}
		aria-expanded={open}
		aria-controls={panelId}
		on:click={() => (open = !open)}
	>
		{#if selected.length === 0}
			{t("filterAllCategories")}
		{:else}
			{t("filterSelectedCategories", { n: selected.length })}
		{/if}
	</button>

	{#if open}
		<div
			id={panelId}
			class="propex-multi-panel"
			role="group"
			aria-label={labelledBy ? undefined : t("filterCategory")}
			aria-labelledby={labelledBy}
		>
			{#if categories.length === 0}
				<div class="propex-multi-empty">{t("filterNoCategories")}</div>
			{:else}
				{#each categories as category (category)}
					<label class="propex-multi-item">
						<input
							type="checkbox"
							checked={selectedSet.has(category)}
							on:change={() => toggle(category)}
						/>
						<span>{category}</span>
					</label>
				{/each}
			{/if}
			<button type="button" class="propex-btn" on:click={clearAll}>
				{t("filterAllCategories")}
			</button>
		</div>
	{/if}
</div>

<style>
	.propex-multi {
		position: relative;
		display: inline-flex;
		flex-direction: column;
		gap: var(--size-4-1);
	}

	.propex-multi-trigger {
		min-width: 0;
		max-width: 100%;
		text-align: left;
	}

	.propex-multi-panel {
		position: absolute;
		z-index: 20;
		top: 100%;
		left: 0;
		width: min(14rem, calc(100vw - 2rem));
		max-width: calc(100vw - 2rem);
		max-height: 280px;
		overflow: auto;
		padding: var(--size-4-2);
		display: flex;
		flex-direction: column;
		gap: var(--size-4-1);
		background: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-s);
		box-shadow: var(--shadow-s);
	}

	.propex-multi-item {
		display: flex;
		align-items: center;
		gap: var(--size-4-2);
		color: var(--text-normal);
		font-size: var(--font-ui-small);
		cursor: pointer;
	}

	.propex-multi-empty {
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}
</style>
