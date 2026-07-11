import type { CharacterId } from './character';
import type { Signed, Tombstonable } from './signed';

export type CommentId = string; // uuid

export const MAX_COMMENT_LENGTH = 2000;

export interface CommentFields {
  id: CommentId;
  character_id: CharacterId;
  content: string; // required, non-empty
  parent_id: CommentId | null; // null = top-level comment, otherwise the comment being replied to
}

export type Comment = CommentFields & Signed & Tombstonable;

/** Derived, not stored: computed by comparing comment.author to the
 *  parent character's author when rendering. Keep this logic in one
 *  place (lib/gun/comments.ts) rather than recomputing it per-component. */
export interface CommentDisplay {
  comment: Comment;
  verified: boolean; // always true if signature verified — kept explicit for UI clarity
  isAuthorOfCharacter: boolean; // shows the "author" badge
}
