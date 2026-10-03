import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useFaculty } from '../lib/reference';

/** Tick faculty of one centre (plus shared ones), or add a missing name to that centre. */
export function FacultyPicker({ centreId, value, onChange }: { centreId: string; value: string[]; onChange: (v: string[]) => void }) {
  const queryClient = useQueryClient();
  const faculty = useFaculty(centreId);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  // Names already on the session stay visible even if no longer in the list.
  const names = [...new Set([...(faculty.data?.map((f) => f.name) ?? []), ...value])];
  const shown = names.filter((n) => n.toLowerCase().includes(search.trim().toLowerCase()));
  const toggle = (name: string, on: boolean) => onChange(on ? [...value, name] : value.filter((n) => n !== name));

  const add = async () => {
    const name = newName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const existing = names.find((n) => n.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!value.includes(existing)) toggle(existing, true);
      setNewName('');
      return toast.info(`${existing} is already in the list, ticked.`);
    }
    setAdding(true);
    const { error } = await supabase.from('faculty').insert({ name, centre_id: centreId });
    setAdding(false);
    if (error) {
      return toast.error(
        error.code === '23505' ? `${name} already exists at another centre. Ask the admin to mark them shared.` : error.message,
      );
    }
    toast.success(`${name} added to faculty`);
    setNewName('');
    onChange([...value, name]);
    void queryClient.invalidateQueries({ queryKey: ['faculty'] });
  };

  return (
    <fieldset className="space-y-2">
      <legend className="label">Faculty</legend>
      {names.length > 8 && (
        <input className="input" placeholder="Search faculty" aria-label="Search faculty" value={search} onChange={(e) => setSearch(e.target.value)} />
      )}
      <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-stone-200 p-2 sm:grid-cols-3">
        {faculty.isLoading && <span className="muted">Loading…</span>}
        {shown.map((n) => (
          <label key={n} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value.includes(n)} onChange={(e) => toggle(n, e.target.checked)} />
            {n}
          </label>
        ))}
        {faculty.data && shown.length === 0 && <span className="muted">No match. Add the name below.</span>}
      </div>
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Not in the list? Type full name, e.g. Mr. A. Sharma"
          aria-label="New faculty name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void add();
            }
          }}
        />
        <button type="button" className="btn whitespace-nowrap" disabled={adding || !newName.trim()} onClick={add}>
          Add faculty
        </button>
      </div>
    </fieldset>
  );
}
