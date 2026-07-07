<script lang="ts">
	interface Props {
		images: string[];
		name: string;
		class?: string;
		/** If provided, the image itself becomes clickable (used by chat's expand/collapse toggle). */
		onImageClick?: () => void;
	}

	let { images, name, class: className = '', onImageClick }: Props = $props();

	let index = $state(0);

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
</script>

<figure class="relative aspect-[3/4] w-full overflow-hidden rounded-box bg-base-300 {className}">
	{#if images.length}
		{#if onImageClick}
			<button
				type="button"
				class="h-full w-full cursor-pointer"
				onclick={onImageClick}
				aria-label={`Toggle ${name} image size`}
			>
				<img src={images[index]} alt={name} class="h-full w-full object-cover" />
			</button>
		{:else}
			<img src={images[index]} alt={name} class="h-full w-full object-cover" />
		{/if}
		{#if images.length > 1}
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
