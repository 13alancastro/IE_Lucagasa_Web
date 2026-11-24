# IE Luis Carlos Galán — Sitio web institucional

Sitio web del Instituto Educativo Luis Carlos Galán con registro de solicitudes de documentos, galería de fotos administrable y publicación de noticias.

El proyecto está dividido en **dos servidores independientes** para aislar la API del sitio público y reducir la superficie de ataques: si un atacante satura el frontend, la API sigue viva (y viceversa).

## 🏗️ Arquitectura

| Servicio | Puerto por defecto | Función |
|---|---|---|
| **API (backend)** | `3000` | Endpoints `/api/*` y `/health`. No sirve archivos estáticos. |
| **Web (frontend)** | `8080` | HTML, CSS, JS, imágenes y manual. No expone la API. |

El frontend consume la API en `http://127.0.0.1:3000` (constante `API_BASE` en `scripts.js`). En producción, ambos servicios pueden residence en máquinas distintas; solo hay que ajustar `API_BASE` a la URL pública del backend.

```
Navegador ──► :8080 (frontend estático)
      │
      └──────► :3000 (API REST) ──► SQLite + SMTP
```

## 📋 Requisitos

- **Node.js >= 22.13.0** (usa `node:sqlite`, módulo experimental incluido en Node 22).
- npm (incluido con Node).
- Opcional: cuenta SMTP para el envío de notificaciones por correo institucional.

## 🚀 Instalación

```bash
git clone https://github.com/13alancastro/IE_Lucagasa_Web.git
cd IE_Lucagasa_Web
npm install
cp .env.example .env
```

Edita `.env` con tus valores (ver sección siguiente) y ejecuta:

```bash
npm start
```

- Sitio web: http://localhost:8080
- API: http://localhost:3000
- Health check: http://localhost:3000/health

## ⚙️ Configuración (`.env`)

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `PORT` | Puerto de la API | `3000` |
| `FRONTEND_PORT` | Puerto del sitio estático | `8080` |
| `HOST` | Dirección de escucha | `0.0.0.0` |
| `DATABASE_PATH` | Ruta de la base de datos SQLite | `data/document-requests.sqlite` |
| `ADMIN_EMAIL` | Correo del administrador (destinatario de solicitudes) | — |
| `ADMIN_PASSWORD` | Contraseña del panel administrativo | — |
| `SMTP_HOST` | Servidor SMTP | — |
| `SMTP_PORT` | Puerto SMTP | `587` |
| `SMTP_SECURE` | `true` para SSL (465), `false` para STARTTLS | `false` |
| `SMTP_USER` | Usuario SMTP | — |
| `SMTP_PASS` | Contraseña SMTP | — |
| `MAIL_FROM` | Remitente de los correos | `SMTP_USER` |

> ⚠️ **Importante:** cambia `ADMIN_PASSWORD` por una contraseña fuerte antes de desplegar. Sin `SMTP_*` configurado, las solicitudes se guardan en la BD pero no se envían correos (el sistema lo advierte al arrancar).

## 🔑 Panel administrativo

El mismo usuario administrador (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) da acceso a dos paneles:

- **Galería**: subir álbumes de fotos por categoría.
- **Noticias**: publicar noticias (título, fecha, categoría, resumen).

Tras iniciar sesión, el servidor emite una cookie `HttpOnly` (`admin_token`, vigente 8 horas). El token **no se guarda en `sessionStorage` ni es accesible desde JavaScript**. Para cerrar sesión se llama a `POST /api/gallery/logout`, que revoca el token y limpia la cookie.

## 📡 Endpoints de la API

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| `GET` | `/health` | Estado del servicio | No |
| `POST` | `/api/document-requests` | Registra una solicitud de documento | No |
| `POST` | `/api/gallery/auth` | Inicia sesión de administrador | No |
| `POST` | `/api/gallery/logout` | Cierra sesión y revoca el token | Cookie |
| `GET` | `/api/gallery/albums` | Lista álbumes por categoría | Cookie |
| `POST` | `/api/gallery/albums` | Publica un álbum con fotos | Cookie |
| `GET` | `/api/gallery/albums/:id/files/:name` | Sirve una foto del álbum | Cookie |
| `GET` | `/api/news` | Lista noticias | Cookie |
| `POST` | `/api/news` | Publica una noticia | Cookie |

**Documentos permitidos:** solo se aceptan solicitudes con **Cédula de Ciudadanía** o **Cédula de Extranjería**. No se permiten solicitudes con Tarjeta de Identidad (menores de edad).

## 🛡️ Seguridad

- Cabeceras: CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `COOP`.
- Cookie de sesión `HttpOnly` + `SameSite=Strict` (inmune a XSS para robo de token).
- Rate limiting en login y envío de solicitudes; protección contra fuerza bruta.
- Validación estricta de tipos, correo y tamaño de cuerpo.
- Honeypot para bots.
- Protección contra *path traversal* en archivos estáticos.
- Contraseñas comparadas con `timingSafeEqual` (SHA-256).
- Límites de tamaño y cantidad de archivos por álbum.

## 🧪 Pruebas

```bash
npm test
npm audit
```

La suite (`test/server.test.js`) cubre 17 casos: sirvido de página, path traversal, consentimiento, validaciones, honeypot, SMTP, cabeceras de seguridad, métodos HTTP, content-type, cuerpo sobredimensionado, rate limiting, autenticación de galería y noticias, fuerza bruta y logout.

## 🌐 Despliegue sugerido

- **Frontend**: nginx en los puertos 80/443 sirviendo el estático.
- **Backend**: Node en el puerto 3000 (proceso independiente, detrás de un reverse proxy o firewall).
- Usar HTTPS (certificado TLS) y ajustar `API_BASE` al dominio público del backend.
- Si el frontend y la API están en dominios distintos, configurar CORS en la API y `credentials: 'include'` en el frontend.

## 📄 Licencia

Uso institucional — Instituto Educativo Luis Carlos Galán.
