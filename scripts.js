// ======================================================
// TABS / PESTAÑAS
// ======================================================

function showTab(id, btn) {
    // Ocultar todos los paneles
    document.querySelectorAll('.panel').forEach(panel => {
        panel.classList.remove('active');
    });

    // Desactivar todos los botones de navegación
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.classList.remove('active');
    });

    // Mostrar el panel correspondiente
    const panel = document.getElementById('panel-' + id);
    if (panel) {
        panel.classList.add('active');
    }

    // Activar el botón correspondiente (si se pasa como argumento)
    if (btn) {
        btn.classList.add('active');
    } else {
        // Buscar el botón correspondiente por atributo onclick si no se pasa 'btn'
        const targetBtn = document.querySelector(`.tab-btn[onclick*="'${id}'"]`);
        if (targetBtn) {
            targetBtn.classList.add('active');
        }
    }

    // Desplazar suavemente arriba
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

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
    document.querySelectorAll('.ptype').forEach(p => {
        p.classList.remove('sel');
    });

    if (el) {
        el.classList.add('sel');
    }

    const inputTipo = document.getElementById('pqrs-tipo');
    if (inputTipo) {
        inputTipo.value = tipo;
    }
}

// ======================================================
// MODAL DE SOLICITUD DE DOCUMENTOS
// ======================================================

function openModal() {
    const overlay = document.getElementById('modal-overlay');
    const body = document.getElementById('modal-body');
    
    if (body) {
        body.innerHTML = `
            <div class="form-wrap">
                <div class="fr">
                    <label>Nombre Completo del Solicitante</label>
                    <input type="text" placeholder="Ej: Juan Pérez" />
                </div>
                <div class="row2">
                    <div class="fr">
                        <label>Tipo de Documento</label>
                        <select>
                            <option>Cédula de Ciudadanía</option>
                            <option>Tarjeta de Identidad</option>
                        </select>
                    </div>
                    <div class="fr">
                        <label>Número de Documento</label>
                        <input type="text" placeholder="Número..." />
                    </div>
                </div>
                <div class="fr">
                    <label>Documento Requerido</label>
                    <select>
                        <option>Certificado de Estudios</option>
                        <option>Boletín de Notas</option>
                        <option>Paz y Salvo</option>
                        <option>Constancia de Matricula</option>
                    </select>
                </div>
                <div class="fr">
                    <label>Correo Electrónico de Contacto</label>
                    <input type="email" placeholder="correo@ejemplo.com" />
                </div>
                <button class="btn btn-navy" onclick="alert('✅ Solicitud enviada con éxito. Nos pondremos en contacto pronto.'); closeModal();">
                    Enviar Solicitud
                </button>
            </div>
        `;
    }

    if (overlay) {
        overlay.classList.add('open');
    }
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
        overlay.classList.remove('open');
    }
}

function closeIfBack(event) {
    if (event.target.id === 'modal-overlay') {
        closeModal();
    }
}
// ======================================================
// DESCARGA DEL MANUAL DE CONVIVENCIA (PDF real)
// ======================================================
// El atributo download del <a> ya dispara la descarga real del archivo;
// esta función solo agrega la retroalimentación visual del botón y un toast.
function descargarManual(el) {
    if (el.classList.contains('descargando')) return; // evita doble clic mientras anima

    const textoSpan = el.querySelector('.dl-text');
    const iconoSpan = el.querySelector('.dl-icon');
    const textoOriginal = textoSpan.textContent;
    const iconoOriginal = iconoSpan.textContent;

    el.classList.add('descargando');
    iconoSpan.textContent = '✓';
    textoSpan.textContent = 'Descargando...';

    mostrarToast('📥 Descargando Manual de Convivencia 2024...');

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
    category.textContent = GALLERY_CATEGORIES[album.category].title;
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
    input.accept = GALLERY_CATEGORIES[select.value].accept;
    const labels = {
        fotos: 'imágenes',
        videos: 'videos',
        documentos: 'documentos'
    };
    hint.textContent = 'Puedes seleccionar varios ' + labels[select.value] + '. Límite: 25 MB por álbum.';
}

async function galleryHandleUpload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const teacher = document.getElementById('gallery-teacher').value.trim();
    const title = document.getElementById('gallery-album-title').value.trim();
    const category = document.getElementById('gallery-category-select').value;
    const files = Array.from(document.getElementById('gallery-files').files || []);
    const totalBytes = files.reduce((total, file) => total + file.size, 0);

    if (!teacher || !title) {
        mostrarToast('Escribe tu nombre y el nombre del álbum.');
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

    const album = {
        id: galleryCreateId(),
        title,
        teacher,
        category,
        createdAt: Date.now()
    };
    try {
        await gallerySaveAlbum(album, files);
        form.reset();
        gallerySelectCategory(category);
        mostrarToast('Álbum guardado en este navegador.');
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
    categorySelect.addEventListener('change', () => {
        galleryUpdateFileHint();
        gallerySelectCategory(categorySelect.value);
    });
    form.addEventListener('submit', galleryHandleUpload);
    document.getElementById('gallery-albums').addEventListener('click', async event => {
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
    refreshGallery();
}

window.addEventListener('DOMContentLoaded', initializeGallery);
