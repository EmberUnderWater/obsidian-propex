export type PropexBlockProjectRef =
	| { kind: "self" }
	| { kind: "global" }
	| { kind: "name"; name: string };

export type ChartType = "donut" | "doughnut" | "pie" | "bar" | "line" | "polarArea";
export type DataScope = "expenses" | "income" | "all";
export type ReportPeriod = "all" | "day" | "week" | "month" | "year";
export type ReportGroupBy = "category" | "period" | "week";

export interface DateRange {
	/** YYYY-MM-DD inclusive; null = open end. */
	start: string | null;
	end: string | null;
}

export interface ReportConfig {
	project: PropexBlockProjectRef;
	chartType: ChartType;
	dataScope: DataScope;
	period: ReportPeriod;
	/** Absolute date range; when either bound is set it overrides `period`. */
	range: DateRange;
	groupBy: ReportGroupBy;
	showTable: boolean;
	tableLimit: number;
}

export function createDefaultReportConfig(): ReportConfig {
	return {
		project: { kind: "self" },
		chartType: "donut",
		// Resolved per chart_type in parsePropexBlock; this is only a type fallback.
		dataScope: "all",
		period: "all",
		range: { start: null, end: null },
		groupBy: "period",
		showTable: true,
		tableLimit: 5,
	};
}

/** Default `data_scope` when the key is omitted. */
export function defaultDataScopeFor(chartType: ChartType): DataScope {
	// Line is Net (income − expense); bar compares series; radials split-render.
	return "all";
}

export interface DonutSlice {
	category: string;
	amount: number;
}

export interface CategoryAmount {
	category: string;
	amount: number;
}

export interface BarGroup {
	label: string;
	income: number;
	expense: number;
	incomeByCategory: CategoryAmount[];
	expenseByCategory: CategoryAmount[];
}

export interface BarSeries {
	groups: BarGroup[];
	currency: string;
	stackedByCategory: boolean;
	categories: string[];
}

export interface LinePoint {
	label: string;
	net: number;
	delta: number;
}

export interface LineSeries {
	points: LinePoint[];
	currency: string;
}

export type CategoryChartType = "donut" | "doughnut" | "pie" | "polarArea";

export interface CategoryPair {
	expense: DonutSlice[];
	income: DonutSlice[];
}

export type ReportChartData =
	| {
			kind: "category";
			chartType: CategoryChartType;
			/** `split` = two canvases (expense + income) when data_scope is `all`. */
			mode: "single" | "split";
			dataScope: DataScope;
			/** Populated when mode is `single`. */
			slices: DonutSlice[];
			/** Populated when mode is `split`. */
			pair?: CategoryPair;
	  }
	| { kind: "bar"; series: BarSeries }
	| { kind: "line"; series: LineSeries };

/** Row for the report transaction table (real or virtual overhead share). */
export interface DisplayRow {
	id: string;
	date: string;
	type: "expense" | "income";
	/** Amount already scaled by overhead fraction for virtual rows. */
	amount: number;
	currency: string;
	projectId: string | null;
	category: string;
	comment: string;
	/** Set on virtual overhead share rows (0..1). */
	overheadFraction?: number;
	sourceId: string;
}

/** Table rows split by type (used for the spent/income count chips). */
export interface TableRows {
	all: DisplayRow[];
	expense: DisplayRow[];
	income: DisplayRow[];
}
