'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const nodemailer = require('nodemailer');

const PROJECT_ROOT = __dirname;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_UPLOAD_BODY_BYTES = 40 * 1024 * 1024;
const CONSENT_VERSION = '2026-09-29-v1';
const REQUEST_TYPES = new Set(['Cédula de Ciudadanía', 'Cédula de Extranjería']);
const REQUESTED_DOCUMENTS = new Set([
    'Certificado de Estudios',
    'Boletín de Notas',
    'Paz y Salvo',
    'Constancia de Matrícula'
]);
const GALLERY_MAX_FILE_BYTES = 25 * 1024 * 1024;
const GALLERY_MAX_FILES_PER_ALBUM = 10;
const GALLERY_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const GALLERY_FILE_TYPES = {
    fotos: { mimePrefix: 'image/', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'] },
    videos: { mimePrefix: 'video/', extensions: ['mp4', 'mov', 'webm', 'ogg', 'm4v'] },
    documentos: { mimePrefix: '', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'] }
};

function loadEnvFile(filePath = path.join(PROJECT_ROOT, '.env')) {
    if (!fs.existsSync(filePath)) return;

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match || process.env[match[1]] !== undefined) continue;

        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[match[1]] = value;
    }
}

function readConfig(env = process.env) {
    const port = Number(env.PORT || 3000);
    const smtpPort = Number(env.SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('PORT debe ser un número entre 1 y 65535.');
    }
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
        throw new Error('SMTP_PORT debe ser un número entre 1 y 65535.');
    }

    return {
        host: env.HOST || '0.0.0.0',
        port,
        databasePath: path.resolve(PROJECT_ROOT, env.DATABASE_PATH || 'data/document-requests.sqlite'),
        adminEmail: (env.ADMIN_EMAIL || '').trim(),
        adminPassword: (env.ADMIN_PASSWORD || '').trim(),
        smtpHost: (env.SMTP_HOST || '').trim(),
        smtpPort,
        smtpSecure: String(env.SMTP_SECURE || (smtpPort === 465 ? 'true' : 'false')).toLowerCase() === 'true',
        smtpUser: (env.SMTP_USER || '').trim(),
        smtpPassword: env.SMTP_PASS || '',
        mailFrom: (env.MAIL_FROM || env.SMTP_USER || '').trim(),
        corsOrigins: (env.CORS_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean)
    };
}

function createDatabase(databasePath) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    const database = new DatabaseSync(databasePath);
    database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS document_requests (
            id TEXT PRIMARY KEY,
            requester_name TEXT NOT NULL,
            requester_document_type TEXT NOT NULL,
            requester_document_number TEXT NOT NULL,
            requested_document TEXT NOT NULL,
            requester_email TEXT NOT NULL,
            consent_version TEXT NOT NULL,
            consented_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            notification_status TEXT NOT NULL DEFAULT 'pending',
            notification_error_code TEXT
        ) STRICT;
        CREATE INDEX IF NOT EXISTS document_requests_created_at_idx
            ON document_requests(created_at DESC);
        CREATE TABLE IF NOT EXISTS gallery_albums (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            teacher TEXT NOT NULL,
            category TEXT NOT NULL,
            files TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS news (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            date TEXT NOT NULL,
            category TEXT NOT NULL,
            summary TEXT NOT NULL,
            created_at TEXT NOT NULL
        ) STRICT;
    `);
    return database;
}

function mailIsConfigured(config) {
    return Boolean(config.adminEmail && config.smtpHost && config.smtpUser && config.smtpPassword);
}

async function sendEmailNotification(config, request, createTransport = nodemailer.createTransport) {
    if (!mailIsConfigured(config)) return false;

    const transporter = createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        requireTLS: !config.smtpSecure,
        auth: { user: config.smtpUser, pass: config.smtpPassword },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000
    });

    const plainText = [
        'Se recibió una solicitud de documento en el sitio institucional.',
        '',
        `Código: ${request.id}`,
        `Nombre: ${request.name}`,
        `Tipo de documento de identidad: ${request.documentType}`,
        `Número de documento: ${request.documentNumber}`,
        `Documento solicitado: ${request.document}`,
        `Correo para responder: ${request.email}`,
        `Fecha de recepción: ${request.createdAt}`,
        '',
        'Puedes responder directamente a este correo para contactar a la persona solicitante.',
        '',
        `La secretaría debe gestionar la emisión del certificado solicitado: ${request.document}.`,
        'El certificado se enviará al correo del solicitante una vez disponible.'
    ].join('\n');

    await transporter.sendMail({
        from: config.mailFrom,
        to: config.adminEmail,
        replyTo: request.email,
        subject: `Solicitud de documento ${request.id}`,
        text: plainText,
        disableFileAccess: true,
        disableUrlAccess: true
    });
    return true;
}

function jsonResponse(response, statusCode, body) {
    response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
}

function httpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
    const contentType = String(request.headers['content-type'] || '').toLowerCase();
    if (contentType.split(';', 1)[0].trim() !== 'application/json') {
        request.resume();
        return Promise.reject(httpError(415, 'El servidor esperaba datos en formato JSON.'));
    }
    const contentLength = Number(request.headers['content-length'] || 0);
    if (contentLength > maxBytes) {
        request.resume();
        return Promise.reject(httpError(413, 'La solicitud es demasiado grande.'));
    }

    return new Promise((resolve, reject) => {
        const chunks = [];
        let length = 0;
        let finished = false;
        request.on('data', chunk => {
            length += chunk.length;
            if (length > maxBytes) {
                finished = true;
                request.resume();
                reject(httpError(413, 'La solicitud es demasiado grande.'));
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => {
            if (finished) return;
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
                reject(httpError(400, 'El contenido enviado no es JSON válido.'));
            }
        });
        request.on('error', () => reject(httpError(400, 'No se pudo leer la solicitud.')));
    });
}

function normalizeAndValidate(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw httpError(400, 'Completa todos los campos requeridos.');
    }

    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    const documentType = typeof body.documentType === 'string' ? body.documentType.trim() : '';
    const documentNumber = typeof body.documentNumber === 'string' ? body.documentNumber.trim() : '';
    const document = typeof body.document === 'string' ? body.document.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const hasInvalidControls = [name, documentType, documentNumber, document, email]
        .some(value => /[\u0000-\u001f\u007f]/.test(value));

    if (!name || name.length > 120 || hasInvalidControls) {
        throw httpError(400, 'Revisa el nombre del solicitante.');
    }
    if (!REQUEST_TYPES.has(documentType)) {
        throw httpError(400, 'Selecciona un tipo de documento válido.');
    }
    if (!/^[\d. -]{4,30}$/.test(documentNumber)) {
        throw httpError(400, 'Revisa el número de documento.');
    }
    if (!REQUESTED_DOCUMENTS.has(document)) {
        throw httpError(400, 'Selecciona un documento válido.');
    }
    if (email.length > 254 || !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$/i.test(email)) {
        throw httpError(400, 'Escribe un correo electrónico válido.');
    }
    if (body.consent !== true) {
        throw httpError(400, 'Debes aceptar el aviso de privacidad para enviar la solicitud.');
    }

    return { name, documentType, documentNumber, document, email };
}

function backupDatabase(database, databasePath) {
    const backupDir = path.join(path.dirname(databasePath), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `document-requests-${stamp}.sqlite`;
    const target = path.join(backupDir, fileName).replace(/\\/g, '/').replace(/'/g, "''");
    database.exec(`VACUUM INTO '${target}'`);

    const keep = Math.max(1, Number(process.env.BACKUP_KEEP || 7));
    const existing = fs.readdirSync(backupDir)
        .filter(name => /^document-requests-.*\.sqlite$/.test(name))
        .sort();
    while (existing.length > keep) {
        fs.unlinkSync(path.join(backupDir, existing.shift()));
    }
    return fileName;
}

function scheduleDatabaseBackup(database, databasePath) {
    const hours = Number(process.env.BACKUP_INTERVAL_HOURS || 24);
    if (!Number.isFinite(hours) || hours <= 0) return null;
    const run = () => {
        try {
            const name = backupDatabase(database, databasePath);
            console.log(`Respaldo de la base de datos creado: ${name}`);
        } catch (error) {
            console.warn(`No se pudo crear el respaldo: ${error.message}`);
        }
    };
    run();
    const timer = setInterval(run, hours * 60 * 60 * 1000);
    timer.unref();
    return timer;
}

function allowedStaticRelativePath(relativePath) {
    const normalized = relativePath.replace(/\\/g, '/');
    const segments = normalized.split('/');
    if (segments.some(segment => segment === '.' || segment === '..' || segment === '')) return false;
    if (['index.html', 'scripts.js', 'style.css', 'sw.js', 'manifest.webmanifest', 'robots.txt', 'sitemap.xml'].includes(normalized)) return true;
    return normalized.startsWith('img/') || normalized.startsWith('manual convivencia/');
}

function allowedStaticPath(pathname) {
    if (pathname === '/') return true;
    if (!pathname.startsWith('/') || pathname.includes('\\')) return false;
    return allowedStaticRelativePath(pathname.slice(1));
}

const CONTENT_TYPES = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['.gif', 'image/gif'],
    ['.html', 'text/html; charset=utf-8'],
    ['.jpeg', 'image/jpeg'],
    ['.jpg', 'image/jpeg'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.pdf', 'application/pdf'],
    ['.txt', 'text/plain; charset=utf-8'],
    ['.webmanifest', 'application/manifest+json; charset=utf-8'],
    ['.xml', 'application/xml; charset=utf-8'],
    ['.png', 'image/png'],
    ['.svg', 'image/svg+xml'],
    ['.webp', 'image/webp']
]);

const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "worker-src 'self'",
    "frame-src https://www.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
].join('; ');

function setSecurityHeaders(response) {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

async function serveStatic(pathname, response, method = 'GET') {
    if (!allowedStaticPath(pathname)) {
        jsonResponse(response, 404, { error: 'No encontrado.' });
        return;
    }

    const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
    const fullPath = path.resolve(PROJECT_ROOT, relativePath);
    const relativeToRoot = path.relative(PROJECT_ROOT, fullPath);
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot) || !allowedStaticRelativePath(relativeToRoot)) {
        jsonResponse(response, 404, { error: 'No encontrado.' });
        return;
    }

    try {
        const realPath = await fs.promises.realpath(fullPath);
        const realRelative = path.relative(PROJECT_ROOT, realPath);
        if (realRelative.startsWith('..') || path.isAbsolute(realRelative) || !allowedStaticRelativePath(realRelative)) {
            jsonResponse(response, 404, { error: 'No encontrado.' });
            return;
        }
        const fileStat = await fs.promises.stat(realPath);
        if (!fileStat.isFile()) {
            jsonResponse(response, 404, { error: 'No encontrado.' });
            return;
        }
        const contentType = CONTENT_TYPES.get(path.extname(realPath).toLowerCase());
        if (!contentType) {
            jsonResponse(response, 404, { error: 'No encontrado.' });
            return;
        }
        response.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': fileStat.size,
            'Cache-Control': ['.html', '.js', '.css'].includes(path.extname(realPath).toLowerCase())
                ? 'no-cache'
                : 'public, max-age=3600'
        });
        if (method === 'HEAD') response.end();
        else fs.createReadStream(realPath).pipe(response);
    } catch {
        jsonResponse(response, 404, { error: 'No encontrado.' });
    }
}

function createServer(options = {}) {
    const config = options.config || readConfig();
    const database = options.database || createDatabase(options.databasePath || config.databasePath);
    const ownsDatabase = !options.database;
    const sendNotification = options.sendNotification || (request => sendEmailNotification(config, request));
    const rateLimit = options.rateLimit || { maxRequests: 10, windowMs: 15 * 60 * 1000 };
    const adminPassword = options.adminPassword !== undefined ? options.adminPassword : config.adminPassword;
    const adminSessions = new Map();

    const serveApi = options.api !== false;
    const serveStaticFrontend = options.serveStatic !== false;

    function createRateLimiter(limit) {
        const requestCounts = new Map();
        let lastCleanup = Date.now();
        return function isRateLimited(request) {
            const now = Date.now();
            if (now - lastCleanup > limit.windowMs) {
                for (const [ip, entry] of requestCounts) {
                    if (now - entry.startedAt >= limit.windowMs) requestCounts.delete(ip);
                }
                lastCleanup = now;
            }
            const ip = request.socket.remoteAddress || 'unknown';
            let rateEntry = requestCounts.get(ip);
            if (!rateEntry || now - rateEntry.startedAt >= limit.windowMs) {
                rateEntry = { startedAt: now, count: 0 };
                requestCounts.set(ip, rateEntry);
            }
            rateEntry.count += 1;
            return rateEntry.count <= limit.maxRequests;
        };
    }
    const isRateLimited = createRateLimiter(rateLimit);

    function issueAdminToken() {
        const token = crypto.randomUUID();
        adminSessions.set(token, { expiresAt: Date.now() + GALLERY_TOKEN_TTL_MS });
        return token;
    }

    function consumeAdminToken(request) {
        const header = request.headers.authorization || '';
        const parts = header.split(' ');
        const scheme = parts[0];
        const headerToken = parts[1];
        let token = null;
        if (scheme === 'Bearer' && headerToken) {
            token = headerToken;
        } else {
            const cookieHeader = request.headers.cookie || '';
            const cookies = cookieHeader.split(';').map(c => c.trim()).filter(Boolean);
            for (const cookie of cookies) {
                const separator = cookie.indexOf('=');
                if (separator > -1 && cookie.slice(0, separator) === 'admin_token') {
                    token = cookie.slice(separator + 1);
                    break;
                }
            }
        }
        if (!token) return null;
        const session = adminSessions.get(token);
        if (!session) return null;
        if (session.expiresAt < Date.now()) {
            adminSessions.delete(token);
            return null;
        }
        return token;
    }

    function adminPasswordMatches(password) {
        if (!adminPassword) return false;
        const candidate = crypto.createHash('sha256').update(String(password)).digest();
        const expected = crypto.createHash('sha256').update(adminPassword).digest();
        return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
    }

    const server = http.createServer(async (request, response) => {
        setSecurityHeaders(response);

        if (serveApi && config.corsOrigins?.length) {
            const origin = request.headers.origin || '';
            const wildcard = config.corsOrigins.includes('*');
            const allowed = wildcard || config.corsOrigins.includes(origin);
            if (allowed) {
                response.setHeader('Access-Control-Allow-Origin', wildcard ? '*' : origin);
                if (!wildcard) response.setHeader('Access-Control-Allow-Credentials', 'true');
                response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
                response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                response.setHeader('Vary', 'Origin');
            }
            if (request.method === 'OPTIONS') {
                response.writeHead(allowed ? 204 : 403);
                response.end();
                return;
            }
        }

        const requestUrl = new URL(request.url, 'http://localhost');

        let pathname;
        try {
            pathname = decodeURIComponent(requestUrl.pathname);
        } catch {
            jsonResponse(response, 400, { error: 'La dirección solicitada no es válida.' });
            return;
        }

        if (serveApi && pathname === '/health' && request.method === 'GET') {
            jsonResponse(response, 200, { status: 'ok' });
            return;
        }

        if (serveApi && pathname === '/api/document-requests') {
            if (request.method !== 'POST') {
                response.setHeader('Allow', 'POST');
                jsonResponse(response, 405, { error: 'Método no permitido.' });
                return;
            }

            if (!isRateLimited(request)) {
                jsonResponse(response, 429, { error: 'Se recibieron varias solicitudes seguidas. Intenta más tarde.' });
                return;
            }

            try {
                const body = await readJsonBody(request);
                if (typeof body?.website === 'string' && body.website.trim()) {
                    jsonResponse(response, 201, { id: null, emailSent: false, discarded: true });
                    return;
                }
                const values = normalizeAndValidate(body);
                const id = crypto.randomUUID();
                const consentedAt = new Date().toISOString();
                database.prepare(`
                    INSERT INTO document_requests (
                        id, requester_name, requester_document_type, requester_document_number,
                        requested_document, requester_email, consent_version, consented_at,
                        created_at, notification_status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                `).run(
                    id, values.name, values.documentType, values.documentNumber,
                    values.document, values.email, CONSENT_VERSION, consentedAt, consentedAt
                );

                const emailRequest = { id, ...values, createdAt: consentedAt };
                let emailSent = false;
                let errorCode = null;
                try {
                    emailSent = Boolean(await sendNotification(emailRequest));
                } catch (error) {
                    errorCode = typeof error?.code === 'string' ? error.code.slice(0, 40) : 'SMTP_ERROR';
                    console.error('No se pudo enviar el aviso SMTP para la solicitud %s (%s).', id, errorCode);
                }

                database.prepare(`
                    UPDATE document_requests
                    SET notification_status = ?, notification_error_code = ?
                    WHERE id = ?
                `).run(emailSent ? 'sent' : 'failed', errorCode, id);

                jsonResponse(response, 201, { id, emailSent });
            } catch (error) {
                jsonResponse(response, error.statusCode || 500, {
                    error: error.statusCode ? error.message : 'No se pudo guardar la solicitud. Intenta de nuevo.'
                });
            }
            return;
        }

        if (serveApi && pathname === '/api/gallery/auth') {
            if (request.method !== 'POST') {
                response.setHeader('Allow', 'POST');
                jsonResponse(response, 405, { error: 'Método no permitido.' });
                return;
            }
            if (!isRateLimited(request)) {
                jsonResponse(response, 429, { error: 'Se recibieron varias solicitudes seguidas. Intenta más tarde.' });
                return;
            }
            try {
                const body = await readJsonBody(request);
                if (!adminPasswordMatches(body?.password)) {
                    jsonResponse(response, 401, { error: 'La contraseña de administrador es incorrecta.' });
                    return;
                }
                const token = issueAdminToken();
                response.setHeader('Set-Cookie', `admin_token=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${Math.floor(GALLERY_TOKEN_TTL_MS / 1000)};`);
                jsonResponse(response, 200, { token, expiresIn: GALLERY_TOKEN_TTL_MS / 1000 });
            } catch (error) {
                jsonResponse(response, error.statusCode || 500, {
                    error: error.statusCode ? error.message : 'No se pudo procesar la autenticación.'
                });
            }
            return;
        }

        if (serveApi && pathname === '/api/gallery/albums') {
            if (request.method === 'GET') {
                const authToken = consumeAdminToken(request);
                if (!authToken) {
                    jsonResponse(response, 401, { error: 'Se requiere autenticación de administrador.' });
                    return;
                }
                const category = requestUrl.searchParams.get('category');
                const rows = database.prepare('SELECT * FROM gallery_albums ORDER BY created_at DESC').all();
                const albums = rows
                    .filter(row => !category || row.category === category)
                    .map(row => ({
                        id: row.id,
                        title: row.title,
                        teacher: row.teacher,
                        category: row.category,
                        createdAt: row.created_at,
                        files: JSON.parse(row.files || '[]')
                    }));
                jsonResponse(response, 200, { albums });
                return;
            }
            if (request.method === 'POST') {
                const authToken = consumeAdminToken(request);
                if (!authToken) {
                    jsonResponse(response, 401, { error: 'Se requiere autenticación de administrador.' });
                    return;
                }
                try {
                    const body = await readJsonBody(request, MAX_UPLOAD_BODY_BYTES);
                    const album = body?.album;
                    if (!album || typeof album !== 'object' || Array.isArray(album)) {
                        throw httpError(400, 'Los datos del álbum están incompletos.');
                    }
                    const title = typeof album.title === 'string' ? album.title.trim().slice(0, 100) : '';
                    const teacher = typeof album.teacher === 'string' ? album.teacher.trim().slice(0, 80) : '';
                    const category = typeof album.category === 'string' ? album.category : '';
                    if (!title || !teacher || !Object.prototype.hasOwnProperty.call(GALLERY_FILE_TYPES, category)) {
                        throw httpError(400, 'Los datos del álbum están incompletos.');
                    }
                    const files = Array.isArray(body.files) ? body.files : [];
                    if (files.length < 1 || files.length > GALLERY_MAX_FILES_PER_ALBUM) {
                        throw httpError(400, `El álbum debe contener entre 1 y ${GALLERY_MAX_FILES_PER_ALBUM} archivos.`);
                    }
                    const pendingFiles = [];
                    let totalBytes = 0;
                    for (const file of files) {
                        if (!file || typeof file !== 'object') throw httpError(400, 'Cada archivo del álbum es inválido.');
                        const name = typeof file.name === 'string' ? file.name.trim().slice(0, 120) : '';
                        const type = typeof file.type === 'string' ? file.type : '';
                        const base64 = typeof file.base64 === 'string' ? file.base64 : '';
                        if (!name || !type || !base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) {
                            throw httpError(400, 'El archivo está incompleto.');
                        }
                        const buffer = Buffer.from(base64, 'base64');
                        if (buffer.length === 0 || buffer.length > GALLERY_MAX_FILE_BYTES) {
                            throw httpError(400, 'El archivo no es válido o supera el tamaño permitido.');
                        }
                        const extension = name.toLowerCase().split('.').pop() || '';
                        const allowedType = GALLERY_FILE_TYPES[category];
                        const typeAllowed = Boolean(allowedType.mimePrefix) ? type.startsWith(allowedType.mimePrefix) : true;
                        if (!typeAllowed && !allowedType.extensions.includes(extension)) {
                            throw httpError(400, 'El tipo de archivo no está permitido para la categoría seleccionada.');
                        }
                        totalBytes += buffer.length;
                        if (totalBytes > GALLERY_MAX_FILE_BYTES) {
                            throw httpError(400, 'El tamaño total del álbum supera el límite permitido.');
                        }
                        pendingFiles.push({ name, type, size: buffer.length, base64 });
                    }

                    const albumId = crypto.randomUUID();
                    const saveDirectory = path.join(PROJECT_ROOT, 'uploads', albumId);
                    fs.mkdirSync(saveDirectory, { recursive: true });
                    const storedFiles = [];
                    pendingFiles.forEach((file, index) => {
                        const safeName = (file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)) || `archivo-${index + 1}`;
                        const filePath = path.join(saveDirectory, `${index + 1}-${safeName}`);
                        fs.writeFileSync(filePath, Buffer.from(file.base64, 'base64'));
                        storedFiles.push({ name: file.name, type: file.type, size: file.size, path: path.relative(PROJECT_ROOT, filePath) });
                    });
                    database.prepare(`
                        INSERT INTO gallery_albums (id, title, teacher, category, files, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).run(albumId, title, teacher, category, JSON.stringify(storedFiles), new Date().toISOString());

                    jsonResponse(response, 201, {
                        album: { id: albumId, title, teacher, category, createdAt: new Date().toISOString(), files: storedFiles },
                        files: storedFiles
                    });
                    return;
                } catch (error) {
                    jsonResponse(response, error.statusCode || 500, { error: error.statusCode ? error.message : 'No se pudo guardar el álbum.' });
                }
                return;
            }
            response.setHeader('Allow', 'GET, POST');
            jsonResponse(response, 405, { error: 'Método no permitido.' });
            return;
        }

        const galleryFileMatch = serveApi && pathname.match(/^\/api\/gallery\/albums\/([^/]+)\/files\/([^/]+)$/);
        if (galleryFileMatch) {
            if (request.method !== 'GET') {
                response.setHeader('Allow', 'GET');
                jsonResponse(response, 405, { error: 'Método no permitido.' });
                return;
            }
            const authToken = consumeAdminToken(request);
            if (!authToken) {
                jsonResponse(response, 401, { error: 'Se requiere autenticación de administrador.' });
                return;
            }
            const albumId = galleryFileMatch[1];
            const fileName = galleryFileMatch[2];
            const album = database.prepare('SELECT * FROM gallery_albums WHERE id = ?').get(albumId) || null;
            if (!album) {
                jsonResponse(response, 404, { error: 'No encontrado.' });
                return;
            }
            const files = JSON.parse(album.files || '[]');
            const fileEntry = files.find(file => file.name === fileName);
            if (!fileEntry) {
                jsonResponse(response, 404, { error: 'No encontrado.' });
                return;
            }
            const filePath = path.join(PROJECT_ROOT, fileEntry.path);
            const uploadsRoot = path.join(PROJECT_ROOT, 'uploads');
            if (!filePath.startsWith(uploadsRoot + path.sep)) {
                jsonResponse(response, 404, { error: 'No encontrado.' });
                return;
            }
            try {
                const buffer = fs.readFileSync(filePath);
                jsonResponse(response, 200, { name: fileEntry.name, type: fileEntry.type, size: buffer.length, base64: buffer.toString('base64') });
            } catch {
                jsonResponse(response, 404, { error: 'No encontrado.' });
            }
            return;
        }

        if (serveApi && pathname === '/api/gallery/logout') {
            if (request.method !== 'POST') {
                response.setHeader('Allow', 'POST');
                jsonResponse(response, 405, { error: 'Método no permitido.' });
                return;
            }
            const logoutToken = consumeAdminToken(request);
            if (logoutToken) adminSessions.delete(logoutToken);
            response.setHeader('Set-Cookie', 'admin_token=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0;');
            jsonResponse(response, 200, { ok: true });
            return;
        }

        if (serveApi && pathname === '/api/news') {
            if (request.method === 'POST') {
                const authToken = consumeAdminToken(request);
                if (!authToken) {
                    jsonResponse(response, 401, { error: 'Se requiere autenticación de administrador.' });
                    return;
                }
                try {
                    const body = await readJsonBody(request);
                    const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 140) : '';
                    const date = typeof body?.date === 'string' ? body.date.trim() : '';
                    const category = typeof body?.category === 'string' ? body.category.trim() : '';
                    const summary = typeof body?.summary === 'string' ? body.summary.trim().slice(0, 600) : '';
                    if (!title || !date || !summary) {
                        throw httpError(400, 'Los datos de la noticia están incompletos.');
                    }
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
                        throw httpError(400, 'La fecha de la noticia no es válida.');
                    }
                    const createdAt = new Date().toISOString();
                    const newsId = crypto.randomUUID();
                    database.prepare(`
                        INSERT INTO news (id, title, date, category, summary, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).run(newsId, title, date, category, summary, createdAt);
                    jsonResponse(response, 201, { news: { id: newsId, title, date, category, summary, createdAt } });
                    return;
                } catch (error) {
                    jsonResponse(response, error.statusCode || 500, { error: error.statusCode ? error.message : 'No se pudo publicar la noticia.' });
                }
                return;
            }
            if (request.method === 'GET') {
                const authToken = consumeAdminToken(request);
                if (!authToken) {
                    jsonResponse(response, 401, { error: 'Se requiere autenticación de administrador.' });
                    return;
                }
                const rows = database.prepare('SELECT * FROM news ORDER BY created_at DESC').all();
                jsonResponse(response, 200, { news: rows });
                return;
            }
            response.setHeader('Allow', 'GET, POST');
            jsonResponse(response, 405, { error: 'Método no permitido.' });
            return;
        }

        if (serveApi && pathname.startsWith('/api/')) {
            jsonResponse(response, 404, { error: 'No encontrado.' });
            return;
        }
        if (!['GET', 'HEAD'].includes(request.method)) {
            response.setHeader('Allow', 'GET, HEAD');
            jsonResponse(response, 405, { error: 'Método no permitido.' });
            return;
        }
        if (serveStaticFrontend) {
            await serveStatic(pathname, response, request.method);
        } else {
            jsonResponse(response, 404, { error: 'No encontrado.' });
        }
    });

    if (ownsDatabase) server.once('close', () => database.close());
    return server;
}

if (require.main === module) {
    try {
        loadEnvFile();
        const config = readConfig();
        const database = createDatabase(config.databasePath);
        scheduleDatabaseBackup(database, config.databasePath);

        const apiServer = createServer({ config, database, serveStatic: false });
        apiServer.listen(config.port, config.host, () => {
            console.log(`API del sitio disponible en http://localhost:${config.port}`);
            console.log(`Base de datos: ${config.databasePath}`);
            if (!mailIsConfigured(config)) {
                console.warn('Avisos por correo desactivados: completa ADMIN_EMAIL y SMTP_* en .env.');
            }
        });

        const frontendPort = Number(process.env.FRONTEND_PORT || 8080);
        const frontendServer = createServer({
            config: { ...config, port: frontendPort },
            database,
            serveStatic: true,
            api: false
        });
        frontendServer.listen(frontendPort, config.host, () => {
            console.log(`Sitio web disponible en http://localhost:${frontendPort}`);
        });

        let closing = false;
        function shutdown(signal) {
            if (closing) return;
            closing = true;
            console.log(`\nCerrando servidores (${signal})...`);
            let pending = 2;
            const done = () => {
                pending -= 1;
                if (pending !== 0) return;
                try { database.close(); } catch (error) { /* ya cerrada */ }
                process.exit(0);
            };
            apiServer.close(done);
            frontendServer.close(done);
            setTimeout(() => process.exit(0), 5000).unref();
        }
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    CONSENT_VERSION,
    backupDatabase,
    createDatabase,
    createServer,
    mailIsConfigured,
    normalizeAndValidate,
    readConfig,
    sendEmailNotification
};
