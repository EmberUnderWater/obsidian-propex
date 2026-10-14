import { MarkdownRenderChild } from "obsidian";
import type PropexPlugin from "../../main";
import ReportBlock from "../components/ReportBlock.svelte";

export class PropexReportRenderChild extends MarkdownRenderChild {
	private component?: ReportBlock;

	constructor(
		containerEl: HTMLElement,
		private readonly plugin: PropexPlugin,
		private readonly source: string,
		private readonly sourcePath: string,
	) {
		super(containerEl);
	}

	onload(): void {
		this.component = new ReportBlock({
			target: this.containerEl,
			props: {
				plugin: this.plugin,
				source: this.source,
				sourcePath: this.sourcePath,
			},
		});
	}

	onunload(): void {
		this.component?.$destroy();
		this.component = undefined;
		this.containerEl.empty();
	}
}
