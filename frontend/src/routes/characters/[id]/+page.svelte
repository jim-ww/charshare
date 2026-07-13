<script lang="ts">
	import { untrack } from "svelte";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MAX_COMMENT_LENGTH, type Character, type Comment } from "$lib/types";
	import { getCharacter, subscribeCharacterWithRetry } from "$lib/nostr/characters";
	import {
		getCurrentUser,
		isAccountRegistered,
	} from "$lib/state/auth.svelte";
	import { openSettings } from "$lib/state/settingsModal.svelte";
	import { confirmDialog, confirmDialogWithExtra } from "$lib/state/confirmDialog.svelte";
	import { languageName } from "$lib/languages";
	import {
		deleteMyCharacter,
		exportCharacter,
		exportCharacterAsPng,
		forkCharacter,
		getMyCharacters,
		isCharacterInMyCharacters,
		isCharacterLocalOnly,
		isKeepPublished,
		publishMyCharacter,
		restoreMyCharacter,
		setCharacterKeepPublished,
	} from "$lib/state/characters.svelte";
	import {
		getSavedCharacter,
		isCharacterSaved,
		saveCharacterLocally,
		unsaveCharacter,
	} from "$lib/state/savedCharacters.svelte";
	import {
		createChat,
		getChats,
		importChat,
		initChats,
		isChatsReady,
	} from "$lib/state/chats.svelte";
	import {
		addComment,
		getCommentsFor,
		isLoadingComments,
		loadComments,
		removeComment,
	} from "$lib/state/comments.svelte";
	import {
		hideComment,
		isCommentHidden,
		unhideComment,
	} from "$lib/state/preferences.svelte";
	import {
		characterLikeTarget,
		getLikeCountFor,
		isLiked,
		loadLikeState,
		toggleLike,
	} from "$lib/state/reactions.svelte";
	import { getProfile } from "$lib/nostr/profile";
	import CharacterImageViewer from "$lib/components/CharacterImageViewer.svelte";
	import PersonaSelectorButton from "$lib/components/PersonaSelectorButton.svelte";
	import UserProfileModal from "$lib/components/UserProfileModal.svelte";
	import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
	import {
		getSelectedPersonaId,
		initPersonas,
	} from "$lib/state/personas.svelte";
	import { m } from '$lib/paraglide/messages.js';

	const id = $derived(page.params.id as string);

	let character = $state<Character | null>(null);
	let imageExpanded = $state(false);
	let imageIndex = $state(0);
	let notFound = $state(false);
	let newComment = $state("");
	let posting = $state(false);
	let showHiddenComments = $state(false);
	let commentDeleteTarget = $state<Comment | null>(null);
	let authorNames = $state<Record<string, string>>({});
	let replyingToCommentId = $state<string | null>(null);
	let replyingToTargetId = $state<string | null>(null);
	let replyDraft = $state("");
	let replyError = $state<string | null>(null);

	const localOnly = $derived(isCharacterLocalOnly(id));
	const liked = $derived(character ? isLiked(characterLikeTarget(character.id)) : false);
	const likeCount = $derived(character ? getLikeCountFor(characterLikeTarget(character.id)) : null);

	// Whether the live subscription below has actually confirmed this
	// character from the network — separate from `character !== null`, which
	// a saved copy already satisfies. Used only to keep the retry-poke (see
	// nostr/event.ts:subscribeEventsWithRetry) running until a relay
	// really answers, instead of stopping immediately because we already had
	// something to show from the local saved-characters cache.
	let synced = false;
	// Whether `id` currently resolves on any relay at all — separate from
	// `character.deleted` (the author's own tombstone flag), since a saved
	// character the author simply never published, or one that's no longer
	// reachable on any relay we know of, needs the same "unsave this and
	// it's gone for good" warning without ever having that flag set. The
	// live subscription above only ever fires for events it actually
	// receives (see subscribeCharacterWithRetry), so it can't signal
	// "not found" itself — a one-shot check is needed alongside it.
	let reachable = $state(true);

	$effect(() => {
		const currentId = id;
		synced = false;
		reachable = true;
		// Show a previously-saved copy instantly instead of always starting
		// from a blank "Loading…" state — the live subscription below still
		// runs and refreshes it, but a character we've already seen (viewed,
		// saved, or fetched for a chat) shouldn't have to wait on a relay
		// round-trip just to redisplay what we already have.
		character = getSavedCharacter(currentId) ?? null;
		notFound = false;

		// Local-only characters were never published to a relay — subscribing there
		// would never resolve. Their doc lives only in the local store.
		if (isCharacterLocalOnly(currentId)) {
			const local = getMyCharacters().find(
				(c) => c.id === currentId,
			);
			character = local ?? null;
			notFound = !local;
			untrack(() => void initChats());
			return;
		}

		untrack(() => {
			void getCharacter(currentId).then((result) => {
				if (currentId === id) reachable = result.ok;
			});
		});

		const unsubscribe = untrack(() =>
			subscribeCharacterWithRetry(
				currentId,
				(result) => {
					if (result.ok) {
						character = result.doc;
						synced = true;
						notFound = false;
						reachable = true;
					} else if (!character) {
						// Only flag not-found while we have nothing to show yet — a relay's
						// `.on()` can fire once with stale/missing local data before a
						// relay answers, then fire again once the real doc syncs in.
						notFound = true;
					}
				},
				// Not `character !== null` — a saved copy already makes that true,
				// which would stop the retry-poke before a relay ever actually
				// answers, leaving a stale saved copy on screen forever.
				() => synced,
			),
		);
		untrack(() => {
			void initChats();
			void loadComments(currentId);
			void loadLikeState(characterLikeTarget(currentId));
		});
		return unsubscribe;
	});

	const comments = $derived(getCommentsFor(id));
	const commentsLoading = $derived(isLoadingComments(id));
	const isMine = $derived(
		character !== null && getCurrentUser() === character.author,
	);
	// Already accounted for locally either way — imported-from-another-identity
	// characters land in myCharacters despite not being authored by me, so
	// offering to "save a copy" of them, or auto-saving one on chat start, is
	// redundant (see isCharacterInMyCharacters).
	const alreadyLocal = $derived(
		isMine || (character !== null && isCharacterInMyCharacters(character.id)),
	);
	const pastChats = $derived(
		getChats().filter((c) => c.character_id === id),
	);
	const latestChat = $derived(
		pastChats.reduce<(typeof pastChats)[number] | null>(
			(latest, chat) => {
				const chatTime = Math.max(
					chat.created_at,
					...chat.messages.map(
						(m) => m.updated_at,
					),
				);
				const latestTime = latest
					? Math.max(
							latest.created_at,
							...latest.messages.map(
								(m) =>
									m.updated_at,
							),
						)
					: -Infinity;
				return chatTime > latestTime ? chat : latest;
			},
			null,
		),
	);
	let publishing = $state(false);

	$effect(() => {
		const authors = character
			? [character.author, ...comments.map((c) => c.author)]
			: comments.map((c) => c.author);
		for (const author of authors) {
			if (author in authorNames) continue;
			authorNames = { ...authorNames, [author]: "" };
			getProfile(author).then((result) => {
				if (result.ok)
					authorNames = {
						...authorNames,
						[author]: result.doc.username,
					};
			});
		}
	});

	function authorLabel(pubkey: string): string {
		return authorNames[pubkey] || `${pubkey.slice(0, 8)}…`;
	}

	// Messenger-style timestamp: just the time for today, otherwise date + time.
	function formatCommentTime(timestamp: number): string {
		const date = new Date(timestamp);
		const isToday = date.toDateString() === new Date().toDateString();
		const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
		if (isToday) return time;
		return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
	}

	function chatLastMessageAt(chat: (typeof pastChats)[number]): number {
		return Math.max(chat.created_at, ...chat.messages.map((m) => m.updated_at));
	}

	let profileModalPubkey = $state<string | null>(null);

	async function handleStartChat() {
		if (!character) return;
		if (!alreadyLocal) void saveCharacterLocally(character, { auto: true });
		await initPersonas();
		const chat = await createChat(
			character.id,
			character.name,
			getSelectedPersonaId(character.id) ?? null,
		);
		await goto(resolve('/chats/[id]', { id: chat.id }));
	}

	async function handleToggleSaved() {
		if (!character) return;
		if (isCharacterSaved(character.id)) {
			// Unlike a normal unsave (the author's copy is still one search away
			// on the network), this saved copy is the only place this character
			// still exists — losing it here is unrecoverable, so it gets the same
			// destructive-action confirmation as a delete.
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

	let importInput = $state<HTMLInputElement>();
	let importError = $state("");

	async function handleImportChat(event: Event) {
		if (!character) return;
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		importError = "";
		try {
			if (!alreadyLocal) void saveCharacterLocally(character, { auto: true });
			await initPersonas();
			const chat = await importChat(
				character.id,
				await file.text(),
				getSelectedPersonaId(character.id) ?? null,
			);
			await goto(resolve('/chats/[id]', { id: chat.id }));
		} catch (err) {
			importError =
				err instanceof Error
					? err.message
					: "Failed to import chat.";
		} finally {
			if (importInput) importInput.value = "";
		}
	}

	async function handleFork() {
		if (!character) return;
		// De-proxy: character is a $state value, and forkCharacter's signing step
		// eventually hits a structured-clone/JSON.stringify boundary that throws
		// on a live Svelte reactive proxy (same fix as publishMyCharacter/
		// restoreMyCharacter in state/characters.svelte.ts).
		const fork = await forkCharacter($state.snapshot(character));
		await goto(resolve('/characters/[id]/edit', { id: fork.id }));
	}

	async function handlePublish() {
		if (!character) return;
		if (!isAccountRegistered()) {
			openSettings("account");
			return;
		}
		publishing = true;
		try {
			await publishMyCharacter(character.id);
		} finally {
			publishing = false;
		}
	}

	let republishing = $state(false);
	const keepPublished = $derived(character ? isKeepPublished(character.id) : false);

	/** Re-writes this already-published character's exact signed snapshot to
	 *  whichever relay is currently configured — for when a relay switch or a
	 *  relay that never got this document leaves it missing there, without
	 *  waiting for the automatic resync that only runs on app startup (see
	 *  refresh()'s resyncMissing in characters.svelte.ts). Superseded by
	 *  "Keep published" (see handleToggleKeepPublished) once that's checked —
	 *  the button is hidden then since it'd just be redundant. */
	async function handleRepublish() {
		if (!character) return;
		const confirmed = await confirmDialog({
			title: m.char_detail_republish_confirm_title(),
			message: m.char_detail_republish_confirm_message(),
			confirmLabel: m.char_detail_republish(),
		});
		if (!confirmed) return;
		republishing = true;
		try {
			await publishMyCharacter(character.id);
		} finally {
			republishing = false;
		}
	}

	/** Toggles auto-republishing this character whenever it's missing from the
	 *  currently-configured relays (checked on every refresh() — app start,
	 *  and after publish/delete/fork/import elsewhere in this browser — see
	 *  characters.svelte.ts:refresh) instead of requiring the manual
	 *  "Republish" button to be pressed by hand each time. */
	async function handleToggleKeepPublished(event: Event) {
		if (!character) return;
		await setCharacterKeepPublished(character.id, (event.currentTarget as HTMLInputElement).checked);
	}

	let restoring = $state(false);

	/** Un-deletes a "delete remote only" character — see restoreMyCharacter. */
	async function handleRestore() {
		if (!character) return;
		const confirmed = await confirmDialog({
			title: m.char_detail_republish_confirm_title(),
			message: m.char_detail_republish_restore_confirm_message(),
			confirmLabel: m.char_detail_republish(),
		});
		if (!confirmed) return;
		restoring = true;
		try {
			await restoreMyCharacter(character.id);
		} finally {
			restoring = false;
		}
	}

	function downloadBlob(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	function handleExport() {
		if (!character) return;
		const blob = new Blob([exportCharacter(character)], {
			type: "application/json",
		});
		downloadBlob(blob, `${character.name.replace(/[^a-z0-9_-]+/gi, "_") || "character"}.json`);
	}

	let exportingCard = $state(false);

	/** Exports as a TavernAI/SillyTavern-compatible character-card PNG (see
	 *  state/characters.svelte.ts:exportCharacterAsPng) — for taking this
	 *  character to a third-party site/app that already knows how to read one. */
	async function handleExportCard() {
		if (!character) return;
		exportingCard = true;
		try {
			const blob = await exportCharacterAsPng(character);
			downloadBlob(blob, `${character.name.replace(/[^a-z0-9_-]+/gi, "_") || "character"}.png`);
		} finally {
			exportingCard = false;
		}
	}

	async function handleDelete() {
		if (!character) return;

		if (localOnly) {
			const confirmed = await confirmDialog({
				title: m.char_detail_delete_confirm_title(),
				message: m.char_detail_delete_confirm_message_local(),
				confirmLabel: m.char_detail_delete(),
				danger: true,
			});
			if (!confirmed) return;
			await deleteMyCharacter(character.id);
			await goto(resolve('/characters'));
			return;
		}

		const result = await confirmDialogWithExtra({
			title: m.char_detail_delete_confirm_title(),
			message: m.char_detail_delete_confirm_message_published(),
			confirmLabel: m.char_detail_delete_confirm_remote_only(),
			extraLabel: m.char_detail_delete_confirm_both(),
			danger: true,
		});
		if (result === "cancel") return;
		await deleteMyCharacter(character.id, { removeLocal: result === "extra" });
		await goto(resolve('/characters'));
	}

	async function handlePostComment(event: SubmitEvent) {
		event.preventDefault();
		const content = newComment.trim();
		if (!content) return;
		if (!isAccountRegistered()) {
			openSettings("account");
			return;
		}
		posting = true;
		try {
			await addComment(id, content);
			newComment = "";
		} finally {
			posting = false;
		}
	}

	function handleDeleteComment(comment: Comment) {
		commentDeleteTarget = comment;
	}

	async function confirmDeleteComment() {
		if (!commentDeleteTarget) return;
		await removeComment(id, commentDeleteTarget.id);
		commentDeleteTarget = null;
	}

	// Replies are flattened one level deep — replying to a reply attaches to
	// its thread's root comment rather than growing an arbitrarily deep tree.
	function threadRootId(comment: Comment): string {
		return comment.parent_id ?? comment.id;
	}

	function startReply(comment: Comment) {
		replyingToCommentId = threadRootId(comment);
		replyingToTargetId = comment.id;
		replyDraft = "";
		replyError = null;
	}

	async function handlePostReply(event: SubmitEvent, parentId: string) {
		event.preventDefault();
		const content = replyDraft.trim();
		if (!content) return;
		if (!isAccountRegistered()) {
			openSettings("account");
			return;
		}
		posting = true;
		replyError = null;
		try {
			await addComment(id, content, parentId, replyingToTargetId);
			replyDraft = "";
			replyingToCommentId = null;
			replyingToTargetId = null;
		} catch (err) {
			replyError = err instanceof Error ? err.message : String(err);
		} finally {
			posting = false;
		}
	}

	async function handleToggleHideComment(comment: Comment) {
		if (isCommentHidden(comment.id)) {
			await unhideComment(comment.id);
		} else {
			await hideComment(comment.id);
		}
	}

	async function handleToggleLike() {
		if (!character) return;
		await toggleLike(characterLikeTarget(character.id));
	}
</script>

<div class="mx-auto max-w-5xl p-4">
	<a href={resolve('/characters')} class="btn btn-ghost btn-sm mb-4">
		{m.char_detail_back()}
	</a>
	{#if notFound}
		<p class="text-error">{m.char_not_found()}</p>
	{:else if !character}
		<p>{m.char_list_loading()}</p>
	{:else}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="flex flex-col gap-4">
				<CharacterImageViewer
					images={character.image_urls}
					name={character.name}
					contain
					onImageClick={() => (imageExpanded = true)}
					bind:index={imageIndex}
				/>

				{#if imageExpanded}
					<div
						class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
						role="button"
						tabindex="0"
						onclick={() => (imageExpanded = false)}
						onkeydown={(e) => e.key === "Escape" && (imageExpanded = false)}
					>
						<div role="presentation" onclick={(e) => e.stopPropagation()}>
							<CharacterImageViewer
								images={character.image_urls}
								name={character.name}
								class="shadow-2xl"
								fullSize
								onImageClick={() => (imageExpanded = false)}
								keyboardNav
								bind:index={imageIndex}
							/>
						</div>
					</div>
				{/if}

				<div>
					<h1 class="text-2xl font-semibold">
						{character.name}
						<span
							class="badge badge-sm align-middle"
							class:badge-outline={isMine && (localOnly || character.deleted)}
							class:badge-primary={isMine && !localOnly && !character.deleted}
						>
							{#if isMine}
								{localOnly || character.deleted
									? m.char_detail_local_only()
									: m.char_detail_published()}
							{:else}
								{m.char_detail_from_network()}
							{/if}
						</span>
						{#if character.deleted || (!isMine && !reachable)}
							<span class="badge badge-sm badge-warning align-middle">
								{m.char_detail_unreachable_badge()}
							</span>
						{/if}
					</h1>
					<div
						class="mt-1 flex items-center gap-1.5 text-sm opacity-70"
					>
						<span>{m.char_detail_by()}</span>
						<button
							class="btn btn-xs btn-outline rounded-full"
							type="button"
							onclick={() =>
								(profileModalPubkey =
									character!
										.author)}
						>
							@{authorLabel(
								character.author,
							)}
						</button>
					</div>
					<div class="mt-1 flex flex-wrap gap-x-2 text-xs opacity-60">
						<span>{m.char_detail_created({ time: formatCommentTime(character.created_at) })}</span>
						{#if character.updated_at !== character.created_at}
							<span>{m.char_detail_updated({ time: formatCommentTime(character.updated_at) })}</span>
						{/if}
					</div>
					<div class="mt-2">
						<button
							class="btn btn-sm rounded-full"
							class:btn-primary={liked}
							class:btn-outline={!liked}
							type="button"
							onclick={handleToggleLike}
						>
							{liked ? m.char_detail_liked() : m.char_detail_like()}
							{#if likeCount !== null}
								<span class="badge badge-sm">{likeCount}</span>
							{/if}
						</button>
					</div>
					{#if character.tags.length || character.language}
						<div
							class="mt-4 flex flex-wrap gap-1"
						>
							{#if character.language}
								<span
									class="badge badge-sm badge-outline"
									>{languageName(
										character.language,
									)}</span
								>
							{/if}
							{#each character.tags as tag (tag)}
								<span
									class="badge badge-sm badge-outline"
									>{tag}</span
								>
							{/each}
						</div>
					{/if}
				</div>

				{#if character.description}
					<p
						class="whitespace-pre-wrap text-sm opacity-80"
					>
						{character.description}
					</p>
				{/if}

				<div class="flex flex-col gap-2">
					<PersonaSelectorButton
						characterId={id}
					/>
					{#if latestChat}
						<a
							class="btn btn-soft btn-block"
							href={resolve('/chats/[id]', { id: latestChat.id })}
							>{m.char_detail_continue_latest_chat()}</a
						>
					{/if}
					<button
						class="btn btn-ghost btn-block"
						type="button"
						onclick={handleStartChat}
					>
						{m.char_detail_start_new_chat()}
					</button>
				</div>

				<div class="divider my-0"></div>

				<div class="flex flex-wrap gap-2">
					<button
						class="btn btn-sm btn-ghost"
						type="button"
						onclick={() =>
							importInput?.click()}
					>
						{m.char_detail_import_chat()}
					</button>
					<input
						bind:this={importInput}
						type="file"
						accept="application/json,.json"
						class="hidden"
						onchange={handleImportChat}
					/>
					<button
						class="btn btn-sm btn-ghost"
						type="button"
						onclick={handleExport}
						>{m.char_detail_export()}</button
					>
					<button
						class="btn btn-sm btn-ghost"
						type="button"
						disabled={exportingCard}
						onclick={handleExportCard}
					>
						{exportingCard ? m.char_detail_exporting_card() : m.char_detail_export_card()}
					</button>
					{#if isMine}
						<a
							class="btn btn-sm btn-ghost"
							href={resolve('/characters/[id]/edit', { id: character.id })}
							>{m.char_detail_edit()}</a
						>
						<button
							class="btn btn-sm btn-ghost"
							type="button"
							onclick={handleFork}
							>{m.char_detail_fork()}</button
						>
						{#if localOnly}
							<button
								class="btn btn-sm btn-primary"
								type="button"
								disabled={publishing}
								onclick={handlePublish}
							>
								{publishing
									? m.char_detail_publishing()
									: m.char_detail_publish()}
							</button>
						{:else if character.deleted}
							<button
								class="btn btn-sm btn-primary"
								type="button"
								disabled={restoring}
								onclick={handleRestore}
							>
								{restoring
									? m.char_detail_republishing()
									: m.char_detail_republish()}
							</button>
						{:else}
							{#if !keepPublished}
								<button
									class="btn btn-sm btn-ghost"
									type="button"
									disabled={republishing}
									onclick={handleRepublish}
								>
									{republishing
										? m.char_detail_republishing()
										: m.char_detail_republish()}
								</button>
							{/if}
							<label
								class="label cursor-pointer gap-1.5 py-0"
								title={m.char_detail_keep_published_hint()}
							>
								<input
									type="checkbox"
									class="checkbox checkbox-sm"
									checked={keepPublished}
									onchange={handleToggleKeepPublished}
								/>
								<span class="label-text"
									>{m.char_detail_keep_published_label()}</span
								>
							</label>
						{/if}
						{#if !character.deleted}
							<button
								class="btn btn-sm btn-error btn-outline"
								type="button"
								onclick={handleDelete}
							>
								{m.char_detail_delete()}
							</button>
						{/if}
					{:else}
						<button
							class="btn btn-sm btn-ghost"
							type="button"
							onclick={handleFork}
							>{m.char_detail_fork()}</button
						>
						{#if !alreadyLocal}
							<button
								class="btn btn-sm btn-ghost"
								type="button"
								onclick={handleToggleSaved}
							>
								{isCharacterSaved(character.id)
									? m.char_detail_unsave()
									: m.char_detail_save()}
							</button>
						{/if}
					{/if}
				</div>

				{#if importError}
					<p class="text-sm text-error">
						{importError}
					</p>
				{/if}

				{#if isChatsReady() && pastChats.length}
					<div>
						<h2
							class="mb-1 text-sm font-semibold opacity-70"
						>
							{m.char_detail_continue_past_chat_heading()}
						</h2>
						<ul class="flex flex-col gap-1">
							{#each pastChats as chat (chat.id)}
								<li class="flex items-baseline gap-2">
									<a
										class="link link-hover text-sm"
										href={resolve('/chats/[id]', { id: chat.id })}
									>
										{chat.name}
									</a>
									<span class="text-xs opacity-60">
										{formatCommentTime(chatLastMessageAt(chat))}
									</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>

			<div class="flex flex-col gap-2">
				{#if character.scenario}
					<div
						class="collapse-arrow collapse bg-base-200"
					>
						<input type="checkbox" />
						<div
							class="collapse-title font-medium"
						>
							{m.char_detail_scenario_heading()}
						</div>
						<div
							class="collapse-content whitespace-pre-wrap text-sm opacity-80"
						>
							{character.scenario}
						</div>
					</div>
				{/if}

				{#if character.personality}
					<div
						class="collapse-arrow collapse bg-base-200"
					>
						<input type="checkbox" />
						<div
							class="collapse-title font-medium"
						>
							{m.char_detail_personality_heading()}
						</div>
						<div
							class="collapse-content whitespace-pre-wrap text-sm opacity-80"
						>
							{character.personality}
						</div>
					</div>
				{/if}

				{#if character.first_message || character.alternate_greetings.length}
					<div
						class="collapse-arrow collapse bg-base-200"
					>
						<input type="checkbox" />
						<div
							class="collapse-title font-medium"
						>
							{m.char_detail_first_messages_heading()}
						</div>
						<div
							class="collapse-content flex flex-col gap-2 text-sm opacity-80"
						>
							{#if character.first_message}
								<p
									class="whitespace-pre-wrap"
								>
									{character.first_message}
								</p>
							{/if}
							{#each character.alternate_greetings as greeting, i (i)}
								<p
									class="whitespace-pre-wrap border-t border-base-content/10 pt-2"
								>
									{greeting}
								</p>
							{/each}
						</div>
					</div>
				{/if}

				{#if character.example_dialogues.length}
					<div
						class="collapse-arrow collapse bg-base-200"
					>
						<input type="checkbox" />
						<div
							class="collapse-title font-medium"
						>
							{m.char_detail_example_dialogues_heading()}
						</div>
						<div
							class="collapse-content flex flex-col gap-2 text-sm opacity-80"
						>
							{#each character.example_dialogues as dialogue, i (i)}
								<p
									class="whitespace-pre-wrap {i >
									0
										? 'border-t border-base-content/10 pt-2'
										: ''}"
								>
									{dialogue}
								</p>
							{/each}
						</div>
					</div>
				{/if}

				{#if character.system_prompt}
					<div
						class="collapse-arrow collapse bg-base-200"
					>
						<input type="checkbox" />
						<div
							class="collapse-title font-medium"
						>
							{m.char_detail_system_prompt_heading()}
						</div>
						<div
							class="collapse-content whitespace-pre-wrap text-sm opacity-80"
						>
							{character.system_prompt}
						</div>
					</div>
				{/if}

				{#if !localOnly}
					<a
						class="btn btn-sm btn-ghost mt-2 w-fit"
						href="{resolve('/characters')}?q={encodeURIComponent(`fork:${character.id}`)}"
					>
						{m.char_detail_view_forks()}
					</a>
				{/if}

				{#if isMine || !character.deleted}
					<div class="mt-4">
						<h2 class="mb-2 text-lg font-semibold">
							{m.char_detail_comments_heading()}
						</h2>

						{#if localOnly}
						<p class="text-sm opacity-60">
							{m.char_detail_local_only_no_comments()}
						</p>
					{:else if character.comments_enabled}
						<form
							class="mb-3 flex flex-col gap-2"
							onsubmit={handlePostComment}
						>
							<textarea
								class="textarea textarea-bordered w-full text-sm"
								placeholder={m.char_detail_comment_placeholder()}
								bind:value={
									newComment
								}
								maxlength={MAX_COMMENT_LENGTH}
								rows="2"
							></textarea>
							<span class="self-end text-xs opacity-50"
								>{newComment.length}/{MAX_COMMENT_LENGTH}</span
							>
							<button
								class="btn btn-sm btn-primary self-end"
								type="submit"
								disabled={posting ||
									!newComment.trim()}
							>
								{posting
									? m.char_detail_posting()
									: m.char_detail_post_comment()}
							</button>
							{#if !isAccountRegistered()}
								<p
									class="text-xs opacity-60"
								>
									{m.char_detail_account_needed_notice()}
								</p>
							{/if}
						</form>

						{#if commentsLoading && comments.length === 0}
							<p
								class="text-sm opacity-60"
							>
								{m.char_detail_loading_comments()}
							</p>
						{:else if comments.length === 0}
							<p
								class="text-sm opacity-60"
							>
								{m.char_detail_no_comments()}
							</p>
						{:else}
							{@const visibleComments = comments.filter(
								(c) =>
									!c.parent_id &&
									(showHiddenComments || !isCommentHidden(c.id)),
							)}
							<label class="label cursor-pointer justify-start gap-2 py-0">
								<input
									type="checkbox"
									class="toggle toggle-xs"
									bind:checked={showHiddenComments}
								/>
								<span class="label-text text-xs">{m.char_detail_show_hidden()}</span>
							</label>
							{#if visibleComments.length === 0}
								<p class="text-sm opacity-60">
									{m.char_detail_all_comments_hidden()}
								</p>
							{:else}
								<ul
									class="flex flex-col gap-3"
								>
									{#each visibleComments as comment (comment.id)}
										{@const hidden = isCommentHidden(comment.id)}
										{@const replies = comments.filter(
											(c) =>
												c.parent_id === comment.id &&
												(showHiddenComments || !isCommentHidden(c.id)),
										)}
										<li
											class="rounded-box bg-base-200 p-3"
											class:opacity-50={hidden}
										>
											<div
												class="flex items-center justify-between gap-2"
											>
												<span
													class="text-xs font-semibold opacity-70"
												>
													{authorLabel(
														comment.author,
													)}
													{#if comment.author === character.author}
														<span
															class="badge badge-xs badge-primary ml-1"
															>{m.char_detail_author_badge()}</span
														>
													{/if}
													{#if hidden}
														<span class="badge badge-xs ml-1">{m.char_detail_hidden_badge()}</span>
													{/if}
													<span class="ml-1 font-normal opacity-60" title={formatCommentTime(comment.created_at)}>
														{formatCommentTime(comment.created_at)}
													</span>
												</span>
												<div class="flex gap-1">
													{#if comment.author === getCurrentUser()}
														{#if !comment.deleted}
															<button
																class="btn btn-xs btn-ghost"
																type="button"
																onclick={() =>
																	handleDeleteComment(
																		comment,
																	)}
															>
																{m.char_detail_comment_delete()}
															</button>
														{/if}
													{:else}
														<button
															class="btn btn-xs btn-ghost"
															type="button"
															title={hidden
																? m.char_detail_hide_tooltip_hidden()
																: m.char_detail_hide_tooltip_visible()}
															onclick={() =>
																handleToggleHideComment(
																	comment,
																)}
														>
															{hidden ? m.char_detail_comment_unhide() : m.char_detail_comment_hide()}
														</button>
													{/if}
													{#if comment.author !== getCurrentUser() && !comment.deleted}
														<button
															class="btn btn-xs btn-ghost"
															type="button"
															onclick={() => startReply(comment)}
														>
															{m.char_detail_comment_reply()}
														</button>
													{/if}
												</div>
											</div>
											<p
												class="mt-1 whitespace-pre-wrap text-sm"
												class:line-through={comment.deleted}
											>
												{comment.content}
											</p>
											{#if comment.deleted}
												<p class="mt-1 text-xs italic opacity-70">{m.char_detail_comment_delete_requested()}</p>
											{/if}

											{#if replies.length > 0}
												<ul class="mt-2 flex flex-col gap-2 border-l-2 border-base-300 pl-3">
													{#each replies as reply (reply.id)}
														{@const replyHidden = isCommentHidden(reply.id)}
														<li class:opacity-50={replyHidden}>
															<div class="flex items-center justify-between gap-2">
																<span class="text-xs font-semibold opacity-70">
																	{authorLabel(reply.author)}
																	{#if reply.author === character.author}
																		<span class="badge badge-xs badge-primary ml-1"
																			>{m.char_detail_author_badge()}</span
																		>
																	{/if}
																	{#if replyHidden}
																		<span class="badge badge-xs ml-1">{m.char_detail_hidden_badge()}</span>
																	{/if}
																	<span class="ml-1 font-normal opacity-60" title={formatCommentTime(reply.created_at)}>
																		{formatCommentTime(reply.created_at)}
																	</span>
																</span>
																<div class="flex gap-1">
																	{#if reply.author === getCurrentUser()}
																		{#if !reply.deleted}
																			<button
																				class="btn btn-xs btn-ghost"
																				type="button"
																				onclick={() => handleDeleteComment(reply)}
																			>
																				{m.char_detail_comment_delete()}
																			</button>
																		{/if}
																	{:else}
																		<button
																			class="btn btn-xs btn-ghost"
																			type="button"
																			title={replyHidden
																				? m.char_detail_hide_tooltip_hidden()
																				: m.char_detail_hide_tooltip_visible()}
																			onclick={() => handleToggleHideComment(reply)}
																		>
																			{replyHidden ? m.char_detail_comment_unhide() : m.char_detail_comment_hide()}
																		</button>
																	{/if}
																	{#if reply.author !== getCurrentUser() && !reply.deleted}
																		<button
																			class="btn btn-xs btn-ghost"
																			type="button"
																			onclick={() => startReply(reply)}
																		>
																			{m.char_detail_comment_reply()}
																		</button>
																	{/if}
																</div>
															</div>
															<p class="mt-1 whitespace-pre-wrap text-sm" class:line-through={reply.deleted}>{reply.content}</p>
															{#if reply.deleted}
																<p class="mt-1 text-xs italic opacity-70">{m.char_detail_comment_delete_requested()}</p>
															{/if}
														</li>
													{/each}
												</ul>
											{/if}

											{#if replyingToCommentId === comment.id}
												<form
													class="mt-2 flex flex-col gap-2 border-l-2 border-base-300 pl-3"
													onsubmit={(event) => handlePostReply(event, comment.id)}
												>
													<textarea
														class="textarea textarea-bordered w-full text-sm"
														placeholder={m.char_detail_reply_placeholder()}
														bind:value={replyDraft}
														maxlength={MAX_COMMENT_LENGTH}
														rows="2"
													></textarea>
													{#if replyError}
														<p class="text-error text-xs">
															{m.error_generic({ message: replyError })}
														</p>
													{/if}
													<div class="flex gap-1 self-end">
														<button
															class="btn btn-xs"
															type="button"
															onclick={() => {
																replyingToCommentId = null;
																replyingToTargetId = null;
																replyError = null;
															}}
														>
															{m.char_detail_cancel_reply()}
														</button>
														<button
															class="btn btn-xs btn-primary"
															type="submit"
															disabled={posting || !replyDraft.trim()}
														>
															{m.char_detail_post_comment()}
														</button>
													</div>
												</form>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						{/if}
					{:else}
						<p class="text-sm opacity-60">
							{m.char_detail_comments_disabled()}
						</p>
					{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<UserProfileModal
		open={profileModalPubkey !== null}
		pubkey={profileModalPubkey}
		onclose={() => (profileModalPubkey = null)}
	/>

	<ConfirmDialog
		open={commentDeleteTarget !== null}
		title={m.char_detail_comment_delete_title()}
		message={m.char_detail_comment_delete_message()}
		confirmLabel={m.char_detail_comment_delete()}
		danger
		onconfirm={confirmDeleteComment}
		oncancel={() => (commentDeleteTarget = null)}
	/>
</div>
