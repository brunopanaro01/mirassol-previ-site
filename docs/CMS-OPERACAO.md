# Operação e homologação

## Acesso

- catálogo: `https://mirassolprevi.com.br/admin/`;
- consignados: `https://mirassolprevi.com.br/admin/?module=consignados`;
- rota legada: `https://mirassolprevi.com.br/admin/consignados.html`.

## Fluxo

1. Abra o módulo e aguarde a validação dos dados.
2. Pesquise ou filtre e escolha cadastrar, editar ou excluir.
3. Revise o formulário e continue no GitHub.
4. Não altere campos técnicos da Issue; preencha justificativa e confirmação.
5. Aguarde o Pull Request em rascunho.
6. O mantenedor confere diff, checks, documento e página pública.
7. O mantenedor decide quando retirar o rascunho e mesclar. A automação nunca mescla.

## Configuração externa

- Actions habilitado e autorizado a criar Pull Requests;
- proteção da `main` exigindo Pull Request e ao menos uma aprovação;
- check `CMS — validação contínua / validar` obrigatório após a primeira execução;
- variável opcional `JSON_ADMIN_USERS`, com logins separados por vírgula. Vazia significa somente o proprietário.

Essas opções ficam em Settings e não são alteradas pelo código.

## Checklist do PR administrativo

- [ ] PR em rascunho e solicitante identificado;
- [ ] somente o JSON esperado foi alterado;
- [ ] nenhum dado pessoal ou sigiloso;
- [ ] ID único, links corretos e check do CMS aprovado;
- [ ] página pública testada sem mudança de layout;
- [ ] aprovação registrada antes da mesclagem.

Antes da mesclagem, basta fechar PR e Issue. Depois dela, reverta por outro Pull Request; não force push nem edite a `main` diretamente.
