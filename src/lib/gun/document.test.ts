import { describe, it, expect, beforeAll } from 'vitest';
// 'gun's Node main entry pulls in axe/multicast networking (lib/server); the
// browser build the app actually ships doesn't have that. Import the bare
// graph engine instead, so tests stay in-memory and don't try to hit a network.
import Gun from 'gun/gun.js';
import { __setGunForTests } from './client';
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

beforeAll(() => {
	// In-memory only — no radisk/peers — so tests don't touch disk or network.
	__setGunForTests(new Gun({ radisk: false, localStorage: false, peers: [] }));
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

		await putDocument(path, doc);
		const result = await getDocument(path, isTestDoc, () => pubkey);

		expect(result).toEqual({ ok: true, doc });
	});

	it('rejects a document with a bad signature', async () => {
		const { doc, pubkey } = await signedDoc('a', 'hello');
		const path = `test/${crypto.randomUUID()}`;
		const tampered = { ...doc, msg: 'mallory' };

		await putDocument(path, tampered);
		const result = await getDocument(path, isTestDoc, () => pubkey);

		expect(result).toEqual({ ok: false, reason: 'bad_signature' });
	});
});

describe('subscribeDocument', () => {
	it('notifies on the current value', async () => {
		const { doc, pubkey } = await signedDoc('a', 'hello');
		const path = `test/${crypto.randomUUID()}`;
		await putDocument(path, doc);

		const received = await new Promise((resolve) => {
			const unsubscribe = subscribeDocument(path, isTestDoc, () => pubkey, (result) => {
				unsubscribe();
				resolve(result);
			});
		});

		expect(received).toEqual({ ok: true, doc });
	});
});
