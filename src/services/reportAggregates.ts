import type {
	BarSeries,
	CategoryAmount,
	DataScope,
	DateRange,
	DisplayRow,
	DonutSlice,
	LineSeries,
	ReportPeriod,
	Transaction,
} from "../types";

interface Ymd {
	year: number;
	month: number;
	day: number;
}

/** Accepts YYYY-MM-DD and longer ISO-like prefixes (YYYY-MM-DDTHH:mm…). */
export function parseDateOnly(date: string): Ymd | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? "").trim());
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]) - 1;
	const day = Number(match[3]);
	if (month < 0 || month > 11 || day < 1 || day > 31) return null;
	return { year, month, day };
}

function toUtcMillis(d: Ymd): number {
	return Date.UTC(d.year, d.month, d.day);
}

function dayOfWeek(d: Ymd): number {
	return new Date(toUtcMillis(d)).getUTCDay();
}

/** Monday-based week start (UTC). */
function startOfWeek(d: Ymd): Ymd {
	const shift = (dayOfWeek(d) + 6) % 7;
	const t = toUtcMillis(d) - shift * 86400000;
	const dt = new Date(t);
	return { year: dt.getUTCFullYear(), month: dt.getUTCMonth(), day: dt.getUTCDate() };
}

export function fmtYmd(d: Ymd): string {
	const mm = String(d.month + 1).padStart(2, "0");
	const dd = String(d.day).padStart(2, "0");
	return `${d.year}-${mm}-${dd}`;
}

function parseYmdString(value: string): Ymd | null {
	return parseDateOnly(value);
}

/** True when either bound of the range is set. */
export function hasCustomRange(range: DateRange | undefined): boolean {
	return !!range && (range.start !== null || range.end !== null);
}

/**
 * Absolute range (inclusive) wins over calendar `period`.
 * `date_start` / `date_end` may be null (open bound).
 */
export function filterTransactionsByDate(
	transactions: Transaction[],
	filter: { period: ReportPeriod; range?: DateRange },
	now: Date = new Date(),
): Transaction[] {
	if (hasCustomRange(filter.range)) {
		const start = filter.range?.start ? toUtcMillis(parseYmdString(filter.range.start) ?? { year: 0, month: 0, day: 1 }) : -Infinity;
		const end = filter.range?.end ? toUtcMillis(parseYmdString(filter.range.end) ?? { year: 9999, month: 11, day: 31 }) : Infinity;
		return transactions.filter((t) => {
			const p = parseDateOnly(t.date);
			if (!p) return false;
			const ms = toUtcMillis(p);
			return ms >= start && ms <= end;
		});
	}

	return filterTransactionsByPeriod(transactions, filter.period, now);
}

/** Calendar period filter relative to `now`. */
export function filterTransactionsByPeriod(
	transactions: Transaction[],
	period: ReportPeriod,
	now: Date = new Date(),
): Transaction[] {
	if (period === "all") return transactions;

	const ref: Ymd = {
		year: now.getFullYear(),
		month: now.getMonth(),
		day: now.getDate(),
	};

	if (period === "day") {
		return transactions.filter((t) => {
			const p = parseDateOnly(t.date);
			return !!p && p.year === ref.year && p.month === ref.month && p.day === ref.day;
		});
	}

	if (period === "week") {
		const refStart = toUtcMillis(startOfWeek(ref));
		return transactions.filter((t) => {
			const p = parseDateOnly(t.date);
			if (!p) return false;
			return toUtcMillis(startOfWeek(p)) === refStart;
		});
	}

	return transactions.filter((t) => {
		const p = parseDateOnly(t.date);
		if (!p) return false;
		if (period === "month") return p.year === ref.year && p.month === ref.month;
		return p.year === ref.year;
	});
}

export function applyCategoryFilter(
	transactions: Transaction[],
	categoryFilter?: string[],
): Transaction[] {
	if (!categoryFilter || categoryFilter.length === 0) return transactions;
	const allowed = new Set(categoryFilter);
	return transactions.filter((t) => allowed.has(t.category));
}

export function selectByDataScope(transactions: Transaction[], scope: DataScope): Transaction[] {
	if (scope === "all") return transactions;
	const type = scope === "income" ? "income" : "expense";
	return transactions.filter((t) => t.type === type);
}

/** ISO week key YYYY-Www */
export function weekLabel(date: string): string {
	const p = parseDateOnly(date);
	if (!p) return String(date ?? "");
	const start = startOfWeek(p);
	// Thursday of this week determines ISO year
	const dow = (dayOfWeek(start) + 6) % 7;
	const thursday = new Date(toUtcMillis(start) + (3 - dow) * 86400000);
	const isoYear = thursday.getUTCFullYear();
	const yearStart = Date.UTC(isoYear, 0, 1);
	const week = Math.ceil(((toUtcMillis({ year: thursday.getUTCFullYear(), month: thursday.getUTCMonth(), day: thursday.getUTCDate() }) - yearStart) / 86400000 + 1) / 7);
	return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/**
 * Bucket label for bar grouping:
 * - group_by week → YYYY-Www
 * - group_by period + day/week/month → DD
 * - group_by period + year/all → YYYY-MM
 */
export function bucketLabel(date: string, period: ReportPeriod, groupBy: "category" | "period" | "week" = "period"): string {
	if (groupBy === "week") return weekLabel(date);
	const parsed = parseDateOnly(date);
	if (!parsed) return String(date ?? "");
	if (period === "year" || period === "all") return fmtYmd(parsed).slice(0, 7);
	return String(parsed.day).padStart(2, "0");
}

export function aggregateDonut(transactions: Transaction[], scope: DataScope): DonutSlice[] {
	const type = scope === "income" ? "income" : "expense";
	const map = new Map<string, number>();
	for (const t of transactions) {
		if (t.type !== type) continue;
		map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
	}
	return Array.from(map.entries())
		.map(([category, amount]) => ({ category, amount }))
		.sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

function sumByCategory(
	transactions: Transaction[],
	type: "income" | "expense",
): CategoryAmount[] {
	const map = new Map<string, number>();
	for (const t of transactions) {
		if (t.type !== type) continue;
		map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
	}
	return Array.from(map.entries())
		.map(([category, amount]) => ({ category, amount }))
		.sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

export function aggregateBar(
	transactions: Transaction[],
	scope: DataScope,
	groupBy: "category" | "period" | "week",
	period: ReportPeriod,
	currency: string,
): BarSeries {
	type Acc = { income: Transaction[]; expense: Transaction[] };
	const map = new Map<string, Acc>();

	for (const t of transactions) {
		const parsed = parseDateOnly(t.date);
		const label =
			groupBy === "category"
				? t.category
				: parsed
					? bucketLabel(fmtYmd(parsed), period, groupBy)
					: t.date;
		const acc = map.get(label) ?? { income: [], expense: [] };
		acc[t.type === "income" ? "income" : "expense"].push(t);
		map.set(label, acc);
	}

	const categorySet = new Set<string>();
	const groups = Array.from(map.entries()).map(([label, acc]) => {
		const incomeByCategory = sumByCategory(acc.income, "income");
		const expenseByCategory = sumByCategory(acc.expense, "expense");
		for (const item of incomeByCategory) categorySet.add(item.category);
		for (const item of expenseByCategory) categorySet.add(item.category);

		const income = acc.income.reduce((sum, t) => sum + t.amount, 0);
		const expense = acc.expense.reduce((sum, t) => sum + t.amount, 0);

		return {
			label,
			income: scope === "expenses" ? 0 : income,
			expense: scope === "income" ? 0 : expense,
			incomeByCategory: scope === "expenses" ? [] : incomeByCategory,
			expenseByCategory: scope === "income" ? [] : expenseByCategory,
		};
	});

	groups.sort((a, b) => {
		if (groupBy !== "category") return a.label.localeCompare(b.label);
		const totalA = a.income + a.expense;
		const totalB = b.income + b.expense;
		return totalB - totalA || a.label.localeCompare(b.label);
	});

	return {
		groups,
		currency,
		stackedByCategory: groupBy !== "category" && scope !== "all",
		categories: Array.from(categorySet),
	};
}

export function aggregateLine(
	transactions: Transaction[],
	_period: ReportPeriod,
	currency: string,
): LineSeries {
	const sorted = [...transactions]
		.map((t) => ({ t, parsed: parseDateOnly(t.date) }))
		.filter((row): row is { t: Transaction; parsed: Ymd } => row.parsed !== null)
		.sort((a, b) => {
			const k = toUtcMillis(a.parsed) - toUtcMillis(b.parsed);
			if (k !== 0) return k;
			return a.t.createdAt.localeCompare(b.t.createdAt);
		});

	const byDay = new Map<string, number>();
	for (const { t, parsed } of sorted) {
		const key = fmtYmd(parsed);
		const delta = t.type === "income" ? t.amount : -t.amount;
		byDay.set(key, (byDay.get(key) ?? 0) + delta);
	}

	let net = 0;
	const points = Array.from(byDay.entries()).map(([label, delta]) => {
		net = Math.round((net + delta) * 100) / 100;
		return { label, net, delta: Math.round(delta * 100) / 100 };
	});

	return { points, currency };
}

/** Table rows from real + virtual (already materialized) transactions. */
export function buildDisplayRows(
	transactions: Array<Transaction & { overheadFraction?: number }>,
	currency: string,
): DisplayRow[] {
	return transactions.map((t) => {
		const row: DisplayRow = {
			id: t.id,
			date: t.date,
			type: t.type,
			amount: t.amount,
			currency: t.currency || currency,
			projectId: t.projectId,
			category: t.category,
			comment: t.comment,
			sourceId: t.id.split("#")[0] ?? t.id,
		};
		if (typeof t.overheadFraction === "number") {
			row.overheadFraction = t.overheadFraction;
		}
		return row;
	});
}
