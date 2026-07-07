import { describe, it, expect } from 'vitest';
import { generateKeyring } from './keys';
import { signDocument, verifyDocument } from './sign';

describe('signDocument / verifyDocument', () => {
	it('verifies a document signed with the matching key', async () => {
		const keyring = await generateKeyring();
		const doc = { hello: 'world', signature: '' };
		doc.signature = await signDocument(doc, keyring);

		expect(await verifyDocument(doc, keyring.publicKey)).toBe(true);
	});

	it('rejects a tampered document', async () => {
		const keyring = await generateKeyring();
		const doc = { hello: 'world', signature: '' };
		doc.signature = await signDocument(doc, keyring);

		const tampered = { ...doc, hello: 'mallory' };
		expect(await verifyDocument(tampered, keyring.publicKey)).toBe(false);
	});

	it('rejects a document signed by a different key', async () => {
		const keyring = await generateKeyring();
		const other = await generateKeyring();
		const doc = { hello: 'world', signature: '' };
		doc.signature = await signDocument(doc, keyring);

		expect(await verifyDocument(doc, other.publicKey)).toBe(false);
	});
});
