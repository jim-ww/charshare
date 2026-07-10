<script lang="ts">
	import { getNotifications, dismissNotification } from "$lib/state/notifications.svelte";

	const kindToAlertClass: Record<string, string> = {
		info: "alert-info",
		success: "alert-success",
		warning: "alert-warning",
		error: "alert-error",
	};

	function handleAction(id: string, onClick: () => void) {
		onClick();
		dismissNotification(id);
	}
</script>

<div class="toast toast-top toast-end z-[60]">
	{#each getNotifications() as notification (notification.id)}
		<div class="alert {kindToAlertClass[notification.kind]} shadow-lg">
			<span>{notification.message}</span>
			{#if notification.action}
				{@const action = notification.action}
				<button
					type="button"
					class="btn btn-sm"
					onclick={() => handleAction(notification.id, action.onClick)}
				>
					{action.label}
				</button>
			{/if}
			<button
				type="button"
				class="btn btn-sm btn-ghost"
				aria-label="Dismiss"
				onclick={() => dismissNotification(notification.id)}
			>
				✕
			</button>
		</div>
	{/each}
</div>
