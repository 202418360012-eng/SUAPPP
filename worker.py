import math
import urllib.parse
from bs4 import BeautifulSoup
from js import Response, Headers

HTML_PAGE = """<!DOCTYPE html>
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
                resultadoDiv.innerHTML = `<p style="color: #ef4444; text-align: center;">${data.erro}</p>`;
                return;
            }

            let html = '<h3>Relatório Gerado:</h3>';
            data.materias.forEach(item => {
                let statusClass = 'OK';
                if (item.restantes < 0) statusClass = 'ESTOURADO';
                else if (item.restantes <= 2) statusClass = 'PERIGO';

                html += `
                    <div class="card ${statusClass}">
                        <span class="badge bg-${statusClass}">${statusClass}</span>
                        <strong>${item.disciplina}</strong><br>
                        <small>Faltas acumuladas: ${item.faltas} de ${item.limite_max} permitidas</small><br>
                        <small>Frequência atual: ${item.freq_atual}</small><br>
                        <strong>Faltas restantes no curso: ${item.restantes}</strong>
                    </div>
                `;
            });

            const urlWa = `https://api.whatsapp.com/send?phone=${data.telefone}&text=${encodeURIComponent(data.mensagem)}`;
            html += `<a href="${urlWa}" target="_blank" class="whatsapp-btn">📲 Enviar Relatório pelo WhatsApp</a>`;

            resultadoDiv.innerHTML = html;
        });
    </script>
</body>
</html>"""


async def fetch_with_cookies(url, options=None):
    if options is None:
        options = {}
    from js import fetch
    return await fetch(url, options)


async def handle_processar(request):
    try:
        form_data = await request.formData()
        usuario = form_data.get('usuario')
        senha = form_data.get('senha')
        telefone = form_data.get('telefone')

        if not usuario or not senha:
            return Response.new(
                '{"erro": "Matrícula e senha são obrigatórias."}', 
                status=400, 
                headers=Headers.new({'Content-Type': 'application/json'})
            )

        login_url = "https://suap.ifba.edu.br/accounts/login/"
        
        # 1. Carrega página inicial de login para pegar CSRF e Cookies
        login_page_res = await fetch_with_cookies(login_url)
        login_html = await login_page_res.text()
        
        # Extrai cookies recebidos
        set_cookie = login_page_res.headers.get('set-cookie') or ''
        
        soup_login = BeautifulSoup(login_html, 'html.parser')
        csrf_elem = soup_login.find('input', {'name': 'csrfmiddlewaretoken'})
        if not csrf_elem:
            return Response.new(
                '{"erro": "Não foi possível obter o token de segurança do SUAP."}', 
                status=500, 
                headers=Headers.new({'Content-Type': 'application/json'})
            )
        
        csrf_token = csrf_elem['value']

        # 2. Faz o POST de Login
        body_params = urllib.parse.urlencode({
            'username': usuario,
            'password': senha,
            'csrfmiddlewaretoken': csrf_token
        })

        post_headers = Headers.new({
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': login_url,
            'Cookie': set_cookie
        })

        post_res = await fetch_with_cookies(login_url, {
            'method': 'POST',
            'headers': post_headers,
            'body': body_params
        })

        post_html = await post_res.text()
        if "Usuário ou senha inválidos" in post_html:
            return Response.new(
                '{"erro": "Matrícula ou senha do SUAP incorretas."}', 
                status=401, 
                headers=Headers.new({'Content-Type': 'application/json'})
            )

        # Atualiza cookies da sessão após login
        auth_cookie = post_res.headers.get('set-cookie') or set_cookie

        # 3. Acessa a aba do boletim
        boletim_url = f"https://suap.ifba.edu.br/edu/aluno/{usuario}/?tab=boletim"
        boletim_headers = Headers.new({'Cookie': auth_cookie})
        boletim_res = await fetch_with_cookies(boletim_url, {'headers': boletim_headers})
        boletim_html = await boletim_res.text()

        soup_boletim = BeautifulSoup(boletim_html, 'html.parser')
        tabelas = soup_boletim.find_all('table')

        if not tabelas:
            return Response.new(
                '{"erro": "Nenhuma tabela foi encontrada no boletim do SUAP."}', 
                status=404, 
                headers=Headers.new({'Content-Type': 'application/json'})
            )

        tabela_boletim = None
        for t in tabelas:
            texto_t = t.text.lower()
            if 'disciplina' in texto_t or 'diário' in texto_t or 'c.h.' in texto_t:
                tabela_boletim = t
                break

        if not tabela_boletim:
            tabela_boletim = tabelas[0]

        linhas = tabela_boletim.find_all('tr')
        dados_materias = []
        texto_mensagem = "📊 *BOLETIM SUAP - CONTROLE DE FALTAS*\n\n"

        for linha in linhas:
            colunas = linha.find_all(['td', 'th'])
            if len(colunas) < 5:
                continue

            texto_col0 = colunas[0].text.strip()
            texto_col1 = colunas[1].text.strip()

            if 'disciplina' in texto_col0.lower() or 'disciplina' in texto_col1.lower() or 'c.h.' in texto_col0.lower():
                continue

            disciplina = texto_col1 if len(texto_col1) > 2 else texto_col0

            try:
                total_aulas_materia = None
                faltas_atuais = 0
                freq_raw = "100%"

                for col in colunas[2:]:
                    val = col.text.strip()
                    if '%' in val:
                        freq_raw = val
                    elif val.isdigit():
                        num = int(val)
                        if total_aulas_materia is None and num > 10:
                            total_aulas_materia = num
                        elif total_aulas_materia is not None:
                            faltas_atuais = num

                if total_aulas_materia is None or total_aulas_materia == 0:
                    continue

            except Exception:
                continue

            limite_max_faltas = math.floor(total_aulas_materia * 0.25)
            faltas_restantes = limite_max_faltas - faltas_atuais

            dados_materias.append({
                "disciplina": disciplina,
                "total_aulas": total_aulas_materia,
                "faltas": faltas_atuais,
                "freq_atual": freq_raw,
                "limite_max": limite_max_faltas,
                "restantes": faltas_restantes
            })

            if faltas_restantes < 0:
                alerta = f"🚨 *ESTOURADO!* ({abs(faltas_restantes)} além do limite)"
            elif faltas_restantes <= 2:
                alerta = "⚠️ *ATENÇÃO! PRÓXIMO DO LIMITE*"
            else:
                alerta = "✅ *OK*"

            texto_mensagem += f"🔹 *{disciplina}*\n"
            texto_mensagem += f"   • Faltas acumuladas: {faltas_atuais} de {limite_max_faltas} permitidas\n"
            texto_mensagem += f"   • Frequência atual: {freq_raw}\n"
            texto_mensagem += f"   • Faltas restantes permitidas: *{faltas_restantes}* {alerta}\n\n"

        if not dados_materias:
            return Response.new(
                '{"erro": "Não foram encontradas disciplinas ou faltas registradas no período atual."}', 
                status=404, 
                headers=Headers.new({'Content-Type': 'application/json'})
            )

        texto_mensagem += "───────────────────────────\n"
        texto_mensagem += "_Relatório gerado via Painel Web SUAP._"

        import json
        resposta_final = {
            'materias': dados_materias,
            'mensagem': texto_mensagem,
            'telefone': telefone
        }

        return Response.new(
            json.dumps(resposta_final), 
            status=200, 
            headers=Headers.new({'Content-Type': 'application/json'})
        )

    except Exception as e:
        import json
        return Response.new(
            json.dumps({'erro': f'Erro de processamento: {str(e)}'}), 
            status=500, 
            headers=Headers.new({'Content-Type': 'application/json'})
        )


async def on_fetch(request, env):
    url = urllib.parse.urlparse(request.url)
    path = url.path

    if path == '/processar' and request.method == 'POST':
        return await handle_processar(request)
    else:
        return Response.new(
            HTML_PAGE, 
            status=200, 
            headers=Headers.new({'Content-Type': 'text/html; charset=utf-8'})
        )