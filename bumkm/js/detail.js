const detailPage = document.getElementById("detailPage");

const params = new URLSearchParams(window.location.search);
const productId = params.get("produk");

async function tampilkanDetail() {
  detailPage.innerHTML = `<div class="loading">Memuat detail produk...</div>`;

  const products = await loadProducts();
  const product = getProduct(productId);

  if (!product) {
    detailPage.innerHTML = `
      <div class="empty">
        <h2>Produk tidak ditemukan</h2>
        <p>Produk mungkin sudah dihapus atau ID tidak sesuai.</p>
        <a class="btn btn-primary" href="index.html">Kembali ke Menu</a>
      </div>
    `;
    return;
  }

  if (["habis", "tidak tersedia", "nonaktif"].includes(product.status)) {
    detailPage.innerHTML = `
      <div class="empty">
        <h2>Produk sedang habis</h2>
        <p>${escapeHtml(product.name)} belum tersedia untuk dipesan.</p>
        <a class="btn btn-primary" href="index.html">Kembali ke Menu</a>
      </div>
    `;
    return;
  }

  detailPage.innerHTML = `
    <section class="detail-card">

      <div class="detail-image">
        <img
          src="${escapeHtml(product.image)}"
          alt="${escapeHtml(product.name)}"
          onerror="this.onerror=null;this.src='no-image.svg/no-image.svg';"
        >
      </div>

      <div class="detail-content">
        <span class="badge">Produk UMKM</span>
        <h1>${escapeHtml(product.name)}</h1>
        <p class="detail-desc">${escapeHtml(product.desc)}</p>

        <div class="form-group">
          <label for="size">Pilih Ukuran</label>
          <select id="size">
            <option value="small">Small — ${rupiah(product.small)}</option>
            <option value="medium">Large — ${rupiah(product.medium)}</option>
          </select>
        </div>

        <div class="form-group">
          <label for="qty">Jumlah</label>
          <div class="qty-control">
            <button type="button" id="minus">−</button>
            <input id="qty" type="number" value="1" min="1" max="99">
            <button type="button" id="plus">+</button>
          </div>
        </div>

        <div class="form-group">
          <label for="customerName">Nama Pemesan</label>
          <input id="customerName" type="text" placeholder="Masukkan nama">
        </div>

        <div class="form-group">
          <label for="note">Catatan</label>
          <textarea id="note" rows="3" placeholder="Contoh: jangan terlalu manis"></textarea>
        </div>

        <div class="total-box">
          <span>Total</span>
          <strong id="totalPrice">${rupiah(product.small)}</strong>
        </div>

        <button class="btn btn-primary btn-order" id="orderButton">
          Pesan via WhatsApp
        </button>
      </div>
    </section>
  `;

  const size = document.getElementById("size");
  const qty = document.getElementById("qty");
  const minus = document.getElementById("minus");
  const plus = document.getElementById("plus");
  const totalPrice = document.getElementById("totalPrice");
  const orderButton = document.getElementById("orderButton");

  function updateTotal() {
    const quantity = Math.max(1, Math.min(99, Number(qty.value) || 1));
    qty.value = quantity;

    const price = size.value === "medium"
      ? product.medium
      : product.small;

    totalPrice.textContent = rupiah(price * quantity);
  }

  size.addEventListener("change", updateTotal);

  qty.addEventListener("input", updateTotal);

  minus.addEventListener("click", () => {
    qty.value = Math.max(1, Number(qty.value) - 1);
    updateTotal();
  });

  plus.addEventListener("click", () => {
    qty.value = Math.min(99, Number(qty.value) + 1);
    updateTotal();
  });

  orderButton.addEventListener("click", () => {

    const customerName = document.getElementById("customerName").value.trim();
    const note = document.getElementById("note").value.trim();

    if (!customerName) {
      alert("Silakan isi nama pemesan terlebih dahulu.");
      document.getElementById("customerName").focus();
      return;
    }

    const quantity = Number(qty.value);
    const selectedSize = size.value;
    const sizeName = selectedSize === "medium" ? "Large" : "Small";
    const price = selectedSize === "medium"
      ? product.medium
      : product.small;

    const total = price * quantity;

    /*
     WA CS LEK
     */
    const whatsappNumber = "6287767283778";

    const message = [
      "🧼 *PESANAN DHARMA SUKOWATI*",
      "",
      `Nama: ${customerName}`,
      `Produk: ${product.name}`,
      `Ukuran: ${sizeName}`,
      `Harga: ${rupiah(price)}`,
      `Jumlah: ${quantity}`,
      `Total: ${rupiah(total)}`,
      note ? `Catatan: ${note}` : "",
      "",
      "Mohon diproses ya. Terima kasih 🙏"
    ].filter(Boolean).join("\n");

    const whatsappUrl =
      `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, "_blank");
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

tampilkanDetail();
