// ======================================================
// TABS / PESTAÑAS
// ======================================================

function showTab(id) {
    const targetPanel = document.getElementById('panel-' + id);
    if (!targetPanel) return;

    document.querySelectorAll('.panel').forEach(panel => {
        const isActive = panel === targetPanel;
        panel.classList.toggle('active', isActive);
        panel.setAttribute('aria-hidden', String(!isActive));
    });

    document.querySelectorAll('.tab-btn').forEach(button => {
        const isActive = button.dataset.tab === id;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', String(isActive));
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });

}

document.getElementById('nav-inner')?.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    const tabs = Array.from(document.querySelectorAll('.tab-btn'));
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex < 0 || tabs.length === 0) return;

    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;

    tabs[nextIndex].focus();
    tabs[nextIndex].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    tabs[nextIndex].click();
});

// ======================================================
// DESPLAZAMIENTO DEL MENÚ (NAV SCROLL)
// ======================================================

function scrollNav(direction) {
    const navInner = document.getElementById('nav-inner');
    if (navInner) {
        const scrollAmount = 200;
        navInner.scrollBy({
            left: direction * scrollAmount,
            behavior: 'smooth'
        });
    }
}

// ======================================================
// SELECTOR PQRS
// ======================================================

function selPQRS(el, tipo) {
    document.querySelectorAll('.ptype').forEach(option => {
        option.classList.remove('sel');
        option.setAttribute('aria-pressed', 'false');
    });

    if (el) {
        el.classList.add('sel');
        el.setAttribute('aria-pressed', 'true');
    }

    const inputTipo = document.getElementById('pqrs-tipo');
    if (inputTipo) {
        inputTipo.value = tipo;
        inputTipo.setCustomValidity('');
    }
}

// ======================================================
// MODAL DE SOLICITUD DE DOCUMENTOS
// ======================================================

let modalReturnFocus = null;

function validateRequestStep(step) {
    const form = document.getElementById('document-request-form');
    if (!form) return false;
    let valid = true;
    const section = form.querySelector(`.form-step[data-step="${step}"]`);
    if (!section) return false;

    section.querySelectorAll('[required]').forEach(field => {
        const error = field.parentElement?.querySelector('.field-error');
        let message = '';
        if (field.type === 'checkbox') {
            if (!field.checked) message = 'Debes autorizar el tratamiento de tus datos.';
        } else if (!field.value.trim()) {
            message = 'Este campo es obligatorio.';
        } else if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(field.value)) {
            message = 'Escribe un correo electrónico válido.';
        } else if (field.id === 'request-document-number' && !/^[\d. -]{4,30}$/.test(field.value)) {
            message = 'Revisa el número de documento.';
        }
        if (error) error.textContent = message;
        if (message) valid = false;
    });
    if (!valid) section.querySelector('.field-error:not(:empty)')?.scrollIntoView({ block: 'center' });
    return valid;
}

function showRequestStep(form, step) {
    form.querySelectorAll('.form-step').forEach(section => {
        section.hidden = Number(section.dataset.step) !== step;
    });
    form.querySelectorAll('.form-progress-step').forEach((bar, index) => {
        bar.classList.toggle('current', index === step - 1);
        bar.classList.toggle('done', index < step - 1);
    });
    form.querySelector(`.form-step[data-step="${step}"] input:not([tabindex="-1"])`)?.focus();
}

function openModal() {
    const overlay = document.getElementById('modal-overlay');
    const body = document.getElementById('modal-body');
    if (!overlay || !body) return;

    modalReturnFocus = document.activeElement;
    body.innerHTML = `<form class="form-wrap" id="document-request-form" novalidate>
    <div class="form-progress" aria-hidden="true">
      <span class="form-progress-step current"></span>
      <span class="form-progress-step"></span>
      <span class="form-progress-step"></span>
    </div>

    <section class="form-step" data-step="1">
      <p class="form-step-hint">Paso 1 de 3 · Identificación del solicitante</p>
      <div class="fr">
        <label for="request-name">Nombre completo del solicitante</label>
        <input id="request-name" name="name" type="text" maxlength="120" placeholder="Ej.: Juan Pérez" autocomplete="name" required />
        <span class="field-error" aria-live="polite"></span>
      </div>
      <div class="row2">
        <div class="fr">
          <label for="request-document-type">Tipo de documento</label>
          <select id="request-document-type" name="documentType" required>
            <option value="">Selecciona una opción</option>
            <option value="Cédula de Ciudadanía">Cédula de Ciudadanía</option>
            <option value="Cédula de Extranjería">Cédula de Extranjería</option>
          </select>
          <span class="field-error" aria-live="polite"></span>
        </div>
        <div class="fr">
          <label for="request-document-number">Número de documento</label>
          <input id="request-document-number" name="documentNumber" type="text" inputmode="numeric" maxlength="30" autocomplete="off" placeholder="Número..." required />
          <span class="field-error" aria-live="polite"></span>
        </div>
      </div>
      <div class="form-step-actions"><button class="btn btn-navy" type="button" data-next="2">Continuar →</button></div>
    </section>

    <section class="form-step" data-step="2" hidden>
      <p class="form-step-hint">Paso 2 de 3 · Documento y datos de contacto</p>
      <div class="fr">
        <label for="request-document">Documento requerido</label>
        <select id="request-document" name="document" required>
          <option value="">Selecciona un documento</option>
          <option value="Certificado de Estudios">Certificado de Estudios</option>
          <option value="Boletín de Notas">Boletín de Notas</option>
          <option value="Paz y Salvo">Paz y Salvo</option>
          <option value="Constancia de Matrícula">Constancia de Matrícula</option>
        </select>
        <span class="field-error" aria-live="polite"></span>
      </div>
      <div class="fr">
        <label for="request-email">Correo electrónico de contacto</label>
        <input id="request-email" name="email" type="email" maxlength="254" placeholder="correo@ejemplo.com" autocomplete="email" required />
        <span class="field-error" aria-live="polite"></span>
      </div>
      <div class="form-step-actions">
        <button class="btn btn-navy" type="button" data-back="1">← Atrás</button>
        <button class="btn btn-navy" type="button" data-next="3">Continuar →</button>
      </div>
    </section>

    <section class="form-step" data-step="3" hidden>
      <p class="form-step-hint">Paso 3 de 3 · Autorización y envío · Tiempo estimado de respuesta: 3 días hábiles</p>
      <div class="request-privacy-note">
      Los datos se usarán para gestionar esta solicitud y responder al correo indicado. La solicitud y la autorización quedarán registradas por la institución. Para consultar o ejercer tus derechos sobre los datos, escribe a <a href="mailto:ieluiscarlosgalan@sedcasanare.gov.co">ieluiscarlosgalan@sedcasanare.gov.co</a>.
      </div>
      <div class="request-consent-row">
        <input id="request-consent" name="consent" type="checkbox" required />
        <label for="request-consent">Autorizo el tratamiento de mis datos personales para atender esta solicitud y conozco el aviso de privacidad anterior.</label>
        <span class="field-error" aria-live="polite"></span>
      </div>
      <div class="request-trap" aria-hidden="true">
        <label for="request-website">Deja este campo vacío</label>
        <input id="request-website" name="website" type="text" tabindex="-1" autocomplete="off" />
      </div>
      <p id="request-status" class="request-status" role="status" aria-live="polite"></p>
      <div class="form-step-actions">
        <button class="btn btn-navy" type="button" data-back="2">← Atrás</button>
        <button class="btn btn-green" id="request-submit" type="submit">Enviar solicitud</button>
      </div>
    </section>
  </form>`;

    const form = body.querySelector('#document-request-form');
    form?.addEventListener('submit', submitDocumentRequest);
    form?.addEventListener('click', event => {
        const next = event.target.closest('[data-next]');
        if (next) {
            const target = Number(next.dataset.next);
            if (validateRequestStep(target - 1)) showRequestStep(form, target);
            return;
        }
        const back = event.target.closest('[data-back]');
        if (back) showRequestStep(form, Number(back.dataset.back));
    });
    form?.addEventListener('input', event => {
        const error = event.target.parentElement?.querySelector('.field-error');
        if (error) error.textContent = '';
    });

    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    body.querySelector('input')?.focus();
}

async function submitDocumentRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector('#request-status');
    const submitButton = form.querySelector('#request-submit');
    const formData = new FormData(form);
    const payload = {
        name: formData.get('name'),
        documentType: formData.get('documentType'),
        documentNumber: formData.get('documentNumber'),
        document: formData.get('document'),
        email: formData.get('email'),
        consent: formData.get('consent') === 'on',
        website: formData.get('website')
    };

    status.textContent = 'Enviando la solicitud…';
    status.classList.remove('is-error');
    submitButton.disabled = true;

    try {
        const response = await fetch(API_BASE + '/api/document-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo guardar la solicitud.');

        if (result.discarded) {
            status.textContent = 'No se registró la solicitud por un posible envío automático.';
            status.classList.remove('is-error');
            return;
        }

        const codigo = result.id ? String(result.id).slice(0, 8).toUpperCase() : 'N/A';
        status.textContent = '';
        const badge = document.createElement('span');
        badge.className = 'request-code';
        badge.textContent = 'Radicado: ' + codigo;
        status.appendChild(badge);
        status.appendChild(document.createTextNode(result.emailSent
            ? ' Notificación enviada al correo de la institución. Tiempo estimado de respuesta: 3 días hábiles.'
            : ' El aviso por correo no pudo enviarse. Comunícate con secretaría para confirmar su recepción.'));
        form.reset();
        showRequestStep(form, 1);
    } catch (error) {
        status.textContent = error.message || 'No se pudo conectar con el servidor. Intenta de nuevo.';
        status.classList.add('is-error');
    } finally {
        submitButton.disabled = false;
    }
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    modalReturnFocus?.focus();
}

function closeIfBack(event) {
    if (event.target === event.currentTarget) closeModal();
}

function avisarFormularioSinEnvio(event, nombre) {
    event.preventDefault();
    if (nombre === 'PQRS') {
        const tipo = document.getElementById('pqrs-tipo');
        if (tipo && !tipo.value) {
            tipo.setCustomValidity('Selecciona un tipo de solicitud antes de continuar.');
            tipo.reportValidity();
            return;
        }
    }
    mostrarToast(`El formulario de ${nombre} es una demostración; no se enviaron datos.`);
}

window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('modal-overlay')?.classList.contains('open')) {
        closeModal();
    }
});

// ======================================================
// DESCARGA DEL MANUAL DE CONVIVENCIA
// ======================================================
// El atributo download del <a> ya dispara la descarga real del archivo;
// esta función solo agrega la retroalimentación visual del botón y un toast.
function descargarManual(el) {
    if (!el || el.classList.contains('descargando')) return; // evita doble clic mientras anima

    const textoSpan = el.querySelector('.dl-text');
    const iconoSpan = el.querySelector('.dl-icon');
    if (!textoSpan || !iconoSpan) return;
    const textoOriginal = textoSpan.textContent;
    const iconoOriginal = iconoSpan.textContent;

    el.classList.add('descargando');
    iconoSpan.textContent = '✓';
    textoSpan.textContent = 'Descargando...';

    mostrarToast('📥 Descargando Manual de Convivencia 2025...');

    setTimeout(() => {
        el.classList.remove('descargando');
        iconoSpan.textContent = iconoOriginal;
        textoSpan.textContent = textoOriginal;
    }, 2200);
}

// Toast de confirmación reutilizable
function mostrarToast(mensaje) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.setAttribute('aria-atomic', 'true');
        document.body.appendChild(toast);
    }
    toast.textContent = mensaje;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2600);
}
// ======================================================
// GALERÍA DE ÁLBUMES (almacenamiento local del navegador)
// ======================================================
const GALLERY_DB_NAME = 'luca-gallery-v1';
const GALLERY_MAX_BYTES = 25 * 1024 * 1024;
const API_BASE = 'http://127.0.0.1:3000';
let galleryAdminSession = false;

function galleryAuthHeaders() {
    return { 'Content-Type': 'application/json' };
}

function gallerySetAdminVisible() {
    const login = document.getElementById('gallery-admin-login');
    const panel = document.getElementById('gallery-admin-panel');
    const newsAdmin = document.getElementById('news-admin');
    if (login) login.hidden = galleryAdminSession;
    if (panel) panel.hidden = !galleryAdminSession;
    if (newsAdmin) newsAdmin.hidden = !galleryAdminSession;
}

// La cookie HttpOnly es la única fuente de verdad: se comprueba contra la API.
async function gallerySyncSession() {
    try {
        const response = await fetch(API_BASE + '/api/news', {
            headers: galleryAuthHeaders(),
            credentials: 'same-origin'
        });
        galleryAdminSession = response.ok;
    } catch (error) {
        galleryAdminSession = false;
    }
    gallerySetAdminVisible();
}

async function galleryAdminLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.getElementById('gallery-login-status');
    const passwordInput = document.getElementById('gallery-admin-password');
    const password = passwordInput ? passwordInput.value : '';
    if (status) { status.textContent = 'Ingresando…'; status.classList.remove('is-error'); }
    try {
        const response = await fetch(API_BASE + '/api/gallery/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (status) { status.textContent = result.error || 'No se pudo ingresar.'; status.classList.add('is-error'); }
            return;
        }
        galleryAdminSession = true;
        if (status) { status.textContent = 'Sesión de administrador iniciada.'; status.classList.remove('is-error'); }
        gallerySetAdminVisible();
        await refreshGallery();
    } catch (error) {
        if (status) { status.textContent = error.message || 'No se pudo conectar con el servidor.'; status.classList.add('is-error'); }
    }
}

function galleryAdminLogout() {
    galleryAdminSession = false;
    fetch(API_BASE + '/api/gallery/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    gallerySetAdminVisible();
}

function galleryFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
        reader.readAsDataURL(file);
    });
}
const GALLERY_CATEGORIES = {
    documentos: {
        title: 'Documentos',
        accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv'
    },
    videos: {
        title: 'Videos',
        accept: 'video/*,.mp4,.mov,.webm,.ogg'
    },
    fotos: {
        title: 'Fotos',
        accept: 'image/*'
    }
};
let galleryDatabase = null;
let galleryActiveCategory = 'fotos';
const galleryObjectUrls = new Set();

function openGalleryDatabase() {
    if (galleryDatabase) return Promise.resolve(galleryDatabase);
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error('Este navegador no permite guardar la galería localmente.'));
            return;
        }
        const request = window.indexedDB.open(GALLERY_DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('albums')) {
                db.createObjectStore('albums', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('items')) {
                const items = db.createObjectStore('items', { keyPath: 'id' });
                items.createIndex('albumId', 'albumId', { unique: false });
            }
        };
        request.onsuccess = () => {
            galleryDatabase = request.result;
            galleryDatabase.onversionchange = () => galleryDatabase.close();
            resolve(galleryDatabase);
        };
        request.onerror = () => reject(request.error || new Error('No se pudo abrir la galería.'));
    });
}

function galleryReadAll(storeName) {
    return openGalleryDatabase().then(db => new Promise((resolve, reject) => {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }));
}

function galleryReadItems(albumId) {
    return openGalleryDatabase().then(db => new Promise((resolve, reject) => {
        const store = db.transaction('items', 'readonly').objectStore('items');
        const request = store.index('albumId').getAll(albumId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }));
}

function gallerySaveAlbum(album, files) {
    return openGalleryDatabase().then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction(['albums', 'items'], 'readwrite');
        transaction.objectStore('albums').add(album);
        files.forEach(file => {
            transaction.objectStore('items').add({
                id: galleryCreateId(),
                albumId: album.id,
                name: file.name,
                type: file.type || 'application/octet-stream',
                size: file.size,
                blob: new Blob([file], { type: file.type || 'application/octet-stream' })
            });
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('No se pudo guardar el álbum.'));
        transaction.onabort = () => reject(transaction.error || new Error('Se canceló el guardado del álbum.'));
    }));
}

function galleryDeleteAlbum(albumId) {
    return openGalleryDatabase().then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction(['albums', 'items'], 'readwrite');
        transaction.objectStore('albums').delete(albumId);
        const cursorRequest = transaction.objectStore('items').index('albumId').openCursor(albumId);
        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('No se pudo eliminar el álbum.'));
    }));
}

function galleryCreateId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return 'gal-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

function galleryFormatSize(size) {
    if (size < 1024 * 1024) return Math.max(1, Math.round(size / 1024)) + ' KB';
    return (size / (1024 * 1024)).toFixed(1) + ' MB';
}

function galleryFileIsAllowed(category, file) {
    const extension = file.name.toLowerCase().split('.').pop();
    if (category === 'fotos') {
        return file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'].includes(extension);
    }
    if (category === 'videos') {
        return file.type.startsWith('video/') || ['mp4', 'mov', 'webm', 'ogg', 'm4v'].includes(extension);
    }
    return ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(extension);
}

function galleryReleaseObjectUrls() {
    galleryObjectUrls.forEach(url => URL.revokeObjectURL(url));
    galleryObjectUrls.clear();
}

function galleryCreateMedia(item, albumTitle) {
    const url = URL.createObjectURL(item.blob);
    galleryObjectUrls.add(url);
    const media = document.createElement('div');
    media.className = 'gallery-media';
    if (item.type.startsWith('image/')) {
        const image = document.createElement('img');
        image.src = url;
        image.alt = albumTitle + ': ' + item.name;
        image.loading = 'lazy';
        media.appendChild(image);
    } else if (item.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.preload = 'metadata';
        video.setAttribute('aria-label', item.name);
        media.appendChild(video);
    } else {
        const link = document.createElement('a');
        link.className = 'gallery-document-link';
        link.href = url;
        link.download = item.name;
        link.textContent = '📄 ' + item.name;
        media.appendChild(link);
    }
    const fileInfo = document.createElement('small');
    fileInfo.textContent = galleryFormatSize(item.size);
    media.appendChild(fileInfo);
    return media;
}

async function galleryRenderAlbum(album) {
    const card = document.createElement('article');
    card.className = 'gallery-album-card';
    const header = document.createElement('div');
    header.className = 'gallery-album-header';
    const titleGroup = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = album.title;
    const author = document.createElement('p');
    author.textContent = 'Por ' + album.teacher + ' · ' + new Date(album.createdAt).toLocaleDateString('es-CO');
    titleGroup.append(title, author);
    const category = document.createElement('span');
    category.className = 'gallery-album-category';
    category.textContent = (GALLERY_CATEGORIES[album.category] || GALLERY_CATEGORIES.fotos).title;
    header.append(titleGroup, category);
    card.appendChild(header);

    const mediaGrid = document.createElement('div');
    mediaGrid.className = 'gallery-media-grid';
    const items = await galleryReadItems(album.id);
    items.forEach(item => mediaGrid.appendChild(galleryCreateMedia(item, album.title)));
    if (items.length) card.appendChild(mediaGrid);

    const footer = document.createElement('div');
    footer.className = 'gallery-album-footer';
    const fileCount = document.createElement('span');
    fileCount.textContent = items.length + (items.length === 1 ? ' archivo' : ' archivos');
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'gallery-delete';
    removeButton.dataset.albumId = album.id;
    removeButton.textContent = 'Eliminar álbum';
    footer.append(fileCount, removeButton);
    card.appendChild(footer);
    return card;
}

async function refreshGallery() {
    const list = document.getElementById('gallery-albums');
    const empty = document.getElementById('gallery-empty');
    if (!list || !empty) return;
    galleryReleaseObjectUrls();
    list.replaceChildren();

    if (galleryAdminSession) {
        await galleryLoadServerAlbums(list, empty);
        return;
    }

    try {
        const albums = await galleryReadAll('albums');
        const counts = { documentos: 0, videos: 0, fotos: 0 };
        albums.forEach(album => { counts[album.category] = (counts[album.category] || 0) + 1; });
        Object.keys(counts).forEach(category => {
            const counter = document.getElementById('count-' + category);
            if (counter) counter.textContent = counts[category];
        });

        const visibleAlbums = albums
            .filter(album => album.category === galleryActiveCategory)
            .sort((a, b) => b.createdAt - a.createdAt);
        const categoryTitle = GALLERY_CATEGORIES[galleryActiveCategory].title;
        const resultsTitle = document.getElementById('gallery-results-title');
        const albumCount = document.getElementById('gallery-album-count');
        if (resultsTitle) resultsTitle.textContent = 'Álbumes de ' + categoryTitle.toLowerCase();
        if (albumCount) albumCount.textContent = visibleAlbums.length + (visibleAlbums.length === 1 ? ' álbum' : ' álbumes');
        empty.hidden = visibleAlbums.length > 0;
        for (const album of visibleAlbums) {
            list.appendChild(await galleryRenderAlbum(album));
        }
    } catch (error) {
        empty.hidden = false;
        empty.textContent = 'No fue posible abrir la galería en este navegador. ' + error.message;
    }
}

async function galleryLoadServerAlbums(list, empty) {
    try {
        const response = await fetch(API_BASE + '/api/gallery/albums?category=' + encodeURIComponent(galleryActiveCategory), { headers: galleryAuthHeaders(), credentials: 'same-origin' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'No se pudo cargar los álbumes.');
        const albums = result.albums || [];
        empty.hidden = albums.length > 0;
        list.replaceChildren();
        for (const album of albums) {
            list.appendChild(await galleryRenderServerAlbum(album));
        }
    } catch (error) {
        empty.hidden = false;
        empty.textContent = 'No fue posible cargar los álbumes. ' + error.message;
    }
}

async function galleryRenderServerAlbum(album) {
    const card = document.createElement('article');
    card.className = 'gallery-album-card';
    const header = document.createElement('div');
    header.className = 'gallery-album-header';
    const titleGroup = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = album.title;
    const author = document.createElement('p');
    author.textContent = 'Por ' + album.teacher + ' · ' + new Date(album.createdAt).toLocaleDateString('es-CO');
    titleGroup.append(title, author);
    const category = document.createElement('span');
    category.className = 'gallery-album-category';
    category.textContent = (GALLERY_CATEGORIES[album.category] || GALLERY_CATEGORIES.fotos).title;
    header.append(titleGroup, category);
    card.appendChild(header);

    const mediaGrid = document.createElement('div');
    mediaGrid.className = 'gallery-media-grid';
    const items = [];
    for (const file of album.files || []) {
        const item = await galleryCreateServerMedia(album.id, file);
        if (item) items.push(item);
    }
    items.forEach(item => mediaGrid.appendChild(item));
    if (items.length) card.appendChild(mediaGrid);

    const footer = document.createElement('div');
    footer.className = 'gallery-album-footer';
    const fileCount = document.createElement('span');
    fileCount.textContent = items.length + (items.length === 1 ? ' archivo' : ' archivos');
    footer.appendChild(fileCount);
    card.appendChild(footer);
    return card;
}

async function galleryCreateServerMedia(albumId, file) {
    const response = await fetch(`${API_BASE}/api/gallery/albums/${encodeURIComponent(albumId)}/files/${encodeURIComponent(file.name)}`, { headers: galleryAuthHeaders(), credentials: 'same-origin' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return null;
    const media = document.createElement('div');
    media.className = 'gallery-media';
    const type = result.type || 'image/jpeg';
    if (type.startsWith('image/')) {
        const image = document.createElement('img');
        image.src = 'data:' + type + ';base64,' + result.base64;
        image.alt = file.name;
        image.loading = 'lazy';
        media.appendChild(image);
    } else if (type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = 'data:' + type + ';base64,' + result.base64;
        video.controls = true;
        video.preload = 'metadata';
        video.setAttribute('aria-label', file.name);
        media.appendChild(video);
    } else {
        const link = document.createElement('a');
        link.className = 'gallery-document-link';
        link.href = 'data:' + type + ';base64,' + result.base64;
        link.download = file.name;
        link.textContent = '📄 ' + file.name;
        media.appendChild(link);
    }
    const fileInfo = document.createElement('small');
    fileInfo.textContent = galleryFormatSize(result.size);
    media.appendChild(fileInfo);
    return media;
}

function createNewsElement(item) {
    const newsItem = document.createElement('div');
    newsItem.className = 'news-item';
    const nd = document.createElement('div');
    nd.className = 'nd';
    const day = document.createElement('div');
    day.className = 'day';
    day.textContent = String(new Date(item.createdAt).getDate());
    const mon = document.createElement('div');
    mon.className = 'mon';
    const monthsEs = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    mon.textContent = monthsEs[new Date(item.createdAt).getMonth()] || '';
    nd.appendChild(day);
    nd.appendChild(mon);
    const nc = document.createElement('div');
    nc.className = 'nc';
    const title = document.createElement('h4');
    title.textContent = item.title;
    const summary = document.createElement('p');
    summary.textContent = item.summary;
    const tag = document.createElement('span');
    tag.className = 'ntag';
    tag.textContent = item.category || 'Noticia';
    nc.appendChild(title);
    nc.appendChild(summary);
    nc.appendChild(tag);
    newsItem.appendChild(nd);
    newsItem.appendChild(nc);
    return newsItem;
}

async function refreshNews() {
    const container = document.getElementById('news-published');
    if (!container || !galleryAdminSession) return;
    try {
        const response = await fetch(API_BASE + '/api/news', { headers: galleryAuthHeaders(), credentials: 'same-origin' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) return;
        const newsList = result.news || [];
        container.replaceChildren();
        container.hidden = newsList.length === 0;
        for (const item of newsList) container.appendChild(createNewsElement(item));
        filterNews();
    } catch (error) {
        container.hidden = true;
    }
}

async function publishNews(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.getElementById('news-publish-status');
    const title = document.getElementById('news-title').value.trim();
    const date = document.getElementById('news-date').value;
    const category = document.getElementById('news-category').value;
    const summary = document.getElementById('news-summary').value.trim();
    if (!galleryAdminSession) {
        mostrarToast('Ingresa con la contraseña de administrador para publicar noticias.');
        return;
    }
    if (!title || !date || !summary) {
        mostrarToast('Completa los datos de la noticia.');
        return;
    }
    try {
        const response = await fetch(API_BASE + '/api/news', {
            method: 'POST',
            headers: galleryAuthHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({ title, date, category, summary })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            mostrarToast(result.error || 'No se pudo publicar la noticia.');
            return;
        }
        if (status) {
            status.textContent = 'Noticia publicada correctamente.';
            status.classList.remove('is-error');
        }
        form.reset();
        await refreshNews();
    } catch (error) {
        mostrarToast(error.message || 'No se pudo publicar la noticia.');
    }
}

function gallerySelectCategory(category) {
    if (!GALLERY_CATEGORIES[category]) return;
    galleryActiveCategory = category;
    document.querySelectorAll('.gallery-category').forEach(button => {
        const selected = button.dataset.galleryCategory === category;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
    const select = document.getElementById('gallery-category-select');
    if (select) select.value = category;
    galleryUpdateFileHint();
    refreshGallery();
}

function galleryUpdateFileHint() {
    const select = document.getElementById('gallery-category-select');
    const input = document.getElementById('gallery-files');
    const hint = document.getElementById('gallery-file-hint');
    if (!select || !input || !hint) return;
    const category = GALLERY_CATEGORIES[select.value] ? select.value : 'fotos';
    select.value = category;
    input.accept = GALLERY_CATEGORIES[category].accept;
    const labels = {
        fotos: 'imágenes',
        videos: 'videos',
        documentos: 'documentos'
    };
    hint.textContent = 'Puedes seleccionar varios ' + labels[category] + '. Límite: 25 MB por álbum.';
}

async function galleryHandleUpload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const teacher = document.getElementById('gallery-teacher').value.trim();
    const title = document.getElementById('gallery-album-title').value.trim();
    const category = document.getElementById('gallery-category-select').value;
    const files = Array.from(document.getElementById('gallery-files').files || []);
    const totalBytes = files.reduce((total, file) => total + file.size, 0);

    if (!galleryAdminSession) {
        mostrarToast('Ingresa con la contraseña de administrador para subir álbumes.');
        return;
    }
    if (!teacher || !title) {
        mostrarToast('Escribe tu nombre y el nombre del álbum.');
        return;
    }
    if (!files.length) {
        mostrarToast('Selecciona al menos una imagen para el álbum.');
        return;
    }
    if (files.some(file => !galleryFileIsAllowed(category, file))) {
        mostrarToast('Hay archivos que no corresponden a la categoría elegida.');
        return;
    }
    if (totalBytes > GALLERY_MAX_BYTES) {
        mostrarToast('El tamaño máximo por álbum es 25 MB.');
        return;
    }

    const filePayloads = [];
    try {
        for (const file of files) {
            const base64 = await galleryFileToBase64(file);
            filePayloads.push({ name: file.name, type: file.type || 'image/jpeg', base64 });
        }
        const response = await fetch(API_BASE + '/api/gallery/albums', {
            method: 'POST',
            headers: galleryAuthHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({ album: { title, teacher, category }, files: filePayloads })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            mostrarToast(result.error || 'No se pudo guardar el álbum.');
            return;
        }
        mostrarToast('Álbum guardado en el servidor institucional.');
        form.reset();
        gallerySelectCategory(category);
        await refreshGallery();
    } catch (error) {
        mostrarToast(error.message || 'No se pudo guardar el álbum.');
    }
}

function initializeGallery() {
    const form = document.getElementById('gallery-upload-form');
    if (!form) return;
    document.querySelectorAll('.gallery-category').forEach(button => {
        button.addEventListener('click', () => gallerySelectCategory(button.dataset.galleryCategory));
    });
    const categorySelect = document.getElementById('gallery-category-select');
    const albumsList = document.getElementById('gallery-albums');
    if (!categorySelect || !albumsList) return;
    const loginForm = document.getElementById('gallery-login-form');
    if (loginForm) loginForm.addEventListener('submit', galleryAdminLogin);
    const logoutButton = document.getElementById('gallery-admin-logout');
    if (logoutButton) logoutButton.addEventListener('click', galleryAdminLogout);
    const newsForm = document.getElementById('news-publish-form');
    if (newsForm) newsForm.addEventListener('submit', publishNews);
    categorySelect.addEventListener('change', () => {
        galleryUpdateFileHint();
        gallerySelectCategory(categorySelect.value);
    });
    form.addEventListener('submit', galleryHandleUpload);
    albumsList.addEventListener('click', async event => {
        const button = event.target.closest('.gallery-delete');
        if (!button) return;
        if (!window.confirm('¿Eliminar este álbum y sus archivos de este navegador?')) return;
        try {
            await galleryDeleteAlbum(button.dataset.albumId);
            refreshGallery();
            mostrarToast('Álbum eliminado.');
        } catch (error) {
            mostrarToast(error.message || 'No se pudo eliminar el álbum.');
        }
    });
    galleryUpdateFileHint();
    gallerySetAdminVisible();
    refreshGallery();
    (async () => {
        await gallerySyncSession();
        await refreshNews();
    })();
}

// ======================================================
// BUSCADOR DE NOTICIAS
// ======================================================
function filterNews() {
    const input = document.getElementById('news-search-input');
    if (!input) return;
    const term = input.value.trim().toLocaleLowerCase('es');
    const lists = [document.getElementById('news-static-list'), document.getElementById('news-published')];
    for (const list of lists) {
        if (!list) continue;
        list.querySelectorAll('.news-item').forEach(item => {
            const text = item.textContent.toLocaleLowerCase('es');
            item.hidden = term ? !text.includes(term) : false;
        });
    }
}

document.getElementById('news-search-input')?.addEventListener('input', filterNews);

window.addEventListener('DOMContentLoaded', initializeGallery);

// PWA: cachea solo archivos estáticos del frontend; nunca intercepta la API.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}
