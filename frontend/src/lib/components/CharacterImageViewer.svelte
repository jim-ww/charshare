<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { MediaItem } from '$lib/types';
	import { mediaProxyUrl } from '$lib/types/media';

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
	const current = $derived(media[index] as MediaItem | undefined);
	const currentSrc = $derived(current?.url);
	const loaded = $derived(loadedSrc === currentSrc);
	const failed = $derived(failedSrc === currentSrc);

	$effect(() => {
		if (index >= media.length) index = 0;
	});

	function prev(event: MouseEvent) {
		event.stopPropagation();
		index = (index - 1 + media.length) % media.length;
	}

	function next(event: MouseEvent) {
		event.stopPropagation();
		index = (index + 1) % media.length;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (media.length < 2) return;
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		if (event.key === 'ArrowLeft') {
			index = (index - 1 + media.length) % media.length;
		} else if (event.key === 'ArrowRight') {
			index = (index + 1) % media.length;
		}
	}
</script>

<svelte:window onkeydown={keyboardNav ? handleKeydown : undefined} />

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
				loop
				class={mediaClass}
				onloadeddata={() => (loadedSrc = current.url)}
				onerror={() => (failedSrc = current.url)}
			></video>
		{:else if onImageClick}
			<button
				type="button"
				class="{fullSize ? 'contents' : 'h-full w-full'} cursor-pointer"
				onclick={onImageClick}
				aria-label={m.char_image_viewer_toggle_size({ name })}
			>
				<img
					src={current.url}
					alt={name}
					class={mediaClass}
					onload={() => (loadedSrc = current.url)}
					onerror={() => (failedSrc = current.url)}
				/>
			</button>
		{:else}
			<img
				src={current.url}
				alt={name}
				class={mediaClass}
				onload={() => (loadedSrc = current.url)}
				onerror={() => (failedSrc = current.url)}
			/>
		{/if}
		{#if failed}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-base-300 text-center text-sm opacity-70">
				<span>⚠</span>
				<span>{m.char_image_viewer_load_failed()}</span>
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
