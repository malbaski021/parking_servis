import fetch from "node-fetch";

function formatDateEU(date = new Date()) {
  const d = date;
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${d.getFullYear()}`;
}

// opazen2: ISO -> "HH:MM - DD/MM/YY"
function formatOpazen2(isoString) {
  const d = new Date(isoString);

  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  const mo = (d.getMonth() + 1).toString().padStart(2, "0");
  const yy = d.getFullYear().toString().slice(-2);

  return `${hh}:${mm} - ${dd}/${mo}/${yy}`;
}

async function sendNtfy(message, attachUrl = null) {
  const headers = { "Content-Type": "text/plain" };
  if (attachUrl) headers["X-Attach"] = attachUrl;

  await fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
    method: "POST",
    headers,
    body: message,
  });
}

(async () => {
  const today = formatDateEU();

  try {
    // 0) BASIC ENV CHECK (optional but helpful)
    if (!process.env.PNS_USER || !process.env.PNS_PASS || !process.env.NTFY_TOPIC) {
      throw new Error("Missing env vars: PNS_USER, PNS_PASS, or NTFY_TOPIC");
    }

    // 1) AUTH LOGIN
    const authUrl = `https://portal.parkingns.rs/portal/auth/login?username=${encodeURIComponent(
      process.env.PNS_USER
    )}&password=${encodeURIComponent(process.env.PNS_PASS)}`;

    const authRes = await fetch(authUrl, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "GitHubActionBot",
      },
    });

    if (!authRes.ok) {
      throw new Error(`AUTH FAILED (${authRes.status})`);
    }

    const authBody = await authRes.json();

    const token = authBody.accessToken || authBody.token;

    if (!token) {
      throw new Error("Token not found in AUTH response");
    }

    console.log(`[${today}] AUTH OK – token acquired.`);

    // 2) FETCH KAZNI
    const dataRes = await fetch("https://portal.parkingns.rs/portal/user/userPPK?page=1", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "GitHubActionBot",
      },
    });

    if (!dataRes.ok) {
      throw new Error(`FETCH FAILED (${dataRes.status})`);
    }

    const resp = await dataRes.json();
    const rows = Array.isArray(resp.rows) ? resp.rows : [];
    const count = typeof resp.count === "number" ? resp.count : rows.length;

    // 3) NOTIFIKACIJE
    if (count === 0 || rows.length === 0) {
      const message = `DATUM: ${today}\nNema izdatih kazni.`;
      console.log(message);

      await sendNtfy(message);
      console.log(`[${today}] Notifikacija poslata.`);
      return;
    }

    // 3a) HEADER poruka (samo jednom)
    const headerMsg = `DATUM: ${today}\nUkupno parking kazni: ${count}`;
    console.log(headerMsg);
    await sendNtfy(headerMsg);

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      const message =
        `Parking kazna: ${i + 1}\n` +
        `Datum: ${formatOpazen2(r.opazen2)}\n` +
        `Ulica: ${r.nazivFp}`;

      // QR kao PNG slika (attachment)
      const qrPngUrl = r.qrcode
        ? `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(
            r.qrcode
          )}`
        : null;

      console.log(`[${today}] Slanje kazne ${i + 1}${qrPngUrl ? " (QR attach)" : ""}...`);
      await sendNtfy(message, qrPngUrl);
    }

    console.log(`[${today}] Sve notifikacije poslate.`);
  } catch (err) {
    console.error("ERROR:", err?.message || String(err));

    try {
      await sendNtfy(`❌ ERROR: ${err?.message || String(err)}`);
    } catch (notifyErr) {
      console.error("FAILED TO SEND ERROR NOTIFICATION:", notifyErr?.message || String(notifyErr));
    }

    process.exit(1);
  }
})();
