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

	// Unauthenticated flow: an explicit choice up front, rather than dumping
	// "create account" and "log in" forms on the screen at the same time.
	let authView = $state<'choice' | 'login' | 'create'>('choice');

	// Authenticated flow: profile fields are read-only until the user opts
	// into editing them, instead of always showing an open form.
	let editingProfile = $state(false);

	let username = $state('');
	let description = $state('');
	let imageUrl = $state('');
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let loadedFromProfile = false;

	let importError = $state<string | null>(null);
	let imported = $state(false);
	let confirmingLogout = $state(false);

	// Authenticated flow: "Switch account" starts collapsed to a single
	// button, then reveals the same key/file login options a guest sees —
	// rather than always showing a bare file input as the only way in.
	let switchingAccount = $state(false);

	let keyInput = $state('');
	let keyError = $state<string | null>(null);
	let keyBusy = $state(false);

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
			editingProfile = false;
			notify(m.account_tab_saved(), { kind: 'success' });
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
		editingProfile = false;
		authView = 'choice';
		switchingAccount = false;
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

	async function handleKeyLogin(event: SubmitEvent) {
		event.preventDefault();
		keyError = null;
		keyBusy = true;
		try {
			const backup = parseAccountBackup(keyInput);
			await setKeyring(backup.keyring);
			loadedFromProfile = false;
			await loadProfileForSwitchedAccount(backup.profileFields);
			keyInput = '';
		} catch (err) {
			keyError = m.error_generic({
				message: err instanceof Error ? err.message : String(err)
			});
		} finally {
			keyBusy = false;
		}
	}
</script>

{#if !profileReady}
	<p>{m.account_tab_loading()}</p>
{:else if !registered}
	{#if authView === 'choice'}
		<div class="flex flex-col items-center gap-8 pt-16 pb-8 text-center">
			<div class="flex flex-col gap-2">
				<h3 class="text-2xl font-semibold">{m.account_tab_choice_heading()}</h3>
				<p class="mx-auto max-w-sm text-sm opacity-70">{m.account_tab_choice_body()}</p>
			</div>
			<div class="flex w-full max-w-xs flex-col gap-3">
				<button
					class="btn btn-primary btn-lg"
					type="button"
					onclick={() => (authView = 'create')}
				>
					{m.account_tab_create_account()}
				</button>
				<button
					class="btn btn-outline btn-lg"
					type="button"
					onclick={() => (authView = 'login')}
				>
					{m.account_tab_login_button()}
				</button>
			</div>
		</div>
	{:else if authView === 'login'}
		<div class="flex flex-col gap-6">
			<button
				class="btn btn-ghost btn-sm self-start"
				type="button"
				onclick={() => (authView = 'choice')}
			>
				{m.account_tab_back()}
			</button>

			<h3 class="font-semibold">{m.account_tab_login_heading()}</h3>

			<form class="flex flex-col gap-2" onsubmit={handleKeyLogin}>
				<label class="form-control">
					<span class="label-text">{m.account_tab_login_key_label()}</span>
					<input
						class="input input-bordered w-full font-mono"
						type="password"
						autocomplete="off"
						placeholder={m.account_tab_login_key_placeholder()}
						bind:value={keyInput}
						required
					/>
				</label>
				<button
					class="btn btn-primary self-start"
					type="submit"
					disabled={keyBusy || !keyInput.trim()}
				>
					{keyBusy ? m.account_tab_login_key_busy() : m.account_tab_login_button()}
				</button>
				{#if keyError}
					<p class="text-error text-sm">{keyError}</p>
				{/if}
			</form>

			<div class="divider text-xs opacity-60">{m.account_tab_login_or()}</div>

			<div>
				<p class="text-sm opacity-70">{m.account_tab_login_file_body()}</p>
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

			<div class="rounded-box bg-base-200 p-3">
				<h3 class="font-semibold">{m.account_tab_guest_heading()}</h3>
				<p class="text-sm opacity-70">{m.account_tab_guest_body()}</p>
			</div>
		</div>
	{:else if authView === 'create'}
		<div class="flex flex-col gap-6">
			<button
				class="btn btn-ghost btn-sm self-start"
				type="button"
				onclick={() => (authView = 'choice')}
			>
				{m.account_tab_back()}
			</button>

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
		</div>
	{/if}
{:else}
	<div class="flex flex-col gap-6">
		<div class="badge gap-1.5 {profileSynced ? 'badge-success' : 'badge-ghost'}">
			{#if !profileSynced}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			{profileSynced ? m.account_tab_synced() : m.account_tab_syncing()}
		</div>

		{#if !editingProfile}
			<div class="flex items-center gap-3">
				<div class="avatar {imageUrl ? '' : 'avatar-placeholder'} shrink-0">
					<div class="w-16 rounded-full bg-neutral text-neutral-content">
						{#if imageUrl}
							<img src={imageUrl} alt={username} />
						{:else}
							<span class="text-xl">{(username || '?').charAt(0).toUpperCase()}</span>
						{/if}
					</div>
				</div>
				<div class="min-w-0 flex-1">
					<div class="truncate text-lg font-semibold">{username}</div>
					{#if description}
						<p class="truncate text-sm opacity-70">{description}</p>
					{/if}
				</div>
				<button class="btn btn-sm shrink-0" type="button" onclick={() => (editingProfile = true)}>
					{m.account_tab_edit_profile()}
				</button>
			</div>
		{:else}
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
					<button class="btn btn-primary" type="submit" disabled={saving}>
						{saving ? m.account_tab_saving() : m.account_tab_save_profile()}
					</button>
					<button class="btn btn-ghost" type="button" onclick={() => (editingProfile = false)}>
						{m.account_tab_cancel()}
					</button>
				</div>
				{#if saveError}
					<p class="text-error text-sm">{saveError}</p>
				{/if}
			</form>
		{/if}

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
			{#if !switchingAccount}
				<button
					class="btn btn-sm mt-2"
					type="button"
					onclick={() => (switchingAccount = true)}
				>
					{m.account_tab_switch_button()}
				</button>
			{:else}
				<div class="mt-2 flex flex-col gap-3">
					<form class="flex flex-col gap-2" onsubmit={handleKeyLogin}>
						<label class="form-control">
							<span class="label-text">{m.account_tab_login_key_label()}</span>
							<input
								class="input input-bordered input-sm w-full font-mono"
								type="password"
								autocomplete="off"
								placeholder={m.account_tab_login_key_placeholder()}
								bind:value={keyInput}
								required
							/>
						</label>
						<button
							class="btn btn-sm btn-primary self-start"
							type="submit"
							disabled={keyBusy || !keyInput.trim()}
						>
							{keyBusy ? m.account_tab_login_key_busy() : m.account_tab_login_button()}
						</button>
						{#if keyError}
							<p class="text-error text-sm">{keyError}</p>
						{/if}
					</form>
					<div class="divider my-0 text-xs opacity-60">{m.account_tab_login_or()}</div>
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
					<button
						class="btn btn-ghost btn-sm self-start"
						type="button"
						onclick={() => (switchingAccount = false)}
					>
						{m.account_tab_cancel()}
					</button>
				</div>
			{/if}
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
