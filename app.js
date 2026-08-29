const BACKEND_URL = "https://in1m-pronunciation-api.onrender.com";

const DEFAULT_WORDS = [
  {word:"the", ipa:"ðə"}, {word:"be", ipa:"biː"}, {word:"to", ipa:"tuː"},
  {word:"of", ipa:"ʌv"}, {word:"and", ipa:"ænd"}, {word:"a", ipa:"ə"},
  {word:"in", ipa:"ɪn"}, {word:"that", ipa:"ðæt"}, {word:"have", ipa:"hæv"},
  {word:"I", ipa:"aɪ"}, {word:"it", ipa:"ɪt"}, {word:"for", ipa:"fɔr"},
  {word:"not", ipa:"nɑt"}, {word:"on", ipa:"ɑn"}, {word:"with", ipa:"wɪð"},
  {word:"he", ipa:"hiː"}, {word:"as", ipa:"æz"}, {word:"you", ipa:"juː"},
  {word:"do", ipa:"duː"}, {word:"at", ipa:"æt"}, {word:"work", ipa:"wɝk"},
  {word:"different", ipa:"ˈdɪfrənt"}, {word:"information", ipa:"ˌɪnfɚˈmeɪʃən"},
  {word:"possible", ipa:"ˈpɑsəbəl"}, {word:"important", ipa:"ɪmˈpɔrtənt"},
  {word:"think", ipa:"θɪŋk"}, {word:"this", ipa:"ðɪs"},
  {word:"ship", ipa:"ʃɪp"}, {word:"sheep", ipa:"ʃiːp"}, {word:"hope", ipa:"hoʊp"}
];

const el = id => document.getElementById(id);

let words = loadWords();
let vocabIndex = Number(localStorage.getItem("in1m_v3_vocab_index") || 0);
let vocabResults = JSON.parse(localStorage.getItem("in1m_v3_vocab_results") || "{}");
let pronResults = JSON.parse(localStorage.getItem("in1m_v3_pron_results") || "{}");
let pronBlockIndex = Number(localStorage.getItem("in1m_v3_pron_block") || 0);
let batchRecorder = null;
let batchChunks = [];
let batchStream = null;

if (vocabIndex >= words.length) vocabIndex = 0;

function saveAll() {
  localStorage.setItem("in1m_v3_words", JSON.stringify(words));
  localStorage.setItem("in1m_v3_vocab_index", String(vocabIndex));
  localStorage.setItem("in1m_v3_vocab_results", JSON.stringify(vocabResults));
  localStorage.setItem("in1m_v3_pron_results", JSON.stringify(pronResults));
  localStorage.setItem("in1m_v3_pron_block", String(pronBlockIndex));
}

function loadWords() {
  try {
    const saved = JSON.parse(localStorage.getItem("in1m_v3_words") || "null");
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {}
  return DEFAULT_WORDS;
}

function speakText(text, rate = 0.76) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  const voices = speechSynthesis.getVoices();
  const preferred = voices.find(v => /^en-US/i.test(v.lang)) ||
                    voices.find(v => /^en/i.test(v.lang));
  if (preferred) u.voice = preferred;
  speechSynthesis.speak(u);
}

function showMode(mode) {
  const vocab = mode === "vocab";
  el("vocabPanel").classList.toggle("hidden", !vocab);
  el("pronPanel").classList.toggle("hidden", vocab);
  el("vocabModeBtn").classList.toggle("active", vocab);
  el("pronModeBtn").classList.toggle("active", !vocab);
}

el("vocabModeBtn").addEventListener("click", () => showMode("vocab"));
el("pronModeBtn").addEventListener("click", () => {
  showMode("pron");
  renderPronBlock();
});

/* ---------------- VOCABULARY ---------------- */

function vocabKey(i = vocabIndex) {
  return `${i}:${words[i]?.word || ""}`;
}

function vocabResult(i = vocabIndex) {
  const key = vocabKey(i);
  if (!vocabResults[key]) vocabResults[key] = {attempts:[], status:""};
  return vocabResults[key];
}

function renderVocab() {
  const item = words[vocabIndex];
  const r = vocabResult();

  el("vocabWord").textContent = item.word;
  el("vocabIpa").textContent = item.ipa ? `/${item.ipa}/` : "";
  el("vocabIpa").classList.add("hidden");

  el("vocabProgressText").textContent = `Palabra ${vocabIndex + 1} de ${words.length}`;
  el("vocabProgressBar").style.width = `${((vocabIndex + 1) / words.length) * 100}%`;

  if (r.status === "active" && r.attempts.length) {
    const last = r.attempts[r.attempts.length - 1];
    setVocabStatus("good", "✓ PALABRA ACTIVA", `Whisper escuchó: “${last.transcript}”`);
  } else if (r.status === "passed") {
    setVocabStatus("warn", "PASADA", "Esta palabra queda en tu lista de práctica.");
  } else if (r.attempts.length) {
    const last = r.attempts[r.attempts.length - 1];
    setVocabStatus("bad", "AÚN NO DEMOSTRADA", `Whisper escuchó: “${last.transcript || "—"}”. Puedes reintentar o pasar.`);
  } else {
    setVocabStatus("neutral", "Listo.", "Di una oración real que incluya la palabra.");
  }

  updateVocabSummary();
  saveAll();
}

function setVocabStatus(kind, title, detail) {
  el("vocabStatusBox").className = `status ${kind}`;
  el("vocabStatusTitle").textContent = title;
  el("vocabHeardText").textContent = detail;
}

async function recordFor(ms) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador no puede usar el micrófono.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({audio:true});
  const chunks = [];
  const options = {};

  if (window.MediaRecorder && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    options.mimeType = "audio/webm;codecs=opus";
  }

  const recorder = new MediaRecorder(stream, options);

  return new Promise((resolve, reject) => {
    recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
    recorder.onerror = () => {
      stream.getTracks().forEach(t => t.stop());
      reject(new Error("No se pudo grabar el audio."));
    };
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      resolve(new Blob(chunks, {type: recorder.mimeType || "audio/webm"}));
    };
    recorder.start();
    setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, ms);
  });
}

async function evaluateSentence(word, blob) {
  const form = new FormData();
  form.append("audio", blob, "sentence.webm");
  form.append("target_word", word);

  const response = await fetch(`${BACKEND_URL}/evaluate-sentence`, {
    method:"POST",
    body:form
  });

  if (!response.ok) throw new Error(await response.text() || `Error ${response.status}`);
  return response.json();
}

async function doSentenceAttempt() {
  const item = words[vocabIndex];
  const r = vocabResult();

  try {
    setVocabStatus("warn", "🎙 ESCUCHANDO…", `Usa “${item.word}” en una oración.`);
    const blob = await recordFor(7000);

    setVocabStatus("warn", "ANALIZANDO…", "Whisper está revisando tu oración.");
    const result = await evaluateSentence(item.word, blob);

    r.attempts.push({
      timestamp:new Date().toISOString(),
      transcript:result.transcript || "",
      pass:Boolean(result.pass),
      word_found:Boolean(result.word_found),
      word_count:Number(result.word_count || 0)
    });

    if (result.pass) {
      r.status = "active";
      setVocabStatus("good", "✓ PALABRA ACTIVA", `Whisper escuchó: “${result.transcript}”`);
    } else {
      r.status = "";
      const why = result.word_found
        ? "La palabra apareció, pero la respuesta fue demasiado corta para contar como oración."
        : `No se detectó “${item.word}” dentro de una oración.`;
      setVocabStatus("bad", "AÚN NO DEMOSTRADA", `${why} Whisper escuchó: “${result.transcript || "—"}”`);
    }

    updateVocabSummary();
    saveAll();

  } catch (err) {
    setVocabStatus("bad", "NO SE PUDO EVALUAR", err.message || "Intenta de nuevo.");
  }
}

function passVocab() {
  const r = vocabResult();
  r.status = "passed";
  saveAll();
  renderVocab();
  if (vocabIndex < words.length - 1) {
    vocabIndex++;
    renderVocab();
  }
}

function updateVocabSummary() {
  let active = 0, passed = 0, attempted = 0;
  Object.values(vocabResults).forEach(r => {
    if (r.status === "active") active++;
    if (r.status === "passed") passed++;
    if (r.attempts?.length) attempted++;
  });

  el("activeCount").textContent = active;
  el("passedCount").textContent = passed;
  el("attemptedCount").textContent = attempted;
  el("vocabScoreText").textContent = `Activas: ${active}`;
}

el("sentenceBtn").addEventListener("click", doSentenceAttempt);
el("vocabRetryBtn").addEventListener("click", doSentenceAttempt);
el("passBtn").addEventListener("click", passVocab);
el("vocabListenBtn").addEventListener("click", () => speakText(words[vocabIndex].word, .7));
el("vocabNextBtn").addEventListener("click", () => {
  if (vocabIndex < words.length - 1) vocabIndex++;
  renderVocab();
});
el("vocabPrevBtn").addEventListener("click", () => {
  if (vocabIndex > 0) vocabIndex--;
  renderVocab();
});

/* ---------------- PRONUNCIATION BATCH ---------------- */

function blockSize() {
  return Number(el("blockSizeSelect").value);
}

function totalBlocks() {
  return Math.max(1, Math.ceil(words.length / blockSize()));
}

function currentBlockWords() {
  const size = blockSize();
  const start = pronBlockIndex * size;
  return words.slice(start, start + size).map((x, j) => ({
    ...x,
    globalIndex:start + j
  }));
}

function renderPronBlock() {
  if (pronBlockIndex >= totalBlocks()) pronBlockIndex = totalBlocks() - 1;
  const block = currentBlockWords();

  el("pronBlockLabel").textContent = `Bloque ${pronBlockIndex + 1} de ${totalBlocks()}`;
  el("pronWordGrid").innerHTML = block.map((w, i) =>
    `<div class="word-chip"><span class="rank">${w.globalIndex + 1}</span>${escapeHtml(w.word)}</div>`
  ).join("");

  const key = blockKey();
  if (pronResults[key]) renderPronResults(pronResults[key]);
  else el("pronResultsCard").classList.add("hidden");

  saveAll();
}

function blockKey() {
  return `${blockSize()}:${pronBlockIndex}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

async function startBatchRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setPronStatus("bad", "MICRÓFONO NO DISPONIBLE", "Este navegador no permite grabar audio.");
    return;
  }

  try {
    batchStream = await navigator.mediaDevices.getUserMedia({audio:true});
    batchChunks = [];
    const options = {};
    if (window.MediaRecorder && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      options.mimeType = "audio/webm;codecs=opus";
    }

    batchRecorder = new MediaRecorder(batchStream, options);
    batchRecorder.ondataavailable = e => { if (e.data?.size) batchChunks.push(e.data); };
    batchRecorder.start(1000);

    el("startBatchBtn").disabled = true;
    el("stopBatchBtn").disabled = false;
    el("startBatchBtn").classList.add("recording");
    setPronStatus("warn", "● GRABANDO", "Lee todas las palabras en orden. Al terminar, pulsa DETENER Y ANALIZAR.");

  } catch (err) {
    batchStream?.getTracks().forEach(t => t.stop());
    batchStream = null;
    setPronStatus("bad", "NO SE PUDO GRABAR", err.message);
  }
}

async function stopBatchRecording() {
  if (!batchRecorder || batchRecorder.state !== "recording") return;

  el("stopBatchBtn").disabled = true;
  setPronStatus("warn", "ANALIZANDO…", "Whisper está revisando el bloque completo.");

  const blob = await new Promise(resolve => {
    batchRecorder.onstop = () => {
      batchStream?.getTracks().forEach(t => t.stop());
      resolve(new Blob(batchChunks, {type:batchRecorder.mimeType || "audio/webm"}));
    };
    batchRecorder.stop();
  });

  el("startBatchBtn").disabled = false;
  el("startBatchBtn").classList.remove("recording");

  try {
    const block = currentBlockWords();
    const form = new FormData();
    form.append("audio", blob, "block.webm");
    form.append("expected_words", JSON.stringify(block.map(x => x.word)));

    const response = await fetch(`${BACKEND_URL}/evaluate-batch`, {
      method:"POST",
      body:form
    });

    if (!response.ok) throw new Error(await response.text() || `Error ${response.status}`);
    const result = await response.json();

    pronResults[blockKey()] = result;
    saveAll();
    renderPronResults(result);

    const recognized = result.results.filter(x => x.pass).length;
    setPronStatus("good", "✓ ANÁLISIS TERMINADO", `${recognized} de ${result.results.length} palabras fueron reconocidas.`);

  } catch (err) {
    setPronStatus("bad", "NO SE PUDO ANALIZAR", err.message || "Intenta de nuevo.");
  }
}

function setPronStatus(kind, title, detail) {
  el("pronStatusBox").className = `status ${kind}`;
  el("pronStatusTitle").textContent = title;
  el("pronStatusText").textContent = detail;
}

function renderPronResults(result) {
  el("pronResultsCard").classList.remove("hidden");
  const rows = result.results || [];
  const recognized = rows.filter(x => x.pass).length;
  el("pronResultHeadline").textContent = `${recognized} / ${rows.length} reconocidas`;

  el("pronResultGrid").innerHTML = rows.map(r =>
    `<div class="result-item ${r.pass ? "good" : "bad"}">
      <strong>${r.pass ? "✓" : "⚠"} ${escapeHtml(r.expected)}</strong>
      <small>${r.matched ? `Escuchado: ${escapeHtml(r.matched)}` : "No reconocida"}</small>
    </div>`
  ).join("");

  const missed = rows.filter(x => !x.pass);
  el("reviewOnlyBox").classList.toggle("hidden", missed.length === 0);
  el("reviewWordList").innerHTML = missed.map(r => {
    const item = words.find(w => w.word.toLowerCase() === String(r.expected).toLowerCase());
    const ipa = item?.ipa ? ` /${item.ipa}/` : "";
    return `<div class="review-word">
      <span><strong>${escapeHtml(r.expected)}</strong>${escapeHtml(ipa)}</span>
      <button data-say="${escapeHtml(r.expected)}">🔊</button>
    </div>`;
  }).join("");

  el("reviewWordList").querySelectorAll("[data-say]").forEach(btn => {
    btn.addEventListener("click", () => speakText(btn.dataset.say, .68));
  });
}

el("startBatchBtn").addEventListener("click", startBatchRecording);
el("stopBatchBtn").addEventListener("click", stopBatchRecording);
el("listenBlockBtn").addEventListener("click", () => {
  speakText(currentBlockWords().map(x => x.word).join(". "), .65);
});
el("nextBlockBtn").addEventListener("click", () => {
  if (pronBlockIndex < totalBlocks() - 1) pronBlockIndex++;
  renderPronBlock();
});
el("prevBlockBtn").addEventListener("click", () => {
  if (pronBlockIndex > 0) pronBlockIndex--;
  renderPronBlock();
});
el("blockSizeSelect").addEventListener("change", () => {
  pronBlockIndex = 0;
  renderPronBlock();
});

/* ---------------- CSV / EXPORT / RESET ---------------- */

function parseCSV(text) {
  const lines = text.replace(/\r/g,"").split("\n").filter(x => x.trim());
  if (!lines.length) return [];

  const header = lines[0].split(",").map(s => s.trim().toLowerCase());
  const wi = header.indexOf("word");
  const ii = header.indexOf("ipa");
  if (wi < 0) throw new Error("El CSV necesita una columna llamada word.");

  return lines.slice(1).map(line => {
    const parts = line.split(",").map(s => s.trim().replace(/^"|"$/g,""));
    return {word:parts[wi], ipa:ii >= 0 ? (parts[ii] || "") : ""};
  }).filter(x => x.word);
}

el("csvInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const imported = parseCSV(await file.text());
    if (!imported.length) throw new Error("No se encontraron palabras.");
    words = imported;
    vocabIndex = 0;
    pronBlockIndex = 0;
    vocabResults = {};
    pronResults = {};
    saveAll();
    renderVocab();
    renderPronBlock();
  } catch (err) {
    alert(err.message);
  }
});

el("exportBtn").addEventListener("click", () => {
  const rows = [[
    "result_type", "block", "index", "word", "ipa",
    "vocabulary_status", "vocabulary_attempts", "last_sentence",
    "pronunciation_recognized", "heard_as", "match_score", "batch_transcript"
  ]];
  words.forEach((w,i) => {
    const r = vocabResults[`${i}:${w.word}`] || {attempts:[],status:""};
    const last = r.attempts?.length ? r.attempts[r.attempts.length - 1] : null;
    rows.push([
      "vocabulary", "", i + 1, w.word, w.ipa || "", r.status || "",
      r.attempts?.length || 0, last?.transcript || "", "", "", "", ""
    ]);
  });

  Object.entries(pronResults).forEach(([key, result]) => {
    const [size, blockIndex] = key.split(":").map(Number);
    const start = blockIndex * size;
    (result.results || []).forEach((item, offset) => {
      const word = words[start + offset] || {};
      rows.push([
        "pronunciation", blockIndex + 1, start + offset + 1,
        item.expected || word.word || "", word.ipa || "", "", "", "",
        item.pass ? "yes" : "no", item.matched || "", item.score ?? "", result.transcript || ""
      ]);
    });
  });

  const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "IN1M_diagnostic_results.csv";
  a.click();
  URL.revokeObjectURL(url);
});

el("resetBtn").addEventListener("click", () => {
  if (!confirm("¿Borrar todos los resultados guardados en este dispositivo?")) return;
  vocabIndex = 0;
  pronBlockIndex = 0;
  vocabResults = {};
  pronResults = {};
  saveAll();
  renderVocab();
  renderPronBlock();
});

el("themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("in1m_v3_dark", document.body.classList.contains("dark") ? "1" : "0");
});
if (localStorage.getItem("in1m_v3_dark") === "1") document.body.classList.add("dark");

renderVocab();
renderPronBlock();
showMode("vocab");
