const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

let testEnv;
const PROJECT_ID = process.env.GCP_PROJECT || "demo-no-project";
const ALICE_UID = "alice_123";
const BOB_UID = "bob_456";

const [emulatorHost, emulatorPortStr] = (
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085"
).split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: emulatorHost,
      port: emulatorPort,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

test("Unauthenticated user: denied all reads and writes", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const now = new Date(Date.now() - 1000);

  await assertFails(unauthDb.collection("users").doc(ALICE_UID).get());
  await assertFails(
    unauthDb.collection("users").doc(ALICE_UID).collection("complaints").get()
  );
  await assertFails(
    unauthDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("complaints")
      .doc("cmp_1")
      .set({
        userId: ALICE_UID,
        ticketCode: "ADU-CLOUD-001",
        category: "Fasilitas Kelas / Toilet / Kantin",
        urgency: "Penting",
        locationDetail: "Toilet Lantai 1",
        description: "Kunci pintu rusak perlu segera diperbaiki.",
        status: "Diterima",
        anonymousReport: false,
        priorityRentan: false,
        createdAt: now,
        updatedAt: now,
      })
  );
});

test("UserProfile: owner create & partial update succeed, cross-user & ghost fields fail", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const created = new Date(Date.now() - 10000);

  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).set({
      userId: ALICE_UID,
      displayName: "Ibu Kartini",
      email: "kartini@example.com",
      roleLabel: "Orang Tua / Wali",
      createdAt: created,
      updatedAt: created,
    })
  );

  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).update({
      displayName: "Ibu Kartini (Wali IV-A)",
      updatedAt: new Date(Date.now() - 1000),
    })
  );

  // Reject future timestamp
  await assertFails(
    aliceDb.collection("users").doc(ALICE_UID).update({
      displayName: "Future Time",
      updatedAt: new Date(Date.now() + 60000),
    })
  );

  // Reject ghost field (shadow update)
  await assertFails(
    aliceDb.collection("users").doc(ALICE_UID).update({
      isAdmin: true,
      updatedAt: new Date(Date.now() - 500),
    })
  );

  // Reject cross-user read and root list
  await assertFails(bobDb.collection("users").doc(ALICE_UID).get());
  await assertFails(aliceDb.collection("users").get());
});

test("CloudComplaint: Kotlin create, list, status update & terminal lock work; invalid payloads fail", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const created = new Date(Date.now() - 10000);

  const complaintRef = aliceDb
    .collection("users")
    .doc(ALICE_UID)
    .collection("complaints")
    .doc("cmp_001");

  // Valid create with full LAKSA+ schema & UU PDP anonymity (no reporterName, no @DocumentId id)
  await assertSucceeds(
    complaintRef.set({
      userId: ALICE_UID,
      ticketCode: "ADU-MONSA-101",
      category: "Perundungan / Bullying (TPPK)",
      urgency: "Darurat Anak",
      locationDetail: "Selasar Kelas IV",
      studentInfo: "Kelas IV-A",
      description: "Mohon pendampingan guru piket untuk siswa kelas IV.",
      status: "Diterima",
      anonymousReport: true,
      priorityRentan: true,
      vulnerableGroup: "Penyandang Disabilitas / Siswa Inklusi",
      disabilityType: "Disabilitas Intelektual / Inklusi",
      specialNeedNote: "Mohon balas lewat pesan teks WA dan didampingi guru inklusi.",
      routedTo: "Tim TPPK & Kepala Sekolah",
      createdAt: created,
      updatedAt: created,
    })
  );

  // Valid non-anonymous create with reporterName
  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("complaints")
      .doc("cmp_named")
      .set({
        userId: ALICE_UID,
        ticketCode: "ADU-MONSA-103",
        category: "Fasilitas Kelas / Toilet / Kantin",
        urgency: "Penting",
        locationDetail: "Toilet Inklusi Lantai 1",
        studentInfo: "Kelas III-B",
        description: "Pegangan tangan di toilet disabilitas perlu dikencangkan.",
        status: "Diterima",
        anonymousReport: false,
        reporterName: "Ibu Kartini",
        priorityRentan: true,
        vulnerableGroup: "Penyandang Disabilitas / Siswa Inklusi",
        disabilityType: "Disabilitas Fisik / Kursi Roda",
        routedTo: "Tim Sarpras & K3 Sekolah",
        createdAt: created,
        updatedAt: created,
      })
  );

  // Reject reporterName when anonymousReport is true (UU PDP privacy invariant)
  await assertFails(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("complaints")
      .doc("cmp_anon_leak")
      .set({
        userId: ALICE_UID,
        ticketCode: "ADU-MONSA-104",
        category: "Saran & Aspirasi Sekolah",
        urgency: "Biasa",
        locationDetail: "Loket TU",
        description: "Laporan anonim tidak boleh menyertakan nama pelapor.",
        status: "Diterima",
        anonymousReport: true,
        reporterName: "Nama Bocor",
        priorityRentan: false,
        createdAt: created,
        updatedAt: created,
      })
  );

  // Owner list & Firestore status-filtered queries (Menunggu, Diproses, Selesai) succeed
  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).collection("complaints").get()
  );
  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("complaints")
      .where("status", "==", "Diterima")
      .get()
  );
  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("complaints")
      .where("status", "in", ["Diverifikasi Piket/TPPK", "Ditangani TPPK/Kepsek"])
      .get()
  );
  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("complaints")
      .where("status", "==", "Selesai")
      .get()
  );

  // Reject `@DocumentId` id field on create
  await assertFails(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("complaints")
      .doc("cmp_002")
      .set({
        id: "cmp_002",
        userId: ALICE_UID,
        ticketCode: "ADU-MONSA-102",
        category: "Saran & Aspirasi Sekolah",
        urgency: "Biasa",
        locationDetail: "Halaman Sekolah",
        description: "Penambahan bangku taman untuk ruang tunggu orang tua.",
        status: "Diterima",
        anonymousReport: false,
        priorityRentan: false,
        createdAt: created,
        updatedAt: created,
      })
  );

  // Valid workflow status transition: Diterima (Menunggu) -> Ditangani TPPK/Kepsek (Diproses) -> Selesai
  await assertSucceeds(
    complaintRef.update({
      status: "Ditangani TPPK/Kepsek",
      updatedAt: new Date(Date.now() - 3000),
    })
  );

  await assertSucceeds(
    complaintRef.update({
      status: "Selesai",
      updatedAt: new Date(Date.now() - 2000),
    })
  );

  // Terminal state lock: once Selesai, cannot be updated further
  await assertFails(
    complaintRef.update({
      status: "Diterima",
      updatedAt: new Date(Date.now() - 1000),
    })
  );

  // Cross-user access denied
  await assertFails(
    bobDb.collection("users").doc(ALICE_UID).collection("complaints").get()
  );
  await assertFails(
    bobDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("complaints")
      .doc("cmp_001")
      .get()
  );
});

test("GeminiChatMessage: owner create, list & delete succeed; update & cross-user fail", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const created = new Date(Date.now() - 5000);

  const msgRef = aliceDb
    .collection("users")
    .doc(ALICE_UID)
    .collection("chatMessages")
    .doc("msg_001");

  await assertSucceeds(
    msgRef.set({
      userId: ALICE_UID,
      sender: "user",
      text: "Bagaimana alur pengaduan ramah kelompok rentan di SDN Mongisidi 1?",
      modelUsed: "gemini-3.8-flash",
      createdAt: created,
    })
  );

  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).collection("chatMessages").get()
  );

  // Immutable chat messages cannot be edited
  await assertFails(msgRef.update({ text: "Edited message" }));

  // Cross-user read denied
  await assertFails(
    bobDb.collection("users").doc(ALICE_UID).collection("chatMessages").get()
  );

  // Owner can clear history
  await assertSucceeds(msgRef.delete());
});

test("StatusNotification: owner create, list, mark-read & delete succeed; content tamper & cross-user fail", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const created = new Date(Date.now() - 5000);

  const notifRef = aliceDb
    .collection("users")
    .doc(ALICE_UID)
    .collection("notifications")
    .doc("notif_001");

  // Valid create (read must start false)
  await assertSucceeds(
    notifRef.set({
      userId: ALICE_UID,
      complaintId: "cmp_001",
      ticketCode: "ADU-MONSA-101",
      category: "Perundungan / Bullying (TPPK)",
      previousStatus: "Diterima",
      newStatus: "Ditangani TPPK/Kepsek",
      title: "Status Pengaduan Diperbarui",
      message: "Tiket ADU-MONSA-101 berubah dari Diterima menjadi Ditangani TPPK/Kepsek.",
      read: false,
      createdAt: created,
    })
  );

  // Owner list succeeds
  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).collection("notifications").get()
  );

  // Reject tampering message text on update
  await assertFails(
    notifRef.update({
      message: "Pesan dipalsukan",
      read: true,
      readAt: new Date(Date.now() - 1000),
    })
  );

  // Valid mark-as-read update
  await assertSucceeds(
    notifRef.update({
      read: true,
      readAt: new Date(Date.now() - 1000),
    })
  );

  // Cross-user read and write denied
  await assertFails(
    bobDb.collection("users").doc(ALICE_UID).collection("notifications").get()
  );
  await assertFails(
    bobDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("notifications")
      .doc("notif_001")
      .delete()
  );

  // Owner can delete notification
  await assertSucceeds(notifRef.delete());
});

test("School Admin RBAC: verified admin monitors all complaints via collectionGroup; regular users cannot escalate", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const adminDb = testEnv
    .authenticatedContext("admin_uid_001", {
      email: "amhyer21091993@gmail.com",
      email_verified: true,
    })
    .firestore();
  const created = new Date(Date.now() - 10000);

  // Regular user cannot self-assign admin role on create
  await assertFails(
    bobDb.collection("users").doc(BOB_UID).set({
      userId: BOB_UID,
      displayName: "Bob",
      role: "admin",
      roleLabel: "Admin Palsu",
      createdAt: created,
      updatedAt: created,
    })
  );

  // Alice creates a complaint
  const aliceComplaint = aliceDb
    .collection("users")
    .doc(ALICE_UID)
    .collection("complaints")
    .doc("cmp_school_01");

  await assertSucceeds(
    aliceComplaint.set({
      userId: ALICE_UID,
      ticketCode: "ADU-MONSA-901",
      category: "Fasilitas Kelas / Toilet / Kantin",
      urgency: "Penting",
      locationDetail: "Ruang UKS",
      description: "Lampu ruang UKS padam perlu penggantian segera.",
      status: "Diterima",
      anonymousReport: false,
      priorityRentan: false,
      createdAt: created,
      updatedAt: created,
    })
  );

  // Regular user Bob cannot run collectionGroup query across all complaints
  await assertFails(bobDb.collectionGroup("complaints").get());

  // Verified school admin can monitor all complaints via collectionGroup
  await assertSucceeds(adminDb.collectionGroup("complaints").get());

  // Verified school admin can advance complaint status
  await assertSucceeds(
    adminDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("complaints")
      .doc("cmp_school_01")
      .update({
        status: "Ditangani TPPK/Kepsek",
        updatedAt: new Date(Date.now() - 1000),
      })
  );
});


