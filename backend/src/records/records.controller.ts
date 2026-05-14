import { Request, Response } from 'express';
import * as svc from './records.service';

export async function listRecords(req: Request, res: Response): Promise<void> {
  try {
    const { deviceId, from, to, page, limit } = req.query as Record<string, string | undefined>;
    const result = await svc.listRecords({
      organizationId: req.user!.organizationId,
      deviceId,
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 100) : 20,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
}

export async function createRecord(req: Request, res: Response): Promise<void> {
  try {
    const record = await svc.createRecord(
      req.user!.organizationId,
      req.body,
      { userId: req.user!.userId, email: req.user!.email ?? '' },
    );
    res.status(201).json({ data: record });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: (err as Error).message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
}

export async function getRecord(req: Request, res: Response): Promise<void> {
  try {
    const record = await svc.getRecord(req.user!.organizationId, req.params.id);
    res.json({ data: record });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: (err as Error).message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
}

export async function updateRecord(req: Request, res: Response): Promise<void> {
  try {
    const record = await svc.updateRecord(req.user!.organizationId, req.params.id, req.body);
    res.json({ data: record });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: (err as Error).message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
}

export async function deleteRecord(req: Request, res: Response): Promise<void> {
  try {
    await svc.deleteRecord(
      req.user!.organizationId,
      req.params.id,
      { userId: req.user!.userId, email: req.user!.email ?? '' },
    );
    res.status(204).send();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: (err as Error).message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
}

export async function getMeasures(req: Request, res: Response): Promise<void> {
  try {
    const { page, limit } = req.query as Record<string, string | undefined>;
    const result = await svc.getMeasures({
      organizationId: req.user!.organizationId,
      recordId: req.params.id,
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 5000) : 1000,
    });
    res.json(result);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: (err as Error).message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
}

export async function bulkInsertMeasures(req: Request, res: Response): Promise<void> {
  try {
    const { measures } = req.body as { measures: svc.MeasureInput[] };
    const result = await svc.bulkInsertMeasures(
      req.user!.organizationId,
      req.params.id,
      measures,
    );
    res.status(201).json({ data: result });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: (err as Error).message } });
      return;
    }
    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: (err as Error).message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
}

export async function exportCsv(req: Request, res: Response): Promise<void> {
  try {
    const csv = await svc.exportRecordCsv(req.user!.organizationId, req.params.id);
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="MET-Link-${dateStr}.csv"`);
    res.send(csv);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: (err as Error).message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
}
