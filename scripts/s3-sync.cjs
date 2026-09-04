#!/usr/bin/env node
'use strict';

/**
 * Smarter replacement for `aws s3 cp --recursive`.
 *
 * - Recursively walks the project tree, honoring gitignore-style patterns
 *   (unlike `aws s3 cp --exclude`, these patterns apply recursively at any depth).
 * - Computes an MD5 hash for each local file and compares it against the
 *   existing S3 object's ETag to skip no-op uploads.
 * - Optionally prunes remote objects that no longer exist locally (--prune).
 *
 * Usage:
 *   node scripts/s3-sync.cjs [--prune]
 *
 * Env:
 *   DEPLOY_BUCKET - override target bucket (default: math.cognotik.com)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ignore = require('ignore');
const mime = require('mime-types');
const {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');

const ROOT = path.resolve(__dirname, '..');
const BUCKET = process.env.DEPLOY_BUCKET || 'math.cognotik.com';
const PRUNE = process.argv.includes('--prune');

const ig = ignore().add([
  'node_modules/**',
  'test/**',
  '.pnpm/**',
  'public/**',
  '.lake/**',
  'videos/**',
  'docs/**',
  'scripts/**',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'webpack.config.js',
  '.git/**',
  'android-twa/**',
  'terraform/**',
  'demo/**',
  '.*/**',
  '.*',
  '*.sh',
  'LICENSE',
]);

const s3 = new S3Client({});

function walk(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const relPath = path.posix.join(base, entry.name);
    const checkPath = entry.isDirectory() ? `${relPath}/` : relPath;
    if (ig.ignores(relPath) || ig.ignores(checkPath)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(fullPath, relPath));
    } else if (entry.isFile()) {
      files.push(relPath);
    }
  }
  return files;
}

function md5(filePath) {
  const hash = crypto.createHash('md5');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function listRemoteObjects() {
  const objects = new Map();
  let ContinuationToken;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken,
      })
    );
    for (const obj of res.Contents || []) {
      objects.set(obj.Key, (obj.ETag || '').replace(/"/g, ''));
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return objects;
}

async function upload(key, filePath) {
  const contentType = mime.lookup(filePath) || 'application/octet-stream';
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fs.readFileSync(filePath),
      ContentType: contentType,
    })
  );
  console.log(`uploaded: ${key}`);
}

async function main() {
  const localFiles = walk(ROOT);
  const remoteObjects = await listRemoteObjects();

  let uploaded = 0;
  let skipped = 0;

  for (const relPath of localFiles) {
    const fullPath = path.join(ROOT, relPath);
    const key = relPath.split(path.sep).join('/');
    const localHash = md5(fullPath);
    const remoteHash = remoteObjects.get(key);

    // Note: ETag only matches MD5 for single-part uploads. Since we always
    // upload via PutObject (single part), this comparison is reliable.
    if (remoteHash === localHash) {
      skipped++;
      continue;
    }

    await upload(key, fullPath);
    uploaded++;
  }

  console.log(`Sync complete. uploaded=${uploaded} skipped=${skipped}`);

  if (PRUNE) {
    const localKeys = new Set(localFiles.map((f) => f.split(path.sep).join('/')));
    const toDelete = [...remoteObjects.keys()].filter((k) => !localKeys.has(k));

    if (toDelete.length > 0) {
      console.log(`Pruning ${toDelete.length} stale object(s)...`);
      for (let i = 0; i < toDelete.length; i += 1000) {
        const chunk = toDelete.slice(i, i + 1000);
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: { Objects: chunk.map((Key) => ({ Key })) },
          })
        );
        for (const key of chunk) {
          console.log(`deleted: ${key}`);
        }
      }
    } else {
      console.log('Nothing to prune.');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});