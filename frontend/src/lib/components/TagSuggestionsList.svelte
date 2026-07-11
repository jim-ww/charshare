<script lang="ts">
	import type { PredefinedTag } from "$lib/data/tags";

	interface Props {
		suggestions: PredefinedTag[];
		highlight: number;
		onhighlight: (index: number) => void;
		onpick: (name: string) => void;
		class?: string;
	}

	let { suggestions, highlight, onhighlight, onpick, class: className = "" }: Props =
		$props();

	let listEl = $state<HTMLUListElement>();

	$effect(() => {
		// Keep the highlighted suggestion in view when navigating by keyboard —
		// arrowing past the edge of the scroll area shouldn't hide the cursor.
		if (highlight < 0) return;
		listEl?.children[highlight]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	});
</script>

<ul
	bind:this={listEl}
	class="dropdown-content menu bg-base-200 rounded-box z-10 mt-1 max-h-64 flex-nowrap gap-0.5 overflow-x-hidden overflow-y-auto p-2 shadow-xl {className}"
>
	{#each suggestions as tag, index (tag.name)}
		<li class="w-full">
			<button
				type="button"
				class="flex w-full items-center justify-between gap-2"
				class:menu-active={index === highlight}
				title={tag.description ?? tag.name}
				onmousedown={(e) => e.preventDefault()}
				onmouseenter={() => onhighlight(index)}
				onclick={() => onpick(tag.name)}
			>
				<span class="shrink-0">{tag.name}</span>
				{#if tag.description}
					<span class="text-right text-xs opacity-60">{tag.description}</span>
				{/if}
			</button>
		</li>
	{/each}
</ul>
