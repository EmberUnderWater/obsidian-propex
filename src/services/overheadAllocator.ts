import type { OverheadActiveCriteria, OverheadMode, PropexSettings, Transaction } from "../types";
import type { CachedProject } from "../types";

export interface CategoryExpense {
	category: string;
	amount: number;
}

export interface OverheadAllocationResult {
	/** Expenses grouped by category for the report scope (includes allocated overhead when applicable). */
	byCategory: CategoryExpense[];
	/** Unallocated overhead shown as a separate row (only in `separate` mode). */
	overheadSeparate: number;
	/** Overhead amount allocated into `byCategory`. */
	allocatedOverhead: number;
	totalExpense: number;
	totalIncome: number;
}

function isExpense(transaction: Transaction): boolean {
	return transaction.type === "expense";
}

export function resolveActiveProjectIds(
	transactions: Transaction[],
	allProjects: CachedProject[],
	settings: PropexSettings,
	isProjectActiveFlag: (filePath: string) => boolean,
): string[] {
	const criteria: OverheadActiveCriteria = settings.overheadActiveCriteria;

	if (criteria === "all_cached") {
		return allProjects.map((p) => p.name);
	}

	if (criteria === "frontmatter_flag") {
		return allProjects.filter((p) => isProjectActiveFlag(p.filePath)).map((p) => p.name);
	}

	// period_transactions: projects with >=1 direct transaction in the report period (full dataset here).
	const withDirect = new Set<string>();
	for (const transaction of transactions) {
		if (transaction.projectId !== null) withDirect.add(transaction.projectId.trim().toLowerCase());
	}
	return allProjects.filter((p) => withDirect.has(p.name.trim().toLowerCase())).map((p) => p.name);
}

export type MaterializedTransaction = Transaction & { overheadFraction?: number };

/**
 * Expands overhead expense rows into virtual per-project shares
 * (`amount * fraction`) so every chart/table sees the same numbers.
 * Never mutates `data.json`. Only expenses participate.
 */
export function materializeOverhead(
	transactions: Transaction[],
	options: {
		mode: OverheadMode;
		targetProjectId: string | null;
		activeProjectIds: string[];
		directSpendByProject?: Map<string, number>;
	},
): MaterializedTransaction[] {
	const { mode, targetProjectId, activeProjectIds } = options;
	const result: MaterializedTransaction[] = [];
	const overhead: Transaction[] = [];

	for (const t of transactions) {
		if (isExpense(t) && t.projectId === null) {
			overhead.push(t);
		} else {
			result.push(t);
		}
	}

	if (overhead.length === 0) return result;

	if (targetProjectId === null) {
		return [...result, ...overhead];
	}

	if (mode === "separate") {
		return result;
	}

	const activeSet = new Set(activeProjectIds.map((id) => id.trim().toLowerCase()));
	if (!activeSet.has(targetProjectId.trim().toLowerCase())) return result;

	let fraction = 0;
	if (mode === "split_equally") {
		fraction = activeProjectIds.length > 0 ? 1 / activeProjectIds.length : 0;
	} else if (mode === "proportional") {
		const spend = options.directSpendByProject ?? new Map<string, number>();
		const targetSpend = spend.get(targetProjectId.trim().toLowerCase()) ?? 0;
		const totalActive = activeProjectIds.reduce((sum, id) => sum + (spend.get(id.trim().toLowerCase()) ?? 0), 0);
		if (totalActive > 0) fraction = targetSpend / totalActive;
		else fraction = activeProjectIds.length > 0 ? 1 / activeProjectIds.length : 0;
	}

	if (fraction <= 0) return result;

	for (const t of overhead) {
		result.push({
			...t,
			id: `${t.id}#oh:${targetProjectId}`,
			amount: Math.round(t.amount * fraction * 100) / 100,
			projectId: targetProjectId,
			overheadFraction: fraction,
		});
	}

	return result;
}

function sumExpenses(transactions: Transaction[], predicate: (t: Transaction) => boolean): number {
	let total = 0;
	for (const transaction of transactions) {
		if (isExpense(transaction) && predicate(transaction)) total += transaction.amount;
	}
	return total;
}

/**
 * Builds report expense totals. Never mutates `data.json`.
 */
export function buildOverheadAllocation(options: {
	transactions: Transaction[];
	settings: PropexSettings;
	/** `null` = global report scope. */
	targetProjectId: string | null;
	activeProjectIds: string[];
	allProjects: CachedProject[];
}): OverheadAllocationResult {
	const { transactions, settings, targetProjectId, activeProjectIds } = options;
	const mode: OverheadMode = settings.overheadMode;

	const incomeTotal = transactions.reduce(
		(sum, t) => (t.type === "income" ? sum + t.amount : sum),
		0,
	);

	const directExpenses = transactions.filter(
		(t) => isExpense(t) && t.projectId !== null && (targetProjectId === null || t.projectId.trim().toLowerCase() === targetProjectId.trim().toLowerCase()),
	);
	const overheadExpenses = transactions.filter((t) => isExpense(t) && t.projectId === null);

	const categoryMap = new Map<string, number>();
	const addAmount = (category: string, amount: number) => {
		if (amount === 0) return;
		categoryMap.set(category, (categoryMap.get(category) ?? 0) + amount);
	};

	for (const transaction of directExpenses) {
		addAmount(transaction.category, transaction.amount);
	}

	let allocatedOverhead = 0;
	let overheadSeparate = 0;

	const activeSet = new Set(activeProjectIds.map((id) => id.trim().toLowerCase()));
	const isActiveTarget = targetProjectId !== null && activeSet.has(targetProjectId.trim().toLowerCase());

	const directSpendByProject = new Map<string, number>();
	for (const transaction of transactions) {
		if (!isExpense(transaction) || transaction.projectId === null) continue;
		directSpendByProject.set(
			transaction.projectId.trim().toLowerCase(),
			(directSpendByProject.get(transaction.projectId.trim().toLowerCase()) ?? 0) + transaction.amount,
		);
	}

	const totalActiveDirectSpend = activeProjectIds.reduce(
		(sum, id) => sum + (directSpendByProject.get(id.trim().toLowerCase()) ?? 0),
		0,
	);

	if (mode === "separate") {
		overheadSeparate = sumExpenses(overheadExpenses, () => true);
	} else if (targetProjectId === null) {
		// Global scope: overhead keeps its own categories (already represented in totals via overhead expenses).
		for (const transaction of overheadExpenses) {
			addAmount(transaction.category, transaction.amount);
		}
		allocatedOverhead = sumExpenses(overheadExpenses, () => true);
	} else if (!isActiveTarget) {
		overheadSeparate = 0;
	} else if (mode === "split_equally") {
		const activeCount = activeProjectIds.length;
		if (activeCount > 0) {
			const share = 1 / activeCount;
			for (const transaction of overheadExpenses) {
				const portion = transaction.amount * share;
				addAmount(transaction.category, portion);
				allocatedOverhead += portion;
			}
		}
	} else if (mode === "proportional") {
		const targetShareBase = directSpendByProject.get(targetProjectId.trim().toLowerCase()) ?? 0;
		if (totalActiveDirectSpend > 0) {
			const share = targetShareBase / totalActiveDirectSpend;
			for (const transaction of overheadExpenses) {
				const portion = transaction.amount * share;
				addAmount(transaction.category, portion);
				allocatedOverhead += portion;
			}
		} else if (activeProjectIds.length > 0) {
			const share = 1 / activeProjectIds.length;
			for (const transaction of overheadExpenses) {
				const portion = transaction.amount * share;
				addAmount(transaction.category, portion);
				allocatedOverhead += portion;
			}
		}
	}

	const byCategory = Array.from(categoryMap.entries())
		.map(([category, amount]) => ({ category, amount }))
		.sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));

	const totalExpense = byCategory.reduce((sum, item) => sum + item.amount, 0) + overheadSeparate;

	return {
		byCategory,
		overheadSeparate,
		allocatedOverhead,
		totalExpense,
		totalIncome: incomeTotal,
	};
}
