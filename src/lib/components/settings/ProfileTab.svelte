<script lang="ts">
	import { getMyProfile, isProfileReady, saveProfile } from '$lib/state/profile.svelte';

	const profileReady = $derived(isProfileReady());

	let username = $state('');
	let description = $state('');
	let imageUrl = $state('');
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
			imageUrl = profile?.image_url ?? '';
			loadedFromProfile = true;
		}
	});

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
</script>

{#if !profileReady}
	<p>Loading profile…</p>
{:else}
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
{/if}
