/** Singleton confirm-modal service, so code outside component tree (e.g.
 *  state modules deciding whether to overwrite on import) can await a user
 *  decision without native `confirm()`. Mounted once via GlobalConfirmDialog
 *  in the root layout; only one request can be pending at a time. */
export interface ConfirmRequest {
	title: string;
	message: string;
	confirmLabel?: string;
	danger?: boolean;
}

interface PendingConfirm extends ConfirmRequest {
	resolve: (confirmed: boolean) => void;
}

let pending = $state<PendingConfirm | null>(null);

export function getPendingConfirm(): PendingConfirm | null {
	return pending;
}

export function confirmDialog(request: ConfirmRequest): Promise<boolean> {
	return new Promise((resolve) => {
		pending = { ...request, resolve };
	});
}

export function resolvePendingConfirm(confirmed: boolean): void {
	pending?.resolve(confirmed);
	pending = null;
}
