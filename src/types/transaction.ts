export type TransactionType = "expense" | "income";

export interface Transaction {
	id: string;
	type: TransactionType;
	date: string;
	amount: number;
	currency: string;
	projectId: string | null;
	category: string;
	comment: string;
	createdAt: string;
	updatedAt: string;
}
