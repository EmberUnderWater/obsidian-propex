import type { CsvSeparator, Transaction } from "../types";

const CSV_COLUMNS = ["id", "type", "date", "amount", "currency", "projectId", "category", "comment"] as const;

function escapeField(value: string, separator: string): string {
	if (value.includes(separator) || value.includes('"') || value.includes("\n") || value.includes("\r")) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

function row(values: string[], separator: string): string {
	return values.map((value) => escapeField(value, separator)).join(separator);
}

export function buildCsvExport(transactions: Transaction[], separator: CsvSeparator): string {
	const lines: string[] = [row([...CSV_COLUMNS], separator)];

	for (const transaction of transactions) {
		lines.push(
			row(
				[
					transaction.id,
					transaction.type,
					transaction.date,
					String(transaction.amount),
					transaction.currency,
					transaction.projectId ?? "",
					transaction.category,
					transaction.comment,
				],
				separator,
			),
		);
	}

	return `\uFEFF${lines.join("\r\n")}`;
}

export function csvExportFileName(date = new Date()): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `propex-export-${date.getFullYear()}-${month}-${day}.csv`;
}
