<script lang="ts">
	import { onMount, untrack } from "svelte";
	import { beforeNavigate } from "$app/navigation";
	import type { Character, CharacterDraft } from "$lib/types";
	import CharacterImageViewer from "./CharacterImageViewer.svelte";
	import { isAccountRegistered } from "$lib/state/auth.svelte";
	import { openSettings } from "$lib/state/settingsModal.svelte";
	import { LANGUAGES } from "$lib/languages";
	import { PREDEFINED_TAGS } from "$lib/data/tags";
	import { DEFAULT_SYSTEM_PROMPT } from "$lib/data/defaultSystemPrompt";

	interface Props {
		initial?: Character;
		draft?: CharacterDraft;
		submitLabel: string;
		onsubmit: (draft: CharacterDraft) => Promise<void>;
		localOnly?: boolean;
		showLocalOnlyToggle?: boolean;
	}

	let {
		initial,
		draft,
		submitLabel,
		onsubmit,
		localOnly = $bindable(true),
		showLocalOnlyToggle = false,
	}: Props = $props();
	const registered = $derived(isAccountRegistered());

	let name = $state(untrack(() => initial?.name ?? draft?.name ?? ""));
	let imageUrls = $state<string[]>(
		untrack(() => [...((initial ?? draft)?.image_urls ?? [])]),
	);
	let viewerIndex = $state(0);

	function addImageUrl() {
		imageUrls.push("");
	}

	function removeImageUrl(index: number) {
		imageUrls.splice(index, 1);
	}

	// The viewer only shows non-empty, trimmed urls, so a row's position in
	// `imageUrls` doesn't line up with its position there if blank entries
	// sit before it — count how many non-empty urls precede it instead.
	function showInViewer(index: number) {
		const url = imageUrls[index]?.trim();
		if (!url) return;
		viewerIndex = imageUrls
			.slice(0, index)
			.filter((u) => u.trim()).length;
	}

	let draggedImageIndex = $state<number | null>(null);
	let dragOverImageIndex = $state<number | null>(null);

	function handleImageDragStart(index: number) {
		draggedImageIndex = index;
	}

	function handleImageDragOver(event: DragEvent, index: number) {
		event.preventDefault();
		dragOverImageIndex = index;
	}

	function handleImageDrop(index: number) {
		if (draggedImageIndex === null || draggedImageIndex === index) {
			draggedImageIndex = null;
			dragOverImageIndex = null;
			return;
		}
		const [moved] = imageUrls.splice(draggedImageIndex, 1);
		imageUrls.splice(index, 0, moved);
		draggedImageIndex = null;
		dragOverImageIndex = null;
	}

	function handleImageDragEnd() {
		draggedImageIndex = null;
		dragOverImageIndex = null;
	}
	let description = $state(
		untrack(() => initial?.description ?? draft?.description ?? ""),
	);
	let personality = $state(
		untrack(() => initial?.personality ?? draft?.personality ?? ""),
	);
	let scenario = $state(
		untrack(() => initial?.scenario ?? draft?.scenario ?? ""),
	);
	let tagsText = $state(
		untrack(() => (initial ?? draft)?.tags.join(", ") ?? ""),
	);
	let tagsInputEl = $state<HTMLInputElement>();
	let tagSuggestionsOpen = $state(false);
	let tagSuggestionsHighlight = $state(-1);
	let tagGuidelinesEl = $state<HTMLDialogElement>();

	const currentTagFragment = $derived(
		tagsText
			.slice(tagsText.lastIndexOf(",") + 1)
			.trim()
			.toLowerCase(),
	);
	const tagSuggestions = $derived.by(() => {
		if (!currentTagFragment) return [];
		const existing = new Set(
			tagsText
				.split(",")
				.map((t) => t.trim().toLowerCase())
				.filter(Boolean),
		);
		return PREDEFINED_TAGS.filter(
			(t) =>
				t.name
					.toLowerCase()
					.includes(currentTagFragment) &&
				!existing.has(t.name.toLowerCase()),
		).slice(0, 8);
	});

	$effect(() => {
		// Reset the highlight whenever the suggestion list itself changes,
		// so an old index doesn't point at an unrelated tag.
		tagSuggestions;
		tagSuggestionsHighlight = -1;
	});

	function handleTagsKeydown(event: KeyboardEvent) {
		if (!tagSuggestionsOpen || !tagSuggestions.length) return;
		if (event.key === "ArrowDown") {
			event.preventDefault();
			tagSuggestionsHighlight =
				(tagSuggestionsHighlight + 1) %
				tagSuggestions.length;
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			tagSuggestionsHighlight =
				(tagSuggestionsHighlight -
					1 +
					tagSuggestions.length) %
				tagSuggestions.length;
		} else if (
			event.key === "Enter" &&
			tagSuggestionsHighlight >= 0
		) {
			event.preventDefault();
			pickTagSuggestion(
				tagSuggestions[tagSuggestionsHighlight].name,
			);
		} else if (event.key === "Escape") {
			tagSuggestionsOpen = false;
		}
	}

	function pickTagSuggestion(name: string) {
		const upToLastComma = tagsText.slice(
			0,
			tagsText.lastIndexOf(",") + 1,
		);
		const prefix = upToLastComma ? `${upToLastComma} ` : "";
		tagsText = `${prefix}${name}, `;
		tagsInputEl?.focus();
	}
	let nsfw = $state(untrack(() => initial?.nsfw ?? draft?.nsfw ?? false));
	let language = $state(
		untrack(() => initial?.language || draft?.language || "en"),
	);
	let systemPrompt = $state(
		untrack(
			() =>
				initial?.system_prompt ??
				draft?.system_prompt ??
				"",
		),
	);
	let firstMessage = $state(
		untrack(
			() =>
				initial?.first_message ??
				draft?.first_message ??
				"",
		),
	);
	let alternateGreetings = $state<string[]>(
		untrack(() =>
			(initial ?? draft)?.alternate_greetings.length
				? [...(initial ?? draft)!.alternate_greetings]
				: [],
		),
	);
	let commentsEnabled = $state(
		untrack(
			() =>
				initial?.comments_enabled ??
				draft?.comments_enabled ??
				true,
		),
	);

	function addGreeting() {
		alternateGreetings.push("");
	}

	function removeGreeting(index: number) {
		alternateGreetings.splice(index, 1);
	}

	let exampleDialogues = $state<string[]>(
		untrack(() =>
			(initial ?? draft)?.example_dialogues.length
				? [...(initial ?? draft)!.example_dialogues]
				: [],
		),
	);

	function addExampleDialogue() {
		exampleDialogues.push("");
	}

	function removeExampleDialogue(index: number) {
		exampleDialogues.splice(index, 1);
	}

	// Generous cap on the whole published character record, mainly to catch
	// someone pasting a novel into a text field — not a fine-grained budget.
	const MAX_CHARACTER_JSON_BYTES = 50_000;

	let saving = $state(false);
	let error = $state<string | null>(null);

	// Snapshot of every editable field, used to detect unsaved changes so we
	// can warn before the user navigates away or closes the tab.
	function snapshot(): string {
		return JSON.stringify({
			name,
			imageUrls,
			description,
			personality,
			scenario,
			tagsText,
			nsfw,
			language,
			systemPrompt,
			firstMessage,
			alternateGreetings,
			exampleDialogues,
			commentsEnabled,
		});
	}

	let savedSnapshot = untrack(() => snapshot());
	const isDirty = $derived(snapshot() !== savedSnapshot);

	beforeNavigate((navigation) => {
		if (!isDirty) return;
		if (
			!confirm(
				"You have unsaved changes. Leave this page anyway?",
			)
		) {
			navigation.cancel();
		}
	});

	onMount(() => {
		function handleBeforeUnload(event: BeforeUnloadEvent) {
			if (!isDirty) return;
			event.preventDefault();
		}
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () =>
			window.removeEventListener(
				"beforeunload",
				handleBeforeUnload,
			);
	});

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		error = null;
		const previousSnapshot = savedSnapshot;
		try {
			const trimmedImageUrls = imageUrls
				.map((u) => u.trim())
				.filter(Boolean);
			const invalidImageUrl = trimmedImageUrls.find(
				(u) => !/^https?:\/\//i.test(u),
			);
			if (invalidImageUrl) {
				throw new Error(
					`Image URLs must link to an image hosted elsewhere (starting with http:// or https://) — got "${invalidImageUrl.slice(0, 60)}"`,
				);
			}

			const payload: CharacterDraft = {
				id: initial?.id,
				name,
				image_urls: trimmedImageUrls,
				description,
				personality,
				scenario,
				tags: tagsText
					.split(",")
					.map((t) => t.trim())
					.filter(Boolean),
				nsfw,
				language,
				system_prompt: systemPrompt,
				first_message: firstMessage,
				alternate_greetings: alternateGreetings
					.map((g) => g.trim())
					.filter(Boolean),
				example_dialogues: exampleDialogues
					.map((g) => g.trim())
					.filter(Boolean),
				comments_enabled: commentsEnabled,
			};

			const payloadBytes = new TextEncoder().encode(
				JSON.stringify(payload),
			).length;
			if (payloadBytes > MAX_CHARACTER_JSON_BYTES) {
				throw new Error(
					`Character data is too large (${Math.round(payloadBytes / 1000)}KB, limit ${Math.round(MAX_CHARACTER_JSON_BYTES / 1000)}KB). Trim down the description, dialogues, or greetings.`,
				);
			}

			// Update the snapshot before submitting (not after) since
			// onsubmit navigates away on success, and beforeNavigate would
			// otherwise still see stale isDirty state from before this await.
			savedSnapshot = snapshot();
			await onsubmit(payload);
		} catch (err) {
			savedSnapshot = previousSnapshot;
			error =
				err instanceof Error
					? err.message
					: String(err);
		} finally {
			saving = false;
		}
	}
</script>

<form class="mx-auto flex max-w-6xl flex-col gap-6" onsubmit={handleSubmit}>
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<div
			class="order-2 flex flex-col gap-3 lg:order-1 lg:col-span-1"
		>
			<div class="form-control">
				<span class="label-text">Image</span>
				<CharacterImageViewer
					images={imageUrls
						.map((u) => u.trim())
						.filter(Boolean)}
					name={name || "?"}
					bind:index={viewerIndex}
				/>
			</div>
			<label class="form-control">
				<span class="label-text">Name</span>
				<input
					class="input input-bordered w-full"
					required
					bind:value={name}
					placeholder="e.g. Aria Nightshade"
				/>
			</label>
			<label class="form-control">
				<span class="label-text">Language</span>
				<select
					class="select select-bordered w-full"
					required
					bind:value={language}
				>
					{#if language && !LANGUAGES.some(([code]) => code === language)}
						<option value={language}
							>{language} (unrecognized)</option
						>
					{/if}
					{#each LANGUAGES as [code, name] (code)}
						<option value={code}
							>{name}</option
						>
					{/each}
				</select>
			</label>
			<label class="form-control">
				<span
					class="label-text flex items-center gap-1.5"
				>
					Tags (comma-separated)
					<button
						type="button"
						class="btn btn-circle btn-ghost btn-xs"
						title="Tag guidelines"
						onclick={() =>
							tagGuidelinesEl?.showModal()}
					>
						?
					</button>
				</span>
				<div class="dropdown w-full">
					<input
						bind:this={tagsInputEl}
						class="input input-bordered w-full"
						bind:value={tagsText}
						autocomplete="off"
						placeholder="fantasy, adventurer, tsundere"
						onfocus={() =>
							(tagSuggestionsOpen = true)}
						onblur={() =>
							setTimeout(
								() =>
									(tagSuggestionsOpen = false),
								150,
							)}
						onkeydown={handleTagsKeydown}
					/>
					{#if tagSuggestionsOpen && tagSuggestions.length}
						<ul
							class="dropdown-content menu bg-base-200 rounded-box z-10 mt-1 w-full flex-nowrap gap-0.5 overflow-y-auto p-2 shadow-xl"
						>
							{#each tagSuggestions as tag, index (tag.name)}
								<li>
									<button
										type="button"
										class:menu-active={index ===
											tagSuggestionsHighlight}
										title={tag.description ??
											tag.name}
										onmousedown={(
											e,
										) =>
											e.preventDefault()}
										onmouseenter={() =>
											(tagSuggestionsHighlight =
												index)}
										onclick={() =>
											pickTagSuggestion(
												tag.name,
											)}
									>
										{tag.name}
										{#if tag.description}
											<span
												class="text-xs opacity-60"
												>{tag.description}</span
											>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</label>
			<dialog bind:this={tagGuidelinesEl} class="modal">
				<div class="modal-box">
					<h3 class="text-lg font-bold">
						Tag guidelines
					</h3>
					<ul
						class="mt-2 list-disc pl-5 text-sm opacity-80"
					>
						<li>
							Lowercase only, e.g. <code
								>fantasy</code
							>, not
							<code>Fantasy</code>.
						</li>
						<li>
							Use hyphens instead of
							spaces, e.g. <code
								>monster-girl</code
							>, not
							<code>monster girl</code
							>.
						</li>
						<li>
							Separate multiple tags
							with commas.
						</li>
						<li>
							Pick from the
							suggestions where
							possible so the same
							concept isn't spelled
							differently across
							characters.
						</li>
					</ul>
					<div class="modal-action">
						<button
							type="button"
							class="btn"
							onclick={() =>
								tagGuidelinesEl?.close()}
						>
							Got it
						</button>
					</div>
				</div>
				<button
					type="button"
					class="modal-backdrop"
					aria-label="Close"
					onclick={() => tagGuidelinesEl?.close()}
				></button>
			</dialog>
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					class="checkbox"
					bind:checked={nsfw}
				/>
				<span class="label-text">NSFW</span>
			</label>
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					class="checkbox"
					bind:checked={commentsEnabled}
				/>
				<span class="label-text">Comments enabled</span>
			</label>
			{#if showLocalOnlyToggle}
				<label
					class="flex cursor-pointer items-start gap-2"
				>
					<input
						type="checkbox"
						class="checkbox"
						checked={localOnly ||
							!registered}
						disabled={!registered}
						onchange={(e) =>
							(localOnly = (
								e.currentTarget as HTMLInputElement
							).checked)}
					/>
					<span class="label-text">
						Keep local-only (not published
						to the network — no comments,
						only visible to you)
					</span>
				</label>
				{#if !registered}
					<p class="text-xs opacity-60">
						You're browsing as a guest, so
						new characters stay local-only.
						<button
							type="button"
							class="link"
							onclick={() =>
								openSettings(
									"account",
								)}
							>Create an account</button
						> to publish to the network.
					</p>
				{/if}
			{/if}
		</div>

		<div
			class="order-1 flex flex-col gap-4 lg:order-2 lg:col-span-2"
		>
			<div class="join join-vertical w-full">
				<div
					class="collapse-arrow bg-base-200 border-base-300 join-item collapse border"
				>
					<input type="checkbox" checked />
					<div
						class="collapse-title label-text font-medium"
					>
						Description
					</div>
					<div class="collapse-content">
						<textarea
							class="textarea textarea-bordered field-sizing-content min-h-24 w-full"
							bind:value={description}
							placeholder="Who is this character? Appearance, background, notable traits…"
						></textarea>
					</div>
				</div>
				<div
					class="collapse-arrow bg-base-200 border-base-300 join-item collapse border"
				>
					<input type="checkbox" />
					<div
						class="collapse-title label-text font-medium"
					>
						Image URLs{imageUrls.length
							? ` (${imageUrls.length})`
							: ""}
					</div>
					<div class="collapse-content">
						<div class="form-control gap-2">
							<p class="text-sm opacity-70">
								Links to images hosted
								elsewhere only (e.g. <code
									>https://example.com/image.png</code
								>) — there's no upload; the
								character record is small
								text data that's copied to
								every peer on the network,
								so images have to stay
								externally hosted.
							</p>
							<div
								class="flex items-center justify-end"
							>
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									onclick={addImageUrl}
								>
									+ Add
									image
								</button>
							</div>
							{#each imageUrls as _, i}
								<div
									role="listitem"
									class="flex items-center gap-2 {dragOverImageIndex ===
										i &&
									draggedImageIndex !==
										null &&
									draggedImageIndex !==
										i
										? 'border-primary rounded border-2 border-dashed'
										: ''}"
									ondragover={(
										e,
									) =>
										handleImageDragOver(
											e,
											i,
										)}
									ondrop={() =>
										handleImageDrop(
											i,
										)}
								>
									<button
										type="button"
										class="btn btn-ghost btn-sm cursor-grab active:cursor-grabbing"
										aria-label="Drag to reorder"
										draggable="true"
										ondragstart={() =>
											handleImageDragStart(
												i,
											)}
										ondragend={handleImageDragEnd}
									>
										⠿
									</button>
									<button
										type="button"
										class="btn btn-ghost btn-sm w-10 tabular-nums"
										aria-label={`Preview image ${i + 1}`}
										onclick={() =>
											showInViewer(
												i,
											)}
									>
										{i +
											1}
									</button>
									<input
										class="input input-bordered w-full"
										bind:value={
											imageUrls[
												i
											]
										}
										placeholder="https://…"
									/>
									<button
										type="button"
										class="btn btn-ghost btn-sm"
										aria-label="Remove image"
										onclick={() =>
											removeImageUrl(
												i,
											)}
									>
										✕
									</button>
								</div>
							{/each}
						</div>
					</div>
				</div>
				<div
					class="collapse-arrow bg-base-200 border-base-300 join-item collapse border"
				>
					<input type="checkbox" />
					<div
						class="collapse-title label-text font-medium"
					>
						Personality
					</div>
					<div class="collapse-content">
						<textarea
							class="textarea textarea-bordered field-sizing-content min-h-24 w-full"
							bind:value={personality}
							placeholder="How do they act, speak, and think? e.g. blunt, secretly caring, quick to anger…"
						></textarea>
					</div>
				</div>
				<div
					class="collapse-arrow bg-base-200 border-base-300 join-item collapse border"
				>
					<input type="checkbox" />
					<div
						class="collapse-title label-text font-medium"
					>
						Scenario
					</div>
					<div class="collapse-content">
						<textarea
							class="textarea textarea-bordered field-sizing-content min-h-24 w-full"
							bind:value={scenario}
							placeholder="The setting or situation the chat starts in…"
						></textarea>
					</div>
				</div>

				<div
					class="collapse-arrow bg-base-200 border-base-300 join-item collapse border"
				>
					<input type="checkbox" />
					<div
						class="collapse-title label-text font-medium"
					>
						First message
					</div>
					<div class="collapse-content">
						<textarea
							class="textarea textarea-bordered field-sizing-content min-h-24 w-full"
							bind:value={
								firstMessage
							}
							placeholder="The message {'{{char}}'} sends to open the conversation…"
						></textarea>
					</div>
				</div>

				<div
					class="collapse-arrow bg-base-200 border-base-300 join-item collapse border"
				>
					<input type="checkbox" />
					<div
						class="collapse-title label-text font-medium"
					>
						Alternate greetings{alternateGreetings.length
							? ` (${alternateGreetings.length})`
							: ""}
					</div>
					<div class="collapse-content">
						<div class="form-control gap-2">
							<div
								class="flex items-center justify-between"
							>
								<span
									class="label-text"
									>Alternate
									greetings</span
								>
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									onclick={addGreeting}
								>
									+ Add
									greeting
								</button>
							</div>
							{#each alternateGreetings as _, i}
								<div
									class="flex gap-2"
								>
									<textarea
										class="textarea textarea-bordered field-sizing-content min-h-16 w-full"
										bind:value={
											alternateGreetings[
												i
											]
										}
										placeholder="An alternate opening message…"

									></textarea>
									<button
										type="button"
										class="btn btn-ghost btn-sm"
										aria-label="Remove greeting"
										onclick={() =>
											removeGreeting(
												i,
											)}
									>
										✕
									</button>
								</div>
							{/each}
						</div>
					</div>
				</div>

				<div
					class="collapse-arrow bg-base-200 border-base-300 join-item collapse border"
				>
					<input type="checkbox" />
					<div
						class="collapse-title label-text font-medium"
					>
						Example dialogues{exampleDialogues.length
							? ` (${exampleDialogues.length})`
							: ""}
					</div>
					<div class="collapse-content">
						<div class="form-control gap-2">
							<div
								class="flex items-center justify-between"
							>
								<span
									class="label-text"
									>Example
									exchanges
									showing
									how
									{"{{char}}"}
									talks</span
								>
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									onclick={addExampleDialogue}
								>
									+ Add
									example
								</button>
							</div>
							{#each exampleDialogues as _, i}
								<div
									class="flex gap-2"
								>
									<textarea
										class="textarea textarea-bordered field-sizing-content min-h-24 w-full"
										bind:value={
											exampleDialogues[
												i
											]
										}
										placeholder={"{{user}}: What are you doing here?\n{{char}}: *glances over* Waiting for you, obviously."}

									></textarea>
									<button
										type="button"
										class="btn btn-ghost btn-sm"
										aria-label="Remove example dialogue"
										onclick={() =>
											removeExampleDialogue(
												i,
											)}
									>
										✕
									</button>
								</div>
							{/each}
						</div>
					</div>
				</div>

				<div
					class="collapse-arrow bg-base-200 border-base-300 join-item collapse border"
				>
					<input type="checkbox" />
					<div
						class="collapse-title label-text font-medium"
					>
						Custom system prompt
					</div>
					<div
						class="collapse-content flex flex-col gap-2"
					>
						<p class="text-sm opacity-70">
							Leave blank to use the
							default roleplay
							instructions. Only set
							this to override that
							default, e.g.:
						</p>
						<p
							class="whitespace-pre-wrap rounded-box bg-base-300 p-2 text-xs opacity-60"
						>
							{DEFAULT_SYSTEM_PROMPT}
						</p>
						<textarea
							class="textarea textarea-bordered field-sizing-content min-h-32 w-full"
							bind:value={
								systemPrompt
							}
							placeholder="Instructions sent to the AI describing how to roleplay this character…"
						></textarea>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="flex items-center gap-4">
		<button class="btn btn-primary" type="submit" disabled={saving}>
			{saving ? "Saving…" : submitLabel}
		</button>
		{#if error}
			<p class="text-error text-sm">{error}</p>
		{/if}
	</div>
</form>
