// ===== Config =====
const API_BASE = 'https://script.google.com/macros/s/AKfycbzffRS84vdwbMvl-rlimoWYzL9ACJnuV-bE4uG6KKkoI12DqaOZxIFLwgtw7saRi8hi/exec';
const STORAGE_KEY = 'catalogo_token_v1';
window.__products = [];
let auth = { token: null, user: null };
let currentCategory = '';
let siteSettings = {};
let deferredPrompt = null;

// ===== DOM Elements =====
const loader = document.getElementById('loader');
const mainPage = document.getElementById('main-page');
const productPage = document.getElementById('product-page');
const backBtn = document.getElementById('backBtn');
const heroCTA = document.getElementById('hero-cta');
const heroSection = document.getElementById('hero-section');
const mainContent = document.getElementById('main-content');
const filtersContainer = document.getElementById('filters-container');
const shareCatalogBtn = document.getElementById('shareCatalogBtn');
const installBtn = document.getElementById('installBtn');
const loginDialog = document.getElementById('loginDialog');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginForm = document.getElementById('loginForm');
const newBtn = document.getElementById('newBtn');
const settingsDialog = document.getElementById('settingsDialog');
const settingsForm = document.getElementById('settingsForm');
const prodDialog = document.getElementById('prodDialog');
const prodForm = document.getElementById('prodForm');
const grid = document.getElementById('grid');
const q = document.getElementById('q');
const categoryButtonsContainer = document.getElementById('category-buttons');
const raffleDialog = document.getElementById('raffleDialog');
const notFoundMessage = document.getElementById('not-found');


// ===== NUEVA FUNCIÓN AÑADIDA (Fix para imágenes de Google Drive) =====
function convertirEnlaceGoogleDrive(enlace) {
  if (typeof enlace !== 'string' || !enlace.includes('drive.google.com')) {
    return enlace; // Devuelve el enlace original si no es de Google Drive
  }
  // Extrae el ID del enlace, cubriendo varios formatos de URL
  const idMatch = enlace.match(/file\/d\/([a-zA-Z0-9_-]+)/) || enlace.match(/id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) {
    const id = idMatch[1];
    // Devuelve el formato de enlace directo para usar en etiquetas <img>
    return `https://drive.google.com/uc?export=view&id=${id}`;
  }
  return enlace; // Devuelve el original si no se puede extraer el ID
}


// ===== App Initialization =====
function initApp() {
    // Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then(registration => console.log('ServiceWorker registered:', registration))
                .catch(error => console.log('ServiceWorker registration failed:', error));
        });
    }

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw && raw !== 'undefined' && raw !== 'null') {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.token) {
                auth = parsed;
            }
        }
    } catch (_) {
        auth = { token: null, user: null };
    }

    setAdminControlsVisibility();
    attachEventListeners();

    loader.hidden = false;
    Promise.all([loadProducts(), loadSiteSettings()]).then(() => {
        handleRouting(); // Handle initial route
        loader.hidden = true;
    }).catch(err => {
        console.error("Error al inicializar la app:", err);
        loader.hidden = true;
    });
}

// ===== Event Listeners =====
function attachEventListeners() {
    heroCTA.addEventListener('click', () => mainContent.scrollIntoView({ behavior: 'smooth' }));
    backBtn.addEventListener('click', () => {
        location.hash = '';
    });

    shareCatalogBtn.addEventListener('click', () => shareContent({
        title: 'Catálogo FULLTECH',
        text: 'Echa un vistazo a nuestro catálogo de productos.',
        url: location.origin + location.pathname
    }));

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installBtn) installBtn.hidden = false;
    });

    installBtn?.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        installBtn.hidden = true;
    });

    loginBtn.addEventListener('click', () => loginDialog.showModal());
    document.querySelector('.closeLogin').addEventListener('click', () => loginDialog.close());
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        auth = { token: null, user: null };
        setAdminControlsVisibility();
        renderProducts(window.__products);
    });

    loginForm.addEventListener('submit', handleLogin);

    document.getElementById('editHeroBtn').addEventListener('click', openSettingsModal);
    document.getElementById('editFooterBtn').addEventListener('click', openSettingsModal);
    document.querySelector('.closeSettings').addEventListener('click', () => settingsDialog.close());
    settingsForm.addEventListener('submit', handleSettingsSave);

    document.getElementById('raffle-participate-btn').addEventListener('click', () => raffleDialog.showModal());
    document.querySelector('.closeRaffle').addEventListener('click', () => raffleDialog.close());

    newBtn?.addEventListener('click', () => openProductModal(null));
    document.querySelector('.closeProd').addEventListener('click', () => prodDialog.close());
    prodForm?.addEventListener('submit', handleProductSave);

    prodForm.querySelectorAll('.file-input').forEach(input => {
        input.addEventListener('change', (e) => handleFileSelect(e.target));
    });

    q.addEventListener('input', () => renderProducts(window.__products || []));
    categoryButtonsContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            const currentActive = categoryButtonsContainer.querySelector('.active');
            if(currentActive) currentActive.classList.remove('active');
            e.target.classList.add('active');
            currentCategory = e.target.dataset.category;
            renderProducts(window.__products || []);
        }
    });

    window.addEventListener('scroll', () => {
        const isScrolled = window.scrollY > 50;
        heroSection.classList.toggle('hidden', isScrolled);
        filtersContainer.classList.toggle('sticky-active', isScrolled);
    }, { passive: true });

    window.addEventListener('hashchange', handleRouting);
}

// ===== Navigation & Routing =====
function handleRouting() {
    const hash = location.hash;
    const productRoute = '#product=';

    if (hash.startsWith(productRoute)) {
        const productId = hash.substring(productRoute.length);
        showProductPage(productId);
    } else {
        showMainPage();
    }
}

function showMainPage() {
    mainPage.style.display = 'block';
    productPage.classList.remove('visible');
    document.title = 'Catálogo FULLTECH';
}

function showProductPage(productId) {
    mainPage.style.display = 'none';
    productPage.classList.add('visible');

    const product = window.__products.find(p => String(p.id) === String(productId));
    const productName = product ? product.nombre : 'Producto';

    document.title = `${productName} - FULLTECH`;
    loadProductDetail(productId);
}

// ===== Sharing =====
function shareContent(data) {
    if (navigator.share) {
        navigator.share(data).catch(console.error);
    } else {
        navigator.clipboard.writeText(data.url);
        alert('¡Enlace copiado al portapapeles!');
    }
}

// ===== Authentication & Admin =====
const isAdmin = () => auth && auth.token && auth.user && (auth.user.role || '').toLowerCase() === 'admin';

// <-- CAMBIO AÑADIDO: Lógica de botones corregida
function setAdminControlsVisibility() {
    const isUserAdmin = isAdmin();
    
    // Muestra/oculta botones principales: Login, Nuevo, Salir
    if (loginBtn) loginBtn.style.display = isUserAdmin ? 'none' : 'inline-block';
    if (logoutBtn) logoutBtn.style.display = isUserAdmin ? 'inline-block' : 'none';
    if (newBtn) newBtn.style.display = isUserAdmin ? 'inline-block' : 'none';

    // Muestra/oculta otros botones de edición para el admin
    document.querySelectorAll('.admin-edit-btn').forEach(btn => {
        btn.style.display = isUserAdmin ? 'block' : 'none';
    });
}


async function handleLogin(e) {
    e.preventDefault();
    const loginError = document.getElementById('loginError');
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const btnText = submitButton.querySelector('.btn-text');
    const spinner = submitButton.querySelector('.spinner');

    loginError.hidden = true;
    submitButton.disabled = true;
    btnText.style.display = 'none';
    spinner.style.display = 'block';

    try {
        const res = await fetch(`${API_BASE}?action=login`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(loginForm))) });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || 'Login failed');
        auth = { token: json.data.token, user: json.data.user };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
        loginDialog.close();
        setAdminControlsVisibility();
        await loadProducts();
    } catch (err) {
        loginError.textContent = err.message || 'Error de red';
        loginError.hidden = false;
    } finally {
        submitButton.disabled = false;
        btnText.style.display = 'inline-flex';
        spinner.style.display = 'none';
    }
}

// ===== File Uploading =====
function handleFileSelect(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    const preview = inputElement.closest('.upload-wrapper').querySelector('.upload-preview');
    const reader = new FileReader();
    reader.onload = e => {
        preview.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

async function uploadFile(file) {
    if (!file) return null;
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const fileData = e.target.result;
                const bearer = encodeURIComponent(`Bearer ${auth.token}`);
                const res = await fetch(`${API_BASE}?action=uploadfile&Authorization=${bearer}`, {
                    method: 'POST',
                    body: JSON.stringify({
                        fileName: file.name,
                        mimeType: file.type,
                        data: fileData.split(',')[1] // Send only base64 part
                    })
                });
                const json = await res.json();
                if (!json.ok) throw new Error(json.error || 'Error al subir archivo');
                resolve(json.data.url);
            } catch (err) {
                reject(err);
            }
        };
        reader.readAsDataURL(file);
    });
}

// ===== Site Settings (Admin) =====
function openSettingsModal() {
    if (!isAdmin()) return;
    for(const key in siteSettings) {
        if(settingsForm[key]) settingsForm[key].value = siteSettings[key];
    }
    settingsDialog.showModal();
}

async function handleSettingsSave(e) {
    e.preventDefault();
    const settingsError = document.getElementById('settingsError');
    settingsError.hidden = true;
    const newSettings = Object.fromEntries(new FormData(settingsForm));

    const oldSettings = { ...siteSettings };
    applySiteSettings(newSettings); // Optimistic update
    settingsDialog.close();

    try {
        const bearer = encodeURIComponent(`Bearer ${auth.token}`);
        const res = await fetch(`${API_BASE}?action=updatesitesettings&Authorization=${bearer}`, { method: 'POST', body: JSON.stringify(newSettings) });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || 'No se pudo guardar la configuración');
        siteSettings = json.data;
        applySiteSettings(siteSettings);
    } catch(err) {
        settingsError.textContent = err.message;
        alert("Error al guardar: " + err.message);
        applySiteSettings(oldSettings); // Rollback
    }
}

function applySiteSettings(settings) {
    if (!settings) return;
    siteSettings = settings;

    const slides = document.querySelectorAll('.hero-section .slide');
    if(slides.length === 3) {
        slides[0].src = settings.hero_url1 || 'https://i.postimg.cc/phrCWCBw/15-Ways-To-Stop-Buying-Crap-You-Don-t-Need.jpg';
        slides[1].src = settings.hero_url2 || 'https://i.postimg.cc/34qBdGSd/Dise-o-sin-t-tulo-16.png';
        slides[2].src = settings.hero_url3 || 'https://i.postimg.cc/qRX8FPGW/Oferta-4-Camaras-00001.png';
    }

    document.getElementById('hero-title').textContent = settings.hero_title || 'Tecnología de Vanguardia';
    document.getElementById('hero-subtitle').textContent = settings.hero_subtitle || 'Descubre las últimas innovaciones.';
    document.getElementById('facebookLink').href = settings.fb_url || '#';
    document.getElementById('instagramLink').href = settings.ig_url || '#';

    document.querySelector('.raffle-promo img').src = settings.raffle_img || 'https://i.postimg.cc/TP7nrVCW/LAPTOP-2.jpg';
    document.getElementById('raffle-promo-title').textContent = settings.raffle_title || 'Rifa del Mes';
    document.getElementById('raffle-promo-desc').textContent = settings.raffle_desc || 'Participa y gana.';
    document.getElementById('raffle-modal-title').textContent = settings.raffle_title || 'Rifa del Mes';
    document.getElementById('raffle-modal-img').src = settings.raffle_img || 'https://i.postimg.cc/TP7nrVCW/LAPTOP-2.jpg';
    document.getElementById('raffle-modal-desc').textContent = settings.raffle_desc || 'Participa en nuestra rifa mensual.';
}

async function loadSiteSettings() {
    try {
        const res = await fetch(`${API_BASE}?action=getsitesettings`);
        const json = await res.json();
        if (json.ok) {
            applySiteSettings(json.data);
        }
    } catch(err) { console.error("Error cargando configuración del sitio:", err); }
}

// ===== Hero Slider =====
let currentSlide = 0;
const slides = document.querySelectorAll('.hero-section .slide');
function nextSlide() {
    if (slides.length > 0) {
        slides[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
    }
}
setInterval(nextSlide, 4000); // Change slide every 4 seconds


// ===== Product Modal (Create/Edit) =====
function openProductModal(data) {
    if (!isAdmin()) return;
    prodForm.reset();
    prodForm.querySelectorAll('.upload-preview').forEach(img => img.src = 'https://placehold.co/48x48/eef2ff/333?text=Img');
    if (data) {
        for (const key in data) {
            if (prodForm[key]) {
                if (prodForm[key].type === 'checkbox') {
                    prodForm[key].checked = !!data[key];
                } else {
                    prodForm[key].value = data[key] ?? '';
                }
            }
        }
        if(data.imagen) prodForm.querySelector('[name="imagen_file"]').closest('.upload-wrapper').querySelector('.upload-preview').src = data.imagen;
        if(data.imagen2) prodForm.querySelector('[name="imagen2_file"]').closest('.upload-wrapper').querySelector('.upload-preview').src = data.imagen2;
        if(data.imagen3) prodForm.querySelector('[name="imagen3_file"]').closest('.upload-wrapper').querySelector('.upload-preview').src = data.imagen3;
        if(data.video) prodForm.querySelector('[name="video_file"]').closest('.upload-wrapper').querySelector('.upload-preview').src = 'https://placehold.co/48x48/eef2ff/333?text=Vid';
    }
    prodDialog.showModal();
}

async function handleProductSave(e) {
    e.preventDefault();
    const submitButton = prodForm.querySelector('button[type="submit"]');
    const btnText = submitButton.querySelector('.btn-text');
    const spinner = submitButton.querySelector('.spinner');

    submitButton.disabled = true;
    btnText.style.display = 'none';
    spinner.style.display = 'block';

    const prodError = document.getElementById('prodError');
    prodError.hidden = true;

    try {
        const fileInputs = [
            { key: 'imagen', input: prodForm.imagen_file },
            { key: 'imagen2', input: prodForm.imagen2_file },
            { key: 'imagen3', input: prodForm.imagen3_file },
            { key: 'video', input: prodForm.video_file },
        ];

        const uploadPromises = fileInputs.map(async ({ key, input }) => {
            const spinner = input.closest('.upload-wrapper').querySelector('.spinner');
            if (input.files.length > 0) {
                spinner.style.display = 'block';
                const url = await uploadFile(input.files[0]);
                prodForm[key].value = url;
                spinner.style.display = 'none';
            }
        });

        await Promise.all(uploadPromises);

        const o = Object.fromEntries(new FormData(prodForm));
        o.precio = Number(o.precio); o.stock = Number(o.stock);
        o.activo = o.activo === 'on';
        o.en_oferta = o.en_oferta === 'on';

        const isNew = !o.id;
        const bearer = encodeURIComponent(`Bearer ${auth.token}`);
        const res = await fetch(`${API_BASE}?action=upsertproduct&Authorization=${bearer}`, { method: 'POST', body: JSON.stringify({ ...o, id: isNew ? '' : o.id }) });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || 'No se pudo guardar');

        prodDialog.close();

        // Optimistic UI Update
        const savedProduct = json.data;
        const productIndex = window.__products.findIndex(p => p.id === savedProduct.id);
        if (productIndex > -1) {
            window.__products[productIndex] = savedProduct;
        } else {
            window.__products.unshift(savedProduct);
        }
        renderProducts(window.__products);

    } catch(err) {
        prodError.textContent = err.message;
        prodError.hidden = false;
    } finally {
        submitButton.disabled = false;
        btnText.style.display = 'inline-flex';
        spinner.style.display = 'none';
    }
}

async function deleteProductById(id) {
    if (!isAdmin() || !confirm('¿Eliminar este producto?')) return;
    const oldProducts = [...window.__products];
    window.__products = window.__products.filter(p => p.id !== id);
    renderProducts(window.__products); // Optimistic
    try {
        const bearer = encodeURIComponent(`Bearer ${auth.token}`);
        const res = await fetch(`${API_BASE}?action=deleteproduct&Authorization=${bearer}`, { method: 'POST', body: JSON.stringify({ id }) });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || 'No se pudo eliminar');
    } catch (err) {
        alert(err.message);
        window.__products = oldProducts; // Rollback
        renderProducts(window.__products);
    }
}

// ===== Product Rendering =====
function getDriveId(url) {
    if (typeof url !== 'string' || !url.includes('drive.google.com')) return null;
    try {
        const urlObj = new URL(url);
        return urlObj.searchParams.get('id') || urlObj.pathname.split('/d/')[1]?.split('/')[0];
    } catch (e) { return null; }
}

function renderProducts(items) {
    const term = (q.value || '').toLowerCase().trim();
    const csel = (currentCategory || '').toLowerCase().trim();
    const tpl = document.querySelector('#cardTpl');
    grid.innerHTML = '';

    let filteredItems = (items || []).filter(p => isAdmin() || p.activo);

    if(csel === 'ofertas') {
        filteredItems = filteredItems.filter(p => p.en_oferta);
    } else if (csel) {
        filteredItems = filteredItems.filter(p => (p.categoria || '').toLowerCase() === csel);
    }

    if (term) {
        filteredItems = filteredItems.filter(p => `${p.nombre} ${p.descripcion}`.toLowerCase().includes(term));
    }

    notFoundMessage.hidden = filteredItems.length > 0;

    filteredItems.forEach((p, i) => {
            const node = tpl.content.cloneNode(true);
            const cardEl = node.querySelector('.card');
            cardEl.style.animationDelay = `${i * 50}ms`;

            const saleBadge = cardEl.querySelector('.sale-badge');
            saleBadge.hidden = !p.en_oferta;

            // <-- CAMBIO AÑADIDO: Usa la nueva función para corregir la URL de la imagen principal
            const thumbSrc = convertirEnlaceGoogleDrive(p.imagen);
            cardEl.querySelector('.thumb').src = thumbSrc || 'https://placehold.co/600x400/eef2ff/333?text=Producto';

            const descEl = cardEl.querySelector('.desc');
            descEl.textContent = p.descripcion ?? '';
            descEl.title = p.descripcion ?? '';

            cardEl.querySelector('.name').textContent = p.nombre ?? '';
            cardEl.querySelector('.cat').textContent = p.categoria || '-';
            cardEl.querySelector('.price').textContent = `$${Number(p.precio||0).toLocaleString('es-DO')}`;

            cardEl?.addEventListener('click', (ev) => {
                if (ev.target.closest('.admin-actions, .share-prod-btn, .order-btn')) return;
                location.hash = `#product=${p.id}`;
            });

            cardEl.querySelector('.share-prod-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                shareContent({
                    title: p.nombre, text: `Mira este producto: ${p.nombre}`,
                    url: `${location.origin + location.pathname}#product=${p.id}`
                })
            });

            cardEl.querySelector('.order-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const message = encodeURIComponent(`Hola, me interesa pedir este producto: ${p.nombre}`);
                window.open(`https://wa.me/18295319442?text=${message}`, '_blank');
            });

            if (isAdmin()) {
                const bar = cardEl.querySelector('.admin-actions');
                if (bar) bar.style.display = 'flex';
                bar.querySelector('.editBtn')?.addEventListener('click', (ev) => { ev.stopPropagation(); openProductModal(p); });
                bar.querySelector('.delBtn')?.addEventListener('click', (ev) => { ev.stopPropagation(); deleteProductById(p.id); });
            }
            grid.appendChild(node);
        });
}

// ===== Product Detail Rendering =====
const pDetailElements = {
    viewer: document.getElementById('viewer'),
    thumbs: document.getElementById('thumbs'),
    name: document.getElementById('pName'),
    desc: document.getElementById('pDesc'),
    cat: document.getElementById('pCat'),
    stock: document.getElementById('pStock'),
    price: document.getElementById('pPrice'),
    shareBtn: document.getElementById('shareProdDetailBtn')
};
function ytId(url){ try{ const u = new URL(url); const host = u.hostname.replace(/^www\./,''); if (host === 'youtu.be') return u.pathname.slice(1); if (host.endsWith('youtube.com')) return u.searchParams.get('v') || u.pathname.split('/').pop(); }catch(_){} return ''; }

function setMainMedia(media) {
    const { viewer } = pDetailElements;
    if (!viewer) return;
    if (media.type === 'img') {
        viewer.innerHTML = `<img src="${media.src}" alt="">`;
        viewer.style.aspectRatio = '4 / 3';
    } else if (media.type === 'yt' || media.type === 'drive_video') {
        viewer.innerHTML = `<iframe src="${media.embed}" title="Video del producto" loading="lazy" allowfullscreen border="0"></iframe>`;
        viewer.style.aspectRatio = '16 / 9';
    } else if (media.type === 'video') {
        viewer.innerHTML = `<video controls preload="metadata" style="background:#000"><source src="${media.src}"></video>`;
        viewer.style.aspectRatio = '16 / 9';
    }
}

function renderProductDetail(p) {
    if(!p) return;
    pDetailElements.name.textContent = p.nombre || '';
    pDetailElements.desc.textContent = p.descripcion || '';
    pDetailElements.cat.textContent = p.categoria || '';
    pDetailElements.stock.textContent = `Stock: ${Number(p.stock || 0)}`;
    pDetailElements.price.textContent = `$${Number(p.precio||0).toLocaleString('es-DO')}`;

    pDetailElements.shareBtn.onclick = () => shareContent({
        title: p.nombre, text: `Mira este producto: ${p.nombre}`,
        url: `${location.origin + location.pathname}#product=${p.id}`
    });

    const media = [];

    // <-- CAMBIO AÑADIDO: Usa la nueva función para corregir las 3 imágenes del detalle
    [ p.imagen, p.imagen2, p.imagen3 ].filter(Boolean).forEach(src => {
        const displaySrc = convertirEnlaceGoogleDrive(src);
        media.push({ type: 'img', src: displaySrc, thumb: displaySrc });
    });

    if (p.video && String(p.video).trim()) {
        const vurl = String(p.video).trim();
        const ytVideoId = ytId(vurl);
        const driveVideoId = getDriveId(vurl);

        if (ytVideoId) {
            media.push({ type: 'yt', embed: `https://www.youtube.com/embed/${ytVideoId}`, thumb: `https://img.youtube.com/vi/${ytVideoId}/hqdefault.jpg` });
        } else if (driveVideoId) {
            // <-- CAMBIO AÑADIDO: Se usa un placeholder para la miniatura del video de Drive para evitar errores
            media.push({ type: 'drive_video', embed: `https://drive.google.com/file/d/${driveVideoId}/preview`, thumb: `https://placehold.co/80x64/000/fff?text=Video` });
        } else {
            media.push({ type: 'video', src: vurl, thumb: 'https://placehold.co/80x64/000/fff?text=Video' });
        }
    }

    if (media.length) setMainMedia(media[0]);
    else setMainMedia({ type: 'img', src: 'https://placehold.co/1200x900/eef2ff/333?text=Sin+imagen' });

    pDetailElements.thumbs.innerHTML = '';
    media.forEach((m, i) => {
        const btn = document.createElement('button');
        if (i === 0) btn.setAttribute('aria-current', 'true');
        btn.innerHTML = `<img src="${m.thumb || m.src}" alt="">`;
        if (m.type !== 'img') btn.classList.add('thumb-play');
        btn.addEventListener('click', () => {
            setMainMedia(m);
            [...pDetailElements.thumbs.children].forEach(el => el.removeAttribute('aria-current'));
            btn.setAttribute('aria-current', 'true');
        });
        pDetailElements.thumbs.appendChild(btn);
    });
}

// ===== Data Loading =====
async function fetchFreshList() {
    let url = `${API_BASE}?action=products&nocache=${Date.now()}`;
    if (auth.token) url += `&Authorization=${encodeURIComponent('Bearer ' + auth.token)}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error(`Error del servidor: ${res.status}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Error al cargar productos');
    return json.data || [];
}

async function loadProducts() {
    try {
        const products = await fetchFreshList();
        window.__products = products;
        renderProducts(products);
    } catch (err) {
        console.error(err);
        grid.innerHTML = `<p style="opacity:.7">${err.message || 'Error de red'}</p>`;
    }
}

async function loadProductDetail(id) {
    try {
        let product = window.__products.find(p => String(p.id) === String(id));
        if(!product) {
            const list = await fetchFreshList();
            window.__products = list;
            product = list.find(p => String(p.id) === String(id));
        }
        if(product) {
            renderProductDetail(product);
        } else {
            throw new Error("Producto no encontrado");
        }
    } catch(err) {
        productPage.innerHTML = `<main style="max-width:700px;margin:40px auto;padding:0 16px"><p>No se encontró el producto.</p><p><a href="#">Volver al inicio</a></p></main>`;
    }
}

// ===== Start App =====
initApp();