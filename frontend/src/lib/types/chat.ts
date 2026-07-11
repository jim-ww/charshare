import type { CharacterId } from './character';
import type { PersonaId } from './persona';
import type { TtsProviderConfig } from './preferences';

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
  // Image URLs the user has added as selectable chat backgrounds. Just URLs
  // for now, not uploaded/stored blobs.
  backgrounds: string[];
  // Currently-applied background, or null for none. Not necessarily a
  // member of `backgrounds` at read time if it was since deleted — callers
  // should fall back to null in that case.
  active_background: string | null;
  // Read-aloud settings are per-chat, not global — a chat with a young
  // character shouldn't have to share a voice/pitch with one where the
  // character is an old man. Model downloads/caching are still managed
  // globally in Settings → Sound; only the *selection* lives here, and
  // travels with the chat on export/import like backgrounds do.
  tts_provider: TtsProviderConfig | null; // null means read-aloud is off for this chat
  tts_voice_id: 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'm1' | 'm2' | 'm3' | 'm4' | 'm5';
  tts_pitch: number; // pitch-only ratio applied on top of the voice, e.g. 1.4 for a higher/younger-sounding read, 0.8 for a deeper one — independent of tts_speed
  tts_speed: number; // speaking-speed-only ratio, independent of tts_pitch — e.g. 1.2 for a faster, energetic delivery
}
