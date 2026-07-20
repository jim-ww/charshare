/** Combines a caller's own cancellation signal (e.g. the user hitting Stop)
 *  with a timeout derived from the provider's `request_timeout_seconds`
 *  preference, so a hung/unreachable server doesn't leave a chat stuck on
 *  "Replying…" forever. 0 (or unset, for configs saved before this field
 *  existed) means no timeout — just the caller's own signal, if any. */
export function withRequestTimeout(
	signal: AbortSignal | undefined,
	timeoutSeconds: number | undefined
): AbortSignal | undefined {
	if (!timeoutSeconds || timeoutSeconds <= 0) return signal;
	const timeoutSignal = AbortSignal.timeout(timeoutSeconds * 1000);
	return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}
