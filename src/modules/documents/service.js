import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { listDocuments, getDocumentById, insertDocument, updateDocumentById } from './queries.js';
import { uploadFile, getSignedUrl, getSignedUrls } from '../../utils/storage.js';
import { analyzeDocument as runOcr } from '../../services/ocr.js';

const ALLOWED_TYPES = ['delivery_note', 'invoice_in', 'invoice_out', 'lab_test', 'retro_invoice', 'other'];
const ALLOWED_MIME  = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES     = 30 * 1024 * 1024; // 30 MB

const notFound   = (msg = 'Document not found.') => Object.assign(new Error(msg), { status: 404 });
const badReq     = (msg)                          => Object.assign(new Error(msg), { status: 400 });

const resolveFactoryId = (reqUser, queryFactoryId) => {
  if (reqUser.role === 'internal_admin') return queryFactoryId || undefined;
  return reqUser.factory_id;
};

const assertFactoryAccess = (reqUser, doc) => {
  if (reqUser.role !== 'internal_admin' && doc.factory_id !== reqUser.factory_id) {
    throw notFound();
  }
};

export const getDocuments = async (reqUser, query) => {
  const {
    document_type, status, ocr_status,
    related_entity_type, related_entity_id,
    uploader_id, limit, offset, factory_id: qFactory,
  } = query;

  const docs = await listDocuments({
    factory_id:          resolveFactoryId(reqUser, qFactory),
    uploader_id:         uploader_id         || undefined,
    document_type:       document_type       || undefined,
    status:              status              || undefined,
    ocr_status:          ocr_status          || undefined,
    related_entity_type: related_entity_type || undefined,
    related_entity_id:   related_entity_id   || undefined,
    limit:               Math.min(parseInt(limit) || 50, 200),
    offset:              parseInt(offset) || 0,
  });

  if (docs.length === 0) return docs;
  const signedUrls = await getSignedUrls(docs.map((d) => d.file_url));
  return docs.map((d, i) => ({ ...d, signed_url: signedUrls[i] }));
};

export const getDocument = async (reqUser, id) => {
  const doc = await getDocumentById(id);
  if (!doc) throw notFound();
  assertFactoryAccess(reqUser, doc);
  const signed_url = await getSignedUrl(doc.file_url);
  return { ...doc, signed_url };
};

export const uploadDocument = async (reqUser, body, file) => {
  if (!file) throw badReq('No file provided.');
  if (file.size > MAX_BYTES) throw badReq('File exceeds maximum size of 30 MB.');
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    throw badReq(`Unsupported file type. Allowed: ${ALLOWED_MIME.join(', ')}`);
  }

  const { document_type, related_entity_type, related_entity_id, capture_method, location_status } = body;
  if (!document_type || !ALLOWED_TYPES.includes(document_type)) {
    throw badReq(`document_type must be one of: ${ALLOWED_TYPES.join(', ')}`);
  }

  const factory_id = reqUser.role === 'internal_admin'
    ? (body.factory_id || (() => { throw badReq('factory_id is required for internal_admin.'); })())
    : reqUser.factory_id;

  const ext         = path.extname(file.originalname) || '';
  const storagePath = `${factory_id}/${document_type}/${uuidv4()}${ext}`;
  const file_url    = await uploadFile(file.buffer, file.mimetype, storagePath); // stores path, not URL

  return insertDocument({
    factory_id,
    uploader_id:         reqUser.user_id,
    document_type,
    file_url,
    file_name:           file.originalname,
    related_entity_type: related_entity_type || null,
    related_entity_id:   related_entity_id   || null,
    capture_method:      capture_method      || null,
    location_status:     location_status     || null,
  });
};

export const approveDocument = async (reqUser, id, body) => {
  const doc = await getDocumentById(id);
  if (!doc) throw notFound();
  assertFactoryAccess(reqUser, doc);
  if (doc.status === 'approved') throw badReq('Document is already approved.');

  return updateDocumentById(id, {
    status:      'approved',
    review_note: body.review_note || null,
  });
};

export const analyzeDocumentOnly = async (file) => {
  if (!file) throw badReq('No file provided.');
  if (file.size > MAX_BYTES) throw badReq('File exceeds maximum size of 30 MB.');
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    throw badReq(`Unsupported file type. Allowed: ${ALLOWED_MIME.join(', ')}`);
  }
  return runOcr(file.buffer, file.mimetype);
};

export const rejectDocument = async (reqUser, id, body) => {
  const doc = await getDocumentById(id);
  if (!doc) throw notFound();
  assertFactoryAccess(reqUser, doc);
  if (doc.status === 'rejected') throw badReq('Document is already rejected.');

  return updateDocumentById(id, {
    status:      'rejected',
    review_note: body.review_note || null,
  });
};
