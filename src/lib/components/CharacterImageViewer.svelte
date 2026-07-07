<script lang="ts">
	interface Props {
		images: string[];
		name: string;
		class?: string;
		aspectSquare?: boolean;
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
		onImageClick,
		keyboardNav = false,
		index = $bindable(0)
	}: Props = $props();
	let loaded = $state(false);
	let failed = $state(false);

	$effect(() => {
		if (index >= images.length) index = 0;
	});

	$effect(() => {
		images[index];
		loaded = false;
		failed = false;
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
		if (event.key === 'ArrowLeft') {
			index = (index - 1 + images.length) % images.length;
		} else if (event.key === 'ArrowRight') {
			index = (index + 1) % images.length;
		}
	}
</script>

<svelte:window onkeydown={keyboardNav ? handleKeydown : undefined} />

<figure
	class="relative {aspectSquare
		? 'aspect-square'
		: 'aspect-[3/4]'} w-full overflow-hidden rounded-box bg-base-300 {className}"
>
	{#if images.length}
		{#if onImageClick}
			<button
				type="button"
				class="h-full w-full cursor-pointer"
				onclick={onImageClick}
				aria-label={`Toggle ${name} image size`}
			>
				<img
					src={images[index]}
					alt={name}
					class="h-full w-full object-cover"
					onload={() => (loaded = true)}
					onerror={() => (failed = true)}
				/>
			</button>
		{:else}
			<img
				src={images[index]}
				alt={name}
				class="h-full w-full object-cover"
				onload={() => (loaded = true)}
				onerror={() => (failed = true)}
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
