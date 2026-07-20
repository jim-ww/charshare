<script lang="ts">
	import { resolve } from "$app/paths";
	import type { Character } from "$lib/types";
	import {
		isCharacterInMyCharacters,
		isCharacterLocalOnly,
	} from "$lib/state/characters.svelte";
	import { getCharacter } from "$lib/nostr/characters";
	import {
		isCharacterSaved,
		saveCharacterLocally,
		unsaveCharacter,
	} from "$lib/state/savedCharacters.svelte";
	import { getCurrentUser } from "$lib/state/auth.svelte";
	import {
		blockAuthor,
		hideCharacter,
		isAuthorBlocked,
		isCharacterHidden,
		unblockAuthor,
		unhideCharacter,
	} from "$lib/state/preferences.svelte";
	import { confirmDialog } from "$lib/state/confirmDialog.svelte";
	import { estimateCharacterTokens, formatTokenCount } from "$lib/ai/tokenEstimate";
	import { getPreferences } from "$lib/state/preferences.svelte";
	import { m } from '$lib/paraglide/messages.js';
	import { mediaProxyUrl } from "$lib/types/media";

	interface Props {
		character: Character;
	}

	const SLIDESHOW_INTERVAL_MS = 1800;

	let { character }: Props = $props();
	const localOnly = $derived(isCharacterLocalOnly(character.id));
	const slideshowMedia = $derived((character.media ?? []).filter((m) => m.url.trim()));
	const slideshowActive = $derived(
		character.slideshow_enabled &&
			!getPreferences().disableSlideshows &&
			slideshowMedia.length > 1,
	);

	let hovering = $state(false);
	let slideIndex = $state(0);

	$effect(() => {
		if (!hovering || !slideshowActive) {
			slideIndex = 0;
			return;
		}
		const media = slideshowMedia;
		const interval = setInterval(() => {
			slideIndex = (slideIndex + 1) % media.length;
		}, SLIDESHOW_INTERVAL_MS);
		return () => clearInterval(interval);
	});

	const coverMedia = $derived(
		slideshowActive && hovering
			? (slideshowMedia[slideIndex] ?? character.media?.[0])
			: character.media?.[0],
	);
	const isMine = $derived(character.author === getCurrentUser());
	const hidden = $derived(isCharacterHidden(character.id));
	const authorBlocked = $derived(isAuthorBlocked(character.author));
	const saved = $derived(isCharacterSaved(character.id));
	// Already accounted for locally either way — imported-from-another-identity
	// characters land in myCharacters despite not being authored by me, so a
	// "Save" prompt for them would just duplicate what's already there.
	const alreadyLocal = $derived(isMine || isCharacterInMyCharacters(character.id));
	const totalTokens = $derived(estimateCharacterTokens(character).total);

	async function toggleSaved(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (saved) {
			// This saved copy is the only place a deleted-on-remote character
			// still exists — unsaving it here is unrecoverable, unlike a normal
			// unsave where the author's copy is still one search away.
			if (character.deleted) {
				const confirmed = await confirmDialog({
					title: m.char_detail_unsave_deleted_confirm_title(),
					message: m.char_detail_unsave_deleted_confirm_message(),
					confirmLabel: m.char_card_unsave(),
					danger: true,
				});
				if (!confirmed) return;
			} else if (!(await getCharacter(character.id)).ok) {
				// Not deleted, but not reachable on any relay right now either
				// (e.g. saved from an out-of-band source, or the author simply
				// never published it) — same irrecoverable-loss situation as the
				// deleted case above, just without the author's own delete flag.
				const confirmed = await confirmDialog({
					title: m.char_detail_unsave_unreachable_confirm_title(),
					message: m.char_detail_unsave_unreachable_confirm_message(),
					confirmLabel: m.char_card_unsave(),
					danger: true,
				});
				if (!confirmed) return;
			}
			await unsaveCharacter(character.id);
		} else {
			await saveCharacterLocally(character, { auto: false });
		}
	}

	function toggleHidden(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (hidden) {
			unhideCharacter(character.id);
		} else {
			hideCharacter(character.id);
		}
	}

	function toggleAuthorBlocked(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (authorBlocked) {
			unblockAuthor(character.author);
		} else {
			blockAuthor(character.author);
		}
	}

	// Restarts a beat before the end instead of relying on the native `loop`
	// attribute — letting the video actually reach 'ended' and having the
	// browser restart it shows a brief flash of the poster/blank frame at the
	// seam. Seeking back just before that point never lets playback end, so
	// there's nothing for the browser to flash to.
	function loopVideo(event: Event) {
		const video = event.currentTarget as HTMLVideoElement;
		if (video.duration - video.currentTime < 0.2) {
			video.currentTime = 0;
		}
	}
</script>

<a
	href={resolve('/characters/[id]', { id: character.id })}
	class="card relative bg-base-200 shadow-sm [content-visibility:auto] [contain-intrinsic-size:0_320px] hover:bg-base-300"
	class:opacity-60={(!isMine && character.deleted) || hidden}
	onmouseenter={() => (hovering = true)}
	onmouseleave={() => (hovering = false)}
>
	<div class="absolute left-2 top-2 z-10 flex flex-col items-start gap-1">
		{#if !alreadyLocal}
			<button
				type="button"
				class="btn btn-xs btn-circle text-base"
				class:text-warning={saved}
				title={saved ? m.char_card_unsave() : m.char_card_save()}
				onclick={toggleSaved}
			>
				{saved ? "★" : "☆"}
			</button>
		{/if}
	</div>
	<div class="absolute right-2 top-2 z-10 flex gap-1">
		<button
			type="button"
			class="btn btn-xs btn-circle"
			title={hidden
				? m.char_card_unhide()
				: m.char_card_hide()}
			onclick={toggleHidden}
		>
			{hidden ? "🙈" : "👁"}
		</button>
		{#if !isMine}
			<button
				type="button"
				class="btn btn-xs btn-circle"
				title={authorBlocked
					? m.char_card_unblock_author()
					: m.char_card_block_author()}
				onclick={toggleAuthorBlocked}
			>
				{authorBlocked ? "🔓" : "🚫"}
			</button>
		{/if}
	</div>
	<div class="card-body items-center gap-1 p-3 text-center">
		<figure
			class="h-44 w-44 overflow-hidden rounded-lg bg-base-300"
		>
			{#if coverMedia?.type === "video"}
				<!-- svelte-ignore a11y_media_has_caption -->
				<video
					src={mediaProxyUrl(coverMedia.url)}
					class="h-full w-full object-cover object-top"
					autoplay
					muted
					playsinline
					ontimeupdate={loopVideo}
				></video>
			{:else if coverMedia}
				<img
					src={coverMedia.url}
					alt={character.name}
					loading="lazy"
					decoding="async"
					class="h-full w-full object-cover object-top"
				/>
			{:else}
				<div
					class="flex h-full w-full items-center justify-center text-5xl opacity-30"
				>
					{character.name.charAt(0).toUpperCase()}
				</div>
			{/if}
		</figure>
		<h3
			class:line-through={!isMine && character.deleted}
			class="mt-1 line-clamp-2 text-sm font-semibold"
		>
			{character.name}
		</h3>
		<div class="flex flex-wrap items-center justify-center gap-1">
			<span
				class="badge badge-xs"
				class:badge-outline={isMine && (localOnly || character.deleted)}
				class:badge-primary={isMine && !localOnly && !character.deleted}
			>
				{#if isMine}
					{localOnly || character.deleted
						? m.char_card_local_only()
						: m.char_card_published()}
				{:else}
					{m.char_card_from_network()}
				{/if}
			</span>
			{#if character.nsfw}
				<span
					class="badge badge-xs badge-warning badge-outline"
					title={m.char_card_nsfw_title()}
				>
					{m.char_card_nsfw_badge()}
				</span>
			{/if}
			{#if character.forked_from}
				<span
					class="badge badge-xs badge-info badge-outline"
					title={m.char_card_fork_title()}
				>
					{m.char_card_fork_badge()}
				</span>
			{/if}
			<span class="badge badge-xs badge-ghost" title={m.char_form_total_tokens({ count: String(totalTokens) })}>
				{m.char_card_tokens_badge({ count: formatTokenCount(totalTokens) })}
			</span>
		</div>
		{#if character.description}
			<p class="line-clamp-2 text-xs opacity-80">
				{character.description}
			</p>
		{/if}
		{#if character.tags.length}
			<div class="divider my-1 w-full"></div>
			<div class="flex flex-wrap justify-center gap-1">
				{#each character.tags as tag (tag)}
					<span class="badge badge-sm">{tag}</span
					>
				{/each}
			</div>
		{/if}
	</div>
</a>
