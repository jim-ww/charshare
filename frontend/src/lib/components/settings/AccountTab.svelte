<script lang="ts">
	import {
		getMyProfile,
		isProfileReady,
		isProfileSynced,
		saveProfile,
		registerAccount,
		loadProfileForSwitchedAccount
	} from '$lib/state/profile.svelte';
	import { getKeyring, isAccountRegistered, setKeyring, logout } from '$lib/state/auth.svelte';
	import { exportAccountBackup, parseAccountBackup } from '$lib/identity/backup';
	import { categoryFilename } from '$lib/export/dataExport';
	import { clearProfileForLogout } from '$lib/state/profile.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { notify } from '$lib/state/notifications.svelte';
	import ConfirmDialog from '../ConfirmDialog.svelte';

	const profileReady = $derived(isProfileReady());
	const profileSynced = $derived(isProfileSynced());
	const registered = $derived(isAccountRegistered());

	let username = $state('');
	let description = $state('');
	let imageUrl = $state('');
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let justSaved = $state(false);
	let saveTimeout: ReturnType<typeof setTimeout> | undefined;
	let loadedFromProfile = false;

	let importError = $state<string | null>(null);
	let imported = $state(false);
	let confirmingLogout = $state(false);

	// Seed the form from the loaded profile exactly once, so typing doesn't
	// get clobbered by re-derivation on every profile-state read.
	$effect(() => {
		if (profileReady && registered && !loadedFromProfile) {
			const profile = getMyProfile();
			username = profile?.username ?? '';
			description = profile?.description ?? '';
			imageUrl = profile?.image_url ?? '';
			loadedFromProfile = true;
		}
	});

	async function handleRegister(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		saveError = null;
		try {
			await registerAccount({ username, description, image_url: imageUrl.trim() || undefined });
			loadedFromProfile = true;
			notify(m.account_tab_publish_backup_notice(), {
				kind: 'warning',
				duration: 0,
				action: { label: m.account_tab_publish_backup_notice_action(), onClick: handleExport }
			});
		} catch (err) {
			saveError = m.error_generic({
				message: err instanceof Error ? err.message : String(err)
			});
		} finally {
			saving = false;
		}
	}

	async function handleSave(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		saveError = null;
		try {
			await saveProfile({ username, description, image_url: imageUrl.trim() || undefined });
			justSaved = true;
			clearTimeout(saveTimeout);
			saveTimeout = setTimeout(() => {
				justSaved = false;
			}, 2000);
		} catch (err) {
			saveError = m.error_generic({
				message: err instanceof Error ? err.message : String(err)
			});
		} finally {
			saving = false;
		}
	}

	function handleExport() {
		const keyring = getKeyring();
		if (!keyring) return;
		const json = exportAccountBackup(keyring, getMyProfile());
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = categoryFilename('account');
		a.click();
		URL.revokeObjectURL(url);
	}

	function handleLogout() {
		confirmingLogout = true;
	}

	async function confirmLogout() {
		confirmingLogout = false;
		await logout();
		clearProfileForLogout();
		loadedFromProfile = false;
		username = '';
		description = '';
		imageUrl = '';
	}

	async function handleImportFile(event: Event) {
		importError = null;
		imported = false;
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const text = await file.text();
			const backup = parseAccountBackup(text);
			await setKeyring(backup.keyring);
			loadedFromProfile = false;
			await loadProfileForSwitchedAccount(backup.profileFields);
			imported = true;
		} catch (err) {
			importError = m.error_generic({
				message: err instanceof Error ? err.message : String(err)
			});
		} finally {
			input.value = '';
		}
	}
</script>

{#if !profileReady}
	<p>{m.account_tab_loading()}</p>
{:else if !registered}
	<div class="flex flex-col gap-6">
		<div>
			<h3 class="font-semibold">{m.account_tab_guest_heading()}</h3>
			<p class="text-sm opacity-70">
				{m.account_tab_guest_body()}
			</p>
		</div>

		<form class="flex flex-col gap-3" onsubmit={handleRegister}>
			<h3 class="font-semibold">{m.account_tab_create_heading()}</h3>
			<label class="form-control">
				<span class="label-text">{m.account_tab_username_label()}</span>
				<input class="input input-bordered w-full" bind:value={username} required />
			</label>
			<label class="form-control">
				<span class="label-text">{m.account_tab_description_label()}</span>
				<textarea class="textarea textarea-bordered w-full" bind:value={description}></textarea>
			</label>
			<label class="form-control">
				<span class="label-text">{m.account_tab_image_url_label()}</span>
				<input
					class="input input-bordered w-full"
					type="url"
					placeholder={m.account_tab_image_url_placeholder()}
					bind:value={imageUrl}
				/>
			</label>
			<button class="btn btn-primary self-start" type="submit" disabled={saving}>
				{saving ? m.account_tab_creating() : m.account_tab_create_account()}
			</button>
			{#if saveError}
				<p class="text-error text-sm">{saveError}</p>
			{/if}
		</form>

		<div class="divider"></div>

		<div>
			<h3 class="font-semibold">{m.account_tab_have_account_heading()}</h3>
			<p class="text-sm opacity-70">
				{m.account_tab_have_account_body()}
			</p>
			<div class="mt-2 flex flex-col gap-2">
				<input
					class="file-input file-input-bordered file-input-sm"
					type="file"
					accept="application/json,.json"
					onchange={handleImportFile}
				/>
				{#if importError}
					<p class="text-error text-sm">{importError}</p>
				{/if}
				{#if imported}
					<p class="text-success text-sm">{m.account_tab_signed_in()}</p>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<div class="flex flex-col gap-6">
		<div class="badge gap-1.5 {profileSynced ? 'badge-success' : 'badge-ghost'}">
			{#if !profileSynced}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			{profileSynced ? m.account_tab_synced() : m.account_tab_syncing()}
		</div>
		<form class="flex flex-col gap-3" onsubmit={handleSave}>
			<label class="form-control">
				<span class="label-text">{m.account_tab_username_label()}</span>
				<input class="input input-bordered w-full" bind:value={username} />
			</label>
			<label class="form-control">
				<span class="label-text">{m.account_tab_description_label()}</span>
				<textarea class="textarea textarea-bordered w-full" bind:value={description}></textarea>
			</label>
			<label class="form-control">
				<span class="label-text">{m.account_tab_image_url_label()}</span>
				<input
					class="input input-bordered w-full"
					type="url"
					placeholder={m.account_tab_image_url_placeholder()}
					bind:value={imageUrl}
				/>
			</label>
			<div class="flex items-center gap-2">
				<button class="btn btn-primary self-start" type="submit" disabled={saving}>
					{saving ? m.account_tab_saving() : m.account_tab_save_profile()}
				</button>
				{#if justSaved}
					<span class="text-success text-sm">{m.account_tab_saved()}</span>
				{/if}
			</div>
			{#if saveError}
				<p class="text-error text-sm">{saveError}</p>
			{/if}
		</form>

		<div class="divider"></div>

		<div>
			<h3 class="font-semibold">{m.account_tab_backup_heading()}</h3>
			<p class="text-sm opacity-70">
				{m.account_tab_backup_body()}
			</p>
			<button class="btn btn-sm mt-2" type="button" onclick={handleExport}
				>{m.account_tab_download_backup()}</button
			>
		</div>

		<div>
			<h3 class="font-semibold">{m.account_tab_switch_heading()}</h3>
			<p class="text-sm opacity-70">
				{m.account_tab_switch_body()}
			</p>
			<div class="mt-2 flex flex-col gap-2">
				<input
					class="file-input file-input-bordered file-input-sm"
					type="file"
					accept="application/json,.json"
					onchange={handleImportFile}
				/>
				{#if importError}
					<p class="text-error text-sm">{importError}</p>
				{/if}
				{#if imported}
					<p class="text-success text-sm">{m.account_tab_switched()}</p>
				{/if}
			</div>
		</div>

		<div class="divider"></div>

		<div>
			<h3 class="font-semibold">{m.account_tab_logout_heading()}</h3>
			<p class="text-sm opacity-70">
				{m.account_tab_logout_body()}
			</p>
			<button class="btn btn-sm btn-error mt-2" type="button" onclick={handleLogout}>
				{m.account_tab_logout_button()}
			</button>
		</div>
	</div>
{/if}

<ConfirmDialog
	open={confirmingLogout}
	title={m.account_tab_logout_heading()}
	message={m.account_tab_logout_confirm()}
	danger
	onconfirm={confirmLogout}
	oncancel={() => (confirmingLogout = false)}
/>
