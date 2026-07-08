# Charshare

Decentralized, unmoderated platform to share and talk to AI characters.

## Architecture / Core Decisions

- No backend/server. Only a CDN serving static files (SvelteKit with static adapter — see Stack).
- **Local-first**: every feature is designed from the local perspective first. All user data lives on the client; only some of it is optionally propagated to the GUN network. AI chat history is always local-only. Profile data is stored locally and also uploaded (published) to GUN.
- **Publishing an account is optional.** A user can generate a local identity and create local-only characters/chats without ever registering a username or publishing anything to the network. `Preferences`/keyring track "has a local identity" separately from "has claimed/published a network account."
- **Identity = keypair, not a separate ID.** Users and characters are identified by their public key (base64-encoded), not a separate UUID. One canonical identifier, no risk of the two disagreeing.
- All models received from the network are validated against a schema before use. Invalid documents are silently skipped — this is the main defense against malformed data from untrusted peers. Fields like tags, usernames, image URLs, and other format-sensitive fields get strict format validation on top of shape validation.
- All fields are non-null by default. Only fields with an explicit reason to be nullable are nullable. Strings are always present but may be empty — unless a field is specifically required to be non-empty or match a format.
- As the data model evolves, documents carry a schema `version` field so old/new clients can coexist.

## Signing

- **Algorithm: GUN SEA (ECDSA P-256)**, via GUN's built-in `SEA` module (`src/lib/gun/sea.ts`), not Ed25519. Chosen because the same SEA keypair both signs documents and authenticates a `gun.user()` session for author-protected storage (see GUN Implementation Details) — using a separate signing library would mean juggling two keypairs.
- **No JWT/JWS.** Instead:
  1. Canonicalize the document (stable recursive key ordering, no whitespace ambiguity) — `src/lib/crypto/canonicalize.ts`.
  2. Sign the canonical bytes with `SEA.sign` — `src/lib/crypto/sign.ts`.
  3. Store the result as a sibling `signature` field (base64) alongside the author's pubkey (`author`/`id`).
  4. To verify: strip `signature`, re-canonicalize, verify against the claimed author's pubkey with `SEA.verify`.
- **Key storage**: keyrings (SEA pair + pubkey) stored in IndexedDB via `idb-keyval` (`src/lib/db/keyring.ts`), not `localStorage`.
- **Backup/export/switch**: implemented. `src/lib/identity/backup.ts` exports/imports a versioned account backup (`AccountBackupV1`) framed to users as "back up this account" / "use an existing account." Switching the active local identity (`setKeyring` in `src/lib/state/auth.svelte.ts`) is supported. There is still no recovery mechanism if a backup was never taken — losing local storage without a backup means losing the identity permanently; this should be communicated clearly on first run.

## Features

### Browse

- A single search box matches character name/tags, or an `@username`/`@pubkey` author search (resolves via username claims — see User Profiles).
- Clickable predefined tag carousel plus autosuggest from existing tags (see Character Management) — both feed the same search.
- NSFW toggle, persisted to `Preferences.showNsfw`; off by default, applies to both network and local-only characters.
- Users can block tags (`Preferences.blockedTags`) and block specific authors (`Preferences.blockedAuthors`) — matching characters/authors are excluded from results.
- Local-only characters are not part of Browse (Browse only surfaces published, network-discoverable docs); the user's own characters (published or local-only) are listed separately in a "my characters" view.

### Character Management

- Create, edit, publish character cards.
  - Keypair signs the card to prove authorship (see Signing).
  - **Editing** = publishing a new signed snapshot of the full document under the same `id`, with an incremented `version` and updated `updated_at`. Clients keep whichever snapshot verifies and has the higher version.
  - **Deletion is a tombstone, not a hard delete** (peers who already synced the data can't be forced to erase it). A delete is a new signed snapshot with `deleted: true, deleted_at`. Clients hide anything tombstoned from Browse — *unless* the user explicitly pressed "save character locally," in which case it stays visible to that user (marked deleted), remains usable to start new chats, and all of that user's existing local chats with it are preserved regardless.
  - **Conflict resolution**: if two snapshots claim the same `version`/`updated_at`, last-write-wins by timestamp; ties broken deterministically (e.g. by signature byte comparison).
  - Only the author can edit/delete their own character. Non-authors instead see a **Fork** button.
  - **Fork**: copies the character's fields into a new document with a new `id`, `author` set to the forking user's pubkey, signed by them, and `comments` reset to empty. The new doc carries `forked_from: {original_id}` for provenance. *Fork itself is implemented; discovery of forks (a "remixes of this character" index/UI) is not — see Open/Deferred.*
  - Characters are either **local-only** (never published) or **published** (written to GUN, discoverable by anyone). Local-only characters go through their own create/edit/sign flow with their own version chain (`createLocalCharacter`/`editLocalCharacter`), and can later be promoted to published (`publishLocalCharacter`).
  - Users (subject to `comments_enabled`) can post/edit/delete comments; changes propagate the same way as character edits (signed snapshots, tombstones for delete).
  - Unsaved edits in the create/edit form warn before navigating away or closing the tab.
- Create/edit screen supports **import** (our own exported JSON, versioned). Adapters for other formats (e.g. TavernAI-style PNG-with-embedded-JSON) and export to other formats are not implemented — deferred, see Open/Deferred Items.
- **Tags**: free-form, autosuggested from existing tags, plus a curated predefined tag list (`src/lib/data/tags.ts`) shown as a clickable carousel in both the editor and Browse.

### Chat Management

- List/edit/remove chats — all changes local, stored client-side (IndexedDB, not `localStorage`).
- Chats are easily exportable/importable as JSON.

#### Chat with Characters

- Create a new chat with any character; send, edit, and delete messages.
- **Message model is a branching tree, not linear per-message versions.** Each `Message` has a single `content` and a `parent_id` (null for a root message). Editing a message or regenerating a response adds a new sibling node under the same parent rather than mutating the original — `Chat.active_child` (a map from parent message id to the currently-selected child id) determines which branch is "the" visible conversation at each fork point; `Chat.root_id` points at the currently-selected root (usually there's only one, but regenerating the very first message can add another). The UI lets the user swap the active branch at any fork.
- Can edit both the user's own messages and the AI's messages.
- "Generate response for me" — lets the AI draft the user's next line when they're unsure what to say; implemented as the same completion call with a different prompt framing (writing as the user, in-context, rather than as the character).
- Messenger-style bubble UI.
- Each chat remembers: which persona the user was playing as when the chat was created (`persona_id`, fixed for the chat's lifetime — see Personas), unsent composer text (`draft`), the selected character-image-viewer index (`image_index`), and a per-chat set of background images (`backgrounds`) with one active (`active_background`).

### Personas

- A **persona** is a local-only "mask" the user can wear while chatting — never published, signed, or synced to GUN.
- Fields: `name` (ignored for display while `auto_name` is true, in which case the displayed name tracks the user's live profile username instead), `description`, `auto_name`, `created_at`.
- `Preferences.personaSelections` remembers the last persona used per character (`characterId -> personaId`), so switching back to a character defaults to the persona last used there.

### User Profiles

- Create, edit, delete profiles; changes propagate to peers via GUN using the same signed-snapshot/tombstone mechanics as characters.
- **Username claims**: a separate first-come-wins signed claim (`src/lib/gun/usernames.ts`) mapping a normalized `@username` to a pubkey, enabling `@username` search/display. Uniqueness is only client-side-enforced — GUN has no consensus, so a race between two clients claiming the same name simultaneously is possible and undetected; documented as a known limitation.
- **Name search index**: every published character's name is tokenized and indexed (`src/lib/gun/names.ts`) via the same generalized signed pointer-index mechanism used for tags (see GUN Implementation Details), powering Browse's name search.
- Profile data is easily exportable/importable as JSON.

### Preferences

- Configurable GUN relay instances (sensible default provided, user can override).
- Theme: any of DaisyUI's built-in themes (see Stack).
- **AI provider config**: OpenAI-compatible proxy support. Three providers implemented — OpenRouter, Ollama (local, no key), and Hugging Face — each with its own independently-persisted config (`ProviderConfigMap`) so switching providers doesn't clobber the others' settings. OpenRouter/Hugging Face keys are user-supplied, stored locally/IndexedDB only. (Providers like Anthropic/OpenAI that block direct browser calls by default would need a proxy if ever added — not needed for the current providers.)
  - Standard sampling settings where the provider allows them: temperature, max_tokens, context_size.
  - Advanced settings: top-K, top-P, repetition penalty, frequency penalty, forbidden words/phrases, disable-thinking toggle.
- Additional preferences beyond provider/theme/relays: `blockedTags`, `blockedAuthors`, `hiddenCharacterIds` (other users' characters hidden locally without being deleted), `personaSelections`, `defaultBackground` (applied to newly-created chats), `chatOpacity` (message bubble/composer opacity over the chat background), `showNsfw`.
- All preferences are exportable/importable as JSON.

## Data Model

### User
| Field | Type | Notes |
|---|---|---|
| `id` | base64 pubkey | **is** the identifier; no separate UUID |
| `username` | string, required (can be empty) | visible to anyone |
| `description` | string, required (can be empty) | visible to anyone |
| `image_url` | string (url), optional | |
| `signature` | base64, required | signature over the canonicalized document minus this field |
| `deleted` | bool, required, default `false` | tombstone flag |
| `deleted_at` | timestamp, optional | set when `deleted: true` |
| `created_at` | timestamp, required | |
| `updated_at` | timestamp, required | |

### Character
| Field | Type | Notes |
|---|---|---|
| `id` | string, required | `"{authorPubkey}:{uuid}"` — encodes the author so the doc can be located under that author's protected GUN user-space without a separate global lookup index |
| `version` | int, required | schema/edit version, incremented on each signed snapshot |
| `name` | string, required | |
| `image_urls` | string array | `[]` if none; first is shown by default |
| `description` | string, optional | visible to users |
| `personality` | string, optional | speech patterns, behavior, appearance, etc. |
| `scenario` | string, optional | extra context for the AI |
| `tags` | string array, required | autosuggested from existing tags plus a curated predefined list, to reduce duplicates |
| `nsfw` | bool, required, default `false` | explicit boolean flag rather than tag convention, so it isn't easily forgotten |
| `language` | string, optional | for future filtering/search |
| `system_prompt` | string, optional | placeholder text should nudge staying in character, marking actions with `**asterisks**`, not speaking for `{{user}}` |
| `first_message` | string, optional | primary greeting |
| `alternate_greetings` | string array, optional | supports multiple opening messages (also needed for TavernAI-format import compatibility) |
| `comments_enabled` | bool, required, default `true` | if false, comments are hidden and client blocks posting |
| `author` | base64 pubkey, required | doubles as the signer identity |
| `forked_from` | char id, optional (null if original) | provenance for remixes |
| `deleted` | bool, required, default `false` | tombstone flag |
| `deleted_at` | timestamp, optional | set when `deleted: true` |
| `signature` | base64, required | signature over the canonicalized document minus this field |
| `created_at` | timestamp, required | |
| `updated_at` | timestamp, required | |

### Persona (local only)
| Field | Type | Notes |
|---|---|---|
| `id` | uuid, required | |
| `name` | string | ignored for display while `auto_name` is true |
| `description` | string, optional | |
| `auto_name` | bool, required | while true, displayed name tracks the live profile username instead of `name` |
| `created_at` | timestamp, required | |

### Chat (local only)
| Field | Type | Notes |
|---|---|---|
| `id` | uuid, required | |
| `character_id` | character id, required | |
| `persona_id` | persona id, optional (null pre-personas) | which persona the user was playing when the chat was created; fixed for the chat's lifetime |
| `name` | string, required | defaults to character name, user-editable |
| `messages` | array of Message, required | every message node ever created in this chat, across every branch — a tree, not just the visible conversation |
| `root_id` | message id, optional | root message currently selected (usually only one exists) |
| `active_child` | map: message id -> message id | for every message with multiple children, which child is on the active/visible path |
| `draft` | string | unsent composer text, preserved across navigation |
| `image_index` | int | selected index in the character image viewer |
| `backgrounds` | string array | background image URLs the user added as selectable for this chat |
| `active_background` | string, optional | currently-applied background; falls back to none if no longer in `backgrounds` |
| `created_at` | timestamp, required | |

### Message (local only)
| Field | Type | Notes |
|---|---|---|
| `id` | uuid, required | |
| `parent_id` | message id, optional | message this one replies to; null for a root message. Editing or regenerating adds a new sibling under the same parent instead of overwriting |
| `role` | enum: `user` \| `character`, required | who sent it |
| `content` | string, required | may be empty |
| `created_at` | timestamp, required | |
| `updated_at` | timestamp, required | |

### Comment
| Field | Type | Notes |
|---|---|---|
| `id` | uuid, required | |
| `character_id` | character id, required | |
| `author` | base64 pubkey, required | |
| `content` | string, required, non-empty | |
| `deleted` | bool, required, default `false` | tombstone flag |
| `signature` | base64, required | |
| `created_at` | timestamp, required | |
| `updated_at` | timestamp, required | |

Notes:
- Marked `verified` implicitly by having a valid signature/pubkey.
- If a comment's `author` pubkey equals the character's `author` pubkey, the client shows an "author" badge.
- Comments currently use a different storage scheme than tags/names (see GUN Implementation Details) — a single unsigned index blob per character rather than per-pointer signed keys, which is race-prone under concurrent writers. Known limitation, not yet unified with the generalized signed pointer index.

## Stack

- **GUN** (https://gun.eco/docs) for data transmission/sync, including GUN SEA for signing/auth.
- **SvelteKit**, static adapter (`@sveltejs/adapter-static`) — outputs plain static files, so it stays deployable as CDN-only with no backend, while giving real component structure for stateful pieces (message-tree navigation, tag autosuggest, chat bubble editor) that would get unwieldy in a directive-only approach.
- **Tailwind + DaisyUI** for styling — settled; DaisyUI's theme set (`DAISYUI_THEMES`) drives the theme selector.

## GUN Implementation Details

### Data Storage

User-created data is stored under the app's own namespace (`APP_ID`/schema version, e.g. `charshare/v1`), inside each author's protected GUN user-space rather than a flat app-level path — writes are restricted to that pubkey's authenticated SEA session (`ownNode`/`authorNode` in `src/lib/gun/client.ts`). Example paths:

```
~{pubkey}/charshare/v1/profile
~{authorPubkey}/charshare/v1/characters/{uuid}          -> character document (id = "{authorPubkey}:{uuid}")
~{authorPubkey}/charshare/v1/characters/{uuid}/comments -> unsigned comment-index blob (see Comment notes above)
```

### Tag and name indexing (many-to-many)

Implemented, not deferred: a generalized **signed pointer index** (`createSignedPointerIndex`, `src/lib/gun/signedIndex.ts`), used identically for tags (`gun/tags.ts`) and character-name search tokens (`gun/names.ts`).

- Each pointer is its own signed document at its own graph key — `tags/{namespace}/{key}/{monthBucket}/{encodeURIComponent(charId)}` — not a shared read-modify-write JSON blob, avoiding races between concurrent publishers indexing under the same tag/token.
- A pointer is locally self-verifying without fetching the character: its signature must verify against `authorPub`, and `authorPub` must match the author encoded in the character's own `id` (`"{author}:{uuid}"`) — so a pointer can't be forged for a character the signer doesn't own.
- Time-bucketed by month; reads scan the last 24 months. Bounds read cost at the expense of very old entries aging out of discovery — acceptable since Browse is discovery, not an archive.
- Every published character automatically gets a pseudo-tag `__network__` (`NETWORK_INDEX_TAG`), giving a global "browse everything" feed without a real tag.
- Username claims (`gun/usernames.ts`) are a related but distinct pattern — one live claim per key, not a many-to-many pointer set.
- Free-text search beyond name/tag tokens has no native GUN equivalent and isn't otherwise implemented.

## Open / Deferred Items

- Spam and abuse mitigation for an unmoderated, backend-less network (mass-published garbage characters/comments) — explicitly deferred for now.
- Fork discovery UI/index (`.../forks/{fork_id}` pointers, "remixes of this character") — forking itself works; discovering forks of a given character does not exist yet.
- TavernAI-PNG (and other third-party format) import/export adapters — not implemented; only our own versioned JSON format is supported today.
- Comment storage still uses a race-prone unsigned index blob rather than the signed pointer-index pattern used for tags/names — worth unifying eventually.
- True multi-identity-active-at-once-in-one-session (as opposed to switching the single active local identity) is not implemented.
