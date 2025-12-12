import fetch from "node-fetch";

function formatDateEU() {
    const d = new Date();
    return `${d.getDate().toString().padStart(2,"0")}/${
        (d.getMonth()+1).toString().padStart(2,"0")
    }/${d.getFullYear()}`;
}

(async () => {
    const today = formatDateEU();

    try {
        // 1) AUTH LOGIN
        const authUrl = `https://portal.parkingns.rs/portal/auth/login?username=${process.env.PNS_USER}&password=${process.env.PNS_PASS}`;

        const authRes = await fetch(authUrl, {
            method: "GET",
            headers: {
                "Accept": "application/json, text/plain, */*",
                "User-Agent": "GitHubActionBot"
            }
        });

        if (!authRes.ok) {
            throw new Error(`AUTH FAILED (${authRes.status})`);
        }

        const authBody = await authRes.json();
        const token = authBody.token; // odgovor iz NS portala ima {token: "..."}
        
        if (!token) {
            throw new Error("Token not found in AUTH response");
        }

        console.log(`[${today}] AUTH OK – token acquired.`);

        // 2) FETCH KAZNI
        const dataRes = await fetch("https://portal.parkingns.rs/portal/user/userPPK?page=1", {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`,
                "User-Agent": "GitHubActionBot"
            }
        });

        if (!dataRes.ok) {
            throw new Error(`FETCH FAILED (${dataRes.status})`);
        }

        const resp = await dataRes.json();

        let message = "";

        if (resp.count === 0 && Array.isArray(resp.rows) && resp.rows.length === 0) {
            message = `[${today}] Nema izdatih kazni.`;
            console.log(message);
        } else {
            message = `[${today}] POSTOJE KAZNE – DORADI QR KOD!`;
            console.log(message);
        }

        // 3) PUSH NOTIFIKACIJA (ntfy)
        await fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: message
        });

        console.log(`[${today}] Notifikacija poslata.`);

    } catch (err) {
        console.error("ERROR:", err.message);

        // pošalji notifikaciju i za grešku
        await fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: `❌ ERROR: ${err.message}`
        });

        process.exit(1);
    }
})();
