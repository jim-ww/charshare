<script lang="ts">
	import {
		exportData,
		importDataFile,
		dataCategories,
		type DataCategory,
		type ImportSummary
	} from '$lib/export/dataExport';
	import { notify } from '$lib/state/notifications.svelte';
	import { deleteAllChats } from '$lib/state/chats.svelte';
	import { confirmDialog } from '$lib/state/confirmDialog.svelte';
	import * as encryption from '$lib/crypto/dataEncryption';
	import { isWailsDesktop, secretServiceSet, secretServiceDelete } from '$lib/wails';
	import PromptDialog from '../PromptDialog.svelte';
	import PassphraseSetupDialog from '../PassphraseSetupDialog.svelte';
	import { m } from '$lib/paraglide/messages.js';

	const DATA_CATEGORIES = $derived(dataCategories());

	let encryptionEnabled = $state(false);
	$effect(() => {
		encryption.isEncryptionEnabled().then((v) => (encryptionEnabled = v));
	});

	let busy = $state(false);

	// enable/change-passphrase both need a "new passphrase" + "confirm" pair
	// (change also needs "current"), gathered as one PassphraseSetupDialog
	// submission rather than chaining separate single-field prompts — under
	// the Wails webview, closing and reopening the same native <dialog> for
	// each chained step turned out to be unreliable (it stayed hidden after
	// the first step). One form avoids reopening the dialog at all.
	let passphraseSetup = $state<{ title: string; requireCurrent: boolean } | null>(null);
	let resolvePassphraseSetup: ((values: { current?: string; next: string } | null) => void) | null = null;

	function askPassphraseSetup(
		title: string,
		requireCurrent: boolean
	): Promise<{ current?: string; next: string } | null> {
		passphraseSetup = { title, requireCurrent };
		return new Promise((resolve) => {
			resolvePassphraseSetup = resolve;
		});
	}

	function handlePassphraseSetupConfirm(values: { current?: string; next: string }) {
		passphraseSetup = null;
		resolvePassphraseSetup?.(values);
		resolvePassphraseSetup = null;
	}

	function handlePassphraseSetupCancel() {
		passphraseSetup = null;
		resolvePassphraseSetup?.(null);
		resolvePassphraseSetup = null;
	}

	// Disabling only ever needs the single current-passphrase field, so the
	// plain single-field PromptDialog (no chaining involved) is still fine.
	let disablePrompt = $state(false);
	let resolveDisablePrompt: ((value: string | null) => void) | null = null;

	function askCurrentPassphrase(): Promise<string | null> {
		disablePrompt = true;
		return new Promise((resolve) => {
			resolveDisablePrompt = resolve;
		});
	}

	function handleDisablePromptConfirm(value: string) {
		disablePrompt = false;
		resolveDisablePrompt?.(value);
		resolveDisablePrompt = null;
	}

	function handleDisablePromptCancel() {
		disablePrompt = false;
		resolveDisablePrompt?.(null);
		resolveDisablePrompt = null;
	}

	async function rememberOnThisDevice(passphrase: string) {
		if (!isWailsDesktop()) return;
		const shouldRemember = await confirmDialog({
			title: m.unlock_gate_remember(),
			message: m.data_tab_encryption_remember_label()
		});
		if (shouldRemember) await secretServiceSet(passphrase).catch(() => {});
	}

	async function handleEnableEncryption() {
		if (busy) return;
		busy = true;
		try {
			const values = await askPassphraseSetup(m.data_tab_encryption_set_passphrase_title(), false);
			if (!values) return;
			try {
				await encryption.enableEncryption(values.next);
			} catch (err) {
				notify(m.error_generic({ message: err instanceof Error ? err.message : String(err) }), {
					kind: 'error',
					duration: 0
				});
				return;
			}
			encryptionEnabled = true;
			notify(m.data_tab_encryption_enabled_done(), { kind: 'success' });
			await rememberOnThisDevice(values.next);
		} finally {
			busy = false;
		}
	}

	async function handleDisableEncryption() {
		if (busy) return;
		busy = true;
		try {
			const passphrase = await askCurrentPassphrase();
			if (!passphrase) return;
			try {
				await encryption.disableEncryption(passphrase);
			} catch {
				notify(m.data_tab_encryption_wrong_passphrase_error(), { kind: 'error' });
				return;
			}
			if (isWailsDesktop()) await secretServiceDelete().catch(() => {});
			encryptionEnabled = false;
			notify(m.data_tab_encryption_disabled_done(), { kind: 'success' });
		} finally {
			busy = false;
		}
	}

	async function handleChangePassphrase() {
		if (busy) return;
		busy = true;
		try {
			const values = await askPassphraseSetup(m.data_tab_encryption_change_passphrase_title(), true);
			if (!values || values.current === undefined) return;
			try {
				await encryption.changePassphrase(values.current, values.next);
			} catch {
				notify(m.data_tab_encryption_wrong_passphrase_error(), { kind: 'error' });
				return;
			}
			notify(m.data_tab_encryption_passphrase_changed_done(), { kind: 'success' });
			await rememberOnThisDevice(values.next);
		} finally {
			busy = false;
		}
	}

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
		try {
			await exportData(categories);
			notify(m.data_tab_export_complete(), { kind: 'success' });
		} catch (err) {
			notify(
				m.data_tab_export_failed({
					message: err instanceof Error ? err.message : String(err)
				}),
				{ kind: 'error', duration: 0 }
			);
		}
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

	let deletingAllChats = $state(false);

	async function handleDeleteAllChats() {
		const confirmed = await confirmDialog({
			title: m.data_tab_delete_all_chats_heading(),
			message: m.data_tab_delete_all_chats_confirm(),
			danger: true
		});
		if (!confirmed) return;
		deletingAllChats = true;
		try {
			await deleteAllChats();
			notify(m.data_tab_delete_all_chats_done(), { kind: 'success' });
		} finally {
			deletingAllChats = false;
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

	<div class="divider"></div>

	<div>
		<h3 class="font-semibold">{m.data_tab_encryption_heading()}</h3>
		<p class="text-sm opacity-70">
			{encryptionEnabled ? m.data_tab_encryption_enabled_body() : m.data_tab_encryption_body()}
		</p>
		<div class="mt-2 flex flex-wrap gap-2">
			{#if encryptionEnabled}
				<button class="btn btn-sm" type="button" disabled={busy} onclick={handleChangePassphrase}>
					{m.data_tab_encryption_change_passphrase_button()}
				</button>
				<button class="btn btn-sm btn-error" type="button" disabled={busy} onclick={handleDisableEncryption}>
					{m.data_tab_encryption_disable_button()}
				</button>
			{:else}
				<button class="btn btn-sm btn-primary" type="button" disabled={busy} onclick={handleEnableEncryption}>
					{m.data_tab_encryption_enable_button()}
				</button>
			{/if}
		</div>
	</div>

	<div class="divider"></div>

	<div>
		<h3 class="text-error font-semibold">{m.data_tab_danger_heading()}</h3>
		<div class="mt-2">
			<h4 class="font-semibold">{m.data_tab_delete_all_chats_heading()}</h4>
			<p class="text-sm opacity-70">
				{m.data_tab_delete_all_chats_body()}
			</p>
			<button
				class="btn btn-sm btn-error mt-2"
				type="button"
				disabled={deletingAllChats}
				onclick={handleDeleteAllChats}
			>
				{m.data_tab_delete_all_chats_button()}
			</button>
		</div>
	</div>
</div>

<PassphraseSetupDialog
	open={passphraseSetup !== null}
	title={passphraseSetup?.title ?? ''}
	requireCurrent={passphraseSetup?.requireCurrent ?? false}
	onconfirm={handlePassphraseSetupConfirm}
	oncancel={handlePassphraseSetupCancel}
/>

<PromptDialog
	open={disablePrompt}
	title={m.data_tab_encryption_current_passphrase_title()}
	inputType="password"
	onconfirm={handleDisablePromptConfirm}
	oncancel={handleDisablePromptCancel}
/>
