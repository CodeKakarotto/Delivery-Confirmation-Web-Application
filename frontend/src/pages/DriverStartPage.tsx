import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ORDER_ID_MAX, ORDER_ID_PATTERN } from '../../../shared/schemas.ts';
import { Field } from '../components/ui.tsx';

/**
 * Step 1 for the driver: open one delivery by the order ID printed on the ticket. There is deliberately no list of
 * orders to pick from (without a login, a list would show every customer's address to anyone).
 */
export function DriverStartPage() {
  const navigate = useNavigate();
  const [orderId, setOrderId] = useState('');
  const [error, setError] = useState<string | undefined>();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const id = orderId.trim();
    if (!id) return setError('Enter the order ID from the ticket');
    if (id.length > ORDER_ID_MAX || !ORDER_ID_PATTERN.test(id)) return setError('Order IDs use letters, numbers and . _ # / -');
    navigate(`/confirm/${encodeURIComponent(id)}`);
  };

  return (
    <div className="narrow">
      <div className="page-head">
        <h1 ref={headingRef} tabIndex={-1}>
          Confirm a delivery
        </h1>
      </div>
      <form className="card start-card" onSubmit={onSubmit} noValidate>
        <Field label="Order ID" error={error} hint="Type the order or ticket number exactly as printed, e.g. MF-10482.">
          {(p) => (
            <input
              {...p}
              className="input-large"
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                setError(undefined);
              }}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              maxLength={ORDER_ID_MAX}
            />
          )}
        </Field>
        <button type="submit" className="btn btn-primary btn-block btn-large">
          Open delivery
        </button>
      </form>
    </div>
  );
}
