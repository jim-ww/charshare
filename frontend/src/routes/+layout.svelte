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
	import { initProfile, checkUsernameConflict } from '$lib/state/profile.svelte';
	import { initCharacters } from '$lib/state/characters.svelte';
	import { initSavedCharacters } from '$lib/state/savedCharacters.svelte';
	import { initChats } from '$lib/state/chats.svelte';
	import NavBar from '$lib/components/NavBar.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import ImageViewerOverlay from '$lib/components/ImageViewerOverlay.svelte';
	import NotificationStack from '$lib/components/NotificationStack.svelte';
	import GlobalConfirmDialog from '$lib/components/GlobalConfirmDialog.svelte';
	import UnlockGate from '$lib/components/UnlockGate.svelte';
	import { installWailsConsoleForward } from '$lib/wailsConsoleForward';

	let { children, data } = $props();

	// True only when local-data encryption is enabled and +layout.ts's
	// `load()` couldn't unlock it silently (no/wrong saved passphrase on
	// desktop, or the plain website build, which has no OS credential store
	// to try). UnlockGate's onunlock callback runs the exact same
	// init*() sequence once the user provides the right passphrase.
	let locked = $state(data.locked);

	function runInit() {
		initPreferences();
		initAuth();
		initProfile().then(() => checkUsernameConflict());
		initCharacters();
		initSavedCharacters();
		initChats();
	}

	onMount(() => {
		installWailsConsoleForward();
		// Safe to call unconditionally here — +layout.ts's `load()` has already
		// awaited this exact promise before this component (or any route
		// content) rendered at all, so preferences are guaranteed loaded before
		// initProfile/initCharacters resolve which relays to talk to (see
		// state/preferences.svelte.ts:getActiveRelays). When locked, load()
		// skipped initPreferences() entirely — runInit() fires instead once
		// UnlockGate's onunlock callback confirms the passphrase.
		if (!locked) runInit();
	});

	function handleUnlock() {
		locked = false;
		runInit();
	}

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
{#if locked}
	<UnlockGate onunlock={handleUnlock} />
{:else}
	<NavBar />
	{@render children()}
	<SettingsModal />
	<ImageViewerOverlay />
	<NotificationStack />
	<GlobalConfirmDialog />
{/if}

<div style="display:none">
	{#each locales as locale}
		<a href={localizeHref(page.url.pathname, { locale })}>{locale}</a>
	{/each}
</div>
