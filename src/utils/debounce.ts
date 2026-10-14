export function debounce<A extends unknown[]>(
	fn: (...args: A) => void,
	waitMs = 400,
): ((...args: A) => void) & { cancel: () => void; flush: () => void } {
	let timer: number | null = null;
	let lastArgs: A | null = null;

	const debounced = (...args: A): void => {
		lastArgs = args;
		if (timer !== null) window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			timer = null;
			const callArgs = lastArgs;
			lastArgs = null;
			if (callArgs) fn(...callArgs);
		}, waitMs);
	};

	debounced.cancel = (): void => {
		if (timer !== null) window.clearTimeout(timer);
		timer = null;
		lastArgs = null;
	};

	debounced.flush = (): void => {
		if (timer !== null && lastArgs) {
			window.clearTimeout(timer);
			const callArgs = lastArgs;
			timer = null;
			lastArgs = null;
			fn(...callArgs);
		}
	};

	return debounced;
}
