'use strict';

// Prueba rápida de SMTP. Lee las credenciales de .env (nunca las imprime).
// Uso: npm run test:smtp

const fs = require('node:fs');
const path = require('node:path');
const nodemailer = require('nodemailer');

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
    console.error('No existe el archivo .env en la raíz del proyecto.');
    process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
}

const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'ADMIN_EMAIL'];
const missing = required.filter(key => !env[key]);
if (missing.length) {
    console.error(`Faltan variables en .env: ${missing.join(', ')}`);
    process.exit(1);
}

const port = Number(env.SMTP_PORT || 587);
const secure = String(env.SMTP_SECURE || (port === 465 ? 'true' : 'false')).toLowerCase() === 'true';

const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
});

async function main() {
    console.log(`Conectando a ${env.SMTP_HOST}:${port} (${secure ? 'SSL' : 'STARTTLS'})...`);
    await transporter.verify();
    console.log('Conexión y autenticación correctas.');

    const info = await transporter.sendMail({
        from: env.MAIL_FROM || env.SMTP_USER,
        to: env.ADMIN_EMAIL,
        subject: 'Prueba SMTP — IE Luis Carlos Galán Sarmiento',
        text: 'Este correo confirma que el SMTP del sitio institucional está configurado correctamente.',
        disableFileAccess: true,
        disableUrlAccess: true
    });
    console.log(`Correo de prueba enviado a ${env.ADMIN_EMAIL} (id: ${info.messageId}).`);
}

main().catch(error => {
    console.error(`Error SMTP (${error.code || 'SMTP_ERROR'}): ${error.message}`);
    process.exitCode = 1;
});
