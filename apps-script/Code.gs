/**
* PWA Catálogo — Backend con Google Apps Script + Google Sheets.
* - Login con email+password (hash SHA-256) y token tipo JWT (HS256).
* - Listado de productos desde hoja PRODUCTOS.
* - Endpoints CRUD para admin/editor.
* - Soporte de 3 imágenes (IMAGEN_URL, IMAGEN_2, IMAGEN_3) + VIDEO_URL.
* - Endpoints para configuración del sitio (SETTINGS).
* - Endpoint para subir archivos a Google Drive.
*/

// ======= CONFIG =======
const SHEET_ID = '1Sa1qyw-L-otoF30vykLgjQal8_Ji6SsqvS__mB0qD6g'; // Asegúrate que este sea tu ID correcto
const DRIVE_FOLDER_ID = '1JShOs1L2AVTjn6FxFrkCL148tHU1vVng'; // ID de la carpeta de Google Drive
const SECRET   = 'ayleenlopezrodriguez10'; // ideal 32+ chars
const TOKEN_TTL_HOURS = 24;

// ======= ROUTER =======
function doGet(e){
  try {
    const action = (e.parameter.action || '').toLowerCase();
    
    if (action === 'products') {
      let user = null;
      try { user = authenticate(e); } catch(_) {}
      const productos = listProducts(user);
      return jsonOk(productos);
    }

    if (action === 'getsitesettings') {
      return jsonOk(getSiteSettings());
    }

    return jsonErr('Unknown GET action', 400);
  } catch (err) {
    return jsonErr(err && err.message ? err.message : String(err), 500);
  }
}

function doPost(e){
  try {
    const action = (e.parameter.action || '').toLowerCase();
    const body = parseBody(e);

    if (action === 'login') {
      const { email, password } = body || {};
      if (!email || !password) return jsonErr('email/password requeridos', 400);
      const user = findUserByEmail(email);
      if (!user) return jsonErr('Usuario no encontrado', 401);
      if (!verifyPassword(password, user.PASS_HASH)) return jsonErr('Credenciales inválidas', 401);

      const payload = { sub: user.EMAIL, role: user.ROLE || 'viewer', exp: Date.now() + TOKEN_TTL_HOURS * 3600 * 1000 };
      const token = signToken(payload);
      return jsonOk({ token, user: { email: user.EMAIL, role: user.ROLE || 'viewer' } });
    }

    // --- Resto requiere token ---
    const me = authenticate(e);
    const role = String(me.role || '').toLowerCase();
    const canWrite = ['admin','editor'].includes(role);

    if (action === 'upsertproduct') {
      if (!canWrite) return jsonErr('Sin permiso', 403);
      const saved = upsertProduct(body || {});
      return jsonOk(saved);
    }

    if (action === 'deleteproduct') {
      if (!canWrite) return jsonErr('Sin permiso', 403);
      const { id } = body || {};
      if (!id) return jsonErr('ID requerido', 400);
      const ok = deleteProduct(id);
      return jsonOk({ deleted: ok });
    }

    if (action === 'updatesitesettings') {
      if (!canWrite) return jsonErr('Sin permiso', 403);
      const saved = updateSiteSettings(body || {});
      return jsonOk(saved);
    }
    
    if (action === 'uploadfile') {
      if (!canWrite) return jsonErr('Sin permiso', 403);
      if (!DRIVE_FOLDER_ID || DRIVE_FOLDER_ID === '1JShOs1L2AVTjn6FxFrkCL148tHU1vVng') return jsonErr('DRIVE_FOLDER_ID no está configurado en el script.');
      const file = uploadFileToDrive(body);
      return jsonOk({ url: file.url, id: file.id });
    }

    return jsonErr('Unknown POST action', 400);
  } catch (err) {
    return jsonErr(err && err.message ? err.message : String(err), 500);
  }
}

// Función para subir archivos a Drive
function uploadFileToDrive(body) {
  const { fileName, mimeType, data } = body;
  const decodedData = Utilities.base64Decode(data);
  const blob = Utilities.newBlob(decodedData, mimeType, fileName);
  
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const file = folder.createFile(blob);

  file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
  
  const fileId = file.getId();
  // CORRECCIÓN: Este formato de URL es más directo para mostrar imágenes.
  const fileUrl = 'https://drive.google.com/uc?id=' + fileId;
  
  return { url: fileUrl, id: fileId };
}


// ======= AUTH =======
function authenticate(e){
  const qsAuth = (e.parameter.Authorization || e.parameter.authorization || '').toString();
  let token = '';
  if (qsAuth.startsWith('Bearer ')) token = qsAuth.slice(7); else token = qsAuth;

  if (!token) throw new Error('Falta token');
  const payload = verifyToken(token);
  if (payload.exp && Date.now() > payload.exp) throw new Error('Token expirado');
  return { email: payload.sub, role: payload.role };
}

function signToken(payload){
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = o => Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/,'');
  const head = enc(header);
  const body = enc(payload);
  const sigBytes = Utilities.computeHmacSha256Signature(`${head}.${body}`, SECRET);
  const sig = Utilities.base64EncodeWebSafe(sigBytes).replace(/=+$/,'');
  return `${head}.${body}.${sig}`;
}

function verifyToken(token){
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token inválido');
  const [head, body, sig] = parts;
  const sigBytes = Utilities.computeHmacSha256Signature(`${head}.${body}`, SECRET);
  const calcSig = Utilities.base64EncodeWebSafe(sigBytes).replace(/=+$/,'');
  if (sig !== calcSig) throw new Error('Firma inválida');
  return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(body)).getDataAsString());
}

// ======= SHEETS =======
function findUserByEmail(email){
  const sh = getSheet('USERS');
  const rows = getRows(sh);
  const EMAIL = (email || '').toString().trim().toLowerCase();
  for (const r of rows){
    if ((r.EMAIL || '').toString().trim().toLowerCase() === EMAIL) return r;
  }
  return null;
}

function listProducts(user){
  const sh = getSheet('PRODUCTOS');
  const rows = getRows(sh);
  const isAdmin = (user && ['admin', 'editor'].includes((user.role || '').toLowerCase()));
  
  return rows
    .filter(r => isAdmin ? true : (String(r.ACTIVO).toLowerCase() === 'true' || String(r.ACTIVO) === '1'))
    .map(r => {
      return {
        id: r.ID,
        nombre: r.NOMBRE,
        precio: Number(r.PRECIO || 0),
        imagen: (r.IMAGEN_URL || '').toString().trim(),
        imagen2: (r.IMAGEN_2 || '').toString().trim(),
        imagen3: (r.IMAGEN_3 || '').toString().trim(),
        video: (r.VIDEO_URL || '').toString().trim(),
        categoria: r.CATEGORIA,
        stock: Number(r.STOCK || 0),
        descripcion: r.DESCRIPCION,
        activo: (String(r.ACTIVO).toLowerCase() === 'true' || String(r.ACTIVO) === '1'),
        en_oferta: (String(r.EN_OFERTA).toLowerCase() === 'true' || String(r.EN_OFERTA) === '1')
      };
    });
}

function getSiteSettings() {
  const sh = getSheet('SETTINGS');
  const rows = getRows(sh);
  const settings = {};
  rows.forEach(r => {
    if (r.KEY) settings[r.KEY] = r.VALUE;
  });
  return settings;
}

function getSheet(name){
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('No existe hoja: ' + name);
  return sh;
}

function getRows(sh){
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values.shift().map(h => (h || '').toString().trim());
  return values.filter(r => r.join('').trim() !== '').map(r => {
    const obj = {}; headers.forEach((h, i) => obj[h] = r[i]); return obj;
  });
}

// ======= CRUD HELPERS =======
function upsertProduct(data){
  const sh = getSheet('PRODUCTOS');
  
  const payload = {
    ID: (data.id || '').toString().trim(),
    NOMBRE: data.nombre || '',
    PRECIO: Number(data.precio || 0),
    IMAGEN_URL: (data.imagen || '').toString().trim(),
    IMAGEN_2: (data.imagen2 || '').toString().trim(),
    IMAGEN_3: (data.imagen3 || '').toString().trim(),
    VIDEO_URL: (data.video || '').toString().trim(),
    CATEGORIA: data.categoria || '',
    STOCK: Number(data.stock || 0),
    DESCRIPCION: data.descripcion || '',
    ACTIVO: String(data.activo === undefined ? true : data.activo),
    EN_OFERTA: String(data.en_oferta === undefined ? false : data.en_oferta)
  };
  
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const rowValues = headers.map(header => payload[header] !== undefined ? payload[header] : '');

  let rowIndex = findRowById(sh, payload.ID);

  if (rowIndex > -1){
    sh.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);
  } else {
    if (!payload.ID) payload.ID = 'P-' + Math.random().toString(36).slice(2,7).toUpperCase();
    rowValues[headers.indexOf('ID')] = payload.ID; // Asignar el nuevo ID
    sh.appendRow(rowValues);
  }
  return payload;
}

function updateSiteSettings(data) {
  const sh = getSheet('SETTINGS');
  const range = sh.getDataRange();
  const values = range.getValues();
  const headers = values.shift();
  const keyIndex = headers.indexOf('KEY');
  const valueIndex = headers.indexOf('VALUE');

  const newValues = values.map(row => {
    const key = row[keyIndex];
    if (data.hasOwnProperty(key)) {
      row[valueIndex] = data[key];
    }
    return row;
  });

  sh.getRange(2, 1, newValues.length, newValues[0].length).setValues(newValues);
  return getSiteSettings(); // Devuelve la configuración actualizada
}


function deleteProduct(id){
  const sh = getSheet('PRODUCTOS');
  const rowIndex = findRowById(sh, id);
  if (rowIndex > -1){
    sh.deleteRow(rowIndex);
    return true;
  }
  return false;
}

function findRowById(sh, id){
  if (!id) return -1;
  const values = sh.getRange("A:A").getValues();
  for (let i = 1; i < values.length; i++){
    if (String(values[i][0]).trim().toLowerCase() === String(id).trim().toLowerCase()){
      return i + 1; // 1-based index
    }
  }
  return -1;
}

// ======= UTILS =======
function parseBody(e){
  try { return JSON.parse(e.postData && e.postData.contents || '{}'); }
  catch(_){ return {}; }
}
function jsonOk(data){
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data }))
    .setMimeType(ContentService.MimeType.JSON);
}
function jsonErr(message, status){
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: message, status: status || 500 }))
    .setMimeType(ContentService.MimeType.JSON);
}

function hashPassword(plain){
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, plain, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}
function verifyPassword(password, hash){
  return hashPassword(password) === hash;
}

