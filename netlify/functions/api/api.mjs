// Netlify Function v2: ня-API
// роуты берутся из config.path ниже - /api/* обслуживается прямо отсюда
import { handle } from '../../../api.js';

export default async (req) => handle(req);

export const config = {
  path: ['/api/nya', '/api/quote'],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
