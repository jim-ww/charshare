<script lang="ts">
	import { untrack } from "svelte";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import type { Character, Comment } from "$lib/types";
	import { subscribeCharacter } from "$lib/gun/characters";
	import { getCurrentUser } from "$lib/state/auth.svelte";
	import {
		deleteMyCharacter,
		exportCharacter,
		forkCharacter,
		getMyCharacters,
		isCharacterLocalOnly,
		publishMyCharacter,
	} from "$lib/state/characters.svelte";
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
	import { getProfile } from "$lib/gun/users";
	import CharacterImageViewer from "$lib/components/CharacterImageViewer.svelte";
	import PersonaSelectorButton from "$lib/components/PersonaSelectorButton.svelte";
	import {
		getSelectedPersonaId,
		initPersonas,
	} from "$lib/state/personas.svelte";

	const id = $derived(page.params.id as string);

	let character = $state<Character | null>(null);
	let notFound = $state(false);
	let newComment = $state("");
	let posting = $state(false);
	let authorNames = $state<Record<string, string>>({});

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
			subscribeCharacter(currentId, (result) => {
				if (result.ok) {
					character = result.doc;
					notFound = false;
				} else if (!character) {
					// Only flag not-found while we have nothing to show yet — GUN's
					// `.on()` can fire once with stale/missing local data before a
					// relay answers, then fire again once the real doc syncs in.
					notFound = true;
				}
			}),
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
		for (const c of comments) {
			if (c.author in authorNames) continue;
			authorNames = { ...authorNames, [c.author]: "" };
			getProfile(c.author).then((result) => {
				if (result.ok)
					authorNames = {
						...authorNames,
						[c.author]: result.doc.username,
					};
			});
		}
	});

	function authorLabel(pubkey: string): string {
		return authorNames[pubkey] || `${pubkey.slice(0, 8)}…`;
	}

	async function handleStartChat() {
		if (!character) return;
		await initPersonas();
		const chat = await createChat(
			character.id,
			character.name,
			getSelectedPersonaId(character.id) ?? null,
		);
		await goto(`/chats/${chat.id}`);
	}

	let importInput = $state<HTMLInputElement>();
	let importError = $state("");

	async function handleImportChat(event: Event) {
		if (!character) return;
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		importError = "";
		try {
			await initPersonas();
			const chat = await importChat(
				character.id,
				await file.text(),
				getSelectedPersonaId(character.id) ?? null,
			);
			await goto(`/chats/${chat.id}`);
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
		await goto(`/characters/${fork.id}/edit`);
	}

	async function handlePublish() {
		if (!character) return;
		publishing = true;
		try {
			await publishMyCharacter(character.id);
		} finally {
			publishing = false;
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
		await goto("/characters");
	}

	async function handlePostComment(event: SubmitEvent) {
		event.preventDefault();
		const content = newComment.trim();
		if (!content) return;
		posting = true;
		try {
			await addComment(id, content);
			newComment = "";
		} finally {
			posting = false;
		}
	}

	async function handleDeleteComment(comment: Comment) {
		await removeComment(id, comment.id);
	}
</script>

<div class="mx-auto max-w-5xl p-4">
	{#if notFound}
		<p class="text-error">Character not found.</p>
	{:else if !character}
		<p>Loading…</p>
	{:else}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="flex flex-col gap-4">
				<CharacterImageViewer
					images={character.image_urls}
					name={character.name}
					keyboardNav
				/>

				<div>
					<h1
						class:line-through={character.deleted}
						class="text-2xl font-semibold"
					>
						{character.name}
						<span
							class="badge badge-sm align-middle"
							class:badge-outline={localOnly}
							class:badge-primary={!localOnly}
						>
							{localOnly
								? "Local only"
								: "Published"}
						</span>
					</h1>
					{#if character.tags.length}
						<div
							class="mt-1 flex flex-wrap gap-1"
						>
							{#each character.tags as tag (tag)}
								<span
									class="badge badge-sm"
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
							href={`/chats/${latestChat.id}`}
							>Continue latest chat</a
						>
					{/if}
					<button
						class="btn btn-ghost btn-block"
						type="button"
						onclick={handleStartChat}
					>
						Start new chat
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
						Import chat
					</button>
					<input
						bind:this={importInput}
						type="file"
						accept="application/json"
						class="hidden"
						onchange={handleImportChat}
					/>
					<button
						class="btn btn-sm btn-ghost"
						type="button"
						onclick={handleExport}
						>Export</button
					>
					{#if isMine}
						<a
							class="btn btn-sm btn-ghost"
							href={`/characters/${character.id}/edit`}
							>Edit</a
						>
						{#if localOnly}
							<button
								class="btn btn-sm btn-primary"
								type="button"
								disabled={publishing}
								onclick={handlePublish}
							>
								{publishing
									? "Publishing…"
									: "Publish"}
							</button>
						{/if}
						<button
							class="btn btn-sm btn-error btn-outline"
							type="button"
							onclick={handleDelete}
						>
							Delete
						</button>
					{:else}
						<button
							class="btn btn-sm btn-ghost"
							type="button"
							onclick={handleFork}
							>Fork</button
						>
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
							Continue a past chat
						</h2>
						<ul class="flex flex-col gap-1">
							{#each pastChats as chat (chat.id)}
								<li>
									<a
										class="link link-hover text-sm"
										href={`/chats/${chat.id}`}
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
							Scenario
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
							Personality
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
							First message(s)
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

				<div class="mt-4">
					<h2 class="mb-2 text-lg font-semibold">
						Comments
					</h2>

					{#if localOnly}
						<p class="text-sm opacity-60">
							Local-only characters
							can't have comments —
							publish this character
							to enable them.
						</p>
					{:else if character.comments_enabled}
						<form
							class="mb-3 flex flex-col gap-2"
							onsubmit={handlePostComment}
						>
							<textarea
								class="textarea textarea-bordered w-full text-sm"
								placeholder="Write a comment…"
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
									? "Posting…"
									: "Post comment"}
							</button>
						</form>

						{#if commentsLoading && comments.length === 0}
							<p
								class="text-sm opacity-60"
							>
								Loading
								comments…
							</p>
						{:else if comments.length === 0}
							<p
								class="text-sm opacity-60"
							>
								No comments yet.
							</p>
						{:else}
							<ul
								class="flex flex-col gap-3"
							>
								{#each comments as comment (comment.id)}
									<li
										class="rounded-box bg-base-200 p-3"
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
														>author</span
													>
												{/if}
											</span>
											{#if comment.author === getCurrentUser()}
												<button
													class="btn btn-xs btn-ghost"
													type="button"
													onclick={() =>
														handleDeleteComment(
															comment,
														)}
												>
													Delete
												</button>
											{/if}
										</div>
										<p
											class="mt-1 whitespace-pre-wrap text-sm"
										>
											{comment.content}
										</p>
									</li>
								{/each}
							</ul>
						{/if}
					{:else}
						<p class="text-sm opacity-60">
							Comments are disabled
							for this character.
						</p>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
