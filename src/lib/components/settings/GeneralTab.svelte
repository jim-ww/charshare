<script lang="ts">
	import { getPreferences, updatePreferences } from '$lib/state/preferences.svelte';
	import { DAISYUI_THEMES, type ThemeMode } from '$lib/types';

	const preferences = $derived(getPreferences());

	function selectTheme(theme: ThemeMode) {
		updatePreferences({ theme });
	}

	function handleDefaultBackgroundChange(event: Event) {
		updatePreferences({ defaultBackground: (event.currentTarget as HTMLInputElement).value });
	}

	function handleChatOpacityChange(event: Event) {
		updatePreferences({ chatOpacity: Number((event.currentTarget as HTMLInputElement).value) });
	}
</script>

<div class="flex flex-col gap-4">
	<div class="dropdown">
		<span class="label-text mb-1 block">Theme</span>
		<div tabindex="0" role="button" class="btn btn-outline w-56 justify-between">
			<span class="flex items-center gap-2">
				<span
					data-theme={preferences.theme}
					class="bg-base-100 flex gap-0.5 rounded border border-white/10 p-1"
				>
					<span class="bg-primary h-3 w-1.5 rounded-sm"></span>
					<span class="bg-secondary h-3 w-1.5 rounded-sm"></span>
					<span class="bg-accent h-3 w-1.5 rounded-sm"></span>
					<span class="bg-neutral h-3 w-1.5 rounded-sm"></span>
				</span>
				{preferences.theme[0].toUpperCase() + preferences.theme.slice(1)}
			</span>
			<svg class="h-4 w-4 opacity-60" viewBox="0 0 20 20" fill="currentColor">
				<path
					fill-rule="evenodd"
					d="M5.23 7.21a.75.75 0 011.06.02L10 11.293l3.71-4.06a.75.75 0 111.08 1.04l-4.25 4.65a.75.75 0 01-1.08 0l-4.25-4.65a.75.75 0 01.02-1.06z"
					clip-rule="evenodd"
				/>
			</svg>
		</div>
		<ul
			role="listbox"
			tabindex="0"
			class="dropdown-content bg-base-200 rounded-box z-10 mt-2 grid max-h-80 w-64 grid-cols-1 gap-1 overflow-y-auto p-2 shadow-xl"
		>
			{#each DAISYUI_THEMES as theme (theme)}
				<li>
					<button
						type="button"
						data-theme={theme}
						class="bg-base-100 text-base-content flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors"
						class:border-primary={preferences.theme === theme}
						class:border-transparent={preferences.theme !== theme}
						onclick={() => selectTheme(theme)}
					>
						<span class="flex gap-0.5">
							<span class="bg-primary h-4 w-1.5 rounded-sm"></span>
							<span class="bg-secondary h-4 w-1.5 rounded-sm"></span>
							<span class="bg-accent h-4 w-1.5 rounded-sm"></span>
							<span class="bg-neutral h-4 w-1.5 rounded-sm"></span>
						</span>
						<span class="flex-1">{theme[0].toUpperCase() + theme.slice(1)}</span>
						{#if preferences.theme === theme}
							<svg class="text-primary h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
								<path
									fill-rule="evenodd"
									d="M16.704 5.29a1 1 0 010 1.415l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 111.414-1.414l2.793 2.792 6.793-6.793a1 1 0 011.414 0z"
									clip-rule="evenodd"
								/>
							</svg>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	</div>

	<label class="form-control w-full max-w-md">
		<span class="label-text">Default chat background</span>
		<input
			class="input input-bordered w-full"
			type="url"
			placeholder="https://…"
			value={preferences.defaultBackground}
			onchange={handleDefaultBackgroundChange}
		/>
		<span class="mt-1 text-sm opacity-70">
			Applied to new chats automatically when set. Leave empty for no default.
		</span>
	</label>

	<label class="form-control w-full max-w-md">
		<span class="label-text">Message/composer opacity ({preferences.chatOpacity}%)</span>
		<input
			class="range"
			type="range"
			min="10"
			max="100"
			value={preferences.chatOpacity}
			oninput={handleChatOpacityChange}
		/>
		<span class="mt-1 text-sm opacity-70">
			Fades chat bubbles and the composer so a chat background shows through.
		</span>
	</label>
</div>
