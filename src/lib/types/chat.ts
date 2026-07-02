import type { CharacterId } from './character';

export type ChatId = string; // uuid
export type MessageId = string; // uuid

export type MessageRole = 'user' | 'character';

export interface MessageVersion {
  content: string; // required, can be empty
  created_at: number;
}

export interface Message {
  id: MessageId;
  role: MessageRole;
  versions: MessageVersion[]; // at least one entry
  active_version_index: number;
  updated_at: number;
}

export interface Chat {
  id: ChatId;
  character_id: CharacterId;
  name: string;
  messages: Message[];
  created_at: number;
}

/** Convenience accessor — components should use this instead of
 *  reaching into `versions[active_version_index]` themselves. */
export function activeContent(message: Message): string {
  return message.versions[message.active_version_index]?.content ?? '';
}
