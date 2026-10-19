import { useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { useMe } from '../auth';
import { api } from '../lib/api';
import { CohortPicker, cohortReady, emptyCohort, type Cohort } from './CohortPicker';
import { TableEditor } from './TableEditor';

// Import keeps names as typed; formula-injection is guarded when CSV is exported (aggregate.ts).
const CHUNK = 200;

export function RosterPage() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [cohort, setCohort] = useState<Cohort>(() => emptyCohort(me));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const filters = cohortReady(cohort)
    ? { batch_id: cohort.batch_id, centre_id: cohort.centre_ids[0], course_id: cohort.course_id }
    : null;

  const upload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !filters) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
      complete: async ({ data }) => {
        const rows = data.map((r) => ({
          prn: (r.prn ?? '').trim(),
          full_name: (r.full_name ?? r.name ?? '').trim(),
          email: (r.email ?? r.gmail ?? '').trim().toLowerCase(),
          ...filters,
        }));
        const bad = rows.findIndex((r) => !r.prn || !r.full_name || !r.email);
        if (bad >= 0) return toast.error(`Row ${bad + 2}: prn, name and email are all required`);
        setBusy(true);
        const failed: string[] = [];
        let saved = 0;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const chunk = rows.slice(i, i + CHUNK);
          setProgress(`Uploading ${Math.min(i + CHUNK, rows.length)} of ${rows.length}…`);
          try {
            await api.roster.upsert(chunk);
            saved += chunk.length;
          } catch (err) {
            failed.push(`rows ${i + 2}-${i + chunk.length + 1}: ${(err as Error).message}`);
          }
        }
        setBusy(false);
        setProgress('');
        if (saved) void queryClient.invalidateQueries({ queryKey: ['student_roster'] });
        if (failed.length) toast.error(`${saved} of ${rows.length} students saved. Failed: ${failed.join('; ')}. Fix and upload again (safe to repeat).`, { duration: 15000 });
        else toast.success(`${saved} students saved`);
      },
    });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Students</h1>
      <div className="card space-y-3">
        <CohortPicker value={cohort} onChange={setCohort} />
        {filters && (
          <label className={`btn ${busy ? 'opacity-50' : ''}`}>
            {busy ? progress || 'Uploading…' : 'Upload CSV'}
            <input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={upload} />
          </label>
        )}
        <p className="sr-only" role="status" aria-live="polite">{progress}</p>
        <p className="muted">
          CSV columns: <code>prn, name, email</code>. The email must be the Google account the student signs in with.
          Uploading again updates names and moves students to the selected batch, centre and course.
        </p>
      </div>
      {filters && (
        <TableEditor
          key={Object.values(filters).join()}
          table="student_roster"
          pk="email"
          order="prn"
          filters={filters}
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
