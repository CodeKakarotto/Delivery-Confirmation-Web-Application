import type { SearchField } from '../../../shared/types.ts';
import { Segmented } from './ui.tsx';

/** Where a search looks: everything, or only the order ID, the name or the address. */
export function SearchFieldSwitch({ value, onChange }: { value: SearchField; onChange: (v: SearchField) => void }) {
  return (
    <div className="search-in">
      <span className="search-in-label">Search in</span>
      <Segmented<SearchField>
        label="Search in"
        value={value}
        onChange={onChange}
        options={[
          { value: 'all', label: 'Everything' },
          { value: 'order', label: 'Order ID' },
          { value: 'name', label: 'Name' },
          { value: 'address', label: 'Address' },
        ]}
      />
    </div>
  );
}
