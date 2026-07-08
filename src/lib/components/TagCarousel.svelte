<script lang="ts">
	import { PREDEFINED_TAGS } from "$lib/data/tags";

	interface Props {
		onpick: (tag: string) => void;
	}

	let { onpick }: Props = $props();
	let expanded = $state(false);
</script>

<div class="w-full max-w-3xl">
	<div class="flex items-center gap-2">
		{#if !expanded}
			<div
				class="flex flex-1 gap-2 overflow-x-auto scroll-smooth py-1"
			>
				{#each PREDEFINED_TAGS as tag (tag.name)}
					<button
						type="button"
						class="badge badge-lg shrink-0 cursor-pointer whitespace-nowrap"
						title={tag.description ?? tag.name}
						onclick={() => onpick(tag.name)}
					>
						{tag.name}
					</button>
				{/each}
			</div>
		{:else}
			<div class="flex flex-1 flex-wrap gap-2 py-1">
				{#each PREDEFINED_TAGS as tag (tag.name)}
					<button
						type="button"
						class="badge badge-lg cursor-pointer whitespace-nowrap"
						title={tag.description ?? tag.name}
						onclick={() => onpick(tag.name)}
					>
						{tag.name}
					</button>
				{/each}
			</div>
		{/if}
		<button
			type="button"
			class="btn btn-circle btn-ghost btn-sm shrink-0"
			title={expanded ? "Show tags as carousel" : "Show all tags"}
			onclick={() => (expanded = !expanded)}
		>
			<svg
				class="h-4 w-4 transition-transform"
				class:rotate-180={expanded}
				viewBox="0 0 20 20"
				fill="currentColor"
			>
				<path
					fill-rule="evenodd"
					d="M5.23 7.21a.75.75 0 011.06.02L10 11.293l3.71-4.06a.75.75 0 111.08 1.04l-4.25 4.65a.75.75 0 01-1.08 0l-4.25-4.65a.75.75 0 01.02-1.06z"
					clip-rule="evenodd"
				/>
			</svg>
		</button>
	</div>
</div>
