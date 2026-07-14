<script lang="ts">
	import { pushState } from "$app/navigation";
	import type { PubKey, User } from "$lib/types";
	import { getProfile } from "$lib/nostr/profile";
	import { getCurrentUser } from "$lib/state/auth.svelte";
	import {
		followAuthor,
		isAuthorFollowed,
		loadFollowedAuthors,
		unfollowAuthor,
	} from "$lib/state/contacts.svelte";
	import Avatar from "./Avatar.svelte";
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		open: boolean;
		pubkey: PubKey | null;
		onclose: () => void;
	}

	let { open, pubkey, onclose }: Props = $props();

	let dialogEl: HTMLDialogElement | undefined;
	let profile = $state<User | null>(null);
	let loading = $state(false);
	let notFound = $state(false);

	const isSelf = $derived(pubkey !== null && pubkey === getCurrentUser());
	const following = $derived(pubkey !== null && isAuthorFollowed(pubkey));

	function toggleFollow() {
		if (!pubkey) return;
		if (following) unfollowAuthor(pubkey);
		else followAuthor(pubkey);
	}

	$effect(() => {
		if (open) dialogEl?.showModal();
		else dialogEl?.close();
	});

	// Whether we pushed a history entry for the currently-open modal — lets
	// the phone/browser Back button close it instead of navigating away,
	// without double-popping history when the user closes it some other way.
	let ownsHistoryEntry = false;

	$effect(() => {
		function handlePopstate() {
			if (!ownsHistoryEntry) return;
			ownsHistoryEntry = false;
			onclose();
		}
		window.addEventListener("popstate", handlePopstate);
		return () => window.removeEventListener("popstate", handlePopstate);
	});

	$effect(() => {
		if (!open) return;
		pushState("", { userProfile: true });
		ownsHistoryEntry = true;
		return () => {
			if (ownsHistoryEntry) {
				ownsHistoryEntry = false;
				history.back();
			}
		};
	});

	$effect(() => {
		if (open) loadFollowedAuthors();
	});

	$effect(() => {
		const key = pubkey;
		if (!open || !key) return;
		profile = null;
		notFound = false;
		loading = true;
		getProfile(key).then((result) => {
			if (key !== pubkey) return;
			loading = false;
			if (result.ok) profile = result.doc;
			else notFound = true;
		});
	});
</script>

<dialog bind:this={dialogEl} class="modal" onclose={onclose}>
	<div class="modal-box max-h-[90vh] overflow-y-auto">
		<h2 class="mb-3 text-xs font-semibold tracking-wide opacity-50 uppercase">
			{m.user_profile_heading()}
		</h2>
		{#if loading}
			<p class="text-sm opacity-60">{m.user_profile_loading()}</p>
		{:else if open && (notFound || !pubkey)}
			<p class="text-sm opacity-60">{m.user_profile_not_found()}</p>
		{:else if profile}
			<div class="flex items-center gap-4">
				<Avatar
					name={profile.username || pubkey || ""}
					imageUrl={profile.image_url}
					class="w-20"
				/>
				<div>
					<h3 class="text-xl font-semibold">
						{profile.username
							? `@${profile.username}`
							: m.user_profile_unnamed()}
					</h3>
					<p class="text-xs opacity-60">
						{m.user_profile_joined()} {new Date(
							profile.created_at,
						).toLocaleDateString()}
					</p>
				</div>
				{#if !isSelf}
					<button
						class="btn btn-sm ml-auto"
						class:btn-primary={!following}
						class:btn-outline={following}
						type="button"
						onclick={toggleFollow}
					>
						{following ? m.user_profile_unfollow() : m.user_profile_follow()}
					</button>
				{/if}
			</div>

			<div class="divider my-3"></div>

			<div class="flex flex-col gap-3 text-sm">
				<div>
					<p
						class="text-xs font-semibold tracking-wide opacity-50 uppercase"
					>
						{m.user_profile_description_heading()}
					</p>
					<p
						class="mt-0.5 whitespace-pre-wrap opacity-80"
					>
						{profile.description ||
							m.user_profile_no_description()}
					</p>
				</div>

				<div>
					<p
						class="text-xs font-semibold tracking-wide opacity-50 uppercase"
					>
						{m.user_profile_id_heading()}
					</p>
					<p
						class="mt-0.5 rounded bg-base-200 p-2 font-mono text-xs break-all"
					>
						{pubkey}
					</p>
				</div>
			</div>
		{/if}

		<div class="modal-action">
			<button
				class="btn btn-sm"
				type="button"
				onclick={onclose}>{m.user_profile_close()}</button
			>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label={m.user_profile_close()}>{m.user_profile_close_label()}</button>
	</form>
</dialog>
