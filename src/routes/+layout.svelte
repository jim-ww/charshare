<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { initPreferences, getPreferences } from '$lib/state/preferences.svelte';
	import { initAuth } from '$lib/state/auth.svelte';
	import { initProfile } from '$lib/state/profile.svelte';
	import { initCharacters } from '$lib/state/characters.svelte';
	import { initChats } from '$lib/state/chats.svelte';
	import NavBar from '$lib/components/NavBar.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';

	let { children } = $props();

	onMount(() => {
		initPreferences();
		initAuth();
		initProfile();
		initCharacters();
		initChats();
	});

	$effect(() => {
		document.documentElement.dataset.theme = getPreferences().theme;
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<NavBar />
{@render children()}
<SettingsModal />

<div style="display:none">
	{#each locales as locale}
		<a href={localizeHref(page.url.pathname, { locale })}>{locale}</a>
	{/each}
</div>
