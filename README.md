# CTNano CRM — Vercel + Supabase

Versão operacional e independente do CRM da Unidade EMBRAPII CTNano/UFMG. A aplicação preserva as funcionalidades validadas no piloto do GPT Sites, mas utiliza:

- **Vercel** para hospedar a aplicação Next.js;
- **Supabase Auth** para login e cadastro;
- **Supabase PostgreSQL** para armazenar os dados;
- **Google Drive** para backup opcional.

## Regras de acesso

- somente e-mails `@ctnano.org` podem criar conta;
- `ricardo.neres@ctnano.org` é o administrador inicial;
- todos os demais cadastros recebem o perfil `user`;
- somente administradores podem promover outro usuário para `admin`, cadastrar usuários, editar indicadores, importar backups ou criar backups no Google Drive;
- a chave `SUPABASE_SERVICE_ROLE_KEY` é usada apenas no servidor e nunca deve ser exposta no navegador.

## Implantação

Consulte [DEPLOY_VERCEL_SUPABASE.md](./DEPLOY_VERCEL_SUPABASE.md) para o passo a passo completo.

## Desenvolvimento local

1. Copie `.env.example` para `.env.local` e preencha as chaves.
2. Instale as dependências com `npm install`.
3. Execute `npm run dev`.
4. Acesse `http://localhost:3000`.

## Verificação

```bash
npm run lint
npx tsc --noEmit
npm run build
```
