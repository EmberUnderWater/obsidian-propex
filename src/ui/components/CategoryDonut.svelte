<script lang="ts">
	import { onDestroy, onMount, tick } from "svelte";
	import type { Chart } from "chart.js";
	import { createCategoryChart } from "../../charts/chartFactory";
	import type { CategoryChartType, DonutSlice } from "../../types";
	import { t } from "../../locales";

	export let chartType: CategoryChartType = "donut";
	export let summary = "";
	const summaryId = `propex-category-summary-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	export let items: DonutSlice[] = [];
	export let currency = "";
	export let emptyLabel = "—";

	let wrap: HTMLDivElement;
	let canvas: HTMLCanvasElement | undefined;
	let chart: Chart | undefined;
	let observer: ResizeObserver | undefined;
	let mounted = false;
	let signature = "";

	function destroyChart(): void {
		chart?.destroy();
		chart = undefined;
		signature = "";
	}

	function render(): void {
		if (!mounted || !wrap) return;
		if (items.length === 0 || !canvas) {
			destroyChart();
			return;
		}

		const next = JSON.stringify([chartType, items]);
		if (chart && signature === next) return;

		destroyChart();
		chart = createCategoryChart(
			chartType,
			canvas,
			wrap,
			items,
			currency,
			(value, percent) => `${value.toFixed(2)} (${percent}%)`,
		);
		signature = next;
	}

	async function refresh(): Promise<void> {
		await tick();
		render();
	}

	onMount(() => {
		mounted = true;
		observer = new ResizeObserver(() => chart?.resize());
		observer.observe(wrap);
		void refresh();
		return () => {
			observer?.disconnect();
			destroyChart();
		};
	});

	onDestroy(() => {
		mounted = false;
		observer?.disconnect();
		destroyChart();
	});

	$: items, currency, chartType, canvas, void refresh();
</script>

<div class="propex-donut" bind:this={wrap}>
	{#if items.length === 0}
		<div class="propex-donut-empty">{emptyLabel}</div>
	{:else}
		<div class="propex-donut-canvas">
			<canvas bind:this={canvas} aria-label={t("chartAriaLabel")} aria-describedby={summaryId}></canvas>
				<span id={summaryId} class="sr-only">{summary}</span>
		</div>
	{/if}
</div>

<style>
	.propex-donut {
		width: 100%;
		min-height: 220px;
	}

	.propex-donut-canvas {
		position: relative;
		width: 100%;
		height: 280px;
	}

	.propex-donut-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 160px;
		color: var(--text-muted);
	}
</style>
