<script lang="ts">
	import type { Character, CharacterDraft } from '$lib/types';

	interface Props {
		initial?: Character;
		submitLabel: string;
		onsubmit: (draft: CharacterDraft) => Promise<void>;
	}

	let { initial, submitLabel, onsubmit }: Props = $props();

	let name = $state(initial?.name ?? '');
	let description = $state(initial?.description ?? '');
	let personality = $state(initial?.personality ?? '');
	let scenario = $state(initial?.scenario ?? '');
	let tagsText = $state(initial?.tags.join(', ') ?? '');
	let nsfw = $state(initial?.nsfw ?? false);
	let systemPrompt = $state(initial?.system_prompt ?? '');
	let firstMessage = $state(initial?.first_message ?? '');
	let commentsEnabled = $state(initial?.comments_enabled ?? true);

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
				image_url: initial?.image_url ?? '',
				description,
				personality,
				scenario,
				tags: tagsText
					.split(',')
					.map((t) => t.trim())
					.filter(Boolean),
				nsfw,
				language: initial?.language ?? '',
				system_prompt: systemPrompt,
				first_message: firstMessage,
				alternate_greetings: initial?.alternate_greetings ?? [],
				comments_enabled: commentsEnabled
			});
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	}
</script>

<form class="flex max-w-lg flex-col gap-3" onsubmit={handleSubmit}>
	<label class="form-control">
		<span class="label-text">Name</span>
		<input class="input input-bordered w-full" required bind:value={name} />
	</label>
	<label class="form-control">
		<span class="label-text">Description</span>
		<textarea class="textarea textarea-bordered w-full" bind:value={description}></textarea>
	</label>
	<label class="form-control">
		<span class="label-text">Personality</span>
		<textarea class="textarea textarea-bordered w-full" bind:value={personality}></textarea>
	</label>
	<label class="form-control">
		<span class="label-text">Scenario</span>
		<textarea class="textarea textarea-bordered w-full" bind:value={scenario}></textarea>
	</label>
	<label class="form-control">
		<span class="label-text">System prompt</span>
		<textarea class="textarea textarea-bordered w-full" bind:value={systemPrompt}></textarea>
	</label>
	<label class="form-control">
		<span class="label-text">First message</span>
		<textarea class="textarea textarea-bordered w-full" bind:value={firstMessage}></textarea>
	</label>
	<label class="form-control">
		<span class="label-text">Tags (comma-separated)</span>
		<input class="input input-bordered w-full" bind:value={tagsText} />
	</label>
	<label class="flex items-center gap-2">
		<input type="checkbox" class="checkbox" bind:checked={nsfw} />
		<span class="label-text">NSFW</span>
	</label>
	<label class="flex items-center gap-2">
		<input type="checkbox" class="checkbox" bind:checked={commentsEnabled} />
		<span class="label-text">Comments enabled</span>
	</label>
	<button class="btn btn-primary self-start" type="submit" disabled={saving}>
		{saving ? 'Saving…' : submitLabel}
	</button>
	{#if error}
		<p class="text-error text-sm">{error}</p>
	{/if}
</form>
