/**
 * Synthetic Node AES-256-GCM fixture in exactly the original legacy format.
 * No real CopNet password or production key is included.
 */
import {createCipheriv} from 'node:crypto';
const key=process.env.COPNET_ENCRYPTION_KEY;
if(!/^[a-f0-9]{64}$/i.test(key||''))throw Error('Synthetic COPNET_ENCRYPTION_KEY missing');
const iv=Buffer.from([1,2,3,4,5,6,7,8,9,10,11,12]);
const plain='synthetic-CopNet-Übung-1234';
const cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
const ct=Buffer.concat([cipher.update(plain,'utf8'),cipher.final()]);
const vector=[iv.toString('base64'),cipher.getAuthTag().toString('base64'),ct.toString('base64')].join('.');
process.stdout.write(vector);
