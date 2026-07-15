<script lang="ts">
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { asset, resolve } from "$app/paths";
	import {
		getCurrentUser,
		isAccountRegistered,
	} from "$lib/state/auth.svelte";
	import { getMyProfile } from "$lib/state/profile.svelte";
	import { openSettings } from "$lib/state/settingsModal.svelte";
	import {
		getSearchQuery,
		getSelectedTags,
		isSearching,
		runSearch,
		setSearchQuery,
	} from "$lib/state/search.svelte";
	import { m } from "$lib/paraglide/messages.js";

	const user = $derived(getCurrentUser());
	const profile = $derived(getMyProfile());
	const registered = $derived(isAccountRegistered());
	const displayName = $derived(
		registered
			? profile?.username ||
					(user
						? `${user.slice(0, 6)}…${user.slice(-4)}`
						: "")
			: m.navbar_guest_sign_in(),
	);

	const navLinks = [
		{
			href: resolve("/characters"),
			label: m.navbar_nav_characters(),
		},
		{ href: resolve("/chats"), label: m.navbar_nav_chats() },
	];
	const isActive = (href: string) => page.url.pathname.startsWith(href);

	function handleSearch(event: SubmitEvent) {
		event.preventDefault();
		const q = getSearchQuery().trim();
		const tags = [...getSelectedTags()];
		const params = new URLSearchParams();
		if (q) params.set("q", q);
		if (tags.length > 0) params.set("tags", tags.join(","));
		const target = `${resolve("/characters")}${params.toString() ? `?${params}` : ""}`;
		if (
			page.url.pathname === resolve("/characters") &&
			page.url.search ===
				(params.toString() ? `?${params}` : "")
		) {
			// Already on this exact search URL — goto() wouldn't navigate, so
			// re-run explicitly to let "Search" also act as a reload button.
			runSearch();
		} else {
			goto(target);
		}
	}
</script>

<nav
	class="navbar sticky top-0 z-30 flex h-22 items-center gap-2 border-b border-base-300 bg-base-100/80 px-2 pt-[calc(env(safe-area-inset-top)+0.7rem)] backdrop-blur sm:h-16 sm:px-4 sm:pt-0"
>
	<div class="flex shrink-0 items-center gap-3 md:gap-6">
		<div class="dropdown md:hidden">
			<button
				tabindex="0"
				class="btn btn-ghost btn-square"
				type="button"
				aria-label={m.navbar_nav_characters()}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-6 w-6"
				>
					<path d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<ul
				class="menu dropdown-content z-10 mt-3 w-64 gap-0.5 rounded-box bg-base-200 p-2 shadow-lg"
			>
				<li class="menu-title px-2 pt-1 pb-0.5 text-xs">
					Browse
				</li>
				<li>
					<a
						href={resolve("/characters")}
						class="rounded-lg py-3 text-base {isActive(
							resolve('/characters'),
						)
							? 'text-primary'
							: ''}"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-5 w-5"
						>
							<path
								d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
							/>
							<circle cx="9" cy="7" r="4" />
							<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
							<path d="M16 3.13a4 4 0 0 1 0 7.75" />
						</svg>
						{m.navbar_nav_characters()}
					</a>
				</li>
				<li>
					<a
						href={resolve("/chats")}
						class="rounded-lg py-3 text-base {isActive(
							resolve('/chats'),
						)
							? 'text-primary'
							: ''}"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-5 w-5"
						>
							<path
								d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"
							/>
							<path
								d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"
							/>
						</svg>
						{m.navbar_nav_chats()}
					</a>
				</li>
				<li>
					<a
						href={resolve("/characters/new")}
						class="rounded-lg py-3 text-base"
					>
						{m.navbar_new_character()}
					</a>
				</li>
				<div class="my-1 border-t border-base-300"></div>
				<li class="menu-title px-2 pt-1 pb-0.5 text-xs">
					{displayName}
				</li>
				<li>
					<button
						type="button"
						class="rounded-lg py-3 text-base"
						onclick={() => openSettings("account")}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-5 w-5"
						>
							<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
							<path
								d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
							/>
						</svg>
						{m.navbar_account_settings()}
					</button>
				</li>
			</ul>
		</div>
		<a
			href={resolve("/")}
			class="btn btn-ghost flex h-auto min-h-0 shrink-0 items-center gap-2 rounded-none px-2 text-xl font-bold leading-none tracking-tight md:h-16 md:min-h-16"
		>
			<img src={asset("/logo_round.png")} alt="" class="h-6 w-6" />
			<span class="hidden sm:inline">charshare</span>
		</a>
		{#each navLinks as { href, label } (href)}
			<a
				{href}
				class="btn btn-ghost hidden h-16 min-h-16 rounded-none text-base font-medium md:inline-flex {isActive(
					href,
				)
					? 'text-primary'
					: 'text-base-content/70'}"
			>
				{label}
			</a>
		{/each}
	</div>
	<form
		class="flex min-w-0 flex-1 items-center gap-2 px-1 sm:mx-4"
		onsubmit={handleSearch}
	>
		<input
			class="input input-bordered w-full min-w-0"
			placeholder={m.navbar_search_placeholder()}
			value={getSearchQuery()}
			oninput={(e) => setSearchQuery(e.currentTarget.value)}
		/>
		<button
			class="btn btn-primary shrink-0"
			type="submit"
			disabled={isSearching()}
		>
			{isSearching() ? "…" : m.navbar_search_button()}
		</button>
	</form>
	<div class="hidden shrink-0 items-center gap-2 md:flex">
		<a
			href={resolve("/characters/new")}
			class="btn btn-sm btn-primary"
		>
			{m.navbar_new_character()}
		</a>
		<button
			class="btn btn-sm btn-ghost gap-2 px-2"
			type="button"
			aria-label={m.navbar_account_settings()}
			onclick={() => openSettings("account")}
		>
			<div
				class="avatar {profile?.image_url
					? ''
					: 'avatar-placeholder'}"
			>
				<div
					class="w-6 rounded-full bg-neutral text-neutral-content"
				>
					{#if profile?.image_url}
						<img
							src={profile.image_url}
							alt={displayName}
						/>
					{:else}
						<span class="text-xs"
							>{displayName
								.slice(0, 1)
								.toUpperCase()}</span
						>
					{/if}
				</div>
			</div>
			<span class="hidden max-w-40 truncate lg:inline"
				>{displayName}</span
			>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="hidden h-4 w-4 opacity-70 lg:inline"
			>
				<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
				<path
					d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
				/>
			</svg>
		</button>
	</div>
</nav>
