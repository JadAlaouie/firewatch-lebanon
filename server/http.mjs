import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';
import { rootCertificates } from 'node:tls';

let cachedCaPath;
let cachedCa;

function configuredCa() {
  const caPath = process.env.FIRMS_CA_CERT?.trim();
  if (!caPath) return undefined;
  if (caPath !== cachedCaPath) {
    cachedCaPath = caPath;
    cachedCa = [...rootCertificates, readFileSync(resolve(process.cwd(), caPath), 'utf8')];
  }
  return cachedCa;
}

export function getBuffer(url, options = {}) {
  const { signal, headers = {}, maxBytes = 20_000_000 } = options;
  return new Promise((resolveRequest, reject) => {
    const request = httpsRequest(url, {
      ca: configuredCa(),
      headers: {
        'user-agent': 'Firewatch-Lebanon/0.2',
        ...headers,
      },
      signal,
    }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy(new Error(`Upstream response exceeded ${Math.round(maxBytes / 1_000_000)} MB`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolveRequest({
        ok: response.statusCode >= 200 && response.statusCode < 300,
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks, size),
      }));
    });
    request.on('error', reject);
    request.end();
  });
}

export async function getText(url, options = {}) {
  const response = await getBuffer(url, options);
  return { ...response, body: response.body.toString('utf8') };
}
