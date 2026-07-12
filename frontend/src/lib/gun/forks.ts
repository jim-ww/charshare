import { createSignedPointerIndex } from './signedIndex';

/** Indexes published characters by the id they were forked from (see
 *  characters.ts:forkCharacter/writeToGun), so "remixes of this character"
 *  can be discovered without already knowing who forked it. A fork stays
 *  unindexed — and thus undiscoverable — until its author actually
 *  publishes it; a local-only draft never touches this index. */
const forkIndex = createSignedPointerIndex('forks');

export const getForkIndex = forkIndex.getIndex;
export const addToForkIndex = forkIndex.addToIndex;
