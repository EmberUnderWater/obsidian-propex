import { Editor, EditorSuggest, type App, type EditorPosition, type EditorSuggestContext, type EditorSuggestTriggerInfo, type TFile } from "obsidian";

interface SlashCommand {
	id: string;
	label: string;
	insert: string;
}

const COMMANDS: SlashCommand[] = [
	{
		id: "project-dashboard",
		label: "Propex: Project Dashboard",
		insert: "```propex\nproject: self\n```",
	},
	{
		id: "global-report",
		label: "Propex: Global Report",
		insert: "```propex\nproject: global\n```",
	},
];

const TRIGGER = "/propex";

export class PropexSlashSuggest extends EditorSuggest<SlashCommand> {
	constructor(app: App) {
		super(app);
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		const line = editor.getLine(cursor.line);
		const before = line.slice(0, cursor.ch);
		const index = before.toLowerCase().lastIndexOf(TRIGGER);
		if (index === -1) return null;

		const query = before.slice(index + TRIGGER.length);
		if (/\s/.test(query)) return null;

		return {
			start: { line: cursor.line, ch: index },
			end: cursor,
			query,
		};
	}

	getSuggestions(context: EditorSuggestContext): SlashCommand[] {
		const q = context.query.trim().toLowerCase();
		return COMMANDS.filter(
			(command) => !q || command.label.toLowerCase().includes(q) || command.id.includes(q),
		);
	}

	renderSuggestion(value: SlashCommand, el: HTMLElement): void {
		el.setText(value.label);
	}

	selectSuggestion(value: SlashCommand, _evt: MouseEvent | KeyboardEvent): void {
		const editor = this.context?.editor;
		const range = this.context;
		if (!editor || !range) return;

		editor.replaceRange(value.insert + "\n\n", range.start, range.end);
		const cursorLine = range.start.line + value.insert.split("\n").length + 1;
		editor.setCursor({ line: cursorLine, ch: 0 });
	}
}
