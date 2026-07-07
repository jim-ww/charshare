<script lang="ts">
	import { exportData, DATA_CATEGORIES, type DataCategory } from '$lib/export/dataExport';

	let exportEverything = $state(true);
	let selected = $state<Record<DataCategory, boolean>>({
		account: true,
		characters: true,
		personas: true,
		chats: true,
		preferences: true
	});

	function handleExport() {
		const categories = exportEverything
			? DATA_CATEGORIES.map((c) => c.id)
			: DATA_CATEGORIES.filter((c) => selected[c.id]).map((c) => c.id);
		exportData(categories);
	}

	const nothingSelected = $derived(
		!exportEverything && DATA_CATEGORIES.every((c) => !selected[c.id])
	);
</script>

<div class="flex flex-col gap-6">
	<div>
		<h3 class="font-semibold">Your data stays on this device</h3>
		<p class="text-sm opacity-70">
			Chats, personas, and local-only (unpublished) characters are never sent over the network —
			this browser is the only copy. Back them up here if you don't want to risk losing them.
		</p>
	</div>

	<div class="flex flex-col gap-3">
		<h3 class="font-semibold">Export</h3>
		<div class="flex flex-col gap-1">
			<label class="flex cursor-pointer items-center gap-2">
				<input
					type="radio"
					class="radio radio-sm"
					name="export-scope"
					checked={exportEverything}
					onchange={() => (exportEverything = true)}
				/>
				<span class="label-text">Export everything</span>
			</label>
			<label class="flex cursor-pointer items-center gap-2">
				<input
					type="radio"
					class="radio radio-sm"
					name="export-scope"
					checked={!exportEverything}
					onchange={() => (exportEverything = false)}
				/>
				<span class="label-text">Choose what to export</span>
			</label>
		</div>

		<div class="flex flex-col gap-2 pl-1">
			{#each DATA_CATEGORIES as category (category.id)}
				<label
					class="flex items-start gap-2"
					class:cursor-pointer={!exportEverything}
					class:opacity-50={exportEverything}
				>
					<input
						type="checkbox"
						class="checkbox checkbox-sm mt-0.5"
						checked={exportEverything || selected[category.id]}
						disabled={exportEverything}
						onchange={(e) =>
							(selected = {
								...selected,
								[category.id]: (e.currentTarget as HTMLInputElement).checked
							})}
					/>
					<span>
						<span class="label-text">{category.label}</span>
						<span class="block text-xs opacity-60">{category.description}</span>
					</span>
				</label>
			{/each}
		</div>

		<button
			class="btn btn-primary self-start"
			type="button"
			disabled={nothingSelected}
			onclick={handleExport}
		>
			Download
		</button>
		<p class="text-xs opacity-60">
			One category downloads as a single JSON file; multiple categories are bundled into a zip.
		</p>
	</div>
</div>
