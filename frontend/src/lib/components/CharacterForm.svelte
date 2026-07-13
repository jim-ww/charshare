<script lang="ts">
	import { onMount, untrack } from "svelte";
	import { beforeNavigate, goto } from "$app/navigation";
	import ConfirmDialog from "./ConfirmDialog.svelte";
	import type { Character, CharacterDraft } from "$lib/types";
	import CharacterImageViewer from "./CharacterImageViewer.svelte";
	import TagSuggestionsList from "./TagSuggestionsList.svelte";
	import { isAccountRegistered } from "$lib/state/auth.svelte";
	import { openSettings } from "$lib/state/settingsModal.svelte";
	import { LANGUAGES } from "$lib/languages";
	import { PREDEFINED_TAGS } from "$lib/data/tags";
	import { DEFAULT_SYSTEM_PROMPT } from "$lib/data/defaultSystemPrompt";
	import { m } from '$lib/paraglide/messages.js';

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

	const tagCategories = [...new Set(PREDEFINED_TAGS.map((t) => t.type))];

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
		// Typing a category name (e.g. "kink") lists every tag in it, instead
		// of only tags whose name happens to contain that string.
		const categoryMatch = tagCategories.find((c) => c === currentTagFragment);
		return PREDEFINED_TAGS.filter(
			(t) =>
				(categoryMatch
					? t.type === categoryMatch
					: t.name.toLowerCase().includes(currentTagFragment)) &&
				!existing.has(t.name.toLowerCase()),
		);
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

	// `savedSnapshot` must be `$state`, not a plain variable — `isDirty` is a
	// memoized `$derived` that only recomputes when a *tracked reactive*
	// dependency changes. A plain `let` reassignment doesn't invalidate that
	// memo, so `isDirty` would keep returning its last cached value even
	// after `savedSnapshot` was updated to match the current form (this was
	// exactly why confirming "Leave page?" did nothing — isDirty stayed
	// stuck true, so the replayed navigation kept re-triggering the guard).
	let savedSnapshot = $state(untrack(() => snapshot()));
	const isDirty = $derived(snapshot() !== savedSnapshot);

	// `beforeNavigate` must decide synchronously, so it can't await our modal.
	// Cancel the navigation up front, show the modal, then replay the same
	// navigation via `goto` if the user confirms (bypassing the guard since
	// `savedSnapshot` is reset first).
	let pendingNavigationUrl = $state<URL | null>(null);

	beforeNavigate((navigation) => {
		if (!isDirty || pendingNavigationUrl) return;
		if (navigation.to?.url) {
			navigation.cancel();
			pendingNavigationUrl = navigation.to.url;
		}
	});

	function confirmNavigation() {
		const url = pendingNavigationUrl;
		pendingNavigationUrl = null;
		if (!url) return;
		savedSnapshot = snapshot();
		goto(url);
	}

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
					m.char_form_error_image_url({ url: invalidImageUrl.slice(0, 60) }),
				);
			}

			const tags = tagsText
				.split(",")
				.map((t) => t.trim())
				.filter(Boolean);

			const payload: CharacterDraft = {
				id: initial?.id,
				name,
				image_urls: trimmedImageUrls,
				description,
				personality,
				scenario,
				tags,
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
					m.char_form_error_too_large({
						actualKb: String(Math.round(payloadBytes / 1000)),
						limitKb: String(Math.round(MAX_CHARACTER_JSON_BYTES / 1000)),
					}),
				);
			}

			// Update the snapshot before submitting (not after) since
			// onsubmit navigates away on success, and beforeNavigate would
			// otherwise still see stale isDirty state from before this await.
			savedSnapshot = snapshot();
			await onsubmit(payload);
		} catch (err) {
			savedSnapshot = previousSnapshot;
			error = m.error_generic({
				message: err instanceof Error ? err.message : String(err),
			});
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
				<span class="label-text">{m.char_form_image_label()}</span>
				<CharacterImageViewer
					images={imageUrls
						.map((u) => u.trim())
						.filter(Boolean)}
					name={name || "?"}
					bind:index={viewerIndex}
				/>
			</div>
			<label class="form-control">
				<span class="label-text">{m.char_form_name_label()}</span>
				<input
					class="input input-bordered w-full"
					required
					bind:value={name}
					placeholder={m.char_form_name_placeholder()}
				/>
			</label>
			<label class="form-control">
				<span class="label-text">{m.char_form_language_label()}</span>
				<select
					class="select select-bordered w-full"
					required
					bind:value={language}
				>
					{#if language && !LANGUAGES.some(([code]) => code === language)}
						<option value={language}
							>{language} {m.char_form_language_unrecognized()}</option
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
					{m.char_form_tags_label()}
					<button
						type="button"
						class="btn btn-circle btn-ghost btn-xs"
						title={m.char_form_tag_guidelines_title()}
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
						placeholder={m.char_form_tags_placeholder()}
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
						<TagSuggestionsList
							suggestions={tagSuggestions}
							highlight={tagSuggestionsHighlight}
							onhighlight={(i) => (tagSuggestionsHighlight = i)}
							onpick={pickTagSuggestion}
							class="w-full"
						/>
					{/if}
				</div>
			</label>
			<dialog bind:this={tagGuidelinesEl} class="modal">
				<div class="modal-box">
					<h3 class="text-lg font-bold">
						{m.char_form_tag_guidelines_heading()}
					</h3>
					<ul
						class="mt-2 list-disc pl-5 text-sm opacity-80"
					>
						<li>
							{m.char_form_tag_guidelines_lowercase()} <code
								>fantasy</code
							>, {m.char_form_tag_guidelines_not()}
							<code>Fantasy</code>.
						</li>
						<li>
							{m.char_form_tag_guidelines_hyphens()} <code
								>monster-girl</code
							>, {m.char_form_tag_guidelines_not()}
							<code>monster girl</code
							>.
						</li>
						<li>
							{m.char_form_tag_guidelines_separate()}
						</li>
						<li>
							{m.char_form_tag_guidelines_pick()}
						</li>
					</ul>
					<div class="modal-action">
						<button
							type="button"
							class="btn"
							onclick={() =>
								tagGuidelinesEl?.close()}
						>
							{m.char_form_tag_guidelines_got_it()}
						</button>
					</div>
				</div>
				<button
					type="button"
					class="modal-backdrop"
					aria-label={m.char_form_close()}
					onclick={() => tagGuidelinesEl?.close()}
				></button>
			</dialog>
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					class="checkbox"
					bind:checked={nsfw}
				/>
				<span class="label-text">{m.char_form_nsfw_label()}</span>
			</label>
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					class="checkbox"
					bind:checked={commentsEnabled}
				/>
				<span class="label-text">{m.char_form_comments_enabled_label()}</span>
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
						{m.char_form_keep_local_only_label()}
					</span>
				</label>
				{#if !registered}
					<p class="text-xs opacity-60">
						{m.char_form_guest_notice_before()}
						<button
							type="button"
							class="link"
							onclick={() =>
								openSettings(
									"account",
								)}
							>{m.char_form_guest_create_account()}</button
						> {m.char_form_guest_notice_after()}
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
						{m.char_form_description_heading()}
					</div>
					<div class="collapse-content">
						<textarea
							class="textarea textarea-bordered field-sizing-content min-h-24 w-full"
							bind:value={description}
							placeholder={m.char_form_description_placeholder()}
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
						{m.char_form_image_urls_heading()}{imageUrls.length
							? m.char_form_count_suffix({ count: String(imageUrls.length) })
							: ""}
					</div>
					<div class="collapse-content">
						<div class="form-control gap-2">
							<p class="text-sm opacity-70">
								{m.char_form_image_urls_body()} <code
									>https://example.com/image.png</code
								>{m.char_form_image_urls_body_after()}
							</p>
							<div
								class="flex items-center justify-end"
							>
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									onclick={addImageUrl}
								>
									{m.char_form_add_image()}
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
										aria-label={m.char_form_drag_reorder()}
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
										aria-label={`${m.char_form_preview_image()} ${i + 1}`}
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
										placeholder={m.char_form_image_url_placeholder()}
									/>
									<button
										type="button"
										class="btn btn-ghost btn-sm"
										aria-label={m.char_form_remove_image()}
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
						{m.char_form_personality_heading()}
					</div>
					<div class="collapse-content">
						<textarea
							class="textarea textarea-bordered field-sizing-content min-h-24 w-full"
							bind:value={personality}
							placeholder={m.char_form_personality_placeholder()}
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
						{m.char_form_scenario_heading()}
					</div>
					<div class="collapse-content">
						<textarea
							class="textarea textarea-bordered field-sizing-content min-h-24 w-full"
							bind:value={scenario}
							placeholder={m.char_form_scenario_placeholder()}
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
						{m.char_form_first_message_heading()}
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
						{m.char_form_alternate_greetings_heading()}{alternateGreetings.length
							? m.char_form_count_suffix({ count: String(alternateGreetings.length) })
							: ""}
					</div>
					<div class="collapse-content">
						<div class="form-control gap-2">
							<div
								class="flex items-center justify-between"
							>
								<span
									class="label-text"
									>{m.char_form_alternate_greetings_heading()}</span
								>
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									onclick={addGreeting}
								>
									{m.char_form_add_greeting()}
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
										placeholder={m.char_form_greeting_placeholder()}

									></textarea>
									<button
										type="button"
										class="btn btn-ghost btn-sm"
										aria-label={m.char_form_remove_greeting()}
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
						{m.char_form_example_dialogues_heading()}{exampleDialogues.length
							? m.char_form_count_suffix({ count: String(exampleDialogues.length) })
							: ""}
					</div>
					<div class="collapse-content">
						<div class="form-control gap-2">
							<div
								class="flex items-center justify-between"
							>
								<span
									class="label-text"
									>{m.char_form_example_dialogues_label()}
									{"{{char}}"}
									{m.char_form_example_dialogues_talks()}</span
								>
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									onclick={addExampleDialogue}
								>
									{m.char_form_add_example()}
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
										aria-label={m.char_form_remove_example_dialogue()}
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
						{m.char_form_system_prompt_heading()}
					</div>
					<div
						class="collapse-content flex flex-col gap-2"
					>
						<p class="text-sm opacity-70">
							{m.char_form_system_prompt_body()}
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
							placeholder={m.char_form_system_prompt_placeholder()}
						></textarea>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="flex items-center gap-4">
		<button class="btn btn-primary" type="submit" disabled={saving}>
			{saving ? m.char_form_saving() : submitLabel}
		</button>
		{#if error}
			<p class="text-error text-sm">{error}</p>
		{/if}
	</div>
</form>

<ConfirmDialog
	open={pendingNavigationUrl !== null}
	title={m.char_form_unsaved_changes_title()}
	message={m.char_form_unsaved_changes_confirm()}
	confirmLabel={m.char_form_unsaved_changes_leave()}
	danger
	onconfirm={confirmNavigation}
	oncancel={() => (pendingNavigationUrl = null)}
/>
