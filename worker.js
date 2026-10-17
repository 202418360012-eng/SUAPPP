// =====================================================================
//  Painel SUAP - Faltas (Cloudflare Worker)
//  - Página web para gerar relatório manual (/)
//  - Envio diário automático por WhatsApp via Cron + CallMeBot
//  - Teste manual: /enviar?token=SEU_TOKEN
// =====================================================================

// ---------------------------------------------------------------------
// HORÁRIO DA TURMA 83632
// dia da semana (0=dom ... 6=sáb) ->
//   [palavra-chave no boletim (sem acento), nº de aulas no dia, nome exibido, termo a excluir (opcional)]
// ---------------------------------------------------------------------
const HORARIO = {
  1: [
    ["historia", 2, "História"],
    ["matematica", 2, "Matemática"],
    ["desenvolvimento web", 2, "Desenvolvimento Web"],
  ],
  2: [
    ["geografia", 2, "Geografia"],
    ["gestao", 2, "Gestão e Empreendedorismo"],
    ["banco de dados", 2, "Banco de Dados"],
    ["educacao fisica", 2, "Educação Física"],
  ],
  3: [
    ["filosofia", 1, "Filosofia"],
    ["sociologia", 1, "Sociologia"],
    ["desenvolvimento web", 2, "Desenvolvimento Web"],
    ["seguranca", 2, "Segurança da Informação"],
    ["quimica", 2, "Química"],
  ],
  4: [
    ["portugues", 2, "Língua Portuguesa"],
    ["biologia", 2, "Biologia"],
    ["projeto", 2, "Projeto, Inst. Serv. Rede"],
    ["programacao", 2, "Linguagem de Programação II"],
  ],
  5: [
    ["projeto", 2, "Projeto, Inst. Serv. Rede"],
    ["espanhol", 2, "Espanhol"],
    ["fisica", 2, "Física", "educacao"],
  ],
};

const NOMES_DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// ---------------------------------------------------------------------
// PÁGINA WEB
// ---------------------------------------------------------------------
const HTML_PAGE = `<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Painel SUAP - Envio de Faltas</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f2f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        h1 { color: #1e293b; font-size: 22px; text-align: center; margin-bottom: 20px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 6px; font-weight: 600; color: #334155; }
        input[type="text"], input[type="password"] { width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; font-size: 14px; }
        button { width: 100%; padding: 12px; background-color: #25d366; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; font-weight: bold; margin-top: 10px; }
        button:hover { background-color: #128c7e; }
        .card { border: 1px solid #e2e8f0; padding: 15px; margin-top: 12px; border-radius: 8px; }
        .OK { border-left: 5px solid #22c55e; }
        .PERIGO { border-left: 5px solid #f59e0b; }
        .ESTOURADO { border-left: 5px solid #ef4444; }
        .badge { font-weight: bold; padding: 4px 8px; border-radius: 4px; color: white; float: right; font-size: 12px; }
        .bg-OK { background-color: #22c55e; }
        .bg-PERIGO { background-color: #f59e0b; }
        .bg-ESTOURADO { background-color: #ef4444; }
        .whatsapp-btn { display: block; text-align: center; background-color: #25d366; color: white; text-decoration: none; padding: 12px; border-radius: 6px; font-weight: bold; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Relatório de Faltas - SUAP</h1>
        <form id="suapForm">
            <div class="form-group">
                <label for="usuario">Matrícula (SUAP):</label>
                <input type="text" id="usuario" name="usuario" required placeholder="Digite sua matrícula">
            </div>
            <div class="form-group">
                <label for="senha">Senha:</label>
                <input type="password" id="senha" name="senha" required placeholder="Digite sua senha">
            </div>
            <div class="form-group">
                <label for="telefone">Número de Destino (com DDD):</label>
                <input type="text" id="telefone" name="telefone" required placeholder="Ex: 5575981140411">
            </div>
            <button type="submit">Gerar e Enviar Relatório</button>
        </form>

        <div id="resultado" style="margin-top: 25px;"></div>
    </div>

    <script>
        function esc(s) {
            return String(s).replace(/[&<>"']/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        }

        document.getElementById('suapForm').addEventListener('submit', async function (e) {
            e.preventDefault();
            const resultadoDiv = document.getElementById('resultado');
            resultadoDiv.innerHTML = '<p style="text-align:center; color: #64748b;">Acessando SUAP e calculando faltas...</p>';

            try {
                const formData = new FormData(this);
                const response = await fetch('/processar', { method: 'POST', body: formData });
                const data = await response.json();

                if (data.erro) {
                    resultadoDiv.innerHTML = '<p style="color: #ef4444; text-align: center;">' + esc(data.erro) + '</p>';
                    return;
                }

                let html = '<h3>Relatório Gerado:</h3>';
                data.materias.forEach(function (item) {
                    let statusClass = 'OK';
                    if (item.restantes < 0) statusClass = 'ESTOURADO';
                    else if (item.restantes <= 2) statusClass = 'PERIGO';

                    html += '<div class="card ' + statusClass + '">' +
                        '<span class="badge bg-' + statusClass + '">' + statusClass + '</span>' +
                        '<strong>' + esc(item.disciplina) + '</strong><br>' +
                        '<small>Faltas acumuladas: ' + item.faltas + ' de ' + item.limite_max + ' permitidas</small><br>' +
                        '<small>Frequência atual: ' + esc(item.freq_atual) + '</small><br>' +
                        '<strong>Faltas restantes no curso: ' + item.restantes + '</strong>' +
                        '</div>';
                });

                const urlWa = 'https://api.whatsapp.com/send?phone=' + encodeURIComponent(data.telefone) + '&text=' + encodeURIComponent(data.mensagem);
                html += '<a href="' + urlWa + '" target="_blank" class="whatsapp-btn">📲 Enviar Relatório pelo WhatsApp</a>';

                resultadoDiv.innerHTML = html;
            } catch (err) {
                resultadoDiv.innerHTML = '<p style="color: #ef4444; text-align: center;">Erro de conexão: ' + esc(err.message) + '</p>';
            }
        });
    <\/script>
</body>
</html>`;

// ---------------------------------------------------------------------
// UTILITÁRIOS
// ---------------------------------------------------------------------
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function cleanText(text) {
  return text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function normalizar(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function parseCookies(headers) {
  const cookies = [];
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      cookies.push(value.split(";")[0].trim());
    }
  });
  return cookies.join("; ");
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// ---------------------------------------------------------------------
// SUAP: LOGIN + BOLETIM
// ---------------------------------------------------------------------
async function buscarMaterias(usuario, senha) {
  const loginUrl = "https://suap.ifba.edu.br/accounts/login/";

  const initialRes = await fetch(loginUrl, { headers: { "User-Agent": UA } });
  const initialHtml = await initialRes.text();
  const initialCookies = parseCookies(initialRes.headers);

  const csrfMatch = initialHtml.match(
    /name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)["']/
  );
  if (!csrfMatch) throw new Error("Erro ao conectar ao servidor do SUAP.");

  const loginBody = new URLSearchParams({
    username: usuario,
    password: senha,
    csrfmiddlewaretoken: csrfMatch[1],
    next: "",
  });

  const loginRes = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
      Referer: loginUrl,
      Cookie: initialCookies,
    },
    body: loginBody.toString(),
    redirect: "manual",
  });

  const authCookies = parseCookies(loginRes.headers) || initialCookies;

  const res = await fetch(
    "https://suap.ifba.edu.br/edu/aluno/" + encodeURIComponent(usuario) + "/?tab=boletim",
    { headers: { "User-Agent": UA, Cookie: authCookies } }
  );
  const html = await res.text();

  const trs = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  const dados = [];
  const vistas = new Set();

  for (const tr of trs) {
    if (tr.includes("colspan") || tr.includes("<thead>") || tr.includes("<th>")) continue;

    const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    if (tds.length < 6) continue;

    const cols = tds.map(cleanText);
    let disciplina = cols[1];
    if (!disciplina) continue;

    const low = disciplina.toLowerCase();
    if (low.includes("total") || low.includes("componente")) continue;

    if (disciplina.includes("-")) {
      disciplina = disciplina.split("-").slice(1).join("-").trim();
    }

    if (vistas.has(disciplina.toLowerCase())) continue;
    vistas.add(disciplina.toLowerCase());

    const ch = cols[2].match(/\d+/);
    const cargaHoraria = ch ? parseInt(ch[0], 10) : 72;
    const faltas = parseInt(cols[4], 10) || 0;

    let freq = 100;
    if (cols[5].includes("%")) {
      freq = parseFloat(cols[5].replace("%", "").replace(",", ".")) || 100;
    }

    const limite_max = Math.floor(cargaHoraria * 0.25);

    dados.push({
      disciplina,
      total_aulas: cargaHoraria,
      faltas,
      freq_atual: freq.toFixed(2) + "%",
      limite_max,
      restantes: limite_max - faltas,
    });
  }

  if (dados.length === 0) {
    throw new Error(
      "Não foi possível extrair as disciplinas do boletim. Verifique matrícula e senha."
    );
  }
  return dados;
}

// ---------------------------------------------------------------------
// MENSAGENS
// ---------------------------------------------------------------------
function montarMensagemCompleta(materias) {
  let msg = "📊 *BOLETIM SUAP - CONTROLE DE FALTAS*\n\n";
  for (const item of materias) {
    let alerta = "✅ *OK*";
    if (item.restantes < 0) alerta = "🚨 *ESTOURADO!* (" + Math.abs(item.restantes) + " além do limite)";
    else if (item.restantes <= 2) alerta = "⚠️ *ATENÇÃO! PRÓXIMO DO LIMITE*";

    msg += "🔹 *" + item.disciplina + "*\n";
    msg += "   • Faltas acumuladas: " + item.faltas + " de " + item.limite_max + " permitidas\n";
    msg += "   • Frequência atual: " + item.freq_atual + "\n";
    msg += "   • Faltas restantes permitidas: *" + item.restantes + "* " + alerta + "\n\n";
  }
  msg += "─────────────────────────\n_Relatório gerado via Painel Web SUAP._";
  return msg;
}

function montarMensagemDoDia(materiasSuap, diaSemana) {
  const aulasHoje = HORARIO[diaSemana];
  if (!aulasHoje) return null; // sábado / domingo

  let msg = "📚 *AULAS DE HOJE (" + NOMES_DIAS[diaSemana] + ") - FALTAS*\n\n";

  for (const [chave, qtdAulas, nomeBonito, excluir] of aulasHoje) {
    const m = materiasSuap.find((x) => {
      const n = normalizar(x.disciplina);
      return n.includes(chave) && !(excluir && n.includes(excluir));
    });

    if (!m) {
      msg += "🔹 *" + nomeBonito + "* (" + qtdAulas + " aula" + (qtdAulas > 1 ? "s" : "") + ")\n";
      msg += "   • Não encontrei essa disciplina no boletim\n\n";
      continue;
    }

    const sobraSeFaltar = m.restantes - qtdAulas;
    let alerta = "✅ *OK*";
    if (m.restantes < 0) alerta = "🚨 *ESTOURADO!* (" + Math.abs(m.restantes) + " além do limite)";
    else if (sobraSeFaltar < 0) alerta = "🚨 *NÃO FALTE: estouraria o limite!*";
    else if (m.restantes <= 2) alerta = "⚠️ *ATENÇÃO! PRÓXIMO DO LIMITE*";

    msg += "🔹 *" + nomeBonito + "* (" + qtdAulas + " aula" + (qtdAulas > 1 ? "s" : "") + " hoje)\n";
    msg += "   • Faltas: " + m.faltas + " de " + m.limite_max + " permitidas\n";
    msg += "   • Frequência: " + m.freq_atual + "\n";
    msg += "   • Restantes: *" + m.restantes + "* " + alerta + "\n";
    msg += "   • Se faltar hoje, sobram: " + sobraSeFaltar + "\n\n";
  }

  msg += "─────────────────────────\n_Relatório diário automático._";
  return msg;
}

// ---------------------------------------------------------------------
// WHATSAPP (CallMeBot)
// ---------------------------------------------------------------------
async function enviarWhatsApp(env, texto) {
  const url =
    "https://api.callmebot.com/whatsapp.php?phone=" +
    encodeURIComponent(env.WA_PHONE) +
    "&text=" +
    encodeURIComponent(texto) +
    "&apikey=" +
    encodeURIComponent(env.CALLMEBOT_KEY);

  const r = await fetch(url);
  if (!r.ok) {
    const corpo = await r.text();
    throw new Error("CallMeBot retornou " + r.status + ": " + corpo.slice(0, 200));
  }
}

async function rotinaDiaria(env) {
  // Hora de Brasília (UTC-3)
  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const dia = agora.getUTCDay();

  const materias = await buscarMaterias(env.SUAP_USER, env.SUAP_PASS);
  const msg = montarMensagemDoDia(materias, dia);
  if (msg) await enviarWhatsApp(env, msg);
  return !!msg;
}

// ---------------------------------------------------------------------
// WORKER
// ---------------------------------------------------------------------
export default {
  // Disparado pelo Cron Trigger
  async scheduled(event, env, ctx) {
    ctx.waitUntil(rotinaDiaria(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Teste manual do envio diário: /enviar?token=SEU_TOKEN
    if (url.pathname === "/enviar") {
      if (!env.TOKEN || url.searchParams.get("token") !== env.TOKEN) {
        return new Response("Não autorizado", { status: 401 });
      }
      try {
        const enviou = await rotinaDiaria(env);
        return new Response(enviou ? "Mensagem enviada!" : "Hoje não há aula (fim de semana).");
      } catch (err) {
        return new Response("Erro: " + err.message, { status: 500 });
      }
    }

    // Relatório manual pela página
    if (url.pathname === "/processar" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const usuario = (formData.get("usuario") || "").toString().trim();
        const senha = (formData.get("senha") || "").toString();
        const telefone = (formData.get("telefone") || "").toString().replace(/\D/g, "");

        if (!usuario || !senha) {
          return json({ erro: "Matrícula e senha são obrigatórias." }, 400);
        }

        const materias = await buscarMaterias(usuario, senha);
        return json({
          materias,
          mensagem: montarMensagemCompleta(materias),
          telefone,
        });
      } catch (err) {
        return json({ erro: "Erro ao processar: " + err.message }, 500);
      }
    }

    return new Response(HTML_PAGE, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};
