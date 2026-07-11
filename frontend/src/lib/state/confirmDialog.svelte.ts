/** Singleton confirm-modal service, so code outside component tree (e.g.
 *  state modules deciding whether to overwrite on import) can await a user
 *  decision without native `confirm()`. Mounted once via GlobalConfirmDialog
 *  in the root layout; only one request can be pending at a time. */
export interface ConfirmRequest {
	title: string;
	message: string;
	confirmLabel?: string;
	danger?: boolean;
	// Optional third choice alongside confirm/cancel — e.g. "Discard" next to
	// "Save"/"Cancel" — for a three-way decision instead of plain yes/no.
	extraLabel?: string;
}

export type ConfirmResult = "confirm" | "extra" | "cancel";

interface PendingConfirm extends ConfirmRequest {
	resolve: (result: ConfirmResult) => void;
}

let pending = $state<PendingConfirm | null>(null);

export function getPendingConfirm(): PendingConfirm | null {
	return pending;
}

export function confirmDialog(request: ConfirmRequest): Promise<boolean> {
	return new Promise((resolve) => {
		pending = { ...request, resolve: (result) => resolve(result === "confirm") };
	});
}

/** Like confirmDialog, but for a three-way choice (e.g. Save / Discard /
 *  Cancel) instead of a plain yes/no. Cancel — including closing the dialog
 *  without picking anything — resolves 'cancel', so callers can leave
 *  whatever they were doing untouched. */
export function confirmDialogWithExtra(
	request: ConfirmRequest & { extraLabel: string },
): Promise<ConfirmResult> {
	return new Promise((resolve) => {
		pending = { ...request, resolve };
	});
}

export function resolvePendingConfirm(result: ConfirmResult): void {
	pending?.resolve(result);
	pending = null;
}
