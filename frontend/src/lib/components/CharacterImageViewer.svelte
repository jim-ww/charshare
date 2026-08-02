<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { MediaItem } from '$lib/types';
	import { mediaProxyUrl } from '$lib/types/media';
	import { getMediaBackupObjectUrl } from '$lib/state/mediaBackup.svelte';

	interface Props {
		media: MediaItem[];
		name: string;
		class?: string;
		aspectSquare?: boolean;
		/** Show the full image uncropped (object-contain) within the normal aspect-ratio box, letterboxed. */
		contain?: boolean;
		/** Uncropped and shrink-wrapped to the image's own aspect ratio instead of a fixed box (used by the full-size modal view). */
		fullSize?: boolean;
		/** If provided, an image slide itself becomes clickable (used by chat's expand/collapse toggle) — video slides have native controls instead, so this is ignored for them. */
		onImageClick?: () => void;
		/** Listen for arrow key presses to switch images (used by the expanded/modal view). */
		keyboardNav?: boolean;
		/** Bindable current slide index, so multiple viewers of the same media can stay in sync. */
		index?: number;
	}

	let {
		media,
		name,
		class: className = '',
		aspectSquare = false,
		contain = false,
		fullSize = false,
		onImageClick,
		keyboardNav = false,
		index = $bindable(0)
	}: Props = $props();
	// Tracks which src last fired onload/onerror, rather than a plain
	// loaded/failed boolean reset in an effect keyed on `index` — that reset
	// races the <img>'s own onload for cached images (onload can fire before
	// the effect runs), permanently clobbering an already-loaded image back
	// to "loading" with no event left to undo it. Deriving from the src
	// instead means there's no ordering to race.
	let loadedSrc = $state<string | null>(null);
	let failedSrc = $state<string | null>(null);
	// Once a remote image URL fails, checked against the locally backed-up
	// copy (see state/mediaBackup.svelte.ts) — keyed by the original url the
	// fallback is for, same as loadedSrc/failedSrc, so switching away and back
	// to a slide that failed for a *different* reason doesn't keep showing a
	// stale fallback.
	let fallbackForUrl = $state<string | null>(null);
	let fallbackObjectUrl = $state<string | null>(null);
	const current = $derived(media[index] as MediaItem | undefined);
	const currentSrc = $derived(current?.url);
	const usingFallback = $derived(fallbackForUrl === currentSrc && fallbackObjectUrl !== null);
	// A cache-busting suffix appended only for the specific url currently being
	// retried — a plain re-render wouldn't refetch a src the browser already
	// has marked as failed/cached.
	let retryUrl = $state<string | null>(null);
	let retryNonce = $state(0);
	const rawSrc = $derived(usingFallback ? fallbackObjectUrl! : currentSrc);
	const displaySrc = $derived(
		rawSrc && retryUrl === currentSrc
			? `${rawSrc}${rawSrc.includes('?') ? '&' : '?'}retry=${retryNonce}`
			: rawSrc
	);
	const loaded = $derived(loadedSrc === currentSrc || usingFallback);
	const failed = $derived(failedSrc === currentSrc && !usingFallback);

	async function handleImageError(url: string) {
		failedSrc = url;
		const objectUrl = await getMediaBackupObjectUrl(url);
		if (!objectUrl) return;
		fallbackForUrl = url;
		fallbackObjectUrl = objectUrl;
	}

	function reload(event: MouseEvent) {
		event.stopPropagation();
		if (!currentSrc) return;
		retryUrl = currentSrc;
		retryNonce++;
		failedSrc = null;
		fallbackForUrl = null;
		fallbackObjectUrl = null;
	}

	$effect(() => {
		if (index >= media.length) index = 0;
	});

	// Keeps the active thumbnail visible in the minimap as `index` changes via
	// prev/next, arrow keys, or Home/End — without this, navigating past the
	// edge of the (horizontally scrolling) strip leaves the highlighted
	// thumbnail off-screen with no visual confirmation of where you are.
	let minimapEl: HTMLDivElement | undefined = $state();
	$effect(() => {
		index;
		minimapEl
			?.querySelector(`[data-index="${index}"]`)
			?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
	});

	function prev(event: MouseEvent) {
		event.stopPropagation();
		index = (index - 1 + media.length) % media.length;
	}

	function next(event: MouseEvent) {
		event.stopPropagation();
		index = (index + 1) % media.length;
	}

	// keyboardNav is also used on the always-visible chat thumbnail (not just
	// the modal), so arrow keys must not hijack cursor movement while typing
	// in the message box or any other text field.
	function isTypingTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		return (
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target.isContentEditable
		);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (media.length < 2) return;
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		if (isTypingTarget(event.target)) return;
		if (event.key === 'ArrowLeft') {
			index = (index - 1 + media.length) % media.length;
		} else if (event.key === 'ArrowRight') {
			index = (index + 1) % media.length;
		} else if (event.key === 'Home') {
			index = 0;
		} else if (event.key === 'End') {
			index = media.length - 1;
		}
	}

	// Restarts a beat before the end instead of relying on the native `loop`
	// attribute — letting the video actually reach 'ended' and having the
	// browser restart it shows a brief flash of the poster/blank frame at the
	// seam. Seeking back just before that point never lets playback end, so
	// there's nothing for the browser to flash to.
	function loopVideo(event: Event) {
		const video = event.currentTarget as HTMLVideoElement;
		if (video.duration - video.currentTime < 0.2) {
			video.currentTime = 0;
		}
	}

	// Fallback for when timeupdate's granularity skips right past the
	// restart window above and the video actually reaches 'ended' — without
	// this, playback would just stop there since the native `loop` attribute
	// isn't used. Rare enough that the one-off flash it causes doesn't matter.
	function restartAfterEnded(event: Event) {
		const video = event.currentTarget as HTMLVideoElement;
		video.currentTime = 0;
		void video.play();
	}
</script>

<svelte:window onkeydown={keyboardNav ? handleKeydown : undefined} />

<div class="flex flex-col items-center gap-2">
<figure
	class="relative {fullSize
		? 'inline-flex min-h-32 min-w-32 max-h-[calc(100vh-1.5rem)] max-w-[calc(100vw-1.5rem)] items-center justify-center sm:max-h-[calc(100vh-3rem)] sm:max-w-[calc(100vw-3rem)]'
		: `${aspectSquare ? 'aspect-square' : 'aspect-[3/4]'} w-full overflow-hidden bg-base-300`} rounded-box {className}"
>
	{#if current}
		{@const mediaClass = fullSize
			? 'max-h-[calc(100vh-1.5rem)] max-w-[calc(100vw-1.5rem)] rounded-box object-contain sm:max-h-[calc(100vh-3rem)] sm:max-w-[calc(100vw-3rem)]'
			: `h-full w-full ${contain ? 'object-contain' : 'object-cover'}`}
		{#if current.type === 'video'}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				src={mediaProxyUrl(current.url)}
				controls
				autoplay
				muted
				playsinline
				class={mediaClass}
				onloadeddata={() => (loadedSrc = current.url)}
				onerror={() => (failedSrc = current.url)}
				ontimeupdate={loopVideo}
				onended={restartAfterEnded}
			></video>
		{:else if onImageClick}
			<button
				type="button"
				class="{fullSize ? 'contents' : 'h-full w-full'} cursor-pointer"
				onclick={onImageClick}
				aria-label={m.char_image_viewer_toggle_size({ name })}
			>
				<img
					src={displaySrc}
					alt={name}
					class={mediaClass}
					onload={() => (loadedSrc = current.url)}
					onerror={() => handleImageError(current.url)}
				/>
			</button>
		{:else}
			<img
				src={displaySrc}
				alt={name}
				class={mediaClass}
				onload={() => (loadedSrc = current.url)}
				onerror={() => handleImageError(current.url)}
			/>
		{/if}
		{#if failed}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-base-300 text-center text-sm opacity-90">
				<span>⚠</span>
				<span>{m.char_image_viewer_load_failed()}</span>
				<button type="button" class="btn btn-sm" onclick={reload}>
					{m.char_image_viewer_reload()}
				</button>
			</div>
		{:else if !loaded}
			<div class="absolute inset-0 flex items-center justify-center bg-base-300">
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{/if}
		{#if media.length > 1}
			<span
				class="badge badge-neutral absolute left-2 top-2 opacity-80"
			>
				{index + 1}
			</span>
			{#if index > 0}
				<button
					type="button"
					class="btn btn-circle btn-sm absolute left-2 top-1/2 -translate-y-1/2"
					onclick={prev}
					aria-label={m.char_image_viewer_previous()}
				>
					‹
				</button>
			{/if}
			{#if index < media.length - 1}
				<button
					type="button"
					class="btn btn-circle btn-sm absolute right-2 top-1/2 -translate-y-1/2"
					onclick={next}
					aria-label={m.char_image_viewer_next()}
				>
					›
				</button>
			{/if}
		{/if}
	{:else}
		<div class="flex h-full w-full items-center justify-center text-6xl opacity-30">
			{name.charAt(0).toUpperCase()}
		</div>
	{/if}
</figure>
{#if fullSize && media.length > 1}
	<!-- Minimap: jump straight to any slide (first/last/Nth) instead of
	     stepping through prev/next one at a time. Only shown in the expanded
	     modal view — the small in-card viewer has no room for it. -->
	<div bind:this={minimapEl} class="flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1">
		{#each media as item, i (item.url + i)}
			<button
				type="button"
				data-index={i}
				class="h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 {i === index
					? 'border-primary'
					: 'border-transparent opacity-50 hover:opacity-100'}"
				onclick={() => (index = i)}
				aria-label={m.char_image_viewer_jump_to({ n: i + 1 })}
				aria-current={i === index}
			>
				{#if item.type === 'video'}
					<div class="flex h-full w-full items-center justify-center bg-base-300 text-xs">▶</div>
				{:else}
					<img src={item.url} alt="" loading="lazy" class="h-full w-full object-cover" />
				{/if}
			</button>
		{/each}
	</div>
{/if}
</div>
