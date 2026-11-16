import { SHOP_PHONE, SHOP_PHONE_TEL } from '../lib/shop.ts';

export function PhoneIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true">
      <path
        d="M6.6 2.8 4.5 3.3c-.9.2-1.5 1.1-1.3 2 1.1 5.6 5.4 9.9 11 11 .9.2 1.8-.4 2-1.3l.5-2.1c.2-.7-.2-1.4-.9-1.6l-2.6-.9c-.6-.2-1.2 0-1.6.5l-.8 1c-2-1-3.6-2.6-4.6-4.6l1-.8c.5-.4.7-1 .5-1.6l-.9-2.6c-.2-.7-.9-1.1-1.6-.9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** For drivers: the shop's number, tap to call, for emergencies or questions about an order. */
export function CallShop({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="call-shop-line no-print">
        <PhoneIcon size={16} />
        <span>Emergency or a problem with this order?</span>
        <a href={`tel:${SHOP_PHONE_TEL}`}>Call the shop: {SHOP_PHONE}</a>
      </p>
    );
  }
  return (
    <aside className="call-shop no-print" aria-label="Call the shop">
      <span className="call-shop-icon">
        <PhoneIcon size={20} />
      </span>
      <span className="call-shop-text">
        <strong>Emergency or a problem with an order?</strong>
        <span>Call Michael’s Flowers</span>
      </span>
      <a className="btn btn-primary call-shop-btn" href={`tel:${SHOP_PHONE_TEL}`}>
        <PhoneIcon size={16} />
        {SHOP_PHONE}
      </a>
    </aside>
  );
}
