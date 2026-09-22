import { auth, db, storage, app } from "./firebase.js";

import {
  guard,
  qs,
  qsa,
  esc,
  fmtDate,
  toast,
  logout
} from "./common.js";

import {
  collection,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
  getAuth as getSecondaryAuth,
  createUserWithEmailAndPassword,
  signOut as secondarySignOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  firebaseConfig
} from "./firebase-config.js";


/* =========================================================
   GLOBAL DATA
========================================================= */

let bcls = [];
let users = [];
let assignments = [];
let deliveries = [];
let profile = null;

const $ = qs;


/* =========================================================
   ADMIN GUARD
========================================================= */

guard("admin", async (user, p) => {

  try {

    console.log("=================================");
    console.log("ADMIN GUARD");
    console.log("UID:", user.uid);
    console.log("EMAIL:", user.email);
    console.log("PROFILE:", p);
    console.log("=================================");

    profile = p;

    const adminName =
      p?.name ||
      p?.nama ||
      user.email ||
      "Admin";

    $("#adminName").textContent = adminName;

    bind();

    await loadAll();

    renderAll();

  } catch (error) {

    console.error("ADMIN INITIALIZATION ERROR");
    console.error("CODE:", error.code);
    console.error("MESSAGE:", error.message);
    console.error(error);

    toast(
      "Gagal memuat dashboard admin: " +
      (error.message || error.code),
      "error"
    );

  }

});


/* =========================================================
   BIND EVENT
========================================================= */

function bind() {

  const logoutBtn = $("#logoutBtn");

  if (logoutBtn) {
    logoutBtn.onclick = logout;
  }


  qsa(".nav-btn").forEach(button => {

    button.onclick = () => {

      showView(button.dataset.view);

    };

  });


  const addBclBtn = $("#addBclBtn");

  if (addBclBtn) {
    addBclBtn.onclick = showBclForm;
  }


  const addAssignmentBtn = $("#addAssignmentBtn");

  if (addAssignmentBtn) {
    addAssignmentBtn.onclick = showAssignmentForm;
  }


  const addUserBtn = $("#addUserBtn");

  if (addUserBtn) {
    addUserBtn.onclick = showUserForm;
  }


  const bclSearch = $("#bclSearch");

  if (bclSearch) {
    bclSearch.oninput = renderBcl;
  }


  const bclStatus = $("#bclStatus");

  if (bclStatus) {
    bclStatus.onchange = renderBcl;
  }


  const deliverySearch = $("#deliverySearch");

  if (deliverySearch) {
    deliverySearch.oninput = renderDeliveries;
  }


  const deliveryStatus = $("#deliveryStatus");

  if (deliveryStatus) {
    deliveryStatus.onchange = renderDeliveries;
  }

}


/* =========================================================
   VIEW
========================================================= */

function showView(view) {

  qsa(".nav-btn").forEach(button => {

    button.classList.toggle(
      "active",
      button.dataset.view === view
    );

  });


  qsa(".view").forEach(element => {

    element.classList.toggle(
      "active",
      element.id === "view-" + view
    );

  });

}


/* =========================================================
   LOAD ALL DATA
========================================================= */

async function loadAll() {

  console.log("LOAD ALL DATA...");


  try {

    /* ---------------------------------------------
       BCL
    --------------------------------------------- */

    console.log("Loading BCL...");

    const bclSnapshot =
      await getDocs(
        collection(db, "bcl")
      );

    bcls =
      bclSnapshot.docs.map(snapshot => ({
        id: snapshot.id,
        ...snapshot.data()
      }));

    console.log(
      "BCL:",
      bcls.length
    );


    /* ---------------------------------------------
       USERS
    --------------------------------------------- */

    console.log("Loading USERS...");

    const userSnapshot =
      await getDocs(
        collection(db, "users")
      );

    users =
      userSnapshot.docs.map(snapshot => ({
        id: snapshot.id,
        ...snapshot.data()
      }));

    console.log(
      "USERS:",
      users.length
    );


    /* ---------------------------------------------
       ASSIGNMENTS
    --------------------------------------------- */

    console.log("Loading ASSIGNMENTS...");

    const assignmentSnapshot =
      await getDocs(
        collection(db, "assignments")
      );

    assignments =
      assignmentSnapshot.docs.map(snapshot => ({
        id: snapshot.id,
        ...snapshot.data()
      }));

    console.log(
      "ASSIGNMENTS:",
      assignments.length
    );


    /* ---------------------------------------------
       DELIVERIES
    --------------------------------------------- */

    console.log("Loading DELIVERIES...");

    const deliveryQuery =
      query(
        collection(db, "deliveries"),
        orderBy("createdAt", "desc")
      );

    const deliverySnapshot =
      await getDocs(
        deliveryQuery
      );

    deliveries =
      deliverySnapshot.docs.map(snapshot => ({
        id: snapshot.id,
        ...snapshot.data()
      }));

    console.log(
      "DELIVERIES:",
      deliveries.length
    );


    console.log("LOAD ALL BERHASIL");

  } catch (error) {

    console.error("LOAD ALL ERROR");
    console.error("CODE:", error.code);
    console.error("MESSAGE:", error.message);
    console.error(error);

    throw error;

  }

}


/* =========================================================
   RENDER ALL
========================================================= */

function renderAll() {

  renderStats();

  renderBcl();

  renderAssignments();

  renderDeliveries();

  renderUsers();

}


/* =========================================================
   STATISTICS
========================================================= */

function renderStats() {

  const total =
    bcls.length;

  const assigned =
    bcls.filter(
      x => x.status === "DITUGASKAN"
    ).length;

  const done =
    bcls.filter(
      x => x.status === "SELESAI"
    ).length;


  $("#statBcl").textContent =
    total;

  $("#statAssigned").textContent =
    assigned;

  $("#statDone").textContent =
    done;

  $("#statPending").textContent =
    Math.max(
      0,
      total - done
    );


  const counts = {

    SUBMITTED:
      deliveries.filter(
        x => x.status === "SUBMITTED"
      ).length,

    VERIFIED:
      deliveries.filter(
        x => x.status === "VERIFIED"
      ).length

  };


  $("#statusBars").innerHTML =

    Object.entries(counts)
      .map(([key, value]) => `

        <div class="bar-row">

          <span>
            ${esc(key)}
          </span>

          <b>
            ${value}
          </b>

        </div>

      `)
      .join("")

    ||

    `<p class="muted">
      Belum ada penyaluran.
    </p>`;


  $("#recentDeliveries").innerHTML =

    deliveries
      .slice(0, 6)
      .map(delivery => `

        <div class="list-row">

          <div>

            <b>
              ${esc(
                delivery.bclName ||
                delivery.bclId ||
                "-"
              )}
            </b>

            <small>
              ${esc(
                delivery.zmartName ||
                "ZMart"
              )}
              •
              ${fmtDate(
                delivery.createdAt
              )}
            </small>

          </div>

          <span class="badge">
            ${esc(
              delivery.status ||
              "-"
            )}
          </span>

        </div>

      `)
      .join("")

    ||

    `<p class="muted">
      Belum ada data.
    </p>`;

}


/* =========================================================
   BCL
========================================================= */

function renderBcl() {

  const searchElement =
    $("#bclSearch");

  const statusElement =
    $("#bclStatus");


  const search =
    (
      searchElement?.value ||
      ""
    ).toLowerCase();


  const status =
    statusElement?.value ||
    "";


  const rows =
    bcls.filter(item => {

      const text = [

        item.id,

        item.name,

        item.district,

        item.village

      ]
        .join(" ")
        .toLowerCase();


      return (
        (!status ||
          item.status === status)
        &&
        text.includes(search)
      );

    });


  $("#bclTable").innerHTML = `

    <table>

      <thead>

        <tr>

          <th>ID</th>

          <th>Penerima</th>

          <th>Wilayah</th>

          <th>Status</th>

          <th>Aksi</th>

        </tr>

      </thead>

      <tbody>

        ${
          rows.map(item => `

            <tr>

              <td>
                ${esc(item.id)}
              </td>

              <td>

                <b>
                  ${esc(item.name)}
                </b>

                <small>
                  ${esc(item.address || "")}
                </small>

              </td>

              <td>

                ${esc(
                  item.district || "-"
                )}

                <br>

                ${esc(
                  item.village || "-"
                )}

              </td>

              <td>

                <span class="badge">

                  ${esc(
                    item.status ||
                    "BELUM_DITUGASKAN"
                  )}

                </span>

              </td>

              <td>

                <button
                  class="btn small"
                  data-edit-bcl="${esc(item.id)}"
                >
                  Edit
                </button>

              </td>

            </tr>

          `).join("")

        }

      </tbody>

    </table>

  `;


  qsa("[data-edit-bcl]")
    .forEach(button => {

      button.onclick = () => {

        showBclForm(
          button.dataset.editBcl
        );

      };

    });

}


/* =========================================================
   ASSIGNMENTS
========================================================= */

function renderAssignments() {

  $("#assignmentTable").innerHTML = `

    <table>

      <thead>

        <tr>

          <th>BCL</th>

          <th>ZMart</th>

          <th>Paket</th>

          <th>Status</th>

          <th>Waktu</th>

        </tr>

      </thead>

      <tbody>

        ${
          assignments.map(item => `

            <tr>

              <td>

                <b>
                  ${esc(
                    item.bclName || "-"
                  )}
                </b>

                <small>
                  ${esc(
                    item.bclId || "-"
                  )}
                </small>

              </td>

              <td>
                ${esc(
                  item.zmartName || "-"
                )}
              </td>

              <td>
                ${esc(
                  item.packageName || "-"
                )}
              </td>

              <td>

                <span class="badge">

                  ${esc(
                    item.status || "-"
                  )}

                </span>

              </td>

              <td>
                ${fmtDate(
                  item.createdAt
                )}
              </td>

            </tr>

          `).join("")

          ||

          `
            <tr>

              <td colspan="5">
                Belum ada penugasan.
              </td>

            </tr>
          `

        }

      </tbody>

    </table>

  `;

}


/* =========================================================
   DELIVERIES
========================================================= */

function renderDeliveries() {

  const search =
    (
      $("#deliverySearch")?.value ||
      ""
    ).toLowerCase();


  const status =
    $("#deliveryStatus")?.value ||
    "";


  const rows =
    deliveries.filter(item => {

      const text = [

        item.bclId,

        item.bclName,

        item.zmartName,

        item.district

      ]
        .join(" ")
        .toLowerCase();


      return (
        (!status ||
          item.status === status)
        &&
        text.includes(search)
      );

    });


  $("#deliveryTable").innerHTML = `

    <table>

      <thead>

        <tr>

          <th>Waktu</th>

          <th>BCL</th>

          <th>ZMart</th>

          <th>Lokasi</th>

          <th>Status</th>

          <th>Bukti</th>

        </tr>

      </thead>

      <tbody>

        ${
          rows.map(item => `

            <tr>

              <td>
                ${fmtDate(
                  item.createdAt
                )}
              </td>

              <td>

                <b>
                  ${esc(
                    item.bclName || "-"
                  )}
                </b>

                <small>
                  ${esc(
                    item.bclId || "-"
                  )}
                </small>

              </td>

              <td>
                ${esc(
                  item.zmartName || "-"
                )}
              </td>

              <td>

                ${esc(
                  item.district || "-"
                )}

                <br>

                <small>
                  ${item.latitude ?? "-"},
                  ${item.longitude ?? "-"}
                </small>

              </td>

              <td>

                <span class="badge">

                  ${esc(
                    item.status || "-"
                  )}

                </span>

              </td>

              <td>

                ${
                  item.photoUrl

                    ? `

                      <a
                        class="btn small"
                        target="_blank"
                        href="${esc(
                          item.photoUrl
                        )}"
                      >
                        Foto
                      </a>

                    `

                    : "-"

                }

              </td>

            </tr>

          `).join("")

          ||

          `
            <tr>

              <td colspan="6">
                Belum ada penyaluran.
              </td>

            </tr>
          `

        }

      </tbody>

    </table>

  `;

}


/* =========================================================
   USERS / ZMART
========================================================= */

function renderUsers() {

  const rows =
    users.filter(
      item => item.role === "zmart"
    );


  $("#userTable").innerHTML = `

    <table>

      <thead>

        <tr>

          <th>Nama</th>

          <th>Email</th>

          <th>Wilayah</th>

          <th>Status</th>

        </tr>

      </thead>

      <tbody>

        ${
          rows.map(item => `

            <tr>

              <td>

                <b>
                  ${esc(
                    item.name ||
                    item.nama ||
                    "-"
                  )}
                </b>

              </td>

              <td>
                ${esc(
                  item.email || "-"
                )}
              </td>

              <td>
                ${esc(
                  item.area || "-"
                )}
              </td>

              <td>

                <span
                  class="badge ${
                    item.active === false
                      ? "danger"
                      : ""
                  }"
                >

                  ${
                    item.active === false
                      ? "Nonaktif"
                      : "Aktif"
                  }

                </span>

              </td>

            </tr>

          `).join("")

          ||

          `
            <tr>

              <td colspan="4">
                Belum ada ZMart.
              </td>

            </tr>
          `

        }

      </tbody>

    </table>

  `;

}


/* =========================================================
   MODAL
========================================================= */

function openModal(html) {

  $("#modalBody").innerHTML =
    html;

  $("#modal").showModal();

}


/* =========================================================
   BCL FORM
========================================================= */

function showBclForm(id = "") {

  const item =
    bcls.find(
      value => value.id === id
    ) || {};


  openModal(`

    <h2>
      ${id ? "Edit" : "Tambah"} BCL
    </h2>

    <form id="bclForm">

      <label>

        ID BCL

        <input
          name="id"
          value="${esc(
            item.id ||
            "BCL-" +
            Date.now()
          )}"
          ${id ? "readonly" : ""}
          required
        >

      </label>


      <label>

        Nama penerima

        <input
          name="name"
          value="${esc(
            item.name || ""
          )}"
          required
        >

      </label>


      <label>

        Kecamatan

        <input
          name="district"
          value="${esc(
            item.district || ""
          )}"
          required
        >

      </label>


      <label>

        Desa/Kelurahan

        <input
          name="village"
          value="${esc(
            item.village || ""
          )}"
        >

      </label>


      <label>

        Alamat

        <textarea name="address">${esc(
          item.address || ""
        )}</textarea>

      </label>


      <label>

        No. Kartu/Identitas

        <input
          name="cardNo"
          value="${esc(
            item.cardNo || ""
          )}"
        >

      </label>


      <button
        class="btn primary full"
        type="submit"
      >
        Simpan
      </button>

    </form>

  `);


  $("#bclForm").onsubmit =
    async event => {

      event.preventDefault();


      try {

        const form =
          new FormData(
            event.target
          );


        const data =
          Object.fromEntries(
            form
          );


        data.status =
          item.status ||
          "BELUM_DITUGASKAN";


        data.updatedAt =
          serverTimestamp();


        await setDoc(
          doc(
            db,
            "bcl",
            data.id
          ),
          data,
          {
            merge: true
          }
        );


        $("#modal").close();


        await loadAll();

        renderAll();


        toast(
          "Data BCL tersimpan."
        );


      } catch (error) {

        console.error(
          "SAVE BCL ERROR:",
          error
        );

        toast(
          "Gagal menyimpan BCL: " +
          error.message,
          "error"
        );

      }

    };

}


/* =========================================================
   ASSIGNMENT FORM
========================================================= */

function showAssignmentForm() {

  const pending =
    bcls.filter(
      item =>
        item.status !== "SELESAI"
    );


  const zmarts =
    users.filter(
      item =>
        item.role === "zmart"
        &&
        item.active !== false
    );


  openModal(`

    <h2>
      Buat Penugasan
    </h2>


    <form id="assignmentForm">

      <label>

        BCL

        <select
          name="bclId"
          required
        >

          <option value="">
            Pilih BCL
          </option>

          ${
            pending.map(item => `

              <option
                value="${esc(item.id)}"
              >
                ${esc(item.id)}
                —
                ${esc(item.name)}
              </option>

            `).join("")
          }

        </select>

      </label>


      <label>

        ZMart

        <select
          name="zmartUid"
          required
        >

          <option value="">
            Pilih ZMart
          </option>

          ${
            zmarts.map(item => `

              <option
                value="${esc(item.id)}"
              >
                ${esc(
                  item.name ||
                  item.nama ||
                  "-"
                )}
                —
                ${esc(
                  item.area || ""
                )}
              </option>

            `).join("")
          }

        </select>

      </label>


      <label>

        Nama paket

        <input
          name="packageName"
          value="Paket Sembako BCL"
        >

      </label>


      <label>

        Isi paket

        <textarea
          name="items"
        >Beras 5 kg, Minyak Goreng 1 L, Gula 1 kg, Tepung Terigu 1 kg, Susu 2 pcs</textarea>

      </label>


      <button
        class="btn primary full"
        type="submit"
      >
        Buat Penugasan
      </button>

    </form>

  `);


  $("#assignmentForm").onsubmit =
    async event => {

      event.preventDefault();


      try {

        const form =
          new FormData(
            event.target
          );


        const bcl =
          bcls.find(
            item =>
              item.id ===
              form.get("bclId")
          );


        const zmart =
          users.find(
            item =>
              item.id ===
              form.get("zmartUid")
          );


        if (!bcl) {

          throw new Error(
            "BCL tidak ditemukan."
          );

        }


        if (!zmart) {

          throw new Error(
            "ZMart tidak ditemukan."
          );

        }


        const items =
          form
            .get("items")
            .split(",")
            .map(
              value => ({
                name:
                  value.trim(),
                checked:
                  false
              })
            )
            .filter(
              item =>
                item.name
            );


        await addDoc(
          collection(
            db,
            "assignments"
          ),
          {

            bclId:
              bcl.id,

            bclName:
              bcl.name,

            zmartUid:
              zmart.id,

            zmartName:
              zmart.name ||
              zmart.nama ||
              "",

            packageName:
              form.get(
                "packageName"
              ),

            items,

            status:
              "ASSIGNED",

            createdAt:
              serverTimestamp()

          }
        );


        await updateDoc(
          doc(
            db,
            "bcl",
            bcl.id
          ),
          {

            status:
              "DITUGASKAN",

            assignedTo:
              zmart.id,

            assignedZmartName:
              zmart.name ||
              zmart.nama ||
              "",

            updatedAt:
              serverTimestamp()

          }
        );


        $("#modal").close();


        await loadAll();

        renderAll();


        toast(
          "Penugasan dibuat."
        );


      } catch (error) {

        console.error(
          "CREATE ASSIGNMENT ERROR:",
          error
        );

        toast(
          "Gagal membuat penugasan: " +
          error.message,
          "error"
        );

      }

    };

}


/* =========================================================
   CREATE ZMART USER
========================================================= */

function showUserForm() {

  openModal(`

    <h2>
      Tambah ZMart
    </h2>

    <p class="muted">

      Akun Authentication dibuat
      menggunakan email/password.

    </p>


    <form id="userForm">

      <label>

        Nama ZMart

        <input
          name="name"
          required
        >

      </label>


      <label>

        Email

        <input
          name="email"
          type="email"
          required
        >

      </label>


      <label>

        Password awal

        <input
          name="password"
          type="password"
          minlength="6"
          required
        >

      </label>


      <label>

        Wilayah

        <input
          name="area"
        >

      </label>


      <button
        class="btn primary full"
        type="submit"
      >
        Buat akun
      </button>

    </form>

  `);


  $("#userForm").onsubmit =
    async event => {

      event.preventDefault();


      let secondaryApp = null;


      try {

        const form =
          new FormData(
            event.target
          );


        const name =
          String(
            form.get("name") || ""
          ).trim();


        const email =
          String(
            form.get("email") || ""
          ).trim();


        const password =
          String(
            form.get("password") || ""
          );


        const area =
          String(
            form.get("area") || ""
          ).trim();


        if (!name) {

          throw new Error(
            "Nama wajib diisi."
          );

        }


        if (!email) {

          throw new Error(
            "Email wajib diisi."
          );

        }


        if (password.length < 6) {

          throw new Error(
            "Password minimal 6 karakter."
          );

        }


        /*
         * SECONDARY AUTH
         *
         * Tujuannya supaya membuat akun ZMart
         * tidak membuat admin logout.
         */

        secondaryApp =
          initializeApp(
            firebaseConfig,
            "Secondary-" +
            Date.now()
          );


        const secondaryAuth =
          getSecondaryAuth(
            secondaryApp
          );


        console.log(
          "Membuat akun Authentication..."
        );


        const credential =
          await createUserWithEmailAndPassword(
            secondaryAuth,
            email,
            password
          );


        const uid =
          credential.user.uid;


        console.log(
          "AUTH USER BERHASIL"
        );

        console.log(
          "UID:",
          uid
        );


        /*
         * BUAT USERS/{UID}
         *
         * Primary auth masih tetap admin.
         */

        await setDoc(
          doc(
            db,
            "users",
            uid
          ),
          {

            uid,

            name,

            email,

            role:
              "zmart",

            area,

            active:
              true,

            createdAt:
              serverTimestamp()

          }
        );


        await secondarySignOut(
          secondaryAuth
        );


        $("#modal").close();


        await loadAll();

        renderAll();


        toast(
          "Akun ZMart berhasil dibuat."
        );


      } catch (error) {

        console.error(
          "CREATE ZMART ERROR"
        );

        console.error(
          "CODE:",
          error.code
        );

        console.error(
          "MESSAGE:",
          error.message
        );

        console.error(
          error
        );


        let message =
          error.message ||
          "Gagal membuat akun.";


        if (
          error.code ===
          "auth/email-already-in-use"
        ) {

          message =
            "Email tersebut sudah terdaftar di Firebase Authentication.";

        }


        else if (
          error.code ===
          "auth/invalid-email"
        ) {

          message =
            "Format email tidak valid.";

        }


        else if (
          error.code ===
          "auth/weak-password"
        ) {

          message =
            "Password minimal 6 karakter.";

        }


        else if (
          error.code ===
          "permission-denied"
        ) {

          message =
            "Firestore menolak pembuatan data users. Pastikan akun admin memiliki role=admin dan active=true.";

        }


        toast(
          message,
          "error"
        );


        /*
         * Jangan biarkan secondary auth
         * tetap login jika terjadi error.
         */

        try {

          if (secondaryApp) {

            const secondaryAuth =
              getSecondaryAuth(
                secondaryApp
              );

            await secondarySignOut(
              secondaryAuth
            );

          }

        } catch (_) {}

      }

    };

}
