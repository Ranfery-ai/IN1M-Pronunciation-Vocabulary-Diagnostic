const DEFAULT_WORDS = [
  {word:"the", ipa:"ðə"},
  {word:"be", ipa:"biː"},
  {word:"to", ipa:"tuː"},
  {word:"of", ipa:"ʌv"},
  {word:"and", ipa:"ænd"},
  {word:"a", ipa:"ə"},
  {word:"in", ipa:"ɪn"},
  {word:"that", ipa:"ðæt"},
  {word:"have", ipa:"hæv"},
  {word:"I", ipa:"aɪ"},
  {word:"it", ipa:"ɪt"},
  {word:"for", ipa:"fɔr"},
  {word:"not", ipa:"nɑt"},
  {word:"on", ipa:"ɑn"},
  {word:"with", ipa:"wɪð"},
  {word:"he", ipa:"hiː"},
  {word:"as", ipa:"æz"},
  {word:"you", ipa:"juː"},
  {word:"do", ipa:"duː"},
  {word:"at", ipa:"æt"},
  {word:"work", ipa:"wɝk"},
  {word:"different", ipa:"ˈdɪfrənt"},
  {word:"information", ipa:"ˌɪnfɚˈmeɪʃən"},
  {word:"possible", ipa:"ˈpɑsəbəl"},
  {word:"important", ipa:"ɪmˈpɔrtənt"},
  {word:"think", ipa:"θɪŋk"},
  {word:"this", ipa:"ðɪs"},
  {word:"ship", ipa:"ʃɪp"},
  {word:"sheep", ipa:"ʃiːp"},
  {word:"hope", ipa:"hoʊp"}
];

let words = loadWords();
let index = Number(localStorage.getItem("in1m_index") || 0);
let results = JSON.parse(localStorage.getItem("in1m_results") || "{}");

if (index >= words.length) index = 0;

const el = id => document.getElementById(id);

const wordEl = el("word");
const ipaEl = el("ipa");
const progressText = el("progressText");
const progressBar = el("progressBar");
const scoreText = el("scoreText");
const statusBox = el("statusBox");
const statusTitle = el("statusTitle");
const heardText = el("heardText");
const correctionBox = el("correctionBox");
const correctionText = el("correctionText");

const BACKEND_URL =
  "https://in1m-pronunciation-api.onrender.com";

let mediaRecorder = null;
let audioChunks = [];
let recordingBusy = false;

async function recordAudioBlob() {

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    throw new Error(
      "This browser cannot access the microphone."
    );
  }

  const stream =
    await navigator.mediaDevices.getUserMedia({
      audio: true
    });

  audioChunks = [];

  const options = {};

  if (
    window.MediaRecorder &&
    MediaRecorder.isTypeSupported(
      "audio/webm;codecs=opus"
    )
  ) {
    options.mimeType =
      "audio/webm;codecs=opus";
  }

  mediaRecorder =
    new MediaRecorder(stream, options);

  return new Promise((resolve, reject) => {

    mediaRecorder.ondataavailable = e => {

      if (
        e.data &&
        e.data.size > 0
      ) {
        audioChunks.push(e.data);
      }

    };

    mediaRecorder.onerror = () => {

      stream
        .getTracks()
        .forEach(t => t.stop());

      reject(
        new Error(
          "Microphone recording failed."
        )
      );

    };

    mediaRecorder.onstop = () => {

      stream
        .getTracks()
        .forEach(t => t.stop());

      resolve(
        new Blob(
          audioChunks,
          {
            type:
              mediaRecorder.mimeType ||
              "audio/webm"
          }
        )
      );

    };

    mediaRecorder.start();

    setTimeout(() => {

      if (
        mediaRecorder &&
        mediaRecorder.state === "recording"
      ) {
        mediaRecorder.stop();
      }

    }, 2500);

  });
}

async function evaluateWithWhisper(
  expectedWord,
  blob
) {

  const form =
    new FormData();

  form.append(
    "audio",
    blob,
    "attempt.webm"
  );

  form.append(
    "expected_word",
    expectedWord
  );

  const response =
    await fetch(
      `${BACKEND_URL}/evaluate`,
      {
        method: "POST",
        body: form
      }
    );

  if (!response.ok) {

    const detail =
      await response.text();

    throw new Error(
      detail ||
      `Speech server error (${response.status}).`
    );

  }

  return await response.json();
}

async function startRecognition() {

  if (recordingBusy) return;

  const r =
    resultFor();

  if (
    !r.knowledge ||
    !r.confidence
  ) {

    statusBox.className =
      "status warn";

    statusTitle.textContent =
      "Complete steps 1 and 2 first.";

    heardText.textContent =
      "Choose USE / RECOGNIZE / NEW and your pronunciation confidence.";

    return;
  }

  try {

    recordingBusy = true;

    statusBox.className =
      "status warn";

    statusTitle.textContent =
      "Listening…";

    heardText.textContent =
      `Say “${current().word}” once.`;

    const blob =
      await recordAudioBlob();

    statusTitle.textContent =
      "Checking…";

    heardText.textContent =
      "Whisper is evaluating your pronunciation.";

    const result =
      await evaluateWithWhisper(
        current().word,
        blob
      );

    const record = {

      timestamp:
        new Date().toISOString(),

      heard:
        result.transcript || "",

      alternatives: [],

      score:
        Number(result.score || 0),

      pass:
        Boolean(result.pass)

    };

    r.attempts.push(record);

    showResult(
      record.pass,
      record.heard,
      record.score,
      true
    );

    updateSummary();

    save();

  } catch (err) {

    statusBox.className =
      "status bad";

    statusTitle.textContent =
      "Voice check unavailable.";

    heardText.textContent =
      err.message ||
      "Could not evaluate this attempt.";

  } finally {

    recordingBusy = false;

  }

}

function speakCurrent() {

  if (
    !("speechSynthesis" in window)
  ) {
    return;
  }

  speechSynthesis.cancel();

  const u =
    new SpeechSynthesisUtterance(
      current().word
    );

  u.lang =
    "en-US";

  u.rate =
    0.72;

  const voices =
    speechSynthesis.getVoices();

  const preferred =
    voices.find(
      v =>
        /^en-US/i.test(v.lang)
    ) ||
    voices.find(
      v =>
        /^en/i.test(v.lang)
    );

  if (preferred) {
    u.voice = preferred;
  }

  speechSynthesis.speak(u);
}

function updateSummary() {

  let use = 0;
  let recognize = 0;
  let fresh = 0;
  let doubt = 0;
  let first = 0;
  let fixed = 0;
  let tested = 0;

  Object
    .values(results)
    .forEach(r => {

      if (
        r.knowledge === "USE"
      ) {
        use++;
      }

      if (
        r.knowledge === "RECOGNIZE"
      ) {
        recognize++;
      }

      if (
        r.knowledge === "NEW"
      ) {
        fresh++;
      }

      if (
        r.confidence === "UNSURE"
      ) {
        doubt++;
      }

      if (
        r.attempts?.length
      ) {

        tested++;

        if (
          r.attempts[0].pass
        ) {

          first++;

        } else if (
          r.attempts
            .slice(1)
            .some(a => a.pass)
        ) {

          fixed++;

        }

      }

    });

  el("useCount").textContent =
    use;

  el("recognizeCount").textContent =
    recognize;

  el("newCount").textContent =
    fresh;

  el("doubtCount").textContent =
    doubt;

  el("firstTryCount").textContent =
    first;

  el("fixedCount").textContent =
    fixed;

  scoreText.textContent =
    `First-try: ${
      tested
        ? Math.round(
            first / tested * 100
          )
        : 0
    }%`;
}

function next() {

  if (
    index <
    words.length - 1
  ) {
    index++;
  }

  render();
}

function prev() {

  if (index > 0) {
    index--;
  }

  render();
}

document
  .getElementById(
    "knowledgeChoices"
  )
  .addEventListener(
    "click",
    e => {

      const v =
        e.target.dataset.knowledge;

      if (!v) return;

      resultFor().knowledge =
        v;

      render();

    }
  );

document
  .getElementById(
    "confidenceChoices"
  )
  .addEventListener(
    "click",
    e => {

      const v =
        e.target.dataset.confidence;

      if (!v) return;

      resultFor().confidence =
        v;

      render();

    }
  );

el("speakBtn")
  .addEventListener(
    "click",
    startRecognition
  );

el("retryBtn")
  .addEventListener(
    "click",
    startRecognition
  );

el("listenBtn")
  .addEventListener(
    "click",
    speakCurrent
  );

el("showBtn")
  .addEventListener(
    "click",
    () =>
      ipaEl
        .classList
        .toggle("hidden")
  );

el("nextBtn")
  .addEventListener(
    "click",
    next
  );

el("prevBtn")
  .addEventListener(
    "click",
    prev
  );

el("resetBtn")
  .addEventListener(
    "click",
    () => {

      if (
        confirm(
          "Erase all IN1M diagnostic results on this device?"
        )
      ) {

        results = {};
        index = 0;

        save();
        render();

      }

    }
  );

el("themeBtn")
  .addEventListener(
    "click",
    () => {

      document
        .body
        .classList
        .toggle("dark");

      localStorage.setItem(
        "in1m_dark",
        document
          .body
          .classList
          .contains("dark")
          ? "1"
          : "0"
      );

    }
  );

if (
  localStorage.getItem(
    "in1m_dark"
  ) === "1"
) {
  document
    .body
    .classList
    .add("dark");
}

function parseCSV(text) {

  const lines =
    text
      .replace(/\r/g, "")
      .split("\n")
      .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const header =
    lines[0]
      .split(",")
      .map(
        s =>
          s
            .trim()
            .toLowerCase()
      );

  const wi =
    header.indexOf("word");

  const ii =
    header.indexOf("ipa");

  if (wi < 0) {

    throw new Error(
      "CSV must contain a column named word."
    );

  }

  return lines
    .slice(1)
    .map(line => {

      const parts =
        line
          .split(",")
          .map(
            s =>
              s
                .trim()
                .replace(
                  /^"|"$/g,
                  ""
                )
          );

      return {

        word:
          parts[wi],

        ipa:
          ii >= 0
            ? parts[ii] || ""
            : ""

      };

    })
    .filter(
      x => x.word
    );
}

el("csvInput")
  .addEventListener(
    "change",
    async e => {

      const file =
        e.target.files[0];

      if (!file) return;

      try {

        const text =
          await file.text();

        const imported =
          parseCSV(text);

        if (
          !imported.length
        ) {

          throw new Error(
            "No words found."
          );

        }

        words =
          imported;

        index =
          0;

        results =
          {};

        save();
        render();

      } catch (err) {

        alert(
          err.message
        );

      }

    }
  );

function exportResults() {

  const rows = [[
    "index",
    "word",
    "ipa",
    "knowledge",
    "pronunciation_confidence",
    "attempts",
    "first_try",
    "eventually_recognized",
    "last_heard",
    "best_match_percent"
  ]];

  words.forEach(
    (w, i) => {

      const key =
        `${i}:${w.word}`;

      const r =
        results[key] ||
        {
          attempts: []
        };

      const attempts =
        r.attempts || [];

      const best =
        attempts.reduce(
          (m, a) =>
            Math.max(
              m,
              a.score || 0
            ),
          0
        );

      rows.push([
        i + 1,
        w.word,
        w.ipa || "",
        r.knowledge || "",
        r.confidence || "",
        attempts.length,
        attempts.length
          ? (
              attempts[0].pass
                ? "YES"
                : "NO"
            )
          : "",
        attempts.some(
          a => a.pass
        )
          ? "YES"
          : (
              attempts.length
                ? "NO"
                : ""
            ),
        attempts.length
          ? attempts[
              attempts.length - 1
            ].heard
          : "",
        attempts.length
          ? Math.round(
              best * 100
            )
          : ""
      ]);

    }
  );

  const csv =
    rows
      .map(
        row =>
          row
            .map(
              v =>
                `"${String(v)
                  .replace(
                    /"/g,
                    '""'
                  )}"`
            )
            .join(",")
      )
      .join("\n");

  const blob =
    new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8"
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const a =
    document.createElement(
      "a"
    );

  a.href =
    url;

  a.download =
    "IN1M_pronunciation_results.csv";

  a.click();

  URL.revokeObjectURL(
    url
  );
}

el("exportBtn")
  .addEventListener(
    "click",
    exportResults
  );

function loadWords() {

  try {

    const saved =
      JSON.parse(
        localStorage.getItem(
          "in1m_words"
        ) ||
        "null"
      );

    if (
      Array.isArray(saved) &&
      saved.length
    ) {
      return saved;
    }

  } catch {}

  return DEFAULT_WORDS;
}

render();
