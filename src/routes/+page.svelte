<script lang="ts">
	import { onMount } from 'svelte';
	import { getCurrentUser, initAuth, isAuthReady } from '$lib/state/auth.svelte';
	import { getMyProfile, initProfile, isProfileReady, saveProfile } from '$lib/state/profile.svelte';

	onMount(() => {
		initAuth();
		initProfile();
	});

	const ready = $derived(isAuthReady());
	const user = $derived(getCurrentUser());
	const profileReady = $derived(isProfileReady());

	let username = $state('');
	let description = $state('');
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let loadedFromProfile = false;

	// Seed the form from the loaded profile exactly once, so typing doesn't
	// get clobbered by re-derivation on every profile-state read.
	$effect(() => {
		if (profileReady && !loadedFromProfile) {
			const profile = getMyProfile();
			username = profile?.username ?? '';
			description = profile?.description ?? '';
			loadedFromProfile = true;
		}
	});

	async function handleSave(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		saveError = null;
		try {
			await saveProfile({ username, description });
		} catch (err) {
			saveError = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	}
</script>

{#if !ready}
	<p>Loading identity…</p>
{:else}
	<div role="alert" class="alert alert-info max-w-md">
		<div>
			<p>
				Signed in as <code class="break-all">{user}</code>
			</p>
			<p class="text-sm opacity-70">
				This identity lives only in this browser. There's no recovery if it's lost.
			</p>
		</div>
	</div>

	<div class="mt-6 max-w-md">
		<h2 class="text-lg font-semibold">Profile</h2>
		{#if !profileReady}
			<p>Loading profile…</p>
		{:else}
			<form class="mt-2 flex flex-col gap-3" onsubmit={handleSave}>
				<label class="form-control">
					<span class="label-text">Username</span>
					<input class="input input-bordered w-full" bind:value={username} />
				</label>
				<label class="form-control">
					<span class="label-text">Description</span>
					<textarea class="textarea textarea-bordered w-full" bind:value={description}></textarea>
				</label>
				<button class="btn btn-primary" type="submit" disabled={saving}>
					{saving ? 'Saving…' : 'Save profile'}
				</button>
				{#if saveError}
					<p class="text-error text-sm">{saveError}</p>
				{/if}
			</form>
		{/if}
	</div>
{/if}
