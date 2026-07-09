<script lang="ts">
	interface Props {
		images: string[];
		name: string;
		class?: string;
		aspectSquare?: boolean;
		/** Show the full image uncropped (object-contain) within the normal aspect-ratio box, letterboxed. */
		contain?: boolean;
		/** Uncropped and shrink-wrapped to the image's own aspect ratio instead of a fixed box (used by the full-size modal view). */
		fullSize?: boolean;
		/** If provided, the image itself becomes clickable (used by chat's expand/collapse toggle). */
		onImageClick?: () => void;
		/** Listen for arrow key presses to switch images (used by the expanded/modal view). */
		keyboardNav?: boolean;
		/** Bindable current image index, so multiple viewers of the same images can stay in sync. */
		index?: number;
	}

	let {
		images,
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
	const currentSrc = $derived(images[index] as string | undefined);
	const loaded = $derived(loadedSrc === currentSrc);
	const failed = $derived(failedSrc === currentSrc);

	$effect(() => {
		if (index >= images.length) index = 0;
	});

	function prev(event: MouseEvent) {
		event.stopPropagation();
		index = (index - 1 + images.length) % images.length;
	}

	function next(event: MouseEvent) {
		event.stopPropagation();
		index = (index + 1) % images.length;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (images.length < 2) return;
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		if (event.key === 'ArrowLeft') {
			index = (index - 1 + images.length) % images.length;
		} else if (event.key === 'ArrowRight') {
			index = (index + 1) % images.length;
		}
	}
</script>

<svelte:window onkeydown={keyboardNav ? handleKeydown : undefined} />

<figure
	class="relative {fullSize
		? 'inline-flex min-h-32 min-w-32 max-h-[90vh] max-w-[90vw] items-center justify-center'
		: `${aspectSquare ? 'aspect-square' : 'aspect-[3/4]'} w-full overflow-hidden bg-base-300`} rounded-box {className}"
>
	{#if images.length}
		{#if onImageClick}
			<button
				type="button"
				class="{fullSize ? 'contents' : 'h-full w-full'} cursor-pointer"
				onclick={onImageClick}
				aria-label={`Toggle ${name} image size`}
			>
				<img
					src={images[index]}
					alt={name}
					class={fullSize
						? 'max-h-[90vh] max-w-[90vw] rounded-box object-contain'
						: `h-full w-full ${contain ? 'object-contain' : 'object-cover'}`}
					onload={() => (loadedSrc = images[index])}
					onerror={() => (failedSrc = images[index])}
				/>
			</button>
		{:else}
			<img
				src={images[index]}
				alt={name}
				class="h-full w-full {contain ? 'object-contain' : 'object-cover'}"
				onload={() => (loadedSrc = images[index])}
				onerror={() => (failedSrc = images[index])}
			/>
		{/if}
		{#if failed}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-base-300 text-center text-sm opacity-70">
				<span>⚠</span>
				<span>Image failed to load</span>
			</div>
		{:else if !loaded}
			<div class="absolute inset-0 flex items-center justify-center bg-base-300">
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{/if}
		{#if images.length > 1}
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
					aria-label="Previous image"
				>
					‹
				</button>
			{/if}
			{#if index < images.length - 1}
				<button
					type="button"
					class="btn btn-circle btn-sm absolute right-2 top-1/2 -translate-y-1/2"
					onclick={next}
					aria-label="Next image"
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
