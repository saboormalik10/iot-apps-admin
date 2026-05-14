import { Request, Response } from 'express';
import * as svc from './files.service';

function handleError(res: Response, err: unknown): void {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === 'NOT_FOUND') {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: (err as Error).message } });
    return;
  }
  if (code === 'INVALID_MIME') {
    res.status(415).json({ error: { code: 'INVALID_MIME', message: (err as Error).message } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
}

// ─── NEP Session files ────────────────────────────────────────────────────────

export async function uploadSessionFile(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
      return;
    }
    const { fileType = 'photo', capturedAt } = req.body as { fileType?: string; capturedAt?: string };
    const allowedTypes = ['map', 'photo', 'thumbnail'];
    if (!allowedTypes.includes(fileType)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `fileType must be one of: ${allowedTypes.join(', ')}` } });
      return;
    }
    const result = await svc.uploadSessionFile(
      req.user!.organizationId,
      req.params.id,
      req.file,
      fileType as 'map' | 'photo' | 'thumbnail',
      capturedAt,
    );
    res.status(201).json({ data: result });
  } catch (err) {
    handleError(res, err);
  }
}

export async function listSessionFiles(req: Request, res: Response): Promise<void> {
  try {
    const files = await svc.listSessionFiles(req.user!.organizationId, req.params.id);
    res.json({ data: files });
  } catch (err) {
    handleError(res, err);
  }
}

export async function deleteSessionFile(req: Request, res: Response): Promise<void> {
  try {
    await svc.deleteSessionFile(req.user!.organizationId, req.params.id, req.params.fileId);
    res.status(204).send();
  } catch (err) {
    handleError(res, err);
  }
}

// ─── MET Record pictures ──────────────────────────────────────────────────────

export async function uploadRecordPicture(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
      return;
    }
    const { takenAt } = req.body as { takenAt?: string };
    const result = await svc.uploadRecordPicture(
      req.user!.organizationId,
      req.params.id,
      req.file,
      takenAt,
    );
    res.status(201).json({ data: result });
  } catch (err) {
    handleError(res, err);
  }
}

export async function listRecordPictures(req: Request, res: Response): Promise<void> {
  try {
    const pictures = await svc.listRecordPictures(req.user!.organizationId, req.params.id);
    res.json({ data: pictures });
  } catch (err) {
    handleError(res, err);
  }
}

export async function deleteRecordPicture(req: Request, res: Response): Promise<void> {
  try {
    await svc.deleteRecordPicture(req.user!.organizationId, req.params.id, req.params.pictureId);
    res.status(204).send();
  } catch (err) {
    handleError(res, err);
  }
}
