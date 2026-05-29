const TABIDOO_BASE = "https://app.tabidoo.cloud/api/v2";

function getConfig() {
  const token = process.env.TABIDOO_API_TOKEN;
  const appId = process.env.TABIDOO_APP_ID;
  const schema = process.env.TABIDOO_SCHEMA || "objednavky";
  if (!token) throw new Error("TABIDOO_API_TOKEN není nastavený v server/.env");
  if (!appId) throw new Error("TABIDOO_APP_ID není nastavený v server/.env");
  return { token, appId, schema };
}

/**
 * Vytvoří nový záznam v Tabidoo tabulce.
 * @param {Record<string, any>} fields — mapa fieldName → value
 * @returns {Promise<{id: string, raw: any}>}
 */
export async function createTabidooRecord(fields) {
  const { token, appId, schema } = getConfig();
  const url = `${TABIDOO_BASE}/apps/${appId}/schemas/${schema}/data`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ fields }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Tabidoo ${res.status}: ${text.slice(0, 500)}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Tabidoo vrátil neplatný JSON: " + text.slice(0, 300));
  }
  const id = data?.data?.id || data?.id;
  if (!id) throw new Error("Tabidoo neposlal id záznamu: " + text.slice(0, 300));
  return { id, raw: data };
}

export function tabidooStatus() {
  return {
    configured:
      Boolean(process.env.TABIDOO_API_TOKEN) && Boolean(process.env.TABIDOO_APP_ID),
  };
}
