import { getDefaultCategories, getLocale } from "../locales";

export type ProjectDetectionMode = "frontmatter" | "folder";
export type ProjectNameSource = "basename" | "frontmatter";
export type OverheadMode = "separate" | "split_equally" | "proportional";
export type OverheadActiveCriteria = "all_cached" | "period_transactions" | "frontmatter_flag";
export type CsvSeparator = "," | ";";

export interface PropexSettings {
	projectDetectionMode: ProjectDetectionMode;
	/** Frontmatter key name (mode: frontmatter). */
	projectDetectionKey: string;
	/** Root folder path (mode: folder). */
	projectDetectionFolder: string;
	/** Match/write value for the detection key; empty = any non-empty key on match. */
	projectDetectionExpectedValue: string;
	projectNameSource: ProjectNameSource;
	projectNameFrontmatterKey: string;
	categories: string[];
	baseCurrency: string;
	requireProject: boolean;
	requireComment: boolean;
	smartContext: boolean;
	overheadMode: OverheadMode;
	overheadActiveCriteria: OverheadActiveCriteria;
	overheadActiveFlagKey: string;
	overheadActiveValue: string;
	budgetFrontmatterKey: string;
	csvSeparator: CsvSeparator;
}

export function createDefaultSettings(): PropexSettings {
	return {
		projectDetectionMode: "frontmatter",
		projectDetectionKey: "type",
		projectDetectionFolder: "",
		projectDetectionExpectedValue: "project",
		projectNameSource: "basename",
		projectNameFrontmatterKey: "name",
		categories: getDefaultCategories(),
		baseCurrency: getLocale() === "ru" ? "RUB" : "USD",
		requireProject: false,
		requireComment: false,
		smartContext: true,
		overheadMode: "separate",
		overheadActiveCriteria: "all_cached",
		overheadActiveFlagKey: "active",
		overheadActiveValue: "",
		budgetFrontmatterKey: "budget",
		csvSeparator: ";",
	};
}
