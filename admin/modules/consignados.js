const MONTH_ORDER = new Map([
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
].map((month, index) => [month, index + 1]));

function isSafeDriveFile(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "drive.google.com"
      && /^\/file\/d\/[A-Za-z0-9_-]{10,}(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}

function toRecords(data) {
  const records = [];
  for (const [year, items] of Object.entries(data?.relatorios ?? {})) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      records.push({
        ano: year,
        id: String(item?.id ?? ""),
        mes: String(item?.mes ?? ""),
        descricao: String(item?.descricao ?? ""),
        url: String(item?.url ?? "")
      });
    }
  }
  return records.sort((a, b) =>
    Number(b.ano) - Number(a.ano)
      || (MONTH_ORDER.get(a.mes) ?? 99) - (MONTH_ORDER.get(b.mes) ?? 99));
}

export const consignadosAdminConfig = {
  dataUrl: "../consignados.json",
  dataLabel: "os registros de consignados",
  issueFormUrl: "https://github.com/brunopanaro01/mirassol-previ-site/issues/new?template=gerenciar-consignado.yml",
  issueTitle: (operation, record) =>
    `[ADMIN CONSIGNADOS] ${operation}${record?.id ? ` ${record.id}` : " relatório"}`,
  issueFields: {
    operation: "operacao",
    record: {
      identificador: "id",
      ano: "ano",
      mes: "mes",
      descricao: "descricao",
      url: "url"
    }
  },
  toRecords,
  searchKeys: ["id", "mes", "descricao", "ano"],
  group: {
    key: "ano",
    label: "Ano",
    plural: "Anos",
    values: (records) => [...new Set(records.map((item) => item.ano))]
      .sort((a, b) => Number(b) - Number(a))
  },
  columns: [
    { key: "ano", label: "Ano" },
    { key: "mes", label: "Mês" },
    { key: "descricao", label: "Descrição" },
    { key: "id", label: "Identificador", code: true },
    {
      key: "url",
      label: "Documento",
      linkLabel: "Abrir documento",
      isSafeUrl: isSafeDriveFile,
      warnDuplicates: true
    }
  ],
  actions: [
    { label: "Editar", operation: "Editar", variant: "btn-secondary" },
    { label: "Excluir", operation: "Excluir", variant: "btn-danger" }
  ]
};
