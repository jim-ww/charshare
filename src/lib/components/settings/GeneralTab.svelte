<script lang="ts">
	import { getPreferences, updatePreferences } from '$lib/state/preferences.svelte';
	import { DAISYUI_THEMES, type ThemeMode } from '$lib/types';

	const preferences = $derived(getPreferences());

	function handleThemeChange(event: Event) {
		updatePreferences({ theme: (event.currentTarget as HTMLSelectElement).value as ThemeMode });
	}
</script>

<div class="flex flex-col gap-2">
	<label class="form-control w-40">
		<span class="label-text">Theme</span>
		<select class="select select-bordered" value={preferences.theme} onchange={handleThemeChange}>
			{#each DAISYUI_THEMES as theme (theme)}
				<option value={theme}>{theme[0].toUpperCase() + theme.slice(1)}</option>
			{/each}
		</select>
	</label>
</div>
