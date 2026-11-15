import { Link } from 'react-router';
import { Notice } from '../components/ui.tsx';

export function NotFoundPage() {
  return (
    <Notice tone="warn" title="Page not found" action={<Link to="/" className="btn btn-small">Home</Link>}>
      This page does not exist.
    </Notice>
  );
}
