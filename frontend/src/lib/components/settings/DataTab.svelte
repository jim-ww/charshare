<script lang="ts">
	import {
		exportData,
		importDataFile,
		dataCategories,
		type DataCategory,
		type ImportSummary
	} from '$lib/export/dataExport';
	import { m } from '$lib/paraglide/messages.js';

	const DATA_CATEGORIES = $derived(dataCategories());

	let exportEverything = $state(true);
	let selected = $state<Record<DataCategory, boolean>>({
		account: true,
		characters: true,
		savedCharacters: true,
		personas: true,
		chats: true,
		preferences: true
	});

	async function handleExport() {
		const categories = exportEverything
			? DATA_CATEGORIES.map((c) => c.id)
			: DATA_CATEGORIES.filter((c) => selected[c.id]).map((c) => c.id);
		await exportData(categories);
	}

	const nothingSelected = $derived(
		!exportEverything && DATA_CATEGORIES.every((c) => !selected[c.id])
	);

	const categoryLabel = (id: DataCategory) =>
		DATA_CATEGORIES.find((c) => c.id === id)?.label ?? id;

	let importing = $state(false);
	let importError = $state<string | null>(null);
	let importSummaries = $state<ImportSummary[] | null>(null);

	async function handleImportFile(event: Event) {
		importError = null;
		importSummaries = null;
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		importing = true;
		try {
			importSummaries = await importDataFile(file);
		} catch (err) {
			importError = m.error_generic({
				message: err instanceof Error ? err.message : String(err)
			});
		} finally {
			importing = false;
			input.value = '';
		}
	}
</script>

<div class="flex flex-col gap-6">
	<div>
		<h3 class="font-semibold">{m.data_tab_local_heading()}</h3>
		<p class="text-sm opacity-70">
			{m.data_tab_local_body()}
		</p>
	</div>

	<div class="flex flex-col gap-3">
		<h3 class="font-semibold">{m.data_tab_export_heading()}</h3>
		<div class="flex flex-col gap-1">
			<label class="flex cursor-pointer items-center gap-2">
				<input
					type="radio"
					class="radio radio-sm"
					name="export-scope"
					checked={exportEverything}
					onchange={() => (exportEverything = true)}
				/>
				<span class="label-text">{m.data_tab_export_everything()}</span>
			</label>
			<label class="flex cursor-pointer items-center gap-2">
				<input
					type="radio"
					class="radio radio-sm"
					name="export-scope"
					checked={!exportEverything}
					onchange={() => (exportEverything = false)}
				/>
				<span class="label-text">{m.data_tab_choose_export()}</span>
			</label>
		</div>

		<div class="flex flex-col gap-2 pl-1">
			{#if !exportEverything}
				<div class="flex gap-3">
					<button
						class="btn btn-ghost btn-xs"
						type="button"
						onclick={() =>
							(selected = Object.fromEntries(
								DATA_CATEGORIES.map((c) => [c.id, true])
							) as Record<DataCategory, boolean>)}
					>
						{m.data_tab_select_all()}
					</button>
					<button
						class="btn btn-ghost btn-xs"
						type="button"
						onclick={() =>
							(selected = Object.fromEntries(
								DATA_CATEGORIES.map((c) => [c.id, false])
							) as Record<DataCategory, boolean>)}
					>
						{m.data_tab_select_none()}
					</button>
				</div>
			{/if}
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
			{m.data_tab_download()}
		</button>
		<p class="text-xs opacity-60">
			{m.data_tab_download_hint()}
		</p>
	</div>

	<div class="divider"></div>

	<div class="flex flex-col gap-2">
		<h3 class="font-semibold">{m.data_tab_import_heading()}</h3>
		<p class="text-sm opacity-70">
			{m.data_tab_import_body()}
		</p>
		<input
			class="file-input file-input-bordered file-input-sm"
			type="file"
			accept="application/json,.json,application/zip,.zip"
			disabled={importing}
			onchange={handleImportFile}
		/>
		{#if importing}
			<p class="text-sm opacity-60">{m.data_tab_importing()}</p>
		{/if}
		{#if importError}
			<p class="text-error text-sm">{importError}</p>
		{/if}
		{#if importSummaries && importSummaries.length}
			<ul class="text-success text-sm">
				{#each importSummaries as summary (summary.category)}
					<li>
						{m.data_tab_imported_count({
							category: categoryLabel(summary.category),
							count: summary.count !== undefined ? ` (${summary.count})` : ''
						})}
						{#if summary.skipped}
							<span class="opacity-70">— {m.data_tab_skipped_unchanged({ skipped: String(summary.skipped) })}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
