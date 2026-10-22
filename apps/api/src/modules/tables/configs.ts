export interface TableConfig {
  pk: 'id' | 'email';
  readableColumns: string[];
  writableColumns: string[];
  defaultOrder?: string;
}

export const TABLE_CONFIGS: Record<string, TableConfig> = {
  centres: {
    pk: 'id',
    readableColumns: ['id', 'name', 'kind', 'parent_id'],
    writableColumns: ['name', 'kind', 'parent_id'],
    defaultOrder: 'name ASC',
  },
  courses: {
    pk: 'id',
    readableColumns: ['id', 'code', 'name', 'active'],
    writableColumns: ['code', 'name', 'active'],
    defaultOrder: 'code ASC',
  },
  modules: {
    pk: 'id',
    readableColumns: ['id', 'course_id', 'name', 'short_name', 'sort_order', 'active'],
    writableColumns: ['course_id', 'name', 'short_name', 'sort_order', 'active'],
    defaultOrder: 'sort_order ASC, name ASC',
  },
  batches: {
    pk: 'id',
    readableColumns: ['id', 'label', 'active'],
    writableColumns: ['label', 'active'],
    defaultOrder: 'label DESC',
  },
  faculty: {
    pk: 'id',
    readableColumns: ['id', 'centre_id', 'name', 'active'],
    writableColumns: ['centre_id', 'name', 'active'],
    defaultOrder: 'name ASC',
  },
  staff_roster: {
    pk: 'email',
    readableColumns: ['email', 'full_name', 'role', 'centre_id', 'course_id'],
    writableColumns: ['email', 'full_name', 'role', 'centre_id', 'course_id'],
    defaultOrder: 'full_name ASC',
  },
  student_roster: {
    pk: 'email',
    readableColumns: ['email', 'prn', 'full_name', 'batch_id', 'centre_id', 'course_id'],
    writableColumns: ['email', 'prn', 'full_name', 'batch_id', 'centre_id', 'course_id'],
    defaultOrder: 'prn ASC',
  },
  questions: {
    pk: 'id',
    readableColumns: ['id', 'sort_order', 'text', 'kind', 'options', 'active'],
    writableColumns: ['sort_order', 'text', 'kind', 'options', 'active'],
    defaultOrder: 'sort_order ASC',
  },
  grievance_officers: {
    pk: 'id',
    readableColumns: ['id', 'full_name', 'email', 'active'],
    writableColumns: ['full_name', 'email', 'active'],
    defaultOrder: 'full_name ASC',
  },
};

export const STAFF_WRITABLE = ['faculty', 'student_roster', 'modules'];

/** Row-visibility scope appended to list queries (on top of RLS, which is the real boundary). */
export const LIST_SCOPE: Record<string, string> = {
  student_roster: 'public.can_manage(centre_id, course_id)',
  staff_roster: '(email = public.my_email() OR public.is_my_centre(centre_id))',
};
