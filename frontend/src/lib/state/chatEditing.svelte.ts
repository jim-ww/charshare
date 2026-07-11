import { confirmDialogWithExtra } from "./confirmDialog.svelte";
import { m } from "$lib/paraglide/messages.js";

interface ActiveEdit {
	messageId: string;
	hasChanges: () => boolean;
	save: () => Promise<void>;
}

/** Only one chat message can be in edit mode at a time — tracked here rather
 *  than as local state in ChatBubble, since each bubble is a separate
 *  component instance and has no visibility into its siblings. */
let activeEdit = $state<ActiveEdit | null>(null);

export function getEditingMessageId(): string | null {
	return activeEdit?.messageId ?? null;
}

/** Requests to start editing a message, first resolving whatever edit is
 *  already in progress elsewhere. A clean edit (or none at all) switches
 *  immediately; unsaved changes prompt Save / Discard / Cancel — Cancel
 *  leaves the in-progress edit untouched and doesn't switch at all.
 *  Returns whether the switch happened. */
export async function requestStartEdit(edit: ActiveEdit): Promise<boolean> {
	if (activeEdit && activeEdit.messageId !== edit.messageId && activeEdit.hasChanges()) {
		const result = await confirmDialogWithExtra({
			title: m.chat_edit_switch_title(),
			message: m.chat_edit_switch_message(),
			confirmLabel: m.chat_edit_switch_save(),
			extraLabel: m.chat_edit_switch_discard(),
		});
		if (result === "cancel") return false;
		if (result === "confirm") await activeEdit.save();
		// result === "extra" (Discard): drop the pending changes and proceed.
	}
	activeEdit = edit;
	return true;
}

export function stopEditing(messageId: string): void {
	if (activeEdit?.messageId === messageId) activeEdit = null;
}
