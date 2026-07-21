# Arquitetura do CMS Mirassol-Previ

## Visão geral

O CMS administra arquivos JSON sem alterar como as páginas públicas os consomem. Painel, automação e testes usam o mesmo contrato declarativo e o mesmo núcleo de adaptadores, identidade, ordenação e validação.

Fluxo: o navegador carrega o catálogo e o JSON; o administrador preenche um formulário visual; o painel abre uma Issue com revisão-base SHA-256; o workflow autoriza o solicitante; o processador valida e grava somente o JSON registrado; a automação cria branch, commit e Pull Request em rascunho; o mantenedor revisa e decide se mescla. Somente a mesclagem na `main` permite a publicação normal do GitHub Pages.

O CMS não deve armazenar dados pessoais ou sigilosos. Todo conteúdo e histórico do JSON são públicos no GitHub.

## Estrutura

```text
_data/cms/modules/              configuração declarativa por módulo
admin/
  components/                   tabela e formulário dinâmicos
  config/modules.json           catálogo gerado pelo Jekyll
  core/                         carregamento, aplicação e solicitação
  index.html                    shell único do CMS
cms/core/                       código puro compartilhado por navegador e Node.js
scripts/cms/                    parser, processamento, serialização e escrita atômica
scripts/tests/                  testes funcionais e de segurança
schemas/                        contratos JSON Schema
.github/ISSUE_TEMPLATE/         formulário de transporte único
.github/workflows/              automação genérica e CI
docs/                           arquitetura e operação
```

## Responsabilidades

| Componente | Responsabilidade |
|---|---|
| `_data/cms/modules/*.json` | Declarar arquivo, página, campos, validações, identidade, filtros, colunas e ordenações. |
| `cms/core/config.js` | Recusar configurações incompletas, referências desconhecidas e caminhos inseguros. |
| `cms/core/adapters.js` | Converter JSONs em registros e recompô-los sem perder metadados. |
| `cms/core/validators.js` | Aplicar validações comuns no cliente e no servidor. |
| `cms/core/identity.js` | Gerar identificadores estáveis por convenção. |
| `cms/core/records.js` | Validar unicidade e executar operações deterministicamente. |
| `admin/core/app.js` | Montar painel, filtros, pesquisa e ações. |
| `scripts/cms/request-parser.mjs` | Tratar a Issue como entrada não confiável. |
| `scripts/cms/processor.mjs` | Validar revisão-base e limitar a alteração ao JSON configurado. |
| `scripts/cms/atomic-writer.mjs` | Persistir em temporário validado e renomear atomicamente. |
| `cms-admin.yml` | Autorizar, enfileirar por módulo e abrir PR em rascunho. |
| `cms-ci.yml` | Executar testes e validar todos os módulos. |

## Modelo e adaptadores

Os adaptadores produzem registros planos em memória. Ao gravar, recompõem a estrutura configurada; metadados fora de `collectionPath` são preservados.

- `array`: lista de objetos na raiz ou em caminho interno;
- `grouped`: um ou mais níveis de chaves terminando em listas;
- `matrix`: um ou mais níveis de chaves terminando em valor escalar.

As formas `wrapped-array`, `nested-grouped-array` e `double-grouped-array` são combinações de `collectionPath` e `groups`, sem código adicional.

## Segurança

- somente evento `issues: opened`; sem `pull_request_target` ou `issue_comment`;
- autorização por proprietário/lista e permissão atual `write`, `maintain` ou `admin`;
- nenhum checkout no job de autorização;
- checkout somente da `main` confiável e Actions fixadas por SHA;
- conteúdo da Issue vai por variável de ambiente ao parser Node.js, nunca é interpolado no shell;
- módulo e arquivo vêm de configuração registrada, sem import ou caminho fornecido pelo usuário;
- revisão-base impede sobrescrever atualização mais recente;
- IDs únicos e campos de identidade imutáveis quando configurados;
- escrita atômica e nova validação após serializar;
- confirmação de que exatamente o `data.file` foi alterado;
- branch única por módulo, Issue e tentativa; PR sempre em rascunho.

## Escalabilidade e limites

Um módulo exige apenas configuração quando formato, identidade e validações já são suportados. Uma regra realmente nova deve gerar adaptador, transformação ou validador **genérico**, com testes; nunca uma cópia específica do módulo.

Issues + Pull Requests são adequados para poucos administradores e baixo volume. Exigem conta GitHub, expõem dados no histórico público e não oferecem transações entre vários JSONs. Em volume maior, o contrato declarativo poderá alimentar uma API autenticada ou Supabase sem substituir toda a interface.
