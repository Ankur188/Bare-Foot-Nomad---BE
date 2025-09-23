// verify-netlify-signed.js
import jwt from 'jsonwebtoken';

export function verifyNetlifySigned(req, res, next) {
if (process.env.USE_NETLIFY_SIGNATURE !== 'true') {
    return next();
  }
  const sig = req.header('x-nf-sign');
  console.log('sign', sig)
  console.log('sign true', sig === process.env.API_SIGNATURE_TOKEN)
  if (!sig) return res.status(403).json({ error: 'Missing Netlify signature' });

  try {
    // NOTE: the token is a JWS signed with your API_SIGNATURE_TOKEN (HS256)
    const payload = jwt.verify(sig, process.env.API_SIGNATURE_TOKEN, { algorithms: ['HS256'] });

    // optional: sanity checks on payload:
    // payload.iss === 'netlify' and payload.site_url === 'https://<your-site>.netlify.app'
    // and check exp timestamp:
    console.log('try', payload)
    if (!payload || payload.iss !== 'netlify') {
      return res.status(403).json({ error: 'Invalid signature issuer' });
    }

    // pass through
    next();
  } catch (err) {
    console.error('Netlify signature verification failed:', err.message);
    return res.status(403).json({ error: 'Invalid Netlify signature' });
  }
}
