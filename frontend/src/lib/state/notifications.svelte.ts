/** General-purpose transient-message stack — toasts/banners for things a user
 *  should notice but that don't warrant a modal (e.g. a username conflict
 *  auto-resolved in the background). Not tied to any one feature; anything
 *  that needs to surface a one-off message to the user should reuse this
 *  rather than growing another single-purpose inline `<p class="text-error">`
 *  pattern. */
export type NotificationKind = 'info' | 'success' | 'warning' | 'error';

export interface NotificationAction {
	label: string;
	onClick: () => void;
}

export interface Notification {
	id: string;
	message: string;
	kind: NotificationKind;
	action?: NotificationAction;
}

let notifications = $state<Notification[]>([]);

export function getNotifications(): Notification[] {
	return notifications;
}

const DEFAULT_DURATION_MS = 7000;

/** Adds a notification to the stack, returning its id so a caller can
 *  dismiss it early (e.g. once its action has been taken). `duration` in ms
 *  controls auto-dismiss; pass `0` for a sticky notification that stays
 *  until the user manually dismisses it — use this for anything important
 *  enough that it shouldn't just vanish before being read. */
export function notify(
	message: string,
	options?: { kind?: NotificationKind; duration?: number; action?: NotificationAction }
): string {
	const id = crypto.randomUUID();
	const kind = options?.kind ?? 'info';
	const duration = options?.duration ?? DEFAULT_DURATION_MS;
	notifications = [...notifications, { id, message, kind, action: options?.action }];
	if (duration > 0) {
		setTimeout(() => dismissNotification(id), duration);
	}
	return id;
}

export function dismissNotification(id: string): void {
	notifications = notifications.filter((n) => n.id !== id);
}
