<script lang="ts">
	import {
		generateCharacterField,
		type CharacterFieldContext,
		type GeneratableField
	} from "$lib/ai/characterFieldGenerate";
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		field: GeneratableField;
		getContext: () => CharacterFieldContext;
		onresult: (text: string) => void;
	}

	let { field, getContext, onresult }: Props = $props();

	let promptOpen = $state(false);
	let extraInstructions = $state("");
	let generating = $state(false);
	let error = $state<string | null>(null);

	async function run(instructions: string) {
		generating = true;
		error = null;
		try {
			const result = await generateCharacterField(field, getContext(), instructions);
			onresult(result);
			promptOpen = false;
			extraInstructions = "";
		} catch (err) {
			error = m.error_generic({ message: err instanceof Error ? err.message : String(err) });
		} finally {
			generating = false;
		}
	}
</script>

<div class="inline-flex min-w-0 max-w-xs flex-col gap-1">
	<div class="flex items-center gap-1">
		<button
			type="button"
			class="btn btn-ghost btn-xs"
			disabled={generating}
			onclick={(e) => {
				e.preventDefault();
				run(extraInstructions);
			}}
		>
			✨ {generating ? m.char_form_generating() : m.char_form_generate_button()}
		</button>
		<button
			type="button"
			class="btn btn-ghost btn-xs btn-circle"
			title={m.char_form_generate_extra_title()}
			aria-expanded={promptOpen}
			onclick={(e) => {
				e.preventDefault();
				promptOpen = !promptOpen;
			}}
		>
			{promptOpen ? "▴" : "▾"}
		</button>
	</div>
	{#if promptOpen}
		<input
			class="input input-bordered input-xs w-full"
			placeholder={m.char_form_generate_extra_placeholder()}
			bind:value={extraInstructions}
			disabled={generating}
			onkeydown={(e) => e.key === "Enter" && (e.preventDefault(), run(extraInstructions))}
		/>
	{/if}
	{#if error}
		<p class="text-error max-h-24 overflow-y-auto text-xs break-words whitespace-pre-wrap">{error}</p>
	{/if}
</div>
