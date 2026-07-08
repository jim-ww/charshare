import { createSignedPointerIndex } from './signedIndex';

/** Well-known pseudo-tag every published character is also indexed under, so
 *  browsing can list everything on the network without requiring a caller to
 *  already know one of a character's real tags. Not a valid user-entered tag
 *  (leading/trailing underscores), so it can't collide with real tag names. */
export const NETWORK_INDEX_TAG = '__network__';

const tagIndex = createSignedPointerIndex('tags');

export const getTagIndex = tagIndex.getIndex;
export const addToTagIndex = tagIndex.addToIndex;
