import { useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { useMe } from '../auth';
import { api } from '../lib/api';
import { CohortPicker, cohortReady, emptyCohort, type Cohort } from './CohortPicker';
import { TableEditor } from './TableEditor';

const sanitize = (str: string) => str.trim().replace(/^[=+\-@\t\r]+/, '');

export function RosterPage() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [cohort, setCohort] = useState<Cohort>(() => emptyCohort(me));
  const [busy, setBusy] = useState(false);
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
          prn: sanitize(r.prn ?? ''),
          full_name: sanitize(r.full_name ?? r.name ?? ''),
          email: (r.email ?? r.gmail ?? '').trim().toLowerCase(),
          ...filters,
        }));
        const bad = rows.findIndex((r) => !r.prn || !r.full_name || !r.email);
        if (bad >= 0) return toast.error(`Row ${bad + 2}: prn, name and email are all required`);
        setBusy(true);
        try {
          await api.roster.upsert(rows);
          toast.success(`${rows.length} students saved`);
          void queryClient.invalidateQueries({ queryKey: ['student_roster'] });
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
      <div className="card space-y-3">
        <CohortPicker value={cohort} onChange={setCohort} />
        {filters && (
          <label className={`btn ${busy ? 'opacity-50' : ''}`}>
            {busy ? 'Uploading…' : 'Upload CSV'}
            <input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={upload} />
          </label>
        )}
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
