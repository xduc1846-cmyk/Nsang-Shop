const {onRequest} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// Webhook nhận giao dịch từ SePay (sepay.vn). Đặt SEPAY_KEY trùng "API Key" khai báo bên SePay.
exports.sepayWebhook = onRequest({region: 'asia-southeast1', secrets: ['SEPAY_KEY']}, async (req, res) => {
  if (req.get('Authorization') !== 'Apikey ' + process.env.SEPAY_KEY) return res.status(401).json({success: false});
  const d = req.body || {};
  if (d.transferType !== 'in') return res.json({success: true});
  const m = String(d.content || '').toUpperCase().match(/NAP\s*(\d{6}|NS[A-Z0-9]{6})/);
  const amount = Number(d.transferAmount);
  if (!m || !(amount > 0)) return res.json({success: true});
  const txId = 'SP' + d.id; // chống cộng trùng khi SePay gửi lại
  const users = await db.collection('users').where('code', '==', m[1]).limit(1).get();
  if (users.empty) return res.json({success: true});
  const uref = users.docs[0].ref, tref = uref.collection('tx').doc(txId);
  await db.runTransaction(async t => {
    if ((await t.get(tref)).exists) return;
    const bal = (await t.get(uref)).data().balance || 0;
    t.update(uref, {balance: bal + amount});
    t.set(tref, {type: 'nap', amt: amount, note: 'Nạp qua QR · ' + m[1], at: Date.now(), after: bal + amount});
  });
  res.json({success: true});
});
