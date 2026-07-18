<script lang="ts">
	import * as encryption from '$lib/crypto/dataEncryption';
	import { isWailsDesktop, secretServiceSet } from '$lib/wails';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		onunlock: () => void;
	}

	let { onunlock }: Props = $props();

	let passphrase = $state('');
	let remember = $state(isWailsDesktop());
	let error = $state('');
	let unlocking = $state(false);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		unlocking = true;
		error = '';
		try {
			await encryption.unlock(passphrase);
			if (remember && isWailsDesktop()) {
				// Best-effort — a failure here shouldn't block getting into the
				// already-unlocked app.
				await secretServiceSet(passphrase).catch(() => {});
			}
			onunlock();
		} catch {
			error = m.unlock_gate_wrong_passphrase();
		} finally {
			unlocking = false;
		}
	}
</script>

<div class="flex min-h-screen items-center justify-center p-4">
	<form class="card bg-base-200 w-full max-w-sm p-6 shadow-lg" onsubmit={handleSubmit}>
		<h2 class="text-lg font-semibold">{m.unlock_gate_title()}</h2>
		<p class="mt-1 text-sm opacity-70">{m.unlock_gate_body()}</p>
		<input
			type="password"
			class="input input-bordered mt-4 w-full"
			bind:value={passphrase}
			autofocus
			placeholder={m.unlock_gate_placeholder()}
		/>
		{#if isWailsDesktop()}
			<label class="label mt-2 cursor-pointer justify-start gap-2">
				<input type="checkbox" class="checkbox checkbox-sm" bind:checked={remember} />
				<span class="label-text">{m.unlock_gate_remember()}</span>
			</label>
		{/if}
		{#if error}
			<p class="text-error mt-2 text-sm">{error}</p>
		{/if}
		<button class="btn btn-primary mt-4" type="submit" disabled={!passphrase || unlocking}>
			{m.unlock_gate_unlock()}
		</button>
	</form>
</div>
