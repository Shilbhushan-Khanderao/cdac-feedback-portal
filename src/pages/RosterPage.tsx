import { useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { must, supabase } from '../lib/supabase';
import { useMyBatches } from '../lib/reference';
import { TableEditor } from './TableEditor';

export function RosterPage() {
  const queryClient = useQueryClient();
  const batches = useMyBatches();
  const [batchId, setBatchId] = useState('');
  const [busy, setBusy] = useState(false);

  const upload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
      complete: async ({ data }) => {
        const rows = data.map((r) => ({
          prn: (r.prn ?? '').trim(),
          full_name: (r.full_name ?? r.name ?? '').trim(),
          email: (r.email ?? r.gmail ?? '').trim().toLowerCase(),
          batch_id: batchId,
        }));
        const bad = rows.findIndex((r) => !r.prn || !r.full_name || !r.email);
        if (bad >= 0) return toast.error(`Row ${bad + 2}: prn, name and email are all required`);
        setBusy(true);
        try {
          await must(supabase.from('student_roster').upsert(rows, { onConflict: 'email' }));
          toast.success(`${rows.length} students saved`);
          void queryClient.invalidateQueries({ queryKey: ['student_roster'] });
          void queryClient.invalidateQueries({ queryKey: ['batches'] });
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      },
    });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Students</h1>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" aria-label="Batch" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
          <option value="">Select batch</option>
          {batches.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} ({b.size})
            </option>
          ))}
        </select>
        {batchId && (
          <label className={`btn ${busy ? 'opacity-50' : ''}`}>
            {busy ? 'Uploading…' : 'Upload CSV'}
            <input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={upload} />
          </label>
        )}
      </div>
      <p className="muted">
        CSV columns: <code>prn, name, email</code>. The email must be the Google account the student signs in with.
        Uploading again updates names and moves students to this batch.
      </p>
      {batchId && (
        <TableEditor
          key={batchId}
          table="student_roster"
          pk="email"
          order="prn"
          filter={{ column: 'batch_id', value: batchId }}
          columns={[
            { key: 'prn', label: 'PRN', required: true },
            { key: 'full_name', label: 'Name', required: true },
            { key: 'email', label: 'Google email', required: true },
          ]}
        />
      )}
    </div>
  );
}
