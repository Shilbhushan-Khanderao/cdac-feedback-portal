import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { requireStaff } from '../../shared/guards.js';
import { badRequest, mapDbError, notFound } from '../../shared/errors.js';
import { TABLE_CONFIGS } from './configs.js';
import { checkPk, cleanBody } from './schema.js';
import { createRow, deleteRow, listRows, updateRow } from './service.js';

const actorOf = (req: FastifyRequest) => ({ email: req.user!.email, role: req.user!.role, ip: req.ip });

function tableOf(name: string) {
  const cfg = TABLE_CONFIGS[name];
  if (!cfg) throw notFound('Table not found');
  return cfg;
}

export const tablesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireStaff);

  // ---------------------------------------------------------------- List Table Rows
  app.get('/:table', async (req) => {
    const { table } = req.params as { table: string };
    const cfg = tableOf(table);
    try {
      return await listRows(actorOf(req), table, cfg, req.query as Record<string, unknown>);
    } catch (err) {
      throw mapDbError(err);
    }
  });

  // ---------------------------------------------------------------- Create Table Row
  app.post('/:table', async (req, reply) => {
    const { table } = req.params as { table: string };
    const cfg = tableOf(table);

    const data = cleanBody(cfg, req.body);
    if (Object.keys(data).length === 0) throw badRequest('No valid writable fields provided');

    try {
      return reply.status(201).send(await createRow(actorOf(req), table, cfg, data));
    } catch (err) {
      req.log.warn({ err, table }, 'Table insert failed');
      throw mapDbError(err);
    }
  });

  // ---------------------------------------------------------------- Update Table Row
  app.put('/:table/:id', async (req) => {
    const { table, id } = req.params as { table: string; id: string };
    const cfg = tableOf(table);
    checkPk(table, cfg, id);

    const data = cleanBody(cfg, req.body, cfg.pk);
    if (Object.keys(data).length === 0) throw badRequest('No valid fields to update');

    try {
      return await updateRow(actorOf(req), table, cfg, id, data);
    } catch (err) {
      req.log.warn({ err, table, id }, 'Table update failed');
      throw mapDbError(err);
    }
  });

  // ---------------------------------------------------------------- Delete Table Row
  app.delete('/:table/:id', async (req) => {
    const { table, id } = req.params as { table: string; id: string };
    const cfg = tableOf(table);
    checkPk(table, cfg, id);

    try {
      await deleteRow(actorOf(req), table, cfg, id);
      return { ok: true };
    } catch (err) {
      req.log.warn({ err, table, id }, 'Table delete failed');
      throw mapDbError(err);
    }
  });
};
