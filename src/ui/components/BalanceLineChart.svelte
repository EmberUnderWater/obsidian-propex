<script lang="ts">
	import { onDestroy, onMount, tick } from "svelte";
	import type { Chart } from "chart.js";
	import { createBalanceLine } from "../../charts/chartFactory";
	import type { LineSeries } from "../../types";
	import { t } from "../../locales";

	export let series: LineSeries;
	export let summary = "";
	const summaryId = `propex-line-summary-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
		if (series.points.length === 0 || !canvas) {
			destroyChart();
			return;
		}

		const next = JSON.stringify(series.points);
		if (chart && signature === next) {
			chart.data.labels = series.points.map((p) => p.label);
			const dataset = chart.data.datasets[0];
			if (dataset) dataset.data = series.points.map((p) => p.net);
			chart.update();
			return;
		}

		destroyChart();
		chart = createBalanceLine(canvas, wrap, series, currency, t("reportNet"));
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
	{#if series.points.length === 0}
		<div class="propex-chart-empty">{emptyLabel}</div>
	{:else}
		<div class="propex-chart-canvas">
			<canvas bind:this={canvas} aria-label={t("chartAriaLabel")} aria-describedby={summaryId}></canvas>
				<span id={summaryId} class="sr-only">{summary}</span>
		</div>
	{/if}
</div>

<style>
	.propex-chart {
		width: 100%;
		min-height: 220px;
	}

	.propex-chart-canvas {
		position: relative;
		width: 100%;
		height: 280px;
	}

	.propex-chart-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 160px;
		color: var(--text-muted);
	}
</style>
