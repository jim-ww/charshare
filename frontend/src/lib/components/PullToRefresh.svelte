<script lang="ts">
	// Mobile-only pull-down-to-refresh gesture: browsers show this natively for
	// plain webpages, but neither the installed PWA nor the Android WebView
	// (Wails) gets it for free, so we fake it. Calls the caller's own refresh
	// logic rather than location.reload() — Wails serves the app from a custom
	// wails.localhost scheme that a hard reload can't always re-navigate to.
	import type { Snippet } from "svelte";

	interface Props {
		onrefresh: () => Promise<unknown>;
		children: Snippet;
	}

	let { onrefresh, children }: Props = $props();

	const THRESHOLD = 72;
	const MAX_PULL = 120;

	let pull = $state(0);
	let refreshing = $state(false);
	let startY = 0;
	let tracking = false;

	function handleTouchStart(event: TouchEvent) {
		if (refreshing || window.scrollY > 0) {
			tracking = false;
			return;
		}
		tracking = true;
		startY = event.touches[0].clientY;
	}

	function handleTouchMove(event: TouchEvent) {
		if (!tracking || refreshing) return;
		const delta = event.touches[0].clientY - startY;
		if (delta <= 0) {
			pull = 0;
			return;
		}
		if (window.scrollY > 0) {
			tracking = false;
			pull = 0;
			return;
		}
		// Damped so the indicator eases up as you pull further, and only
		// prevent the page's own scroll once we're actually dragging it down.
		event.preventDefault();
		pull = Math.min(MAX_PULL, delta * 0.5);
	}

	async function handleTouchEnd() {
		if (!tracking) return;
		tracking = false;
		if (pull >= THRESHOLD) {
			refreshing = true;
			pull = THRESHOLD;
			try {
				await onrefresh();
			} finally {
				refreshing = false;
				pull = 0;
			}
		} else {
			pull = 0;
		}
	}
</script>

<svelte:window
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
	ontouchcancel={handleTouchEnd}
/>

<div
	class="flex items-center justify-center overflow-hidden transition-[height] duration-200 ease-out"
	style:height="{pull}px"
	aria-hidden="true"
>
	<div
		class="h-6 w-6 rounded-full border-2 border-base-content/30 border-t-primary {refreshing
			? 'animate-spin'
			: ''}"
		style:transform={refreshing ? undefined : `rotate(${(pull / THRESHOLD) * 360}deg)`}
		style:opacity={Math.min(1, pull / THRESHOLD)}
	></div>
</div>

{@render children()}
