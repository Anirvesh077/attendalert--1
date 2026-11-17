import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { badRequest, notFound } from '../errors.js';

const MAX_BYTES = 2 * 1024 * 1024;
const MAGIC = {
  '.pdf': (b) => b.subarray(0, 4).toString('latin1') === '%PDF',
  '.png': (b) => b.subarray(1, 4).toString('latin1') === 'PNG',
  '.jpg': (b) => b[0] === 0xff && b[1] === 0xd8,
  '.jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
};

function storeCertificate(certDir, fileName, base64) {
  const ext = path.extname(String(fileName ?? '')).toLowerCase();
  if (!MAGIC[ext]) throw badRequest('Certificate must be a PDF, PNG or JPG file');
  const cleaned = String(base64 ?? '').replace(/\s+/g, '');
  if (!cleaned || !/^[A-Za-z0-9+/]+=*$/.test(cleaned)) throw badRequest('The certificate upload was not valid');
  const bytes = Buffer.from(cleaned, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_BYTES) throw badRequest('Certificate must be under 2 MB');
  if (!MAGIC[ext](bytes)) throw badRequest('That file does not look like a real ' + ext.slice(1).toUpperCase());

  fs.mkdirSync(certDir, { recursive: true });
  const filePath = path.join(certDir, `${crypto.randomUUID()}${ext}`);
  fs.writeFileSync(filePath, bytes);
  return { fileName: path.basename(String(fileName)).slice(0, 120), filePath };
}

export function approveExemption(db, { recordId, note, fileName, fileData, facultyId, certDir }) {
  const record = db.prepare('SELECT id, status FROM records WHERE id = ?').get(recordId);
  if (!record) throw notFound('Attendance record not found');
  if (record.status !== 'A') throw badRequest('Only an absence can be exempted');
  const cleanNote = String(note ?? '').trim().slice(0, 500);
  const file = storeCertificate(certDir, fileName, fileData);

  db.prepare(
    `INSERT INTO exemptions (record_id, note, file_name, file_path, approved_by) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (record_id) DO UPDATE SET note = excluded.note, file_name = excluded.file_name,
       file_path = excluded.file_path, approved_by = excluded.approved_by`,
  ).run(recordId, cleanNote, file.fileName, file.filePath, facultyId ?? null);
}

export function revokeExemption(db, recordId) {
  const row = db.prepare('SELECT file_path FROM exemptions WHERE record_id = ?').get(recordId);
  if (!row) throw notFound('No exemption on that record');
  db.prepare('DELETE FROM exemptions WHERE record_id = ?').run(recordId);
  if (row.file_path) fs.rm(row.file_path, { force: true }, () => {});
}

export function certificatePath(db, recordId) {
  const row = db.prepare('SELECT file_name, file_path FROM exemptions WHERE record_id = ?').get(recordId);
  if (!row?.file_path || !fs.existsSync(row.file_path)) throw notFound('No certificate on file');
  return { filePath: row.file_path, fileName: row.file_name };
}
