// Pure functions: no Wix dependencies. These are unit-tested independently.
export const CONFIG = Object.freeze({
  collection: 'WalletPasses',
  logCollection: 'WalletGenerationLog',
  // Provider currently documents 10/day in llms-full.txt; conservative ceiling.
  dailyLimit: 10,
  providerUrl: 'https://walletmcppass.com/api/passes',
  lockMinutes: 3,
  maxQrLength: 500,
});
export const ERRORS = Object.freeze({
  NOT_FOUND: 'No hemos encontrado ninguna entrada asociada a ese código QR.',
  INVALID: 'Esta entrada no está disponible para generar un pase.',
  LIMIT: 'Servicio temporalmente no disponible. Hemos alcanzado el límite de generaciones gratuitas. Inténtalo de nuevo mañana. Gracias por tu paciencia.',
  BUSY: 'Esta entrada ya se está preparando. Inténtalo de nuevo en unos instantes.',
  GENERIC: 'No hemos podido generar el pase. Vuelve a intentarlo más tarde.',
  BAD_QR: 'No hemos podido identificar un código QR válido en la imagen.',
});
export function extractPassId(qr) {
  if (typeof qr !== 'string' || !qr.trim() || qr.length > CONFIG.maxQrLength) return null;
  const raw = qr.trim();
  // The exact original barcode remains in qrValue. This only looks up an ID.
  // Prefer stored exact qrValue; for existing ticket IDs this is identical.
  return raw;
}
export function isValidRecord(r) {
  return !!r && r.status === 'valid' && !!r.qrValue && !!r.holderName;
}
export function mapPass(r, contactEmail) {
  if (!isValidRecord(r)) throw new Error('INVALID');
  if (!contactEmail || !/^\S+@\S+\.\S+$/.test(contactEmail)) throw new Error('CONTACT_EMAIL');
  const result = {
    style: 'eventTicket',
    organization_name: String(r.organizationName || 'BAZTANGO'),
    description: String(r.eventName || 'BAZTANGO'),
    logo_text: String(r.organizationName || 'BAZTANGO'),
    contact_email: contactEmail,
    x402_ready: false,
    barcode_message: String(r.qrValue),
    barcode_format: 'QR',
    barcode_alt_text: String(r.passId || r.qrValue),
    background_color: String(r.backgroundColor || '#192a42'),
    foreground_color: String(r.foregroundColor || '#ffffff'),
    label_color: String(r.labelColor || '#cbd5e1'),
    primary_fields: [{key:'holder',label:'TITULAR',value:String(r.holderName)}],
    secondary_fields: [
      {key:'passType',label:'MODALIDAD',value:String(r.passType || 'Entrada')},
      {key:'date',label:'FECHAS',value:String(r.dateLabel || '')},
    ].filter(v=>v.value),
    auxiliary_fields: [
      {key:'venue',label:'LUGAR',value:String(r.venue || '')},
      {key:'session',label:'SESIÓN',value:String(r.sessionLabel || '')},
    ].filter(v=>v.value),
    back_fields: [
      {key:'event',label:'EVENTO',value:String(r.eventName || '')},
      {key:'entry',label:'IDENTIFICADOR',value:String(r.passId || r.qrValue)},
      {key:'instructions',label:'ACCESO',value:'Entrada personal. Presenta el QR en el acceso.'},
    ].filter(v=>v.value),
  };
  if(r.relevantDate) result.relevant_date = new Date(r.relevantDate).toISOString();
  return result;
}
export function limitDayUTC(date = new Date()) {return date.toISOString().slice(0,10);}
export function validProviderUrl(str) {
  try {const u = new URL(str);return u.protocol === 'https:' && u.hostname === 'walletmcppass.com' && /^\/download\//.test(u.pathname);} catch {return false;}
}
export function isZip(buffer) {return buffer && buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;}
export function errorResult(code) {return {ok:false,code,message:ERRORS[code] || ERRORS.GENERIC};}
