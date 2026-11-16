export type RecordEdit = 'correct' | 'void' | 'unvoid';

/**
 * The employee's buttons on a confirmation record. A normal record: Correct and Void. A voided record: only Undo void.
 * Print is always there.
 */
export function RecordActions({
  voided,
  editing,
  onEdit,
  onPrint,
}: {
  voided: boolean;
  editing: RecordEdit | null;
  onEdit: (edit: RecordEdit | null) => void;
  onPrint: () => void;
}) {
  const toggle = (e: RecordEdit) => onEdit(editing === e ? null : e);
  return (
    <div className="actions no-print">
      {voided ? (
        <button type="button" className="btn" onClick={() => toggle('unvoid')} aria-expanded={editing === 'unvoid'}>
          Undo void
        </button>
      ) : (
        <>
          <button type="button" className="btn" onClick={() => toggle('correct')} aria-expanded={editing === 'correct'}>
            Correct
          </button>
          <button type="button" className="btn btn-ghost-danger" onClick={() => toggle('void')} aria-expanded={editing === 'void'}>
            Void
          </button>
        </>
      )}
      <button type="button" className="btn btn-primary" onClick={onPrint}>
        Print
      </button>
    </div>
  );
}
