const list = document.getElementById("productList");
const productCount = document.getElementById("productCount");

async function tampilkanProduk() {
  list.innerHTML = `<div class="loading">Memuat produk...</div>`;

  const products = await loadProducts();

  const availableProducts = products.filter(p =>
    p.status !== "habis" &&
    p.status !== "tidak tersedia" &&
    p.status !== "nonaktif"
  );

  productCount.textContent = `${availableProducts.length} produk`;

  if (availableProducts.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <h3>Produk belum tersedia</h3>
        <p>Periksa koneksi atau pengaturan Google Sheets.</p>
        <button class="btn btn-primary" onclick="tampilkanProduk()">Coba Lagi</button>
      </div>
    `;
    return;
  }

  list.innerHTML = availableProducts.map(p => `
    <article class="product-card">
      <div class="product-photo">
        <img
          src="${escapeHtml(p.image)}"
          alt="${escapeHtml(p.name)}"
          loading="lazy"
          onerror="this.onerror=null;this.src='no-image.svg/no-image.svg';"
        >
      </div>

      <div class="product-info">
        <span class="badge">Produk UMKM</span>
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.desc)}</p>

        <div class="price-row">
          <span>Small</span>
          <strong>${rupiah(p.small)}</strong>
        </div>

        <a class="btn btn-primary"
           href="detail-pesanan.html?produk=${encodeURIComponent(p.id)}">
          Buat Pesanan
        </a>
      </div>
    </article>
  `).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

tampilkanProduk();
