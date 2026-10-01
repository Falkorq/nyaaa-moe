import { getStore } from '@netlify/blobs';
import { handleCertificates } from '../../certificates-api.mjs';

export default async (req) => handleCertificates(req, getStore('nyaaa-certificates', { consistency: 'strong' }));

export const config = {
  path: ['/api/certificates', '/api/certificates/:id', '/api/certificates/progress/:id'],
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
