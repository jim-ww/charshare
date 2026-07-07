import type { CharacterId } from './character';
import type { PersonaId } from './persona';

export type ChatId = string; // uuid
export type MessageId = string; // uuid

export type MessageRole = 'user' | 'character';

export interface Message {
  id: MessageId;
  // The message this one replies to, or null for the very first message in
  // the chat. Both regenerating and editing a message with replies already
  // built on it add a sibling under the same parent instead of overwriting
  // anything — see Chat.active_child.
  parent_id: MessageId | null;
  role: MessageRole;
  content: string; // required, can be empty
  created_at: number;
  updated_at: number;
}

export interface Chat {
  id: ChatId;
  character_id: CharacterId;
  // Which persona the user was "playing as" when this chat was created —
  // fixed for the chat's lifetime so switching personas later doesn't
  // rewrite history. Null for chats created before personas existed.
  persona_id: PersonaId | null;
  name: string;
  // Every message node that has ever existed in this chat, across every
  // regenerated branch — a tree (via Message.parent_id), not just the
  // visible conversation. Use activePath()/getActivePath to get the
  // currently-selected linear conversation to render or send to the model.
  messages: Message[];
  // Id of the root message (parent_id === null) currently on the active
  // path. Usually there's only one root; regenerating the very first
  // message adds another and this points at whichever is selected.
  root_id: MessageId | null;
  // For every message id that has more than one child, which child id is
  // currently selected as part of the conversation (the rest are alternate
  // branches, still stored in `messages`, reachable by switching back).
  active_child: Record<MessageId, MessageId>;
  created_at: number;
  // Unsent composer text, kept so navigating away or closing the page
  // doesn't lose an in-progress draft.
  draft: string;
  // Selected index in the character image viewer, so it stays put when
  // navigating away and back. Clamp against the current image count when
  // reading — the character's images can change after this was saved.
  image_index: number;
}
