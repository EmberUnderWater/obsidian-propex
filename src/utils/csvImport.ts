import type { TransactionInput } from "../data/dataStore";
import type { CsvSeparator } from "../types/settings";

export type CsvParseResult =
	| { ok: true; transactions: TransactionInput[]; invalidRows: number }
	| { ok: false; error: "empty" | "header" };

const HEADER = ["id", "type", "date", "amount", "currency", "projectId", "category", "comment"];

function parseRecords(text: string, separator: CsvSeparator): string[][] | null {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	let closedQuote = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (quoted) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					quoted = false;
					closedQuote = true;
				}
			} else {
				field += char;
			}
			continue;
		}

		if (closedQuote && char !== separator && char !== "\r" && char !== "\n") return null;
		if (char === '"') {
			if (field.length !== 0 || closedQuote) return null;
			quoted = true;
		} else if (char === separator) {
			row.push(field);
			field = "";
			closedQuote = false;
		} else if (char === "\r" || char === "\n") {
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
			closedQuote = false;
			if (char === "\r" && text[i + 1] === "\n") i++;
		} else {
			field += char;
		}
	}

	if (quoted) return null;
	if (field.length > 0 || row.length > 0 || closedQuote) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

function isImportableRow(row: string[]): row is [string, string, string, string, string, string, string, string] {
	return (
		row.length === HEADER.length &&
		(row[1] === "expense" || row[1] === "income") &&
		/^\d{4}-\d{2}-\d{2}$/.test(row[2] ?? "") &&
		(row[3] ?? "").trim() !== "" &&
		Number.isFinite(Number(row[3]))
	);
}

export function parseTransactionsCsv(content: string, separator: CsvSeparator): CsvParseResult {
	const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
	if (!text.trim()) return { ok: false, error: "empty" };

	const records = parseRecords(text, separator);
	const header = records?.[0];
	if (
		!records ||
		!header ||
		header.length !== HEADER.length ||
		header.some((value, index) => value !== HEADER[index])
	) {
		return { ok: false, error: "header" };
	}

	const transactions: TransactionInput[] = [];
	let invalidRows = 0;
	for (const row of records.slice(1)) {
		if (row.length === 1 && row[0] === "") continue;
		if (!isImportableRow(row)) {
			invalidRows++;
			continue;
		}
		transactions.push({
			type: row[1] as "expense" | "income",
			date: row[2],
			amount: Number(row[3]),
			currency: row[4],
			projectId: row[5] === "" ? null : row[5],
			category: row[6],
			comment: row[7],
		});
	}

	return { ok: true, transactions, invalidRows };
}
