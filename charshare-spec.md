# Charshare

Decentralized, unmoderated platform to share and talk to AI characters.

## Architecture / Core Decisions

- No external server. A Wails (Go) desktop app embedding a static SvelteKit build (see Stack) — no backend to talk to, only direct Nostr relay networking from the client.
- **Local-first**: every feature is designed from the local perspective first. All user data lives on the client; only some of it is optionally propagated to the Nostr network. AI chat history is always local-only. Profile data is stored locally and also published to Nostr relays. The user picks and configures their own AI provider (local, e.g. Ollama, or remote, e.g. OpenRouter/Hugging Face) — see Preferences.
- **Publishing an account is optional.** A user can generate a local identity and create local-only characters/chats without ever registering a username or publishing anything to the network. `Preferences`/keyring track "has a local identity" separately from "has claimed/published a network account."
- **Identity = keypair, not a separate ID.** Users and characters are identified by their Nostr public key (hex-encoded secp256k1, per NIP-01), not a separate UUID. One canonical identifier, no risk of the two disagreeing.
- All models received from the network are validated against a schema before use; invalid documents are silently skipped — the main defense against malformed data from untrusted peers.
- Documents carry a `version` field (display-only; not used for conflict resolution, see Signing) so old/new clients can coexist as the data model evolves.
- **This app migrated from an earlier P2P sync layer to Nostr.** The migration was a hard break — the current signing scheme is fundamentally incompatible with the previous one, so there is no key-migration path and old accounts/backups cannot be imported. As much of the app's own from-scratch machinery (custom signing, indexing, pagination) as possible was replaced with standardized Nostr protocol mechanisms (NIPs) instead, since a relay's native kind/author/tag/time filtering already provides most of what previously had to be hand-built.

## Signing

- **Algorithm: secp256k1 Schnorr signatures, per NIP-01** — the standard Nostr signing scheme, via the `nostr-tools` library (`src/lib/nostr/sign.ts`). No custom canonicalization step: NIP-01 defines a fixed serialization (`[0, pubkey, created_at, kind, tags, content]`) that `nostr-tools`' `finalizeEvent`/`verifyEvent` handle internally.
- Every piece of user-created data (character, comment, profile, username claim, reaction, relay list) is a signed Nostr **event** — `{id, pubkey, created_at, kind, tags, content, sig}`. The event's own `id`/`sig`/`pubkey` fields ARE its authenticity proof; there's no separate app-level `signature` field bolted onto a plain JSON blob.
- **Key storage**: keyrings (`{publicKey: hex, secretKey: hex}`) stored in IndexedDB via `idb-keyval` (`src/lib/db/keyring.ts`).
- **Backup/export/switch**: `src/lib/identity/backup.ts` exports/imports a versioned account backup (`AccountBackupV2`, carrying a NIP-19 `nsec`-encoded secret key — the standard, portable Nostr backup format) framed to users as "back up this account" / "use an existing account." Switching the active local identity (`setKeyring` in `src/lib/state/auth.svelte.ts`) is supported. Backing up the account is the user's own responsibility — losing local storage without a backup means losing the identity permanently.

## Features

### Browse

- Shows every character the client knows about — owned (local or published), saved, and browsed-from-network — filterable to just "mine."
- Findable by pubkey/ID, `@username`, tags, or name query.
- Authors and tags can be blocked (hidden) locally.

### Character Management

- Create, edit, publish character cards.
  - Keypair signs the card to prove authorship (see Signing).
  - A character is a **NIP-33 parameterized replaceable event** (custom kind `31333`, see Nostr Implementation Details) — one stable "address" (`kind:pubkey:d`) per character, where `d` is a random UUID minted at creation and never changes, even across renames. **Editing** = publishing a new revision under the same `d` tag; relays natively keep only the latest revision, so there is no app-level version/conflict-resolution logic to maintain (contrast with the previous sync layer's manual "highest version/updated_at wins" rule).
  - **Deletion is a tombstone, not a hard delete** (peers who already synced the data can't be forced to erase it, and relays aren't obligated to honor delete requests anyway). A delete publishes a new revision with `deleted: true, deleted_at` in its content, alongside a best-effort NIP-09 delete-request event. Clients hide anything tombstoned from Browse — *unless* the character was saved locally (see "Saved characters" below), in which case it stays visible to that user (marked deleted), remains usable to start new chats, and all of that user's existing local chats with it are preserved regardless.
  - Only the author can edit/delete their own character. Non-authors instead see a **Fork** button.
  - **Fork**: copies the character's fields into a new document with a new `id` (fresh UUID), `author` set to the forking user's pubkey, signed by them, and `comments` reset to empty. The new event carries an `a` tag pointing at the original's coordinate (`forked_from`) for provenance.
  - A character is in one of three states: **owned local-only** (never published, its own create/edit/sign version chain via `createLocalCharacter`/`editLocalCharacter`, can later be promoted via `publishLocalCharacter`), **owned published** (published to Nostr relays, discoverable by anyone — a local copy is still cached so it survives a relay being unreachable), or **saved** (someone else's character, cached locally via `db/savedCharacters.ts`/`state/savedCharacters.svelte.ts` so it survives the author deleting it or a relay going down; saved either by pressing "Save" or automatically the first time a chat is started/continued with it — a manual save is never demoted back to auto by a later auto-save, an auto-saved one can still be upgraded to manual). Exported/imported as its own `savedCharacters` backup category (see Preferences).
  - Users (subject to `comments_enabled`) can post/delete comments — a standardized **NIP-22 generic comment** (kind `1111`), discovered via a plain relay `#A` tag filter (the character's coordinate), not a custom index. Comments are immutable Nostr events, so there is no editing — see Comments below. A comment whose author matches the character's author is shown with an "author" badge.
- Import of previously-exported data is supported for every backup category (see Preferences).
- **Tags**: free-form, autosuggested from existing tags, plus a curated predefined tag list (`src/lib/data/tags.ts`).

### Comments

- A **NIP-22 generic comment** (kind `1111`) targeting a character's NIP-33 coordinate — standard root/parent tag scoping (`A`/`K`/`P` uppercase for the character being commented on, `a`/`e`/`k`/`p` lowercase for the immediate parent). Replies are flattened one level deep (a reply's parent tags always point at the thread root), matching the app's existing reply UX.
- **No editing.** Nostr events are immutable by protocol design — there is no NIP for in-place edits, and no mainstream Nostr client offers one. This isn't a compromise; it's normal Nostr UX.
- **Deletion is a best-effort NIP-09 delete request**, not a guaranteed removal — a relay may or may not honor it. The client separately records its own delete requests locally (`src/lib/db/deletedComments.ts`) and renders that comment as "deletion requested" (dimmed/struck-through) in its own UI regardless of whether any given relay actually complied.
- **Likes**: a **NIP-25 reaction** (kind `7`, content `"+"`), the same mechanism used for character likes (see below) — no bespoke rating/comment-likes system.

### Likes

- A **NIP-25 reaction** (kind `7`, content `"+"`) targets either a character (via an `a` tag to its coordinate) or a comment (via an `e` tag to its event id). Toggling an existing like publishes a best-effort NIP-09 delete request against the user's own prior reaction.
- **Like counts are relay-dependent**: a count is only ever shown when the relay serving that data advertises **NIP-45** (COUNT) support in its NIP-11 relay-info document — there is no client-side aggregate-counting fallback. Popularity-based sorting is not yet implemented (see TODO.md).

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

- A **persona** is a local-only "mask" the user can wear while chatting — never published, signed, or synced to the network.
- Fields: `name` (ignored for display while `auto_name` is true, in which case the displayed name tracks the user's live profile username instead), `description`, `auto_name`, `created_at`.
- `Preferences.personaSelections` remembers the last persona used per character (`characterId -> personaId`), so switching back to a character defaults to the persona last used there.

### User Profiles

- A **NIP-01 kind-0 metadata event** (standard `name`/`about`/`picture` fields) — the standard Nostr profile format, so any Nostr client can read a charshare user's profile. A `published_at` tag preserves the profile's true original creation time across edits (kind 0 is a plain replaceable event, so a relay only keeps the latest revision's own `created_at`). Tombstoned via an app-specific `charshare_deleted` content flag, since kind 0 has no NIP-level "deleted" concept — a deleted profile still looks like a normal (if empty) profile to other Nostr clients, an accepted interoperability tradeoff of using a standard kind.
- **Username claims**: a NIP-33 addressable event (custom kind `31334`, `d` = normalized username, `src/lib/nostr/usernames.ts`) mapping a normalized `@username` to a pubkey, enabling `@username` search/display. Uniqueness is only enforced client-side at claim time — NIP-33's "latest revision wins" only dedupes a single author's own claims, not across authors, so two different authors can each hold their own live claim event under the same `d` value; the app resolves this by treating whichever live claim was made earliest as authoritative. Once per app session, `checkUsernameConflict()` (`src/lib/state/profile.svelte.ts`) re-checks whether the claim for the profile's own username still resolves to this user's pubkey; if it now belongs to someone else, it auto-picks an available `{name}{4-digit suffix}` and republishes the profile under it, notifying the user. Skipped for guests, unregistered accounts, and an empty username. (No NIP-05 — deliberately not adopted, since it requires either owning a domain or depending on a third-party verification service, which would introduce this app's first external dependency.)
- **Name search**: every published character's name is tokenized into word tokens, each stored as its own `n` tag (`src/lib/nostr/nameTokens.ts`), so exact-token name search is a plain relay `#n` tag filter — no custom index needed.
- Profile data is exportable/importable as JSON.

### Preferences

- Configurable Nostr relay instances — `Preferences.nostrRelays`, edited in the Network settings tab. This is the actual relay set every network call in the app uses (`state/preferences.svelte.ts:getActiveRelays()`), read fresh on every call rather than cached at startup, so an in-session change takes effect immediately. If the user clears the list entirely, the app falls back to a small set of built-in public relay defaults (`src/lib/nostr/relays.ts:DEFAULT_NOSTR_RELAYS`) — otherwise the built-in defaults are never contacted at all once the user has configured their own.
- A separate "your published relay list" (NIP-65, kind `10002`) settings section — distinct from `nostrRelays` above — lets a user declare which relays they read/write to, for other Nostr clients following the outbox model (see Nostr Implementation Details).
- Theme: any of DaisyUI's built-in themes (see Stack).
- **AI provider config**: providers implemented — OpenRouter, Ollama (local, no key), Hugging Face, and an OpenAI-compatible option — each with its own independently-persisted config (`ProviderConfigMap`) so switching providers doesn't clobber the others' settings. Third-party provider keys are user-supplied, stored locally/IndexedDB only.
  - Standard sampling settings where the provider allows them: temperature, max_tokens, context_size.
  - Advanced settings: top-K, top-P, repetition penalty, frequency penalty, forbidden words/phrases, disable-thinking toggle.
- Additional preferences beyond provider/theme/relays: `blockedTags`, `blockedAuthors`, `hiddenCharacterIds` (other users' characters hidden locally without being deleted), `hiddenCommentIds`, `personaSelections`, `defaultBackground` (applied to newly-created chats), `chatOpacity` (message bubble/composer opacity over the chat background), `showNsfw`.
- **Backup/export (Data tab)**: separate tickboxes per category — `account`, `characters` (owned), `savedCharacters`, `personas`, `chats`, `preferences`. A single category exports as one JSON file; multiple export as one zip.

Data model field definitions live in the TypeScript types (`src/lib/types/`), not duplicated here.

## Stack

- **Nostr** (via `nostr-tools`) for data transmission/sync — a relay-based protocol with native kind/author/tag/time-range query filtering, replacing an earlier P2P graph-sync layer (see Signing for the secp256k1/Schnorr identity used now).
- **SvelteKit**, static adapter (`@sveltejs/adapter-static`) — outputs a static build, embedded into the Wails desktop binary (see Architecture).
- **Tailwind + DaisyUI** for styling; DaisyUI's theme set (`DAISYUI_THEMES`) drives the theme selector.

## Nostr Implementation Details

### Event kinds

| Purpose | Kind | Type | NIP |
|---|---|---|---|
| Character | `31333` (custom) | NIP-33 addressable/replaceable | custom, patterned after NIP-33 |
| Username claim | `31334` (custom) | NIP-33 addressable/replaceable | custom, patterned after NIP-33 |
| Comment | `1111` | regular | NIP-22 |
| Reaction/Like | `7` | regular | NIP-25 |
| Profile metadata | `0` | replaceable | NIP-01 |
| Relay list | `10002` | replaceable | NIP-65 |
| Delete request | `5` | regular (best-effort) | NIP-09 |

Kind constants live in `src/lib/nostr/kinds.ts` so a later renumber (if a collision with another app's kind is ever discovered) is a one-file change.

### Character tag schema (kind 31333)

`d` (stable UUID identity), `n` × N (one per name word-token, for exact-match search — the actual display name lives in `content.name`, since tokens are lowercased/punctuation-stripped and can't be losslessly reversed), `t` × N (genre tags), `content-warning` (NIP-36, present only if NSFW), `published_at` (original creation time in unix seconds, carried forward on every edit — needed because a NIP-33 relay only retains the latest revision's own `created_at`), `a` (fork provenance coordinate, present only if forked). Everything else (description, personality, scenario, system prompt, first message, alternate greetings, example dialogues, image URLs, `comments_enabled`, `version`, language, `deleted`/`deleted_at`) lives in the event's JSON `content` body, since none of it needs relay-side filtering.

### The outbox model (NIP-65)

Every author-scoped lookup (get a character, get a profile, list someone's comments, browse by author) resolves that author's declared NIP-65 relay list first (`src/lib/nostr/relayList.ts`), then queries the union of the user's own configured relays (`getActiveRelays()`, see Preferences) and that author's declared write relays — the "outbox": where they said they publish to. Relay lists are cached in-memory per pubkey for the session. Publishing your own content goes to the union of your own declared write relays and your own configured relays, so peers following your NIP-65 hints can find it. "Browse everything"/tag/name search has no specific author to resolve ahead of time, so those stay on the user's configured relay set too — a global feed is only ever as complete as what that set (plus whatever it's aggregated from elsewhere) actually has.

### Startup ordering

`+layout.ts`'s universal `load()` function awaits `initPreferences()` before any route or component in the app mounts. This matters specifically for relays: preferences (and thus the user's configured `nostrRelays`) must be loaded from IndexedDB *before* anything can call a network function, or an early network call would race the load and briefly fall back to the built-in public defaults. Gating this in `load()` — rather than in `+layout.svelte`'s `onMount` — is what actually closes the race: Svelte mounts child components (including deep-linked pages) before a parent layout's own `onMount` runs, so sequencing only at the component level isn't sufficient.

### Network-wide browse/pagination

"Browse everything" is a plain kind-filtered relay query (`{kinds:[31333]}`) — no pseudo-tag/global-index hack needed, since relays natively support filtering by kind. Paginating the network feed (`src/lib/nostr/browse.ts:browseNetworkPage`) walks the relay-native `until` cursor (by each event's own `created_at`, i.e. latest-revision time), over-fetching a batch and re-sorting it by the `published_at` tag before slicing to a page — otherwise a minor edit to an old character would make it look newly *created* rather than just recently *edited*. Fork discovery (`browseForksOf`) and tag/name search are like plain relay tag filters (`#a`, `#t`, `#n`) rather than a separate index.
