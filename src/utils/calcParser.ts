export interface CalcResult {
	ok: boolean;
	value: number | null;
}

const NUMBER_RE = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

export function evaluateExpression(input: string): number | null {
	const source = input.trim().replace(/\s+/g, "").replace(/,/g, ".");
	if (!source || !/^[0-9+\-*/().]+$/.test(source)) return null;

	let pos = 0;

	function parseExpression(): number | null {
		let left = parseTerm();
		if (left === null) return null;
		while (pos < source.length && (source[pos] === "+" || source[pos] === "-")) {
			const op = source[pos++];
			const right = parseTerm();
			if (right === null) return null;
			left = op === "+" ? left + right : left - right;
		}
		return left;
	}

	function parseTerm(): number | null {
		let left = parseFactor();
		if (left === null) return null;
		while (pos < source.length && (source[pos] === "*" || source[pos] === "/")) {
			const op = source[pos++];
			const right = parseFactor();
			if (right === null) return null;
			if (op === "/") {
				if (right === 0) return null;
				left = left / right;
			} else {
				left = left * right;
			}
		}
		return left;
	}

	function parseFactor(): number | null {
		if (source[pos] === "+") {
			pos++;
			return parseFactor();
		}
		if (source[pos] === "-") {
			pos++;
			const value = parseFactor();
			return value === null ? null : -value;
		}
		if (source[pos] === "(") {
			pos++;
			const value = parseExpression();
			if (value === null || source[pos] !== ")") return null;
			pos++;
			return value;
		}
		return parseNumber();
	}

	function parseNumber(): number | null {
		const start = pos;
		while (pos < source.length && /[0-9.]/.test(source[pos] ?? "")) pos++;
		const token = source.slice(start, pos);
		if (!token || !NUMBER_RE.test(token)) return null;
		const value = Number(token);
		return Number.isFinite(value) ? value : null;
	}

	const result = parseExpression();
	if (result === null || pos !== source.length) return null;
	return result;
}

export function parseAmount(input: string): CalcResult {
	const raw = input.trim();
	if (!raw) return { ok: false, value: null };

	const value = evaluateExpression(raw);
	if (value === null || !Number.isFinite(value)) return { ok: false, value: null };
	if (value <= 0) return { ok: false, value };

	return { ok: true, value: Math.round(value * 100) / 100 };
}
