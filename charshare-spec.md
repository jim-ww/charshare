# Charshare

Decentralized, unmoderated platform to share and talk to AI characters.

## Architecture / Core Decisions

- No external server. A Wails (Go) desktop app embedding a static SvelteKit build (see Stack) — no backend to talk to, only direct GUN P2P networking from the client.
- **Local-first**: every feature is designed from the local perspective first. All user data lives on the client; only some of it is optionally propagated to the GUN network. AI chat history is always local-only. Profile data is stored locally and also uploaded (published) to GUN. The user picks and configures their own AI provider (local, e.g. Ollama, or remote, e.g. OpenRouter/Hugging Face) — see Preferences.
- **Publishing an account is optional.** A user can generate a local identity and create local-only characters/chats without ever registering a username or publishing anything to the network. `Preferences`/keyring track "has a local identity" separately from "has claimed/published a network account."
- **Identity = keypair, not a separate ID.** Users and characters are identified by their public key (base64-encoded), not a separate UUID. One canonical identifier, no risk of the two disagreeing.
- All models received from the network are validated against a schema before use; invalid documents are silently skipped — the main defense against malformed data from untrusted peers.
- Documents carry a schema `version` field so old/new clients can coexist as the data model evolves.

## Signing

- **Algorithm: ECDSA P-256**, same curve/key format as GUN SEA's keypair (so the same pair both signs documents and authenticates a `gun.user()` session for author-protected storage — see GUN Implementation Details), but signing/verification itself goes through the Web Crypto API directly (`crypto.subtle.sign`/`verify`, `src/lib/crypto/sign.ts`), not GUN's own `SEA.sign`/`SEA.verify`.
- **No JWT/JWS.** Instead:
  1. Canonicalize the document (stable recursive key ordering, no whitespace ambiguity) — `src/lib/crypto/canonicalize.ts`.
  2. Sign the canonical bytes with `crypto.subtle.sign` using a JWK built from the SEA pair's `x`/`y`/`d` fields — `src/lib/crypto/sign.ts:signDocument`.
  3. Store the result as a sibling `signature` field (base64) alongside the author's pubkey (`author`/`id`).
  4. To verify (`verifyDocument`): strip `signature`, re-canonicalize, verify against the claimed author's pubkey via `crypto.subtle.verify`. Every network read path (`gun/document.ts`'s `getDocument`/`subscribeDocument`, used by characters/comments/profiles/index pointers) calls this and drops anything that fails — invalid documents are never partially trusted.
- **Key storage**: keyrings (SEA pair + pubkey) stored in IndexedDB via `idb-keyval` (`src/lib/db/keyring.ts`).
- **Backup/export/switch**: `src/lib/identity/backup.ts` exports/imports a versioned account backup (`AccountBackupV1`) framed to users as "back up this account" / "use an existing account." Switching the active local identity (`setKeyring` in `src/lib/state/auth.svelte.ts`) is supported. Backing up the account is the user's own responsibility — losing local storage without a backup means losing the identity permanently.

## Features

### Browse

- Shows every character the client knows about — owned (local or published), saved, and browsed-from-network — filterable to just "mine."
- Findable by pubkey/ID, `@username`, tags, or name query.
- Authors and tags can be blocked (hidden) locally.

### Character Management

- Create, edit, publish character cards.
  - Keypair signs the card to prove authorship (see Signing).
  - **Editing** = publishing a new signed snapshot of the full document under the same `id`, with an incremented `version` and updated `updated_at`. Clients keep whichever snapshot verifies and has the higher version.
  - **Deletion is a tombstone, not a hard delete** (peers who already synced the data can't be forced to erase it). A delete is a new signed snapshot with `deleted: true, deleted_at`. Clients hide anything tombstoned from Browse — *unless* the character was saved locally (see "Saved characters" below), in which case it stays visible to that user (marked deleted), remains usable to start new chats, and all of that user's existing local chats with it are preserved regardless.
  - **Conflict resolution**: if two snapshots claim the same `version`/`updated_at`, last-write-wins by timestamp; ties broken deterministically (e.g. by signature byte comparison).
  - Only the author can edit/delete their own character. Non-authors instead see a **Fork** button.
  - **Fork**: copies the character's fields into a new document with a new `id`, `author` set to the forking user's pubkey, signed by them, and `comments` reset to empty. The new doc carries `forked_from: {original_id}` for provenance.
  - A character is in one of three states: **owned local-only** (never published, its own create/edit/sign version chain via `createLocalCharacter`/`editLocalCharacter`, can later be promoted via `publishLocalCharacter`), **owned published** (written to GUN, discoverable by anyone — a local copy is still cached so it survives a relay being unreachable), or **saved** (someone else's character, cached locally via `db/savedCharacters.ts`/`state/savedCharacters.svelte.ts` so it survives the author deleting it or a relay going down; saved either by pressing "Save" or automatically the first time a chat is started/continued with it — a manual save is never demoted back to auto by a later auto-save, an auto-saved one can still be upgraded to manual). Exported/imported as its own `savedCharacters` backup category (see Preferences).
  - Users (subject to `comments_enabled`) can post/edit/delete comments; changes propagate the same way as character edits (signed snapshots, tombstones for delete), discovered via the same signed pointer index as tags/names (keyed by `character_id` — see GUN Implementation Details). A comment whose author matches the character's author is shown with an "author" badge.
- Import of previously-exported data is supported for every backup category (see Preferences).
- **Tags**: free-form, autosuggested from existing tags, plus a curated predefined tag list (`src/lib/data/tags.ts`).

### Chat Management

- List/edit/remove chats — all changes local, stored client-side in IndexedDB.
- Chats are exportable/importable as JSON.

#### Chat with Characters

- Create a new chat with any character; send, edit, and delete messages.
- Messages form a branching tree via `parent_id` (null for a root message); editing or regenerating adds a sibling under the same parent rather than mutating history. `Chat.active_child` (parent message id -> selected child id) selects the active branch at each fork; `Chat.root_id` selects the active root. The user can switch branches at any fork.
- The character a chat is talking to can be reassigned — either deliberately (switch to a different character mid-chat) or as recovery when the original character's definition is unavailable (deleted upstream and never saved locally, or otherwise unreachable): the user picks a replacement from their available character definitions and the chat history is preserved under it.
- "Generate response for me" — lets the AI draft the user's next line; implemented as the same completion call with a different prompt framing (writing as the user, in-context, rather than as the character).
- Each chat remembers: which persona the user was playing as when the chat was created (`persona_id`, fixed for the chat's lifetime — see Personas), unsent composer text (`draft`), the selected character-image-viewer index (`image_index`), and a per-chat set of background images (`backgrounds`) with one active (`active_background`).

### Personas

- A **persona** is a local-only "mask" the user can wear while chatting — never published, signed, or synced to GUN.
- Fields: `name` (ignored for display while `auto_name` is true, in which case the displayed name tracks the user's live profile username instead), `description`, `auto_name`, `created_at`.
- `Preferences.personaSelections` remembers the last persona used per character (`characterId -> personaId`), so switching back to a character defaults to the persona last used there.

### User Profiles

- Create, edit, delete profiles; changes propagate to peers via GUN using the same signed-snapshot/tombstone mechanics as characters.
- **Username claims**: a separate first-come-wins signed claim (`src/lib/gun/usernames.ts`) mapping a normalized `@username` to a pubkey, enabling `@username` search/display. Uniqueness is only enforced client-side at claim time — GUN has no consensus, so two clients can briefly both believe they've claimed the same name before the network converges. Once per app session, `checkUsernameConflict()` (`src/lib/state/profile.svelte.ts`) re-checks whether the claim for the profile's own username still resolves to this user's pubkey; if it now belongs to someone else, it auto-picks an available `{name}{4-digit suffix}` and republishes the profile under it, notifying the user. Skipped for guests, unregistered accounts, and an empty username.
- **Name search index**: every published character's name is tokenized and indexed (`src/lib/gun/names.ts`) via the same generalized signed pointer-index mechanism used for tags (see GUN Implementation Details), powering Browse's name search.
- Profile data is exportable/importable as JSON.

### Preferences

- Configurable GUN relay instances (sensible default provided, user can override).
- Theme: any of DaisyUI's built-in themes (see Stack).
- **AI provider config**: three providers implemented — OpenRouter, Ollama (local, no key), and Hugging Face — each with its own independently-persisted config (`ProviderConfigMap`) so switching providers doesn't clobber the others' settings. OpenRouter/Hugging Face keys are user-supplied, stored locally/IndexedDB only.
  - Standard sampling settings where the provider allows them: temperature, max_tokens, context_size.
  - Advanced settings: top-K, top-P, repetition penalty, frequency penalty, forbidden words/phrases, disable-thinking toggle.
- Additional preferences beyond provider/theme/relays: `blockedTags`, `blockedAuthors`, `hiddenCharacterIds` (other users' characters hidden locally without being deleted), `personaSelections`, `defaultBackground` (applied to newly-created chats), `chatOpacity` (message bubble/composer opacity over the chat background), `showNsfw`.
- **Backup/export (Data tab)**: separate tickboxes per category — `account`, `characters` (owned), `savedCharacters`, `personas`, `chats`, `preferences`. A single category exports as one JSON file; multiple export as one zip.

Data model field definitions live in the TypeScript types (`src/lib/types/`), not duplicated here.

## Stack

- **GUN** (https://gun.eco/docs) for data transmission/sync; GUN SEA for the `gun.user()` authenticated-session/keypair (see Signing for how that same keypair is used for document signatures, via Web Crypto rather than `SEA.sign`).
- **SvelteKit**, static adapter (`@sveltejs/adapter-static`) — outputs a static build, embedded into the Wails desktop binary (see Architecture).
- **Tailwind + DaisyUI** for styling; DaisyUI's theme set (`DAISYUI_THEMES`) drives the theme selector.

## GUN Implementation Details

### Data Storage

User-created data is stored under the app's own namespace (`APP_ID`/schema version, e.g. `charshare/v1`), inside each author's protected GUN user-space rather than a flat app-level path — writes are restricted to that pubkey's authenticated SEA session (`ownNode`/`authorNode` in `src/lib/gun/client.ts`). Example paths:

```
~{pubkey}/charshare/v1/profile
~{authorPubkey}/charshare/v1/characters/{uuid}   -> character document (id = "{authorPubkey}:{uuid}")
comments/{commentId}                             -> comment document (flat, not under any user-space)
```

### Signed pointer indexing (many-to-many)

A generalized **signed pointer index** (`createSignedPointerIndex`, `src/lib/gun/signedIndex.ts`), used by tags (`gun/tags.ts`), character-name search tokens (`gun/names.ts`), and comments (`gun/comments.ts`, keyed by `character_id`).

- Each pointer is its own signed document at its own graph key — `{namespace}/{key}/{monthBucket}/{encodeURIComponent(docId)}` — not a shared read-modify-write JSON blob, avoiding races between concurrent publishers indexing under the same key.
- Ownership check is pluggable per namespace. Default (tags/names): a pointer is locally self-verifiable without fetching the character — its signature must verify against `authorPub`, and `authorPub` must match the author encoded in the character id (`"{author}:{uuid}"`), so a pointer can't be forged for a character the signer doesn't own. Comments use a permissive check instead (comment ids are plain UUIDs, don't encode an author) — there, the pointer index is discovery-only, and the real trust boundary is each comment's independently-verified signature plus a `character_id === key` cross-check done when resolving the index.
- Time-bucketed by month; reads scan the last 24 months. Bounds read cost at the expense of very old entries aging out of discovery — acceptable since Browse is discovery, not an archive.
- Every published character automatically gets a pseudo-tag `__network__` (`NETWORK_INDEX_TAG`), giving a global "browse everything" feed without a real tag.
- Username claims (`gun/usernames.ts`) are a related but distinct pattern — one live claim per key, not a many-to-many pointer set.
- Free-text search beyond name/tag tokens has no native GUN equivalent and isn't otherwise implemented.
