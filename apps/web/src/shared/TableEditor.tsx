import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tablesApi } from './api';
import { Choice, ConfirmButton } from './ui';

export type Col = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'bool' | 'select' | 'list';
  options?: { value: string; label: string }[];
  required?: boolean;
};
type Row = Record<string, unknown>;
type Props = {
  table: string;
  columns: Col[];
  pk?: string;
  order: string;
  /** Rows shown are limited to these column values, and new rows get them. */
  filters?: Record<string, string>;
};

const friendly = (message: string) =>
  message.includes('duplicate key')
    ? 'This already exists.'
    : message.includes('foreign key')
      ? 'This row is in use elsewhere. Mark it inactive instead of deleting.'
      : message.includes('row-level security') ||
          message.includes('Unauthorized') ||
          message.includes('Admin access required')
        ? 'You are not allowed to change this row.'
        : message;

/** Inline add/edit/delete table for small reference lists. */
export function TableEditor({ table, columns, pk = 'id', order, filters }: Props) {
  const queryClient = useQueryClient();
  const rows = useQuery({
    queryKey: [table, 'editor', filters],
    queryFn: () => tablesApi.listAll(table, { ...filters, order }),
  });

  const save = useMutation({
    mutationFn: ({ original, draft }: { original?: Row; draft: Row }) =>
      original
        ? tablesApi.update(table, String(original[pk]), draft, pk)
        : tablesApi.create(table, draft),
    onSuccess: () => {
      toast.success('Saved');
      // Prefix match also refreshes dropdowns that read this table elsewhere.
      void queryClient.invalidateQueries({ queryKey: [table] });
    },
    onError: (e) => toast.error(friendly(e.message)),
  });

  const remove = useMutation({
    mutationFn: async (row: Row) => {
      await tablesApi.delete(table, String(row[pk]), pk);
    },
    onSuccess: () => {
      toast.success('Deleted');
      void queryClient.invalidateQueries({ queryKey: [table] });
    },
    onError: (e) => toast.error(friendly(e.message)),
  });

  if (rows.isLoading) return <p className="muted">Loading…</p>;
  if (rows.error)
    return (
      <p role="alert" className="text-red-600">
        {rows.error.message}
      </p>
    );

  const blank: Row = { ...filters };
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
      {/* Below sm, rows stack as cards with each field labelled (data-label), instead of a sideways-scrolling table. */}
      <table className="w-full text-sm max-sm:block">
        <thead className="bg-stone-50 text-left text-stone-600 max-sm:hidden">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 font-medium">
                {c.label}
              </th>
            ))}
            <th className="w-40" />
          </tr>
        </thead>
        <tbody className="max-sm:block">
          {rows.data!.map((row) => (
            <EditRow
              key={String(row[pk])}
              columns={columns}
              row={row}
              onSave={(draft) => save.mutate({ original: row, draft })}
              onDelete={() => remove.mutate(row)}
            />
          ))}
          <EditRow
            key={rows.dataUpdatedAt}
            columns={columns}
            row={blank}
            onSave={(draft) => save.mutate({ draft })}
          />
        </tbody>
      </table>
    </div>
  );
}

const CELL =
  'px-2 py-1.5 max-sm:block max-sm:p-0 max-sm:before:mb-1 max-sm:before:block max-sm:before:text-xs max-sm:before:font-medium max-sm:before:text-stone-600 max-sm:before:content-[attr(data-label)]';

const toInput = (c: Col, v: unknown) =>
  c.type === 'list' ? ((v as string[] | undefined) ?? []).join(', ') : v;
const fromInput = (c: Col, v: unknown) => {
  if (c.type === 'list')
    return String(v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  if (c.type === 'number') return Number(v);
  if (c.type === 'select' || c.type === 'text' || !c.type) return v === '' ? null : v;
  return v;
};

function EditRow({
  columns,
  row,
  onSave,
  onDelete,
}: {
  columns: Col[];
  row: Row;
  onSave: (d: Row) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<Row>(() =>
    Object.fromEntries(columns.map((c) => [c.key, toInput(c, row[c.key])])),
  );
  const dirty = columns.some(
    (c) => JSON.stringify(fromInput(c, draft[c.key])) !== JSON.stringify(row[c.key] ?? null),
  );
  const isNew = !onDelete;
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = () => {
    const missing = columns.find(
      (c) => c.required && (draft[c.key] === '' || draft[c.key] == null),
    );
    if (missing) return toast.error(`${missing.label} is required`);
    onSave({
      ...(isNew ? row : {}),
      ...Object.fromEntries(columns.map((c) => [c.key, fromInput(c, draft[c.key])])),
    });
  };

  return (
    <tr
      className={`border-t border-stone-100 max-sm:block max-sm:space-y-2 max-sm:p-3 ${isNew ? 'bg-stone-50/50' : ''}`}
    >
      {columns.map((c) => (
        <td key={c.key} data-label={c.label} className={CELL}>
          {c.type === 'bool' ? (
            <input
              type="checkbox"
              aria-label={c.label}
              checked={(draft[c.key] as boolean | undefined) ?? (isNew ? true : false)}
              onChange={(e) => set(c.key, e.target.checked)}
            />
          ) : c.type === 'select' ? (
            <Choice
              label={c.label}
              hideLabel
              className="min-w-40"
              value={String(draft[c.key] ?? '')}
              onChange={(v) => set(c.key, v)}
              options={c.options ?? []}
              emptyLabel={c.required ? undefined : '—'}
            />
          ) : (
            <input
              aria-label={c.label}
              className="input min-w-24"
              type={c.type === 'number' ? 'number' : 'text'}
              placeholder={isNew ? c.label : ''}
              value={String(draft[c.key] ?? '')}
              onChange={(e) => set(c.key, e.target.value)}
            />
          )}
        </td>
      ))}
      <td className="whitespace-nowrap px-2 py-1.5 text-right max-sm:block max-sm:p-0 max-sm:pt-1 max-sm:text-left">
        {isNew ? (
          <button className="btn btn-primary px-3 py-1.5" onClick={submit}>
            Add
          </button>
        ) : (
          <span className="inline-flex gap-1">
            <button className="btn px-3 py-1.5" disabled={!dirty} onClick={submit}>
              Save
            </button>
            <ConfirmButton
              className="btn btn-danger px-3 py-1.5"
              title="Delete this row?"
              message="This cannot be undone. Rows still in use are protected and will not be deleted."
              confirmLabel="Delete"
              onConfirm={onDelete!}
            >
              Delete
            </ConfirmButton>
          </span>
        )}
      </td>
    </tr>
  );
}
