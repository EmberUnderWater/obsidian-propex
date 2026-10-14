import { en, enCategories, type MessageKey } from "./en";
import { ru, ruCategories } from "./ru";

export type Locale = "en" | "ru";
export type { MessageKey };

const dictionaries: Record<Locale, Record<MessageKey, string>> = {
	en,
	ru,
};

const categoriesByLocale: Record<Locale, string[]> = {
	en: enCategories,
	ru: ruCategories,
};

export function getLocale(): Locale {
	try {
		const moment = (window as unknown as { moment?: { locale?: () => string } }).moment;
		const code = typeof moment?.locale === "function" ? moment.locale() : "en";
		return String(code ?? "en").toLowerCase().startsWith("ru") ? "ru" : "en";
	} catch {
		return "en";
	}
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
	const locale = getLocale();
	const dictionary = dictionaries[locale] ?? en;
	let text: string = dictionary[key] ?? en[key] ?? String(key);

	if (params) {
		for (const [name, value] of Object.entries(params)) {
			text = text.split(`{${name}}`).join(String(value));
		}
	}

	return text;
}

export function getDefaultCategories(): string[] {
	return [...(categoriesByLocale[getLocale()] ?? enCategories)];
}
