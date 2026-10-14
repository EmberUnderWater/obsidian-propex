import { SuggestModal, type App } from "obsidian";
import { t } from "../../locales";
import type { CachedProject } from "../../types";
import { normalizeProjectName } from "../../utils/projectName";

export interface ProjectPick {
	/** null = overhead / shared costs */
	projectId: string | null;
	name: string;
}

/**
 * Native Obsidian suggest list. Uses plain objects (never `null` items)
 * so Fuzzy/Suggest item pipelines cannot drop or mis-select a row.
 */
export class ProjectSuggestModal extends SuggestModal<ProjectPick> {
	private readonly items: ProjectPick[];

	constructor(
		app: App,
		projects: CachedProject[],
		private readonly onChoose: (pick: ProjectPick) => void,
	) {
		super(app);
		this.setPlaceholder(t("projectPlaceholder"));
		const unique = new Map<string, CachedProject>();
		for (const project of projects) {
			const key = normalizeProjectName(project.name);
			if (!unique.has(key)) unique.set(key, project);
		}
		this.items = [
			{ projectId: null, name: t("overheadOption") },
			...Array.from(unique.values()).map((project) => ({
				projectId: project.name.trim(),
				name: project.name,
			})),
		];
	}

	getSuggestions(query: string): ProjectPick[] {
		const q = query.trim().toLowerCase();
		if (!q) return this.items;
		return this.items.filter((item) => item.name.toLowerCase().includes(q));
	}

	renderSuggestion(item: ProjectPick, el: HTMLElement): void {
		el.setText(item.name);
	}

	onChooseSuggestion(item: ProjectPick | null, _evt: MouseEvent | KeyboardEvent): void {
		if (!item) return;
		this.onChoose({ projectId: item.projectId, name: item.name });
	}
}
