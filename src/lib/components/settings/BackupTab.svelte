<script lang="ts">
	import { getKeyring, setKeyring } from '$lib/state/auth.svelte';
	import { exportAccountBackup, parseAccountBackup } from '$lib/identity/backup';

	let importText = $state('');
	let importError = $state<string | null>(null);
	let imported = $state(false);

	function handleExport() {
		const keyring = getKeyring();
		if (!keyring) return;
		const json = exportAccountBackup(keyring);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'charshare-account-backup.json';
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleImport(event: SubmitEvent) {
		event.preventDefault();
		importError = null;
		imported = false;
		try {
			const keyring = parseAccountBackup(importText);
			await setKeyring(keyring);
			importText = '';
			imported = true;
		} catch (err) {
			importError = err instanceof Error ? err.message : String(err);
		}
	}
</script>

<div class="flex flex-col gap-6">
	<div>
		<h3 class="font-semibold">Back up your account</h3>
		<p class="text-sm opacity-70">
			Download a file that lets you use this account on another device or browser.
		</p>
		<button class="btn btn-sm mt-2" type="button" onclick={handleExport}>Download backup</button>
	</div>

	<div>
		<h3 class="font-semibold">Use an existing account</h3>
		<p class="text-sm opacity-70">
			Paste the contents of a backup file to switch this browser to that account. Keep this file
			safe — it's the only way to access your account, and it can't be recovered if lost.
		</p>
		<form class="mt-2 flex flex-col gap-2" onsubmit={handleImport}>
			<textarea
				class="textarea textarea-bordered"
				rows="4"
				placeholder="Paste backup file contents"
				bind:value={importText}
			></textarea>
			<button class="btn btn-sm btn-primary self-start" type="submit">Use this account</button>
			{#if importError}
				<p class="text-error text-sm">{importError}</p>
			{/if}
			{#if imported}
				<p class="text-success text-sm">Switched to the imported account.</p>
			{/if}
		</form>
	</div>
</div>
