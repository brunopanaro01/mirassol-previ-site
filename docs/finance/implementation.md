# Núcleo financeiro do SIGPREVI

## Estado desta entrega

Primeira etapa de implementação: coleta de evidência oficial e cálculo financeiro de caixa. A interface dos Conselhos, banco mensal, validação/publicação e relatório ainda serão implementados. Não há migration ou alteração do portal nesta entrega.

Inspeção em 03/10/2026 da main `fe9e69066a18d7ea61dd36fd8fa30b4d695663fb`:

- Autenticação: `admin/components/auth-guard.js` e Supabase Auth.
- Autorização: `app.has_permission`, `app.has_role`, `app.is_admin`; papéis vinculados a módulos.
- Auditoria: `app.audit_logs` existente. Reutilizar e registrar importação, validação e publicação nas próximas etapas.
- Indicadores anuais: `app.portal_annual_indicators`, migration 034, leitura pública e administração por Publicações. Não converter `net_assets` em saldo investido: o campo foi importado do histórico anterior e exige definição contábil.
- Interface atual: `admin/sigprevi.html`, carregamento de módulos em `admin/modules/dashboard.js`.
- Próximo módulo pode ser integrado ao núcleo sem nova autenticação ou banco paralelo. Nenhuma dessas constatações comprova que todas as migrations foram aplicadas no projeto remoto.

## Prova das fontes

CADPREV: o endereço técnico apontado pelo catálogo federal retornou HTTP 403 em 03/10/2026. Isso não prova inexistência ou exigência de credencial: acesso, endpoints e cobertura precisam ser investigados. Não criar conexão fictícia.

SICONFI: `/entes` respondeu e identificou Mirassol d'Oeste, MT, código IBGE 5105622. O CNPJ retornado é do ente municipal, não do RPPS. A consulta MSC Patrimonial de dezembro/2025, classe 1, MSCC, saldo final retornou 269 registros. Estes são registros municipais ainda sem mapeamento para o RPPS; nenhum saldo do instituto foi calculado.

A primeira tentativa com filtros incompletos retornou lista vazia; ela não constitui evidência de ausência de dados. A documentação Swagger exige `an_referencia`, `classe_conta` e `id_tv`, além dos demais filtros. A resposta real usa `mes_referencia`, embora o metadado histórico cite `me_referencia`. O conector foi ajustado à resposta observada e recusa registros com período ou filtros divergentes.

Fontes oficiais:

- https://www.gov.br/conecta/catalogo/apis/cadprev
- https://apidatalake.tesouro.gov.br/docs/siconfi/
- https://apidatalake.tesouro.gov.br/docs/siconfi.yaml
- https://www.tesourotransparente.gov.br/ckan/dataset/api-msc-patrimonial-entes

## Captura reproduzível

```bash
python3 scripts/finance/collect_siconfi.py --year 2025 --month 12 --class 1 --output /caminho/exclusivo/captura
```

Não é necessário venv: o coletor utiliza somente a biblioteca padrão do Python 3. A captura cria um diretório novo, preserva as respostas brutas, seus hashes, parâmetros e instante da consulta. O manifesto informa `captured_unmapped`, `unavailable` ou `failed`. Dados municipais nunca se tornam indicadores RPPS automaticamente.

Paginação usa o endereço público e offsets; os links retornados apontaram um host interno e não são seguidos. Limite de páginas, timeout, formato inesperado ou divergência interrompem o processamento e registram falha. Captura parcial não é tratada como concluída.

## Cálculos em caixa

```bash
node scripts/finance/calculate_cash.mjs entrada-normalizada.json 2026-09 saida-nova.json
```

Entrada: objeto com `complete` booleano e `records` como lista. Cada registro exige `source`, `sourceRecordId`, `evidence`, `mappingVersion`, `entity`, `fund`, `originPeriod`, `cashDate`, `category` e `amount`. Valores em texto decimal com duas casas, por exemplo `"100.00"`; a destinação é `benefits` ou `administrative`. Identificadores da origem devem distinguir os lançamentos normalizados quando houver desdobramento. Estornos negativos exigem `reversalOf` apontando o identificador original da mesma fonte, categoria, entidade e destinação. A lista deve conter esse original, mesmo de outro período.

Categorias: `normal_contribution`, `comprev`, `other_current`, `supplementary_funding`, `installment`, `benefit`, `administration`, `investment_return`, `redemption`, `internal_transfer`. Classificação deve vir de mapeamento validado; não há extração automática de rubricas desconhecidas. Benefícios representam o bruto pago: recolhimento posterior de retenções não pode ser classificado de novo como benefício.

Receita corrente soma as três primeiras categorias da destinação previdenciária. Custeio suplementar e parcelamentos são separados. Resultado corrente deduz benefícios; resultado após equacionamento acrescenta apenas custeio suplementar. Não inclui administração, retorno, resgates nem transferências. Cobertura é arredondada para duas casas. Os valores são calculados com BigInt em centavos, sem perda de precisão de ponto flutuante.

Datas de caixa escolhem o período de cálculo; competência de origem é preservada na rastreabilidade. Registros repetidos idênticos são deduplicados por fonte e identificador. Revisões conflitantes bloqueiam o cálculo e exigem seleção explícita da versão. Dados incompletos retornam indicadores nulos; folha zero retorna cobertura não aplicável. `complete` declara completude do conjunto, não validação contábil nem autorização de publicação. Saída calculada permanece `calculated_pending_validation`.

## Validação e próximo passo

```bash
npm test
python3 scripts/finance/test_collect_siconfi.py
```

Próxima etapa: mapear PO, fontes e contas da MSC com o balancete do RPPS de 12/2025; obter folha e exportação contábil da competência piloto; homologar a classificação; então criar migrations de registros/revisões/fechamento e RPCs com permissões de gestão e leitura dos Conselhos. As contas agregadas MSC não substituem registros de caixa para calcular o resultado corrente. Nenhum usuário ou permissão de produção foi alterado.
