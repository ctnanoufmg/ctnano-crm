# Implantação do CTNano CRM no Supabase e na Vercel

Este roteiro não altera nem desativa a versão publicada no GPT Sites.

## 1. Localizar o projeto correto do Supabase

No painel do Supabase, abra a organização e clique no projeto do CRM. A URL correta terá o formato:

```text
https://supabase.com/dashboard/project/REFERENCIA_DO_PROJETO
```

O link terminado em `/org/...` identifica somente a organização.

## 2. Criar o banco e as regras de segurança

1. No projeto do Supabase, abra **SQL Editor**.
2. Clique em **New query**.
3. Copie todo o conteúdo de `supabase/migrations/001_ctnano_crm.sql`.
4. Execute a consulta uma única vez.

O script cria as tabelas, relacionamentos, indicadores iniciais, validação de domínio, administrador inicial e políticas de segurança.

## 3. Configurar a autenticação

No Supabase:

1. Abra **Authentication → Providers → Email**.
2. Mantenha o provedor de e-mail habilitado.
3. Recomenda-se manter a confirmação de e-mail ativada.
4. Em **Authentication → URL Configuration**, informe temporariamente:

```text
Site URL: http://localhost:3000
Redirect URL: http://localhost:3000/auth/callback
```

Depois da primeira publicação na Vercel, acrescente:

```text
https://SEU-ENDERECO-VERCEL.vercel.app/auth/callback
```

e altere o **Site URL** para o endereço definitivo.

## 4. Obter as três variáveis do Supabase

Em **Project Settings → API**, copie:

- Project URL;
- chave pública `anon` ou `publishable`;
- chave privada `service_role` ou `secret`.

Não envie a chave privada por e-mail, mensagem ou documento. Ela será cadastrada diretamente na Vercel.

## 5. Colocar o código no GitHub

Envie o conteúdo desta pasta para o repositório `ctnano-crm`. O arquivo `.env.local` não deve ser enviado ao GitHub.

## 6. Criar o projeto na Vercel

1. Entre na Vercel com a conta do CTNano.
2. Clique em **Add New → Project**.
3. Importe o repositório GitHub `ctnano-crm`.
4. A Vercel reconhecerá automaticamente o Next.js.
5. Em **Environment Variables**, cadastre:

| Variável | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL do Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave pública do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | chave privada do Supabase |
| `NEXT_PUBLIC_SITE_URL` | URL gerada pela Vercel |

6. Clique em **Deploy**.

## 7. Ativar o administrador inicial

1. Abra a aplicação publicada.
2. Clique em **Primeiro acesso? Cadastre-se**.
3. Cadastre `ricardo.neres@ctnano.org`.
4. Confirme o e-mail recebido.
5. Entre no CRM.

O banco força esse e-mail a permanecer como administrador. Os demais usuários entram como usuários comuns.

## 8. Cadastrar a equipe

Há duas formas:

- o integrante usa **Primeiro acesso? Cadastre-se**, sempre com `@ctnano.org`; ou
- o administrador abre **Configurações → Cadastro de usuários → Novo usuário**, e o sistema envia um convite.

O administrador pode editar o usuário e alterar o perfil de `user` para `admin`. Um usuário comum não consegue alterar perfis nem indicadores.

## 9. Migrar os dados do piloto

1. Na versão do GPT Sites, abra **Configurações → Baixar backup JSON**.
2. Na nova versão, entre como administrador.
3. Abra **Configurações → Importar arquivo JSON**.
4. Selecione o backup.
5. Confira os totais de organizações, contatos e oportunidades no painel.

A importação acrescenta os registros e ignora duplicidades reconhecidas.

## 10. Configurar o backup no Google Drive

Na Vercel, acrescente as variáveis:

| Variável | Valor |
| --- | --- |
| `GDRIVE_CLIENT_EMAIL` | e-mail da conta de serviço Google |
| `GDRIVE_PRIVATE_KEY` | chave privada da conta de serviço |
| `GDRIVE_FOLDER_ID` | identificador da pasta compartilhada |

Depois, use **Configurações → Criar backup agora**.

## Administração futura

Para transferir a administração, Ricardo deve promover outro usuário `@ctnano.org` para administrador antes de sair. A conta institucional da Vercel, o projeto Supabase e o repositório GitHub também devem possuir pelo menos outro proprietário institucional.
