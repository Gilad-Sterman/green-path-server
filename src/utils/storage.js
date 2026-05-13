import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = 'documents';
const SIGNED_URL_TTL = 60 * 60; // 1 hour in seconds

/**
 * Upload a file buffer to Supabase Storage.
 * Returns the storagePath (stored in DB) — not a URL, since bucket is private.
 * Call getSignedUrl(storagePath) to generate a time-limited download URL.
 */
export const uploadFile = async (buffer, mimeType, storagePath) => {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

  if (error) throw Object.assign(new Error(error.message), { status: 500 });

  return storagePath;
};

/**
 * Generate a signed download URL for a private file.
 * Default TTL is 1 hour.
 */
export const getSignedUrl = async (storagePath, ttlSeconds = SIGNED_URL_TTL) => {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, ttlSeconds);

  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  return data.signedUrl;
};

/**
 * Generate signed URLs for multiple paths in parallel.
 */
export const getSignedUrls = async (storagePaths, ttlSeconds = SIGNED_URL_TTL) => {
  const results = await Promise.all(
    storagePaths.map((p) => getSignedUrl(p, ttlSeconds))
  );
  return results;
};

/**
 * Delete a file from Supabase Storage by its storage path.
 */
export const deleteFile = async (storagePath) => {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) throw Object.assign(new Error(error.message), { status: 500 });
};
