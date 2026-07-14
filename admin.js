/* URDRIP DZ — Admin JS v5 — Cloudinary + Supabase */
'use strict';

var CLOUDINARY_CLOUD = 'tqpt3tzb';
var CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD + '/image/upload';
var CLOUDINARY_PRESET = 'urdrip';

async function uploadToCloudinary(file) {
  var fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  fd.append('folder', 'urdrip');
  try {
    var r = await fetch(CLOUDINARY_URL, { method: 'POST', body: fd });
    var d = await r.json();
    if (d.secure_url) return d.secure_url;
    console.error('Cloudinary error:', d);
    return null;
  } catch (e) { console.error('Cloudinary failed:', e); return null; }
}

var products = JSON.parse(localStorage.getItem('urdrip_products') || '[]');
var categories = JSON.parse(localStorage.getItem('urdrip_categories') || '[]');
var orders = JSON.parse(localStorage.getItem('urdrip_orders') || '[]');
var settings = JSON.parse(localStorage.getItem('urdrip_settings') || '{"shopName":"URDRIP DZ","instagramAccount":"urdrip_dz"}');
var deleteId = null;
var deleteType = null;

var SUPABASE_URL = 'https://vmsrldkihpxkfbgvswnf.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtc3JsZGtpaHB4a2ZiZ3Zzd25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MjM5MDIsImV4cCI6MjA5OTA5OTkwMn0.byh2My9XzGjLJjfEZw-EyGqPeCDefYPgTgsQavC9ALE';
var SUPABASE_SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtc3JsZGtpaHB4a2ZiZ3Zzd25mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzUyMzkwMiwiZXhwIjoyMDk5MDk5OTAyfQ.gqfcrzQ5H2m14CoiaNG2Gfmd6ZB6yzlS4X1oiFJFy_o';

function getSupabase() {
  return { url: SUPABASE_URL, key: SUPABASE_ANON };
}

function getSvcKey() {
  return SUPABASE_SVC;
}

/* ---- SUPABASE CRUD ---- */
async function sbFetch(table, query) {
  var sb = getSupabase();
  if (!sb) return null;
  try {
    var ctrl = new AbortController();
    var timer = setTimeout(function() { ctrl.abort(); }, 8000);
    var r = await fetch(sb.url + '/rest/v1/' + table + (query || ''), {
      headers: { apikey: sb.key, Authorization: 'Bearer ' + sb.key },
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (r.ok) return await r.json();
    console.error('sbFetch error:', r.status, await r.text().catch(function(){}));
    return null;
  } catch (e) { console.error('sbFetch failed:', e); return null; }
}

async function sbInsert(table, data) {
  var sb = getSupabase();
  if (!sb) return null;
  var sk = getSvcKey();
  console.log('sbInsert:', table, data);
  try {
    var ctrl = new AbortController();
    var tid = setTimeout(function() { ctrl.abort(); }, 8000);
    var r = await fetch(sb.url + '/rest/v1/' + table, {
      method: 'POST',
      headers: { apikey: sk, Authorization: 'Bearer ' + sk, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(data),
      signal: ctrl.signal
    });
    clearTimeout(tid);
    console.log('sbInsert status:', r.status);
    if (!r.ok) { var errBody = await r.text().catch(function(){}); console.error('sbInsert error:', r.status, errBody); return null; }
    var d = await r.json(); console.log('sbInsert ok:', d); return d[0] || null;
  } catch (e) { console.error('sbInsert failed:', e); return null; }
}

async function sbUpdate(table, id, data) {
  var sb = getSupabase();
  if (!sb) return false;
  var sk = getSvcKey();
  try {
    var ctrl = new AbortController();
    var tid = setTimeout(function() { ctrl.abort(); }, 8000);
    var r = await fetch(sb.url + '/rest/v1/' + table + '?id=eq.' + id, {
      method: 'PATCH',
      headers: { apikey: sk, Authorization: 'Bearer ' + sk, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: ctrl.signal
    });
    clearTimeout(tid);
    if (!r.ok) { console.error('sbUpdate error:', r.status, await r.text().catch(function(){})); }
    return r.ok;
  } catch (e) { console.error('sbUpdate failed:', e); return false; }
}

async function sbDelete(table, id) {
  var sb = getSupabase();
  if (!sb) return false;
  var sk = getSvcKey();
  try {
    var ctrl = new AbortController();
    var tid = setTimeout(function() { ctrl.abort(); }, 8000);
    var r = await fetch(sb.url + '/rest/v1/' + table + '?id=eq.' + id, {
      method: 'DELETE',
      headers: { apikey: sk, Authorization: 'Bearer ' + sk },
      signal: ctrl.signal
    });
    clearTimeout(tid);
    if (!r.ok) { console.error('sbDelete error:', r.status, await r.text().catch(function(){})); }
    return r.ok;
  } catch (e) { console.error('sbDelete failed:', e); return false; }
}

/* ---- FETCH ALL ---- */
function stripImages(items) {
  return items.map(function(item) {
    var copy = Object.assign({}, item);
    if (copy.image && copy.image.length > 200) copy.image = '';
    if (copy.images && Array.isArray(copy.images)) copy.images = [];
    return copy;
  });
}
async function fetchAllFromSupabase() {
  var results = await Promise.all([
    sbFetch('products', '?select=id,name,category,price,old_price,color,sizes,image,badge,description,stock,active,created_at&order=created_at.desc'),
    sbFetch('categories', '?select=id,name,description,sort_order,active&order=sort_order.asc'),
    sbFetch('orders', '?select=id,customer,phone,wilaya,commune,delivery,note,items,total,status,created_at&order=created_at.desc')
  ]);
  var prods = results[0];
  var cats = results[1];
  var ords = results[2];
  if (prods) { products = prods; try { localStorage.setItem('urdrip_products', JSON.stringify(stripImages(prods))); } catch(e) {} }
  if (cats) { categories = cats; try { localStorage.setItem('urdrip_categories', JSON.stringify(cats)); } catch(e) {} }
  if (ords) { orders = ords; try { localStorage.setItem('urdrip_orders', JSON.stringify(ords)); } catch(e) {} }
}

/* ---- CONFIG ---- */
async function saveSupabaseConfig() {
  var url = document.getElementById('supabaseUrl').value.trim();
  var key = document.getElementById('supabaseKey').value.trim();
  if (url && key) {
    localStorage.setItem('sb_url', url);
    localStorage.setItem('sb_key', key);
    toast('تم حفظ إعدادات Supabase');
    document.getElementById('supabaseModal').classList.remove('active');
    await fetchAllFromSupabase();
    refreshAll();
  } else { toast('يرجى ملء جميع الحقول'); }
}

function loadSupabaseConfig() {
  var url = localStorage.getItem('sb_url');
  var key = localStorage.getItem('sb_key');
  if (url) document.getElementById('supabaseUrl').value = url;
  if (key) document.getElementById('supabaseKey').value = key;
}

/* ---- SIDEBAR ---- */
function initSidebar() {
  var toggle = document.getElementById('sidebarToggle');
  var sidebar = document.getElementById('sidebar');
  if (toggle) toggle.addEventListener('click', function() { sidebar.classList.toggle('active'); });
}

/* ---- NAVIGATION ---- */
function initNavigation() {
  var links = document.querySelectorAll('.sidebar-link[data-section]');
  var sections = document.querySelectorAll('.admin-section');
  var pageTitle = document.getElementById('pageTitle');
  var titles = { dashboard: 'لوحة التحكم', products: 'إدارة المنتجات', 'add-product': 'إضافة منتج جديد', 'edit-product': 'تعديل المنتج', categories: 'التصنيفات', orders: 'الطلبات', settings: 'الإعدادات' };
  links.forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var sec = link.dataset.section;
      links.forEach(function(l) { l.classList.remove('active'); });
      link.classList.add('active');
      sections.forEach(function(s) { s.classList.remove('active'); });
      document.getElementById(sec).classList.add('active');
      if (pageTitle) pageTitle.textContent = titles[sec] || 'لوحة التحكم';
      document.getElementById('sidebar').classList.remove('active');
    });
  });
}

/* ---- DASHBOARD ---- */
function loadDashboard() {
  document.getElementById('statProducts').textContent = products.filter(function(p) { return p.active; }).length;
  document.getElementById('statOrders').textContent = orders.length;
  document.getElementById('statRevenue').textContent = orders.reduce(function(s, o) { var deliv = o.delivery === 'home' ? 700 : (o.delivery === 'office' ? 600 : 0); return s + ((o.total || 0) - deliv); }, 0).toLocaleString() + ' دج';
  var recent = document.getElementById('recentProducts');
  if (recent) {
    recent.innerHTML = products.slice(-5).reverse().map(function(p) {
      var img = (p.images && p.images[0]) || p.image || '';
      return '<div class="recent-item"><img src="' + img + '" alt="' + p.name + '"><div><h4>' + p.name + '</h4><p>' + p.price.toLocaleString() + ' دج</p></div></div>';
    }).join('');
  }
}

/* ---- PRODUCTS TABLE ---- */
function loadProductsTable(search) {
  search = search || '';
  var tbody = document.getElementById('productsTableBody');
  if (!tbody) return;
  var filtered = search ? products.filter(function(p) { return p.name.indexOf(search) !== -1 || p.category.indexOf(search) !== -1; }) : products;
  var catLabels = { clothes: 'ستريت وير', accessories: 'إكسسوارات', gang: 'سنيكرز' };
  var badgeLabels = { new: 'جديد', hot: 'رائج', sale: 'عرض', best: 'الأكثر مبيعاً' };
  tbody.innerHTML = filtered.map(function(p) {
    var id = parseInt(p.id) || 0;
    var img = (p.images && p.images[0]) || p.image || '';
    var badgeHtml = p.badge ? '<span class="badge ' + p.badge + '" style="margin-right:8px">' + (badgeLabels[p.badge] || p.badge) + '</span>' : '';
    return '<tr><td><img src="' + img + '" alt="' + p.name + '"></td><td><strong>' + p.name + '</strong>' + badgeHtml + '</td><td>' + (catLabels[p.category] || p.category) + '</td><td>' + p.price.toLocaleString() + ' دج</td><td><span class="' + (p.active ? 'status-active' : 'status-inactive') + '">' + (p.active ? 'نشط' : 'غير نشط') + '</span></td><td><div class="table-actions"><button class="btn-edit" onclick="editProduct(' + id + ')">تعديل</button><button class="btn-danger" onclick="confirmDelete(' + id + ', \'product\')">حذف</button></div></td></tr>';
  }).join('');
}

function initSearch() {
  var input = document.getElementById('searchProducts');
  if (input) input.addEventListener('input', function() { loadProductsTable(input.value); });
}

/* ---- IMAGE UPLOAD (Cloudinary) ---- */
var uploadingCount = 0;

function initImageUpload(areaId, fileId, previewId, placeholderId) {
  var area = document.getElementById(areaId);
  var fileInput = document.getElementById(fileId);
  var preview = document.getElementById(previewId);
  var placeholder = document.getElementById(placeholderId);
  if (!area || !fileInput) return;
  area.addEventListener('click', function() { fileInput.click(); });
  area.addEventListener('dragover', function(e) { e.preventDefault(); area.style.borderColor = 'var(--a)'; });
  area.addEventListener('dragleave', function() { area.style.borderColor = ''; });
  area.addEventListener('drop', function(e) { e.preventDefault(); area.style.borderColor = ''; if (e.dataTransfer.files[0]) doUpload(e.dataTransfer.files[0]); });
  fileInput.addEventListener('change', function() { if (fileInput.files[0]) doUpload(fileInput.files[0]); });
  async function doUpload(file) {
    uploadingCount++;
    area.style.opacity = '0.5';
    var url = await uploadToCloudinary(file);
    uploadingCount--;
    area.style.opacity = '1';
    if (url) {
      var imgEl = preview.querySelector('img');
      if (imgEl) imgEl.src = url;
      placeholder.style.display = 'none'; preview.style.display = 'block';
    } else {
      alert('فشل رفع الصورة. تأكد من إنشاء Upload Preset باسم "urdrip" في Cloudinary.');
    }
  }
}

function initAllImageUploads() {
  initImageUpload('imageUpload1', 'pImage1', 'uploadPreview1', 'uploadPlaceholder1');
  initImageUpload('imageUpload2', 'pImage2', 'uploadPreview2', 'uploadPlaceholder2');
  initImageUpload('imageUpload3', 'pImage3', 'uploadPreview3', 'uploadPlaceholder3');
  initImageUpload('editImageUpload1', 'editImage1', 'editPreview1', 'editPlaceholder1');
  initImageUpload('editImageUpload2', 'editImage2', 'editPreview2', 'editPlaceholder2');
  initImageUpload('editImageUpload3', 'editImage3', 'editPreview3', 'editPlaceholder3');
  initImageUpload('catImageUpload', 'catImage', 'catPreview', 'catPlaceholder');
  document.querySelectorAll('.remove-img').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var inputId = btn.dataset.input;
      var previewId = btn.dataset.preview;
      var placeholderId = btn.dataset.placeholder;
      document.getElementById(inputId).value = '';
      document.getElementById(previewId).style.display = 'none';
      document.getElementById(placeholderId).style.display = '';
    });
  });
}

function getImagesArray() {
  var imgs = [];
  for (var i = 1; i <= 3; i++) {
    var img = document.getElementById('previewImg' + i);
    if (img && img.src && img.src !== location.href) imgs.push(img.src);
  }
  return imgs;
}

function resetUploads() {
  for (var i = 1; i <= 3; i++) {
    var ph = document.getElementById('uploadPlaceholder' + i);
    var pv = document.getElementById('uploadPreview' + i);
    var inp = document.getElementById('pImage' + i);
    if (ph) ph.style.display = '';
    if (pv) pv.style.display = 'none';
    if (inp) inp.value = '';
  }
}

function showSection(id, title) {
  document.querySelectorAll('.admin-section').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  document.getElementById('pageTitle').textContent = title;
}

/* ---- ADD PRODUCT ---- */
function initProductForm() {
  var form = document.getElementById('productForm');
  var addBtn = document.getElementById('addProductBtn');
  var cancelBtn = document.getElementById('cancelProduct');
  if (addBtn) addBtn.addEventListener('click', function() { showSection('add-product', 'إضافة منتج جديد'); });
  if (cancelBtn) cancelBtn.addEventListener('click', function() { form.reset(); showSection('products', 'إدارة المنتجات'); resetUploads(); });
  if (form) form.addEventListener('submit', async function(e) {
    e.preventDefault();
    if (uploadingCount > 0) { alert('جاري رفع الصور... انتظر قليلاً'); return; }
    var submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true; submitBtn.textContent = 'جاري الحفظ...';
    var images = getImagesArray();
    var product = {
      name: document.getElementById('pName').value,
      category: document.getElementById('pCategory').value,
      price: parseInt(document.getElementById('pPrice').value),
      old_price: document.getElementById('pOldPrice').value ? parseInt(document.getElementById('pOldPrice').value) : null,
      color: document.getElementById('pColor').value || null,
      sizes: document.getElementById('pSizes').value || null,
      badge: document.getElementById('pBadge').value || null,
      description: document.getElementById('pDescription').value || '',
      image: images[0] || null,
      images: images,
      stock: parseInt(document.getElementById('pStock').value) || 5,
      active: document.getElementById('pActive').checked
    };
    var saved = await sbInsert('products', product);
    if (saved) { products.unshift(saved); } else { product.id = Date.now(); product.created_at = new Date().toISOString(); products.push(product); }
    save();
    toast('تمت إضافة المنتج');
    submitBtn.disabled = false; submitBtn.textContent = 'حفظ المنتج';
    form.reset(); resetUploads();
    showSection('products', 'إدارة المنتجات');
    loadProductsTable(); loadDashboard();
  });
}

/* ---- EDIT PRODUCT ---- */
async function editProduct(id) {
  var p = products.find(function(x) { return x.id === id; });
  if (!p) return;
  var fresh = await sbFetch('products', '?select=image,images&id=eq.' + id);
  if (fresh && fresh[0]) { p.image = fresh[0].image; p.images = fresh[0].images; }
  document.getElementById('editProductId').value = id;
  document.getElementById('editName').value = p.name;
  document.getElementById('editCategory').value = p.category;
  document.getElementById('editPrice').value = p.price;
  document.getElementById('editOldPrice').value = p.old_price || '';
  document.getElementById('editColor').value = p.color || '';
  document.getElementById('editSizes').value = p.sizes || '';
  document.getElementById('editBadge').value = p.badge || '';
  document.getElementById('editDescription').value = p.description || '';
  document.getElementById('editStock').value = p.stock || 0;
  document.getElementById('editActive').checked = p.active;
  var currentImgs = document.getElementById('editImagesCurrent');
  var allImgs = p.images || (p.image ? [p.image] : []);
  currentImgs.innerHTML = allImgs.length ? '<div style="display:flex;gap:8px;margin-bottom:12px">' + allImgs.map(function(img) {
    return '<img src="' + img + '" style="width:80px;height:80px;object-fit:cover;border-radius:8px">';
  }).join('') + '</div>' : '';
  showSection('edit-product', 'تعديل المنتج');
}

function initEditForm() {
  var form = document.getElementById('editProductForm');
  var cancelBtn = document.getElementById('cancelEdit');
  if (cancelBtn) cancelBtn.addEventListener('click', function() { showSection('products', 'إدارة المنتجات'); });
  if (form) form.addEventListener('submit', async function(e) {
    e.preventDefault();
    var id = parseInt(document.getElementById('editProductId').value);
    var p = products.find(function(x) { return x.id === id; });
    if (!p) return;
    var submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true; submitBtn.textContent = 'جاري الحفظ...';
    var images = [];
    for (var i = 1; i <= 3; i++) {
      var pv = document.getElementById('editPreview' + i);
      var inp = document.getElementById('editImage' + i);
      if (pv && pv.style.display !== 'none' && pv.querySelector('img').src) {
        images.push(pv.querySelector('img').src);
      } else if (p.images && p.images[i-1]) {
        images.push(p.images[i-1]);
      }
    }
    if (!images.length && p.image) images.push(p.image);
    var updates = {
      name: document.getElementById('editName').value,
      category: document.getElementById('editCategory').value,
      price: parseInt(document.getElementById('editPrice').value),
      old_price: document.getElementById('editOldPrice').value ? parseInt(document.getElementById('editOldPrice').value) : null,
      color: document.getElementById('editColor').value || null,
      sizes: document.getElementById('editSizes').value || null,
      badge: document.getElementById('editBadge').value || null,
      description: document.getElementById('editDescription').value || '',
      image: images[0] || null,
      images: images,
      stock: parseInt(document.getElementById('editStock').value) || 0,
      active: document.getElementById('editActive').checked
    };
    await sbUpdate('products', id, updates);
    Object.assign(p, updates);
    save();
    toast('تم تعديل المنتج');
    submitBtn.disabled = false; submitBtn.textContent = 'حفظ التعديلات';
    showSection('products', 'إدارة المنتجات');
    loadProductsTable(); loadDashboard();
  });
}

/* ---- DELETE ---- */
function confirmDelete(id, type) { deleteId = id; deleteType = type || 'product'; document.getElementById('deleteModal').classList.add('active'); }

function initDeleteModal() {
  var cancel = document.getElementById('cancelDelete');
  var confirm = document.getElementById('confirmDelete');
  var modal = document.getElementById('deleteModal');
  if (cancel) cancel.addEventListener('click', function() { modal.classList.remove('active'); deleteId = null; });
  if (confirm) confirm.addEventListener('click', async function() {
    if (deleteId !== null) {
      if (deleteType === 'category') {
        await sbDelete('categories', deleteId);
        categories = categories.filter(function(c) { return c.id !== deleteId; });
      } else {
        await sbDelete('products', deleteId);
        products = products.filter(function(p) { return p.id !== deleteId; });
      }
      save(); refreshAll(); toast('تم الحذف'); deleteId = null;
    }
    modal.classList.remove('active');
  });
  if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) { modal.classList.remove('active'); deleteId = null; } });
}

/* ---- CATEGORIES ---- */
function loadCategories() {
  var grid = document.getElementById('categoriesGrid');
  if (!grid) return;
  if (!categories.length) { grid.innerHTML = '<div class="empty-state"><p>لا توجد تصنيفات</p></div>'; return; }
  grid.innerHTML = categories.map(function(c) {
    var id = parseInt(c.id) || 0;
    return '<div class="category-card glass">' +
      (c.image ? '<img src="' + c.image + '" alt="' + c.name + '">' : '<div style="height:120px;background:var(--gb);border-radius:12px"></div>') +
      '<div class="cat-card-info"><h3>' + c.name + ' <small style="color:var(--ts)">' + (c.name_en || '') + '</small></h3>' +
      '<p style="font-size:13px;color:var(--td)">' + (c.description || '') + '</p></div>' +
      '<div style="display:flex;gap:8px;padding:0 16px 16px"><button class="btn-edit" onclick="editCategory(' + id + ')">تعديل</button>' +
      '<button class="btn-danger" onclick="confirmDelete(' + id + ', \'category\')">حذف</button></div></div>';
  }).join('');
}

function editCategory(id) {
  var c = categories.find(function(x) { return x.id === id; });
  if (!c) return;
  document.getElementById('catEditId').value = id;
  document.getElementById('catName').value = c.name;
  document.getElementById('catNameEn').value = c.name_en || '';
  document.getElementById('catDescription').value = c.description || '';
  if (c.image) {
    document.getElementById('catPreviewImg').src = c.image;
    document.getElementById('catPlaceholder').style.display = 'none';
    document.getElementById('catPreview').style.display = 'block';
  }
  document.getElementById('categoryFormWrapper').style.display = '';
}

function initCategoryForm() {
  var addBtn = document.getElementById('addCategoryBtn');
  var form = document.getElementById('categoryForm');
  var cancelBtn = document.getElementById('cancelCategory');
  if (addBtn) addBtn.addEventListener('click', function() {
    document.getElementById('catEditId').value = '';
    form.reset();
    document.getElementById('catPlaceholder').style.display = '';
    document.getElementById('catPreview').style.display = 'none';
    document.getElementById('categoryFormWrapper').style.display = '';
  });
  if (cancelBtn) cancelBtn.addEventListener('click', function() { document.getElementById('categoryFormWrapper').style.display = 'none'; form.reset(); });
  if (form) form.addEventListener('submit', async function(e) {
    e.preventDefault();
    var editId = document.getElementById('catEditId').value;
    var img = document.getElementById('catPreviewImg').src;
    var data = {
      name: document.getElementById('catName').value,
      name_en: document.getElementById('catNameEn').value,
      description: document.getElementById('catDescription').value,
      image: img && img !== location.href ? img : null
    };
    if (editId) {
      await sbUpdate('categories', parseInt(editId), data);
      var c = categories.find(function(x) { return x.id === parseInt(editId); });
      if (c) Object.assign(c, data);
      toast('تم تعديل التصنيف');
    } else {
      data.sort_order = categories.length + 1;
      data.active = true;
      var saved = await sbInsert('categories', data);
      if (saved) categories.push(saved); else { data.id = Date.now(); categories.push(data); }
      toast('تمت إضافة التصنيف');
    }
    save(); loadCategories();
    document.getElementById('categoryFormWrapper').style.display = 'none';
    form.reset();
  });
}

/* ---- ORDERS ---- */
function loadOrders() {
  var el = document.getElementById('ordersList');
  if (!el) return;
  if (!orders.length) { el.innerHTML = '<div class="empty-state"><p>لا توجد طلبات بعد</p></div>'; return; }
  el.innerHTML = orders.map(function(o) {
    var items = [];
    try { items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []); } catch(e) { items = []; }
    var itemsHtml = items.map(function(it) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)">' +
        (it.image ? '<img src="' + it.image + '" style="width:48px;height:48px;object-fit:cover;border-radius:8px">' : '') +
        '<div style="flex:1"><div style="font-weight:600;font-size:14px">' + (it.name || 'منتج') + '</div>' +
        '<div style="font-size:12px;color:var(--ts)">' + (it.size ? 'المقاس: ' + it.size + ' × ' + (it.qty||1) : 'الكمية: ' + (it.qty||1)) + '</div></div>' +
        '<div style="font-weight:600;color:var(--a)">' + (it.price||0).toLocaleString() + ' دج</div></div>';
    }).join('');
    var statusLabels = {pending:'جديد',confirmed:'مؤكد',shipped:'تم الشحن',delivered:'تم التوصيل',cancelled:'ملغي'};
    var statusColors = {pending:'#ff6b35',confirmed:'#5fb8ff',shipped:'#a87fff',delivered:'#28c850',cancelled:'#ff3b3b'};
    return '<div class="order-card" style="margin-bottom:16px;padding:20px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">' +
      '<div><h4 style="font-size:16px;margin-bottom:4px">' + (o.customer || 'عميل') + '</h4>' +
      '<p style="font-size:13px;color:var(--ts)">📞 ' + (o.phone || '') + ' · 📍 ' + (o.wilaya || '') + (o.commune ? ' · ' + o.commune : '') + '</p>' +
      '<p style="font-size:12px;color:var(--ts);margin-top:2px">' + (o.delivery === 'home' ? '🏠 توصيل للباب (+700 دج)' : '🏢 استلام من المكتب (+600 دج)') + '</p>' +
      '<p style="font-size:11px;color:var(--ts);margin-top:4px">' + new Date(o.created_at).toLocaleDateString('ar-DZ') + '</p></div>' +
      '<div style="text-align:right"><div style="font-size:20px;font-weight:700;color:var(--a)">' + (o.total || 0).toLocaleString() + ' دج</div>' +
      '<div style="display:flex;gap:6px;margin-top:6px;align-items:center">' +
      '<select onchange="changeOrderStatus(' + o.id + ',this.value)" style="padding:6px 12px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:var(--t);font-size:12px">' +
      Object.keys(statusLabels).map(function(k) { return '<option value="' + k + '"' + (o.status === k ? ' selected' : '') + '>' + statusLabels[k] + '</option>'; }).join('') +
      '</select>' +
      '<button onclick="deleteOrder(' + o.id + ')" style="padding:6px 10px;border-radius:8px;background:rgba(255,59,59,.15);border:1px solid rgba(255,59,59,.25);color:#ff3b3b;font-size:12px;cursor:pointer;font-family:inherit">حذف</button>' +
      '</div></div></div>' +
      (items.length ? '<div style="margin-bottom:10px">' + itemsHtml + '</div>' : '') +
      (o.note ? '<div style="font-size:12px;color:var(--ts);padding:8px 12px;background:rgba(255,255,255,.03);border-radius:8px">📝 ' + o.note + '</div>' : '') +
      '</div>';
  }).join('');
}

window.changeOrderStatus = async function(id, status) {
  await sbUpdate('orders', id, { status: status });
  var order = orders.find(function(o) { return o.id === id; });
  if (order) order.status = status;
  save(); toast('تم تحديث حالة الطلب');
};

window.deleteOrder = async function(id) {
  if (!confirm('هل أنت متأكد من حذف هذا الطلب؟')) return;
  await sbDelete('orders', id);
  orders = orders.filter(function(o) { return o.id !== id; });
  save(); loadOrders(); loadDashboard(); toast('تم حذف الطلب');
};

/* ---- SETTINGS ---- */
function loadSettings() {
  document.getElementById('shopName').value = settings.shopName;
  document.getElementById('instagramAccount').value = settings.instagramAccount;
  document.getElementById('saveSettings').addEventListener('click', function() {
    settings.shopName = document.getElementById('shopName').value;
    settings.instagramAccount = document.getElementById('instagramAccount').value;
    save(); toast('تم حفظ الإعدادات');
  });
}

function save() {
  try { localStorage.setItem('urdrip_products', JSON.stringify(stripImages(products))); } catch(e) {}
  try { localStorage.setItem('urdrip_categories', JSON.stringify(categories)); } catch(e) {}
  try { localStorage.setItem('urdrip_orders', JSON.stringify(orders)); } catch(e) {}
  try { localStorage.setItem('urdrip_settings', JSON.stringify(settings)); } catch(e) {}
}

function refreshAll() {
  loadDashboard(); loadProductsTable(); loadCategories(); loadOrders();
}

function toast(msg) {
  var t = document.getElementById('toast');
  document.getElementById('toastMessage').textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 2500);
}

/* ---- PASSWORD CHANGE ---- */
document.getElementById('changePassBtn').addEventListener('click', async function() {
  var current = document.getElementById('currentPass').value;
  var newP = document.getElementById('newPass').value;
  var confirm = document.getElementById('confirmPass').value;
  if (!current || !newP || !confirm) { toast('يرجى ملء جميع الحقول'); return; }
  if (current !== _adminPass) { toast('كلمة المرور الحالية خاطئة'); return; }
  if (newP.length < 4) { toast('كلمة المرور يجب أن تكون 4 أحرف على الأقل'); return; }
  if (newP !== confirm) { toast('كلمتا المرور غير متطابقتين'); return; }
  var sb = getSupabase();
  var sk = getSvcKey();
  try {
    var r = await fetch(sb.url + '/rest/v1/settings?key=eq.admin_pass', {
      method: 'PATCH',
      headers: { apikey: sk, Authorization: 'Bearer ' + sk, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: newP })
    });
    if (r.ok) {
      _adminPass = newP;
      document.getElementById('currentPass').value = '';
      document.getElementById('newPass').value = '';
      document.getElementById('confirmPass').value = '';
      toast('تم تغيير كلمة المرور بنجاح — تعمل على كل الأجهزة');
    } else { toast('خطأ في الحفظ، حاول مرة أخرى'); }
  } catch(e) { toast('خطأ في الاتصال، حاول مرة أخرى'); }
});

/* ---- INIT ---- */
document.addEventListener('DOMContentLoaded', async function() {
  initSidebar(); initNavigation(); initProductForm(); initEditForm();
  initAllImageUploads(); initSearch(); initCategoryForm();
  loadSupabaseConfig();
  await fetchAllFromSupabase();
  refreshAll(); loadSettings(); initDeleteModal();
  setInterval(async function() {
    await fetchAllFromSupabase();
    loadOrders();
    loadDashboard();
  }, 10000);
});
