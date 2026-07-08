<script lang="ts">
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
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
		{ href: "/characters", label: "Characters" },
		{ href: "/chats", label: "Chats" },
	];
	const isActive = (href: string) => page.url.pathname.startsWith(href);

	function handleSearch(event: SubmitEvent) {
		event.preventDefault();
		const q = getSearchQuery().trim();
		const params = new URLSearchParams(q ? { q } : {});
		const target = `/characters${params.toString() ? `?${params}` : ""}`;
		if (page.url.pathname === "/characters" && page.url.search === (params.toString() ? `?${params}` : "")) {
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
		<a href="/" class="text-xl font-bold leading-none tracking-tight"
			>charshare</a
		>
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
		<a href="/characters/new" class="btn btn-sm btn-primary">
			+ New Character
		</a>
		<button
			class="btn btn-sm btn-ghost gap-2"
			type="button"
			aria-label="Settings"
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
		</button>
	</div>
</nav>
