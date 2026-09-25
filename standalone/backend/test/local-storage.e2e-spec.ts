import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Local-disk storage, which replaced Cloudinary for the standalone.
 *
 * The data folder is pointed at a throwaway temp directory, so these tests never
 * touch a real install.
 */
const TMP = path.join(os.tmpdir(), `observator-storage-${process.pid}-${Date.now()}`);
process.env.STANDALONE_DATA_DIR = TMP;

// Imported after the env var is set: the module reads it on each call, but this
// keeps the intent obvious.
// eslint-disable-next-line import/first
import { uploadFile, deleteFile, getFileUrl } from '../src/utils/storage.util';

// A minimal valid PNG — the upload path checks magic bytes, not the declared type.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);

afterAll(async () => {
  await fs.rm(TMP, { recursive: true, force: true });
});

describe('local-disk storage', () => {
  it('writes the file under the data folder', async () => {
    const f = await uploadFile('branding/org1', 'logo.png', PNG, 'image/png');
    const onDisk = await fs.readFile(path.join(TMP, 'uploads', f.storageKey));
    expect(onDisk.equals(PNG)).toBe(true);
    expect(f.sizeBytes).toBe(PNG.length);
    expect(f.resourceType).toBe('image');
  });

  it('returns a URL relative to the web app, never an absolute API address', async () => {
    /**
     * The browser reaches the API only through the web app's `/api/*` proxy. An
     * absolute `http://localhost:3200/...` would work on the PC itself and break
     * for everyone opening the portal from another machine on the network.
     */
    const f = await uploadFile('branding/org1', 'logo.png', PNG, 'image/png');
    expect(f.url.startsWith('/api/uploads/')).toBe(true);
    expect(f.url).not.toMatch(/localhost|https?:/);
  });

  it('uses forward slashes in the key, so a Windows-written key is still a URL path', async () => {
    const f = await uploadFile('branding/org1', 'logo.png', PNG, 'image/png');
    expect(f.storageKey).not.toContain('\\');
    expect(f.storageKey.startsWith('branding/org1/')).toBe(true);
  });

  it('sanitises the original filename', async () => {
    const f = await uploadFile('branding/org1', 'my logo (final)!.png', PNG, 'image/png');
    expect(path.basename(f.storageKey)).toMatch(/^\d+_my_logo__final__\.png$/);
  });

  it('rejects content whose magic bytes do not match an allowed type', async () => {
    // Declaring image/png does not make an executable one.
    const fake = Buffer.from('MZ\x90\x00this is not an image');
    await expect(uploadFile('branding/org1', 'logo.png', fake, 'image/png')).rejects.toMatchObject({
      code: 'INVALID_MIME',
    });
  });

  it('deletes a stored file', async () => {
    const f = await uploadFile('branding/org1', 'gone.png', PNG, 'image/png');
    await deleteFile(f.storageKey);
    await expect(fs.access(path.join(TMP, 'uploads', f.storageKey))).rejects.toThrow();
  });

  it('treats deleting a missing file as a no-op', async () => {
    await expect(deleteFile('branding/org1/never-existed.png')).resolves.toBeUndefined();
  });

  it('refuses a key that escapes the uploads folder', async () => {
    /**
     * A delete is best-effort and swallows errors, so the proof is that the
     * file OUTSIDE the uploads folder survives — not that an error surfaced.
     */
    const outside = path.join(TMP, 'outside.txt');
    await fs.mkdir(TMP, { recursive: true });
    await fs.writeFile(outside, 'keep me');
    await deleteFile('../outside.txt');
    await expect(fs.readFile(outside, 'utf8')).resolves.toBe('keep me');
  });

  it('encodes each path segment in the URL', () => {
    expect(getFileUrl('branding/org 1/a b.png')).toBe('/api/uploads/branding/org%201/a%20b.png');
  });
});
