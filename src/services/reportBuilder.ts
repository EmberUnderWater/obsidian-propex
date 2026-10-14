import { TFile, type App } from "obsidian";
import type PropexPlugin from "../main";
import type {
	CachedProject,
	ReportChartData,
	ReportConfig,
	TableRows,
	Transaction,
} from "../types";
import {
	aggregateBar,
	aggregateDonut,
	aggregateLine,
	applyCategoryFilter,
	buildDisplayRows,
	filterTransactionsByDate,
	hasCustomRange,
	selectByDataScope,
} from "./reportAggregates";
import {
	buildOverheadAllocation,
	materializeOverhead,
	resolveActiveProjectIds,
	type OverheadAllocationResult,
} from "./overheadAllocator";

export type ReportScope =
	| { kind: "global" }
	| { kind: "project"; project: CachedProject }
	| { kind: "missing"; reason: "not_project" | "not_found" };

export interface ReportModel {
	scope: ReportScope;
	config: ReportConfig;
	allocation: OverheadAllocationResult;
	chart: ReportChartData;
	/** Rows that feed the table (same window as the chart). */
	rows: TableRows;
	/** Spent / income shown in the header, already narrowed by `data_scope`. */
	summary: { spent: number; income: number; net: number };
	budget: number | null;
	/** Distinct categories after project/date filter (before category filter). */
	filterCategories: string[];
}

function isActiveFlag(app: App, settingsFlagKey: string, expectedValue: string) {
	const needle = expectedValue.trim().toLowerCase();
	return (filePath: string): boolean => {
		const abstract = app.vault.getAbstractFileByPath(filePath);
		if (!(abstract instanceof TFile)) return false;
		const cache = app.metadataCache.getFileCache(abstract);
		const frontmatter: Record<string, unknown> | undefined = cache?.frontmatter;
		const flag = frontmatter?.[settingsFlagKey];
		if (!needle) {
			if (flag === undefined || flag === null) return false;
			if (typeof flag === "string") return flag.trim() !== "";
			if (typeof flag === "boolean") return flag;
			if (typeof flag === "number") return flag !== 0;
			if (Array.isArray(flag)) return flag.length > 0;
			return true;
		}
		const normalized = String(flag).trim().toLowerCase();
		if (normalized === needle) return true;
		if (["true", "1", "active"].includes(needle)) {
			return ["true", "1", "active"].includes(normalized);
		}
		return false;
	};
}

export function resolveReportScope(
	config: ReportConfig,
	sourcePath: string,
	plugin: PropexPlugin,
): ReportScope {
	const ref = config.project;

	if (ref.kind === "global") return { kind: "global" };

	if (ref.kind === "self") {
		const sourceFile = plugin.app.vault.getAbstractFileByPath(sourcePath);
		const project = sourceFile instanceof TFile ? plugin.projectCache.getProjectForLegacyId(sourceFile.path) : undefined;
		if (!project) return { kind: "missing", reason: "not_project" };
		return { kind: "project", project };
	}

	const needle = ref.name.trim().toLowerCase();
	const projects = plugin.projectCache.getProjects();
	const byName = projects.find((project) => {
		return project.name.trim().toLowerCase() === needle;
	});
	if (byName) return { kind: "project", project: byName };

	return { kind: "missing", reason: "not_found" };
}

export function readBudget(app: App, project: CachedProject, budgetKey: string): number | null {
	const abstract = app.vault.getAbstractFileByPath(project.filePath);
	if (!(abstract instanceof TFile)) return null;
	const cache = app.metadataCache.getFileCache(abstract);
	const frontmatter: Record<string, unknown> | undefined = cache?.frontmatter;
	const raw = frontmatter?.[budgetKey];
	if (raw === undefined || raw === null) return null;
	if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;

	const text = typeof raw === "string" ? raw : JSON.stringify(raw);
	const value = Number(text.replace(",", "."));
	return Number.isFinite(value) && value > 0 ? value : null;
}

export {
	aggregateBar,
	aggregateDonut,
	aggregateLine,
	applyCategoryFilter,
	filterTransactionsByDate,
	selectByDataScope,
	buildDisplayRows,
	hasCustomRange,
};

function directSpendMap(transactions: Transaction[]): Map<string, number> {
	const map = new Map<string, number>();
	for (const t of transactions) {
		if (t.type !== "expense" || t.projectId === null) continue;
		map.set(t.projectId, (map.get(t.projectId) ?? 0) + t.amount);
	}
	return map;
}

export function buildReportModel(
	config: ReportConfig,
	sourcePath: string,
	plugin: PropexPlugin,
	options?: { now?: Date; categoryFilter?: string[] },
): ReportModel {
	const now = options?.now ?? new Date();
	const scope = resolveReportScope(config, sourcePath, plugin);
	const settings = plugin.dataStore.settings;
	const currency = settings.baseCurrency;

	const allProjects = plugin.projectCache.getProjects();
	const targetProjectId = scope.kind === "project" ? scope.project.name : null;

	const projectScoped: Transaction[] =
		scope.kind === "global"
			? plugin.dataStore.transactions
			: scope.kind === "project"
				? plugin.dataStore.transactions.filter(
						(t) => t.projectId === null || t.projectId.trim().toLowerCase() === scope.project.name.trim().toLowerCase(),
					)
				: [];

	const periodScoped = filterTransactionsByDate(
		projectScoped,
		{ period: config.period, range: config.range },
		now,
	);
	const filterCategories = Array.from(new Set(periodScoped.map((t) => t.category))).sort((a, b) =>
		a.localeCompare(b),
	);
	const filtered = applyCategoryFilter(periodScoped, options?.categoryFilter);

	const activeProjectIds = resolveActiveProjectIds(
		plugin.dataStore.transactions,
		allProjects,
		settings,
		isActiveFlag(plugin.app, settings.overheadActiveFlagKey, settings.overheadActiveValue),
	);

	const spend = directSpendMap(plugin.dataStore.transactions);
	const materialized = materializeOverhead(filtered, {
		mode: settings.overheadMode,
		targetProjectId,
		activeProjectIds,
		directSpendByProject: spend,
	});

	// Summary allocation (budget / totals / separate OH) on the same filtered window.
	const allocation = buildOverheadAllocation({
		transactions: filtered,
		settings,
		targetProjectId,
		activeProjectIds,
		allProjects,
	});

	let chart: ReportChartData;
	if (config.chartType === "bar") {
		chart = {
			kind: "bar",
			series: aggregateBar(
				selectByDataScope(materialized, config.dataScope),
				config.dataScope,
				config.groupBy,
				config.period,
				currency,
			),
		};
	} else if (config.chartType === "line") {
		const scoped =
			config.dataScope === "all"
				? materialized
				: selectByDataScope(materialized, config.dataScope);
		chart = {
			kind: "line",
			series: aggregateLine(scoped, config.period, currency),
		};
	} else {
		const categoryType = config.chartType;
		if (config.dataScope === "all") {
			chart = {
				kind: "category",
				chartType: categoryType,
				mode: "split",
				dataScope: "all",
				slices: [],
				pair: {
					expense: aggregateDonut(selectByDataScope(materialized, "expenses"), "expenses"),
					income: aggregateDonut(selectByDataScope(materialized, "income"), "income"),
				},
			};
		} else {
			chart = {
				kind: "category",
				chartType: categoryType,
				mode: "single",
				dataScope: config.dataScope,
				slices: aggregateDonut(selectByDataScope(materialized, config.dataScope), config.dataScope),
			};
		}
	}

	const tableSource = selectByDataScope(materialized, config.dataScope);
	const sortedRows = [...tableSource].sort((a, b) => {
		const byDate = b.date.localeCompare(a.date);
		if (byDate !== 0) return byDate;
		return b.createdAt.localeCompare(a.createdAt);
	});
	const displayRows = buildDisplayRows(sortedRows, currency);
	const rows: TableRows = {
		all: displayRows,
		expense: displayRows.filter((r) => r.type === "expense"),
		income: displayRows.filter((r) => r.type === "income"),
	};

	const rawIncome = filtered.reduce((sum, t) => (t.type === "income" ? sum + t.amount : sum), 0);
	const summary =
		config.dataScope === "income"
			? { spent: 0, income: rawIncome, net: rawIncome }
			: config.dataScope === "expenses"
				? {
						spent: allocation.totalExpense,
						income: 0,
						net: -allocation.totalExpense,
					}
				: {
						spent: allocation.totalExpense,
						income: rawIncome,
						net: rawIncome - allocation.totalExpense,
					};

	const budget =
		scope.kind === "project" ? readBudget(plugin.app, scope.project, settings.budgetFrontmatterKey) : null;

	return {
		scope,
		config,
		allocation,
		chart,
		rows,
		summary,
		budget,
		filterCategories,
	};
}
