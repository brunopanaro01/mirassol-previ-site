# Base reutilizável para administração de JSON

Cada módulo administrativo é composto por configuração específica e componentes comuns:

- `core.mjs`: parser defensivo do Issue Form, detecção de no-op e gravação atômica;
- `modules/*.mjs`: esquema, campos, regras de negócio e serialização de cada JSON;
- `processar-admin-issue.mjs`: registro explícito dos módulos permitidos;
- `.github/workflows/administrar-json.yml`: autorização atual, fila, commit e pull request em rascunho;
- `admin/components/`: carregamento, pesquisa, filtros, tabela e componentes visuais;
- `admin/modules/`: colunas e adaptação dos dados de cada painel.

## Configuração obrigatória do repositório

1. Crie a variável `JSON_ADMIN_USERS` em **Settings → Secrets and variables → Actions → Variables**.
   Informe logins do GitHub separados por vírgula. O proprietário já é aceito sem constar na variável.
2. Cada login também precisa ter permissão atual `write`, `maintain` ou `admin` no repositório.
3. Em **Settings → Actions → General**, permita que GitHub Actions crie pull requests.
4. Proteja a branch `main`, exigindo pull request e ao menos uma aprovação antes da mesclagem.

Nunca coloque tokens, senhas ou dados pessoais nessa variável ou nos arquivos públicos.

## Inclusão de outro módulo

1. Adicione um adaptador em `scripts/admin/modules/` com validação completa e serializador determinístico.
2. Cadastre sua chave no mapa de `scripts/processar-admin-issue.mjs`.
3. Crie um Issue Form e um workflow curto que chame `administrar-json.yml` com arquivo e prefixo fixos.
4. Adicione somente a configuração de colunas e campos em `admin/modules/` e inicialize `startAdminApp`.
5. Cubra cadastro, edição, exclusão, entradas inválidas, no-op e serialização nos testes.

O nome e o caminho do arquivo devem vir da configuração versionada do workflow, nunca do conteúdo da issue.
