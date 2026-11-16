import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ConfirmationSubmit, DriverDelivery } from '../../shared/types.ts';
import { ApiRequestError } from '../src/api/client.ts';
import { MemoryStore } from '../src/lib/offlineStore.ts';
import { classifySendError, Outbox, TodayCache } from '../src/lib/outbox.ts';

const payload = (orderId: string, key = `00000000-0000-4000-8000-${orderId.replace(/\D/g, '').padStart(12, '0')}`): ConfirmationSubmit => ({
  orderId,
  receivedBy: 'Avery Demo',
  outcome: 'delivered_to_recipient',
  signaturePng: 'data:image/png;base64,AAAA',
  idempotencyKey: key,
});

describe('what to do when sending fails', () => {
  it('keeps trying after no signal, server trouble or a busy server', () => {
    assert.equal(classifySendError(new ApiRequestError(0, 'network_error', 'offline')), 'retry');
    assert.equal(classifySendError(new ApiRequestError(500, 'internal_error', 'x')), 'retry');
    assert.equal(classifySendError(new ApiRequestError(503, 'x', 'x')), 'retry');
    assert.equal(classifySendError(new ApiRequestError(429, 'rate_limited', 'x')), 'retry');
    assert.equal(classifySendError(new TypeError('Failed to fetch')), 'retry');
  });

  it('waits for the driver to sign in again when the session ended', () => {
    assert.equal(classifySendError(new ApiRequestError(401, 'unauthenticated', 'x')), 'signin');
  });

  it('stops and asks for attention when the server refuses it', () => {
    assert.equal(classifySendError(new ApiRequestError(409, 'already_confirmed', 'x')), 'failed');
    assert.equal(classifySendError(new ApiRequestError(404, 'order_not_found', 'x')), 'failed');
    assert.equal(classifySendError(new ApiRequestError(422, 'validation_failed', 'x')), 'failed');
  });
});

describe('the outbox on the phone', () => {
  it('keeps a confirmation until it is sent, then removes it', async () => {
    const box = new Outbox(new MemoryStore());
    await box.add('driver1', payload('MF-1'));
    assert.equal((await box.list('driver1')).length, 1);
    const sent: string[] = [];
    const result = await box.sync('driver1', async (p) => {
      sent.push(p.orderId);
    });
    assert.deepEqual(sent, ['MF-1']);
    assert.deepEqual(result, { sent: 1, waiting: 0, failed: 0, needsSignIn: false });
    assert.equal((await box.list('driver1')).length, 0);
  });

  it('keeps it (and counts the try) when there is still no signal', async () => {
    const box = new Outbox(new MemoryStore());
    await box.add('driver1', payload('MF-1'));
    const result = await box.sync('driver1', async () => {
      throw new ApiRequestError(0, 'network_error', 'offline');
    });
    assert.deepEqual(result, { sent: 0, waiting: 1, failed: 0, needsSignIn: false });
    const [item] = await box.list('driver1');
    assert.equal(item!.state, 'waiting');
    assert.equal(item!.tries, 1);
  });

  it('never throws away a refused confirmation: it is kept and marked for attention', async () => {
    const box = new Outbox(new MemoryStore());
    await box.add('driver1', payload('MF-1'));
    await box.sync('driver1', async () => {
      throw new ApiRequestError(409, 'already_confirmed', 'This order already has a saved delivery confirmation.');
    });
    const [item] = await box.list('driver1');
    assert.equal(item!.state, 'failed');
    assert.match(item!.message!, /already has a saved/);
    // Later syncs leave it alone; only the driver can remove it.
    let calls = 0;
    await box.sync('driver1', async () => {
      calls++;
    });
    assert.equal(calls, 0);
    await box.remove(item!.key);
    assert.equal((await box.list('driver1')).length, 0);
  });

  it('stops at an ended session and keeps everything for after sign-in', async () => {
    const box = new Outbox(new MemoryStore());
    await box.add('driver1', payload('MF-1'));
    await box.add('driver1', payload('MF-2'));
    let calls = 0;
    const result = await box.sync('driver1', async () => {
      calls++;
      throw new ApiRequestError(401, 'unauthenticated', 'x');
    });
    assert.equal(calls, 1);
    assert.equal(result.needsSignIn, true);
    assert.equal((await box.list('driver1')).length, 2);
  });

  it('sends in the order they were saved, and only for the signed-in driver', async () => {
    const box = new Outbox(new MemoryStore());
    await box.add('driver1', payload('MF-1'));
    await box.add('driver2', payload('MF-9'));
    await box.add('driver1', payload('MF-2'));
    const sent: string[] = [];
    await box.sync('driver1', async (p) => {
      sent.push(p.orderId);
    });
    assert.deepEqual(sent, ['MF-1', 'MF-2']);
    assert.equal((await box.list('driver2')).length, 1);
  });

  it('adding the same confirmation twice keeps one copy (same request key)', async () => {
    const box = new Outbox(new MemoryStore());
    const p = payload('MF-1');
    await box.add('driver1', p);
    await box.add('driver1', p);
    assert.equal((await box.list('driver1')).length, 1);
  });
});

describe('today’s deliveries kept on the phone', () => {
  const d = (orderId: string): DriverDelivery => ({
    orderId,
    stopNumber: 1,
    zone: 'A',
    recipientName: 'Demo',
    addressLine: '1 Test St',
    city: 'Lake Ridge',
    state: 'VA',
    postalCode: '22192',
    addressNotes: null,
    totalProducts: 1,
    products: null,
    deliveryInstructions: null,
  });

  it('finds an order from today’s copy (any letter case), only for the same driver and day', async () => {
    const cache = new TodayCache(new MemoryStore());
    await cache.save('driver1', '2026-11-14', [d('MF-1'), d('MF-2')]);
    assert.equal((await cache.find('driver1', 'mf-2', '2026-11-14'))?.orderId, 'MF-2');
    assert.equal(await cache.find('driver2', 'MF-2', '2026-11-14'), null);
    assert.equal(await cache.find('driver1', 'MF-2', '2026-11-15'), null, 'yesterday’s copy is not used');
  });

  it('forgets an order once it has been confirmed', async () => {
    const cache = new TodayCache(new MemoryStore());
    await cache.save('driver1', '2026-11-14', [d('MF-1'), d('MF-2')]);
    await cache.forget('driver1', 'MF-1');
    assert.equal(await cache.find('driver1', 'MF-1', '2026-11-14'), null);
    assert.equal((await cache.list('driver1', '2026-11-14')).length, 1);
  });
});
