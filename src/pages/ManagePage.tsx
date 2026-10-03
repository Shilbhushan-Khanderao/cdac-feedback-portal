import { useState } from 'react';
import { useMe } from '../auth';
import { useCentres, useCourses } from '../lib/reference';
import { TableEditor, type Col } from './TableEditor';

type Tab = { id: string; label: string; adminOnly?: boolean; note?: string };
const TABS: Tab[] = [
  { id: 'faculty', label: 'Faculty', note: 'Leave Centre empty to share a faculty member across all centres. CCs see their centre’s faculty plus shared ones.' },
  { id: 'modules', label: 'Modules' },
  { id: 'batches', label: 'Batches', adminOnly: true, note: 'One batch (e.g. Aug 2026) is shared by every centre and course. Create it once.' },
  { id: 'courses', label: 'Courses', adminOnly: true, note: 'Rename freely. Courses in use cannot be deleted: untick Active instead.' },
  { id: 'centres', label: 'Centres', adminOnly: true, note: 'ATCs need a parent C-DAC centre.' },
  { id: 'staff_roster', label: 'Staff', adminOnly: true, note: 'CCs see only their centre. Leave Course empty for all courses at that centre. Admins see everything.' },
  { id: 'questions', label: 'Questions', adminOnly: true, note: 'Changes apply to sessions created after the edit. Options are comma separated.' },
];

export function ManagePage() {
  const me = useMe();
  const tabs = TABS.filter((t) => !t.adminOnly || me.role === 'admin');
  const [tab, setTab] = useState(tabs[0].id);
  const [courseId, setCourseId] = useState('');

  const centres = useCentres();
  const courses = useCourses();
  const centreOpts = centres.data?.map((c) => ({ value: c.id, label: c.name })) ?? [];
  const courseOpts = courses.data?.map((c) => ({ value: c.id, label: c.code })) ?? [];

  const columns: Record<string, Col[]> = {
    batches: [
      { key: 'label', label: 'Batch (e.g. Aug 2026)', required: true },
      { key: 'active', label: 'Active', type: 'bool' },
    ],
    modules: [
      { key: 'sort_order', label: '#', type: 'number' },
      { key: 'name', label: 'Module name', required: true },
      { key: 'short_name', label: 'Short name' },
      { key: 'active', label: 'Active', type: 'bool' },
    ],
    faculty: [
      { key: 'name', label: 'Name', required: true },
      { key: 'centre_id', label: 'Centre (empty = shared)', type: 'select', options: centreOpts },
      { key: 'active', label: 'Active', type: 'bool' },
    ],
    courses: [
      { key: 'code', label: 'Code', required: true },
      { key: 'name', label: 'Full name', required: true },
      { key: 'active', label: 'Active', type: 'bool' },
    ],
    centres: [
      { key: 'name', label: 'Name', required: true },
      { key: 'kind', label: 'Type', type: 'select', required: true, options: [{ value: 'cdac', label: 'C-DAC centre' }, { value: 'atc', label: 'ATC' }] },
      { key: 'parent_id', label: 'Parent centre', type: 'select', options: centreOpts.filter((c) => centres.data?.find((x) => x.id === c.value)?.kind === 'cdac') },
    ],
    staff_roster: [
      { key: 'email', label: 'Google email', required: true },
      { key: 'full_name', label: 'Name', required: true },
      { key: 'role', label: 'Role', type: 'select', required: true, options: [{ value: 'cc', label: 'Course coordinator' }, { value: 'admin', label: 'Admin' }] },
      { key: 'centre_id', label: 'Centre', type: 'select', options: centreOpts },
      { key: 'course_id', label: 'Course', type: 'select', options: courseOpts },
    ],
    questions: [
      { key: 'sort_order', label: '#', type: 'number' },
      { key: 'text', label: 'Question', required: true },
      { key: 'kind', label: 'Type', type: 'select', required: true, options: [{ value: 'choice', label: 'Choice' }, { value: 'text', label: 'Comment' }] },
      { key: 'options', label: 'Options', type: 'list' },
      { key: 'active', label: 'Active', type: 'bool' },
    ],
  };
  const order: Record<string, string> = { batches: 'label', modules: 'sort_order', faculty: 'name', courses: 'code', centres: 'name', staff_roster: 'full_name', questions: 'sort_order' };
  const current = tabs.find((t) => t.id === tab)!;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Setup</h1>
      <div className="flex flex-wrap gap-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === tab}
            className={`btn px-3 py-1.5 ${t.id === tab ? 'btn-primary' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current.note && <p className="muted">{current.note}</p>}

      {tab === 'modules' ? (
        <>
          <select className="input w-auto" aria-label="Course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Select course</option>
            {courseOpts.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {courseId && (
            <TableEditor key={courseId} table="modules" columns={columns.modules} order="sort_order" filters={{ course_id: courseId }} />
          )}
        </>
      ) : (
        <TableEditor key={tab} table={tab} columns={columns[tab]} order={order[tab]} pk={tab === 'staff_roster' ? 'email' : 'id'} />
      )}
    </div>
  );
}
