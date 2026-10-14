export function normalizeProjectName(value: string): string {
	return value.trim().toLowerCase();
}

export function legacyProjectName(value: string): string {
	return value.trim().replace(/\\/g, "/").split("/").pop()?.replace(/\.md$/i, "").trim() ?? "";
}
