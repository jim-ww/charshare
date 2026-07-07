<script lang="ts">
	import { getPreferences, updatePreferences } from '$lib/state/preferences.svelte';
	import { DAISYUI_THEMES, type ThemeMode } from '$lib/types';

	const preferences = $derived(getPreferences());

	function handleThemeChange(event: Event) {
		updatePreferences({ theme: (event.currentTarget as HTMLSelectElement).value as ThemeMode });
	}

	function handleDefaultBackgroundChange(event: Event) {
		updatePreferences({ defaultBackground: (event.currentTarget as HTMLInputElement).value });
	}
</script>

<div class="flex flex-col gap-4">
	<label class="form-control w-40">
		<span class="label-text">Theme</span>
		<select class="select select-bordered" value={preferences.theme} onchange={handleThemeChange}>
			{#each DAISYUI_THEMES as theme (theme)}
				<option value={theme}>{theme[0].toUpperCase() + theme.slice(1)}</option>
			{/each}
		</select>
	</label>

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
</div>
