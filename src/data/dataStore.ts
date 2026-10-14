import { Notice, type Plugin } from "obsidian";
import { getDefaultCategories, t } from "../locales";
import { legacyProjectName } from "../utils/projectName";
import {
	SCHEMA_VERSION,
	createDefaultSettings,
	type PropexData,
	type PropexSettings,
	type Transaction,
	type TransactionType,
} from "../types";

export type TransactionInput = Omit<Transaction, "id" | "createdAt" | "updatedAt">;
export type TransactionPatch = Partial<Omit<Transaction, "id" | "createdAt" | "updatedAt">>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
	return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTransaction(raw: unknown): raw is Transaction {
	if (typeof raw !== "object" || raw === null) return false;
	const t = raw as Record<string, unknown>;
	if (typeof t.id !== "string" || t.id.length === 0) return false;
	if (!isValidDate(t.date)) return false;
	if (typeof t.amount !== "number" || !Number.isFinite(t.amount)) return false;
	if (t.type !== "expense" && t.type !== "income") return false;
	if (typeof t.currency !== "string") return false;
	if (t.projectId !== null && typeof t.projectId !== "string") return false;
	if (typeof t.category !== "string") return false;
	if (typeof t.comment !== "string") return false;
	if (typeof t.createdAt !== "string") return false;
	if (typeof t.updatedAt !== "string") return false;
	return true;
}

function sanitizeTransactions(raw: unknown): Transaction[] {
	if (!Array.isArray(raw)) return [];
	const valid: Transaction[] = [];
	for (const item of raw) {
		if (isValidTransaction(item)) {
			valid.push({
				...item,
				projectId: item.projectId === null ? null : legacyProjectName(item.projectId),
			});
		}
	}
	return valid;
}

export class DataStore {
	private data: PropexData;
	private readonly listeners = new Set<() => void>();
	private operationChain: Promise<void> = Promise.resolve();
	private loadedOk = true;

	constructor(private readonly plugin: Plugin) {
		this.data = {
			schemaVersion: SCHEMA_VERSION,
			settings: createDefaultSettings(),
			transactions: [],
		};
	}

	get loadFailed(): boolean {
		return !this.loadedOk;
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private ensureWritable(): void {
		if (!this.loadedOk) {
			throw new Error("Propex data is read-only because data.json could not be loaded.");
		}
	}

	private notify(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch {
				// isolate listener failures
			}
		}
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.operationChain.then(operation);
		this.operationChain = result.then(() => undefined, () => undefined);
		return result;
	}

	private async persist(data: PropexData): Promise<void> {
		try {
			await this.plugin.saveData(structuredClone(data));
		} catch (error) {
			new Notice(t("errSaveData"));
			throw error;
		}
	}

	private mutate<T>(operation: () => { changed: boolean; result: T; persistUnchanged?: boolean }): Promise<T> {
		return this.enqueue(async () => {
			this.ensureWritable();
			const snapshot = structuredClone(this.data);
			try {
				const outcome = operation();
				if (!outcome.changed) {
					if (outcome.persistUnchanged) {
						await this.persist(this.data);
						this.notify();
					}
					return outcome.result;
				}
				await this.persist(this.data);
				this.notify();
				return outcome.result;
			} catch (error) {
				this.data = snapshot;
				throw error;
			}
		});
	}

	async load(): Promise<void> {
		return this.enqueue(async () => {
			let raw: Partial<PropexData> | null;
			try {
				raw = (await this.plugin.loadData()) as Partial<PropexData> | null;
				if (raw !== null && raw !== undefined && !isPlainObject(raw)) {
					throw new Error("Invalid data.json contents");
				}
			} catch (error) {
				console.error("[Propex] Failed to load data.json", error);
				this.loadedOk = false;
				this.data = {
					schemaVersion: SCHEMA_VERSION,
					settings: createDefaultSettings(),
					transactions: [],
				};
				return;
			}

			if (raw === null || raw === undefined) {
				this.data = {
					schemaVersion: SCHEMA_VERSION,
					settings: createDefaultSettings(),
					transactions: [],
				};
				this.loadedOk = true;
				await this.persist(this.data);
				this.notify();
				return;
			}

			const rawSettings = isPlainObject(raw.settings)
				? (raw.settings as Partial<PropexSettings>)
				: {};
			this.data = {
				schemaVersion: SCHEMA_VERSION,
				settings: {
					...createDefaultSettings(),
					...rawSettings,
					categories: Array.isArray(rawSettings.categories)
						? rawSettings.categories.map(String)
						: getDefaultCategories(),
				},
				transactions: sanitizeTransactions(raw.transactions),
			};
			this.loadedOk = true;
		});
	}

	/** Persist the current state through the serialized operation queue. */
	async save(): Promise<void> {
		return this.enqueue(async () => {
			this.ensureWritable();
			await this.persist(this.data);
		});
	}

	get settings(): PropexSettings {
		return structuredClone(this.data.settings);
	}

	get transactions(): Transaction[] {
		return structuredClone(this.data.transactions);
	}

	getTransaction(id: string): Transaction | undefined {
		const transaction = this.data.transactions.find((t) => t.id === id);
		return transaction ? structuredClone(transaction) : undefined;
	}

	updateSettings(patch: Partial<PropexSettings>): Promise<void> {
		return this.mutate(() => {
			const previous = this.data.settings;
			const next = {
				...previous,
				...structuredClone(patch),
				categories: patch.categories
					? [...patch.categories].map(String)
					: [...previous.categories],
			};
			if (JSON.stringify(previous) === JSON.stringify(next)) {
				return { changed: false, result: undefined };
			}
			this.data.settings = next;
			return { changed: true, result: undefined };
		});
	}

	addCategory(name: string): Promise<void> {
		return this.mutate(() => {
			const trimmed = name.trim();
			if (!trimmed) return { changed: false, result: undefined };
			const exists = this.data.settings.categories.some(
				(c) => c.toLowerCase() === trimmed.toLowerCase(),
			);
			if (exists) return { changed: false, result: undefined };
			this.data.settings.categories = [...this.data.settings.categories, trimmed];
			return { changed: true, result: undefined };
		});
	}

	renameCategory(oldName: string, newName: string): Promise<void> {
		return this.mutate(() => {
			const from = oldName.trim();
			const to = newName.trim();
			if (!to || from === to) return { changed: false, result: undefined };

			const index = this.data.settings.categories.findIndex((c) => c === from);
			let changed = index !== -1;
			if (index !== -1) {
				this.data.settings.categories = this.data.settings.categories.map((c, i) =>
					i === index ? to : c,
				);
			}

			const now = new Date().toISOString();
			for (const transaction of this.data.transactions) {
				if (transaction.category === from) {
					transaction.category = to;
					transaction.updatedAt = now;
					changed = true;
				}
			}
			return { changed, result: undefined };
		});
	}

	deleteCategory(name: string): Promise<void> {
		return this.mutate(() => {
			const previous = this.data.settings.categories;
			this.data.settings.categories = previous.filter((c) => c !== name);
			return {
				changed: this.data.settings.categories.length !== previous.length,
				result: undefined,
				persistUnchanged: true,
			};
		});
	}

	addTransaction(input: TransactionInput): Promise<Transaction> {
		return this.mutate(() => {
			const now = new Date().toISOString();
			const transaction: Transaction = {
				...input,
				projectId: input.projectId === null ? null : input.projectId.trim(),
				id: crypto.randomUUID(),
				createdAt: now,
				updatedAt: now,
			};
			this.data.transactions.push(transaction);
			return { changed: true, result: structuredClone(transaction) };
		});
	}

	updateTransaction(id: string, patch: TransactionPatch): Promise<Transaction | null> {
		return this.mutate(() => {
			const index = this.data.transactions.findIndex((t) => t.id === id);
			const current = this.data.transactions[index];
			if (index === -1 || !current) return { changed: false, result: null };

			const updated: Transaction = {
				id: current.id,
				type: patch.type ?? current.type,
				date: patch.date ?? current.date,
				amount: patch.amount ?? current.amount,
				currency: patch.currency ?? current.currency,
				projectId:
					patch.projectId !== undefined
						? patch.projectId === null ? null : patch.projectId.trim()
						: current.projectId,
				category: patch.category ?? current.category,
				comment: patch.comment ?? current.comment,
				createdAt: current.createdAt,
				updatedAt: new Date().toISOString(),
			};
			this.data.transactions[index] = updated;
			return { changed: true, result: structuredClone(updated) };
		});
	}

	deleteTransaction(id: string): Promise<boolean> {
		return this.mutate(() => {
			const previousLength = this.data.transactions.length;
			this.data.transactions = this.data.transactions.filter((t) => t.id !== id);
			return { changed: this.data.transactions.length !== previousLength, result: this.data.transactions.length !== previousLength };
		});
	}

	normalizeProjectIds(resolve: (value: string) => string): Promise<void> {
		return this.mutate(() => {
			let changed = false;
			const now = new Date().toISOString();
			for (const transaction of this.data.transactions) {
				if (transaction.projectId === null) continue;
				const projectId = resolve(transaction.projectId).trim();
				if (projectId && transaction.projectId !== projectId) {
					transaction.projectId = projectId;
					transaction.updatedAt = now;
					changed = true;
				}
			}
			return { changed, result: undefined };
		});
	}
}

export type { TransactionType };
