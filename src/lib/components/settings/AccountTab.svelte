<script lang="ts">
	import {
		getMyProfile,
		isProfileReady,
		saveProfile,
		registerAccount,
		loadProfileForSwitchedAccount
	} from '$lib/state/profile.svelte';
	import { getKeyring, isAccountRegistered, setKeyring } from '$lib/state/auth.svelte';
	import { exportAccountBackup, parseAccountBackup } from '$lib/identity/backup';

	const profileReady = $derived(isProfileReady());
	const registered = $derived(isAccountRegistered());

	let username = $state('');
	let description = $state('');
	let imageUrl = $state('');
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let loadedFromProfile = false;

	let importError = $state<string | null>(null);
	let imported = $state(false);

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
		} catch (err) {
			saveError = err instanceof Error ? err.message : String(err);
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
		} catch (err) {
			saveError = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	}

	function handleExport() {
		const keyring = getKeyring();
		if (!keyring) return;
		const json = exportAccountBackup(keyring);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'charshare-account-backup.json';
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleImportFile(event: Event) {
		importError = null;
		imported = false;
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const text = await file.text();
			const keyring = parseAccountBackup(text);
			await setKeyring(keyring);
			loadedFromProfile = false;
			await loadProfileForSwitchedAccount();
			imported = true;
		} catch (err) {
			importError = err instanceof Error ? err.message : String(err);
		} finally {
			input.value = '';
		}
	}
</script>

{#if !profileReady}
	<p>Loading account…</p>
{:else if !registered}
	<div class="flex flex-col gap-6">
		<div>
			<h3 class="font-semibold">You're browsing as a guest</h3>
			<p class="text-sm opacity-70">
				Talking to characters, chats, personas and preferences all work locally without an
				account. Create an account only if you want to publish characters or post comments —
				it's not required otherwise.
			</p>
		</div>

		<form class="flex flex-col gap-3" onsubmit={handleRegister}>
			<h3 class="font-semibold">Create an account</h3>
			<label class="form-control">
				<span class="label-text">Username</span>
				<input class="input input-bordered w-full" bind:value={username} required />
			</label>
			<label class="form-control">
				<span class="label-text">Description</span>
				<textarea class="textarea textarea-bordered w-full" bind:value={description}></textarea>
			</label>
			<label class="form-control">
				<span class="label-text">Image URL</span>
				<input
					class="input input-bordered w-full"
					type="url"
					placeholder="https://…"
					bind:value={imageUrl}
				/>
			</label>
			<button class="btn btn-primary self-start" type="submit" disabled={saving}>
				{saving ? 'Creating…' : 'Create account'}
			</button>
			{#if saveError}
				<p class="text-error text-sm">{saveError}</p>
			{/if}
		</form>

		<div class="divider"></div>

		<div>
			<h3 class="font-semibold">Already have an account?</h3>
			<p class="text-sm opacity-70">
				Select a backup file to sign in with an existing account on this browser.
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
					<p class="text-success text-sm">Signed in.</p>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<div class="flex flex-col gap-6">
		<form class="flex flex-col gap-3" onsubmit={handleSave}>
			<label class="form-control">
				<span class="label-text">Username</span>
				<input class="input input-bordered w-full" bind:value={username} />
			</label>
			<label class="form-control">
				<span class="label-text">Description</span>
				<textarea class="textarea textarea-bordered w-full" bind:value={description}></textarea>
			</label>
			<label class="form-control">
				<span class="label-text">Image URL</span>
				<input
					class="input input-bordered w-full"
					type="url"
					placeholder="https://…"
					bind:value={imageUrl}
				/>
			</label>
			<button class="btn btn-primary self-start" type="submit" disabled={saving}>
				{saving ? 'Saving…' : 'Save profile'}
			</button>
			{#if saveError}
				<p class="text-error text-sm">{saveError}</p>
			{/if}
		</form>

		<div class="divider"></div>

		<div>
			<h3 class="font-semibold">Back up your account</h3>
			<p class="text-sm opacity-70">
				Download a file that lets you use this account on another device or browser.
			</p>
			<button class="btn btn-sm mt-2" type="button" onclick={handleExport}
				>Download backup</button
			>
		</div>

		<div>
			<h3 class="font-semibold">Switch account</h3>
			<p class="text-sm opacity-70">
				Select a backup file to switch this browser to that account. Keep this file safe — it's
				the only way to access your account, and it can't be recovered if lost.
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
					<p class="text-success text-sm">Switched to the imported account.</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
