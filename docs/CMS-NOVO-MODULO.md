# Cadastro de novo módulo

Para formatos e validações suportados, adicione somente `_data/cms/modules/<chave>.json`. Não copie HTML, JavaScript, parser, workflow ou Issue Form. O Jekyll inclui a configuração no catálogo e o módulo fica disponível em `/admin/?module=<chave>`.

## Configuração

- `schemaVersion`, `key`, `name` e `description`;
- `data.file`, `data.publicPage`, `data.adapter`, `collectionPath`, `groups` e ordenação de armazenamento;
- `identity.field`, prefixo, partes e campos imutáveis;
- `fields` com tipos, opções e validadores;
- `ui` com pesquisa, filtros, colunas e ordenação visual;
- `operations` permitidas e `serialization`.

Use `_data/cms/modules/consignados.json` como referência e `schemas/cms-module.schema.json` como contrato.

## Validadores disponíveis

| Nome | Uso |
|---|---|
| `text` | Limites `min` e `max`. |
| `no-html` | Recusa marcação HTML. |
| `enum` | Exige opção declarada. |
| `integer` | Inteiro entre `min` e `max`. |
| `https-url` | HTTPS sem credenciais ou porta. |
| `google-drive-file` | Arquivo no host exato `drive.google.com`. |
| `pattern` | Expressão regular declarada. |

Identidades aceitam valor direto, `month-number` ou `slug`. IDs antigos devem permanecer estáveis e únicos. Se o JSON não tiver ID, inclua-os numa migração isolada antes de ativar o módulo.

## Validação obrigatória

```bash
npm test
npm run validate:cms
git diff --check
```

Teste também pesquisa, filtros, celular e todas as operações permitidas. A página pública não deve ser alterada para se adaptar ao CMS.

Amplie o núcleo compartilhado quando surgir formato não representável, validação entre campos, transformação de identidade nova ou serialização incompatível. A ampliação deve ser genérica, testada e documentada.
