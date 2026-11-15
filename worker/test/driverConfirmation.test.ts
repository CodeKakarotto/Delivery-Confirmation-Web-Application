import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { captureLogs, createEnv, makePng, pngDataUrl, TestClient, validSubmission } from './helpers/app.ts';

function setup() {
  const { env, db } = createEnv();
  return { env, db, client: new TestClient(env) };
}

function confirmationRows(db: ReturnType<typeof createEnv>['db']) {
  return db.sqlite.prepare('SELECT * FROM delivery_confirmations').all() as Array<Record<string, unknown>>;
}

describe('driver lookup (no login)', () => {
  it('returns only the fields needed to complete one delivery', async () => {
    const { client } = setup();
    const res = await client.request('GET', '/api/driver/deliveries/MF-10482');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ready');
    assert.deepEqual(Object.keys(res.body.delivery).sort(), [
      'addressLine', 'addressNotes', 'city', 'deliveryInstructions', 'orderId', 'postalCode', 'recipientName',
      'state', 'stopNumber', 'totalProducts', 'zone',
    ]);
    assert.equal(res.body.delivery.orderId, 'MF-10482');
    assert.equal(res.body.delivery.stopNumber, 1);
    assert.equal(res.body.delivery.zone, 'A');
    assert.equal(res.body.delivery.totalProducts, 3);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  });

  it('matches the order ID case-insensitively but exactly (no partial matches)', async () => {
    const { client } = setup();
    assert.equal((await client.request('GET', '/api/driver/deliveries/mf-10482')).status, 200);
    assert.equal((await client.request('GET', '/api/driver/deliveries/MF-1048')).status, 404);
  });

  it('keeps missing zone, stop number and product total as null (never invented)', async () => {
    const { client } = setup();
    const res = await client.request('GET', '/api/driver/deliveries/MF-10485');
    assert.equal(res.status, 200);
    assert.equal(res.body.delivery.zone, null);
    assert.equal(res.body.delivery.stopNumber, null);
    assert.equal(res.body.delivery.totalProducts, null);
  });

  it('rejects an unknown order ID with 404', async () => {
    const { client } = setup();
    const res = await client.request('GET', '/api/driver/deliveries/NOPE-1');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'order_not_found');
  });

  it('rejects a malformed order ID with 404 without querying for it', async () => {
    const { client } = setup();
    const res = await client.request('GET', `/api/driver/deliveries/${encodeURIComponent('<script>')}`);
    assert.equal(res.status, 404);
  });

  it('refuses a cancelled order with 409', async () => {
    const { client } = setup();
    const res = await client.request('GET', '/api/driver/deliveries/MF-10490');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'order_cancelled');
  });

  // The only order list a driver gets is today's awaiting deliveries without street addresses (roles.test.ts).
  it('does not offer any other endpoint that lists orders or confirmations', async () => {
    const { client } = setup();
    for (const path of ['/api/deliveries', '/api/driver/confirmations', '/api/driver/orders']) {
      const res = await client.request('GET', path);
      // 404 (no such endpoint) or 405 (POST-only endpoint): either way, nothing is listed.
      assert.ok(res.status === 404 || res.status === 405, `${path}: ${res.status}`);
      assert.ok(!JSON.stringify(res.body).includes('Avery'), path);
    }
  });

  it('returns no customer details for an order that is already confirmed', async () => {
    const { client } = setup();
    assert.equal((await client.request('POST', '/api/driver/confirmations', validSubmission())).status, 201);
    const res = await client.request('GET', '/api/driver/deliveries/MF-10482');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'already_confirmed');
    assert.equal(res.body.delivery, undefined);
    assert.ok(!JSON.stringify(res.body).includes('Avery'));
    assert.ok(!JSON.stringify(res.body).includes('Sample Way'));
  });
});

describe('submitting a confirmation', () => {
  it('saves a valid confirmation linked to the correct existing order', async () => {
    const { client, db } = setup();
    const res = await client.request('POST', '/api/driver/confirmations', validSubmission());
    assert.equal(res.status, 201);
    assert.equal(res.body.replayed, false);
    assert.equal(res.body.confirmation.orderId, 'MF-10482');
    assert.equal(res.body.confirmation.result, 'confirmed');
    assert.match(res.body.confirmation.id, /^[0-9a-f-]{36}$/);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.equal(res.body.confirmation.signaturePng, undefined, 'the signature is never echoed back');

    const rows = confirmationRows(db);
    assert.equal(rows.length, 1);
    const delivery = db.sqlite.prepare("SELECT id FROM deliveries WHERE order_id = 'MF-10482'").get() as { id: number };
    assert.equal(rows[0]!.delivery_id, delivery.id);
    assert.equal(rows[0]!.stop_number, 1, 'stop number is copied from the order by the server');
    assert.equal(rows[0]!.zone, 'A');
  });

  it('uses the stored order ID spelling even when the driver typed different case', async () => {
    const { client } = setup();
    const res = await client.request('POST', '/api/driver/confirmations', validSubmission({ orderId: 'mf-10482' }));
    assert.equal(res.status, 201);
    assert.equal(res.body.confirmation.orderId, 'MF-10482');
  });

  it('uses the server clock for the confirmation time', async () => {
    const { client, db } = setup();
    const now = new Date('2026-11-14T15:30:00.000Z');
    const res = await client.request('POST', '/api/driver/confirmations', validSubmission(), { now });
    assert.equal(res.status, 201);
    assert.equal(res.body.confirmation.confirmedAt, '2026-11-14T15:30:00.000Z');
    assert.equal(confirmationRows(db)[0]!.confirmed_at, '2026-11-14T15:30:00.000Z');
  });

  it('refuses client-supplied timestamps, results and other unexpected fields', async () => {
    const { client, db } = setup();
    for (const extra of [{ confirmedAt: '2020-01-01T00:00:00Z' }, { result: 'confirmed' }, { zone: 'Z' }, { stopNumber: 9 }]) {
      const res = await client.request('POST', '/api/driver/confirmations', validSubmission(extra));
      assert.equal(res.status, 422, JSON.stringify(extra));
    }
    assert.equal(confirmationRows(db).length, 0);
  });

  it('rejects an unknown order ID and saves nothing', async () => {
    const { client, db } = setup();
    const res = await client.request('POST', '/api/driver/confirmations', validSubmission({ orderId: 'MF-99999' }));
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'order_not_found');
    assert.equal(confirmationRows(db).length, 0);
  });

  it('rejects a cancelled order and saves nothing', async () => {
    const { client, db } = setup();
    const res = await client.request('POST', '/api/driver/confirmations', validSubmission({ orderId: 'MF-10490' }));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'order_cancelled');
    assert.equal(confirmationRows(db).length, 0);
  });

  it('rejects missing required fields', async () => {
    const { client, db } = setup();
    for (const field of ['orderId', 'receivedBy', 'outcome', 'signaturePng', 'idempotencyKey']) {
      const body = validSubmission();
      delete body[field];
      const res = await client.request('POST', '/api/driver/confirmations', body);
      assert.equal(res.status, 422, field);
      assert.ok(res.body.error.details.issues.some((i: { path: string }) => i.path === field), field);
    }
    const blankName = await client.request('POST', '/api/driver/confirmations', validSubmission({ receivedBy: '   ' }));
    assert.equal(blankName.status, 422);
    assert.equal(confirmationRows(db).length, 0);
  });

  it('requires an explanation when the exception is Other', async () => {
    const { client, db } = setup();
    const res = await client.request('POST', '/api/driver/confirmations', validSubmission({ outcome: 'other' }));
    assert.equal(res.status, 422);
    assert.ok(res.body.error.details.issues.some((i: { path: string }) => i.path === 'outcomeDetail'));
    const blank = await client.request('POST', '/api/driver/confirmations', validSubmission({ outcome: 'other', outcomeDetail: '  ' }));
    assert.equal(blank.status, 422);
    assert.equal(confirmationRows(db).length, 0);

    const ok = await client.request(
      'POST',
      '/api/driver/confirmations',
      validSubmission({ outcome: 'other', outcomeDetail: 'Placed in the garage at the customer’s request' }),
    );
    assert.equal(ok.status, 201);
    assert.equal(ok.body.confirmation.outcomeDetail, 'Placed in the garage at the customer’s request');
  });

  it('rejects an unknown exception value', async () => {
    const { client } = setup();
    const res = await client.request('POST', '/api/driver/confirmations', validSubmission({ outcome: 'thrown_over_fence' }));
    assert.equal(res.status, 422);
  });

  it('saves exceptions other than a recipient hand-off as "needs review", not as a normal delivery', async () => {
    const { client } = setup();
    const res = await client.request(
      'POST',
      '/api/driver/confirmations',
      validSubmission({ outcome: 'left_at_door', note: 'Customer asked by text to leave it at the door.' }),
    );
    assert.equal(res.status, 201);
    assert.equal(res.body.confirmation.result, 'needs_review');
    assert.equal(res.body.confirmation.note, 'Customer asked by text to leave it at the door.');
  });

  it('rejects field values that are too long', async () => {
    const { client } = setup();
    assert.equal((await client.request('POST', '/api/driver/confirmations', validSubmission({ receivedBy: 'x'.repeat(101) }))).status, 422);
    assert.equal((await client.request('POST', '/api/driver/confirmations', validSubmission({ note: 'x'.repeat(501) }))).status, 422);
  });
});

describe('signature validation', () => {
  it('rejects data that is not a PNG image, and leaves the order unconfirmed', async () => {
    const { client, db } = setup();
    const bad = [
      'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64'),
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
      'Avery Demo',
    ];
    for (const signaturePng of bad) {
      const res = await client.request('POST', '/api/driver/confirmations', validSubmission({ signaturePng }));
      assert.equal(res.status, 422, signaturePng.slice(0, 30));
    }
    assert.equal(confirmationRows(db).length, 0);
    const lookup = await client.request('GET', '/api/driver/deliveries/MF-10482');
    assert.equal(lookup.body.status, 'ready', 'a failed save never marks the order confirmed');
  });

  it('rejects PNGs with hidden text chunks, odd sizes or truncated data', async () => {
    const { client } = setup();
    const withText = makePng(600, 200, { extraChunks: [{ type: 'tEXt', data: new TextEncoder().encode('Comment\0hi') }] });
    const tiny = makePng(20, 10);
    const truncated = makePng().slice(0, 200);
    for (const png of [withText, tiny, truncated]) {
      const res = await client.request('POST', '/api/driver/confirmations', validSubmission({ signaturePng: pngDataUrl(png) }));
      assert.equal(res.status, 422);
      assert.equal(res.body.error.code, 'invalid_signature');
    }
  });

  it('rejects an oversized request body with 413', async () => {
    const { client } = setup();
    const huge = 'data:image/png;base64,' + 'A'.repeat(400 * 1024);
    const res = await client.request('POST', '/api/driver/confirmations', validSubmission({ signaturePng: huge }));
    assert.equal(res.status, 413);
  });
});

describe('duplicate submissions and retries', () => {
  it('a retry with the same request key returns the saved record instead of saving again', async () => {
    const { client, db } = setup();
    const body = validSubmission();
    const first = await client.request('POST', '/api/driver/confirmations', body);
    assert.equal(first.status, 201);
    // The network failed after the save; the driver presses Retry, which resends the same key.
    const retry = await client.request('POST', '/api/driver/confirmations', body);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.replayed, true);
    assert.equal(retry.body.confirmation.id, first.body.confirmation.id);
    assert.equal(retry.body.confirmation.confirmedAt, first.body.confirmation.confirmedAt);
    assert.equal(confirmationRows(db).length, 1);
    assert.equal((db.sqlite.prepare('SELECT COUNT(*) AS n FROM confirmation_attempts').get() as { n: number }).n, 0);
  });

  it('many simultaneous double-clicks still create exactly one confirmation', async () => {
    const { client, db } = setup();
    const body = validSubmission();
    const results = await Promise.all(Array.from({ length: 5 }, () => client.request('POST', '/api/driver/confirmations', body)));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 200, 200, 201]);
    assert.equal(confirmationRows(db).length, 1);
  });

  it('a second submission for an already confirmed order is refused, not overwritten, and flagged', async () => {
    const { client, db } = setup();
    const first = await client.request('POST', '/api/driver/confirmations', validSubmission());
    const second = await client.request(
      'POST',
      '/api/driver/confirmations',
      validSubmission({ receivedBy: 'Someone Else', outcome: 'left_with_neighbor' }),
    );
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'already_confirmed');
    const rows = confirmationRows(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.received_by, 'Avery Demo', 'the original record is unchanged');
    const attempts = db.sqlite.prepare('SELECT * FROM confirmation_attempts').all() as Array<Record<string, unknown>>;
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0]!.kind, 'conflict');
    assert.equal(attempts[0]!.confirmation_id, first.body.confirmation.id);
  });

  it('the same content sent again under a new key is flagged as a duplicate', async () => {
    const { client, db } = setup();
    const body = validSubmission();
    await client.request('POST', '/api/driver/confirmations', body);
    const again = await client.request('POST', '/api/driver/confirmations', { ...body, idempotencyKey: randomUUID() });
    assert.equal(again.status, 409);
    const attempt = db.sqlite.prepare('SELECT kind FROM confirmation_attempts').get() as { kind: string };
    assert.equal(attempt.kind, 'duplicate');
  });

  it('a request key reused for different content is refused', async () => {
    const { client, db } = setup();
    const body = validSubmission();
    await client.request('POST', '/api/driver/confirmations', body);
    const reuse = await client.request('POST', '/api/driver/confirmations', { ...body, receivedBy: 'Changed Name' });
    assert.equal(reuse.status, 422);
    assert.equal(reuse.body.error.code, 'idempotency_key_reused');
    const other = await client.request('POST', '/api/driver/confirmations', { ...body, orderId: 'MF-10483' });
    assert.equal(other.status, 422);
    assert.equal(confirmationRows(db).length, 1);
  });
});

describe('privacy in logs', () => {
  it('never logs customer details or signature contents, even on failures', async () => {
    const { client, env } = setup();
    const signature = pngDataUrl();
    const logs = await captureLogs(async () => {
      await client.request('GET', '/api/driver/deliveries/MF-10482');
      await client.request('POST', '/api/driver/confirmations', validSubmission({ signaturePng: signature }));
      await client.request('POST', '/api/driver/confirmations', validSubmission({ signaturePng: signature, receivedBy: 'Other Person' }));
      await client.request('POST', '/api/driver/confirmations', validSubmission({ signaturePng: 'data:image/png;base64,AAAA' }));
      // Force an unexpected server error.
      const broken = new TestClient({ ...env, DB: { prepare() { throw new Error('boom Avery Demo 100 Sample Way'); } } as never });
      const res = await broken.request('POST', '/api/driver/confirmations', validSubmission());
      assert.equal(res.status, 500);
      assert.equal(res.body.error.message, 'Something went wrong on the server. Try again.');
      assert.ok(!JSON.stringify(res.body).includes('boom'));
    });
    for (const secret of ['Avery Demo', 'Other Person', '100 Sample Way', 'Lake Ridge', signature.slice(22, 80)]) {
      assert.ok(!logs.includes(secret), `log contains ${secret}`);
    }
  });
});
