<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
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
	import { installWailsConsoleForward } from '$lib/wailsConsoleForward';

	let { children } = $props();

	onMount(() => {
		installWailsConsoleForward();
		initPreferences();
		initAuth();
		initProfile();
		initCharacters();
		initChats();
	});

	$effect(() => {
		document.documentElement.dataset.theme = getPreferences().theme;
	});

	const pageOrder = [resolve('/characters'), resolve('/chats')];

	function isEditableTarget(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false;
		const tag = target.tagName;
		return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (event.key === "Tab" && event.ctrlKey) {
			if (event.altKey || event.metaKey) return;
			if (isEditableTarget(event.target)) return;

			const currentIndex = pageOrder.findIndex((href) =>
				page.url.pathname.startsWith(href),
			);

			event.preventDefault();
			if (currentIndex === -1) {
				goto(pageOrder[0]);
				return;
			}
			const step = event.shiftKey ? -1 : 1;
			const nextIndex =
				(currentIndex + step + pageOrder.length) % pageOrder.length;
			goto(pageOrder[nextIndex]);
			return;
		}

		if (
			event.altKey &&
			!event.ctrlKey &&
			!event.metaKey &&
			(event.key === "ArrowLeft" || event.key === "ArrowRight")
		) {
			if (isEditableTarget(event.target)) return;
			event.preventDefault();
			if (event.key === "ArrowLeft") {
				history.back();
			} else {
				history.forward();
			}
		}
	}
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<svelte:window onkeydown={handleGlobalKeydown} />
<NavBar />
{@render children()}
<SettingsModal />

<div style="display:none">
	{#each locales as locale}
		<a href={localizeHref(page.url.pathname, { locale })}>{locale}</a>
	{/each}
</div>
