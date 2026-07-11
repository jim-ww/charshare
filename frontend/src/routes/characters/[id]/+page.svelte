<script lang="ts">
	import { untrack } from "svelte";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import type { Character, Comment } from "$lib/types";
	import { subscribeCharacterWithRetry } from "$lib/gun/characters";
	import {
		getCurrentUser,
		isAccountRegistered,
	} from "$lib/state/auth.svelte";
	import { openSettings } from "$lib/state/settingsModal.svelte";
	import { languageName } from "$lib/languages";
	import {
		deleteMyCharacter,
		exportCharacter,
		forkCharacter,
		getMyCharacters,
		isCharacterInMyCharacters,
		isCharacterLocalOnly,
		publishMyCharacter,
	} from "$lib/state/characters.svelte";
	import {
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
		editComment,
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
	import { getProfile } from "$lib/gun/users";
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
	let editingCommentId = $state<string | null>(null);
	let commentDraft = $state("");
	let commentDeleteTarget = $state<Comment | null>(null);
	let authorNames = $state<Record<string, string>>({});
	let replyingToCommentId = $state<string | null>(null);
	let replyingToTargetId = $state<string | null>(null);
	let replyDraft = $state("");
	let replyError = $state<string | null>(null);

	const localOnly = $derived(isCharacterLocalOnly(id));

	$effect(() => {
		character = null;
		notFound = false;
		const currentId = id;

		// Local-only characters were never written to GUN — subscribing there
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

		const unsubscribe = untrack(() =>
			subscribeCharacterWithRetry(
				currentId,
				(result) => {
					if (result.ok) {
						character = result.doc;
						notFound = false;
					} else if (!character) {
						// Only flag not-found while we have nothing to show yet — GUN's
						// `.on()` can fire once with stale/missing local data before a
						// relay answers, then fire again once the real doc syncs in.
						notFound = true;
					}
				},
				() => character !== null,
			),
		);
		untrack(() => {
			void initChats();
			void loadComments(currentId);
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

	function handleToggleSaved() {
		if (!character) return;
		if (isCharacterSaved(character.id)) {
			void unsaveCharacter(character.id);
		} else {
			void saveCharacterLocally(character, { auto: false });
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
		const fork = await forkCharacter(character.id);
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

	/** Re-writes this already-published character's exact signed snapshot to
	 *  whichever relay is currently configured — for when a relay switch or a
	 *  relay that never got this document leaves it missing there, without
	 *  waiting for the automatic resync that only runs on app startup (see
	 *  refresh()'s resyncMissing in characters.svelte.ts). */
	async function handleRepublish() {
		if (!character) return;
		republishing = true;
		try {
			await publishMyCharacter(character.id);
		} finally {
			republishing = false;
		}
	}

	function handleExport() {
		if (!character) return;
		const blob = new Blob([exportCharacter(character)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${character.name.replace(/[^a-z0-9_-]+/gi, "_") || "character"}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleDelete() {
		if (!character) return;
		await deleteMyCharacter(character.id);
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

	function startEditComment(comment: Comment) {
		editingCommentId = comment.id;
		commentDraft = comment.content;
	}

	async function handleSaveComment(comment: Comment) {
		const content = commentDraft.trim();
		if (content && content !== comment.content) {
			await editComment(id, comment.id, content);
		}
		editingCommentId = null;
	}

	async function handleToggleHideComment(comment: Comment) {
		if (isCommentHidden(comment.id)) {
			await unhideComment(comment.id);
		} else {
			await hideComment(comment.id);
		}
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
					<h1
						class:line-through={character.deleted}
						class="text-2xl font-semibold"
					>
						{character.name}
						<span
							class="badge badge-sm align-middle"
							class:badge-outline={isMine && localOnly}
							class:badge-primary={isMine && !localOnly}
						>
							{#if isMine}
								{localOnly
									? m.char_detail_local_only()
									: m.char_detail_published()}
							{:else}
								{m.char_detail_from_network()}
							{/if}
						</span>
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
					{#if isMine}
						<a
							class="btn btn-sm btn-ghost"
							href={resolve('/characters/[id]/edit', { id: character.id })}
							>{m.char_detail_edit()}</a
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
						{:else}
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
						<button
							class="btn btn-sm btn-error btn-outline"
							type="button"
							onclick={handleDelete}
						>
							{m.char_detail_delete()}
						</button>
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
								<li>
									<a
										class="link link-hover text-sm"
										href={resolve('/chats/[id]', { id: chat.id })}
									>
										{chat.name}
									</a>
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
								rows="2"
							></textarea>
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
													{#if comment.updated_at !== comment.created_at}
														<span
															class="italic opacity-60 ml-1"
															title={m.char_detail_edited_title({
																time: formatCommentTime(comment.updated_at),
															})}
														>
															{m.char_detail_edited_label()}
														</span>
													{/if}
												</span>
												{#if editingCommentId !== comment.id}
													<div class="flex gap-1">
														{#if comment.author === getCurrentUser()}
															<button
																class="btn btn-xs btn-ghost"
																type="button"
																onclick={() =>
																	startEditComment(
																		comment,
																	)}
															>
																{m.char_detail_comment_edit()}
															</button>
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
														{#if comment.author !== getCurrentUser()}
															<button
																class="btn btn-xs btn-ghost"
																type="button"
																onclick={() => startReply(comment)}
															>
																{m.char_detail_comment_reply()}
															</button>
														{/if}
													</div>
												{/if}
											</div>
											{#if editingCommentId === comment.id}
												<textarea
													class="textarea textarea-bordered mt-1 w-full text-sm"
													bind:value={commentDraft}
												></textarea>
												<div class="mt-1 flex gap-1">
													<button
														class="btn btn-xs btn-primary"
														type="button"
														onclick={() =>
															handleSaveComment(
																comment,
															)}
													>
														{m.char_detail_comment_save()}
													</button>
													<button
														class="btn btn-xs"
														type="button"
														onclick={() =>
															(editingCommentId =
																null)}
													>
														{m.char_detail_comment_cancel()}
													</button>
												</div>
											{:else}
												<p
													class="mt-1 whitespace-pre-wrap text-sm"
												>
													{comment.content}
												</p>
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
																	{#if reply.updated_at !== reply.created_at}
																		<span
																			class="italic opacity-60 ml-1"
																			title={m.char_detail_edited_title({
																				time: formatCommentTime(reply.updated_at),
																			})}
																		>
																			{m.char_detail_edited_label()}
																		</span>
																	{/if}
																</span>
																{#if editingCommentId !== reply.id}
																	<div class="flex gap-1">
																		{#if reply.author === getCurrentUser()}
																			<button
																				class="btn btn-xs btn-ghost"
																				type="button"
																				onclick={() => startEditComment(reply)}
																			>
																				{m.char_detail_comment_edit()}
																			</button>
																			<button
																				class="btn btn-xs btn-ghost"
																				type="button"
																				onclick={() => handleDeleteComment(reply)}
																			>
																				{m.char_detail_comment_delete()}
																			</button>
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
																		{#if reply.author !== getCurrentUser()}
																			<button
																				class="btn btn-xs btn-ghost"
																				type="button"
																				onclick={() => startReply(reply)}
																			>
																				{m.char_detail_comment_reply()}
																			</button>
																		{/if}
																	</div>
																{/if}
															</div>
															{#if editingCommentId === reply.id}
																<textarea
																	class="textarea textarea-bordered mt-1 w-full text-sm"
																	bind:value={commentDraft}
																></textarea>
																<div class="mt-1 flex gap-1">
																	<button
																		class="btn btn-xs btn-primary"
																		type="button"
																		onclick={() => handleSaveComment(reply)}
																	>
																		{m.char_detail_comment_save()}
																	</button>
																	<button
																		class="btn btn-xs"
																		type="button"
																		onclick={() => (editingCommentId = null)}
																	>
																		{m.char_detail_comment_cancel()}
																	</button>
																</div>
															{:else}
																<p class="mt-1 whitespace-pre-wrap text-sm">{reply.content}</p>
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
