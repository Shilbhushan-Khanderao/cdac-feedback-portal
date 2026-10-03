import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { must, supabase } from '../lib/supabase';

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

// Generic over table names, so it uses the untyped client. RLS still decides what saves.
const db = supabase as unknown as SupabaseClient;

const friendly = (message: string) =>
  message.includes('duplicate key')
    ? 'This already exists.'
    : message.includes('foreign key')
    ? 'This row is in use elsewhere. Mark it inactive instead of deleting.'
    : message.includes('row-level security')
      ? 'You are not allowed to change this row.'
      : message;

/** Inline add/edit/delete table for small reference lists. */
export function TableEditor({ table, columns, pk = 'id', order, filters }: Props) {
  const queryClient = useQueryClient();
  const rows = useQuery({
    queryKey: [table, 'editor', filters],
    queryFn: () => {
      let q = db.from(table).select('*').order(order);
      for (const [column, value] of Object.entries(filters ?? {})) q = q.eq(column, value);
      return must(q) as Promise<Row[]>;
    },
  });

  const save = useMutation({
    mutationFn: ({ original, draft }: { original?: Row; draft: Row }) =>
      must(original ? db.from(table).update(draft).eq(pk, original[pk]) : db.from(table).insert(draft)),
    onSuccess: () => {
      toast.success('Saved');
      // Prefix match also refreshes dropdowns that read this table elsewhere.
      void queryClient.invalidateQueries({ queryKey: [table] });
    },
    onError: (e) => toast.error(friendly(e.message)),
  });

  const remove = useMutation({
    mutationFn: async (row: Row) => {
      const deleted = await must(db.from(table).delete().eq(pk, row[pk]).select());
      if (!deleted?.length) throw new Error('row-level security');
    },
    onSuccess: () => {
      toast.success('Deleted');
      void queryClient.invalidateQueries({ queryKey: [table] });
    },
    onError: (e) => toast.error(friendly(e.message)),
  });

  if (rows.isLoading) return <p className="muted">Loading…</p>;
  if (rows.error) return <p className="text-red-600">{rows.error.message}</p>;

  const blank: Row = { ...filters };
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 font-medium">
                {c.label}
              </th>
            ))}
            <th className="w-40" />
          </tr>
        </thead>
        <tbody>
          {rows.data!.map((row) => (
            <EditRow
              key={String(row[pk])}
              columns={columns}
              row={row}
              onSave={(draft) => save.mutate({ original: row, draft })}
              onDelete={() => confirm('Delete this row?') && remove.mutate(row)}
            />
          ))}
          <EditRow key={rows.dataUpdatedAt} columns={columns} row={blank} onSave={(draft) => save.mutate({ draft })} />
        </tbody>
      </table>
    </div>
  );
}

const toInput = (c: Col, v: unknown) => (c.type === 'list' ? ((v as string[] | undefined) ?? []).join(', ') : v);
const fromInput = (c: Col, v: unknown) => {
  if (c.type === 'list') return String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (c.type === 'number') return Number(v);
  if (c.type === 'select' || c.type === 'text' || !c.type) return v === '' ? null : v;
  return v;
};

function EditRow({ columns, row, onSave, onDelete }: { columns: Col[]; row: Row; onSave: (d: Row) => void; onDelete?: () => void }) {
  const [draft, setDraft] = useState<Row>(() => Object.fromEntries(columns.map((c) => [c.key, toInput(c, row[c.key])])));
  const dirty = columns.some((c) => JSON.stringify(fromInput(c, draft[c.key])) !== JSON.stringify(row[c.key] ?? null));
  const isNew = !onDelete;
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = () => {
    const missing = columns.find((c) => c.required && (draft[c.key] === '' || draft[c.key] == null));
    if (missing) return toast.error(`${missing.label} is required`);
    onSave({ ...(isNew ? row : {}), ...Object.fromEntries(columns.map((c) => [c.key, fromInput(c, draft[c.key])])) });
  };

  return (
    <tr className={`border-t border-slate-100 ${isNew ? 'bg-slate-50/50' : ''}`}>
      {columns.map((c) => (
        <td key={c.key} className="px-2 py-1.5">
          {c.type === 'bool' ? (
            <input
              type="checkbox"
              aria-label={c.label}
              checked={(draft[c.key] as boolean | undefined) ?? (isNew ? true : false)}
              onChange={(e) => set(c.key, e.target.checked)}
            />
          ) : c.type === 'select' ? (
            <select aria-label={c.label} className="input min-w-32" value={String(draft[c.key] ?? '')} onChange={(e) => set(c.key, e.target.value)}>
              <option value="">{c.required ? 'Select…' : '—'}</option>
              {c.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
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
      <td className="whitespace-nowrap px-2 py-1.5 text-right">
        {isNew ? (
          <button className="btn btn-primary px-3 py-1.5" onClick={submit}>
            Add
          </button>
        ) : (
          <span className="inline-flex gap-1">
            <button className="btn px-3 py-1.5" disabled={!dirty} onClick={submit}>
              Save
            </button>
            <button className="btn btn-danger px-3 py-1.5" onClick={onDelete}>
              Delete
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}
