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
        document.getElementById('suapForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const resultadoDiv = document.getElementById('resultado');
            resultadoDiv.innerHTML = '<p style="text-align:center; color: #64748b;">Acessando SUAP e calculando faltas...</p>';

            const formData = new FormData(this);
            const response = await fetch('/processar', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            
            if (data.erro) {
                resultadoDiv.innerHTML = '<p style="color: #ef4444; text-align: center;">' + data.erro + '</p>';
                return;
            }

            let html = '<h3>Relatório Gerado:</h3>';
            data.materias.forEach(item => {
                let statusClass = 'OK';
                if (item.restantes < 0) statusClass = 'ESTOURADO';
                else if (item.restantes <= 2) statusClass = 'PERIGO';

                html += '<div class="card ' + statusClass + '">' +
                        '<span class="badge bg-' + statusClass + '">' + statusClass + '</span>' +
                        '<strong>' + item.disciplina + '</strong><br>' +
                        '<small>Faltas acumuladas: ' + item.faltas + ' de ' + item.limite_max + ' permitidas</small><br>' +
                        '<small>Frequência atual: ' + item.freq_atual + '</small><br>' +
                        '<strong>Faltas restantes no curso: ' + item.restantes + '</strong>' +
                    '</div>';
            });

            const urlWa = 'https://api.whatsapp.com/send?phone=' + data.telefone + '&text=' + encodeURIComponent(data.mensagem);
            html += '<a href="' + urlWa + '" target="_blank" class="whatsapp-btn">📲 Enviar Relatório pelo WhatsApp</a>';

            resultadoDiv.innerHTML = html;
        });
    </script>
</body>
</html>`;

function cleanText(text) {
    return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function parseCookies(headers) {
    const cookies = [];
    headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
            const parts = value.split(';');
            if (parts.length > 0) cookies.push(parts[0].trim());
        }
    });
    return cookies.join('; ');
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === '/processar' && request.method === 'POST') {
            try {
                const formData = await request.formData();
                const usuario = formData.get('usuario');
                const senha = formData.get('senha');
                const telefone = formData.get('telefone');

                if (!usuario || !senha) {
                    return new Response(JSON.stringify({ erro: "Matrícula e senha são obrigatórias." }), {
                        status: 400,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
                const loginUrl = "https://suap.ifba.edu.br/accounts/login/";

                const initialRes = await fetch(loginUrl, { headers: { 'User-Agent': userAgent } });
                const initialHtml = await initialRes.text();
                const initialCookies = parseCookies(initialRes.headers);

                const csrfMatch = initialHtml.match(/name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)["']/);
                if (!csrfMatch) {
                    return new Response(JSON.stringify({ erro: "Erro ao conectar ao servidor do SUAP." }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                const csrfToken = csrfMatch[1];
                const loginBody = new URLSearchParams({
                    'username': usuario,
                    'password': senha,
                    'csrfmiddlewaretoken': csrfToken,
                    'next': ''
                });

                const loginRes = await fetch(loginUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': userAgent,
                        'Referer': loginUrl,
                        'Cookie': initialCookies
                    },
                    body: loginBody.toString(),
                    redirect: 'manual'
                });

                const authCookies = parseCookies(loginRes.headers) || initialCookies;

                const boletimUrl = "https://suap.ifba.edu.br/edu/aluno/" + usuario + "/?tab=boletim";
                const res = await fetch(boletimUrl, {
                    headers: { 'User-Agent': userAgent, 'Cookie': authCookies }
                });
                const html = await res.text();

                const trMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];

                const dadosMaterias = [];
                const materiasEncontradas = new Set();

                for (const tr of trMatches) {
                    if (tr.includes('colspan') || tr.includes('<thead>') || tr.includes('<th>')) continue;

                    const tdMatches = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
                    if (tdMatches.length < 6) continue;

                    const cols = tdMatches.map(cleanText);

                    let disciplina = cols[1];
                    if (!disciplina) continue;

                    const discLower = disciplina.toLowerCase();
                    if (discLower.includes("total") || discLower.includes("componente")) continue;

                    // Limpa código da disciplina (ex: "TIN.0281 - Banco de Dados" -> "Banco de Dados")
                    if (disciplina.includes("-")) {
                        const partes = disciplina.split("-");
                        if (partes.length > 1) {
                            disciplina = partes.slice(1).join("-").trim();
                        }
                    }

                    if (materiasEncontradas.has(disciplina.toLowerCase())) continue;
                    materiasEncontradas.add(disciplina.toLowerCase());

                    // Extração exata baseada nas colunas do SUAP vistas no print
                    // cols[2] = Carga Horária Total (C.H., ex: "72 Aulas")
                    const chMatch = cols[2].match(/\d+/);
                    const cargaHorariaTotal = chMatch ? parseInt(chMatch[0], 10) : 72;

                    // cols[4] = Total de Faltas (T. Faltas)
                    const faltas = parseInt(cols[4], 10) || 0;

                    // cols[5] = Porcentagem de Frequência (% Freq.)
                    let freqVal = 100;
                    const freqTexto = cols[5];
                    if (freqTexto.includes("%")) {
                        freqVal = parseFloat(freqTexto.replace("%", "").replace(",", ".")) || 100;
                    }

                    const limiteMax = Math.floor(cargaHorariaTotal * 0.25);
                    const restantes = limiteMax - faltas;
                    const freqFormatada = freqVal.toFixed(2) + "%";

                    dadosMaterias.push({
                        disciplina,
                        total_aulas: cargaHorariaTotal,
                        faltas,
                        freq_atual: freqFormatada,
                        limite_max: limiteMax,
                        restantes
                    });
                }

                if (dadosMaterias.length === 0) {
                    return new Response(JSON.stringify({ erro: "Não foi possível extrair a lista de disciplinas do boletim." }), {
                        status: 404,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                let textoMensagem = "📊 *BOLETIM SUAP - CONTROLE DE FALTAS*\n\n";
                for (const item of dadosMaterias) {
                    let alerta = "✅ *OK*";
                    if (item.restantes < 0) alerta = "🚨 *ESTOURADO!* (" + Math.abs(item.restantes) + " além do limite)";
                    else if (item.restantes <= 2) alerta = "⚠️ *ATENÇÃO! PRÓXIMO DO LIMITE*";

                    textoMensagem += "🔹 *" + item.disciplina + "*\n";
                    textoMensagem += "   • Faltas acumuladas: " + item.faltas + " de " + item.limite_max + " permitidas\n";
                    textoMensagem += "   • Frequência atual: " + item.freq_atual + "\n";
                    textoMensagem += "   • Faltas restantes permitidas: *" + item.restantes + "* " + alerta + "\n\n";
                }

                textoMensagem += "───────────────────────────\n_Relatório gerado via Painel Web SUAP._";

                return new Response(JSON.stringify({
                    materias: dadosMaterias,
                    mensagem: textoMensagem,
                    telefone
                }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });

            } catch (err) {
                return new Response(JSON.stringify({ erro: "Erro ao processar: " + err.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json" }
                });
            }
        }

        return new Response(HTML_PAGE, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" }
        });
    }
};
