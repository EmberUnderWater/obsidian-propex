import {
	Chart,
	ArcElement,
	BarController,
	BarElement,
	CategoryScale,
	DoughnutController,
	Filler,
	Legend,
	LineController,
	LineElement,
	LinearScale,
	PointElement,
	RadialLinearScale,
	PolarAreaController,
	Tooltip,
} from "chart.js";
import type { ChartConfiguration } from "chart.js";
import type { BarSeries, CategoryChartType, DonutSlice, LineSeries } from "../types";
import { getChartPalette, readCssVar } from "../utils/chartTheme";

Chart.register(
	DoughnutController,
	ArcElement,
	BarController,
	BarElement,
	LineController,
	LineElement,
	PointElement,
	CategoryScale,
	LinearScale,
	RadialLinearScale,
	PolarAreaController,
	Filler,
	Tooltip,
	Legend,
);

export type { DonutSlice };

function alpha(color: string, opacity: number): string {
	const hex = color.trim();
	if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
		const full =
			hex.length === 4
				? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
				: hex;
		const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
			.toString(16)
			.padStart(2, "0");
		return `${full}${a}`;
	}
	if (/^#([0-9a-f]{8})$/i.test(hex)) return hex;
	if (/^rgb\(/i.test(hex)) {
		return hex.replace(/^rgb/i, "rgba").replace(/\)$/i, ", " + String(opacity) + ")");
	}
	return hex;
}

function sliceTooltip(
	currency: string,
	labelFormatter: (value: number, percent: string) => string,
) {
	return {
		callbacks: {
			// Chart.js tooltip item shape differs per controller; keep this tolerant.
			label(context: {
				label?: string;
				parsed: unknown;
				dataset: { data: unknown[] };
			}) {
				const parsed = context.parsed as number | { y?: number } | undefined;
				const raw =
					typeof parsed === "number" ? parsed : Number((parsed)?.y) || 0;
				const value = Number(raw) || 0;
				const data = context.dataset.data as number[];
				const total = data.reduce((sum, n) => sum + (Number(n) || 0), 0);
				const percent = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
				return `${context.label ?? ""}: ${labelFormatter(value, percent)} ${currency}`.trim();
			},
		},
	};
}

export function createCategoryChart(
	type: CategoryChartType,
	canvas: HTMLCanvasElement,
	host: HTMLElement,
	items: DonutSlice[],
	currency: string,
	labelFormatter: (value: number, percent: string) => string,
	paletteOverride?: string[],
): Chart {
	const palette = paletteOverride ?? getChartPalette(host, items.length);
	const textColor = readCssVar(host, "--text-muted", "#888");

	if (type === "polarArea") {
		const config: ChartConfiguration<"polarArea"> = {
			type: "polarArea",
			data: {
				labels: items.map((item) => item.category),
				datasets: [
					{
						label: "",
						data: items.map((item) => item.amount),
						backgroundColor: palette.map((c) => alpha(c, 0.55)),
						borderColor: palette.map(() => "transparent"),
						borderWidth: 0,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						position: "bottom",
						labels: { color: textColor, boxWidth: 12, padding: 12 },
					},
					tooltip: sliceTooltip(currency, labelFormatter),
				},
			},
		};
		return new Chart(canvas, config);
	}

	const cutout = type === "pie" ? "0%" : type === "doughnut" ? "65%" : "62%";
	const config: ChartConfiguration<"doughnut"> = {
		type: "doughnut",
		data: {
			labels: items.map((item) => item.category),
			datasets: [
				{
					data: items.map((item) => item.amount),
					backgroundColor: palette,
					// Avoid white stroke on first paint / theme change.
					borderColor: "transparent",
					borderWidth: 0,
					hoverBorderColor: "transparent",
					hoverBorderWidth: 0,
					hoverOffset: 6,
				},
			],
		},
		options: {
			cutout,
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					position: "bottom",
					labels: { color: textColor, boxWidth: 12, padding: 12 },
				},
				tooltip: sliceTooltip(currency, labelFormatter),
			},
		},
	};

	return new Chart(canvas, config);
}

export function createCompareBar(
	canvas: HTMLCanvasElement,
	host: HTMLElement,
	series: BarSeries,
	currency: string,
	labels: { income: string; expense: string },
): Chart {
	const textColor = readCssVar(host, "--text-muted", "#888");
	const gridColor = readCssVar(host, "--background-modifier-border", "#ccc");
	const incomeColor = readCssVar(host, "--color-green", "#2ea043");
	const expenseColor = readCssVar(host, "--color-red", "#d94848");
	const palette = getChartPalette(host, Math.max(series.categories.length, 1));

	const datasets: Array<{
		label: string;
		data: number[];
		backgroundColor: string | string[];
		stack?: string;
	}> = [];

	if (series.stackedByCategory) {
		const source =
			series.groups.some((g) => g.expenseByCategory.length > 0) &&
			!series.groups.some((g) => g.incomeByCategory.length > 0)
				? "expense"
				: "income";
		const cats =
			series.categories.length > 0
				? series.categories
				: Array.from(
						new Set(
							series.groups.flatMap((g) =>
								(source === "expense" ? g.expenseByCategory : g.incomeByCategory).map(
									(item) => item.category,
								),
							),
						),
					);

		cats.forEach((category, index) => {
			datasets.push({
				label: category,
				data: series.groups.map((g) => {
					const list = source === "expense" ? g.expenseByCategory : g.incomeByCategory;
					return list.find((item) => item.category === category)?.amount ?? 0;
				}),
				backgroundColor: palette[index % palette.length] ?? "",
				stack: source,
			});
		});
	} else {
		const showIncome = series.groups.some((g) => g.income > 0);
		const showExpense = series.groups.some((g) => g.expense > 0);
		if (showIncome) {
			datasets.push({
				label: labels.income,
				data: series.groups.map((g) => g.income),
				backgroundColor: incomeColor,
			});
		}
		if (showExpense || !showIncome) {
			datasets.push({
				label: labels.expense,
				data: series.groups.map((g) => g.expense),
				backgroundColor: expenseColor,
			});
		}
	}

	const grandTotal = series.groups.reduce((sum, g) => sum + g.income + g.expense, 0);

	const config: ChartConfiguration<"bar"> = {
		type: "bar",
		data: {
			labels: series.groups.map((g) => g.label),
			datasets,
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					position: "bottom",
					labels: { color: textColor, boxWidth: 12, padding: 12 },
				},
				tooltip: {
					callbacks: {
						label(context) {
							const value = Number(context.parsed.y) || 0;
							const percent = grandTotal > 0 ? ((value / grandTotal) * 100).toFixed(1) : "0.0";
							return `${context.dataset.label ?? ""}: ${value.toFixed(2)} (${percent}%) ${currency}`.trim();
						},
						afterBody(items) {
							const first = items[0];
							if (!first) return [];
							const group = series.groups[first.dataIndex];
							if (!group) return [];
							const lines: string[] = [];
							const exp = group.expenseByCategory;
							const inc = group.incomeByCategory;
							if (exp.length > 0) {
								lines.push(`— ${labels.expense} —`);
								for (const item of exp.slice(0, 8)) {
									lines.push(`${item.category}: ${item.amount.toFixed(2)}`);
								}
								if (exp.length > 8) lines.push(`… +${exp.length - 8}`);
							}
							if (inc.length > 0) {
								lines.push(`— ${labels.income} —`);
								for (const item of inc.slice(0, 8)) {
									lines.push(`${item.category}: ${item.amount.toFixed(2)}`);
								}
								if (inc.length > 8) lines.push(`… +${inc.length - 8}`);
							}
							return lines;
						},
					},
				},
			},
			scales: {
				x: {
					stacked: series.stackedByCategory,
					ticks: { color: textColor },
					grid: { color: gridColor },
				},
				y: {
					stacked: series.stackedByCategory,
					ticks: { color: textColor },
					grid: { color: gridColor },
				},
			},
		},
	};

	return new Chart(canvas, config);
}

export function createBalanceLine(
	canvas: HTMLCanvasElement,
	host: HTMLElement,
	series: LineSeries,
	currency: string,
	netLabel: string,
): Chart {
	const textColor = readCssVar(host, "--text-muted", "#888");
	const gridColor = readCssVar(host, "--background-modifier-border", "#ccc");
	const lineColor = readCssVar(host, "--color-blue", "#4f8cc9");

	const labels = series.points.map((p) => p.label);
	const data = series.points.map((p) => p.net);

	const config: ChartConfiguration<"line"> = {
		type: "line",
		data: {
			labels,
			datasets: [
				{
					label: netLabel,
					data,
					borderColor: lineColor,
					backgroundColor: alpha(lineColor, 0.18),
					fill: true,
					tension: 0.15,
					pointRadius: series.points.length === 1 ? 6 : 3,
					pointHoverRadius: 5,
					showLine: true,
					spanGaps: true,
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					display: false,
				},
				tooltip: {
					callbacks: {
						label(context) {
							const value = Number(context.parsed.y) || 0;
							const idx = context.dataIndex;
							const point = series.points[idx];
							const delta = point ? point.delta : 0;
							const sign = delta >= 0 ? "+" : "";
							return `${netLabel}: ${value.toFixed(2)} ${currency} (${sign}${delta.toFixed(2)})`;
						},
					},
				},
			},
			scales: {
				x: {
					ticks: { color: textColor, maxRotation: 45, minRotation: 0 },
					grid: { color: gridColor },
				},
				y: {
					ticks: {
						color: textColor,
						callback(value) {
							return `${value}`;
						},
					},
					grid: { color: gridColor },
				},
			},
		},
	};

	return new Chart(canvas, config);
}
