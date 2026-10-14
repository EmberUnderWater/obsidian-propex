const PALETTE_KEYS = [
	"--color-red",
	"--color-orange",
	"--color-yellow",
	"--color-green",
	"--color-cyan",
	"--color-blue",
	"--color-purple",
	"--color-pink",
];

export function readCssVar(root: HTMLElement, name: string, fallback = ""): string {
	const value = getComputedStyle(root).getPropertyValue(name).trim();
	return value || fallback;
}

export function getChartPalette(root: HTMLElement, count: number): string[] {
	const style = getComputedStyle(root);
	const colors = PALETTE_KEYS.map((key) => style.getPropertyValue(key).trim()).filter(Boolean);

	if (colors.length === 0) {
		return Array.from({ length: Math.max(count, 1) }, (_, index) => {
			const hue = Math.round((index * 360) / Math.max(count, 1));
			return `hsl(${hue} 65% 52%)`;
		});
	}

	return Array.from({ length: Math.max(count, 1) }, (_, index) => colors[index % colors.length] ?? "");
}
