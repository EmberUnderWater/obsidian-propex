<script lang="ts">
	import { onDestroy, onMount, tick } from "svelte";
	import type { Chart } from "chart.js";
	import { createCompareBar } from "../../charts/chartFactory";
	import type { BarSeries } from "../../types";
	import { t } from "../../locales";

	export let series: BarSeries;
	export let summary = "";
	const summaryId = `propex-bar-summary-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
		const empty = series.groups.length === 0;
		if (empty || !canvas) {
			destroyChart();
			return;
		}

		const next = JSON.stringify(series);
		if (chart && signature === next) {
			chart.update();
			return;
		}

		destroyChart();
		chart = createCompareBar(canvas, wrap, series, currency, {
			income: t("reportIncome"),
			expense: t("reportSpent"),
		});
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

	$: series, currency, canvas, void refresh();
</script>

<div class="propex-chart" bind:this={wrap}>
	{#if series.groups.length === 0}
		<div class="propex-chart-empty">{emptyLabel}</div>
	{:else}
		<div class="propex-canvas-box">
			<canvas bind:this={canvas} aria-label={t("chartAriaLabel")} aria-describedby={summaryId}></canvas>
		</div>
		<span id={summaryId} class="propex-chart-summary">{summary}</span>
	{/if}
</div>

<style>
	.propex-chart {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		height: auto;
		max-height: none;
		overflow: visible;
	}

	.propex-canvas-box {
		position: relative;
		flex: 0 0 260px;
		width: 100%;
		height: 260px;
	}

	.propex-chart-summary {
		position: static;
		width: auto;
		height: auto;
		overflow: visible;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}

	.propex-chart-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 160px;
		color: var(--text-muted);
	}
</style>
