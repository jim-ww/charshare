/** Custom application-specific kinds, in the addressable-event range
 *  (30000-39999) NIP-01 reserves for parameterized replaceable events with no
 *  central registry. Chosen to avoid the well-known kinds documented by other
 *  NIPs (e.g. NIP-23 long-form `30023`, NIP-51 lists `30000`-`30030`, NIP-72
 *  communities `34550`, NIP-99 classifieds `30402`) — re-verify against the
 *  current NIP kind registry before shipping in case of a later collision;
 *  renumbering is a one-file change since every module imports from here. */
export const CHARACTER_KIND = 31333;
export const USERNAME_CLAIM_KIND = 31334;

/** Standard NIP kinds this app publishes/reads. */
export const COMMENT_KIND = 1111; // NIP-22 generic comment
export const REACTION_KIND = 7; // NIP-25 reaction/like
export const PROFILE_KIND = 0; // NIP-01 metadata
export const RELAY_LIST_KIND = 10002; // NIP-65 relay list metadata
export const DELETE_REQUEST_KIND = 5; // NIP-09 delete request
