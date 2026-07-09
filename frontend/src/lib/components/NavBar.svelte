<script lang="ts">
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { base } from "$app/paths";
	import { getCurrentUser, isAccountRegistered } from "$lib/state/auth.svelte";
	import { getMyProfile } from "$lib/state/profile.svelte";
	import { openSettings } from "$lib/state/settingsModal.svelte";
	import {
		getSearchQuery,
		isSearching,
		runSearch,
		setSearchQuery,
	} from "$lib/state/search.svelte";

	const user = $derived(getCurrentUser());
	const profile = $derived(getMyProfile());
	const registered = $derived(isAccountRegistered());
	const displayName = $derived(
		registered
			? profile?.username ||
					(user ? `${user.slice(0, 6)}…${user.slice(-4)}` : "")
			: "Guest — sign in",
	);

	const navLinks = [
		{ href: `${base}/characters`, label: "Characters" },
		{ href: `${base}/chats`, label: "Chats" },
	];
	const isActive = (href: string) => page.url.pathname.startsWith(href);

	function handleSearch(event: SubmitEvent) {
		event.preventDefault();
		const q = getSearchQuery().trim();
		const params = new URLSearchParams(q ? { q } : {});
		const target = `${base}/characters${params.toString() ? `?${params}` : ""}`;
		if (page.url.pathname === `${base}/characters` && page.url.search === (params.toString() ? `?${params}` : "")) {
			// Already on this exact search URL — goto() wouldn't navigate, so
			// re-run explicitly to let "Search" also act as a reload button.
			runSearch();
		} else {
			goto(target);
		}
	}
</script>

<nav
	class="navbar sticky top-0 z-30 flex items-center border-b border-base-300 bg-base-100/80 px-4 backdrop-blur"
>
	<div class="flex flex-1 items-center gap-6">
		<a href={base || "/"} class="flex items-center gap-2 text-xl font-bold leading-none tracking-tight">
			<img src="{base}/icon-192.png" alt="" class="h-6 w-6 rounded-md" />
			charshare
		</a>
		{#each navLinks as { href, label } (href)}
			<a
				{href}
				class="text-base font-medium leading-none {isActive(href)
					? 'text-primary'
					: 'text-base-content/70 hover:text-base-content'}"
			>
				{label}
			</a>
		{/each}
	</div>
	<form class="flex flex-1 max-w-2xl gap-2 justify-center mx-4" onsubmit={handleSearch}>
		<input
			class="input input-bordered input-sm w-full"
			placeholder="Search by name, tag, or @username/@pubkey…"
			value={getSearchQuery()}
			oninput={(e) => setSearchQuery(e.currentTarget.value)}
		/>
		<button
			class="btn btn-sm btn-primary"
			type="submit"
			disabled={isSearching()}
		>
			{isSearching() ? "…" : "Search"}
		</button>
	</form>
	<div class="flex flex-1 items-center justify-end gap-2">
		<a href="{base}/characters/new" class="btn btn-sm btn-primary">
			+ New Character
		</a>
		<button
			class="btn btn-sm btn-ghost gap-2"
			type="button"
			aria-label="Account settings"
			onclick={() => openSettings("account")}
		>
			<div class="avatar {profile?.image_url ? '' : 'avatar-placeholder'}">
				<div class="w-6 rounded-full bg-neutral text-neutral-content">
					{#if profile?.image_url}
						<img src={profile.image_url} alt={displayName} />
					{:else}
						<span class="text-xs">{displayName.slice(0, 1).toUpperCase()}</span>
					{/if}
				</div>
			</div>
			<span class="max-w-40 truncate">{displayName}</span>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-4 w-4 opacity-70"
			>
				<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
				<path
					d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
				/>
			</svg>
		</button>
	</div>
</nav>
