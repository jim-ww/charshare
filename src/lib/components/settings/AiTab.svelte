<script lang="ts">
	import { getPreferences, updatePreferences, DEFAULT_OPENROUTER_CONFIG, DEFAULT_OLLAMA_CONFIG } from '$lib/state/preferences.svelte';
	import type { ProviderConfig } from '$lib/types';

	const preferences = $derived(getPreferences());
	const provider = $derived(preferences.provider);

	function update<K extends keyof typeof provider>(key: K, value: (typeof provider)[K]) {
		updatePreferences({ provider: { ...preferences.provider, [key]: value } });
	}

	function switchProvider(next: ProviderConfig['provider']) {
		if (next === provider.provider) return;
		const defaults = next === 'openrouter' ? DEFAULT_OPENROUTER_CONFIG : DEFAULT_OLLAMA_CONFIG;
		updatePreferences({ provider: { ...defaults, model: provider.model } });
	}
</script>

<div class="flex flex-col gap-3">
	<label class="form-control">
		<span class="label-text">Provider</span>
		<select
			class="select select-bordered w-full"
			value={provider.provider}
			onchange={(e) => switchProvider(e.currentTarget.value as ProviderConfig['provider'])}
		>
			<option value="openrouter">OpenRouter</option>
			<option value="ollama">Ollama</option>
		</select>
	</label>

	{#if provider.provider === 'openrouter'}
		<label class="form-control">
			<span class="label-text">OpenRouter API key</span>
			<input
				class="input input-bordered w-full"
				type="password"
				value={provider.apiKey}
				oninput={(e) => update('apiKey', e.currentTarget.value)}
			/>
			<span class="text-sm opacity-70">Stored locally only, never published.</span>
		</label>
	{:else}
		<label class="form-control">
			<span class="label-text">Ollama server URL</span>
			<input
				class="input input-bordered w-full"
				value={provider.baseUrl}
				oninput={(e) => update('baseUrl', e.currentTarget.value)}
			/>
			<span class="text-sm opacity-70">
				Local or self-hosted Ollama instance. No API key needed.
			</span>
		</label>
	{/if}

	<label class="form-control">
		<span class="label-text">Model</span>
		<input
			class="input input-bordered w-full"
			value={provider.model}
			oninput={(e) => update('model', e.currentTarget.value)}
		/>
	</label>

	<div class="grid grid-cols-2 gap-3">
		<label class="form-control">
			<span class="label-text">Temperature</span>
			<input
				class="input input-bordered"
				type="number"
				step="0.1"
				value={provider.temperature}
				oninput={(e) => update('temperature', Number(e.currentTarget.value))}
			/>
		</label>
		<label class="form-control">
			<span class="label-text">Max tokens</span>
			<input
				class="input input-bordered"
				type="number"
				value={provider.max_tokens}
				oninput={(e) => update('max_tokens', Number(e.currentTarget.value))}
			/>
		</label>
		<label class="form-control">
			<span class="label-text">Context size</span>
			<input
				class="input input-bordered"
				type="number"
				value={provider.context_size}
				oninput={(e) => update('context_size', Number(e.currentTarget.value))}
			/>
		</label>
		<label class="form-control">
			<span class="label-text">Top-K</span>
			<input
				class="input input-bordered"
				type="number"
				value={provider.top_k}
				oninput={(e) => update('top_k', Number(e.currentTarget.value))}
			/>
		</label>
		<label class="form-control">
			<span class="label-text">Top-P</span>
			<input
				class="input input-bordered"
				type="number"
				step="0.1"
				value={provider.top_p}
				oninput={(e) => update('top_p', Number(e.currentTarget.value))}
			/>
		</label>
		<label class="form-control">
			<span class="label-text">Repetition penalty</span>
			<input
				class="input input-bordered"
				type="number"
				step="0.1"
				value={provider.repetition_penalty}
				oninput={(e) => update('repetition_penalty', Number(e.currentTarget.value))}
			/>
		</label>
		<label class="form-control">
			<span class="label-text">Frequency penalty</span>
			<input
				class="input input-bordered"
				type="number"
				step="0.1"
				value={provider.frequency_penalty}
				oninput={(e) => update('frequency_penalty', Number(e.currentTarget.value))}
				disabled={provider.provider === 'ollama'}
				title={provider.provider === 'ollama' ? 'Not supported by Ollama' : undefined}
			/>
		</label>
	</div>

	<label class="label cursor-pointer justify-start gap-3">
		<input
			type="checkbox"
			class="checkbox"
			checked={provider.disable_thinking}
			onchange={(e) => update('disable_thinking', e.currentTarget.checked)}
		/>
		<span class="label-text">Disable thinking/reasoning</span>
	</label>

	<label class="form-control">
		<span class="label-text">Forbidden words/phrases (comma-separated)</span>
		<input
			class="input input-bordered w-full"
			value={provider.forbidden_words.join(', ')}
			oninput={(e) =>
				update(
					'forbidden_words',
					e.currentTarget.value
						.split(',')
						.map((w) => w.trim())
						.filter(Boolean)
				)}
		/>
	</label>
</div>
