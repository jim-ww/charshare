<script lang="ts">
	import { getCurrentUser } from "$lib/state/auth.svelte";
	import { getMyProfile } from "$lib/state/profile.svelte";
	import { openSettings } from "$lib/state/settingsModal.svelte";

	const user = $derived(getCurrentUser());
	const profile = $derived(getMyProfile());
	const displayName = $derived(
		profile?.username ||
			(user ? `${user.slice(0, 6)}…${user.slice(-4)}` : ""),
	);
</script>

<nav class="navbar bg-base-200 px-4">
	<div class="flex flex-1 items-center gap-4">
		<a href="/" class="text-lg font-semibold">charshare</a>
		<a href="/characters" class="link link-hover">Characters</a>
		<a href="/chats" class="link link-hover">Chats</a>
	</div>
	<div class="flex items-center gap-2">
		<a href="/characters/new" class="btn btn-sm btn-primary"
			>+ New Character</a
		>
		<button
			class="btn btn-sm btn-ghost btn-circle"
			type="button"
			aria-label="Settings"
			onclick={() => openSettings("general")}
		>
			⚙
		</button>
		<button
			class="btn btn-sm btn-ghost"
			type="button"
			onclick={() => openSettings("profile")}
		>
			{displayName}
		</button>
	</div>
</nav>
