interface NpmTokenResponse {
  readonly token?: string;
}

interface NpmProxyHost {
  readonly id: number;
  readonly domain_names: string[];
  readonly certificate_id: number;
}

function config() {
  const apiUrl = process.env.NPM_API_URL?.replace(/\/$/, "");
  const identity = process.env.NPM_ADMIN_EMAIL;
  const secret = process.env.NPM_ADMIN_PASSWORD;
  if (!apiUrl || !identity || !secret) return null;
  return {
    apiUrl,
    identity,
    secret,
    forwardHost: process.env.CUSTOM_DOMAIN_FORWARD_HOST ?? "ts-scheduler-app",
    forwardPort: Number(process.env.CUSTOM_DOMAIN_FORWARD_PORT ?? "3000"),
  };
}

async function npmRequest<T>(
  url: string,
  token: string | undefined,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error(`proxy manager returned ${response.status}`);
  return response.json() as Promise<T>;
}

export async function provisionCustomDomain(hostname: string): Promise<"provisioned" | "not_configured"> {
  const settings = config();
  if (!settings) return "not_configured";
  const auth = await npmRequest<NpmTokenResponse>(`${settings.apiUrl}/tokens`, undefined, {
    method: "POST",
    body: JSON.stringify({ identity: settings.identity, secret: settings.secret }),
  });
  if (!auth.token) throw new Error("proxy manager did not return a token");
  const hosts = await npmRequest<NpmProxyHost[]>(
    `${settings.apiUrl}/nginx/proxy-hosts`,
    auth.token,
  );
  if (hosts.some((host) => host.domain_names.includes(hostname))) return "provisioned";

  const created = await npmRequest<NpmProxyHost>(
    `${settings.apiUrl}/nginx/proxy-hosts`,
    auth.token,
    {
      method: "POST",
      body: JSON.stringify({
        domain_names: [hostname],
        forward_scheme: "http",
        forward_host: settings.forwardHost,
        forward_port: settings.forwardPort,
        allow_websocket_upgrade: true,
        block_exploits: true,
        caching_enabled: false,
        certificate_id: "new",
        ssl_forced: true,
        http2_support: true,
        hsts_enabled: true,
        hsts_subdomains: false,
        meta: {
          letsencrypt_agree: true,
          letsencrypt_email: process.env.NPM_LETSENCRYPT_EMAIL ?? "admin@calpaca.io",
          dns_challenge: false,
        },
        advanced_config: "",
        locations: [],
      }),
    },
  );
  await npmRequest<NpmProxyHost>(
    `${settings.apiUrl}/nginx/proxy-hosts/${created.id}`,
    auth.token,
    {
      method: "PUT",
      body: JSON.stringify({
        domain_names: [hostname],
        forward_scheme: "http",
        forward_host: settings.forwardHost,
        forward_port: settings.forwardPort,
        allow_websocket_upgrade: true,
        block_exploits: true,
        caching_enabled: false,
        certificate_id: created.certificate_id,
        ssl_forced: true,
        http2_support: true,
        hsts_enabled: true,
        hsts_subdomains: false,
        meta: { dns_challenge: false },
        advanced_config: "",
        locations: [],
      }),
    },
  );
  return "provisioned";
}
