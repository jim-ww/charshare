<script lang="ts">
	import { onMount } from "svelte";
	import { resolve } from "$app/paths";
	import { getCurrentUser, isAccountRegistered } from "$lib/state/auth.svelte";
	import { closeSettings } from "$lib/state/settingsModal.svelte";
	import {
		getMyComments,
		isLoadingMyComments,
		loadMyComments,
		removeMyComment,
	} from "$lib/state/comments.svelte";
	import type { Comment } from "$lib/types";
	import { m } from "$lib/paraglide/messages.js";
	import ConfirmDialog from "../ConfirmDialog.svelte";

	const pubkey = $derived(getCurrentUser());
	const registered = $derived(isAccountRegistered());
	const comments = $derived(getMyComments());
	const loading = $derived(isLoadingMyComments());

	let deleteTarget = $state<Comment | null>(null);

	onMount(() => {
		if (pubkey) void loadMyComments(pubkey);
	});

	function formatTime(timestamp: number): string {
		return new Date(timestamp).toLocaleString();
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		await removeMyComment(deleteTarget.id);
		deleteTarget = null;
	}
</script>

{#if !registered}
	<p class="opacity-70">{m.my_comments_signed_in_required()}</p>
{:else if loading && comments.length === 0}
	<p class="opacity-70">{m.my_comments_loading()}</p>
{:else if comments.length === 0}
	<p class="opacity-70">{m.my_comments_empty()}</p>
{:else}
	<ul class="flex flex-col gap-3">
		{#each comments as comment (comment.id)}
			<li class="rounded-box border border-base-300 p-3" class:opacity-50={comment.deleted}>
				<div class="flex items-center justify-between gap-2">
					<span class="text-sm opacity-60" title={formatTime(comment.created_at)}>
						{formatTime(comment.created_at)}
					</span>
					<a
						class="link link-primary text-sm"
						href={resolve("/characters/[id]", { id: comment.character_id })}
						onclick={closeSettings}
					>
						{m.my_comments_view_character()}
					</a>
				</div>

				<p class="mt-2 whitespace-pre-wrap" class:line-through={comment.deleted}>{comment.content}</p>
				{#if comment.deleted}
					<p class="mt-1 text-sm italic opacity-70">{m.my_comments_delete_requested()}</p>
				{:else}
					<div class="mt-2 flex gap-2">
						<button class="btn btn-sm btn-error" onclick={() => (deleteTarget = comment)}>
							{m.my_comments_delete()}
						</button>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<ConfirmDialog
	open={deleteTarget !== null}
	title={m.my_comments_delete_title()}
	message={m.my_comments_delete_message()}
	confirmLabel={m.my_comments_delete()}
	danger
	onconfirm={confirmDelete}
	oncancel={() => (deleteTarget = null)}
/>
