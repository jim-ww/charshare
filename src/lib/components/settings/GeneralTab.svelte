<script lang="ts">
	import { getPreferences, updatePreferences } from '$lib/state/preferences.svelte';
	import type { ThemeMode } from '$lib/types';

	const preferences = $derived(getPreferences());

	function handleThemeChange(event: Event) {
		updatePreferences({ theme: (event.currentTarget as HTMLSelectElement).value as ThemeMode });
	}
</script>

<div class="flex flex-col gap-2">
	<label class="form-control w-40">
		<span class="label-text">Theme</span>
		<select class="select select-bordered" value={preferences.theme} onchange={handleThemeChange}>
			<option value="dark">Dark</option>
			<option value="light">Light</option>
		</select>
	</label>
</div>
