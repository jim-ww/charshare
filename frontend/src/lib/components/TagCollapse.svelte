<script lang="ts">
	import TagCarousel from "./TagCarousel.svelte";

	interface Props {
		selected: Set<string>;
		ontoggle: (tag: string) => void;
		label: string;
	}

	let { selected, ontoggle, label }: Props = $props();
</script>

<!--
	TagCarousel's own "collapsed" state still renders the full category-filter
	row, the custom-tag input, and a slice of the tag cloud — real height even
	before the user's touched it. This wraps it in a genuine collapse: closed,
	it's a single line (label + a chip row of whatever's already selected);
	the category/cloud picker only exists in the DOM's rendered layout once
	opened.
-->
<div class="collapse-arrow bg-base-200 border-base-300 collapse border">
	<input type="checkbox" />
	<div class="collapse-title label-text flex flex-wrap items-center gap-1.5 font-medium">
		<span>{label}{selected.size ? ` (${selected.size})` : ""}</span>
		{#each [...selected] as tag (tag)}
			<span class="badge badge-sm badge-primary">{tag}</span>
		{/each}
	</div>
	<div class="collapse-content">
		<TagCarousel {selected} {ontoggle} />
	</div>
</div>
