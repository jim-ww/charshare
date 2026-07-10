<script lang="ts">
	import { resolve } from "$app/paths";
	import type { Character } from "$lib/types";
	import { isCharacterLocalOnly } from "$lib/state/characters.svelte";
	import { getCurrentUser } from "$lib/state/auth.svelte";
	import {
		blockAuthor,
		hideCharacter,
		isAuthorBlocked,
		isCharacterHidden,
		unblockAuthor,
		unhideCharacter,
	} from "$lib/state/preferences.svelte";
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		character: Character;
	}

	let { character }: Props = $props();
	const localOnly = $derived(isCharacterLocalOnly(character.id));
	const imageUrl = $derived(character.image_urls[0]);
	const isMine = $derived(character.author === getCurrentUser());
	const hidden = $derived(isCharacterHidden(character.id));
	const authorBlocked = $derived(isAuthorBlocked(character.author));

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
</script>

<a
	href={resolve('/characters/[id]', { id: character.id })}
	class="card relative bg-base-200 shadow-sm [content-visibility:auto] [contain-intrinsic-size:0_320px] hover:bg-base-300"
	class:opacity-60={character.deleted || hidden}
>
	{#if character.nsfw}
		<span
			class="badge badge-xs badge-warning absolute left-2 top-2 z-10 badge-outline opacity-70"
			title={m.char_card_nsfw_title()}
		>
			{m.char_card_nsfw_badge()}
		</span>
	{/if}
	{#if !isMine}
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
		</div>
	{/if}
	<div class="card-body items-center gap-1 p-3 text-center">
		<figure
			class="h-44 w-44 overflow-hidden rounded-lg bg-base-300"
		>
			{#if imageUrl}
				<img
					src={imageUrl}
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
			class:line-through={character.deleted}
			class="mt-1 line-clamp-2 text-sm font-semibold"
		>
			{character.name}
		</h3>
		{#if isMine}
			<span
				class="badge badge-xs"
				class:badge-outline={localOnly}
				class:badge-primary={!localOnly}
			>
				{localOnly ? m.char_card_local_only() : m.char_card_published()}
			</span>
		{/if}
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
