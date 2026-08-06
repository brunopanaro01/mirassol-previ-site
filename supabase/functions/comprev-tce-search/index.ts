import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const TCE_SEARCH_URL =
  "https://www.tce.mt.gov.br/processos";

const TCE_PROCESS_URL =
  "https://www.tce.mt.gov.br/processo";

const TARGET_SUBJECT =
  "APOSENTADORIA/REFORMA/RESERVAS";

const REQUEST_TIMEOUT_MS = 15000;
const MAX_RESULTS = 15;

const ALLOWED_ORIGINS = new Set([
  "https://mirassolprevi.com.br",
  "https://www.mirassolprevi.com.br",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

type ComprevCase = {
  id: string;
  beneficiary_name: string;
  beneficiary_cpf: string | null;
};

type TceSource = {
  numero_ano_protocolo?: string;
  num_protocolo?: number | string;
  ano_protocolo?: number | string;
  interessado_secundario?: string[] | string;
  cnpj_cpf_cod_tce_secundario?: string[] | string;
  desc_assunto?: string;
  descricao_processo?: string;
  protocolado_data?: string;
  relator?: string;
  procedencia?: string;
  principal?: string;
  situacao?: string;
  tipo?: string;
};

type TceItem = {
  _index?: string;
  _id?: string;
  _score?: number;
  _source?: TceSource;
};

type SearchResult = {
  number: string;
  year: number;
  protocol: string;
  url: string;
  interestedNames: string[];
  subject: string | null;
  description: string | null;
  protocolDate: string | null;
  rapporteur: string | null;
  origin: string | null;
  cpfMatch: boolean;
  exactNameMatch: boolean;
};

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";

  return {
    "Access-Control-Allow-Origin":
      ALLOWED_ORIGINS.has(origin)
        ? origin
        : "https://mirassolprevi.com.br",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":
      "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function jsonResponse(
  request: Request,
  payload: unknown,
  status = 200
) {
  return Response.json(payload, {
    status,
    headers: getCorsHeaders(request)
  });
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function asStringArray(
  value: string[] | string | undefined
) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function createNameVariations(name: string) {
  const normalized = name
    .replace(/\s+/g, " ")
    .trim();

  const ignoredWords = new Set([
    "DA",
    "DE",
    "DO",
    "DAS",
    "DOS",
    "E"
  ]);

  const relevantWords = normalized
    .split(" ")
    .filter((word) => (
      word &&
      !ignoredWords.has(normalizeText(word))
    ));

  const variations = [
    normalized,
    relevantWords.slice(0, 3).join(" ")
  ];

  if (relevantWords.length >= 2) {
    variations.push(
      `${relevantWords[0]} ${
        relevantWords[relevantWords.length - 1]
      }`
    );
  }

  return [...new Set(
    variations
      .map((item) => item.trim())
      .filter((item) => item.length >= 3)
  )];
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&#x22;/gi, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {}
) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function getInertiaVersion() {
  const response = await fetchWithTimeout(
    TCE_SEARCH_URL,
    {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 SIGPREVI-TCE-Integration/1.0"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `O portal do TCE respondeu com HTTP ${
        response.status
      }.`
    );
  }

  const html = await response.text();

  const dataPageMatch = html.match(
    /data-page=(?:"([^"]+)"|'([^']+)')/i
  );

  if (!dataPageMatch) {
    throw new Error(
      "Não foi possível identificar a versão do portal do TCE."
    );
  }

  const encodedPage =
    dataPageMatch[1] ?? dataPageMatch[2];

  const page = JSON.parse(
    decodeHtml(encodedPage)
  );

  if (
    typeof page.version !== "string" ||
    !page.version.trim()
  ) {
    throw new Error(
      "O portal do TCE não informou sua versão atual."
    );
  }

  return page.version.trim();
}

function buildSearchUrl(searchName: string) {
  const url = new URL(TCE_SEARCH_URL);

  url.searchParams.set("q", searchName);
  url.searchParams.set("operator", "PHRASE");
  url.searchParams.set("ordem", "r");
  url.searchParams.set("page", "1");
  url.searchParams.set("size", "25");
  url.searchParams.set("term_assunto", "");
  url.searchParams.set("term_conselheiro", "");
  url.searchParams.set(
    "term_exclusive_assunto",
    ""
  );
  url.searchParams.set(
    "term_exclusive_relator",
    ""
  );
  url.searchParams.set(
    "term_exclusive_tipo_decisao",
    ""
  );
  url.searchParams.set(
    "term_exclusive_tipo_doc",
    ""
  );

  url.searchParams.append(
    "type[]",
    "documento_elaborado"
  );

  url.searchParams.append(
    "type[]",
    "decisao"
  );

  url.searchParams.append(
    "type[]",
    "protocolo"
  );

  return url.toString();
}

async function searchTce(
  searchName: string,
  inertiaVersion: string
): Promise<TceItem[]> {
  const response = await fetchWithTimeout(
    buildSearchUrl(searchName),
    {
      headers: {
        "Accept": "application/json",
        "X-Inertia": "true",
        "X-Inertia-Version": inertiaVersion,
        "X-Requested-With": "XMLHttpRequest",
        "Referer": TCE_SEARCH_URL,
        "User-Agent":
          "Mozilla/5.0 SIGPREVI-TCE-Integration/1.0"
      }
    }
  );

  if (response.status === 409) {
    throw new Error(
      "A versão do portal do TCE foi alterada durante a consulta."
    );
  }

  if (!response.ok) {
    throw new Error(
      `A consulta ao TCE respondeu com HTTP ${
        response.status
      }.`
    );
  }

  const payload = await response.json();

  const items = payload?.props?.data?.data;

  return Array.isArray(items) ? items : [];
}

function extractProtocol(source: TceSource) {
  const protocol =
    String(
      source.numero_ano_protocolo ?? ""
    ).trim();

  const protocolMatch = protocol.match(
    /^(\d+)\/(\d{4})$/
  );

  if (protocolMatch) {
    return {
      number: protocolMatch[1],
      year: Number(protocolMatch[2])
    };
  }

  const number = digitsOnly(
    source.num_protocolo
  );

  const year = Number(source.ano_protocolo);

  if (
    !number ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2200
  ) {
    return null;
  }

  return { number, year };
}

function mapResult(
  item: TceItem,
  beneficiaryName: string,
  beneficiaryCpf: string | null
): SearchResult | null {
  const source = item._source;

  if (!source) {
    return null;
  }

  if (item._index !== "controlp_protocolo") {
    return null;
  }

  if (
    normalizeText(source.desc_assunto) !==
    normalizeText(TARGET_SUBJECT)
  ) {
    return null;
  }

  const protocol = extractProtocol(source);

  if (!protocol) {
    return null;
  }

  const interestedNames = asStringArray(
    source.interessado_secundario
  );

  const returnedCpfs = asStringArray(
    source.cnpj_cpf_cod_tce_secundario
  ).map(digitsOnly);

  const expectedCpf = digitsOnly(
    beneficiaryCpf
  );

  const expectedName = normalizeText(
    beneficiaryName
  );

  const exactNameMatch = interestedNames.some(
    (name) => normalizeText(name) === expectedName
  );

  const cpfMatch = Boolean(
    expectedCpf &&
    returnedCpfs.includes(expectedCpf)
  );

  const origin =
    source.procedencia ??
    source.principal ??
    null;

  return {
    number: protocol.number,
    year: protocol.year,
    protocol:
      `${protocol.number}/${protocol.year}`,
    url:
      `${TCE_PROCESS_URL}/` +
      `${protocol.number}/${protocol.year}#/`,
    interestedNames,
    subject: source.desc_assunto ?? null,
    description:
      source.descricao_processo ?? null,
    protocolDate:
      source.protocolado_data ?? null,
    rapporteur: source.relator ?? null,
    origin,
    cpfMatch,
    exactNameMatch
  };
}

function rankResult(result: SearchResult) {
  let score = 0;

  if (result.cpfMatch) {
    score += 100;
  }

  if (result.exactNameMatch) {
    score += 50;
  }

  if (
    normalizeText(result.subject) ===
    normalizeText(TARGET_SUBJECT)
  ) {
    score += 10;
  }

  return score;
}

async function performSearch(
  beneficiaryName: string,
  beneficiaryCpf: string | null
) {
  const variations =
    createNameVariations(beneficiaryName);

  let inertiaVersion =
    await getInertiaVersion();

  const collectedItems: TceItem[] = [];

  for (const variation of variations) {
    try {
      const items = await searchTce(
        variation,
        inertiaVersion
      );

      collectedItems.push(...items);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "";

      if (
        message.includes(
          "versão do portal do TCE"
        )
      ) {
        inertiaVersion =
          await getInertiaVersion();

        const retryItems = await searchTce(
          variation,
          inertiaVersion
        );

        collectedItems.push(...retryItems);
        continue;
      }

      throw error;
    }
  }

  const deduplicated = new Map<
    string,
    SearchResult
  >();

  for (const item of collectedItems) {
    const result = mapResult(
      item,
      beneficiaryName,
      beneficiaryCpf
    );

    if (!result) {
      continue;
    }

    const existing = deduplicated.get(
      result.protocol
    );

    if (
      !existing ||
      rankResult(result) > rankResult(existing)
    ) {
      deduplicated.set(
        result.protocol,
        result
      );
    }
  }

  return [...deduplicated.values()]
    .sort((first, second) => {
      const scoreDifference =
        rankResult(second) -
        rankResult(first);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return second.year - first.year;
    })
    .slice(0, MAX_RESULTS);
}

const authenticatedHandler = withSupabase(
  { auth: "user" },
  async (request, context) => {
    try {
      if (request.method !== "POST") {
        return jsonResponse(
          request,
          {
            error:
              "Método não permitido."
          },
          405
        );
      }

      let body: {
        caseId?: unknown;
      };

      try {
        body = await request.json();
      } catch {
        return jsonResponse(
          request,
          {
            error:
              "O corpo da solicitação é inválido."
          },
          400
        );
      }

      const caseId = String(
        body.caseId ?? ""
      ).trim();

      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (!uuidPattern.test(caseId)) {
        return jsonResponse(
          request,
          {
            error:
              "O identificador do processo COMPREV é inválido."
          },
          400
        );
      }

      /*
       * A RPC confirma que o usuário autenticado possui
       * acesso ao módulo COMPREV. Ela também fornece os
       * dados oficiais do beneficiário; assim, o navegador
       * não pode usar esta função para pesquisar pessoas
       * arbitrariamente.
       */
      const { data, error } =
        await context.supabase.rpc(
          "comprev_admin_get_case",
          {
            p_case_id: caseId
          }
        );

      if (error) {
        console.error(
          "Falha de autorização COMPREV:",
          error
        );

        return jsonResponse(
          request,
          {
            error:
              "Você não possui autorização para consultar este processo."
          },
          403
        );
      }

      const caseRecord =
        data as ComprevCase | null;

      if (
        !caseRecord ||
        !caseRecord.beneficiary_name
      ) {
        return jsonResponse(
          request,
          {
            error:
              "O processo COMPREV não foi encontrado."
          },
          404
        );
      }

      const results = await performSearch(
        caseRecord.beneficiary_name,
        caseRecord.beneficiary_cpf
      );

      return jsonResponse(request, {
        caseId: caseRecord.id,
        beneficiaryName:
          caseRecord.beneficiary_name,
        resultCount: results.length,
        results
      });
    } catch (error) {
      console.error(
        "Erro na consulta ao TCE:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : "Erro desconhecido.";

      return jsonResponse(
        request,
        {
          error:
            "Não foi possível consultar o portal do TCE.",
          detail: message
        },
        502
      );
    }
  }
);

export default {
  fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request)
      });
    }

    return authenticatedHandler(request);
  }
};