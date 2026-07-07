<script lang="ts">
	interface Props {
		name: string;
		imageUrl?: string;
		class?: string;
	}

	let { name, imageUrl, class: className = 'w-8' }: Props = $props();
</script>

<div class="avatar {imageUrl ? '' : 'avatar-placeholder'}">
	<div
		class="bg-neutral text-neutral-content rounded-full shadow-md ring-1 ring-base-content/10 {className}"
	>
		{#if imageUrl}
			<img src={imageUrl} alt={name} class="h-full w-full object-cover" />
		{:else}
			<span class="text-xs">{name.charAt(0).toUpperCase()}</span>
		{/if}
	</div>
</div>
