import crypto from 'crypto';

export const generateQrToken = () => crypto.randomBytes(24).toString('hex');
