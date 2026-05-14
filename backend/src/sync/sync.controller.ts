import { Request, Response } from 'express';
import * as svc from './sync.service';

export async function getSyncStatus(req: Request, res: Response): Promise<void> {
  try {
    const { deviceId } = req.query as { deviceId?: string };
    const result = await svc.getSyncStatus(req.user!.organizationId, deviceId);
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
}

export async function syncUpload(req: Request, res: Response): Promise<void> {
  try {
    const result = await svc.syncUpload(req.user!.organizationId, req.body);
    res.status(201).json({ data: result });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: (err as Error).message } });
      return;
    }
    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: (err as Error).message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
}

export async function syncDownload(req: Request, res: Response): Promise<void> {
  try {
    const { deviceId, since } = req.query as { deviceId?: string; since?: string };
    if (!deviceId) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'deviceId query param is required' } });
      return;
    }
    const result = await svc.syncDownload(
      req.user!.organizationId,
      deviceId,
      since ? Number(since) : undefined,
    );
    res.json({ data: result });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: (err as Error).message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
}
