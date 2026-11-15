import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateConfirmationForm, type ConfirmationFormState } from '../src/lib/confirmationForm.ts';

const valid: ConfirmationFormState = {
  outcome: 'delivered_to_recipient',
  outcomeDetail: '',
  note: '',
  receivedBy: 'Avery Demo',
  signature: { dataUrl: 'data:image/png;base64,AAAA', strokeLength: 400 },
};

describe('confirmation form validation (usability only; the Worker re-checks everything)', () => {
  it('accepts a complete form', () => {
    assert.deepEqual(validateConfirmationForm(valid), {});
  });

  it('requires a delivery exception / outcome to be chosen', () => {
    assert.ok(validateConfirmationForm({ ...valid, outcome: null }).outcome);
  });

  it('requires an explanation when Other is selected', () => {
    assert.ok(validateConfirmationForm({ ...valid, outcome: 'other' }).outcomeDetail);
    assert.ok(validateConfirmationForm({ ...valid, outcome: 'other', outcomeDetail: '   ' }).outcomeDetail);
    assert.deepEqual(validateConfirmationForm({ ...valid, outcome: 'other', outcomeDetail: 'In the garage' }), {});
  });

  it('requires the Received By name', () => {
    assert.ok(validateConfirmationForm({ ...valid, receivedBy: '  ' }).receivedBy);
  });

  it('requires a drawn signature: a typed name is not a signature', () => {
    assert.ok(validateConfirmationForm({ ...valid, signature: null }).signature);
    // A dot or accidental tap is not enough ink to count as a signature.
    assert.ok(validateConfirmationForm({ ...valid, signature: { dataUrl: valid.signature!.dataUrl, strokeLength: 5 } }).signature);
  });

  it('limits text lengths like the server does', () => {
    assert.ok(validateConfirmationForm({ ...valid, receivedBy: 'x'.repeat(101) }).receivedBy);
    assert.ok(validateConfirmationForm({ ...valid, note: 'x'.repeat(501) }).note);
  });
});
