/* ========= Config ========= */
const BASE_URL = "https://script.google.com/macros/s/AKfycbyH5XwPgwI_4GYMOlkMS80XjlqlFnjwHTpTE1WFOtHUdvL-hB2NFrKwhvpw82gsPnI/exec";

/* ========= Helpers de rede ========= */
async function fetchJson(url) {
  const resp = await fetch(url);
  const raw = await resp.text();
  let data; try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} - ${raw.slice(0, 500)}`);
  return data;
}
async function postJson(url, payload) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const raw = await resp.text();
  let data; try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} - ${raw.slice(0, 500)}`);
  return data;
}

/* ========= DOM ========= */
const tecnicoInput     = document.getElementById("tecnicoInput");
const container        = document.getElementById("container");
const modal            = document.getElementById("modal");
const modalTitulo      = document.getElementById("modalTitulo");
const fecharModalBtn   = document.getElementById("fecharModal");

const btnPendentes     = document.getElementById("btnPendentes");
const btnSolicitar     = document.getElementById("btnSolicitar");
const btnPedidos       = document.getElementById("btnPedidos");

const containerView    = document.getElementById("containerView");
const solicitarView    = document.getElementById("solicitarView");
const pedidosView      = document.getElementById("pedidosView");
const pedidosContainer = document.getElementById("pedidosContainer");

/* Solicitar SS - campos */
const codInput         = document.getElementById("codInput");
const dataAbertInput   = document.getElementById("dataAbertInput");
const obsInput         = document.getElementById("obsInput");
const btnAddServico    = document.getElementById("btnAddServico");
const servicosSelDiv   = document.getElementById("servicosSelecionados");
const statusSelect     = document.getElementById("statusSelect");
const encGroup         = document.getElementById("encGroup");
const dataEncInput     = document.getElementById("dataEncInput");
const btnSalvarPedido  = document.getElementById("btnSalvarPedido");
const btnLimparPedido  = document.getElementById("btnLimparPedido");

/* Modal de serviços */
const modalServicos    = document.getElementById("modalServicos");
const buscaServico     = document.getElementById("buscaServico");
const listaServicos    = document.getElementById("listaServicos");
const outroServico     = document.getElementById("outroServico");
const btnSalvarServ    = document.getElementById("btnSalvarServicos");
const btnCancelarServ  = document.getElementById("btnCancelarServicos");

/* ========= Estado ========= */
let selecionado = { ano: null, ss: null };    // modal de status (cards)
let selectedServices = [];                    // serviços do pedido atual

/* ========= Persistência da matrícula ========= */
tecnicoInput.value = localStorage.getItem("tecnicoMatricula") || "";
tecnicoInput.addEventListener("input", () => {
  localStorage.setItem("tecnicoMatricula", tecnicoInput.value);
});

/* ========= Utilitários ========= */
const g = (obj, ...keys) => { for (const k of keys) if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k]; return ""; };
const S = (v) => (v == null ? "" : String(v).trim());

function parseDataAbertura(v) {
  if (!v) return NaN;
  const s = S(v);
  const [d, m, yTime] = s.split("/");
  if (d && m && yTime) {
    const [y, time] = yTime.split(" ");
    const iso = `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}${time ? "T"+time : "T00:00:00"}`;
    const t = Date.parse(iso);
    if (!isNaN(t)) return t;
  }
  const t2 = Date.parse(s.replace(" ", "T"));
  return isNaN(t2) ? NaN : t2;
}

/* ========= Modal de status (cards) ========= */
function abrirModal(ano, ss) {
  selecionado = { ano, ss };
  modalTitulo.textContent = `SS: ${ss} \n ANO: ${ano}`;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  const firstBtn = modal.querySelector(".action-btn");
  if (firstBtn) firstBtn.focus();
}
function fecharModal() {
  if (document.activeElement && modal.contains(document.activeElement)) document.activeElement.blur();
  modal.classList.add("hidden"); modal.setAttribute("aria-hidden", "true");
  selecionado = { ano: null, ss: null };
  const navBtn = document.querySelector(".nav-btn.active") || document.querySelector(".nav-btn");
  if (navBtn) navBtn.focus();
}
fecharModalBtn.addEventListener("click", fecharModal);

/* ========= Cards (Pendentes/Concluídas) ========= */
function normalizeStatus(raw) {
  if (!raw) return "Pendente";
  const base = String(raw).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (base === "concluida" || base === "concluída") return "Concluída";
  if (base === "estou a caminho" || base === "a caminho" || base === "em deslocamento") return "Estou a caminho";
  if (base === "pendente material" || base === "pendente de material") return "Pendente Material";
  if (base === "pendente") return "Pendente";
  return String(raw).replace(/\s+/g, " ").trim().toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase());
}
function applyStatusBadge(cardEl, situacao) {
  const statusEl = cardEl.querySelector('.card-status');
  if (!statusEl) return;
  const norm = normalizeStatus(situacao);
  statusEl.setAttribute('data-status', norm);
  statusEl.textContent = norm;
}

async function carregarCards() {
  try {
    const [base, updates] = await Promise.all([
      fetchJson(`${BASE_URL}?action=listss`),
      fetchJson(`${BASE_URL}?action=listupdates`)
    ]);

    const statusMap = {}; const latestTs = {};
    (Array.isArray(updates) ? updates : []).forEach(u => {
      const ano = S(g(u, "ANO"));
      const ss  = S(g(u, "SOLICITAÇÃO", "SOLICITACAO", "SOLICITAÇAO"));
      if (!ano || !ss) return;
      const key = `${ano}::${ss}`;
      const dtStr = S(g(u, "DATA ATUALIZADA", "DATA_ATUALIZADA"));
      const ts = dtStr ? Date.parse(dtStr.replace(" ", "T")) : Date.now();
      if (!(key in latestTs) || ts >= latestTs[key]) {
        latestTs[key] = ts;
        statusMap[key] = S(g(u, "SITUAÇÃO", "SITUACAO", "SITUAÇAO")) || "Pendente";
      }
    });

    const grupos = {};
    (Array.isArray(base) ? base : []).forEach(item => {
      const ano = S(g(item, "ANO"));
      const ss  = S(g(item, "SOLICITAÇÃO", "SOLICITACAO", "SOLICITAÇAO"));
      if (!ano || !ss) return;
      const key = `${ano}::${ss}`;
      if (!grupos[key]) grupos[key] = { ano, ss, itens: [] };
      grupos[key].itens.push(item);
    });

    const gruposOrdenados = Object.values(grupos).sort((A, B) => {
      const da = parseDataAbertura(g(A.itens[0] || {}, "ABERTURA"));
      const db = parseDataAbertura(g(B.itens[0] || {}, "ABERTURA"));
      return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da);
    });

    container.innerHTML = "";
    if (gruposOrdenados.length === 0) {
      container.innerHTML = `<div class="card"><div class="card-info">Nenhuma solicitação encontrada.</div></div>`;
      return;
    }

    gruposOrdenados.forEach(gr => {
      const item0 = gr.itens[0] || {};
      const tAbert = parseDataAbertura(g(item0, "ABERTURA"));
      const dataBR = isNaN(tAbert) ? "" : new Date(tAbert).toLocaleDateString("pt-BR");
      const equip  = S(g(item0, "EQUIPAMENTO"));
      const desc   = S(g(item0, "DESC.EQUIPAMENTO", "DESC_EQUIPAMENTO"));
      const servs  = gr.itens.map(i => `<li>${S(g(i, "SERVIÇO SOLICITADO", "SERVICO SOLICITADO"))}</li>`).join("");
      const key    = `${gr.ano}::${gr.ss}`;
      const situacao = statusMap[key] || "Pendente";

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="card-header"><span>SS: ${gr.ss}</span><span>${dataBR}</span></div>
        <div class="card-info">${equip} - ${desc}</div>
        <ul>${servs}</ul>
        <div class="card-status">Pendente</div>
      `;
      applyStatusBadge(card, situacao);
      card.addEventListener("click", () => abrirModal(gr.ano, gr.ss));
      container.appendChild(card);
    });
  } catch (err) {
    console.error("Erro ao carregar cards:", err);
    alert("Falha ao carregar solicitações (veja o console).");
  }
}

/* ========= Ações do modal (status) ========= */
document.querySelectorAll(".action-btn").forEach(btn => {
  if (!btn.dataset.status) return;
  btn.addEventListener("click", async () => {
    if (!tecnicoInput.value.trim()) { alert("Por favor, insira sua matrícula primeiro!"); return; }
    if (!selecionado.ano || !selecionado.ss) { alert("Selecione uma Solicitação antes."); return; }
    const payload = {
      action: "addupdate",
      data: [{
        "ANO": selecionado.ano,
        "SOLICITAÇÃO": selecionado.ss,
        "TÉCNICO": tecnicoInput.value.trim(),
        "SITUAÇÃO": btn.dataset.status
      }]
    };
    try {
      await postJson(BASE_URL, payload);
      alert("Status atualizado com sucesso!");
      fecharModal();
      carregarCards();
    } catch (err) {
      console.error("Erro ao atualizar status:", err);
      alert("Erro ao atualizar status (veja o console).");
    }
  });
});

/* ========= View switching ========= */
function setActiveNav(btn) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
btnPendentes.addEventListener('click', () => {
  setActiveNav(btnPendentes);
  containerView.style.display = '';
  solicitarView.style.display = 'none';
  pedidosView.style.display = 'none';
  carregarCards();
});
btnSolicitar.addEventListener('click', () => {
  setActiveNav(btnSolicitar);
  containerView.style.display = 'none';
  solicitarView.style.display = '';
  pedidosView.style.display = 'none';
});
btnPedidos.addEventListener('click', () => {
  setActiveNav(btnPedidos);
  containerView.style.display = 'none';
  solicitarView.style.display = 'none';
  pedidosView.style.display = '';
  carregarPedidosDoTecnico(); // carrega automaticamente ao entrar
});

/* ========= Solicitar SS (mesma lógica) ========= */
const AVAILABLE_SERVICES = [
  "ALTERAR CÓDIGO ESPECIAL","ALTERAR FLAGS","ALTERAR TAMANHO DE IMPLEMENTO",
  "ALTERAR VELOCIDADE DE EFETIVO","ATUALIZAR APLICATIVOS","ATUALIZAR FIRMWARE",
  "BORDO SEM CONECTAR","CADASTRAR OBJETO DE CUSTO","CADASTRO DE FUNCIONÁRIO",
  "CADASTRO DE IMPLEMENTO","CADASTRO DE OPERAÇÕES","CALIBRAÇÃO DE TELA",
  "COLHEDORA NÃO CHAMA TRANSBORDO","CONFIGURAR PARA OUTRA OPERAÇÃO","CONTINGÊNCIA",
  "ERRO DE CARTÃO","FORMATAR CARTÃO","GPS INVÁLIDO","INSTALAÇÃO COMPLETA",
  "INSTALAÇÃO DE ANTENAS","INSTALAÇÃO DE BORDO E TELA","INSTALAÇÃO DE CHICOTE",
  "INSTALAÇÃO DE CROCODILE","LIMPEZA DE BORDO","NÃO ACEITA APONTAMENTOS",
  "NÃO CHAMA NO FUT","NÃO MANDA RASTRO","PÓS CHAVE","REVISAR INSTALAÇÃO",
  "SAINDO DOS APP","SEM MANDAR SINAL","SEM PEGAR APONTAMENTO","SEM SUBIR RPM",
  "SINAL DO MOTOR","SÓ DANDO DESLOCAMENTO","SUPORTE DE TELA","TELA APAGADA",
  "TELA TRAVADA","TOUCH DE TELA","TROCA DE ANTENA GPRS","TROCA DE ANTENA GPS",
  "TROCA DE ANTENA ZIGBEE","TROCA DE BORDO","TROCA DE CHICOTE","TROCA DE CHIP",
  "TROCA DE FUSÍVEL","TROCA DE TELA","TROCA HASTE DE ANTENA GPRS",
  "TROCA HASTE DE ANTENA ZIGBEE","TROCAR CROCODILE","VERIFICAR EFETIVO"
];

function renderServiceList(filter=""){
  const f=filter.trim().toLowerCase();
  const itens=AVAILABLE_SERVICES
    .filter(s=>!f || s.toLowerCase().includes(f))
    .map(s=>{
      const id='svc_'+s.replace(/\W+/g,'_');
      const checked=selectedServices.includes(s)?'checked':'';
      return `<label style="display:flex; align-items:center; gap:8px; margin:4px 0;">
        <input type="checkbox" class="svcCheck" id="${id}" value="${s}" ${checked}/>
        <span>${s}</span>
      </label>`;
    }).join("");
  listaServicos.innerHTML = itens || `<div style="color:#555;">Nenhum serviço encontrado.</div>`;
}
function abrirModalServicos(){ renderServiceList(); outroServico.value=""; buscaServico.value=""; modalServicos.classList.remove("hidden"); modalServicos.setAttribute("aria-hidden","false"); buscaServico.focus(); }
function fecharModalServicos(){ modalServicos.classList.add("hidden"); modalServicos.setAttribute("aria-hidden","true"); }
btnAddServico.addEventListener('click', abrirModalServicos);
btnCancelarServ.addEventListener('click', fecharModalServicos);
buscaServico.addEventListener('input', ()=>renderServiceList(buscaServico.value));
btnSalvarServ.addEventListener('click', ()=>{
  const checks=[...listaServicos.querySelectorAll('.svcCheck')].filter(c=>c.checked).map(c=>c.value);
  const outros=outroServico.value.trim();
  const novos=[...checks, ...(outros?[outros]:[])];
  novos.forEach(n=>{ if(!selectedServices.includes(n)) selectedServices.push(n); });
  renderChipsServicos(); fecharModalServicos();
});
function renderChipsServicos(){
  servicosSelDiv.innerHTML = selectedServices.map(s=>`
    <span class="chip" style="display:inline-flex; align-items:center; gap:6px;
      background:#fff; border:1px solid #a3c7ff; border-radius:999px;
      padding:6px 10px; font-size:13px; color:#004080;">
      ${s}
      <button type="button" aria-label="Remover" data-remove="${encodeURIComponent(s)}"
        style="border:none; background:#eee; border-radius:50%; width:20px; height:20px; cursor:pointer;">×</button>
    </span>`).join("");
  servicosSelDiv.querySelectorAll('button[data-remove]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const name=decodeURIComponent(btn.dataset.remove);
      selectedServices = selectedServices.filter(x=>x!==name);
      renderChipsServicos();
    });
  });
}
statusSelect.addEventListener('change', ()=>{ encGroup.style.display = (statusSelect.value==='Concluída')?'':'none'; });
btnLimparPedido.addEventListener('click', ()=>resetForm());
function resetForm(){
  codInput.value=""; dataAbertInput.value=""; obsInput.value=""; statusSelect.value="Pendente";
  dataEncInput.value=""; encGroup.style.display='none'; selectedServices=[]; renderChipsServicos();
}
function isValidDateStr(s){ return /^\d{4}-\d{2}-\d{2}$/.test(s); }
function compareDates(a,b){ const da=new Date(a+"T00:00:00"), db=new Date(b+"T00:00:00"); return da<db?-1:(da>db?1:0); }

btnSalvarPedido.addEventListener('click', async ()=>{
  try{
    const tecnico=(tecnicoInput.value||"").trim(); if(!tecnico){ alert("Informe sua matrícula antes de salvar."); return; }
    const cod=(codInput.value||"").trim();
    const data=(dataAbertInput.value||"").trim();
    const obs=(obsInput.value||"").trim();
    const status=statusSelect.value;
    const dataEnc=(dataEncInput.value||"").trim();
    if(!cod){ alert("Informe o Código do Equipamento."); return; }
    if(!isValidDateStr(data)){ alert("Informe uma Data de Abertura válida (YYYY-MM-DD)."); return; }
    if(selectedServices.length===0){ alert("Adicione pelo menos um serviço."); return; }
    if(status==='Concluída'){
      if(!isValidDateStr(dataEnc)){ alert("Informe a Data de Encerramento."); return; }
      if(compareDates(dataEnc, data)<0){ alert("A Data de Encerramento deve ser igual ou maior que a Data de Abertura."); return; }
    }
    const payload={
      action:"addpedido",
      cod, data, tecnico,
      observacao: obs,
      status,
      data_encerramento: status==='Concluída'?dataEnc:"",
      servicos: selectedServices,
      situacao: "Pendente"
    };
    const res=await postJson(BASE_URL, payload);
    if(res?.status==='ok'){
      alert(`Pedido ${res.pedido} salvo com ${res.inserted} item(ns).`);
      resetForm();
      // vai direto para Pedidos (carrega automático)
      setActiveNav(btnPedidos);
      containerView.style.display='none'; solicitarView.style.display='none'; pedidosView.style.display='';
      carregarPedidosDoTecnico();
    }else{
      throw new Error(res?.message||'Falha ao salvar.');
    }
  }catch(err){
    console.error(err); alert(`Erro ao salvar pedido: ${err.message||err}`);
  }
});

/* ========= Pedidos (matrícula atual, SITUACAO != 'Ok') ========= */
async function getPedidosRaw(){ return fetchJson(`${BASE_URL}?action=listpedidosraw`); }

function groupByPedido(rows){
  const map=new Map();
  rows.forEach(r=>{
    const k=String(r['PEDIDO']||''); if(!k) return;
    if(!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  return map;
}

// Fallback leve: se vier "2025-11-10T03:00:00.000Z", vira "10/11/2025"
function ensureBRDateString(s){
  if(!s) return "";
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const d = new Date(String(s));
  if(!isNaN(d.getTime())) return d.toLocaleDateString("pt-BR");
  // se for "YYYY-MM-DD"
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

async function carregarPedidosDoTecnico(){
  try{
    const mat = (tecnicoInput.value||"").trim();
    if(!mat){
      pedidosContainer.innerHTML = `<div class="card"><div class="card-info">Informe sua matrícula para ver seus pedidos.</div></div>`;
      return;
    }
    const raw = await getPedidosRaw();

    // Filtra por matrícula e SITUACAO != 'Ok'
    const meus = (Array.isArray(raw)?raw:[]).filter(r => String(r['TECNICO']||'').trim()===mat && String(r['SITUACAO']||'').toLowerCase()!=='ok');

    if(meus.length===0){
      pedidosContainer.innerHTML = `<div class="card"><div class="card-info">Nenhum pedido pendente para sua matrícula.</div></div>`;
      return;
    }

    const mapa = groupByPedido(meus);
    const cards = [];
    for(const [pedido, itens] of mapa.entries()){
      const head = itens[0]||{};
      const cod  = S(head['COD']);
      const data = ensureBRDateString(S(head['DATA'])); // já vem BR pela API; fallback mantém BR
      const obs  = S(head['OBSERVACAO']);
      const statusPedido = S(head['SITUACAO'] || 'Pendente'); // SITUAÇÃO do pedido (por pedido)

      const lista = itens.map(i => `<li>${S(i['SERVIÇO'])}</li>`).join("");

      cards.push(`
        <div class="card">
          <div class="card-header">
            <span>Pedido: ${pedido}</span>
            <span>${data}</span>
          </div>
          <div class="card-info"><b>COD:</b> ${cod}</div>
          ${obs ? `<div class="card-info"><b>Obs.:</b> ${obs}</div>` : ``}

          <div class="card-info" style="margin-top:6px;"><b>Serviços:</b></div>
          <ul>${lista}</ul>

          <!-- Situação por pedido, sem rótulo, alinhada à direita -->
          <div style="display:flex; justify-content:flex-end; margin-top:6px;">
            <span class="chip" style="
              display:inline-flex; align-items:center; gap:6px;
              background:#fff; border:1px solid #a3c7ff; border-radius:999px;
              padding:6px 10px; font-size:13px; color:#004080;">
              ${statusPedido}
            </span>
          </div>
        </div>
      `);
    }
    pedidosContainer.innerHTML = cards.join("");
  }catch(err){
    console.error(err);
    pedidosContainer.innerHTML = `<div class="card"><div class="card-info">Erro ao carregar pedidos (veja o console).</div></div>`;
  }
}

/* ========= Inicial ========= */
carregarCards()