<script lang="ts">
	import type { Character, CharacterDraft } from "$lib/types";
	import CharacterImageViewer from "./CharacterImageViewer.svelte";

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
	const defaultSystemPrompt = `You are {{char}}, and you must stay in character as {{char}} at all times.
Write {{char}}'s next reply in a fictional chat between {{char}} and {{user}}.
Narrate actions and physical reactions in *asterisks*, and speak dialogue plainly.
Never speak, act, or narrate for {{user}} — only control {{char}}.
Never state or assume what {{user}} does, thinks, or feels unless {{user}} has explicitly said so.
Stay consistent with {{char}}'s personality, scenario, and prior messages.`;

	let name = $state(initial?.name ?? draft?.name ?? "");
	let imageUrls = $state<string[]>(
		[...((initial ?? draft)?.image_urls ?? [])],
	);

	function addImageUrl() {
		imageUrls.push("");
	}

	function removeImageUrl(index: number) {
		imageUrls.splice(index, 1);
	}
	let description = $state(
		initial?.description ?? draft?.description ?? "",
	);
	let personality = $state(
		initial?.personality ?? draft?.personality ?? "",
	);
	let scenario = $state(initial?.scenario ?? draft?.scenario ?? "");
	let tagsText = $state((initial ?? draft)?.tags.join(", ") ?? "");
	let nsfw = $state(initial?.nsfw ?? draft?.nsfw ?? false);
	let language = $state(
		initial?.language ??
			draft?.language ??
			(initial || draft ? "" : "en"),
	);
	let systemPrompt = $state(
		initial?.system_prompt ??
			draft?.system_prompt ??
			(initial || draft ? "" : defaultSystemPrompt),
	);
	let firstMessage = $state(
		initial?.first_message ?? draft?.first_message ?? "",
	);
	let alternateGreetings = $state<string[]>(
		(initial ?? draft)?.alternate_greetings.length
			? [...(initial ?? draft)!.alternate_greetings]
			: [],
	);
	let commentsEnabled = $state(
		initial?.comments_enabled ?? draft?.comments_enabled ?? true,
	);

	function addGreeting() {
		alternateGreetings.push("");
	}

	function removeGreeting(index: number) {
		alternateGreetings.splice(index, 1);
	}

	let saving = $state(false);
	let error = $state<string | null>(null);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		error = null;
		try {
			await onsubmit({
				id: initial?.id,
				name,
				image_urls: imageUrls.map((u) => u.trim()).filter(Boolean),
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
				comments_enabled: commentsEnabled,
			});
		} catch (err) {
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
					images={imageUrls.map((u) => u.trim()).filter(Boolean)}
					name={name || "?"}
				/>
			</div>
			<div class="form-control gap-2">
				<div class="flex items-center justify-between">
					<span class="label-text">Image URLs</span>
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						onclick={addImageUrl}
					>
						+ Add image
					</button>
				</div>
				{#each imageUrls as _, i}
					<div class="flex gap-2">
						<input
							class="input input-bordered w-full"
							bind:value={imageUrls[i]}
							placeholder="https://…"
						/>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							aria-label="Remove image"
							onclick={() => removeImageUrl(i)}
						>
							✕
						</button>
					</div>
				{/each}
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
				<input
					class="input input-bordered w-full"
					bind:value={language}
					placeholder="en"
				/>
			</label>
			<label class="form-control">
				<span class="label-text"
					>Tags (comma-separated)</span
				>
				<input
					class="input input-bordered w-full"
					bind:value={tagsText}
					placeholder="fantasy, adventurer, tsundere"
				/>
			</label>
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
						bind:checked={localOnly}
					/>
					<span class="label-text">
						Keep local-only (not published
						to the network — no comments,
						only visible to you)
					</span>
				</label>
			{/if}
		</div>

		<div
			class="order-1 flex flex-col gap-4 lg:order-2 lg:col-span-2"
		>
			<label class="form-control">
				<span class="label-text">Description</span>
				<textarea
					class="textarea textarea-bordered field-sizing-content min-h-24 w-full"
					bind:value={description}
					placeholder="Who is this character? Appearance, background, notable traits…"
				></textarea>
			</label>
			<label class="form-control">
				<span class="label-text">Personality</span>
				<textarea
					class="textarea textarea-bordered field-sizing-content min-h-24 w-full"
					bind:value={personality}
					placeholder="How do they act, speak, and think? e.g. blunt, secretly caring, quick to anger…"
				></textarea>
			</label>
			<label class="form-control">
				<span class="label-text">Scenario</span>
				<textarea
					class="textarea textarea-bordered field-sizing-content min-h-24 w-full"
					bind:value={scenario}
					placeholder="The setting or situation the chat starts in…"
				></textarea>
			</label>
			<label class="form-control">
				<span class="label-text">System prompt</span>
				<textarea
					class="textarea textarea-bordered field-sizing-content min-h-32 w-full"
					bind:value={systemPrompt}
					placeholder="Instructions sent to the AI describing how to roleplay this character…"
				></textarea>
			</label>
			<label class="form-control">
				<span class="label-text">First message</span>
				<textarea
					class="textarea textarea-bordered field-sizing-content min-h-24 w-full"
					bind:value={firstMessage}
					placeholder="The message {'{{char}}'} sends to open the conversation…"
				></textarea>
			</label>

			<div class="form-control gap-2">
				<div class="flex items-center justify-between">
					<span class="label-text"
						>Alternate greetings</span
					>
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						onclick={addGreeting}
					>
						+ Add greeting
					</button>
				</div>
				{#each alternateGreetings as _, i}
					<div class="flex gap-2">
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

	<div class="flex items-center gap-4">
		<button class="btn btn-primary" type="submit" disabled={saving}>
			{saving ? "Saving…" : submitLabel}
		</button>
		{#if error}
			<p class="text-error text-sm">{error}</p>
		{/if}
	</div>
</form>
