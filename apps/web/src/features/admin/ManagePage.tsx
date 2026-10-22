import { useState } from 'react';
import { useMe } from '../../app/auth';
import { useCentres, useCourses } from '../../shared/reference';
import { TableEditor, type Col } from '../../shared/TableEditor';

type Tab = { id: string; label: string; adminOnly?: boolean; note?: string };
const TABS: Tab[] = [
  { id: 'faculty', label: 'Faculty', note: 'Leave Centre empty to share a faculty member across all centres. CCs see their centre’s faculty plus shared ones.' },
  { id: 'modules', label: 'Modules' },
  { id: 'batches', label: 'Batches', adminOnly: true, note: 'One batch (e.g. Aug 2026) is shared by every centre and course. Create it once.' },
  { id: 'courses', label: 'Courses', adminOnly: true, note: 'Rename freely. Courses in use cannot be deleted: untick Active instead.' },
  { id: 'centres', label: 'Centres', adminOnly: true, note: 'ATCs need a parent C-DAC centre.' },
  { id: 'staff_roster', label: 'Staff', adminOnly: true, note: 'CCs see only their centre. Leave Course empty for all courses at that centre. Admins see everything.' },
  { id: 'questions', label: 'Questions', adminOnly: true, note: 'Changes apply to sessions created after the edit. Options are comma separated.' },
  { id: 'grievance_officers', label: 'Grievance Officer', adminOnly: true, note: 'Person responsible for data-principal/grievance requests under DPDP. Shown to staff; not a login.' },
];

export function ManagePage() {
  const me = useMe();
  const tabs = TABS.filter((t) => !t.adminOnly || me.role === 'admin');
  const [tab, setTab] = useState(tabs[0].id);
  const [courseId, setCourseId] = useState<string>(() => (me.role === 'cc' && me.course_id ? me.course_id : ''));

  const centres = useCentres();
  const courses = useCourses();
  
  // Scoped centre options: CC can only select their own centre or leave empty for shared
  const centreOpts = (centres.data ?? [])
    .filter((c) => me.role === 'admin' || !me.centre_id || c.id === me.centre_id)
    .map((c) => ({ value: c.id, label: c.name }));

  // Scoped course options: CC assigned to a course can only manage that course
  const courseOpts = (courses.data ?? [])
    .filter((c) => me.role === 'admin' || !me.course_id || c.id === me.course_id)
    .map((c) => ({ value: c.id, label: c.code }));

  const activeCourseId = me.role === 'cc' && me.course_id ? me.course_id : courseId;

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
    grievance_officers: [
      { key: 'full_name', label: 'Name', required: true },
      { key: 'email', label: 'Email', required: true },
      { key: 'active', label: 'Active', type: 'bool' },
    ],
  };
  const order: Record<string, string> = { batches: 'label', modules: 'sort_order', faculty: 'name', courses: 'code', centres: 'name', staff_roster: 'full_name', questions: 'sort_order', grievance_officers: 'full_name' };
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  return (
    <div className="space-y-4">
      <h1 className="page-title">{me.role === 'admin' ? 'System Setup' : 'Course & Faculty Setup'}</h1>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Setup sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-controls="tabpanel"
            aria-selected={t.id === tab}
            className={`btn px-3 py-1.5 ${t.id === tab ? 'btn-primary' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${current.id}`} className="space-y-4">
      {current.note && <p className="muted">{current.note}</p>}

      {tab === 'modules' ? (
        <>
          {me.role === 'cc' && me.course_id ? (
            <div className="flex items-center gap-2 py-1">
              <span className="text-sm font-medium text-stone-700">Course:</span>
              <span className="rounded-md bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800 border border-brand-200">
                {courses.data?.find((c) => c.id === me.course_id)?.code ?? 'Assigned Course'}
              </span>
              <span className="text-xs text-stone-500">(Modules scoped to your assigned course)</span>
            </div>
          ) : (
            <select className="input w-auto" aria-label="Course" value={activeCourseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">Select course</option>
              {courseOpts.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
          {activeCourseId && (
            <TableEditor key={activeCourseId} table="modules" columns={columns.modules} order="sort_order" filters={{ course_id: activeCourseId }} />
          )}
        </>
      ) : (
        <TableEditor key={tab} table={tab} columns={columns[tab]} order={order[tab]} pk={tab === 'staff_roster' ? 'email' : 'id'} />
      )}
      </div>
    </div>
  );
}
