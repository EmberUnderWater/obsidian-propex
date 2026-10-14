import {
	createDefaultReportConfig,
	defaultDataScopeFor,
	type ChartType,
	type DataScope,
	type DateRange,
	type PropexBlockProjectRef,
	type ReportConfig,
	type ReportGroupBy,
	type ReportPeriod,
} from "../types/report";

function readValue(source: string, key: string): string | null {
	const pattern = new RegExp(`^\\s*${key}\\s*[:=]\\s*(.+?)\\s*$`, "i");
	const body = source.replace(/^\uFEFF/, "");
	for (const line of body.split(/\r?\n/)) {
		const match = line.match(pattern);
		if (match) return (match[1] ?? "").trim();
	}
	return null;
}

function unquote(raw: string): string {
	const quoted = raw.match(/^(["'])(.*)\1$/);
	return quoted ? (quoted[2] ?? "").trim() : raw;
}

function normalizeToken(raw: string): string {
	return unquote(raw).trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function parseProject(raw: string | null): PropexBlockProjectRef {
	if (raw === null) return { kind: "self" };
	const value = unquote(raw);
	const lowered = value.toLowerCase();
	if (lowered === "self") return { kind: "self" };
	if (lowered === "global") return { kind: "global" };
	return value ? { kind: "name", name: value } : { kind: "self" };
}

function parseEnum<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
	if (raw === null) return fallback;
	const token = normalizeToken(raw);
	for (const item of allowed) {
		if (normalizeToken(item) === token) return item;
	}
	return fallback;
}

function parseDateBound(raw: string | null): string | null {
	if (raw === null) return null;
	const value = unquote(raw).trim();
	if (!value || value === "null" || value === "~") return null;
	return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseBool(raw: string | null, fallback: boolean): boolean {
	if (raw === null) return fallback;
	const token = normalizeToken(raw);
	if (["true", "1", "yes", "on"].includes(token)) return true;
	if (["false", "0", "no", "off"].includes(token)) return false;
	return fallback;
}

function parseIntClamp(raw: string | null, fallback: number, min: number, max: number): number {
	if (raw === null) return fallback;
	const value = Number(unquote(raw).trim());
	if (!Number.isFinite(value)) return fallback;
	const n = Math.trunc(value);
	if (n < min || n > max) return fallback;
	return n;
}

const CHART_TYPES = ["donut", "doughnut", "pie", "bar", "line", "polarArea"] as const;
const PERIODS = ["all", "day", "week", "month", "year"] as const;
const SCOPES = ["expenses", "income", "all"] as const;
const GROUP_BY = ["category", "period", "week"] as const;

/**
 * `data_scope` omitted → depends on chart_type.
 * Explicit value always wins. Radials with `all` use split-render (two canvases).
 */
export function resolveDataScope(
	explicit: DataScope | null,
	chartType: ChartType,
): DataScope {
	if (explicit !== null) return explicit;
	return defaultDataScopeFor(chartType);
}

/**
 * Parses a ```propex block. Unknown keys ignored; invalid values → defaults. Never throws.
 */
export function parsePropexBlock(source: string): ReportConfig {
	const defaults = createDefaultReportConfig();

	const rawChart = readValue(source, "chart_type");
	const rawScope = readValue(source, "data_scope");

	const chartType = parseEnum(rawChart, CHART_TYPES, defaults.chartType);
	let explicitScope: DataScope | null = null;
	if (rawScope !== null) {
		const token = normalizeToken(rawScope);
		const hit = SCOPES.find((item) => normalizeToken(item) === token);
		explicitScope = hit ?? null;
	}

	const config: ReportConfig = {
		project: parseProject(readValue(source, "project")),
		chartType,
		dataScope: resolveDataScope(explicitScope, chartType),
		period: parseEnum(readValue(source, "period"), PERIODS, defaults.period),
		range: {
			start: parseDateBound(readValue(source, "date_start")),
			end: parseDateBound(readValue(source, "date_end")),
		},
		groupBy: parseEnum(readValue(source, "group_by"), GROUP_BY, defaults.groupBy),
		showTable: parseBool(readValue(source, "show_table"), defaults.showTable),
		tableLimit: parseIntClamp(readValue(source, "table_limit"), defaults.tableLimit, 0, 200),
	};

	return config;
}

export type { ChartType, DataScope, DateRange, ReportConfig, ReportGroupBy, ReportPeriod };
