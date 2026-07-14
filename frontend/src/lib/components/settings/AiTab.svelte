<script lang="ts">
	import {
		getPreferences,
		updateProviderConfig,
		switchProvider,
		resetAdvancedProviderDefaults
	} from '$lib/state/preferences.svelte';
	import type { ProviderConfig } from '$lib/types';
	import { m } from '$lib/paraglide/messages.js';

	const preferences = $derived(getPreferences());
	const provider = $derived(preferences.provider);
	// Ollama talks to a server the user runs themselves — no third-party ToS applies.
	const needsTosAgreement = $derived(provider.provider !== 'ollama' && !provider.tosAgreed);
	const providerLabel = $derived(
		{
			openrouter: m.ai_tab_provider_openrouter(),
			ollama: m.ai_tab_provider_ollama(),
			huggingface: m.ai_tab_provider_huggingface(),
			openai_compatible: m.ai_tab_provider_openai_compatible()
		}[provider.provider]
	);

	type KeysOf<T> = T extends unknown ? keyof T : never;
	type AnyProviderKey = KeysOf<ProviderConfig>;

	function update<K extends AnyProviderKey>(
		key: K,
		value: Extract<ProviderConfig, Record<K, unknown>>[K]
	) {
		updateProviderConfig({ [key]: value } as Partial<ProviderConfig>);
	}
</script>

<div class="flex flex-col gap-3">
	<label class="form-control">
		<span class="label-text">{m.ai_tab_provider_label()}</span>
		<select
			class="select select-bordered w-full"
			value={provider.provider}
			onchange={(e) => switchProvider(e.currentTarget.value as ProviderConfig['provider'])}
		>
			<option value="ollama">{m.ai_tab_provider_ollama()}</option>
			<option value="huggingface">{m.ai_tab_provider_huggingface()}</option>
			<option value="openrouter">{m.ai_tab_provider_openrouter()}</option>
			<option value="openai_compatible">{m.ai_tab_provider_openai_compatible()}</option>
		</select>
	</label>

	<div class="relative flex flex-col gap-3">
		{#if needsTosAgreement}
			<div class="absolute inset-0 z-10 flex items-center justify-center">
				<button
					class="btn btn-primary"
					type="button"
					onclick={() => update('tosAgreed', true)}
				>
					{m.ai_tab_tos_agree_button({ provider: providerLabel })}
				</button>
			</div>
		{/if}
		<div
			class="flex flex-col gap-3"
			class:blur-sm={needsTosAgreement}
			class:pointer-events-none={needsTosAgreement}
			aria-hidden={needsTosAgreement}
			inert={needsTosAgreement}
		>
	{#if provider.provider === 'openrouter'}
		<label class="form-control">
			<span class="label-text">{m.ai_tab_openrouter_key_label()}</span>
			<input
				class="input input-bordered w-full"
				type="password"
				value={provider.apiKey}
				oninput={(e) => update('apiKey', e.currentTarget.value)}
			/>
			<span class="text-sm opacity-70">{m.ai_tab_stored_locally()}</span>
		</label>
	{:else if provider.provider === 'ollama'}
		<label class="form-control">
			<span class="label-text">{m.ai_tab_ollama_url_label()}</span>
			<input
				class="input input-bordered w-full"
				value={provider.baseUrl}
				oninput={(e) => update('baseUrl', e.currentTarget.value)}
			/>
			<span class="text-sm opacity-70">
				{m.ai_tab_ollama_hint()}
			</span>
		</label>
	{:else if provider.provider === 'huggingface'}
		<label class="form-control">
			<span class="label-text">{m.ai_tab_huggingface_key_label()}</span>
			<input
				class="input input-bordered w-full"
				type="password"
				value={provider.apiKey}
				oninput={(e) => update('apiKey', e.currentTarget.value)}
			/>
			<span class="text-sm opacity-70">{m.ai_tab_stored_locally()}</span>
		</label>
	{:else}
		<label class="form-control">
			<span class="label-text">{m.ai_tab_openai_compatible_url_label()}</span>
			<input
				class="input input-bordered w-full"
				placeholder="https://api.example.com/v1"
				value={provider.baseUrl}
				oninput={(e) => update('baseUrl', e.currentTarget.value)}
			/>
			<span class="text-sm opacity-70">{m.ai_tab_openai_compatible_url_hint()}</span>
		</label>
		<label class="form-control">
			<span class="label-text">{m.ai_tab_openai_compatible_key_label()}</span>
			<input
				class="input input-bordered w-full"
				type="password"
				value={provider.apiKey}
				oninput={(e) => update('apiKey', e.currentTarget.value)}
			/>
			<span class="text-sm opacity-70">{m.ai_tab_openai_compatible_key_hint()}</span>
		</label>
	{/if}

	<label class="form-control">
		<span class="label-text">{m.ai_tab_model_label()}</span>
		<input
			class="input input-bordered w-full"
			value={provider.model}
			oninput={(e) => update('model', e.currentTarget.value)}
		/>
	</label>

	<label class="label cursor-pointer justify-start gap-3">
		<input
			type="checkbox"
			class="checkbox"
			checked={provider.disable_thinking}
			onchange={(e) => update('disable_thinking', e.currentTarget.checked)}
		/>
		<span class="label-text">{m.ai_tab_disable_thinking_label()}</span>
	</label>

	<div class="collapse-arrow bg-base-200 collapse">
		<input type="checkbox" />
		<div class="collapse-title font-semibold">{m.ai_tab_advanced_heading()}</div>
		<div class="collapse-content flex flex-col gap-3">
			<div class="grid grid-cols-2 gap-3">
				<label class="form-control">
					<span class="label-text">{m.ai_tab_temperature_label()}</span>
					<input
						class="input input-bordered"
						type="number"
						step="0.1"
						value={provider.temperature}
						oninput={(e) => update('temperature', Number(e.currentTarget.value))}
					/>
				</label>
				<label class="form-control">
					<span class="label-text">{m.ai_tab_max_tokens_label()}</span>
					<input
						class="input input-bordered"
						type="number"
						value={provider.max_tokens}
						oninput={(e) => update('max_tokens', Number(e.currentTarget.value))}
					/>
				</label>
				<label class="form-control">
					<span class="label-text">{m.ai_tab_context_size_label()}</span>
					<input
						class="input input-bordered"
						type="number"
						value={provider.context_size}
						oninput={(e) => update('context_size', Number(e.currentTarget.value))}
					/>
				</label>
				<label class="form-control">
					<span class="label-text">{m.ai_tab_top_k_label()}</span>
					<input
						class="input input-bordered"
						type="number"
						value={provider.top_k}
						oninput={(e) => update('top_k', Number(e.currentTarget.value))}
					/>
				</label>
				<label class="form-control">
					<span class="label-text">{m.ai_tab_top_p_label()}</span>
					<input
						class="input input-bordered"
						type="number"
						step="0.1"
						value={provider.top_p}
						oninput={(e) => update('top_p', Number(e.currentTarget.value))}
					/>
				</label>
				<label class="form-control">
					<span class="label-text">{m.ai_tab_repetition_penalty_label()}</span>
					<input
						class="input input-bordered"
						type="number"
						step="0.1"
						value={provider.repetition_penalty}
						oninput={(e) => update('repetition_penalty', Number(e.currentTarget.value))}
					/>
				</label>
				<label class="form-control">
					<span class="label-text">{m.ai_tab_frequency_penalty_label()}</span>
					<input
						class="input input-bordered"
						type="number"
						step="0.1"
						value={provider.frequency_penalty}
						oninput={(e) => update('frequency_penalty', Number(e.currentTarget.value))}
						disabled={provider.provider === 'ollama'}
						title={provider.provider === 'ollama' ? m.ai_tab_frequency_penalty_unsupported() : undefined}
					/>
				</label>
			</div>

			<label class="form-control">
				<span class="label-text">{m.ai_tab_forbidden_words_label()}</span>
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

			<button
				class="btn btn-sm self-start"
				type="button"
				onclick={() => resetAdvancedProviderDefaults()}
			>
				{m.ai_tab_reset_defaults()}
			</button>
		</div>
	</div>
		</div>
	</div>
</div>
