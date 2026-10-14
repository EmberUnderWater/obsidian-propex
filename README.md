# Propex

**Project-aware expense and income tracking inside Obsidian.**

Propex helps you keep a practical ledger of project costs, shared overhead, and income without leaving your vault. Record transactions in one place, associate them with project notes, and embed live summaries directly in your notes. The plugin is designed around a simple idea: your financial context belongs alongside the projects and decisions it describes.

## Why Propex

- **Keep records in your vault.** Transactions are stored locally in the plugin's `data.json`; no external account or cloud service is required.
- **Connect transactions to project notes.** Identify projects through frontmatter or a folder, then review each project's activity in context.
- **See both the ledger and the picture.** Filter and sort transactions, and add category, comparison, or balance reports to Markdown notes.
- **Account for shared costs.** Choose how overhead is presented or allocated in reports without rewriting the source transaction.
- **Make it yours.** Configure categories, currency, project detection, validation, overhead rules, and CSV formatting.

## Screenshots

<img width="697" height="862" alt="image" src="https://github.com/user-attachments/assets/332e6e10-281b-4d0d-9a73-c0787be56ed3" />

<img width="705" height="523" alt="image" src="https://github.com/user-attachments/assets/b17e9f41-f937-420a-a9e9-051bd5c3d405" />

<img width="702" height="609" alt="image" src="https://github.com/user-attachments/assets/340e7a40-3bd7-4a4c-97de-ead4f7cf48c0" />

<img width="1653" height="862" alt="image" src="https://github.com/user-attachments/assets/885b3b52-1d38-4337-9a42-178749350b26" />

## Getting started

1. Install and enable Propex in **Settings → Community plugins**.
2. Open **Settings → Propex** and configure how project notes are detected.
3. Add transactions using the **Add transaction** command.
4. Open the ledger with **Open Ledger** to review, filter, import, or export transactions.
5. Add a `propex` code block to a Markdown note to display a report.

By default, projects are detected by a `type: project` frontmatter value, project names come from the note's filename, and the base currency is selected from the Obsidian locale (RUB for Russian, USD otherwise). These defaults can be changed in settings.

## Commands

| Command | Purpose |
| --- | --- |
| **Add transaction** | Opens the transaction form to create an expense or income entry. |
| **Open Ledger** | Opens the Propex transaction ledger. |
| **Make note a project** | Marks the active Markdown note as a project by writing the configured project-detection frontmatter key and related configured metadata. This command is available when project detection uses frontmatter; it is unavailable in folder mode. |

The ledger can also be opened using the Propex ribbon icon.

## Transaction ledger

The ledger provides date, project, category, and comment search filters. Select table headers to change sorting. Each transaction can be edited or deleted. Use **Import CSV** and **Export CSV** to move records in or out of Propex; the export separator can be configured in settings.

A transaction contains:

- **Type:** expense or income.
- **Date, amount, currency, and category.** Amounts must be positive; the type determines whether the amount is treated as income or expense.
- **Project:** a detected project, or **Overhead (shared costs)** for a shared transaction.
- **Comment:** optional unless **Require comment** is enabled.

The base currency is applied to new transactions. Propex does not perform currency conversion.

## Reports in notes

Use a fenced `propex` block. Keys are case-insensitive; values are normalized so spaces, hyphens, and underscores do not affect enum matching. Unknown keys are ignored, and invalid values fall back to the documented default.

```propex
project: self
chart_type: donut
data_scope: all
period: all
group_by: period
show_table: true
table_limit: 5
```

### Report parameters

| Parameter | Accepted values | Default and behavior |
| --- | --- | --- |
| `project` | `self`, `global`, or a project name | `self`. `self` uses the note containing the block, which must resolve to a project. `global` includes all projects. A name selects a matching project. If omitted or empty, defaults to `self`. |
| `chart_type` | `donut`, `doughnut`, `pie`, `polarArea`, `bar`, `line` | `donut`. The first four show category totals; `bar` compares income and expenses; `line` shows cumulative net balance. |
| `data_scope` | `expenses`, `income`, `all` | `all` when omitted. Selects which transaction types feed the report. With a category chart and `all`, the report renders two charts: expenses and income. |
| `period` | `all`, `day`, `week`, `month`, `year` | `all`. Calendar periods are relative to the current date; weeks start on Monday. An explicit date bound overrides this period filter. |
| `date_start` | `YYYY-MM-DD` or `null` / `~` | No lower bound. Inclusive. |
| `date_end` | `YYYY-MM-DD` or `null` / `~` | No upper bound. Inclusive. |
| `group_by` | `category`, `period`, `week` | `period`. Applies to bar reports: category groups transactions by category; period groups by date bucket; week groups by ISO week. |
| `show_table` | `true`, `false` (also `yes`/`no`, `on`/`off`, `1`/`0`) | `true`. Shows or hides the transaction table below the chart. |
| `table_limit` | Integer from `0` to `200` | `5`. Initial number of visible table rows; the table can be expanded. `0` shows all rows immediately. |

Date bounds can be used independently. For example, `date_start: 2025-01-01` with no `date_end` includes all later dates. If either bound is valid and present, `period` is not used to filter the report.

### Report types

- **Category distribution:** `donut`, `doughnut`, `pie`, and `polarArea` display totals by category. Choose `data_scope: expenses` or `income` for one chart; `all` renders separate expense and income charts.
- **Income vs. expenses:** `bar` displays income and expense totals. `group_by: category` groups by category; `period` groups by date bucket; `week` groups by ISO week. The `data_scope` controls which side is included.
- **Balance dynamics:** `line` displays cumulative net balance over time (income minus expenses). `data_scope: all` gives the combined net; choosing `income` or `expenses` scopes the transactions accordingly.

Reports for a project include that project's transactions and shared overhead entries. The global report includes all transactions. Overhead allocation settings affect report output only; the source transactions are not modified. When a project has a `budget` value in frontmatter (or the configured budget key), the report can also show budget progress.

## Settings

The **Settings → Propex** tab includes:

- **Project detection:** use a frontmatter key and optional expected value, or treat notes in a root folder as projects.
- **Project names:** use the filename or a configured frontmatter key.
- **Categories and currency:** manage categories and choose the base currency for new entries.
- **Validation and context:** optionally require a project or comment; enable smart project context to prefill a nearby project.
- **Budget:** configure the project frontmatter key used for budget reporting (default: `budget`). Budget values are interpreted in the base currency.
- **Overhead:** choose `separate`, `split_equally`, or `proportional`; select active projects using `all_cached`, `period_transactions`, or `frontmatter_flag` criteria.
- **CSV:** choose comma or semicolon as the separator.

## Data and privacy

Propex is designed for local use. It stores plugin data in the vault's Obsidian plugin data file (`data.json`) and reads project metadata through Obsidian's APIs. It does not require a Propex account or a remote service. Keep your usual vault backups, especially before importing large CSV files or deleting transactions.

## Languages

The interface is available in English and Russian. For other Obsidian locales, Propex falls back to English.

### ☕ Support

If you find **Propex** useful and want to support its development, you can buy me a coffee using crypto:

<details>
<summary><b>Donate via Crypto</b></summary>

*USDT (TRC-20 / Tron):* `TLAazXrkdfZT2wLiF1mQ7ZRWjvRzEEG7oo`
*USDT / TON:* `UQDEW6Ed66RGCrrpZTrQoF5ydL1RGyGwGdprCi_NwupYo3cb`
*EVM (ETH / BSC / Polygon / Arbitrum):*`0xDF8A2b3CE652915C8e49d05A674838a39b548EBF`

</details>
