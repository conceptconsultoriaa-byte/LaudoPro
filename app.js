/* ===========================================================
   LaudoPro — painel do assinante (Supabase: multi-tenant real)
   Controle pessoal de laudos por empresa contratante.
   =========================================================== */

const BACKEND_URL = "https://agendapro-backend-1n92.onrender.com";

let CURRENT_USER = null;
let BUSINESS = null;
let EMPRESAS = [];
let VALORES = [];
let LAUDOS = [];
let RECEBIMENTOS = [];
let editingEmpresaId = null;

function brl(v){ return "R$ " + Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2, maximumFractionDigits:2}); }
function formatDateBR(dateStr){ if(!dateStr) return "—"; const [y,m,d] = dateStr.split("-"); return `${d}/${m}/${y}`; }
function monthRange(monthStr){
  const [y,m] = monthStr.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2,"0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
  return { start, end };
}
function monthLabel(monthStr){
  const [y,m] = monthStr.split("-").map(Number);
  const nomes = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${nomes[m-1]}/${y}`;
}
function currentMonthStr(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function empresaNome(id){ return (EMPRESAS.find(e=>e.id===id)||{}).nome || "—"; }
const TIPO_LABEL = { eletivo: "Eletivo", urgencia: "Urgência", internados: "Internados" };
const MODALIDADE_LABEL = { tomografia: "Tomografia", raio_x: "Raio-X", ressonancia: "Ressonância Magnética", mamografia: "Mamografia" };

/* ---------------- AUTH / BOOTSTRAP ---------------- */
async function boot(){
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(!session){ window.location.href = "login.html"; return; }
  CURRENT_USER = session.user;
  await loadOrCreateBusiness();
  if(isSubscriptionBlocked()){ renderSubscriptionGate(); return; }
  await loadAll();
  fillConfigForm();
  refreshAll();
  await renderSponsorBanner();
}

async function renderSponsorBanner(){
  const { data } = await supabaseClient.from("patrocinadores").select("*").eq("produto", "laudopro").eq("ativo", true).limit(1).maybeSingle();
  const el = document.getElementById("sponsorBanner");
  if(!data){ el.innerHTML = ""; return; }
  el.innerHTML = `<div class="sponsor-banner">
    ${data.logo_url ? `<img src="${data.logo_url}" alt="${data.nome}">` : ""}
    <span class="label">Patrocinado por</span> <a href="${data.link_url || '#'}" target="_blank" rel="noopener"><strong>${data.nome}</strong></a>
  </div>`;
}

/* ---------------- ASSINATURA ---------------- */
function isSubscriptionBlocked(){
  if(BUSINESS.subscription_status === "inadimplente" || BUSINESS.subscription_status === "cancelado") return true;
  if(BUSINESS.subscription_status === "trial" && !BUSINESS.subscription_plan && BUSINESS.trial_expires_at && new Date(BUSINESS.trial_expires_at) < new Date()) return true;
  return false;
}
function trialExpirado(){
  return BUSINESS.subscription_status === "trial" && !BUSINESS.subscription_plan && BUSINESS.trial_expires_at && new Date(BUSINESS.trial_expires_at) < new Date();
}
async function iniciarAssinatura(plano){
  try{
    const resp = await fetch(`${BACKEND_URL}/api/assinatura/criar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_id: BUSINESS.id, email: CURRENT_USER.email, plano, produto: "laudopro" })
    });
    const data = await resp.json();
    if(data.link){ window.location.href = data.link; }
    else { alert("Não foi possível iniciar a assinatura: " + (data.error || "tente novamente em instantes.")); }
  }catch(err){
    alert("Erro de conexão com o servidor de pagamento. Tente novamente em instantes.");
  }
}
function renderSubscriptionGate(){
  document.querySelector(".tabs").style.display = "none";
  const titulo = trialExpirado() ? "Seu teste grátis de 30 dias acabou" : "Assinatura pendente";
  const msg = trialExpirado()
    ? "Esperamos que tenha gostado! Escolha um plano abaixo pra continuar usando o LaudoPro."
    : `Sua assinatura do LaudoPro está <strong>${BUSINESS.subscription_status}</strong>. Escolha um plano abaixo para voltar a usar o app.`;
  document.querySelector(".content").innerHTML = `
    <h1>${titulo}</h1>
    <p class="hint">${msg}</p>
    <div class="cards">
      <div class="card">
        <span class="card-label">LaudoPro Completo — R$ 97/mês</span>
        <span class="hint">Empresas ilimitadas, gráfico de evolução, ranking de empresas, exportação em PDF e alerta de atraso.</span>
        <button class="btn-primary" id="gatePro" style="margin-top:10px;">Assinar agora</button>
      </div>
    </div>
  `;
  document.getElementById("gatePro").addEventListener("click", ()=> iniciarAssinatura("pro"));
}

document.getElementById("logoutBtn").addEventListener("click", async ()=>{
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
});

async function loadOrCreateBusiness(){
  let { data: biz } = await supabaseClient.from("businesses").select("*").eq("owner_id", CURRENT_USER.id).maybeSingle();
  if(!biz){
    const slug = "laudopro-" + Math.random().toString(36).slice(2,8);
    const { data: newBiz, error } = await supabaseClient.from("businesses")
      .insert({ owner_id: CURRENT_USER.id, slug, name: "Meu LaudoPro", segment: "laudos" })
      .select().single();
    if(error){ alert("Erro ao criar cadastro: " + error.message); return; }
    biz = newBiz;
  }
  BUSINESS = biz;
}

async function loadAll(){
  const [{ data: emp }, { data: val }, { data: lau }, { data: rec }] = await Promise.all([
    supabaseClient.from("lp_empresas").select("*").eq("business_id", BUSINESS.id).order("nome"),
    supabaseClient.from("lp_valores").select("*").eq("business_id", BUSINESS.id),
    supabaseClient.from("lp_laudos").select("*").eq("business_id", BUSINESS.id).order("data", { ascending: false }),
    supabaseClient.from("lp_recebimentos").select("*").eq("business_id", BUSINESS.id).order("competencia", { ascending: false })
  ]);
  EMPRESAS = emp || [];
  VALORES = val || [];
  LAUDOS = lau || [];
  RECEBIMENTOS = rec || [];
  fillEmpresaSelects();
}

function fillEmpresaSelects(){
  const opts = EMPRESAS.map(e => `<option value="${e.id}">${e.nome}</option>`).join("");
  ["lauEmpresa","recEmpresa","relEmpresa"].forEach(id => { document.getElementById(id).innerHTML = opts; });
  document.getElementById("filtroEmpresaLaudos").innerHTML = `<option value="">Todas as empresas</option>` + opts;
}

/* ---------------- TABS ---------------- */
document.querySelectorAll(".tab-btn[data-tab]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab-btn[data-tab]").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-"+btn.dataset.tab).classList.add("active");
    refreshAll();
  });
});

/* ---------------- THEME / BRAND ---------------- */
function applyBrand(){
  document.documentElement.setAttribute("data-theme", "dark");
  const cor = BUSINESS.brand_color || "#2E86FF";
  document.documentElement.style.setProperty("--lime", cor);
  document.documentElement.style.setProperty("--lime-ink", contrastInk(cor));
  document.getElementById("brandName").textContent = "LaudoPro";
}
function contrastInk(hex){
  const num = parseInt(hex.slice(1),16);
  const r=(num>>16)&255, g=(num>>8)&255, b=num&255;
  const brightness = (r*299 + g*587 + b*114) / 1000;
  return brightness > 150 ? "#101010" : "#F5F5EF";
}

/* ---------------- CONFIG ---------------- */
const cfgForm = document.getElementById("configForm");
function fillConfigForm(){
  document.getElementById("cfgNome").value = BUSINESS.name;
  document.getElementById("cfgCor").value = BUSINESS.brand_color || "#2E86FF";
  renderSubStatus();
}
function renderSubStatus(){
  const badge = document.getElementById("subStatusBadge");
  const statusClassMap = { trial: "status-pendente", ativo: "status-pago", inadimplente: "status-cancelado", cancelado: "status-cancelado" };
  let texto = BUSINESS.subscription_status || "trial";
  if(BUSINESS.subscription_status === "trial" && !BUSINESS.subscription_plan && BUSINESS.trial_expires_at){
    const dias = Math.max(0, Math.ceil((new Date(BUSINESS.trial_expires_at) - new Date()) / 86400000));
    texto = `trial · ${dias} dia(s) restante(s)`;
  }
  badge.textContent = texto;
  badge.className = "status-badge " + (statusClassMap[BUSINESS.subscription_status] || "status-pendente");
}
document.getElementById("btnAssinarPro").addEventListener("click", ()=> iniciarAssinatura("pro"));

cfgForm.addEventListener("submit", async e=>{
  e.preventDefault();
  const updates = {
    name: document.getElementById("cfgNome").value.trim() || "Meu LaudoPro",
    brand_color: document.getElementById("cfgCor").value,
  };
  const { data, error } = await supabaseClient.from("businesses").update(updates).eq("id", BUSINESS.id).select().single();
  if(error){ alert("Erro ao salvar: " + error.message); return; }
  BUSINESS = data;
  applyBrand();
  alert("Configurações salvas.");
});

/* ---------------- EMPRESAS + VALORES ---------------- */
document.getElementById("empresaForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const nome = document.getElementById("empNome").value.trim();
  if(!nome){ return; }
  const payload = {
    nome,
    telefone: document.getElementById("empTelefone").value.trim(),
    observacoes: document.getElementById("empObs").value.trim(),
  };
  let error;
  if(editingEmpresaId){
    ({ error } = await supabaseClient.from("lp_empresas").update(payload).eq("id", editingEmpresaId));
  } else {
    ({ error } = await supabaseClient.from("lp_empresas").insert({ business_id: BUSINESS.id, ...payload }));
  }
  if(error){ alert("Erro: " + error.message); return; }
  cancelarEdicaoEmpresa();
  await loadAll(); refreshAll();
});
window.editarEmpresa = (id) => {
  const emp = EMPRESAS.find(e=>e.id===id);
  if(!emp) return;
  editingEmpresaId = id;
  document.getElementById("empNome").value = emp.nome || "";
  document.getElementById("empTelefone").value = emp.telefone || "";
  document.getElementById("empObs").value = emp.observacoes || "";
  const titulo = document.getElementById("empresaFormTitle");
  titulo.textContent = "Editando: " + emp.nome;
  titulo.style.display = "block";
  document.getElementById("empresaFormSubmitBtn").textContent = "Salvar alterações";
  document.getElementById("empresaFormCancelBtn").style.display = "inline-block";
  document.getElementById("empresaForm").scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("empNome").focus();
};
function cancelarEdicaoEmpresa(){
  editingEmpresaId = null;
  document.getElementById("empresaForm").reset();
  document.getElementById("empresaFormTitle").style.display = "none";
  document.getElementById("empresaFormSubmitBtn").textContent = "Cadastrar empresa";
  document.getElementById("empresaFormCancelBtn").style.display = "none";
}
window.cancelarEdicaoEmpresa = cancelarEdicaoEmpresa;

async function salvarValor(empresaId, modalidade, tipo, valor){
  if(!modalidade || !tipo || isNaN(valor)) return;
  const { error } = await supabaseClient.from("lp_valores").upsert(
    { business_id: BUSINESS.id, empresa_id: empresaId, modalidade, tipo, valor_unitario: valor },
    { onConflict: "empresa_id,modalidade,tipo" }
  );
  if(error){ alert("Erro ao salvar valor: " + error.message); return; }
  await loadAll(); refreshAll();
}
window.salvarValorInline = (empresaId) => {
  const modalidade = document.getElementById(`valModalidade-${empresaId}`).value;
  const tipo = document.getElementById(`valTipo-${empresaId}`).value;
  const valor = parseFloat(document.getElementById(`valValor-${empresaId}`).value.replace(",","."));
  salvarValor(empresaId, modalidade, tipo, valor);
};
window.excluirEmpresa = async (id) => {
  if(!confirm("Excluir esta empresa? Os laudos e recebimentos ligados a ela também podem ser afetados.")) return;
  const { error } = await supabaseClient.from("lp_empresas").delete().eq("id", id);
  if(error){ alert("Erro ao excluir: " + error.message); return; }
  await loadAll(); refreshAll();
};

function renderEmpresasList(){
  const el = document.getElementById("empresasList");
  el.innerHTML = "";
  if(EMPRESAS.length === 0){ el.insertAdjacentHTML("beforeend", "<p class='hint'>Nenhuma empresa cadastrada ainda.</p>"); return; }
  EMPRESAS.forEach(emp=>{
    const valoresEmp = VALORES.filter(v=>v.empresa_id===emp.id);
    const div = document.createElement("div");
    div.className = "list-item";
    div.style.display = "block";
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <span><strong>${emp.nome}</strong>${emp.telefone ? " · " + emp.telefone : ""}</span>
        <span style="display:flex; gap:8px;">
          <button class="btn-secondary" onclick="editarEmpresa('${emp.id}')">Editar</button>
          <button class="btn-danger" onclick="excluirEmpresa('${emp.id}')">Excluir</button>
        </span>
      </div>
      <div style="margin-top:10px;">
        <span class="hint">Valores por exame × estado do paciente:</span>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:6px;">
          ${valoresEmp.map(v=>`<span class="status-badge status-pago">${MODALIDADE_LABEL[v.modalidade]||v.modalidade} · ${TIPO_LABEL[v.tipo]||v.tipo}: ${brl(v.valor_unitario)}</span>`).join("") || "<span class='hint'>nenhum valor cadastrado ainda</span>"}
        </div>
        <div class="form-inline" style="margin-top:10px;">
          <select id="valModalidade-${emp.id}" style="min-height:38px; padding:8px; border:1px solid var(--line); border-radius:8px;">
            <option value="tomografia">Tomografia</option>
            <option value="raio_x">Raio-X</option>
            <option value="ressonancia">Ressonância Magnética</option>
            <option value="mamografia">Mamografia</option>
          </select>
          <select id="valTipo-${emp.id}" style="min-height:38px; padding:8px; border:1px solid var(--line); border-radius:8px;">
            <option value="eletivo">Eletivo</option>
            <option value="urgencia">Urgência</option>
            <option value="internados">Internados</option>
          </select>
          <input type="number" id="valValor-${emp.id}" placeholder="Valor R$" step="0.01" style="min-height:38px; padding:8px; border:1px solid var(--line); border-radius:8px; width:120px;">
          <button class="btn-secondary" onclick="salvarValorInline('${emp.id}')">Salvar valor</button>
        </div>
      </div>`;
    el.appendChild(div);
  });
}

/* ---------------- LAUDOS ---------------- */
document.getElementById("laudoForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const empresaId = document.getElementById("lauEmpresa").value;
  const modalidade = document.getElementById("lauModalidade").value;
  const tipo = document.getElementById("lauTipo").value;
  const qtd = Number(document.getElementById("lauQtd").value);
  if(!empresaId){ alert("Cadastre uma empresa primeiro."); return; }
  const valorCadastrado = VALORES.find(v=>v.empresa_id===empresaId && v.modalidade===modalidade && v.tipo===tipo);
  const valorUnit = valorCadastrado ? Number(valorCadastrado.valor_unitario) : 0;
  if(!valorCadastrado){
    if(!confirm(`Não há valor cadastrado para ${MODALIDADE_LABEL[modalidade]} (${TIPO_LABEL[tipo]}) nessa empresa. Lançar mesmo assim com valor R$ 0,00? (você pode cadastrar o valor na aba Empresas)`)) return;
  }
  const { error } = await supabaseClient.from("lp_laudos").insert({
    business_id: BUSINESS.id, empresa_id: empresaId,
    data: document.getElementById("lauData").value,
    modalidade, tipo, quantidade: qtd, valor_unitario: valorUnit, valor_total: valorUnit * qtd,
  });
  if(error){ alert("Erro: " + error.message); return; }
  e.target.reset();
  await loadAll(); refreshAll();
});

document.getElementById("btnFiltrarLaudos").addEventListener("click", (e)=>{ e.preventDefault(); renderLaudosList(); });

function renderLaudosList(){
  const empresaId = document.getElementById("filtroEmpresaLaudos").value;
  const mes = document.getElementById("filtroMesLaudos").value;
  let lista = LAUDOS;
  if(empresaId) lista = lista.filter(l=>l.empresa_id===empresaId);
  if(mes){ const { start, end } = monthRange(mes); lista = lista.filter(l=>l.data>=start && l.data<=end); }

  const el = document.getElementById("laudosList");
  el.innerHTML = "";
  if(lista.length === 0){ el.innerHTML = "<p class='hint'>Nenhum laudo encontrado.</p>"; return; }
  lista.forEach(l=>{
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<span>${formatDateBR(l.data)} · <strong>${empresaNome(l.empresa_id)}</strong> · ${MODALIDADE_LABEL[l.modalidade]||l.modalidade} · ${TIPO_LABEL[l.tipo]||l.tipo} · ${l.quantidade}x · ${brl(l.valor_total)}</span>
      <button class="btn-danger" onclick="excluirLaudo('${l.id}')">Excluir</button>`;
    el.appendChild(div);
  });
}
window.excluirLaudo = async (id) => {
  if(!confirm("Excluir este laudo?")) return;
  await supabaseClient.from("lp_laudos").delete().eq("id", id);
  await loadAll(); refreshAll();
};

/* ---------------- RECEBIMENTOS ---------------- */
document.getElementById("recebimentoForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const mes = document.getElementById("recCompetencia").value;
  const { error } = await supabaseClient.from("lp_recebimentos").upsert({
    business_id: BUSINESS.id,
    empresa_id: document.getElementById("recEmpresa").value,
    competencia: mes + "-01",
    valor_recebido: Number(document.getElementById("recValor").value),
    data_recebimento: document.getElementById("recData").value || null,
  }, { onConflict: "empresa_id,competencia" });
  if(error){ alert("Erro: " + error.message); return; }
  e.target.reset();
  await loadAll(); refreshAll();
});

function renderRecebimentosList(){
  const el = document.getElementById("recebimentosList");
  el.innerHTML = "";
  if(RECEBIMENTOS.length === 0){ el.innerHTML = "<p class='hint'>Nenhum recebimento registrado ainda.</p>"; return; }
  RECEBIMENTOS.forEach(r=>{
    const mes = r.competencia.slice(0,7);
    const esperado = LAUDOS.filter(l=>l.empresa_id===r.empresa_id && l.data.slice(0,7)===mes).reduce((s,l)=>s+Number(l.valor_total),0);
    const diff = Number(r.valor_recebido) - esperado;
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<span><strong>${empresaNome(r.empresa_id)}</strong> · ${monthLabel(mes)} · recebido ${brl(r.valor_recebido)} de ${brl(esperado)} esperado
      ${diff < -0.009 ? `<span class="status-badge status-cancelado">faltou ${brl(-diff)}</span>` : `<span class="status-badge status-pago">ok</span>`}</span>`;
    el.appendChild(div);
  });
}

/* ---------------- RELATÓRIO ---------------- */
document.getElementById("btnGerarRelatorio").addEventListener("click", (e)=>{
  e.preventDefault();
  const empresaId = document.getElementById("relEmpresa").value;
  const mes = document.getElementById("relMes").value;
  if(!empresaId || !mes){ alert("Escolha empresa e mês."); return; }
  const { start, end } = monthRange(mes);
  const lista = LAUDOS.filter(l=>l.empresa_id===empresaId && l.data>=start && l.data<=end);
  const combos = {};
  lista.forEach(l=>{ const key = `${l.modalidade}|${l.tipo}`; combos[key] = combos[key] || { modalidade: l.modalidade, tipo: l.tipo, qtd: 0, valor: 0 }; combos[key].qtd += l.quantidade; combos[key].valor += Number(l.valor_total); });
  const total = Object.values(combos).reduce((s,t)=>s+t.valor,0);
  const emp = EMPRESAS.find(e=>e.id===empresaId);

  let texto = `*Relatório de Laudos*\n${emp.nome} — ${monthLabel(mes)}\n\n`;
  Object.values(combos).forEach(c=>{ texto += `${MODALIDADE_LABEL[c.modalidade]||c.modalidade} (${TIPO_LABEL[c.tipo]||c.tipo}): ${c.qtd} laudo(s) — ${brl(c.valor)}\n`; });
  texto += `\n*Total do período: ${brl(total)}*`;
  if(lista.length === 0) texto = `*Relatório de Laudos*\n${emp.nome} — ${monthLabel(mes)}\n\nNenhum laudo lançado neste período.`;

  document.getElementById("relatorioBox").innerHTML = `<div class="report-totals" style="white-space:pre-wrap;">${texto}</div>
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
      ${emp.telefone ? `<a class="btn-whats" style="display:inline-block;" target="_blank" href="https://wa.me/${emp.telefone.replace(/\D/g,"")}?text=${encodeURIComponent(texto)}">Enviar no WhatsApp</a>` : `<p class="hint" style="margin:0;">Cadastre o WhatsApp dessa empresa para enviar direto.</p>`}
      <button class="btn-secondary" id="btnBaixarPDF">Baixar PDF</button>
    </div>`;

  document.getElementById("btnBaixarPDF").addEventListener("click", ()=>{
    baixarRelatorioPDF(texto, emp.nome, monthLabel(mes));
  });
});

function baixarRelatorioPDF(texto, nomeEmpresa, mesLabel){
  const area = document.getElementById("printArea");
  area.innerHTML = `<div class="print-report">
    <h1>LaudoPro — Relatório de Laudos</h1>
    <h2>${nomeEmpresa} — ${mesLabel}</h2>
    <div>${texto.replace(/\*/g,"")}</div>
  </div>`;
  document.body.classList.add("printing");
  window.print();
  document.body.classList.remove("printing");
}
window.addEventListener("afterprint", ()=> document.body.classList.remove("printing"));

/* ---------------- GRÁFICO DE EVOLUÇÃO MENSAL ---------------- */
function renderGraficoEvolucao(){
  const el = document.getElementById("graficoEvolucao");
  const now = new Date();
  const meses = [];
  for(let i=5;i>=0;i--){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    meses.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
  }
  const dados = meses.map(mes=>{
    const { start, end } = monthRange(mes);
    const esperado = LAUDOS.filter(l=>l.data>=start && l.data<=end).reduce((s,l)=>s+Number(l.valor_total),0);
    const recebido = RECEBIMENTOS.filter(r=>r.competencia.slice(0,7)===mes).reduce((s,r)=>s+Number(r.valor_recebido),0);
    return { mes, esperado, recebido };
  });
  const semDados = dados.every(d=>d.esperado===0 && d.recebido===0);
  if(semDados){ el.innerHTML = "<p class='hint'>Lance laudos e registre recebimentos para ver a evolução mês a mês.</p>"; return; }

  const max = Math.max(1, ...dados.map(d=>Math.max(d.esperado, d.recebido)));
  const w = 720, h = 240, padBottom = 34, padTop = 14;
  const groupW = w / dados.length, barW = 24, gap = 6;
  let bars = "";
  dados.forEach((d,i)=>{
    const cx = i*groupW + groupW/2;
    const areaH = h - padTop - padBottom;
    const hEsp = (d.esperado/max) * areaH;
    const hRec = (d.recebido/max) * areaH;
    bars += `
      <rect x="${cx-gap/2-barW}" y="${h-padBottom-hEsp}" width="${barW}" height="${hEsp}" fill="#8FB8F2" rx="3"></rect>
      <rect x="${cx+gap/2}" y="${h-padBottom-hRec}" width="${barW}" height="${hRec}" fill="var(--lime)" rx="3"></rect>
      <text x="${cx}" y="${h-14}" text-anchor="middle" font-size="13" fill="currentColor">${monthLabel(d.mes).slice(0,3)}</text>
    `;
  });
  el.innerHTML = `
    <div style="display:flex; gap:16px; align-items:center; margin-bottom:10px; font-size:0.82rem; color:var(--muted);">
      <span><span style="display:inline-block;width:12px;height:12px;background:#8FB8F2;border-radius:3px;margin-right:6px;"></span>Esperado</span>
      <span><span style="display:inline-block;width:12px;height:12px;background:var(--lime);border-radius:3px;margin-right:6px;"></span>Recebido</span>
    </div>
    <svg viewBox="0 0 ${w} ${h}" style="width:100%; max-width:720px; height:auto; color:var(--muted);">${bars}</svg>
  `;
}

/* ---------------- RANKING DE EMPRESAS ---------------- */
function renderRankingEmpresas(){
  const el = document.getElementById("rankingEmpresas");
  const combos = {};
  VALORES.forEach(v=>{
    const key = `${v.modalidade}|${v.tipo}`;
    combos[key] = combos[key] || [];
    combos[key].push({ empresaId: v.empresa_id, valor: Number(v.valor_unitario) });
  });
  const keys = Object.keys(combos).filter(k=>combos[k].length >= 2);
  if(keys.length === 0){
    el.innerHTML = "<p class='hint'>Cadastre o valor de pelo menos 2 empresas para o mesmo exame + estado do paciente pra ver quem paga melhor.</p>";
    return;
  }
  el.innerHTML = keys.map(key=>{
    const [modalidade, tipo] = key.split("|");
    const sorted = combos[key].slice().sort((a,b)=>b.valor-a.valor);
    return `<div class="ranking-combo">
      <div class="rk-title">${MODALIDADE_LABEL[modalidade]||modalidade} · ${TIPO_LABEL[tipo]||tipo}</div>
      ${sorted.map((s,i)=>`<div class="rk-row ${i===0 ? "rk-best" : ""}"><span>${i+1}º ${empresaNome(s.empresaId)}${i===0 ? " — paga melhor" : ""}</span><span>${brl(s.valor)}</span></div>`).join("")}
    </div>`;
  }).join("");
}

/* ---------------- ALERTA DE RECEBIMENTO EM ATRASO ---------------- */
function calcularAtrasos(){
  const mesAtual = currentMonthStr();
  const mesesPassados = [...new Set(LAUDOS.map(l=>l.data.slice(0,7)))].filter(m=>m<mesAtual);
  const alertas = [];
  mesesPassados.forEach(mes=>{
    const { start, end } = monthRange(mes);
    const empresasDoMes = [...new Set(LAUDOS.filter(l=>l.data>=start && l.data<=end).map(l=>l.empresa_id))];
    empresasDoMes.forEach(empId=>{
      const esperado = LAUDOS.filter(l=>l.empresa_id===empId && l.data>=start && l.data<=end).reduce((s,l)=>s+Number(l.valor_total),0);
      const rec = RECEBIMENTOS.find(r=>r.empresa_id===empId && r.competencia.slice(0,7)===mes);
      const recebido = rec ? Number(rec.valor_recebido) : 0;
      if(esperado > 0 && recebido < esperado - 0.009){
        alertas.push({ empresaId: empId, mes, falta: esperado - recebido });
      }
    });
  });
  return alertas.sort((a,b)=> a.mes < b.mes ? -1 : 1);
}
function renderAlertaAtrasos(){
  const el = document.getElementById("alertaAtrasos");
  const alertas = calcularAtrasos();
  if(alertas.length === 0){ el.innerHTML = ""; return; }
  el.innerHTML = `<div class="alert-atraso">
    <strong>Recebimento em atraso</strong>
    <div style="margin-top:8px; display:flex; flex-direction:column; gap:4px;">
      ${alertas.map(a=>`<span>${empresaNome(a.empresaId)} — ${monthLabel(a.mes)}: faltam ${brl(a.falta)}</span>`).join("")}
    </div>
  </div>`;
}

/* ---------------- DASHBOARD ---------------- */
function renderDashboard(){
  const mes = currentMonthStr();
  const { start, end } = monthRange(mes);
  const laudosMes = LAUDOS.filter(l=>l.data>=start && l.data<=end);
  const esperado = laudosMes.reduce((s,l)=>s+Number(l.valor_total),0);
  const recebido = RECEBIMENTOS.filter(r=>r.competencia.slice(0,7)===mes).reduce((s,r)=>s+Number(r.valor_recebido),0);
  document.getElementById("statEsperado").textContent = brl(esperado);
  document.getElementById("statRecebido").textContent = brl(recebido);
  document.getElementById("statDiferenca").textContent = brl(recebido - esperado);
  document.getElementById("statQtdLaudos").textContent = laudosMes.reduce((s,l)=>s+l.quantidade,0);

  const el = document.getElementById("ultimosLaudos");
  el.innerHTML = "";
  const recentes = LAUDOS.slice(0,8);
  if(recentes.length === 0){ el.innerHTML = "<p class='hint'>Nenhum laudo lançado ainda.</p>"; return; }
  recentes.forEach(l=>{
    const div = document.createElement("div");
    div.className = "appointment-item";
    div.innerHTML = `<span>${formatDateBR(l.data)} · <strong>${empresaNome(l.empresa_id)}</strong> · ${MODALIDADE_LABEL[l.modalidade]||l.modalidade} · ${TIPO_LABEL[l.tipo]||l.tipo} · ${l.quantidade}x · ${brl(l.valor_total)}</span>`;
    el.appendChild(div);
  });
}

/* ---------------- REFRESH ALL ---------------- */
function refreshAll(){
  applyBrand();
  renderEmpresasList();
  renderLaudosList();
  renderRecebimentosList();
  renderDashboard();
  renderGraficoEvolucao();
  renderRankingEmpresas();
  renderAlertaAtrasos();
}

/* ---------------- INIT ---------------- */
boot();
