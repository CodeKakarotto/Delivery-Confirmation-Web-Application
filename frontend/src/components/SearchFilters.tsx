import type { SearchLead } from '../../../shared/types.ts';
import { Segmented } from './ui.tsx';

/** Reads the "in" URL parameter: order ID unless name or address was chosen. */
export function leadFromParam(value: string | null): SearchLead {
  return value === 'name' || value === 'address' ? value : 'order';
}

/**
 * What a search puts first. Every search looks at the order ID, the name and the address; the chosen one comes first
 * (matches in it at the top of the results, and each result starts with it). Order ID is the standard.
 */
export function SearchFieldSwitch({ value, onChange }: { value: SearchLead; onChange: (v: SearchLead) => void }) {
  return (
    <div className="search-in">
      <span className="search-in-label">Show first</span>
      <Segmented<SearchLead>
        label="Show first"
        value={value}
        onChange={onChange}
        options={[
          { value: 'order', label: 'Order ID' },
          { value: 'name', label: 'Name' },
          { value: 'address', label: 'Address' },
        ]}
      />
    </div>
  );
}
