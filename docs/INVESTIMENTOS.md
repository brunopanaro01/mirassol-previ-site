# Investimentos no SIGPREVI

O módulo funciona na arquitetura existente: interface HTML/JavaScript, autenticação Supabase, PostgreSQL com RPCs e uma Edge Function TypeScript/Deno para consultar fontes oficiais. Não exige servidor Flask/Python adicional. Python é usado somente pelos utilitários locais de exportação e geração de referências de teste.

## Papéis e acesso

| Perfil | Consulta | Recomendações, comentários e minutas | Cadastros financeiros e configurações | Publicar deliberação e fechar/reabrir mês |
| --- | --- | --- | --- | --- |
| Gestor de Investimentos (`investments_manager`) | Sim | Sim | Sim | Sim |
| Comitê (`investments_committee`) | Sim | Sim | Não | Não |
| Administrador global | Sim | Sim | Sim | Sim |
| Sem papel, conta bloqueada/inativa ou acesso revogado | Não | Não | Não | Não |

As permissões são verificadas no banco em cada RPC, incluindo situação ativa da conta e disponibilidade do módulo. Esconder botões é apenas apresentação. Os papéis do navegador não têm escrita direta nas tabelas; todas as alterações autorizadas geram auditoria. A autoria de participação vem da conta autenticada e não de um campo editável enviado pelo navegador. Somente o gestor/administrador registra o tipo final `deliberacao`.

## Implantação

1. Faça backup do Supabase antes de aplicar alterações no ambiente utilizado pelos usuários. Valide primeiro em um ambiente de homologação com dados sintéticos.
2. Aplique `supabase/migrations/202610090037_investments.sql` após as migrações existentes do projeto. Ela reutiliza o módulo `investments` do catálogo, cria as tabelas e os papéis específicos e disponibiliza RPCs protegidas.
3. Publique `supabase/functions/investments-market-data` no mesmo projeto Supabase, com a configuração correspondente em `supabase/config.toml`. A função usa o JWT do chamador, sem chave de serviço para executar gravações. IPCA e Selic são consultados no SGS/BCB; o cadastro de fundos é consultado na CVM.
4. Publique os arquivos da interface pelo fluxo habitual do site e conceda os papéis aos usuários em **Usuários e acessos**. Cada membro deve usar sua própria conta ativa.
5. Importe a cópia de Investimentos somente depois de conferir a origem, o arquivo e as contagens. A importação exige que todo o módulo de destino esteja vazio e ainda não utilizado; não serve para sincronização periódica ou restauração por sobreposição.
6. Confira no SIGPREVI patrimônio por competência, taxa anual, índices históricos, avisos de divergência e contagens contra a origem. A publicação do código não aplica automaticamente a migração nem transfere dados do computador.

## Exportação local e backup

O utilitário `scripts/investments/export-local.py` abre a origem SQLite em modo somente leitura e cria uma cópia consistente pela API de backup do SQLite. Depois exporta exclusivamente as doze tabelas de Investimentos, preservando identificadores e valores e convertendo os booleanos SQLite para JSON.

```text
python scripts/investments/export-local.py --database CAMINHO_DO_BANCO --output DIRETORIO_PRIVADO
```

O diretório recebe três arquivos: cópia SQLite, JSON de importação e manifesto com SHA-256/contagens. **A cópia SQLite é integral e pode conter informações sensíveis de outros módulos do painel local.** Guarde-a em local privado com acesso restrito; não a envie ao repositório, site ou biblioteca pública. O JSON contém apenas Investimentos, mas também é operacional e não deve ser versionado. O manifesto permite conferir integridade e quantidade de registros.

Em **Relatórios**, o gestor seleciona o JSON de formato `sigprevi-investments-v1`, revisa as contagens e confirma a importação. A RPC realiza a operação em uma transação, respeitando dependências e rejeitando destino não vazio e segunda importação. As cópias exportadas posteriormente pela interface são identificadas como `sigprevi-investments-backup-v1`; não são arquivos de importação inicial nem substituem uma política de backup do Supabase.

## Cálculo e preservação

As fórmulas foram adaptadas do painel local, sem inventar regras de rentabilidade ou pontuação:

- Base de rentabilidade mensal: saldo inicial + aplicações − resgates, limitada a zero quando não positiva; rendimento/base × 100 quando a base é positiva.
- Taxa real mensal: `((1 + taxa_real_anual / 100)^(1/12) - 1) × 100`.
- Meta mensal: composição multiplicativa do índice do mês com a taxa real mensal.
- Acumulados: produto dos fatores mensais menos um; volatilidade: desvio padrão amostral. Ranking e radar conservam os parâmetros por classe do código original.

O IPCA corrente é cadastrado uma única vez em **Indicadores Econômicos**. A Meta Atuarial lê esse valor automaticamente e mantém a taxa real anual configurada; o valor de 2026 deve permanecer em **5,63%** quando essa for a configuração da origem. A importação preserva a configuração existente, sem substituí-la por um valor fixo.

Os índices atuariais legados são preservados como histórico. Quando divergem dos indicadores, a interface deve mostrar a divergência sem sobrescrever o índice histórico. Índices ausentes permanecem pendentes; zero é um valor válido. Os acumulados compõem as observações disponíveis, conforme o painel original, sem preencher lacunas artificialmente.

Fechar uma competência exige índice disponível, grava os valores da meta e bloqueia alterações financeiras daquela competência e na configuração anual correspondente. Reabrir exige justificativa e auditoria. Alterações usam versão otimista: uma edição obsoleta é rejeitada e exige recarregar o registro. Esses controles não substituem a rotina formal de conferência e aprovação adotada pelo instituto.

## Adaptações e limites

O relatório mensal e o detalhe individual são impressos pelo navegador; **Imprimir / salvar PDF** utiliza o recurso de impressão do usuário. Não é o gerador PDF do Flask. O Diário Econômico oferece uma minuta textual a partir dos dados disponíveis, que o gestor deve revisar; não implica importação automática do conteúdo de PDFs ou publicação automática de análises. Links para documentos já existentes são preservados, e não significam transferência dos arquivos anexados para o Supabase.

Os períodos de análise utilizam as últimas observações disponíveis do fundo, como na origem. A seleção de uma competência no painel não transforma o histórico completo do ranking/detalhe em um corte retroativo até aquele mês. Ausências de benchmark e meta são apresentadas como pendentes.

## Validação

```text
npm ci
npm run test:investments
npm test
npm run validate:cms
```

As referências em `scripts/tests/fixtures/investments-reference.json.gz` são inteiramente sintéticas: seis fundos de classes distintas, oito competências, retornos positivos/negativos/zero, benchmarks ausentes/negativos e IPCA ausente/zero/legado divergente. O gerador `scripts/investments/generate-reference-fixtures.py --source DIRETORIO_DO_PAINEL` executa as funções originais em SQLite exclusivamente em memória, sem inicializar o banco real.

Os testes de banco usam PGlite para aplicar a migração e verificar autorização, importação, autoria, publicação, bloqueio/revogação, versões, fechamento e reabertura. A dependência de desenvolvimento deve estar instalada para que esses testes não sejam ignorados. Os testes de cálculo comparam os resultados da adaptação com as referências Python. A validação da interface está em `scripts/investments/test-ui.py`; use apenas ambientes de teste e dados sintéticos.

Os testes automatizados não aplicam a migração ao Supabase de produção, não importam os dados reais e não concedem acesso a pessoas reais.
