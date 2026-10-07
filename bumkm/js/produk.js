/*
 * DHARMA SUKOWATI - DATABASE PRODUK
 *
 * DATA PRODUK DIAMBIL DARI GOOGLE SHEETS MELALUI GOOGLE APPS SCRIPT.
 *
 * GANTI API_URL DI BAWAH DENGAN URL WEB APP GOOGLE APPS SCRIPT ANDA.
 */

const API_URL = "https://script.google.com/macros/s/AKfycbxmMwbY-tp3-x5rHHafcJIPfsgytoB1laST8458D2hBBGXETkuLuFFaC8Jz13TGdLrF/exec";

let PRODUCTS = [];

function rupiah(n) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(n) || 0);
}

async function loadProducts() {
  if (!API_URL || API_URL.includes("PASTE_URL")) {
    console.error("API_URL belum diisi.");
    PRODUCTS = [];
    return PRODUCTS;
  }

  try {
    const response = await fetch(API_URL, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Format data API bukan array.");
    }

    PRODUCTS = data.map(p => ({
      id: String(p.id || "").trim(),
      name: String(p.name || "").trim(),
      desc: String(p.desc || "").trim(),
      small: Number(p.small) || 0,
      medium: Number(p.medium) || 0,
      image: String(p.image || "").trim(),
      status: String(p.status || "tersedia").trim().toLowerCase()
    }));

    return PRODUCTS;

  } catch (error) {
    console.error("Gagal mengambil produk:", error);
    PRODUCTS = [];
    return PRODUCTS;
  }
}

function getProduct(id) {
  return PRODUCTS.find(p => String(p.id) === String(id));
}
