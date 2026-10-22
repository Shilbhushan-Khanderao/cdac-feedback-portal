import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { adminQuery as query } from './admin-db.js';

describe('Reference Tables & Master Data CRUD Integration Tests', () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let ccCookie: string;
  let studentCookie: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();

    // Login Admin
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email: 'admin@test.local' },
    });
    adminCookie = adminLogin.headers['set-cookie'] as string;

    // Login CC
    const ccLogin = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email: 'cc@test.local' },
    });
    ccCookie = ccLogin.headers['set-cookie'] as string;

    // Login Student
    const studentLogin = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { email: 'student1@test.local' },
    });
    studentCookie = studentLogin.headers['set-cookie'] as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Authenticated users can fetch reference tables (batches, centres, courses, modules)', async () => {
    const endpoints = [
      '/api/reference/batches',
      '/api/reference/centres',
      '/api/reference/courses',
      '/api/reference/modules',
    ];

    for (const url of endpoints) {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { cookie: studentCookie },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    }
  });

  it('2. Students cannot access faculty management or generic table CRUD (403)', async () => {
    const facultyRes = await app.inject({
      method: 'GET',
      url: '/api/reference/faculty',
      headers: { cookie: studentCookie },
    });
    expect(facultyRes.statusCode).toBe(403);

    const tablesRes = await app.inject({
      method: 'GET',
      url: '/api/reference/tables/centres',
      headers: { cookie: studentCookie },
    });
    expect(tablesRes.statusCode).toBe(403);
  });

  it('3. Staff can read and create faculty members', async () => {
    const testFacultyName = `Prof. Test ${Date.now()}`;
    const insertRes = await app.inject({
      method: 'POST',
      url: '/api/reference/faculty',
      headers: { cookie: ccCookie },
      payload: { name: testFacultyName },
    });

    expect(insertRes.statusCode).toBe(201);
    const created = JSON.parse(insertRes.body);
    expect(created.name).toBe(testFacultyName);
    expect(created.id).toBeDefined();

    // Verify duplicate faculty creation returns 409 Conflict
    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/reference/faculty',
      headers: { cookie: ccCookie },
      payload: { name: testFacultyName },
    });
    expect(dupRes.statusCode).toBe(409);

    // Clean up
    await query('DELETE FROM public.faculty WHERE id = $1', [created.id]);
  });

  it('4. Role enforcement: Non-admin staff cannot modify admin-restricted tables (centres, courses, batches)', async () => {
    // CC attempting to insert a course
    const postCourse = await app.inject({
      method: 'POST',
      url: '/api/reference/tables/courses',
      headers: { cookie: ccCookie },
      payload: { code: 'TEST-NEW', name: 'Unauthorized Course Addition' },
    });
    expect(postCourse.statusCode).toBe(403);
    expect(JSON.parse(postCourse.body).error).toContain('Admin access required');

    // CC attempting to modify a centre
    const putCentre = await app.inject({
      method: 'PUT',
      url: '/api/reference/tables/centres/00000000-0000-0000-0000-000000000001',
      headers: { cookie: ccCookie },
      payload: { name: 'Hacked Centre Name' },
    });
    expect(putCentre.statusCode).toBe(403);
  });

  it('5. Admin has full CRUD rights on master tables', async () => {
    const testBatchLabel = `Batch_${Date.now()}`;

    // Admin CREATE
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/reference/tables/batches',
      headers: { cookie: adminCookie },
      payload: { label: testBatchLabel },
    });
    expect(createRes.statusCode).toBe(201);
    const createdBatch = JSON.parse(createRes.body);
    expect(createdBatch.label).toBe(testBatchLabel);

    // Admin READ with query filters
    const readRes = await app.inject({
      method: 'GET',
      url: `/api/reference/tables/batches?label=${testBatchLabel}`,
      headers: { cookie: adminCookie },
    });
    expect(readRes.statusCode).toBe(200);
    const rows = JSON.parse(readRes.body);
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(createdBatch.id);

    // Admin UPDATE
    const updateRes = await app.inject({
      method: 'PUT',
      url: `/api/reference/tables/batches/${createdBatch.id}`,
      headers: { cookie: adminCookie },
      payload: { label: `${testBatchLabel}_Updated` },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(JSON.parse(updateRes.body).label).toBe(`${testBatchLabel}_Updated`);

    // Admin DELETE
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/reference/tables/batches/${createdBatch.id}`,
      headers: { cookie: adminCookie },
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(JSON.parse(deleteRes.body).ok).toBe(true);
  });

  it('5b. Grievance officer (CMP-1): admin-only CRUD, visible to any staff', async () => {
    const email = `grievance.${Date.now()}@test.local`;

    const ccTry = await app.inject({
      method: 'POST',
      url: '/api/reference/tables/grievance_officers',
      headers: { cookie: ccCookie },
      payload: { full_name: 'Should Fail', email },
    });
    expect(ccTry.statusCode).toBe(403);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/reference/tables/grievance_officers',
      headers: { cookie: adminCookie },
      payload: { full_name: 'Grievance Officer', email },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);

    const readAsCc = await app.inject({
      method: 'GET',
      url: '/api/reference/tables/grievance_officers',
      headers: { cookie: ccCookie },
    });
    expect(readAsCc.statusCode).toBe(200);
    expect(JSON.parse(readAsCc.body).some((r: any) => r.id === created.id)).toBe(true);

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/reference/tables/grievance_officers/${created.id}`,
      headers: { cookie: adminCookie },
    });
    expect(delRes.statusCode).toBe(200);
  });

  it('6. SQL Injection & Parameter Tampering defense on dynamic table routes', async () => {
    // Malicious table name
    const badTable = await app.inject({
      method: 'GET',
      url: '/api/reference/tables/users;DROP%20TABLE%20users;--',
      headers: { cookie: adminCookie },
    });
    expect(badTable.statusCode).toBe(404);

    // Malicious order parameter
    const badOrder = await app.inject({
      method: 'GET',
      url: '/api/reference/tables/batches?order=label;SELECT%20pg_sleep(5);--',
      headers: { cookie: adminCookie },
    });
    // Either sanitized or safely handled without delay or syntax crash
    expect(badOrder.statusCode).toBe(200);
  });

  it('7. Course Coordinator Scoping: CC can only add/edit modules for their assigned course', async () => {
    // Fetch course IDs for PGCP-AC (assigned to cc@test.local) and PGCP-AI (unassigned)
    const coursesRes = await app.inject({
      method: 'GET',
      url: '/api/reference/courses',
      headers: { cookie: ccCookie },
    });
    const courses = JSON.parse(coursesRes.body);
    const dacCourse = courses.find((c: any) => c.code === 'PGCP-AC');
    const aiCourse = courses.find((c: any) => c.code === 'PGCP-AI');
    expect(dacCourse).toBeDefined();
    expect(aiCourse).toBeDefined();

    // 1. CC attempting to add a module to an UNASSIGNED course (PGCP-AI) -> 403 Forbidden
    const unauthAdd = await app.inject({
      method: 'POST',
      url: '/api/reference/tables/modules',
      headers: { cookie: ccCookie },
      payload: {
        course_id: aiCourse.id,
        name: 'Unauthorized AI Module',
        short_name: 'UAIM',
        sort_order: 99,
        active: true,
      },
    });
    expect(unauthAdd.statusCode).toBe(403);
    expect(JSON.parse(unauthAdd.body).error).toContain('You can only add modules for your assigned course');

    // 2. CC successfully adding a module to their ASSIGNED course (PGCP-AC) -> 201 Created
    const dynamicShort = `AD_${Math.random().toString(36).substring(2, 6)}`;
    let createdModId: string | null = null;
    try {
      const authAdd = await app.inject({
        method: 'POST',
        url: '/api/reference/tables/modules',
        headers: { cookie: ccCookie },
        payload: {
          course_id: dacCourse.id,
          name: 'Authorized DAC Advanced Elective',
          short_name: dynamicShort,
          sort_order: 99,
          active: true,
        },
      });
      expect(authAdd.statusCode).toBe(201);
      const createdMod = JSON.parse(authAdd.body);
      expect(createdMod.id).toBeDefined();
      createdModId = createdMod.id;

      // 3. CC attempting to edit a module belonging to another course (PGCP-AI module) -> 403 Forbidden
      const aiModRes = await query('SELECT id FROM public.modules WHERE course_id = $1 LIMIT 1', [aiCourse.id]);
      const aiModId = aiModRes.rows[0]?.id;
      if (aiModId) {
        const unauthEdit = await app.inject({
          method: 'PUT',
          url: `/api/reference/tables/modules/${aiModId}`,
          headers: { cookie: ccCookie },
          payload: { name: 'Hacked AI Module Name' },
        });
        expect(unauthEdit.statusCode).toBe(403);
        expect(JSON.parse(unauthEdit.body).error).toContain('You can only edit or delete modules for your assigned course');
      }
    } finally {
      if (createdModId) {
        await query('DELETE FROM public.modules WHERE id = $1', [createdModId]);
      }
    }
  });
});
