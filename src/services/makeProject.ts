import { Notice, type App, type TFile } from "obsidian";
import { t } from "../locales";
import type PropexPlugin from "../main";

const DEFAULT_WRITE_VALUE = "project";

function valuesEqual(a: unknown, b: string): boolean {
	return String(a).trim().toLowerCase() === b.trim().toLowerCase();
}

function isSafeFrontmatterKey(key: string): boolean {
	return /^[A-Za-z0-9_А-Яа-яЁё-]+$/.test(key);
}

function basenameOf(filePath: string): string {
	const segment = filePath.split("/").pop() ?? filePath;
	return segment.replace(/\.md$/i, "");
}

function fileNameOf(filePath: string): string {
	return filePath.split("/").pop() ?? filePath;
}

function writeValueFor(expectedRaw: string): string {
	const expected = expectedRaw.trim();
	return expected === "" ? DEFAULT_WRITE_VALUE : expected;
}

/** Only absent/null or primitive values can be extended as a project marker. */
function isCompatibleDetectionValue(value: unknown): boolean {
	return value === undefined || value === null || ["string", "number", "boolean"].includes(typeof value);
}

function isSimpleFrontmatterValue(value: unknown): boolean {
	return value === undefined || value === null || ["string", "number", "boolean"].includes(typeof value);
}

function ensureDetectionValue(current: unknown, writeValue: string): string | string[] {
	if (current === undefined || current === null || current === "") return writeValue;
	if (typeof current === "boolean") return writeValue;
	if (typeof current === "string") {
		if (valuesEqual(current, writeValue)) return current;
		return [current, writeValue];
	}
	if (Array.isArray(current)) {
		const items = current.map((item) => String(item)).filter((item) => item.trim() !== "");
		if (items.some((item) => valuesEqual(item, writeValue))) return items;
		return [...items, writeValue];
	}
	if (typeof current === "number") return [String(current), writeValue];
	return writeValue;
}

function isActiveFlagValue(current: unknown, expectedRaw: string): boolean {
	if (expectedRaw.trim() === "") {
		if (current === undefined || current === null) return false;
		if (typeof current === "string") return current.trim() !== "";
		if (typeof current === "boolean") return current;
		if (typeof current === "number") return current !== 0;
		if (Array.isArray(current)) return current.length > 0;
		return true;
	}
	const needle = expectedRaw.trim().toLowerCase();
	const normalized = String(current).trim().toLowerCase();
	if (normalized === needle) return true;
	if (["true", "1", "active"].includes(needle)) {
		return ["true", "1", "active"].includes(normalized);
	}
	return false;
}

function ensureActiveFlagValue(current: unknown, expectedRaw: string): string | string[] | boolean {
	const expected = expectedRaw.trim();
	if (expected === "") {
		if (current === undefined || current === null || current === "") return true;
		if (typeof current === "boolean") return current;
		return true;
	}
	return ensureDetectionValue(current, writeValueFor(expected));
}

export async function makeNoteAProject(plugin: PropexPlugin, app: App): Promise<void> {
	const settings = plugin.dataStore.settings;

	if (settings.projectDetectionMode === "folder") {
		new Notice(t("makeProjectFolderMode"));
		return;
	}

	const file = app.workspace.getActiveFile();
	if (!file || file.extension !== "md") {
		new Notice(t("makeProjectNoFile"));
		return;
	}

	const existing = plugin.projectCache.getProject(file.path);
	if (existing) {
		new Notice(t("makeProjectAlready", { name: existing.name, file: fileNameOf(existing.filePath) }));
		return;
	}

	const smart = plugin.projectCache.resolveSmartProject(file.path);
	if (smart) {
		new Notice(t("makeProjectAlready", { name: smart.name, file: fileNameOf(smart.filePath) }));
		return;
	}

	const detectionKey = settings.projectDetectionKey.trim();
	if (!detectionKey || !isSafeFrontmatterKey(detectionKey)) {
		new Notice(t("makeProjectNoDetectionKey"));
		return;
	}

	const writeValue = writeValueFor(settings.projectDetectionExpectedValue);
	const wantsName = settings.projectNameSource === "frontmatter";
	const nameKey = settings.projectNameFrontmatterKey.trim();
	const writeName = wantsName && !!nameKey && isSafeFrontmatterKey(nameKey);
	const projectTitle = basenameOf(file.path);
	const budgetKey = settings.budgetFrontmatterKey.trim();
	const writeBudget = !!budgetKey && isSafeFrontmatterKey(budgetKey);
	const activeFlagKey = settings.overheadActiveFlagKey.trim();
	const writeActiveFlag = settings.overheadActiveCriteria === "frontmatter_flag" && !!activeFlagKey && isSafeFrontmatterKey(activeFlagKey);
	const activeFlagExpected = settings.overheadActiveValue;

	let keyConflict = false;
	try {
		await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			const currentDetectionValue = frontmatter[detectionKey];
			const currentNameValue = writeName && nameKey !== detectionKey ? frontmatter[nameKey] : undefined;
			const currentBudgetValue = writeBudget && budgetKey !== detectionKey && !(writeName && budgetKey === nameKey)
				? frontmatter[budgetKey]
				: undefined;
			const currentActiveValue = writeActiveFlag && activeFlagKey !== detectionKey && activeFlagKey !== nameKey
				? frontmatter[activeFlagKey]
				: undefined;

			if (
				!isCompatibleDetectionValue(currentDetectionValue) ||
				(writeName && nameKey !== detectionKey && !isSimpleFrontmatterValue(currentNameValue)) ||
				(writeBudget && budgetKey !== detectionKey && !(writeName && budgetKey === nameKey) && !isSimpleFrontmatterValue(currentBudgetValue)) ||
				(writeActiveFlag && activeFlagKey !== detectionKey && activeFlagKey !== nameKey && !isSimpleFrontmatterValue(currentActiveValue))
			) {
				keyConflict = true;
				return;
			}

			const nextDetectionValue = ensureDetectionValue(currentDetectionValue, writeValue);
			let nextSharedDetectionValue: string[] | undefined;
			if (writeName && nameKey === detectionKey) {
				const values = Array.isArray(nextDetectionValue) ? [...nextDetectionValue] : [String(nextDetectionValue)];
				if (!values.some((item) => valuesEqual(item, projectTitle))) values.unshift(projectTitle);
				if (!values.some((item) => valuesEqual(item, writeValue))) values.push(writeValue);
				nextSharedDetectionValue = values;
			}

			let nextActiveValue: string | string[] | boolean | undefined;
			if (writeActiveFlag && activeFlagKey !== detectionKey && activeFlagKey !== nameKey && !isActiveFlagValue(currentActiveValue, activeFlagExpected)) {
				nextActiveValue = ensureActiveFlagValue(currentActiveValue, activeFlagExpected);
			}

			// All conflict and type validation is complete before mutating frontmatter.
			if (writeName && nameKey !== detectionKey) {
				const missing = currentNameValue === undefined || currentNameValue === null || (typeof currentNameValue === "string" && currentNameValue.trim() === "");
				if (missing) frontmatter[nameKey] = projectTitle;
			}
			frontmatter[detectionKey] = nextSharedDetectionValue ?? nextDetectionValue;
			if (writeBudget && budgetKey !== detectionKey && !(writeName && budgetKey === nameKey)) {
				const missingBudget = currentBudgetValue === undefined || currentBudgetValue === null || (typeof currentBudgetValue === "string" && currentBudgetValue.trim() === "");
				if (missingBudget) frontmatter[budgetKey] = 0;
			}
			if (nextActiveValue !== undefined) frontmatter[activeFlagKey] = nextActiveValue;
		});
	} catch (error) {
		console.error("[Propex] Failed to update project frontmatter", error);
		new Notice(t("errSaveData"));
		return;
	}

	if (keyConflict) {
		new Notice(t("makeProjectKeyConflict"));
		return;
	}
	new Notice(t("makeProjectSuccess", { file: file.name }));
}

export function isMarkdownFile(file: TFile | null): file is TFile {
	return file !== null && file.extension === "md";
}
