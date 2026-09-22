import { auth, db, storage } from "./firebase.js";
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
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";


/* =========================================================
   GLOBAL
========================================================= */

let me = null;

let tasks = [];

let selectedTask = null;

let selectedBcl = null;

let stream = null;

let facing = "environment";

let coords = null;

let photoBlob = null;

let scanner = null;

let locationWatchId = null;

let locationSearching = false;


/* =========================================================
   GUARD
========================================================= */

guard("zmart", async (user, p) => {

  me = {
    ...p,
    uid: user.uid
  };

  qs("#zmartName").textContent =
    p.name || user.email;

  qs("#hello").textContent =
    `Halo, ${p.name || "ZMart"} 👋`;

  bind();

  await loadTasks();

  renderHome();

  renderTasks();

  renderHistory();

});


/* =========================================================
   BIND
========================================================= */

function bind() {

  qs("#logoutBtn").onclick = logout;

  qsa(".bottom-nav button").forEach(btn => {

    btn.onclick = () => {
      showZView(btn.dataset.zview);
    };

  });


  qs("#openTasksBtn").onclick = () => {
    showZView("tasksView");
  };


  qs("#backTasks").onclick = () => {
    stopScanner();
    stopCamera();
    stopLocationWatch();

    showZView("tasksView");
  };


  qs("#startScan").onclick = startScanner;


  qs("#manualFind").onclick = () => {

    const id =
      qs("#manualBclId").value.trim();

    findBcl(id);

  };


  qs("#toPhoto").onclick = toPhoto;


  qs("#takePhoto").onclick = takePhoto;


  qs("#switchCamera").onclick = async () => {

    facing =
      facing === "environment"
        ? "user"
        : "environment";

    if (stream) {

      stopCamera();

      await startCamera();

    }

  };


  qs("#submitDelivery").onclick =
    submitDelivery;

}


/* =========================================================
   VIEW
========================================================= */

function showZView(id) {

  qsa(".mobile-content>.view").forEach(view => {

    view.classList.toggle(
      "active",
      view.id === id
    );

  });


  qsa(".bottom-nav button").forEach(btn => {

    btn.classList.toggle(
      "active",
      btn.dataset.zview === id
    );

  });


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* =========================================================
   LOAD TASK
========================================================= */

async function loadTasks() {

  const snap = await getDocs(

    query(
      collection(db, "assignments"),
      where("zmartUid", "==", me.uid)
    )

  );


  tasks = snap.docs

    .map(x => ({
      id: x.id,
      ...x.data()
    }))

    .filter(x =>
      x.status === "ASSIGNED" ||
      x.status === "IN_PROGRESS"
    );

}


/* =========================================================
   HOME
========================================================= */

function renderHome() {

  const done =
    tasks.filter(
      x => x.status === "DONE"
    ).length;


  qs("#taskTotal").textContent =
    tasks.length;


  qs("#taskDone").textContent =
    done;


  const pct =
    tasks.length
      ? Math.round(done / tasks.length * 100)
      : 0;


  qs("#progressText").textContent =
    `${done}/${tasks.length}`;


  qs("#progressBar").style.width =
    pct + "%";


  qs("#taskPreview").innerHTML =

    tasks.slice(0, 5)

      .map(t => `

        <div class="list-row">

          <div>

            <b>
              ${esc(t.bclName)}
            </b>

            <small>
              ${esc(
                t.packageName ||
                "Paket BCL"
              )}
            </small>

          </div>

          <button
            class="btn small"
            data-task="${esc(t.id)}"
            type="button"
          >
            Buka
          </button>

        </div>

      `)

      .join("")

      ||

      `<p class="muted">
        Belum ada penugasan.
      </p>`;


  qsa("[data-task]").forEach(btn => {

    btn.onclick = () =>
      openTask(btn.dataset.task);

  });

}


/* =========================================================
   TASK LIST
========================================================= */

function renderTasks() {

  qs("#taskList").innerHTML =

    tasks

      .map(t => `

        <button
          class="task-card"
          data-task="${esc(t.id)}"
          type="button"
        >

          <div class="task-avatar">
            ${esc(
              (t.bclName || "?")[0]
            )}
          </div>

          <div>

            <b>
              ${esc(t.bclName)}
            </b>

            <span>
              ${esc(t.bclId)}
              •
              ${esc(
                t.packageName ||
                "Paket BCL"
              )}
            </span>

            <small>
              ${esc(t.status)}
            </small>

          </div>

          <span>
            ›
          </span>

        </button>

      `)

      .join("")

      ||

      `<div class="card">
        <p class="muted">
          Belum ada tugas dari Admin.
        </p>
      </div>`;


  qsa("#taskList [data-task]")
    .forEach(btn => {

      btn.onclick = () =>
        openTask(btn.dataset.task);

    });

}


/* =========================================================
   HISTORY
========================================================= */

function renderHistory() {

  const wrap =
    qs("#historyList");


  getDocs(

    query(
      collection(db, "deliveries"),
      where("zmartUid", "==", me.uid),
      orderBy("createdAt", "desc")
    )

  )

    .then(snap => {

      const rows =
        snap.docs.map(x => ({
          id: x.id,
          ...x.data()
        }));


      wrap.innerHTML =

        rows

          .map(x => `

            <div class="card history-item">

              <div>

                <b>
                  ${esc(x.bclName)}
                </b>

                <span>
                  ${fmtDate(x.createdAt)}
                </span>

                <span>
                  ${esc(
                    x.district ||
                    "Lokasi tidak tersedia"
                  )}
                </span>

              </div>

              <span class="badge">
                ${esc(x.status)}
              </span>

              ${
                x.photoUrl
                  ? `
                    <a
                      target="_blank"
                      rel="noopener"
                      href="${esc(x.photoUrl)}"
                      class="btn small"
                    >
                      Foto
                    </a>
                  `
                  : ""
              }

            </div>

          `)

          .join("")

          ||

          `<div class="card">
            <p class="muted">
              Belum ada riwayat.
            </p>
          </div>`;

    })

    .catch(err => {

      console.error(
        "History error:",
        err
      );

    });

}


/* =========================================================
   OPEN TASK
========================================================= */

async function openTask(id) {

  selectedTask =
    tasks.find(x => x.id === id);


  if (!selectedTask) return;


  selectedBcl = null;

  coords = null;

  photoBlob = null;


  qs("#deliverTitle").textContent =
    selectedTask.bclName;


  qs("#scanResult").innerHTML = "";


  qs("#manualBclId").value =
    selectedTask.bclId;


  qs("#deliverStep2")
    .classList.add("hidden");


  qs("#deliverStep3")
    .classList.add("hidden");


  showZView("deliverView");


  await findBcl(
    selectedTask.bclId
  );

}


/* =========================================================
   FIND BCL
========================================================= */

async function findBcl(id) {

  if (!id) {

    toast(
      "Masukkan ID BCL.",
      "error"
    );

    return;

  }


  try {

    const snap =
      await getDoc(
        doc(db, "bcl", id)
      );


    if (!snap.exists()) {

      toast(
        "BCL tidak ditemukan.",
        "error"
      );

      return;

    }


    selectedBcl = {
      id: snap.id,
      ...snap.data()
    };


    if (
      selectedTask &&
      selectedTask.bclId !== selectedBcl.id
    ) {

      toast(
        "QR bukan BCL yang sedang ditugaskan.",
        "error"
      );

      return;

    }


    qs("#scanResult").innerHTML = `

      <div class="verified">

        <b>
          ✓ Penerima ditemukan
        </b>

        <span>
          ${esc(selectedBcl.name)}
        </span>

        <small>
          ${esc(selectedBcl.district || "")}
          •
          ${esc(selectedBcl.village || "")}
        </small>

      </div>

    `;


    qs("#deliverStep2")
      .classList.remove("hidden");


    qs("#packageName").textContent =
      selectedTask?.packageName ||
      "Paket Sembako BCL";


    const items =
      selectedTask?.items ||

      [
        { name: "Beras 5 kg" },
        { name: "Minyak Goreng 1 L" },
        { name: "Gula 1 kg" }
      ];


    qs("#itemChecklist").innerHTML =

      items

        .map((item, i) => `

          <label class="check">

            <input
              type="checkbox"
              data-item="${i}"
            >

            <span>
              ${esc(item.name)}
            </span>

          </label>

        `)

        .join("");


  } catch (error) {

    console.error(
      "Find BCL:",
      error
    );

    toast(
      "Gagal membaca data BCL.",
      "error"
    );

  }

}


/* =========================================================
   QR SCANNER
========================================================= */

async function startScanner() {

  if (scanner) return;


  scanner =
    new Html5Qrcode("reader");


  try {

    await scanner.start(

      {
        facingMode: "environment"
      },

      {
        fps: 10,
        qrbox: {
          width: 250,
          height: 250
        }
      },

      text => {

        if (
          selectedTask &&
          text !== selectedTask.bclId
        ) {

          toast(
            "QR bukan BCL yang ditugaskan.",
            "error"
          );

          return;

        }


        findBcl(text);

        stopScanner();

      },

      () => {}

    );


    qs("#startScan").textContent =
      "Scanner aktif";


  } catch (error) {

    console.error(
      "Scanner:",
      error
    );


    scanner = null;


    toast(
      "Kamera/QR tidak dapat dibuka. Gunakan input manual.",
      "error"
    );

  }

}


/* =========================================================
   STOP SCANNER
========================================================= */

async function stopScanner() {

  if (scanner) {

    try {

      await scanner.stop();

    } catch {}

    try {

      scanner.clear();

    } catch {}

    scanner = null;

  }


  if (qs("#startScan")) {

    qs("#startScan").textContent =
      "Buka Scanner";

  }

}


/* =========================================================
   TO PHOTO
========================================================= */

async function toPhoto() {

  const checks =
    [
      ...document.querySelectorAll(
        "[data-item]"
      )
    ];


  if (
    checks.some(
      x => !x.checked
    )
  ) {

    toast(
      "Centang semua sembako sebelum lanjut.",
      "error"
    );

    return;

  }


  qs("#deliverStep3")
    .classList.remove("hidden");


  qs("#submitDelivery").disabled =
    true;


  /*
   * Jalankan kamera dan GPS
   * secara BERSAMAAN.
   */

  startCamera();

  startFastLocation();

}


/* =========================================================
   CAMERA
========================================================= */

async function startCamera() {

  try {

    if (stream) {

      stopCamera();

    }


    stream =
      await navigator.mediaDevices
        .getUserMedia({

          video: {

            facingMode: {
              ideal: facing
            },

            width: {
              ideal: 1280
            },

            height: {
              ideal: 720
            },

            frameRate: {
              ideal: 30
            }

          },

          audio: false

        });


    qs("#camera").srcObject =
      stream;


  } catch (error) {

    console.error(
      "Camera:",
      error
    );


    toast(
      "Kamera tidak tersedia. Pastikan HTTPS dan izin kamera aktif.",
      "error"
    );

  }

}


/* =========================================================
   STOP CAMERA
========================================================= */

function stopCamera() {

  if (stream) {

    stream
      .getTracks()
      .forEach(track =>
        track.stop()
      );

    stream = null;

  }

}


/* =========================================================
   TAKE PHOTO
========================================================= */

function takePhoto() {

  const video =
    qs("#camera");

  const canvas =
    qs("#canvas");


  if (!stream) {

    toast(
      "Kamera belum aktif.",
      "error"
    );

    return;

  }


  if (
    !video.videoWidth ||
    !video.videoHeight
  ) {

    toast(
      "Kamera belum siap. Tunggu sebentar.",
      "error"
    );

    return;

  }


  const maxW = 1280;


  const scale =
    Math.min(
      1,
      maxW / video.videoWidth
    );


  canvas.width =
    Math.round(
      video.videoWidth * scale
    );


  canvas.height =
    Math.round(
      video.videoHeight * scale
    );


  const ctx =
    canvas.getContext("2d");


  ctx.drawImage(
    video,
    0,
    0,
    canvas.width,
    canvas.height
  );


  canvas.toBlob(

    blob => {

      if (!blob) {

        toast(
          "Gagal membuat foto.",
          "error"
        );

        return;

      }


      photoBlob = blob;


      const oldUrl =
        qs("#photoPreview").dataset.url;


      if (oldUrl) {

        URL.revokeObjectURL(
          oldUrl
        );

      }


      const url =
        URL.createObjectURL(blob);


      qs("#photoPreview").dataset.url =
        url;


      qs("#photoPreview").src =
        url;


      qs("#photoPreview")
        .classList.remove("hidden");


      qs("#camera")
        .classList.add("hidden");


      updateSubmitState();

    },

    "image/jpeg",

    0.78

  );

}


/* =========================================================
   FAST LOCATION
=========================================================

   METODE:

   1. maximumAge 5 menit
      -> ambil lokasi cache/network terlebih dahulu

   2. enableHighAccuracy false
      -> jauh lebih cepat di HP

   3. Setelah lokasi pertama didapat,
      coba GPS akurasi tinggi di background.

========================================================= */

function startFastLocation() {

  stopLocationWatch();


  coords = null;

  locationSearching = true;


  setLocationUI(
    "loading",
    "Mencari lokasi...",
    "Mengambil lokasi perangkat. Biasanya hanya beberapa detik."
  );


  if (!navigator.geolocation) {

    locationSearching = false;

    setLocationUI(
      "error",
      "GPS tidak didukung",
      "Browser perangkat ini tidak mendukung Geolocation."
    );

    return;

  }


  /*
   * PANGGILAN PERTAMA
   *
   * Fokus ke KECEPATAN.
   */

  navigator.geolocation.getCurrentPosition(

    position => {

      setCoordinates(
        position,
        "Lokasi cepat didapat"
      );


      /*
       * Setelah lokasi cepat didapat,
       * kita coba tingkatkan akurasinya
       * tanpa menghalangi user.
       */

      startHighAccuracyWatch();

    },

    error => {

      console.warn(
        "Fast location error:",
        error
      );


      /*
       * Jika cache/network gagal,
       * langsung coba GPS presisi.
       */

      startHighAccuracyLocation();

    },

    {

      enableHighAccuracy: false,

      timeout: 5000,

      maximumAge: 300000

    }

  );

}


/* =========================================================
   HIGH ACCURACY FALLBACK
========================================================= */

function startHighAccuracyLocation() {

  setLocationUI(
    "loading",
    "Mencari GPS...",
    "Lokasi cepat belum tersedia. Sedang mencoba GPS perangkat."
  );


  navigator.geolocation.getCurrentPosition(

    position => {

      setCoordinates(
        position,
        "Lokasi GPS didapat"
      );

    },

    error => {

      console.warn(
        "GPS error:",
        error
      );


      locationSearching = false;


      let message =
        "Lokasi tidak berhasil diperoleh.";


      if (
        error.code ===
        error.PERMISSION_DENIED
      ) {

        message =
          "Izin lokasi ditolak. Aktifkan izin lokasi browser.";

      }

      else if (
        error.code ===
        error.POSITION_UNAVAILABLE
      ) {

        message =
          "Lokasi tidak tersedia. Pastikan GPS/lokasi HP aktif.";

      }

      else if (
        error.code ===
        error.TIMEOUT
      ) {

        message =
          "GPS terlalu lama merespons.";

      }


      setLocationUI(
        "error",
        "Lokasi gagal",
        message
      );


      toast(
        message,
        "error"
      );

    },

    {

      enableHighAccuracy: true,

      timeout: 10000,

      maximumAge: 30000

    }

  );

}


/* =========================================================
   HIGH ACCURACY WATCH
========================================================= */

function startHighAccuracyWatch() {

  stopLocationWatch();


  /*
   * Watch GPS di background.
   *
   * Tidak menghalangi user.
   */

  locationWatchId =
    navigator.geolocation.watchPosition(

      position => {

        if (
          !coords ||
          position.coords.accuracy <
          coords.accuracy
        ) {

          setCoordinates(
            position,
            "Akurasi lokasi ditingkatkan"
          );

        }

      },

      error => {

        console.warn(
          "GPS watch:",
          error
        );

      },

      {

        enableHighAccuracy: true,

        timeout: 8000,

        maximumAge: 30000

      }

    );

}


/* =========================================================
   SET COORDINATES
========================================================= */

function setCoordinates(
  position,
  title = "Lokasi didapat"
) {

  const c =
    position.coords;


  coords = {

    latitude:
      Number(c.latitude),

    longitude:
      Number(c.longitude),

    accuracy:
      Number(c.accuracy || 9999)

  };


  locationSearching = false;


  setLocationUI(

    "success",

    title,

    `Lat ${coords.latitude.toFixed(6)}
     • Lng ${coords.longitude.toFixed(6)}
     • ±${Math.round(coords.accuracy)} m`

  );


  updateSubmitState();

}


/* =========================================================
   LOCATION UI
========================================================= */

function setLocationUI(
  type,
  title,
  detail
) {

  const box =
    qs("#locationBox");


  if (!box) return;


  box.className =
    "location-box " + type;


  if (type === "loading") {

    box.innerHTML = `

      <div class="location-status">

        <div class="location-icon">

          <div class="location-spinner"></div>

        </div>

        <div>

          <b>
            ${esc(title)}
          </b>

          <div class="location-detail">
            ${esc(detail)}
          </div>

        </div>

      </div>

    `;

    return;

  }


  if (type === "success") {

    box.innerHTML = `

      <div class="location-status">

        <div class="location-icon">
          ✓
        </div>

        <div>

          <b>
            ${esc(title)}
          </b>

          <div class="location-detail">
            ${esc(detail)}
          </div>

        </div>

      </div>

    `;

    return;

  }


  if (type === "error") {

    box.innerHTML = `

      <div class="location-status">

        <div class="location-icon">
          !
        </div>

        <div>

          <b>
            ${esc(title)}
          </b>

          <div class="location-detail">
            ${esc(detail)}
          </div>

          <button
            type="button"
            class="location-retry"
            id="retryLocation"
          >
            Coba Lagi
          </button>

        </div>

      </div>

    `;


    const retry =
      qs("#retryLocation");


    if (retry) {

      retry.onclick =
        startFastLocation;

    }

  }

}


/* =========================================================
   STOP LOCATION WATCH
========================================================= */

function stopLocationWatch() {

  if (
    locationWatchId !== null
  ) {

    navigator.geolocation.clearWatch(
      locationWatchId
    );

    locationWatchId = null;

  }

}


/* =========================================================
   SUBMIT STATE
========================================================= */

function updateSubmitState() {

  const button =
    qs("#submitDelivery");


  if (!button) return;


  const ready =
    !!coords &&
    !!photoBlob;


  button.disabled =
    !ready;


  if (ready) {

    button.textContent =
      "Submit Penyaluran";

  }

}


/* =========================================================
   SUBMIT DELIVERY
========================================================= */

async function submitDelivery() {

  if (
    !selectedTask ||
    !selectedBcl ||
    !photoBlob ||
    !coords
  ) {

    toast(
      "Foto dan lokasi wajib tersedia.",
      "error"
    );

    return;

  }


  const button =
    qs("#submitDelivery");


  button.disabled =
    true;


  button.textContent =
    "Mengirim...";


  try {

    const stamp =
      Date.now();


    const path =
      `users/${me.uid}/deliveries/${selectedTask.id}/${stamp}.jpg`;


    const storageRef =
      ref(storage, path);


    await uploadBytes(
      storageRef,
      photoBlob,
      {

        contentType:
          "image/jpeg",

        customMetadata: {

          bclId:
            selectedBcl.id,

          zmartUid:
            me.uid

        }

      }
    );


    const photoUrl =
      await getDownloadURL(
        storageRef
      );


    await addDoc(

      collection(
        db,
        "deliveries"
      ),

      {

        assignmentId:
          selectedTask.id,

        bclId:
          selectedBcl.id,

        bclName:
          selectedBcl.name,

        zmartUid:
          me.uid,

        zmartName:
          me.name || "",

        district:
          selectedBcl.district || "",

        latitude:
          coords.latitude,

        longitude:
          coords.longitude,

        accuracy:
          coords.accuracy,

        photoUrl,

        photoPath:
          path,

        status:
          "SUBMITTED",

        createdAt:
          serverTimestamp()

      }

    );


    await updateDoc(

      doc(
        db,
        "assignments",
        selectedTask.id
      ),

      {

        status:
          "DONE",

        completedAt:
          serverTimestamp()

      }

    );


    await updateDoc(

      doc(
        db,
        "bcl",
        selectedBcl.id
      ),

      {

        status:
          "SELESAI",

        deliveredAt:
          serverTimestamp()

      }

    );


    toast(
      "Penyaluran berhasil disubmit."
    );


    stopCamera();

    stopLocationWatch();

    await loadTasks();

    renderHome();

    renderTasks();

    renderHistory();

    resetDeliver();

    showZView("homeView");


  } catch (error) {

    console.error(
      "Submit delivery:",
      error
    );


    toast(
      error.message ||
      "Upload gagal.",
      "error"
    );


    button.disabled =
      false;

    button.textContent =
      "Submit Penyaluran";

  }

}


/* =========================================================
   RESET DELIVERY
========================================================= */

function resetDeliver() {

  stopScanner();

  stopCamera();

  stopLocationWatch();


  selectedTask =
    null;


  selectedBcl =
    null;


  photoBlob =
    null;


  coords =
    null;


  locationSearching =
    false;


  qs("#deliverStep2")
    .classList.add("hidden");


  qs("#deliverStep3")
    .classList.add("hidden");


  qs("#camera")
    .classList.remove("hidden");


  qs("#photoPreview")
    .classList.add("hidden");


  qs("#submitDelivery").textContent =
    "Submit Penyaluran";


  qs("#submitDelivery").disabled =
    true;


  qs("#scanResult").innerHTML =
    "";


  qs("#manualBclId").value =
    "";


  setLocationUI(
    "loading",
    "Menunggu lokasi...",
    "Lokasi akan dicari saat proses penyaluran dimulai."
  );

}
