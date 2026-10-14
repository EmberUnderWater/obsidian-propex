import { Notice, TFile, type App, type Plugin, type TAbstractFile } from "obsidian";
import { t } from "../locales";
import type { DataStore } from "../data/dataStore";
import type { CachedProject, PropexSettings } from "../types";
import { debounce } from "../utils/debounce";
import { legacyProjectName, normalizeProjectName } from "../utils/projectName";

function isPrimitiveFrontmatterValue(raw: unknown): boolean {
	return (
		typeof raw === "string" ||
		typeof raw === "number" ||
		typeof raw === "boolean" ||
		Array.isArray(raw) ||
		raw === null
	);
}

function isNonEmptyKey(raw: unknown): boolean {
	if (raw === undefined || raw === null) return false;
	if (typeof raw === "string") return raw.trim() !== "";
	if (Array.isArray(raw)) {
		return raw.some((item) => isPrimitiveFrontmatterValue(item) && String(item).trim() !== "");
	}
	if (typeof raw === "boolean") return raw;
	if (typeof raw === "number") return true;
	// Objects / dictionaries are not valid project markers.
	return false;
}

function matchesExpectedValue(raw: unknown, expected: string): boolean {
	if (raw !== null && !isPrimitiveFrontmatterValue(raw) && !Array.isArray(raw)) {
		return false;
	}
	const needle = expected.trim().toLowerCase();
	if (!needle) return isNonEmptyKey(raw);

	if (typeof raw === "string") return raw.trim().toLowerCase() === needle;
	if (Array.isArray(raw)) {
		return raw.some((item) => String(item).trim().toLowerCase() === needle);
	}
	if (typeof raw === "boolean") return String(raw).toLowerCase() === needle;
	if (typeof raw === "number") return String(raw).toLowerCase() === needle;
	if (raw === null || raw === undefined) return false;
	return false;
}

function resolveProjectNameFromRaw(raw: unknown, fallback: string): string {
	if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
	if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
	return fallback;
}

export class ProjectCache {
	private readonly projects = new Map<string, CachedProject>();
	private projectOrder = 0;
	private readonly orderByPath = new Map<string, number>();
	private readonly pendingRefreshPaths = new Set<string>();
	private readonly flushPendingRefresh: ReturnType<typeof debounce<[]>>;
	private readonly listeners = new Set<() => void>();
	private renameChain: Promise<void> = Promise.resolve();
	private rebuildRequested = false;
	private isUnloaded = false;

	constructor(
		private readonly app: App,
		private readonly dataStore: DataStore,
	) {
		this.flushPendingRefresh = debounce(() => {
			if (this.isUnloaded) return;
			const paths = [...this.pendingRefreshPaths];
			this.pendingRefreshPaths.clear();
			for (const path of paths) {
				if (this.isUnloaded) return;
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) this.refreshFile(file);
			}
		}, 250);
	}

	init(): void {
		this.rebuild();
	}

	/** Cancel pending debounced work (call from plugin unload). */
	cancelPending(): void {
		this.isUnloaded = true;
		this.pendingRefreshPaths.clear();
		this.flushPendingRefresh.cancel();
		this.listeners.clear();
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private notify(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch {
				// isolate listener failures
			}
		}
	}

	private schedulePendingFlush(): void {
		if (this.isUnloaded) return;
		if (this.pendingRefreshPaths.size === 0) return;
		this.flushPendingRefresh();
	}

	private enqueueRefresh(path: string): void {
		if (this.isUnloaded) return;
		this.pendingRefreshPaths.add(path);
		this.flushPendingRefresh();
	}

	private dropPending(path: string): void {
		this.pendingRefreshPaths.delete(path);
		// Do not cancel the timer: other pending paths must still flush.
		// Reschedule only if something remains and no timer is waiting.
		this.schedulePendingFlush();
	}

	registerEvents(plugin: Plugin): void {
		plugin.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				this.enqueueRefresh(file.path);
			}),
		);

		// Frontmatter is often missing at onload(); pick files up as metadata resolves.
		plugin.registerEvent(
			this.app.metadataCache.on("resolve", (file) => {
				this.enqueueRefresh(file.path);
			}),
		);

		plugin.registerEvent(
			this.app.metadataCache.on("resolved", () => {
				this.rebuildRequested = true;
				void this.renameChain.then(() => {
					if (!this.isUnloaded && this.rebuildRequested) {
						this.rebuildRequested = false;
						this.rebuild();
					}
				});
			}),
		);

		plugin.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.dropPending(oldPath);
				const rename = this.renameChain.catch(() => undefined).then(() => this.handleRename(file, oldPath));
				this.renameChain = rename.catch((error: unknown) => {
					console.error("[Propex] Failed to update renamed project paths", error);
					new Notice(t("errSaveData"));
				}).then(() => {
					if (this.rebuildRequested && !this.isUnloaded) {
						this.rebuildRequested = false;
						this.rebuild();
					}
				});
			}),
		);

		plugin.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.dropPending(file.path);
				if (file instanceof TFile) {
					this.orderByPath.delete(file.path);
					if (this.projects.delete(file.path)) this.notify();
					void this.normalizeLegacyTransactions();
				} else {
					this.removeUnder(file.path);
					void this.normalizeLegacyTransactions();
				}
			}),
		);
	}

	rebuild(): void {
		this.projects.clear();
		this.orderByPath.clear();
		this.projectOrder = 0;
		for (const file of this.app.vault.getMarkdownFiles()) {
			this.refreshFile(file);
		}
		this.notify();
		void this.normalizeLegacyTransactions();
	}

	getProjects(): CachedProject[] {
		const unique = new Map<string, CachedProject>();
		for (const project of this.projects.values()) {
			const key = normalizeProjectName(project.name);
			const existing = unique.get(key);
			if (!existing || (this.orderByPath.get(project.filePath) ?? Infinity) < (this.orderByPath.get(existing.filePath) ?? Infinity)) {
				unique.set(key, project);
			}
		}
		return Array.from(unique.values()).sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
		);
	}

	getProject(projectName: string): CachedProject | undefined {
		const key = normalizeProjectName(projectName);
		const byName = this.getProjects().find((project) => normalizeProjectName(project.name) === key);
		return byName ?? this.getProjectForLegacyId(projectName);
	}

	getProjectByActiveFile(): CachedProject | undefined {
		const file = this.app.workspace.getActiveFile();
		if (!file) return undefined;
		const cached = this.projects.get(file.path);
		return cached ? this.getProject(cached.name) : undefined;
	}

	getProjectForLegacyId(value: string): CachedProject | undefined {
		const normalizedPath = value.trim().replace(/\\/g, "/").toLowerCase();
		const byPath = Array.from(this.projects.values()).find(
			(project) => project.filePath.toLowerCase() === normalizedPath,
		);
		if (byPath) return this.getProjects().find(
			(project) => normalizeProjectName(project.name) === normalizeProjectName(byPath.name),
		);
		const legacyName = legacyProjectName(value);
		return this.getProjects().find(
			(project) => normalizeProjectName(project.name) === normalizeProjectName(legacyName),
		);
	}

	/**
	 * Walks parent folders from `filePath` up to the vault root.
	 * At each level, picks the first cached project in the same folder by file basename.
	 * The source file itself is excluded.
	 */
	resolveSmartProject(filePath: string): CachedProject | undefined {
		const separator = filePath.lastIndexOf("/");
		let folder = separator === -1 ? "" : filePath.slice(0, separator);

		for (;;) {
			const candidates = this.getProjectsInFolder(folder).filter((p) => p.filePath !== filePath);
			candidates.sort((a, b) => {
				const baseA = a.filePath.split("/").pop() ?? a.filePath;
				const baseB = b.filePath.split("/").pop() ?? b.filePath;
				return baseA.localeCompare(baseB, undefined, { sensitivity: "base" });
			});
			if (candidates.length > 0) return candidates[0];

			if (folder === "") return undefined;
			const lastSlash = folder.lastIndexOf("/");
			folder = lastSlash === -1 ? "" : folder.slice(0, lastSlash);
		}
	}

	private getProjectsInFolder(folder: string): CachedProject[] {
		const result: CachedProject[] = [];
		for (const project of this.projects.values()) {
			const lastSlash = project.filePath.lastIndexOf("/");
			const projectFolder = lastSlash === -1 ? "" : project.filePath.slice(0, lastSlash);
			if (projectFolder === folder) result.push(project);
		}
		return result;
	}

	private async handleRename(file: TAbstractFile, oldPath: string): Promise<void> {
		if (this.isUnloaded) return;
		const newPath = file.path;
		if (oldPath === newPath) return;

		const oldPrefix = oldPath.endsWith("/") ? oldPath : `${oldPath}/`;
		const newPrefix = newPath.endsWith("/") ? newPath : `${newPath}/`;

		const renames: Array<{ from: string; to: string }> = [];
		if (file instanceof TFile) {
			renames.push({ from: oldPath, to: newPath });
		} else {
			renames.push({ from: oldPath, to: newPath });
			for (const key of this.projects.keys()) {
				if (key.startsWith(oldPrefix)) {
					renames.push({ from: key, to: newPrefix + key.slice(oldPrefix.length) });
				}
			}
		}

		for (const { from, to } of renames) {
			const cached = this.projects.get(from);
			if (cached) {
				this.projects.delete(from);
				const order = this.orderByPath.get(from);
				this.orderByPath.delete(from);
				if (order !== undefined) this.orderByPath.set(to, order);
				this.projects.set(to, { filePath: to, name: cached.name });
				this.notify();
			}
		}

		// Rebuild from current vault state after async work; older event snapshots may be stale.
		this.rebuild();
		await this.normalizeLegacyTransactions();
		if (this.isUnloaded) return;
	}

	resolveProjectId(value: string): string {
		const project = this.getProjectForLegacyId(value);
		return project?.name ?? legacyProjectName(value).trim();
	}

	async normalizeLegacyTransactions(): Promise<void> {
		await this.dataStore.normalizeProjectIds((value) => this.resolveProjectId(value));
	}

	private removeUnder(path: string): void {
		const prefix = path.endsWith("/") ? path : `${path}/`;
		let removed = false;
		for (const key of this.projects.keys()) {
			if (key.startsWith(prefix)) {
				this.projects.delete(key);
				this.orderByPath.delete(key);
				removed = true;
			}
		}
		if (removed) this.notify();
	}

	private refreshFile(file: TFile): void {
		const settings = this.dataStore.settings;
		const prev = this.projects.get(file.path);
		if (this.matchesCriteria(file, settings)) {
			const name = this.resolveProjectName(file, settings).trim();
			const next: CachedProject = {
				filePath: file.path,
				name,
			};
			this.projects.set(file.path, next);
			if (!this.orderByPath.has(file.path)) this.orderByPath.set(file.path, this.projectOrder++);
			if (!prev || prev.name !== next.name) {
				this.notify();
				void this.normalizeLegacyTransactions();
			}
		} else {
			this.projects.delete(file.path);
			this.orderByPath.delete(file.path);
			if (prev) this.notify();
		}
	}

	matchesCriteria(file: TFile, settings: PropexSettings = this.dataStore.settings): boolean {
		if (settings.projectDetectionMode === "frontmatter") {
			const key = settings.projectDetectionKey.trim();
			if (!key) return false;
			const cache = this.app.metadataCache.getFileCache(file);
			const frontmatter: Record<string, unknown> | undefined = cache?.frontmatter;
			const raw = frontmatter?.[key];
			return matchesExpectedValue(raw, settings.projectDetectionExpectedValue);
		}

		if (settings.projectDetectionMode === "folder") {
			const folder = settings.projectDetectionFolder.trim().replace(/^\/+|\/+$/g, "");
			if (!folder) return false;
			return file.path.startsWith(`${folder}/`);
		}

		return false;
	}

	private resolveProjectName(file: TFile, settings: PropexSettings): string {
		if (settings.projectNameSource === "frontmatter") {
			const cache = this.app.metadataCache.getFileCache(file);
			const frontmatter: Record<string, unknown> | undefined = cache?.frontmatter;
			const raw = frontmatter?.[settings.projectNameFrontmatterKey];
			return resolveProjectNameFromRaw(raw, file.basename);
		}
		return file.basename;
	}
}
