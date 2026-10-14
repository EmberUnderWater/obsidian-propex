import type { Transaction } from "./transaction";
import type { PropexSettings } from "./settings";

export const SCHEMA_VERSION = 1 as const;

export interface PropexData {
	schemaVersion: typeof SCHEMA_VERSION;
	settings: PropexSettings;
	transactions: Transaction[];
}
