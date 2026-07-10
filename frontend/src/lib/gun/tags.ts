import { createSignedPointerIndex } from './signedIndex';

/** Well-known pseudo-tag every published character is also indexed under, so
 *  browsing can list everything on the network without requiring a caller to
 *  already know one of a character's real tags. Not a valid user-entered tag
 *  (leading/trailing underscores), so it can't collide with real tag names. */
export const NETWORK_INDEX_TAG = '__network__';

/** Reserved for system pseudo-tags like {@link NETWORK_INDEX_TAG} — user-entered
 *  tags with this shape must be rejected so they can't collide with one. */
export function isSystemTag(tag: string): boolean {
	return /^__.+__$/.test(tag);
}

const tagIndex = createSignedPointerIndex('tags');

export const getTagIndex = tagIndex.getIndex;
export const addToTagIndex = tagIndex.addToIndex;
