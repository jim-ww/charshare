<script lang="ts">
	import { getPreferences, updatePreferences } from '$lib/state/preferences.svelte';
	import { DAISYUI_THEMES, type ThemeMode } from '$lib/types';
	import { m } from '$lib/paraglide/messages.js';

	const preferences = $derived(getPreferences());

	let themeMenuOpen = $state(false);
	let themeMenuEl: HTMLDivElement | undefined = $state();

	function selectTheme(theme: ThemeMode) {
		updatePreferences({ theme });
	}

	function cycleTheme(direction: 1 | -1) {
		const index = DAISYUI_THEMES.indexOf(preferences.theme);
		const nextIndex =
			(index + direction + DAISYUI_THEMES.length) % DAISYUI_THEMES.length;
		selectTheme(DAISYUI_THEMES[nextIndex]);
	}

	function selectThemeAndClose(theme: ThemeMode) {
		selectTheme(theme);
		themeMenuOpen = false;
	}

	function handleOutsideClick(event: MouseEvent) {
		if (themeMenuOpen && themeMenuEl && !themeMenuEl.contains(event.target as Node)) {
			themeMenuOpen = false;
		}
	}

	const editableTags = new Set(["INPUT", "TEXTAREA", "SELECT"]);

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (themeMenuOpen) {
			if (event.key === "Escape") {
				themeMenuOpen = false;
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				cycleTheme(-1);
			} else if (event.key === "ArrowDown") {
				event.preventDefault();
				cycleTheme(1);
			}
			return;
		}
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
		if (editableTags.has((event.target as HTMLElement)?.tagName)) return;
		event.preventDefault();
		cycleTheme(event.key === "ArrowLeft" ? -1 : 1);
	}

	function handleDefaultBackgroundChange(event: Event) {
		updatePreferences({ defaultBackground: (event.currentTarget as HTMLInputElement).value });
	}

	function handleChatOpacityChange(event: Event) {
		updatePreferences({ chatOpacity: Number((event.currentTarget as HTMLInputElement).value) });
	}

	function handleShowNsfwChange(event: Event) {
		updatePreferences({ showNsfw: (event.currentTarget as HTMLInputElement).checked });
	}
</script>

<svelte:window onmousedown={handleOutsideClick} onkeydown={handleGlobalKeydown} />

<div class="flex flex-col gap-4">
	<div>
		<span class="label-text mb-1 block">{m.general_tab_theme_label()}</span>
		<div class="flex items-center gap-2">
			<div class="relative" bind:this={themeMenuEl}>
				<button
					type="button"
					class="btn btn-outline btn-sm w-48 justify-between"
					aria-haspopup="listbox"
					aria-expanded={themeMenuOpen}
					onclick={() => (themeMenuOpen = !themeMenuOpen)}
				>
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
				</button>
				{#if themeMenuOpen}
					<ul
						role="listbox"
						class="bg-base-200 rounded-box absolute top-full left-0 z-10 mt-2 grid max-h-80 w-64 grid-cols-1 gap-1 overflow-y-auto p-2 shadow-xl"
					>
						{#each DAISYUI_THEMES as theme (theme)}
							<li>
								<button
									type="button"
									role="option"
									aria-selected={preferences.theme === theme}
									class="bg-base-100 text-base-content flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors"
									class:border-primary={preferences.theme === theme}
									class:border-transparent={preferences.theme !== theme}
									onclick={() => selectThemeAndClose(theme)}
								>
									<span data-theme={theme} class="flex gap-0.5 rounded p-0.5">
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
				{/if}
			</div>
			<div class="join">
				<button
					type="button"
					class="btn btn-outline btn-sm join-item"
					aria-label={m.general_tab_previous_theme()}
					onclick={() => cycleTheme(-1)}
				>
					<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
						<path
							fill-rule="evenodd"
							d="M12.79 14.77a.75.75 0 01-1.06.02l-4.25-4.25a.75.75 0 010-1.08l4.25-4.25a.75.75 0 111.06 1.06L9.31 10l3.48 3.71a.75.75 0 01.02 1.06z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>
				<button
					type="button"
					class="btn btn-outline btn-sm join-item"
					aria-label={m.general_tab_next_theme()}
					onclick={() => cycleTheme(1)}
				>
					<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
						<path
							fill-rule="evenodd"
							d="M7.21 14.77a.75.75 0 01.02-1.06L10.69 10 7.23 6.29a.75.75 0 111.06-1.06l4.25 4.25a.75.75 0 010 1.08l-4.25 4.25a.75.75 0 01-1.08-.04z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>
			</div>
			<span class="mt-1 block text-sm opacity-70">{m.general_tab_theme_tip()}</span>
		</div>
	</div>

	<label class="form-control w-full max-w-md">
		<span class="label-text">{m.general_tab_default_background_label()}</span>
		<input
			class="input input-bordered w-full"
			type="url"
			placeholder={m.general_tab_background_placeholder()}
			value={preferences.defaultBackground}
			onchange={handleDefaultBackgroundChange}
		/>
		<span class="mt-1 text-sm opacity-70">
			{m.general_tab_default_background_hint()}
		</span>
	</label>

	<label class="form-control w-full max-w-md">
		<span class="label-text">{m.general_tab_opacity_label()} ({preferences.chatOpacity}%)</span>
		<input
			class="range"
			type="range"
			min="10"
			max="100"
			value={preferences.chatOpacity}
			oninput={handleChatOpacityChange}
		/>
		<span class="mt-1 text-sm opacity-70">
			{m.general_tab_opacity_hint()}
		</span>
	</label>

	<label class="label w-fit cursor-pointer gap-2">
		<input
			type="checkbox"
			class="toggle toggle-warning"
			checked={preferences.showNsfw}
			onchange={handleShowNsfwChange}
		/>
		<span class="label-text">{m.general_tab_show_nsfw_label()}</span>
	</label>
</div>
