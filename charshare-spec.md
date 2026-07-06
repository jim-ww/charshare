# Charshare

Decentralized, unmoderated platform to share and talk to AI characters.

## Architecture / Core Decisions

- No backend/server. Only a CDN serving static files (SvelteKit with static adapter — see Stack).
- **Local-first**: every feature is designed from the local perspective first. All user data lives on the client; only some of it is optionally propagated to the GUN network. AI chat history is always local-only. Profile data is stored locally and also uploaded (published) to GUN.
- **Identity = keypair, not a separate ID.** Users and characters are identified by their Ed25519 public key (base64-encoded), not a separate UUID. One canonical identifier, no risk of the two disagreeing.
- All models received from the network are validated against a schema before use. Invalid documents are silently skipped — this is the main defense against malformed data from untrusted peers. Fields like tags, usernames, image URLs, and other format-sensitive fields get strict format validation on top of shape validation.
- All fields are non-null by default. Only fields with an explicit reason to be nullable are nullable. Strings are always present but may be empty — unless a field is specifically required to be non-empty or match a format.
- As the data model evolves, documents carry a schema `version` field so old/new clients can coexist.

## Signing

- **Algorithm: Ed25519** (via `@noble/ed25519` or `tweetnacl`). Small signatures (64 bytes), fast, broadly supported in JS. Not using WebCrypto's native `SubtleCrypto` since Ed25519 browser support is inconsistent (notably Safari).
- **No JWT/JWS.** JWT's own serialization format and algorithm-negotiation flexibility solve problems we don't have (auth tokens with expiry, multi-algorithm interop) and get in the way of the one we do have (plain, field-accessible JSON documents living in GUN's graph). Instead:
  1. Canonicalize the document (stable recursive key ordering, no whitespace ambiguity).
  2. Sign the canonical bytes with Ed25519.
  3. Store the result as sibling fields on the document: `signature` (base64) alongside the author's pubkey (already present as `author`/`id`).
  4. To verify: strip `signature`, re-canonicalize, verify against the claimed author's pubkey.
  - Reference point if useful: Nostr's event-signing spec (NIP-01) solves a near-identical problem (decentralized, signed, gossiped JSON) with this same approach.
- **Key storage**: private keys and API keys stored in IndexedDB, not `localStorage` (sync/blocking, weaker for structured secrets). No key recovery mechanism is planned — losing local storage means losing the identity permanently. This should be communicated clearly to users (e.g. a backup/export reminder on first run), since it's a deliberate tradeoff of the decentralized model, not an oversight.
- Multi-identity/profile support and private-key export/import flow still need to be speced out in detail.

## Features

### Browse

- Search, browse character cards; filter by tags, by `verified`, by `published`; option to show only the current user's own creations.
- Users can add blocked tags — characters carrying a blocked tag are excluded from results.
- (Tag indexing/query strategy over GUN to be revisited later — see GUN Implementation.)

### Character Management

- Create, edit, publish character cards.
  - Public key signs the card to prove authorship (see Signing).
  - **Editing** = publishing a new signed snapshot of the full document under the same `id`, with an incremented `version` and updated `updated_at`. Clients keep whichever snapshot verifies and has the higher version.
  - **Deletion is a tombstone, not a hard delete** (peers who already synced the data can't be forced to erase it). A delete is a new signed snapshot with `deleted: true, deleted_at`. Clients hide anything tombstoned from Browse — *unless* the user explicitly pressed "save character locally," in which case it stays visible to that user (marked deleted), remains usable to start new chats, and all of that user's existing local chats with it are preserved regardless.
  - **Conflict resolution**: if two snapshots claim the same `version`/`updated_at`, last-write-wins by timestamp; ties broken deterministically (e.g. by signature byte comparison).
  - Only the author can edit/delete their own character. Non-authors instead see a **Fork** button.
  - **Fork**: copies the character's fields into a new document with a new `id`, `author` set to the forking user's pubkey, signed by them, and `comments` reset to empty. The new doc carries `forked_from: {original_id}` for provenance.
    - Discovery of forks: `/characters/{original_id}/forks/{fork_id}: true` acts as an index pointer, written by the forking user. Since this pointer isn't signed by the original author, it's treated only as a hint — the "remixes of this character" UI fetches each pointed-to character and confirms its `forked_from` field actually matches before displaying it, so a forged/spammed pointer is self-filtering.
  - Characters are either **local-only** (never published) or **published** (written to GUN, discoverable by anyone).
  - Users (subject to `comments_enabled`) can post/edit/delete comments; changes propagate the same way as character edits (signed snapshots, tombstones for delete).
- Create/edit screen supports **import** (our own exported JSON, versioned) and **adapters for other formats** (e.g. TavernAI-style PNG-with-embedded-JSON) and **export** (our JSON format first, other formats later).

### Chat Management

- List/edit/remove chats — all changes local, stored client-side (IndexedDB, not `localStorage`).
- Chats are easily exportable/importable as JSON.

#### Chat with Characters

- Create a new chat with any character; send, edit, and delete messages.
- **Message versioning**: each message keeps a history of edited versions, with one marked active — the UI lets the user swap between them (see updated Message model below).
- Can edit both the user's own messages and the AI's messages.
- "Generate response for me" — lets the AI draft the user's next line when they're unsure what to say; implemented as the same completion call with a different prompt framing (writing as the user, in-context, rather than as the character).
- Messenger-style bubble UI.

### User Profiles

- Create, edit, delete profiles; changes propagate to peers via GUN.
- Profile data is easily exportable/importable as JSON.

### Preferences

- Configurable GUN relay instances (sensible default provided, user can override).
- Theme: dark/light.
- **AI provider config**: OpenAI-compatible proxy support, starting with OpenRouter (user supplies their own API key, stored locally/IndexedDB only). OpenRouter's `/api/v1/chat/completions` supports CORS for direct browser calls, so no proxy server is needed for this provider. (Note for later: providers like Anthropic/OpenAI block direct browser calls by default and would need a proxy if added — not a concern for the OpenRouter-only MVP.)
  - Standard sampling settings where the provider allows them: temperature, max_tokens, context_size.
  - Advanced settings: top-K, top-P, repetition penalty, frequency penalty, forbidden words/phrases.
- All preferences are exportable/importable as JSON.

## Data Model

### User
| Field | Type | Notes |
|---|---|---|
| `id` | base64 Ed25519 pubkey | **is** the identifier; no separate UUID |
| `username` | string, optional | visible to anyone |
| `description` | string, optional | visible to anyone |
| `created_at` | timestamp, required | |

### Character
| Field | Type | Notes |
|---|---|---|
| `id` | uuid, required | |
| `version` | int, required | schema/edit version, incremented on each signed snapshot |
| `name` | string, required | |
| `image_url` | string (url), optional | user's responsibility that it's browser-accessible |
| `description` | string, optional | visible to users |
| `personality` | string, optional | speech patterns, behavior, appearance, etc. |
| `scenario` | string, optional | extra context for the AI |
| `tags` | string array, required | autosuggested from existing tags to reduce duplicates |
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

### Chat (local only)
| Field | Type | Notes |
|---|---|---|
| `id` | uuid, required | |
| `character_id` | character id, required | |
| `name` | string, required | defaults to character name, user-editable |
| `messages` | array of Message, required | |
| `created_at` | timestamp, required | |

### Message (local only)
| Field | Type | Notes |
|---|---|---|
| `id` | uuid, required | |
| `role` | enum: `user` \| `character`, required | who sent it |
| `versions` | array of `{ content, created_at }`, required | edit history; `content` may be empty string but must exist |
| `active_version_index` | int, required | which version is currently displayed/used |
| `updated_at` | timestamp, required | |

### Comment
| Field | Type | Notes |
|---|---|---|
| `id` | uuid, required | |
| `author` | base64 pubkey, required | |
| `content` | string, required, non-empty | |
| `deleted` | bool, required, default `false` | tombstone flag |
| `signature` | base64, required | |
| `created_at` | timestamp, required | |
| `updated_at` | timestamp, required | |

Notes:
- Marked `verified` implicitly by having a valid signature/pubkey.
- If a comment's `author` pubkey equals the character's `author` pubkey, the client shows an "author" badge.

## Stack

- **GUN** (https://gun.eco/docs) for data transmission/sync.
- **SvelteKit**, static adapter (`@sveltejs/adapter-static`) — outputs plain static files, so it stays deployable as CDN-only with no backend, while giving real component structure for stateful pieces (message-version swapper, tag autosuggest, chat bubble editor) that would get unwieldy in a directive-only approach.
- CSS/UI library: **undecided** — see below.

### Open question: CSS / UI library

Not yet settled. Tailwind + DaisyUI was the earlier leaning (DaisyUI is CSS-only, no JS bloat, fast to write, friendly for a backend-leaning dev), but now that Alpine is off the table in favor of Svelte, this deserves a fresh look:

- Svelte's scoped `<style>` blocks and reactive class bindings already solve a lot of what Tailwind exists to solve (avoiding global CSS collisions, colocating styling with markup) — so the case for Tailwind is weaker here than it was under a plain-HTML/Alpine approach.
- Tailwind's utility-class-in-markup style is a legitimate readability tradeoff — dense `class="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ..."` strings can be harder to scan than plain CSS, especially if that's not a style that clicks for you.
- Options worth weighing: (1) Tailwind + DaisyUI anyway, for speed and prebuilt components; (2) plain scoped Svelte `<style>` per component, no utility framework, more verbose but easier to read at a glance; (3) a lighter component-focused CSS approach (e.g. open-props for design tokens + hand-written scoped styles) as a middle ground.
- No strong technical blocker either way — this is a personal-fit/taste decision more than an architecture one. Worth just trying a couple of real components (e.g. the chat bubble list) in each style and seeing which is less friction before committing.

## GUN Implementation Details

### Data Storage

All user-created data is stored as directories under the app's own namespace, starting with `APP_ID` and a schema version. Example paths:

```
/users/{pubkey}/profile
/characters/{char_id}                      -> character document (see model above)
/characters/{char_id}/forks/{fork_id}: true -> unsigned index pointer, self-verified by checking forked_from
/characters/{char_id}/comments/{comment_id} -> comment document
```

### Tag indexing (many-to-many)

Characters can carry many tags, and each tag can index many characters — GUN has no query engine, only graph traversal from known paths, so this needs a manually maintained index rather than a query. Direction to revisit:

- Store the character once at `/characters/{id}` (full document).
- Maintain lightweight pointer sets per tag: `/tags/{tagname}/index/{char_id}: true` — just the id, not a duplicated copy of the character.
- Browsing by tag walks the tag's pointer set, then fetches each character doc by id.
- The same pattern likely applies to other indexes: by author, by `verified`, by `published`.
- Free-text search has no native GUN equivalent either — it'll end up being a client-side filter over some bounded working set (a synced index, not the full network). Exact indexing/query approach still to be designed in detail.

## Open / Deferred Items

- Spam and abuse mitigation for an unmoderated, backend-less network (mass-published garbage characters/comments) — explicitly deferred for now.
- Tag/author/verified/published GUN indexing scheme — deferred, to be designed once the data volume and query patterns are clearer.
- Multi-identity support and private-key backup/export UX.
- CSS/UI library choice (see above).
