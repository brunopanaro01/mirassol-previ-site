import { CONFIRMATION_TEXT, ISSUE_LABELS, OPERATIONS } from "../../cms/core/constants.js";

const ISSUE_FORM = "https://github.com/brunopanaro01/mirassol-previ-site/issues/new?template=cms-request.yml";

export function buildRequestUrl(config, request) {
  const url = new URL(ISSUE_FORM);
  const operationLabel = OPERATIONS[request.operation];
  url.searchParams.set("title", `[CMS] ${config.key}: ${operationLabel} ${request.recordId || "novo registro"}`);
  url.searchParams.set("modulo", config.key);
  url.searchParams.set("operacao", request.operation);
  url.searchParams.set("identificador", request.recordId ?? "");
  url.searchParams.set("revisao", request.baseRevision);
  url.searchParams.set("dados", JSON.stringify(request.values ?? {}));
  return url;
}

export function issueFormPreview(request) {
  return {
    [ISSUE_LABELS.module]: request.module,
    [ISSUE_LABELS.operation]: request.operation,
    [ISSUE_LABELS.recordId]: request.recordId,
    [ISSUE_LABELS.baseRevision]: request.baseRevision,
    [ISSUE_LABELS.payload]: JSON.stringify(request.values ?? {}),
    [ISSUE_LABELS.justification]: "",
    [ISSUE_LABELS.confirmation]: `- [ ] ${CONFIRMATION_TEXT}`
  };
}
