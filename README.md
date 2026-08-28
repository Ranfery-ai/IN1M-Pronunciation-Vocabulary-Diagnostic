# IN1M Pronunciation Trainer — GitHub Pages

Static web version of the IN1M vocabulary + pronunciation diagnostic.

## What the student does

For every word:

1. Classifies it as **USE / RECOGNIZE / NEW**.
2. Says whether pronunciation is **I KNOW IT / I'M NOT SURE**.
3. Reads the word aloud.
4. Browser speech recognition checks whether it understood the expected word.
5. If necessary, the student listens to the pronunciation and retries.
6. Results remain saved in the browser with `localStorage`.
7. Results can be exported to CSV.

## Publish on GitHub Pages

### Fastest route

1. Create a GitHub repository, for example:
   `in1m-pronunciation-trainer`
2. Upload:
   - `index.html`
   - `style.css`
   - `app.js`
   - optionally `words_1000_template.csv`
3. In GitHub open:
   **Settings → Pages**
4. Under **Build and deployment** choose:
   **Deploy from a branch**
5. Select:
   - Branch: `main`
   - Folder: `/ (root)`
6. Save.

GitHub will publish the site at a URL similar to:

`https://YOUR-USERNAME.github.io/in1m-pronunciation-trainer/`

## Browser speech recognition

This version uses the browser's `SpeechRecognition` / `webkitSpeechRecognition` interface.

For best results, test with a Chromium-based browser such as Chrome or Edge and allow microphone access.

The site itself is static and can live entirely on GitHub Pages. Speech recognition availability depends on the browser/platform.

## CSV word list format

The app can load a CSV at runtime.

Minimum:

```csv
word
the
be
work
```

Recommended:

```csv
word,ipa
think,θɪŋk
this,ðɪs
ship,ʃɪp
sheep,ʃiːp
```

Use `words_1000_template.csv` as the format for the eventual IN1M 1,000-word diagnostic.

## Important measurement note

A recognition failure means:

> the speech recognizer did not confidently recognize the expected word.

It does **not** prove which phoneme the learner produced incorrectly.

A later IN1M version can add a phoneme-oriented diagnostic for:
- /θ/ and /ð/
- short vs. long vowels
- silent E
- final consonants
- English R
- syllable stress

## Privacy in this MVP

IN1M diagnostic state is saved locally in the student's browser via `localStorage`.

The application does not contain an IN1M server or database.

Speech-processing behavior depends on the browser's speech-recognition implementation.
