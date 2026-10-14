import { AbstractInputSuggest, type App } from "obsidian";

const CREATE_PREFIX = "__propex_create__:";

export class CategorySuggest extends AbstractInputSuggest<string> {
	private readonly targetInput: HTMLInputElement;

	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly getCategories: () => string[],
		private readonly createLabel: string,
		private readonly onPick: (value: string, created: boolean) => void,
	) {
		super(app, inputEl);
		this.targetInput = inputEl;
	}

	getSuggestions(query: string): string[] {
		const trimmed = query.trim();
		const categories = this.getCategories();
		const lower = trimmed.toLowerCase();
		const matches = lower
			? categories.filter((c) => c.toLowerCase().includes(lower))
			: [...categories];

		const exists = categories.some((c) => c.toLowerCase() === lower);
		if (trimmed && !exists) {
			return [`${CREATE_PREFIX}${trimmed}`, ...matches];
		}
		return matches;
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		if (value.startsWith(CREATE_PREFIX)) {
			el.setText(`${this.createLabel}: ${value.slice(CREATE_PREFIX.length)}`);
			return;
		}
		el.setText(value);
	}

	selectSuggestion(value: string, _evt: MouseEvent | KeyboardEvent): void {
		const inputEl = this.targetInput;
		if (value.startsWith(CREATE_PREFIX)) {
			const name = value.slice(CREATE_PREFIX.length);
			inputEl.value = name;
			this.onPick(name, true);
		} else {
			inputEl.value = value;
			this.onPick(value, false);
		}
		this.close();
		inputEl.trigger("input");
	}
}
