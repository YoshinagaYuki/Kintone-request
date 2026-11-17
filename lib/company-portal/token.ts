import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
export const validPortalToken=(v:string)=>/^[A-Za-z0-9_-]{43}$/.test(v);
export const portalTokenHash=(v:string)=>createHash('sha256').update(v).digest('hex');
function key(secret:string){if(!secret)throw Error('URLの保護設定がありません');return createHash('sha256').update('company-portal:v1:'+secret).digest();}
export function sealPortalToken(token:string,secret:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);const encrypted=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),encrypted].map(b=>b.toString('base64url')).join('.');}
export function openPortalToken(value:string,secret:string){const [iv,tag,body]=value.split('.').map(s=>Buffer.from(s,'base64url'));const decipher=createDecipheriv('aes-256-gcm',key(secret),iv);decipher.setAuthTag(tag);const token=Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8');if(!validPortalToken(token))throw Error('invalid token');return token;}
export function issuePortalToken(secret:string){const token=randomBytes(32).toString('base64url');return{token,hash:portalTokenHash(token),encrypted:sealPortalToken(token,secret)};}
