let auth, db;

// ================= FIREBASE READY =================
async function waitFirebaseReady(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const fb = window.firebaseApp;
    const fns = window.firebaseFns;
    if (fb?.auth && fb?.db && fns?.onAuthStateChanged) {
      return { fb, fns };
    }
    await new Promise(r => setTimeout(r, 50));
  }
  return null;
}

function getUid() {
  return auth?.currentUser?.uid || 'anon';
}

function uidOrThrow() {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Usuário não autenticado");
  return uid;
}

function registrosColRef() {
  const { collection } = window.firebaseFns;
  return collection(db, "users", uidOrThrow(), "registros");
}

function profileDocRef() {
  const { doc } = window.firebaseFns;
  return doc(db, "users", uidOrThrow());
}

async function salvarProfileNoCloud({ agente, agencia }) {
  const { setDoc, serverTimestamp } = window.firebaseFns;
  await setDoc(profileDocRef(), {
    agente: agente || "",
    agencia: agencia || "",
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function carregarProfileDoCloud() {
  const { getDoc } = window.firebaseFns;
  const snap = await getDoc(profileDocRef());
  return snap.exists() ? snap.data() : { agente: "", agencia: "" };
}

async function salvarRegistroNoFirestore(payload) {
  const { addDoc, serverTimestamp } = window.firebaseFns;
  const docRef = await addDoc(registrosColRef(), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return docRef.id;
}

async function atualizarRegistroNoFirestore(docId, patch) {
  const { doc, updateDoc, serverTimestamp } = window.firebaseFns;
  const uid = uidOrThrow();
  const refDoc = doc(db, "users", uid, "registros", docId);
  await updateDoc(refDoc, { ...patch, updatedAt: serverTimestamp() });
}

async function deletarRegistroNoFirestore(docId) {
  const { doc, deleteDoc } = window.firebaseFns;
  const uid = uidOrThrow();
  await deleteDoc(doc(db, "users", uid, "registros", docId));
}

// ================= INDEXEDDB (ARQUIVOS LOCAIS) =================
const DB_STORE = 'files';

const DB_NAME = 'ocr_app_db_v1';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);

    req.onupgradeneeded = () => {
      const dbi = req.result;
      if (!dbi.objectStoreNames.contains(DB_STORE)) {
        dbi.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function salvarArquivoNoDB(file, id) {
  const dbi = await openDB();
  const registro = {
    id,
    name: file.name,
    type: file.type || '',
    file // Blob/File
  };

  await new Promise((resolve, reject) => {
    const tx = dbi.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(registro);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });

  return id;
}

async function obterArquivoDoDB(id) {
  const dbi = await openDB();
  return await new Promise((resolve, reject) => {
    const tx = dbi.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deletarArquivoDoDB(id) {
  const dbi = await openDB();
  await new Promise((resolve, reject) => {
    const tx = dbi.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function limparTodosArquivosDoDB() {
  const dbi = await openDB();
  await new Promise((resolve, reject) => {
    const tx = dbi.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ================= PDF.JS =================
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

let CARREGANDO_ESTADO = false;

let ocrWorker = null;
async function getOCRWorker() {
  if (!ocrWorker) {
    ocrWorker = await Tesseract.createWorker('por');
  }
  return ocrWorker;
}

async function pdfParaImagem(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;

  return canvas;
}

// ================= TEXTO/FORMATAÇÃO =================
function limparNomePagadorCaixa(nome) {
  if (!nome) return '';
  return nome
    .replace(/[,.;:-]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 8)
    .join(' ');
}

const NOMES_PROIBIDOS = [
  'ANTONIO CLERVES OLIVEIRA',
  'VALE VIAGENS'
];

function parseBRL(v) {
  if (!v) return 0;
  return parseFloat(
    v.replace('R$', '')
      .replace(/\./g, '')
      .replace(',', '.')
      .trim()
  ) || 0;
}

function formatBRL(v) {
  return (v || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

let taxaContexto = null;

const modal = document.getElementById('modal-taxa');
const inputTaxa = document.getElementById('input-taxa');
const btnAplicar = document.getElementById('btn-aplicar');
const btnCancelar = document.getElementById('btn-cancelar');

inputTaxa?.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    btnAplicar?.click();
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    fecharModalTaxa();
  }
});

function abrirModalTaxa(contexto) {
  if (!modal || !inputTaxa) return;
  taxaContexto = contexto;
  inputTaxa.value = '';
  modal.classList.remove('hidden');
  setTimeout(() => inputTaxa.focus(), 50);
}

function fecharModalTaxa() {
  modal?.classList.add('hidden');
  taxaContexto = null;
}

btnCancelar?.addEventListener('click', fecharModalTaxa);

btnAplicar?.addEventListener('click', async () => {
  if (!taxaContexto) return;

  const { valorEl, taxaEl, resumo } = taxaContexto;
  const taxaValor = parseBRL(inputTaxa.value);
  if (taxaValor < 0) return alert('Taxa inválida');

  const valorOriginal = parseFloat(valorEl.dataset.original) || 0;
  if (taxaValor > valorOriginal) return alert('Taxa maior que o valor');

  const novoValor = taxaValor === 0 ? valorOriginal : valorOriginal - taxaValor;

  valorEl.textContent = formatBRL(novoValor);
  taxaEl.textContent = taxaValor === 0 ? '' : formatBRL(taxaValor);

  resumo.valor = formatBRL(novoValor);
  resumo.taxa = taxaValor === 0 ? '' : formatBRL(taxaValor);

  atualizarResumo();

  // 🔥 SALVA A TAXA NO FIRESTORE
  if (docId) {
    await atualizarRegistroNoFirestore(docId, {
      resumo: {
        nome: resumo.nome || '-',
        hora: resumo.hora || '-',
        valor: resumo.valor || '-',
        taxa: resumo.taxa || ''
      }
    });
  }
  fecharModalTaxa();
});

function limitarTexto(texto, limite = 10) {
  if (!texto) return '';
  return texto.length > limite ? texto.slice(0, limite) + '...' : texto;
}

function atualizarResumo() {
  const linhas = document.querySelectorAll('.file-item');
  let total = 0;

  linhas.forEach(linha => {
    const valorEl = linha.querySelector('.col.valor');
    if (!valorEl) return;

    const valor = (valorEl.textContent || '')
      .replace('R$', '')
      .replace('.', '')
      .replace(',', '.')
      .trim();

    total += parseFloat(valor) || 0;
  });

  const contadorEl = document.getElementById('contador-arquivos');
  if (contadorEl) contadorEl.textContent = String(linhas.length);

  const somaEl = document.getElementById('soma-total');
  if (somaEl) {
    somaEl.textContent = total.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }
}

function identificarBanco(textoOCR) {
  if (!textoOCR) return 'Banco não identificado';
  const texto = textoOCR.toLowerCase();

  if (
    texto.includes('dados do pagador') &&
    (
      texto.includes('caixa economica federal') ||
      texto.includes('caixa econômica federal') ||
      texto.includes('cef')
    )
  ) {
    return 'Caixa Econômica';
  }

  const bancos = [
    { nome: 'Nubank', chaves: ['nubank', 'nu pagamentos', 'roxinho'] },
    { nome: 'Banco Inter', chaves: ['banco inter', 'inter s.a', 'inter pagamentos'] },
    { nome: 'Bradesco', chaves: ['bradesco', 'banco bradesco', 'bradesco s.a'] },
    { nome: 'Itaú', chaves: ['itau', 'itaú', 'banco itau', 'itaú unibanco'] },
    { nome: 'Santander', chaves: ['santander', 'banco santander'] },
    { nome: 'Banco do Nordeste', chaves: ['banco do nordeste', 'bnb'] },
    { nome: 'Banco do Brasil', chaves: ['banco do brasil', 'bb '] },
    { nome: 'PicPay', chaves: ['picpay'] },
    { nome: 'Mercado Pago', chaves: ['mercado pago'] },
    { nome: 'PagBank', chaves: ['pagbank', 'pagseguro'] },
    { nome: 'Neon', chaves: ['neon'] },
    { nome: 'C6 Bank', chaves: ['banco: 336', 'banco c6', 'c6 s.a', 'c6 sa', 'c6pank', 'copank'] },
    { nome: 'Next', chaves: ['next banco'] }
  ];

  for (const banco of bancos) {
    for (const chave of banco.chaves) {
      if (texto.includes(chave)) return banco.nome;
    }
  }
  return 'Banco não identificado';
}

function extrairResumoComprovante(texto) {
  if (!texto) return { nome: '-', hora: '-', valor: '-' };

  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '';
  let hora = '';
  let valor = '';

  const BLOQUEADAS = [
    'BANCO', 'PIX', 'TRANSFERENCIA', 'TRANSFERÊNCIA',
    'CPF', 'CNPJ', 'VALOR', 'DATA', 'HORA',
    'COMPROVANTE', 'PAGAMENTO', 'REALIZADO',
    'RECEBEDOR', 'RECEBIDO', 'CONTA'
  ];

  for (const l of linhas) {
    const m = l.match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
    if (m) { valor = m[0]; break; }
  }

  for (const l of linhas) {
    const m = l.match(/\b\d{2}:\d{2}(:\d{2})?\b/);
    if (m) { hora = m[0].slice(0, 5); break; }
  }

  for (const l of linhas) {
    const limpa = l
      .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!limpa) continue;

    const up = limpa.toUpperCase();
    if (BLOQUEADAS.some(b => up.includes(b))) continue;

    const partes = limpa.split(' ').filter(p => p.length >= 3);
    if (partes.length >= 2 && partes.length <= 6) {
      nome = limpa;
      break;
    }
  }

  return {
    nome: limparNomePagador(nome) || '-',
    hora: hora || '-',
    valor: valor || '-'
  };
}

function numerarLinhasTexto(texto) {
  if (!texto) return '';
  return texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.replace(/^(\d+\.\s*)+/g, ''))
    .map((linha, i) => `${i + 1}. ${linha}`)
    .join('\n');
}

function normalizarTexto(txt) {
  return txt
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function limparNomePagador(nome) {
  if (!nome) return '';

  const nomeLimpo = nome
    .replace(/[,.;:-]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const nomeNormalizado = normalizarTexto(nomeLimpo);

  const FRASES_INVALIDAS = [
    'DADOS DO PAGADOR',
    'DADOS DO RECEBEDOR',
    'DADOS DE QUEM RECEBEU',
    'DADOS DE QUEM FEZ A TRANSACAO',
    'PAGADOR',
    'RECEBEDOR',
    'NOME'
  ];

  if (FRASES_INVALIDAS.includes(nomeNormalizado)) return '';

  for (const proibido of NOMES_PROIBIDOS) {
    if (nomeNormalizado.includes(proibido)) return '';
  }

  if (nomeLimpo.split(' ').length < 2) return '';

  return nomeLimpo.split(' ').slice(0, 6).join(' ');
}

// ===== Regras banco (mantive as suas mesmas funções) =====
// (copiei só as chamadas principais; seu código já tinha todas)
// --- COLE AQUI as funções regraBancoDoBrasil, regraNubank, regraBancoInter,
// regraBancoDoNordeste, regraSantander, regraBradesco, regraCaixa, regraPicPay,
// regraC6Bank, regraMercadoPago (as suas já estão acima no seu arquivo)
// Como você me mandou elas completas, mantenha exatamente como estavam.
function regraBancoDoBrasil(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '';
  let hora = '';
  let valor = '';

  /* ===== 💰 VALOR + ⏰ HORA (linha seguinte) ===== */
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(/R\$\s*\d+,\d{2}/);
    if (m) {
      valor = m[0];

      // ⏰ hora vem na próxima linha
      const prox = linhas[i + 1];
      if (prox) {
        const h = prox.match(/\b\d{2}:\d{2}(:\d{2})?\b/);
        if (h) hora = h[0].slice(0, 5);
      }
      break;
    }
  }

  /* ===== 👤 PAGADOR (linha após "Pagador") ===== */
  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].toUpperCase() === 'PAGADOR') {
      const candidato = linhas[i + 1];
      if (!candidato) break;

      nome = candidato
        .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      break;
    }
  }

  return {
    nome: limparNomePagador(nome) || '-',
    hora: hora || '-',
    valor: valor || '-'
  };
}
function regraNubank(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '';

  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].toLowerCase() === 'origem') {
      const candidato = linhas[i + 1];
      if (!candidato) break;

   const limpo = candidato
  .replace(/^nome\s+/i, '') // 🔥 remove "Nome " no começo
  .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .trim();
      if (limpo.length >= 5) {
  nome = limpo;
}
      break;
    }
  }

  return {
    nome: limparNomePagador(nome) || '-',
    hora: '-',   // 🔁 universal
    valor: '-'   // 🔁 universal
  };
}
function regraBancoInter(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '';

  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].toLowerCase() === 'quem pagou') {
      const candidato = linhas[i + 1];
      if (!candidato) break;

      const limpo = candidato
        .replace(/^nome\s+/i, '') // remove "Nome "
        .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (limpo.split(' ').length >= 2) {
        nome = limpo;
      }
      break;
    }
  }

  return {
    nome: limparNomePagador(nome) || '-',
    hora: '-',   // 🔁 universal
    valor: '-'   // 🔁 universal
  };
}


function regraBancoDoNordeste(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '';

  for (let i = 0; i < linhas.length; i++) {
    const linhaLimpa = linhas[i]
      .replace(/^\d+\.\s*/, '') // remove "13. "
      .toUpperCase();

    if (linhaLimpa === 'PAGADOR' || linhaLimpa === 'O PAGADOR') {

      // procura até 5 linhas abaixo
      for (let j = i + 1; j <= i + 5 && j < linhas.length; j++) {
        const candidata = linhas[j]
          .replace(/^\d+\.\s*/, '') // remove numeração
          .replace(/^NOME\s*/i, '') // remove "Nome "
          .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();

        if (candidata.split(' ').length >= 2) {
          nome = candidata;
          break;
        }
      }
      break;
    }
  }

  return {
    nome: limparNomePagador(nome) || '-',
    hora: '-',   // 🔁 universal
    valor: '-'   // 🔁 universal
  };
}
function regraSantander(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '';

  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].toLowerCase() === 'dados do pagador') {

      // normalmente vem: "De" → nome
      const possivelDe = linhas[i + 1]?.toLowerCase();
      const candidato = linhas[i + 2];

      if (possivelDe === 'de' && candidato) {
        const limpo = candidato
          .replace(/^nome\s+/i, '')
          .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();

        if (limpo.split(' ').length >= 2) {
          nome = limpo;
        }
      }
      break;
    }
  }

  return {
    nome: limparNomePagador(nome) || '-',
    hora: '-',   // 🔁 universal
    valor: '-'   // 🔁 universal
  };
}
function regraBradesco(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '';

  // linha 27 no OCR = índice 26 no array
  const linha27 = linhas[26];

  if (linha27) {
    const limpo = linha27
      .replace(/^(\d+\.\s*)+/g, '') // remove "27. "
      .replace(/^nome\s*/i, '')     // remove "Nome "
      .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (limpo.split(' ').length >= 2) {
      nome = limpo;
    }
  }

  return {
    nome: limparNomePagador(nome) || '-',
    hora: '-',   // 🔁 universal
    valor: '-'   // 🔁 universal
  };
}
function regraCaixa(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '-';

  for (let i = 0; i < linhas.length; i++) {

    // 1️⃣ acha "Dados do pagador"
    if (linhas[i].toLowerCase().includes('dados do pagador')) {

      // 2️⃣ procura a linha "Nome"
      for (let j = i + 1; j < i + 10 && j < linhas.length; j++) {

const lj = linhas[j]
  .replace(/^(\d+\.\s*)+/g, '')
  .toLowerCase();

        if (lj === 'nome' || lj.startsWith('nome ')) {

          // 3️⃣ desce até achar o nome real
          for (let k = j + 1; k < j + 10 && k < linhas.length; k++) {

            const candidato = linhas[k];
            if (!candidato) continue;

            const up = candidato.toUpperCase();

            // ⛔ parou, passou do nome
            if (up.includes('CPF') || up.includes('CNPJ')) break;

            const limpo = candidato
              .replace(/^(\d+\.\s*)+/g, '')
              .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
              .replace(/\s{2,}/g, ' ')
              .trim();

            if (limpo.split(' ').length >= 2) {
              nome = limparNomePagadorCaixa(limpo);
              break;
            }
          }
          break;
        }
      }
      break;
    }
  }

  return {
    nome,
    hora: '-',
    valor: '-'
  };
}
function regraPicPay(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '-';

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
      .replace(/^(\d+\.\s*)+/g, '')
      .toLowerCase();

    // 1️⃣ achou "de" sozinho
    if (linha === 'de') {
      const partesNome = [];

      // 2️⃣ junta linhas seguintes até achar CPF / CNPJ / parada
      for (let j = i + 1; j < i + 10 && j < linhas.length; j++) {
        const raw = linhas[j];
        if (!raw) break;

        const up = raw.toUpperCase();

        // ⛔ condição de parada
        if (
          up.includes('CPF') ||
          up.includes('CNPJ') ||
          up.includes('PIC PAY') ||
          up.includes('PICPAY') ||
          up.includes('ID ') ||
          up.includes('CHAVE') ||
          /\d{3}\.\d{3}/.test(up) ||
          /\d{11,14}/.test(up)
        ) {
          break;
        }

        const limpo = raw
          .replace(/^(\d+\.\s*)+/g, '')
          .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();

        if (limpo.length >= 2) {
          partesNome.push(limpo);
        }
      }

      if (partesNome.length) {
        nome = limparNomePagador(partesNome.join(' '));
      }
      break;
    }
  }

  return {
    nome,
    hora: '-',
    valor: '-'
  };
}
function regraC6Bank(texto) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);

  let valor = '-';
  let hora  = '-';
  let nome  = '-';

  for (const l of linhas) {
    const m = l.match(/\b\d{2}:\d{2}\b/);
    if (m) { hora = m[0]; break; }
  }

  for (const l of linhas) {
    const m = l.match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
    if (m) { valor = m[0]; break; }
  }

  let dentroBloco = false;

  for (const l of linhas) {
    const up = l.toUpperCase();

    if (up.replace(/[^A-Z]/g,'').includes('CONTADEORIGEM')) {
      dentroBloco = true;
      continue;
    }

    if (dentroBloco && up.includes('BANCO: 336')) break;

    if (dentroBloco) {
      const limpo = l
        .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (
        limpo.split(' ').length >= 2 &&
        limpo.length >= 8 &&
        !up.includes('AGÊNCIA') &&
        !up.includes('CONTA')
      ) {
        nome = limparNomePagador(limpo);
        break;
      }
    }
  }

  return { nome, hora, valor };
}

function regraMercadoPago(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let hora  = '-';
  let valor = '-';
  let nome  = '-';

  /* ========= ⏰ HORÁRIO ========= */
  for (const l of linhas) {
    let m = l.match(/às?\s*(\d{1,2})h(\d{2})/i);
    if (m) {
      hora = `${m[1].padStart(2,'0')}:${m[2]}`;
      break;
    }

    m = l.match(/\b(\d{1,2})h(\d{2})\b/i);
    if (m) {
      hora = `${m[1].padStart(2,'0')}:${m[2]}`;
      break;
    }

    m = l.match(/\b\d{2}:\d{2}\b/);
    if (m) {
      hora = m[0];
      break;
    }
  }

  /* ========= 💰 VALOR ========= */
  for (const l of linhas) {
    let m = l.match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
    if (m) {
      valor = m[0];
      break;
    }

    // fallback: R$ 35
    m = l.match(/R\$\s*(\d{1,3})\b/);
    if (m) {
      valor = `R$ ${m[1]},00`;
      break;
    }
  }

  /* ========= 👤 NOME (fallback “De”) ========= */
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].toLowerCase();

    if (l === 'de' || l.endsWith(' e de')) {
      const candidato = linhas[i + 1];
      if (!candidato) continue;

      const limpo = candidato
        .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (limpo.split(' ').length >= 2) {
        nome = limparNomePagador(limpo);
        break;
      }
    }
  }

  return { nome, hora, valor };
}

function extrairResumoPorBanco(texto, banco) {
  if (texto.toLowerCase().includes('dados do pagador')) {
    const tentativaCaixa = regraCaixa(texto);
    if (tentativaCaixa.nome && tentativaCaixa.nome !== '-') {
      const universal = extrairResumoComprovante(texto);
      return {
        nome: tentativaCaixa.nome,
        hora: universal.hora,
        valor: universal.valor
      };
    }
  }

  switch (banco) {
    case 'Banco do Brasil':
      return regraBancoDoBrasil(texto);

    case 'Nubank': {
      const nubank = regraNubank(texto);
      const universal = extrairResumoComprovante(texto);
      return { nome: nubank.nome !== '-' ? nubank.nome : universal.nome, hora: universal.hora, valor: universal.valor };
    }

    case 'Banco Inter': {
      const inter = regraBancoInter(texto);
      const universal = extrairResumoComprovante(texto);
      return { nome: inter.nome !== '-' ? inter.nome : universal.nome, hora: universal.hora, valor: universal.valor };
    }

    case 'Banco do Nordeste': {
      const nordeste = regraBancoDoNordeste(texto);
      const universal = extrairResumoComprovante(texto);
      return { nome: nordeste.nome !== '-' ? nordeste.nome : universal.nome, hora: universal.hora, valor: universal.valor };
    }

    case 'Santander': {
      const santander = regraSantander(texto);
      const universal = extrairResumoComprovante(texto);
      return { nome: santander.nome !== '-' ? santander.nome : universal.nome, hora: universal.hora, valor: universal.valor };
    }

    case 'Bradesco': {
      const bradesco = regraBradesco(texto);
      const universal = extrairResumoComprovante(texto);
      return { nome: bradesco.nome !== '-' ? bradesco.nome : universal.nome, hora: universal.hora, valor: universal.valor };
    }
    case 'PicPay': {
      const picpay = regraPicPay(texto);
      const universal = extrairResumoComprovante(texto);
      return {nome: picpay.nome !== '-' ? picpay.nome : universal.nome,hora: universal.hora,valor: universal.valor };
    }
case 'C6 Bank': {
  const c6 = regraC6Bank(texto);
  return c6;
}
case 'Mercado Pago': {
  const mp = regraMercadoPago(texto);
  const universal = extrairResumoComprovante(texto);

  return {
    nome: universal.nome, // 👈 SEMPRE universal
    hora: mp.hora || universal.hora,
    valor: mp.valor || universal.valor
  };
}
    default:
      return extrairResumoComprovante(texto);
  }
}


// ================= UI ITEM =================
function criarItemOCR({ nomeArquivo, banco, resumo, texto, docId, arquivoId, arquivoTipo }) {
  const item = document.createElement('div');
  item.className = 'file-item';

  item.dataset.docId = docId || '';
  item.dataset.arquivoId = arquivoId || ''; // ✅ ID local (IndexedDB)
  item.dataset.arquivoTipo = arquivoTipo || '';

  const linha = document.createElement('div');
  linha.className = 'ocr-row';

  linha.innerHTML = `
    <span class="col arquivo" title="${nomeArquivo}">
      ${limitarTexto(nomeArquivo, 10)}
    </span>
    <span class="col nome" contenteditable="false">${resumo.nome}</span>
    <span class="col hora" contenteditable="false">${resumo.hora}</span>
    <span class="col valor" contenteditable="false">${resumo.valor}</span>
    <span class="col taxa">${resumo.taxa || ''}</span>

    <span class="row-actions">
      <button class="pill primary btn-copy">📋 Copiar</button>
      <button class="pill btn-ver">👁 Ver</button>
      <button class="pill btn-edit">✏️ Editar</button>
      <button class="pill btn-taxa">💰 Taxa</button>
      <button class="pill danger btn-remove">🗑 Remover</button>
    </span>
  `;

  const nomeArquivoEl = linha.querySelector('.col.arquivo');

  const detalhe = document.createElement('div');
  detalhe.className = 'ocr-detalhe';
  detalhe.textContent = numerarLinhasTexto(texto);

  const taxaEl = linha.querySelector('.col.taxa');
  const nomeEl = linha.querySelector('.col.nome');
  const horaEl = linha.querySelector('.col.hora');
  const valorEl = linha.querySelector('.col.valor');

  function setEditMode(on) {
    nomeEl.contentEditable = on;
    horaEl.contentEditable = on;
    valorEl.contentEditable = on;
    if (on) nomeEl.focus();
  }

  function sairEdicao() {
    [nomeEl, horaEl, valorEl].forEach(el => {
      el.contentEditable = false;
      el.blur();
    });
  }

  nomeArquivoEl?.addEventListener('click', e => {
    e.stopPropagation();
    item.classList.toggle('expanded');
  });

  function bindSalvarAoEditar(el, tipo = 'text') {
    if (!el) return;

    el.addEventListener('blur', async () => {
      if (tipo === 'valor') {
        const v = parseBRL(el.textContent);
        el.textContent = formatBRL(v);
        el.dataset.original = v;
      }

      atualizarResumo();

      const did = item.dataset.docId;
      if (did) {
        const patch = {
          resumo: {
            nome: nomeEl.textContent || '-',
            hora: horaEl.textContent || '-',
            valor: valorEl.textContent || '-',
            taxa: taxaEl.textContent || ''
          }
        };
        await atualizarRegistroNoFirestore(did, patch);
      }
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        sairEdicao();
      }
    });
  }

  bindSalvarAoEditar(nomeEl);
  bindSalvarAoEditar(horaEl);
  bindSalvarAoEditar(valorEl, 'valor');

  if (!valorEl.dataset.original) {
    valorEl.dataset.original = parseBRL(valorEl.textContent);
  }

  /* 📋 COPIAR */
  const btnCopy = linha.querySelector('.btn-copy');
  const textoOriginal = btnCopy?.textContent || '📋 Copiar';

  btnCopy?.addEventListener('click', e => {
    e.stopPropagation();
    const textoCopiar = `${nomeEl.textContent} ${valorEl.textContent} ${horaEl.textContent}`;
    navigator.clipboard.writeText(textoCopiar).catch(() => { });

    btnCopy.textContent = '✅ Copiado';
    btnCopy.classList.add('copied');

    setTimeout(() => {
      btnCopy.textContent = textoOriginal;
      btnCopy.classList.remove('copied');
    }, 1000);
  });

  /* ✏️ EDITAR */
  linha.querySelector('.btn-edit')?.addEventListener('click', e => {
    e.stopPropagation();
    const editando = nomeEl.isContentEditable;
    setEditMode(!editando);
  });

  /* 💰 TAXA */
  linha.querySelector('.btn-taxa')?.addEventListener('click', e => {
  e.stopPropagation();
  abrirModalTaxa({
    valorEl,
    taxaEl,
    resumo,
    docId: item.dataset.docId
  });
});
  /* 👁 VER (abre arquivo local do IndexedDB) */
  linha.querySelector('.btn-ver')?.addEventListener('click', async e => {
    e.stopPropagation();
    const arquivoId = item.dataset.arquivoId;
    if (!arquivoId) return alert('Arquivo local não encontrado (sem ID).');

    const reg = await obterArquivoDoDB(arquivoId);
    if (!reg?.file) {
      return alert('Esse arquivo não está mais salvo no navegador (IndexedDB). Reenvie o arquivo.');
    }

    const url = URL.createObjectURL(reg.file);
    window.open(url, '_blank');
    // revoga depois (sem quebrar o open)
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });

  /* 🗑 REMOVER */
  linha.querySelector('.btn-remove')?.addEventListener('click', async e => {
    e.stopPropagation();

    const docIdLocal = item.dataset.docId;
    const arquivoId = item.dataset.arquivoId;

    // apaga do Firestore
    if (docIdLocal) await deletarRegistroNoFirestore(docIdLocal);

    // apaga do IndexedDB
    if (arquivoId) await deletarArquivoDoDB(arquivoId);

    item.remove();
    atualizarResumo();
  });

  item.append(linha, detalhe);
  return item;
}

// ================= CALCULADORA =================
function bindCalculadora(input, resultado) {
  if (!input || !resultado) return;

  function calcular() {
    const valor = parseBRL(input.value);
    if (!valor || valor <= 0) {
      resultado.innerHTML = '';
      return;
    }

    let percentual = 0;
    if (valor <= 150) percentual = 18;
    else if (valor <= 300) percentual = 12;
    else if (valor <= 450) percentual = 10;
    else percentual = 6;

    const taxa = valor * (percentual / 100);

    resultado.innerHTML = `
      <div>🪙 Valor: <b>${formatBRL(valor)}</b></div>
      <div>⚙️ Taxa: ${percentual}%</div>
      <div>💰 Taxa de serviço: <b>${formatBRL(taxa)}</b></div>
    `;
  }

  input.addEventListener('input', calcular);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') calcular();
  });
}

function horaParaMinutos(hora) {
  if (!hora || hora === '-') return 9999;
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

// ================= EXCEL =================
function gerarRelatorioExcel() {
  const dados = [];

  const agente = document.getElementById('nome-agente')?.value || 'SEM NOME';
  const agencia = document.getElementById('nome-agencia')?.value || '';

  dados.push([
    `AGENTE: ${agente.toUpperCase()}`,
    new Date().toLocaleDateString('pt-BR'),
    '',
    '',
    agencia
  ]);

  dados.push(['NOME', 'HORA', 'PIX', 'TAXA', 'PIX TOTAL']);

  const itens = Array.from(document.querySelectorAll('.file-item'));
  const registros = itens.map(item => ({
    nome: item.querySelector('.col.nome')?.textContent || '',
    hora: item.querySelector('.col.hora')?.textContent || '',
    valor: item.querySelector('.col.valor')?.textContent || '',
    taxa: item.querySelector('.col.taxa')?.textContent || ''
  }));

  registros.sort((a, b) => horaParaMinutos(a.hora) - horaParaMinutos(b.hora));

  registros.forEach(item => {
    if (!item.nome && !item.valor) return;

    const pix = parseBRL(item.valor);
    const taxa = parseBRL(item.taxa);

    const linhaExcel = dados.length + 1;

    dados.push([
      item.nome.toUpperCase(),
      item.hora || '',
      pix || 0,
      taxa || 0,
      { f: `C${linhaExcel}+D${linhaExcel}` }
    ]);
  });

  if (dados.length <= 2) {
    alert('Nenhum dado válido para gerar Excel.');
    return;
  }

  const primeiraLinhaDados = 3;
  const ultimaLinhaDados = dados.length;

  dados.push(['', '', '', '', '']);

  dados.push([
    'TOTAL PIX',
    '',
    { f: `SUM(C${primeiraLinhaDados}:C${ultimaLinhaDados})` },
    '',
    { f: `SUM(E${primeiraLinhaDados}:E${ultimaLinhaDados})` }
  ]);

  const ws = XLSX.utils.aoa_to_sheet(dados);
  ws['!cols'] = [
    { wch: 40 },
    { wch: 10 },
    { wch: 18 },
    { wch: 10 },
    { wch: 15 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório OCR');
  XLSX.writeFile(wb, 'relatorio_ocr.xlsx');
}

// ================= ZIP (SEM STORAGE) =================
async function baixarTodosArquivosZip() {
  const zip = new JSZip();
  const pasta = zip.folder("COMPROVANTES");

  const itens = document.querySelectorAll('.file-item');
  if (!itens.length) {
    alert('Nenhum arquivo visível para baixar.');
    return;
  }

  for (const item of itens) {
    const arquivoId = item.dataset.arquivoId;
    const nomeArquivo = item.querySelector('.col.arquivo')?.getAttribute('title') || 'arquivo';

    if (!arquivoId) continue;

    const reg = await obterArquivoDoDB(arquivoId);
    if (!reg?.file) continue;

    pasta.file(nomeArquivo, reg.file);
  }

  const blobZip = await zip.generateAsync({ type: 'blob' });

  const urlZip = URL.createObjectURL(blobZip);
  const a = document.createElement('a');
  a.href = urlZip;
  a.download = 'arquivos_ocr.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(urlZip);
}

// ================= FIRESTORE LOAD =================
async function carregarRegistrosDoFirestore() {
  const { getDocs, query, orderBy } = window.firebaseFns;

  const q = query(registrosColRef(), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  return snap.docs.map(d => ({
    docId: d.id,
    ...d.data()
  }));
}

// ================= DOM READY =================
document.addEventListener('DOMContentLoaded', async () => {
  const ready = await waitFirebaseReady();
  if (!ready) {
    console.error("Firebase não inicializou.");
    alert("Firebase não carregou. Veja o Console (F12).");
    return;
  }

  const { fb, fns } = ready;
  ({ auth, db } = fb);

  const { onAuthStateChanged, signInWithEmailAndPassword, signOut } = fns;
  const btnLogout = document.getElementById('btn-logout');

  btnLogout?.addEventListener('click', async () => {
    try {
      await signOut(auth);
      console.log("🚪 Logout OK");
    } catch (e) {
      console.error("Erro ao sair:", e);
      alert("Não consegui sair. Veja o console.");
    }
  });

  const list = document.getElementById('fileList');

  onAuthStateChanged(auth, async (user) => {
    console.log("👤 auth state:", user?.uid, user?.email);

    if (user) {
      hideLogin();
      btnLogout?.classList.remove('hidden');

      // carrega profile
      const prof = await carregarProfileDoCloud();
      const inputAgente = document.getElementById('nome-agente');
      const selectAgencia = document.getElementById('nome-agencia');
      if (inputAgente) inputAgente.value = prof.agente || "";
      if (selectAgencia) selectAgencia.value = prof.agencia || selectAgencia.value;

      // carrega registros
      if (list) list.innerHTML = "";
      CARREGANDO_ESTADO = true;

      const regs = await carregarRegistrosDoFirestore();
      regs.forEach(r => {
        list?.appendChild(criarItemOCR({
          nomeArquivo: r.nomeArquivo,
          banco: r.banco || "",
          resumo: r.resumo,
          texto: r.texto,
          docId: r.docId,
          arquivoId: r.arquivoId,      // ✅ vem do Firestore
          arquivoTipo: r.arquivoTipo
        }));
      });

      CARREGANDO_ESTADO = false;
      atualizarResumo();

    } else {
      showLogin();
      btnLogout?.classList.add('hidden');
      if (list) list.innerHTML = "";
      atualizarResumo();
    }
  });

  // ===== LOGIN UI =====
  const modalLogin = document.getElementById('modal-login');
  const inputEmail = document.getElementById('login-email');
  const inputSenha = document.getElementById('login-senha');
  const btnLogin = document.getElementById('btn-login');
  const loginErro = document.getElementById('login-erro');

  function showLogin(msg = '') {
    modalLogin?.classList.remove('hidden');
    if (msg) {
      loginErro.textContent = msg;
      loginErro.classList.remove('hidden');
    } else {
      loginErro.classList.add('hidden');
    }
  }

  function hideLogin() {
    modalLogin?.classList.add('hidden');
    loginErro?.classList.add('hidden');
  }

  btnLogin?.addEventListener('click', async () => {
    const email = inputEmail?.value.trim();
    const senha = inputSenha?.value.trim();
    if (!email || !senha) return showLogin("Preencha email e senha.");

    try {
      await signInWithEmailAndPassword(auth, email, senha);
      console.log("✅ Login OK");
    } catch (e) {
      const code = e?.code || '';
      let msg = "Não foi possível entrar. Tente novamente.";

      if (
        code === "auth/invalid-credential" ||
        code === "auth/user-not-found" ||
        code === "auth/wrong-password" ||
        code === "auth/invalid-login-credentials"
      ) {
        msg = "Usuário não existe ou dados inválidos.";
      } else if (code === "auth/invalid-email") {
        msg = "E-mail inválido.";
      } else if (code === "auth/too-many-requests") {
        msg = "Muitas tentativas. Aguarde e tente novamente.";
      } else if (code === "auth/network-request-failed") {
        msg = "Falha de rede. Verifique sua internet.";
      }

      console.error("❌ ERRO LOGIN:", code, e?.message, e);
      showLogin(msg);
    }
  });

  // ===== ELEMENTOS OCR =====
  const input = document.getElementById('fileInput');
  const uploadBox = document.getElementById('uploadBox');
  const btnClear = document.getElementById('btnClear');

  if (!input || !list || !uploadBox) return;

  // ===== Calculadora =====
  bindCalculadora(
    document.getElementById('calc-valor'),
    document.getElementById('calc-resultado')
  );

  bindCalculadora(
    document.getElementById('calc-valor-modal'),
    document.getElementById('calc-resultado-modal')
  );

  // ===== Drag & Drop =====
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
    uploadBox.addEventListener(event, e => e.preventDefault());
  });

  uploadBox.addEventListener('dragover', () => {
    uploadBox.classList.add('dragover');
  });

  uploadBox.addEventListener('dragleave', () => {
    uploadBox.classList.remove('dragover');
  });

  uploadBox.addEventListener('drop', e => {
    uploadBox.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (!files.length) return;
    input.files = files;
    input.dispatchEvent(new Event('change'));
  });

  // ===== Profile (Firestore) =====
  const inputAgente = document.getElementById('nome-agente');
  const selectAgencia = document.getElementById('nome-agencia');

  inputAgente?.addEventListener('input', () => {
    salvarProfileNoCloud({
      agente: inputAgente.value.trim(),
      agencia: selectAgencia?.value || ""
    }).catch(console.error);
  });

  selectAgencia?.addEventListener('change', () => {
    salvarProfileNoCloud({
      agente: inputAgente?.value.trim() || "",
      agencia: selectAgencia.value
    }).catch(console.error);
  });

  atualizarResumo();

  // 🗑 Limpar histórico
  btnClear?.addEventListener('click', async () => {
    if (!confirm('Deseja apagar todo o histórico de OCR?')) return;

    const regs = await carregarRegistrosDoFirestore();
    for (const r of regs) {
      if (r.docId) await deletarRegistroNoFirestore(r.docId);
    }

    await limparTodosArquivosDoDB();

    list.innerHTML = '';
    atualizarResumo();
  });

  // ===== Upload/Processo OCR (SEM STORAGE) =====
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;

    for (const file of files) {
      try {
        const arquivoId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

        // 1) salva arquivo LOCAL (IndexedDB)
        await salvarArquivoNoDB(file, arquivoId);

        // 2) OCR no navegador
        const worker = await getOCRWorker();
        let imagemOCR = file;
        if (file.type === 'application/pdf') imagemOCR = await pdfParaImagem(file);

        const res = await worker.recognize(imagemOCR);
        const textoExtraido = res.data.text.trim() || '';

        const banco = identificarBanco(textoExtraido);
        const resumo = extrairResumoPorBanco(textoExtraido, banco);

        // 3) salva SOMENTE dados no Firestore (sem url, sem storagePath)
        const docId = await salvarRegistroNoFirestore({
          nomeArquivo: file.name,
          banco,
          arquivoTipo: file.type || '',
          arquivoId,          // ✅ ID do arquivo local
          resumo,
          texto: textoExtraido
        });

        // 4) mostra na tela
        const novoItem = criarItemOCR({
          nomeArquivo: file.name,
          banco,
          resumo,
          texto: textoExtraido,
          docId,
          arquivoId,
          arquivoTipo: file.type
        });

        novoItem.dataset.addedIndex = String(document.querySelectorAll('#fileList .file-item').length);
        list.appendChild(novoItem);

        atualizarResumo();
      } catch (err) {
        console.error(err);
        alert("Erro ao processar arquivo. Veja o console (F12).");
      }
    }

    input.value = "";
  });

  // 🧹 Finaliza OCR worker
  window.addEventListener('beforeunload', async () => {
    if (ocrWorker) {
      await ocrWorker.terminate();
      ocrWorker = null;
    }
  });

  // ===== Ordenação (mantive seu filtro) =====
  const btnFiltro = document.getElementById('btnFiltro');
  const menuFiltro = document.getElementById('menuFiltro');
  const fileListEl = document.getElementById('fileList');

  btnFiltro?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!menuFiltro) return;
    menuFiltro.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    if (!menuFiltro) return;
    menuFiltro.classList.add('hidden');
  });

  menuFiltro?.addEventListener('click', (e) => e.stopPropagation());

  menuFiltro?.querySelectorAll('.filter-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modo = btn.dataset.sort;
      ordenarLista(modo);
      menuFiltro.classList.add('hidden');
    });
  });

  function ordenarLista(modo) {
    if (!fileListEl) return;

    const items = Array.from(fileListEl.querySelectorAll('.file-item'));

    const getHoraMin = (el) => {
      const txt = el.querySelector('.col.hora')?.textContent?.trim() || '-';
      if (!txt || txt === '-') return 999999;
      const [h, m] = txt.split(':').map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) return 999999;
      return h * 60 + m;
    };

    items.forEach((el, idx) => {
      if (!el.dataset.addedIndex) el.dataset.addedIndex = String(idx);
    });

    items.sort((a, b) => {
      if (modo === 'hora-asc') return getHoraMin(a) - getHoraMin(b);
      if (modo === 'hora-desc') return getHoraMin(b) - getHoraMin(a);

      const ia = parseInt(a.dataset.addedIndex || '0', 10);
      const ib = parseInt(b.dataset.addedIndex || '0', 10);

      if (modo === 'added-asc') return ia - ib;
      if (modo === 'added-desc') return ib - ia;

      return 0;
    });

    items.forEach(el => fileListEl.appendChild(el));
    atualizarResumo();
  }
});
