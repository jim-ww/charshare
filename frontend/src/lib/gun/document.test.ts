import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
// 'gun's Node main entry pulls in axe/multicast networking (lib/server); the
// browser build the app actually ships doesn't have that. Import the bare
// graph engine instead, so tests stay off the network (a real relay/peer).
import Gun from 'gun/gun.js';
import { __setGunForTests, gunPath, getGun } from './client';
import { putDocument, getDocument, subscribeDocument, type Validator } from './document';
import { generateKeyring } from '$lib/crypto/keys';
import { signDocument } from '$lib/crypto/sign';

interface TestDoc {
	id: string;
	msg: string;
	signature: string;
}

const isTestDoc: Validator<TestDoc> = (data): data is TestDoc => {
	const d = data as Partial<TestDoc> | null;
	return !!d && typeof d.id === 'string' && typeof d.msg === 'string' && typeof d.signature === 'string';
};

// Chained/linked GUN reads (which ownNode/authorNode rely on, elsewhere) only
// resolve when a storage adapter is enabled — confirmed by isolated testing —
// so tests need radisk on, not the in-memory-only config used before SEA/
// protected-space storage existed. Each test file gets its own on-disk dir.
const RADATA_DIR = `test-radata-document-${crypto.randomUUID()}`;

beforeAll(() => {
	__setGunForTests(new Gun({ radisk: true, localStorage: false, peers: [], file: RADATA_DIR }));
});

afterAll(() => {
	rmSync(RADATA_DIR, { recursive: true, force: true });
});

async function signedDoc(id: string, msg: string) {
	const keyring = await generateKeyring();
	const draft = { id: keyring.publicKey, msg, signature: '' };
	draft.signature = await signDocument(draft, keyring);
	return { doc: draft, pubkey: keyring.publicKey };
}

describe('putDocument / getDocument', () => {
	it('round-trips a signed document', async () => {
		const { doc, pubkey } = await signedDoc('a', 'hello');
		const path = `test/${crypto.randomUUID()}`;

		await putDocument(gunPath(getGun(), path), doc);
		const result = await getDocument(gunPath(getGun(), path), isTestDoc, () => pubkey);

		expect(result).toEqual({ ok: true, doc });
	});

	it('rejects a document with a bad signature', async () => {
		const { doc, pubkey } = await signedDoc('a', 'hello');
		const path = `test/${crypto.randomUUID()}`;
		const tampered = { ...doc, msg: 'mallory' };

		await putDocument(gunPath(getGun(), path), tampered);
		const result = await getDocument(gunPath(getGun(), path), isTestDoc, () => pubkey);

		expect(result).toEqual({ ok: false, reason: 'bad_signature' });
	});
});

describe('subscribeDocument', () => {
	it('notifies on the current value', async () => {
		const { doc, pubkey } = await signedDoc('a', 'hello');
		const path = `test/${crypto.randomUUID()}`;
		await putDocument(gunPath(getGun(), path), doc);

		const received = await new Promise((resolve) => {
			const unsubscribe = subscribeDocument(gunPath(getGun(), path), isTestDoc, () => pubkey, (result) => {
				unsubscribe();
				resolve(result);
			});
		});

		expect(received).toEqual({ ok: true, doc });
	});
});
