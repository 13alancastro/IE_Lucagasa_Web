'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { backupDatabase, createDatabase, createServer, sendEmailNotification } = require('../server');

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'solicitudes-ie-'));
const databasePath = path.join(tempDirectory, 'requests.sqlite');
const database = createDatabase(databasePath);
const server = createServer({
    database,
    config: {},
    sendNotification: async () => false,
    rateLimit: { maxRequests: 100, windowMs: 60000 }
});
let baseUrl;

before(async () => {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise(resolve => server.close(resolve));
    database.close();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
});

const validRequest = {
    name: '  Ana   Pérez ',
    documentType: 'Cédula de Ciudadanía',
    documentNumber: '12345678',
    document: 'Certificado de Estudios',
    email: 'ANA@example.com',
    consent: true,
    website: ''
};

test('sirve la página y evita exponer archivos del servidor', async () => {
    const home = await fetch(baseUrl);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Solicitud de Documentos/);

    for (const privatePath of ['/server.js', '/.env.example', '/data/requests.sqlite', '/img/%2e%2e%5cserver.js']) {
        const secret = await fetch(`${baseUrl}${privatePath}`);
        assert.equal(secret.status, 404, `${privatePath} debe permanecer privado`);
    }
});

test('guarda una solicitud válida y registra el consentimiento aunque SMTP no esté configurado', async () => {
    const response = await fetch(`${baseUrl}/api/document-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest)
    });
    const result = await response.json();
    assert.equal(response.status, 201);
    assert.equal(result.emailSent, false);
    assert.match(result.id, /^[0-9a-f-]{36}$/i);

    const row = database.prepare('SELECT * FROM document_requests WHERE id = ?').get(result.id);
    assert.equal(row.requester_name, 'Ana Pérez');
    assert.equal(row.requester_email, 'ana@example.com');
    assert.equal(row.requester_document_number, '12345678');
    assert.equal(row.consent_version, '2026-09-29-v1');
    assert.equal(row.notification_status, 'failed');
});

test('rechaza la solicitud si falta el consentimiento y no guarda datos', async () => {
    const response = await fetch(`${baseUrl}/api/document-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validRequest, consent: false })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /privacidad/i);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM document_requests').get().count, 1);
});

test('valida los valores permitidos y el formato del correo', async () => {
    for (const change of [
        { document: 'Documento no permitido' },
        { documentNumber: '123' },
        { email: 'correo-inválido' },
        { documentType: 'Tarjeta de Identidad' }
    ]) {
        const response = await fetch(`${baseUrl}/api/document-requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...validRequest, ...change })
        });
        assert.equal(response.status, 400);
    }
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM document_requests').get().count, 1);
});

test('ignora el señuelo automático sin guardar la solicitud', async () => {
    const response = await fetch(`${baseUrl}/api/document-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validRequest, website: 'bot' })
    });
    assert.equal(response.status, 201);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM document_requests').get().count, 1);
});

test('prepara el aviso SMTP para responder directamente a quien hizo la solicitud', async () => {
    let transportOptions;
    let outgoingMessage;
    const sent = await sendEmailNotification({
        adminEmail: 'secretaria@example.edu.co',
        smtpHost: 'smtp.example.edu.co',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: 'sitio@example.edu.co',
        smtpPassword: 'test-only',
        mailFrom: 'sitio@example.edu.co'
    }, {
        id: 'request-123',
        name: 'Ana Pérez',
        documentType: 'Cédula de Ciudadanía',
        documentNumber: '12345678',
        document: 'Certificado de Estudios',
        email: 'ana@example.com',
        createdAt: '2026-09-29T12:00:00.000Z'
    }, options => {
        transportOptions = options;
        return { sendMail: async message => { outgoingMessage = message; } };
    });

    assert.equal(sent, true);
    assert.equal(transportOptions.host, 'smtp.example.edu.co');
    assert.equal(transportOptions.requireTLS, true);
    assert.equal(outgoingMessage.to, 'secretaria@example.edu.co');
    assert.equal(outgoingMessage.replyTo, 'ana@example.com');
    assert.match(outgoingMessage.text, /12345678/);
});

test('expone cabeceras de seguridad y protege contra clickjacking y MIME sniffing', async () => {
    const home = await fetch(baseUrl);
    assert.equal(home.status, 200);
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    assert.equal(home.headers.get('referrer-policy'), 'same-origin');
    assert.ok(home.headers.get('content-security-policy'));
    assert.ok(home.headers.get('content-security-policy').includes("default-src 'self'"));
    assert.ok(home.headers.get('content-security-policy').includes("worker-src 'self'"));
    assert.equal(home.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
    assert.ok(home.headers.get('permissions-policy'));
});

test('rechaza métodos no permitidos en la API y rutas desconocidas', async () => {
    const getResponse = await fetch(`${baseUrl}/api/document-requests`);
    assert.equal(getResponse.status, 405);
    assert.equal(getResponse.headers.get('allow'), 'POST');

    const unknown = await fetch(`${baseUrl}/api/consultas-internas`);
    assert.equal(unknown.status, 404);
});

test('bloquea intentos de path traversal y acceso a archivos privados', async () => {
    const traversal = await fetch(`${baseUrl}/%2e%2e%2fserver.js`);
    assert.equal(traversal.status, 404);

    const traversalBackslash = await fetch(`${baseUrl}/img/%2e%2e%5cserver.js`);
    assert.equal(traversalBackslash.status, 404);

    const privateFile = await fetch(`${baseUrl}/data/document-requests.sqlite`);
    assert.equal(privateFile.status, 404);
});

test('rechaza contenido con tipos de media no permitidos y JSON inválido', async () => {
    const wrongType = await fetch(`${baseUrl}/api/document-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ name: 'Hacker' })
    });
    assert.equal(wrongType.status, 415);

    const invalidJson = await fetch(`${baseUrl}/api/document-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'no-es-un-json'
    });
    assert.equal(invalidJson.status, 400);
});

test('rechaza solicitudes con cuerpo excesivamente grande', async () => {
    const oversized = await fetch(`${baseUrl}/api/document-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validRequest, name: 'A'.repeat(20000) })
    });
    assert.equal(oversized.status, 413);
});

test('aplica rate limiting a las solicitudes de la API', async () => {
    const limitedServer = createServer({
        database,
        config: {},
        sendNotification: async () => false,
        rateLimit: { maxRequests: 2, windowMs: 60000 }
    });
    await new Promise((resolve, reject) => {
        limitedServer.once('error', reject);
        limitedServer.listen(0, '127.0.0.1', resolve);
    });
    const limitedBaseUrl = `http://127.0.0.1:${limitedServer.address().port}`;

    try {
        const first = await fetch(`${limitedBaseUrl}/api/document-requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...validRequest, website: 'bot' })
        });
        const second = await fetch(`${limitedBaseUrl}/api/document-requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...validRequest, website: 'bot' })
        });
        const third = await fetch(`${limitedBaseUrl}/api/document-requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...validRequest, website: 'bot' })
        });
        assert.equal(first.status, 201);
        assert.equal(second.status, 201);
        assert.equal(third.status, 429);
    } finally {
        await new Promise(resolve => limitedServer.close(resolve));
    }
});

test('exige la contraseña de administrador para subir álbumes a la galería', async () => {
    const adminServer = createServer({
        database,
        config: {},
        adminPassword: 'test-admin-pass',
        sendNotification: async () => false,
        rateLimit: { maxRequests: 50, windowMs: 60000 }
    });
    await new Promise((resolve, reject) => {
        adminServer.once('error', reject);
        adminServer.listen(0, '127.0.0.1', resolve);
    });
    const adminBaseUrl = `http://127.0.0.1:${adminServer.address().port}`;

    try {
        const wrongPassword = await fetch(`${adminBaseUrl}/api/gallery/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'incorrecta' })
        });
        assert.equal(wrongPassword.status, 401);

        const login = await fetch(`${adminBaseUrl}/api/gallery/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'test-admin-pass' })
        });
        const loginResult = await login.json();
        assert.equal(login.status, 200);
        assert.equal(typeof loginResult.token, 'string');
        assert.match(login.headers.get('set-cookie') || '', /HttpOnly/);
        assert.match(login.headers.get('set-cookie') || '', /Path=\/api;/);
        const token = loginResult.token;

        const unauthenticated = await fetch(`${adminBaseUrl}/api/gallery/albums`);
        assert.equal(unauthenticated.status, 401);

        const unauthorizedUpload = await fetch(`${adminBaseUrl}/api/gallery/albums`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-invalido' },
            body: JSON.stringify({ album: { title: 'A', teacher: 'B', category: 'fotos' }, files: [] })
        });
        assert.equal(unauthorizedUpload.status, 401);

        const invalidAlbum = await fetch(`${adminBaseUrl}/api/gallery/albums`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ album: { title: '', teacher: '', category: 'fotos' }, files: [] })
        });
        assert.equal(invalidAlbum.status, 400);
    } finally {
        await new Promise(resolve => adminServer.close(resolve));
    }
});

test('permite a un administrador autenticado publicar y listar noticias', async () => {
    const newsServer = createServer({
        database,
        config: {},
        adminPassword: 'test-admin-pass',
        sendNotification: async () => false,
        rateLimit: { maxRequests: 50, windowMs: 60000 }
    });
    await new Promise((resolve, reject) => {
        newsServer.once('error', reject);
        newsServer.listen(0, '127.0.0.1', resolve);
    });
    const newsBaseUrl = `http://127.0.0.1:${newsServer.address().port}`;

    try {
        const login = await fetch(`${newsBaseUrl}/api/gallery/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'test-admin-pass' })
        });
        const loginResult = await login.json();
        assert.equal(login.status, 200);
        const token = loginResult.token;

        const unauthenticatedNews = await fetch(`${newsBaseUrl}/api/news`);
        assert.equal(unauthenticatedNews.status, 401);

        const publish = await fetch(`${newsBaseUrl}/api/news`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ title: 'Noticia de prueba', date: '2026-11-24', category: 'Académico', summary: 'Resumen de prueba.' })
        });
        assert.equal(publish.status, 201);

        const list = await fetch(`${newsBaseUrl}/api/news`, { headers: { Authorization: `Bearer ${token}` } });
        const listResult = await list.json();
        assert.equal(list.status, 200);
        assert.ok(Array.isArray(listResult.news));
        assert.equal(listResult.news.length, 1);
        assert.equal(listResult.news[0].title, 'Noticia de prueba');
    } finally {
        await new Promise(resolve => newsServer.close(resolve));
    }
});

test('limita los intentos de inicio de sesión del administrador', async () => {
    const bruteServer = createServer({
        database,
        config: {},
        adminPassword: 'test-admin-pass',
        sendNotification: async () => false,
        rateLimit: { maxRequests: 3, windowMs: 60000 }
    });
    await new Promise((resolve, reject) => {
        bruteServer.once('error', reject);
        bruteServer.listen(0, '127.0.0.1', resolve);
    });
    const bruteBaseUrl = `http://127.0.0.1:${bruteServer.address().port}`;

    try {
        const attempts = [];
        for (let i = 0; i < 4; i += 1) {
            const response = await fetch(`${bruteBaseUrl}/api/gallery/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'intento-' + i })
            });
            attempts.push(response.status);
        }
        assert.deepEqual(attempts, [401, 401, 401, 429]);
    } finally {
        await new Promise(resolve => bruteServer.close(resolve));
    }
});

test('permite solicitudes con cédula de ciudadanía o cédula de extranjería', async () => {
    const response = await fetch(`${baseUrl}/api/document-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validRequest, documentType: 'Cédula de Extranjería' })
    });
    assert.equal(response.status, 201);
});

test('cierra la sesión del administrador al usar el endpoint de logout', async () => {
    const logoutServer = createServer({
        database,
        config: {},
        adminPassword: 'test-admin-pass',
        sendNotification: async () => false,
        rateLimit: { maxRequests: 50, windowMs: 60000 }
    });
    await new Promise((resolve, reject) => {
        logoutServer.once('error', reject);
        logoutServer.listen(0, '127.0.0.1', resolve);
    });
    const logoutBaseUrl = `http://127.0.0.1:${logoutServer.address().port}`;

    try {
        const login = await fetch(`${logoutBaseUrl}/api/gallery/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'test-admin-pass' })
        });
        const loginResult = await login.json();
        const token = loginResult.token;

        const logout = await fetch(`${logoutBaseUrl}/api/gallery/logout`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });
        assert.equal(logout.status, 200);

        const afterLogout = await fetch(`${logoutBaseUrl}/api/gallery/albums`, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(afterLogout.status, 401);
    } finally {
        await new Promise(resolve => logoutServer.close(resolve));
    }
});

test('sirve los archivos de SEO y PWA sin exponer archivos privados', async () => {
    for (const asset of ['/robots.txt', '/sitemap.xml', '/manifest.webmanifest', '/sw.js', '/img/favicon.svg']) {
        const response = await fetch(`${baseUrl}${asset}`);
        assert.equal(response.status, 200, `${asset} debe estar disponible`);
    }
    const manifest = await (await fetch(`${baseUrl}/manifest.webmanifest`)).json();
    assert.equal(manifest.short_name, 'Lucagasa');
    const robots = await (await fetch(`${baseUrl}/robots.txt`)).text();
    assert.match(robots, /Sitemap:/);
});

test('permite CORS solo a los orígenes configurados del frontend', async () => {
    const corsServer = createServer({
        database,
        config: { corsOrigins: ['http://127.0.0.1:8080'] },
        sendNotification: async () => false
    });
    await new Promise((resolve, reject) => {
        corsServer.once('error', reject);
        corsServer.listen(0, '127.0.0.1', resolve);
    });
    const corsBase = `http://127.0.0.1:${corsServer.address().port}`;
    try {
        const preflight = await fetch(`${corsBase}/api/news`, {
            method: 'OPTIONS',
            headers: { Origin: 'http://127.0.0.1:8080', 'Access-Control-Request-Method': 'GET' }
        });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8080');
        assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');

        const denied = await fetch(`${corsBase}/api/news`, {
            method: 'OPTIONS',
            headers: { Origin: 'http://sitio-malicioso.example' }
        });
        assert.equal(denied.status, 403);
    } finally {
        await new Promise(resolve => corsServer.close(resolve));
    }
});

test('crea respaldos de la base de datos con VACUUM INTO', () => {
    const name = backupDatabase(database, databasePath);
    const backupPath = path.join(path.dirname(databasePath), 'backups', name);
    assert.ok(fs.existsSync(backupPath));
    const backup = createDatabase(backupPath);
    const count = backup.prepare('SELECT COUNT(*) AS total FROM document_requests').get().total;
    backup.close();
    assert.ok(count > 0);
});
