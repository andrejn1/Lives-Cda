# Lives na Cidade Alta (CDA)

Site que lista as lives de FiveM abertas na Cidade Alta, na Twitch e na Kick.
Atualiza sozinho a cada minuto.

## Como funciona

O servidor busca as lives da categoria **Grand Theft Auto V** (FiveM aparece nela) na
Twitch e na Kick e mostra só as que têm **CDA**, **Cidade Alta**, **Cidade Alta Rp** ou **CidadeAltaRp** no título.
Dá para mudar as palavras em `CDA_KEYWORDS`.

## 1. Pegar as chaves das APIs

**Twitch**
1. Entre em https://dev.twitch.tv/console/apps e clique em *Register Your Application*.
2. Nome qualquer, URL de redirecionamento `http://localhost`, categoria *Website Integration*.
3. Copie o **Client ID** e gere um **Client Secret**.

**Kick**
1. Entre em https://kick.com/settings/developer (precisa de 2FA ativado na conta).
2. Crie um app e copie o **Client ID** e o **Client Secret**.

## 2. Subir no Render

1. Crie um repositório no GitHub com o conteúdo desta pasta.
2. No Render: **New → Web Service** e escolha o repositório.
3. Build Command: `npm install` · Start Command: `npm start`.
4. Em *Environment*, adicione `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`,
   `KICK_CLIENT_ID` e `KICK_CLIENT_SECRET`.
5. Clique em **Deploy**.

(Se preferir, o `render.yaml` já deixa tudo pré-configurado via *Blueprint*.)

## Rodar no seu PC

```
npm install
# crie um .env a partir do .env.example e carregue as variáveis, ou:
TWITCH_CLIENT_ID=... TWITCH_CLIENT_SECRET=... KICK_CLIENT_ID=... KICK_CLIENT_SECRET=... npm start
```
Abra http://localhost:3000

## Observações

- Só aparecem lives que tenham CDA ou Cidade Alta no título. Se o streamer não colocar, a live não é listada.
- No plano gratuito do Render o site "dorme" após alguns minutos sem acesso e a primeira visita demora ~30 s.
- Se a Kick não achar a categoria GTA V sozinha, defina `KICK_CATEGORY_ID`.
