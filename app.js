/* Читалка — чтение адаптированных книг с переводом по контексту.
   Всё хранится в браузере (localStorage). Бэкенда нет. */

'use strict';

/* ============ мелкие помощники ============ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = w => w.toLowerCase().replace(/[’']/g, "'").replace(/^'+|'+$/g, '');
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ============ хранилище ============ */
const KEY = { dict: 'er.dict.v1', books: 'er.books.v1', prog: 'er.prog.v1', prefs: 'er.prefs.v1' };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Не хватает места в памяти браузера'); return false; } }
};

const DB = {
  dict:  store.get(KEY.dict, []),
  user:  store.get(KEY.books, []),
  prog:  store.get(KEY.prog, {}),
  prefs: Object.assign({ font: 19, theme: 'auto', mark: true, last: null }, store.get(KEY.prefs, {})),
  saveDict()  { store.set(KEY.dict, this.dict); },
  saveBooks() { store.set(KEY.books, this.user); },
  saveProg()  { store.set(KEY.prog, this.prog); },
  savePrefs() { store.set(KEY.prefs, this.prefs); }
};

let BOOKS = [];              // все книги: встроенные + свои
const dictIndex = new Map(); // норм. слово -> запись
function rebuildIndex() {
  dictIndex.clear();
  DB.dict.forEach(e => dictIndex.set(e.word, e));
}
rebuildIndex();

/* ============ настройки оформления ============ */
function applyPrefs() {
  document.documentElement.dataset.theme = DB.prefs.theme;
  document.documentElement.style.setProperty('--read', DB.prefs.font + 'px');
}
applyPrefs();

/* ============ интервальные повторения (Лейтнер) ============ */
const STEPS = [0, 1, 2, 4, 8, 16];   // дней до следующего показа для box 0..5
function scheduleNext(entry, ok) {
  entry.box = ok ? Math.min((entry.box || 0) + 1, 5) : 0;
  const d = new Date();
  d.setDate(d.getDate() + STEPS[entry.box]);
  entry.due = d.toISOString().slice(0, 10);
  entry.seen = (entry.seen || 0) + 1;
  if (ok) entry.right = (entry.right || 0) + 1;
}
const isDue = e => !e.due || e.due <= todayISO();

/* ============ разбор текста ============ */
const ABBR = /\b(mr|mrs|ms|dr|st|jr|sr|vs|etc|no)\.$/i;

function splitSentences(p) {
  const out = []; let cur = '', inQuote = false;
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    cur += c;
    if (c === '"' || c === '«') inQuote = !inQuote || c === '«';
    else if (c === '“') inQuote = true;
    else if (c === '”' || c === '»') inQuote = false;

    if (!'.!?…'.includes(c)) continue;

    while (i + 1 < p.length && '.!?…'.includes(p[i + 1])) cur += p[++i];   // «...», «?!»

    // забираем закрывающие кавычки и скобки сразу после знака
    let closed = false;
    while (i + 1 < p.length && `"'’”»)]`.includes(p[i + 1])) {
      if (`"’”»`.includes(p[i + 1])) { inQuote = false; closed = true; }
      cur += p[++i];
    }
    if (inQuote && !closed) continue;            // точка внутри реплики — не конец предложения

    let j = i + 1;
    while (j < p.length && /\s/.test(p[j])) j++;
    if (j < p.length && /[a-zа-я]/.test(p[j])) continue;  // «…!" сказала Джейн» — продолжение
    if (ABBR.test(cur.trim())) continue;          // Mr. Mrs. Dr.

    out.push(cur.trim()); cur = '';
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : [p];
}

const WORD_RE = /[A-Za-z][A-Za-z'’-]*/g;

/** Превращает текст главы в HTML со всеми словами-кнопками. */
function renderChapter(text) {
  RUNTIME.sentences = [];
  const paras = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  return paras.map(p => {
    const html = splitSentences(p).map(sent => {
      const si = RUNTIME.sentences.push(sent) - 1;
      let out = '', last = 0, m;
      WORD_RE.lastIndex = 0;
      while ((m = WORD_RE.exec(sent))) {
        out += esc(sent.slice(last, m.index));
        const raw = m[0], n = norm(raw);
        const known = DB.prefs.mark && dictIndex.has(n) ? ' known' : '';
        out += `<span class="w${known}" data-w="${esc(raw)}" data-s="${si}">${esc(raw)}</span>`;
        last = m.index + raw.length;
      }
      out += esc(sent.slice(last));
      return out;
    }).join(' ');
    return `<p>${html}</p>`;
  }).join('');
}

/* ============ сеть: перевод, словарь, звук ============ */
async function translate(text, sl = 'en', tl = 'ru') {
  // 1) Google (бесплатная веб-точка) — лучше всего чувствует контекст
  try {
    const u = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
    const r = await fetch(u);
    if (r.ok) {
      const j = await r.json();
      const s = (j[0] || []).map(x => x[0]).filter(Boolean).join('');
      if (s.trim()) return { text: s.trim(), variants: [] };
    }
  } catch (e) { /* дальше */ }
  // 2) MyMemory — запасной вариант, ещё и даёт синонимичные переводы
  try {
    const u = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sl}|${tl}`;
    const r = await fetch(u);
    const j = await r.json();
    const main = j?.responseData?.translatedText;
    const variants = [...new Set((j.matches || []).map(m => (m.translation || '').trim()))]
      .filter(v => v && v.length < 40 && v.toLowerCase() !== (main || '').toLowerCase())
      .slice(0, 5);
    if (main) return { text: main.trim(), variants };
  } catch (e) { /* дальше */ }
  return null;
}

function lemmas(w) {
  const out = [w];
  if (/ies$/.test(w)) out.push(w.slice(0, -3) + 'y');
  if (/ied$/.test(w)) out.push(w.slice(0, -3) + 'y');
  if (/([bdgklmnprt])\1(ed|ing)$/.test(w)) out.push(w.replace(/([bdgklmnprt])\1(ed|ing)$/, '$1'));
  if (/ing$/.test(w)) out.push(w.slice(0, -3) + 'e', w.slice(0, -3));
  if (/ed$/.test(w)) out.push(w.slice(0, -1), w.slice(0, -2));
  if (/(ches|shes|sses|xes|zes)$/.test(w)) out.push(w.slice(0, -2));
  if (/s$/.test(w) && !/ss$/.test(w)) out.push(w.slice(0, -1));
  return [...new Set(out)].filter(x => x.length > 1).slice(0, 5);
}

async function lookupWord(word) {
  for (const form of lemmas(word)) {
    try {
      const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(form));
      if (!r.ok) continue;
      const j = await r.json();
      const e = j[0]; if (!e) continue;
      const ipa = (e.phonetics || []).map(p => p.text).find(Boolean) || e.phonetic || '';
      const audio = (e.phonetics || []).map(p => p.audio).find(a => a && a.startsWith('http')) || '';
      const senses = (e.meanings || []).slice(0, 3).map(m => ({
        pos: m.partOfSpeech || '',
        def: (m.definitions?.[0]?.definition) || ''
      })).filter(s => s.def);
      return { form, ipa, audio, senses };
    } catch (e) { /* пробуем следующую форму */ }
  }
  return null;
}

/* звук */
let audioEl = null;
function speak(word, audioUrl) {
  const btn = $('#sayBtn');
  const done = () => btn && btn.classList.remove('playing');
  btn && btn.classList.add('playing');
  if (audioUrl) {
    audioEl = audioEl || new Audio();
    audioEl.src = audioUrl;
    audioEl.onended = done; audioEl.onerror = () => { done(); ttsFallback(word); };
    audioEl.play().catch(() => { done(); ttsFallback(word); });
  } else { ttsFallback(word, done); }
}
function ttsFallback(word, done) {
  if (!('speechSynthesis' in window)) { done && done(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-GB'; u.rate = .85;
  const v = speechSynthesis.getVoices().find(v => /en[-_]/i.test(v.lang));
  if (v) u.voice = v;
  u.onend = () => done && done();
  speechSynthesis.speak(u);
}
if ('speechSynthesis' in window) speechSynthesis.getVoices();

/* ============ загрузка книг ============ */
async function loadBooks() {
  let built = [];
  try {
    const r = await fetch('books/index.json');
    if (r.ok) {
      const list = await r.json();
      built = (await Promise.all(list.map(async f => {
        try { const b = await fetch('books/' + f); return b.ok ? await b.json() : null; }
        catch (e) { return null; }
      }))).filter(Boolean);
    }
  } catch (e) { /* оффлайн — обойдёмся своими */ }
  built.forEach(b => b.builtin = true);
  BOOKS = [...built, ...DB.user];
}
const findBook = id => BOOKS.find(b => b.id === id);
const chapterKey = (b, i) => `${b}:${i}`;

/* ============ роутер ============ */
const RUNTIME = { sentences: [], picked: null, quiz: null };

function go(hash) { location.hash = hash; }

function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'library').split('/');
  const view = $('#view');
  $('#sheet').hidden = true;
  if (RUNTIME.onScroll) { window.removeEventListener('scroll', RUNTIME.onScroll); RUNTIME.onScroll = null; }
  RUNTIME.current = null;
  window.scrollTo(0, 0);

  const tab = { library: 'library', book: 'library', read: 'library', import: 'library',
                dictionary: 'dictionary', test: 'test' }[parts[0]] || 'library';
  $$('.tabbar a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false'));
  $('#backBtn').hidden = parts[0] === 'library' || parts[0] === 'dictionary' || parts[0] === 'test';

  switch (parts[0]) {
    case 'book':       viewBook(parts[1]); break;
    case 'read':       viewReader(parts[1], +parts[2] || 0); break;
    case 'import':     viewImport(parts[1]); break;
    case 'dictionary': viewDictionary(); break;
    case 'test':       viewTest(parts[1]); break;
    default:           viewLibrary();
  }
  view.focus({ preventScroll: true });
}

/* ============ экран: библиотека ============ */
function wordsFromBook(id) { return DB.dict.filter(e => e.bookId === id).length; }

function viewLibrary() {
  $('#topTitle').textContent = 'Читалка';
  const due = DB.dict.filter(isDue).length;
  const last = DB.prefs.last;
  const lb = last && findBook(last.bookId);
  let html = '';

  if (lb) {
    const ch = lb.chapters[last.chapter];
    const first = (ch?.text || '').split(/\n{2,}/)[0].slice(0, 120);
    html += `<a class="resume" href="#/read/${esc(lb.id)}/${last.chapter}">
      <p class="rk">Продолжить</p>
      <p class="rt">${esc(lb.title)}</p>
      <p class="rc">${esc(ch?.title || 'Глава ' + (last.chapter + 1))}</p>
      <p class="rp">${esc(first)}…</p></a>`;
  }

  html += `<p class="stat-line" style="margin-top:${lb ? '18px' : '0'}">
    В словаре <b>${DB.dict.length}</b> ${plural(DB.dict.length, 'слово', 'слова', 'слов')}.
    ${DB.dict.length ? (due ? `Сегодня к повторению — <b>${due}</b>.` : 'На сегодня всё повторено.') : ''}</p>`;

  html += `<h2 class="section">Книги</h2>`;
  if (!BOOKS.length) {
    html += `<div class="empty">Пока пусто. <b>Добавь книгу</b> — вставь текст главы из своего учебника,
      и он превратится в читалку с переводом по тапу.</div>`;
  } else {
    html += `<ul class="booklist">` + BOOKS.map(b => `
      <li><a href="#/book/${esc(b.id)}">
        <span class="bt">${esc(b.title)}
          ${b.author ? `<span class="ba">${esc(b.author)}${b.level ? ' · ' + esc(b.level) : ''}</span>` : ''}
        </span>
        <span class="bm">${b.chapters.length} гл.${wordsFromBook(b.id) ? ' · ' + wordsFromBook(b.id) + ' сл.' : ''}</span>
      </a></li>`).join('') + `</ul>`;
  }

  html += `<div class="btn-row"><a class="btn primary" href="#/import">Добавить книгу</a></div>`;
  $('#view').innerHTML = html;
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/* ============ экран: оглавление книги ============ */
function viewBook(id) {
  const b = findBook(id);
  if (!b) return go('#/library');
  $('#topTitle').textContent = b.title;

  const html = `
    <h2 class="section">${esc(b.title)}</h2>
    ${b.author ? `<p class="muted tiny" style="margin:-6px 0 18px">${esc(b.author)}${b.level ? ' · уровень ' + esc(b.level) : ''}</p>` : ''}
    <ul class="toc">${b.chapters.map((c, i) => {
      const p = DB.prog[chapterKey(b.id, i)];
      const mark = p?.done ? '<span class="cs done">прочитано</span>'
                 : p?.pos ? '<span class="cs">начато</span>' : '<span class="cs"></span>';
      return `<li><a href="#/read/${esc(b.id)}/${i}"><span class="cn">${esc(c.title || 'Глава ' + (i + 1))}</span>${mark}</a></li>`;
    }).join('')}</ul>
    <div class="btn-row">
      <a class="btn" href="#/import/${esc(b.id)}">${b.builtin ? 'Скопировать и дополнить' : 'Добавить главу'}</a>
      ${b.builtin ? '' : `<button class="btn ghost" id="delBook">Удалить книгу</button>`}
    </div>`;
  $('#view').innerHTML = html;

  const del = $('#delBook');
  if (del) del.onclick = () => {
    if (!confirm(`Удалить «${b.title}» вместе с прогрессом чтения? Слова в словаре останутся.`)) return;
    DB.user = DB.user.filter(x => x.id !== b.id); DB.saveBooks();
    BOOKS = BOOKS.filter(x => x.id !== b.id);
    if (DB.prefs.last?.bookId === b.id) { DB.prefs.last = null; DB.savePrefs(); }
    toast('Книга удалена'); go('#/library');
  };
}

/* ============ экран: чтение ============ */
function viewReader(id, ci) {
  const b = findBook(id);
  if (!b || !b.chapters[ci]) return go('#/library');
  const ch = b.chapters[ci];
  $('#topTitle').textContent = b.title;
  DB.prefs.last = { bookId: id, chapter: ci }; DB.savePrefs();

  $('#view').innerHTML = `
    <article class="chapter">
      <h2>${esc(ch.title || 'Глава ' + (ci + 1))}</h2>
      ${renderChapter(ch.text || '')}
    </article>
    <nav class="chapter-nav">
      ${ci > 0 ? `<a class="btn small" href="#/read/${esc(id)}/${ci - 1}">‹ Назад</a>` : '<span></span>'}
      ${b.chapters[ci + 1] ? `<a class="btn small primary" href="#/read/${esc(id)}/${ci + 1}">Дальше ›</a>`
                           : `<a class="btn small" href="#/book/${esc(id)}">К оглавлению</a>`}
    </nav>`;

  RUNTIME.current = { book: b, ci };

  // прогресс чтения
  const key = chapterKey(id, ci);
  const saved = DB.prog[key];
  if (saved?.pos) setTimeout(() => window.scrollTo(0, saved.pos), 30);
  let t;
  RUNTIME.onScroll = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const bottom = window.scrollY + window.innerHeight > document.body.scrollHeight - 160;
      DB.prog[key] = { pos: window.scrollY, done: bottom || saved?.done };
      DB.saveProg();
    }, 400);
  };
  window.addEventListener('scroll', RUNTIME.onScroll, { passive: true });
}

/* один общий обработчик кликов по содержимому экрана */
$('#view').addEventListener('click', e => {
  const w = e.target.closest('.w');
  if (w && RUNTIME.current) {
    $$('.w.picked').forEach(x => x.classList.remove('picked'));
    w.classList.add('picked');
    openWord(w.dataset.w, RUNTIME.sentences[+w.dataset.s] || '', RUNTIME.current.book, RUNTIME.current.ci);
    return;
  }
  const say = e.target.closest('[data-say]');
  if (say) {
    const x = DB.dict.find(d => d.id === say.dataset.say);
    x && speak(x.shown || x.word, x.audio);
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) {
    const x = DB.dict.find(d => d.id === del.dataset.del);
    if (x && confirm(`Удалить «${x.shown || x.word}» из словаря?`)) {
      DB.dict = DB.dict.filter(d => d.id !== x.id);
      DB.saveDict(); rebuildIndex(); viewDictionary();
    }
  }
});

/* ============ карточка слова ============ */
async function openWord(raw, sentence, book, ci) {
  const word = norm(raw);
  RUNTIME.picked = { raw, word, sentence, bookId: book?.id || null,
                     bookTitle: book?.title || '', chapter: ci ?? null, audio: '' };

  const sheet = $('#sheet');
  $('#sheetWord').textContent = raw;
  $('#sheetIpa').textContent = '';
  $('#sheetVariants').innerHTML = '';
  $('#sheetTranslation').value = '';
  $('#saveWordBtn').textContent = 'Добавить в словарь';

  const known = dictIndex.get(word);
  if (known) {
    $('#sheetTranslation').value = known.ru || '';
    $('#sheetIpa').textContent = known.ipa || '';
    $('#saveWordBtn').textContent = 'Сохранить изменения';
    RUNTIME.picked.audio = known.audio || '';
  }

  const marked = sentence
    ? esc(sentence).replace(new RegExp(`\\b${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
        `<em>${esc(raw)}</em>`)
    : '';
  $('#sheetBody').innerHTML =
    (marked ? `<p class="ctx">${marked}<span class="ru" id="ctxRu">перевожу предложение…</span></p>` : '') +
    `<p class="gloss" id="glossBox"><span class="loading">ищу значение…</span></p>`;

  sheet.hidden = false;

  /* 1. словарная справка: транскрипция, часть речи, значение */
  lookupWord(word).then(info => {
    const g = $('#glossBox'); if (!g) return;
    if (!info) { g.innerHTML = '<span class="muted tiny">Словарной статьи нет — перевод ниже можно вписать самому.</span>'; return; }
    RUNTIME.picked.audio = info.audio;
    if (info.ipa && !$('#sheetIpa').textContent) $('#sheetIpa').textContent = info.ipa;
    g.innerHTML = info.senses.map(s => `<span class="pos">${esc(s.pos)}</span> — ${esc(s.def)}`).join('<br>')
      || '<span class="muted tiny">Определения нет</span>';
  });

  /* 2. перевод предложения — это и даёт смысл в контексте */
  if (sentence) translate(sentence).then(r => {
    const el = $('#ctxRu'); if (!el) return;
    el.textContent = r ? r.text : 'Предложение перевести не вышло — нет сети?';
  });

  /* 3. перевод самого слова + варианты значений */
  if (!known) translate(word).then(r => {
    const ta = $('#sheetTranslation');
    if (r && ta && !ta.value) ta.value = r.text.toLowerCase();
    if (r?.variants?.length) {
      $('#sheetVariants').innerHTML = r.variants
        .map(v => `<button class="chip" type="button">${esc(v)}</button>`).join('');
    }
  });
}

$('#sheetVariants').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return;
  $('#sheetTranslation').value = c.textContent;
});
$('#sayBtn').addEventListener('click', () => {
  if (RUNTIME.picked) speak(RUNTIME.picked.raw, RUNTIME.picked.audio);
});
$$('#sheet [data-close], #sheet .sheet-scrim').forEach(el =>
  el.addEventListener('click', () => { $('#sheet').hidden = true; $$('.w.picked').forEach(x => x.classList.remove('picked')); }));

$('#saveWordBtn').addEventListener('click', () => {
  const p = RUNTIME.picked; if (!p) return;
  const ru = $('#sheetTranslation').value.trim();
  if (!ru) { toast('Впиши перевод'); $('#sheetTranslation').focus(); return; }
  const existing = dictIndex.get(p.word);
  if (existing) {
    Object.assign(existing, { ru, ipa: $('#sheetIpa').textContent || existing.ipa, audio: p.audio || existing.audio });
    toast('Перевод обновлён');
  } else {
    DB.dict.push({
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      word: p.word, shown: p.raw, ru,
      ipa: $('#sheetIpa').textContent || '', audio: p.audio || '',
      sentence: p.sentence, bookId: p.bookId, bookTitle: p.bookTitle, chapter: p.chapter,
      added: todayISO(), box: 0, due: todayISO(), seen: 0, right: 0
    });
    toast('Добавлено в словарь');
  }
  DB.saveDict(); rebuildIndex();
  $('#sheet').hidden = true;
  $$('.w').forEach(w => {
    w.classList.remove('picked');
    if (DB.prefs.mark && dictIndex.has(norm(w.dataset.w))) w.classList.add('known');
  });
});

/* ============ экран: словарь ============ */
let dictFilter = '';
function viewDictionary() {
  $('#topTitle').textContent = 'Словарь';
  const due = DB.dict.filter(isDue).length;
  const learned = DB.dict.filter(e => (e.box || 0) >= 4).length;

  const list = DB.dict
    .filter(e => !dictFilter || e.word.includes(dictFilter) || (e.ru || '').toLowerCase().includes(dictFilter))
    .slice().sort((a, b) => (b.added || '').localeCompare(a.added || '') || a.word.localeCompare(b.word));

  $('#view').innerHTML = `
    <p class="stat-line"><b>${DB.dict.length}</b> ${plural(DB.dict.length, 'слово', 'слова', 'слов')} ·
      выучено <b>${learned}</b> · к повторению <b>${due}</b></p>
    <div class="dict-tools">
      <input type="text" id="dictSearch" placeholder="Найти слово" value="${esc(dictFilter)}" autocapitalize="off">
      <button class="btn small" id="exportDict">Экспорт</button>
    </div>
    ${!DB.dict.length
      ? `<div class="empty">Словарь пустой. Открой книгу и <b>нажми на любое слово</b> — покажу перевод предложения,
          транскрипцию и произношение, а слово можно сохранить сюда.</div>`
      : `<ul class="wordlist">${list.map(e => `
        <li data-id="${e.id}">
          <div class="wl-main">
            <span class="wl-en">${esc(e.shown || e.word)}</span>${e.ipa ? `<span class="wl-ipa">${esc(e.ipa)}</span>` : ''}
            <div class="wl-ru">${esc(e.ru)}</div>
            ${e.bookTitle ? `<div class="wl-src">${esc(e.bookTitle)}${e.chapter != null ? ', гл. ' + (e.chapter + 1) : ''}</div>` : ''}
          </div>
          <span class="wl-box">${(e.box || 0)}/5</span>
          <button class="wl-btn" data-say="${e.id}" aria-label="Произнести">♪</button>
          <button class="wl-btn" data-del="${e.id}" aria-label="Удалить">×</button>
        </li>`).join('')}</ul>`}
    ${DB.dict.length ? `<div class="btn-row"><a class="btn primary" href="#/test">Прогнать в тесте</a></div>` : ''}`;

  $('#dictSearch').addEventListener('input', e => {
    dictFilter = e.target.value.trim().toLowerCase();
    const pos = e.target.selectionStart;
    viewDictionary();
    const inp = $('#dictSearch'); inp.focus(); inp.setSelectionRange(pos, pos);
  });

  $('#exportDict').onclick = () => {
    const csv = 'word,translation,ipa,book\n' + DB.dict
      .map(e => [e.shown || e.word, e.ru, e.ipa, e.bookTitle].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    download('slovar.csv', csv, 'text/csv');
  };

}

function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ============ экран: тест ============ */
const MODES = {
  'en-ru':  { name: 'Слово → перевод',  desc: 'Показываю английское слово, выбираешь русский перевод' },
  'ru-en':  { name: 'Перевод → слово',  desc: 'Показываю русский перевод, выбираешь английское слово' },
  'listen': { name: 'На слух',          desc: 'Слово звучит, выбираешь перевод' },
  'write':  { name: 'Написать слово',   desc: 'Показываю перевод, пишешь слово по буквам' }
};

function viewTest(mode) {
  $('#topTitle').textContent = 'Тест';
  if (!mode) return testMenu();
  if (!MODES[mode]) return go('#/test');
  startQuiz(mode);
}

function testMenu() {
  const due = DB.dict.filter(isDue);
  $('#view').innerHTML = DB.dict.length < 4
    ? `<div class="empty">Для теста нужно хотя бы <b>4 слова</b> — сейчас ${DB.dict.length}.
        Почитай главу и потапай незнакомые слова.</div>
       <div class="btn-row"><a class="btn primary" href="#/library">К книгам</a></div>`
    : `<p class="stat-line">К повторению сегодня — <b>${due.length}</b>
        ${plural(due.length, 'слово', 'слова', 'слов')}. Слова, в которых ошибаешься, вернутся раньше.</p>
       <ul class="mode-list">${Object.entries(MODES).map(([k, m]) =>
         `<li><button data-mode="${k}"><span class="mn">${m.name}</span><span class="md">${m.desc}</span></button></li>`).join('')}</ul>`;

  $$('[data-mode]').forEach(b => b.onclick = () => go('#/test/' + b.dataset.mode));
}

function startQuiz(mode) {
  const pool = DB.dict.slice();
  const due = pool.filter(isDue);
  const queue = shuffle(due.length >= 4 ? due : pool).slice(0, 12);
  RUNTIME.quiz = { mode, queue, i: 0, right: 0, pool };
  renderQuestion();
}

function renderQuestion() {
  const q = RUNTIME.quiz;
  if (q.i >= q.queue.length) return renderResult();
  const entry = q.queue[q.i];
  const total = q.queue.length;
  const head = `<p class="quiz-count">${q.i + 1} из ${total}</p>
    <div class="quiz-bar"><i style="width:${(q.i / total) * 100}%"></i></div>`;

  if (q.mode === 'write') {
    $('#view').innerHTML = head + `
      <p class="quiz-q">${esc(entry.ru)}</p>
      <p class="quiz-hint">Напиши это слово по-английски${entry.ipa ? ' · ' + esc(entry.ipa) : ''}</p>
      <input type="text" id="answer" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="answer">
      <div class="btn-row"><button class="btn primary" id="checkBtn">Проверить</button></div>
      <div class="verdict" id="verdict"></div>`;
    const check = () => {
      const val = norm($('#answer').value.trim());
      if (!val) return;
      const ok = val === entry.word;
      $('#answer').disabled = true; $('#checkBtn').disabled = true;
      afterAnswer(entry, ok, ok ? '' : `Правильно: <b>${esc(entry.shown || entry.word)}</b>`);
    };
    $('#checkBtn').onclick = check;
    $('#answer').addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
    $('#answer').focus();
    return;
  }

  const askEn = q.mode === 'ru-en';                 // варианты — английские слова
  const distract = shuffle(q.pool.filter(e => e.id !== entry.id)).slice(0, 3);
  const options = shuffle([entry, ...distract]);
  const label = e => askEn ? (e.shown || e.word) : e.ru;

  const prompt = q.mode === 'listen'
    ? `<p class="quiz-q">🔊</p><p class="quiz-hint">Нажми на звук ещё раз, если не расслышал</p>`
    : `<p class="quiz-q">${esc(q.mode === 'ru-en' ? entry.ru : (entry.shown || entry.word))}</p>
       <p class="quiz-hint">${q.mode === 'ru-en' ? 'Как это по-английски?'
          : (entry.ipa ? esc(entry.ipa) + ' · ' : '') + 'Что это значит?'}</p>`;

  $('#view').innerHTML = head + prompt +
    `<div class="options">${options.map(o =>
      `<button class="opt" data-id="${o.id}">${esc(label(o))}</button>`).join('')}</div>
     <div class="verdict" id="verdict"></div>`;

  if (q.mode === 'listen') {
    speak(entry.shown || entry.word, entry.audio);
    $('.quiz-q').style.cursor = 'pointer';
    $('.quiz-q').onclick = () => speak(entry.shown || entry.word, entry.audio);
  }

  $$('.opt').forEach(btn => btn.onclick = () => {
    const ok = btn.dataset.id === entry.id;
    $$('.opt').forEach(b => {
      b.disabled = true;
      if (b.dataset.id === entry.id) b.classList.add('right');
      else if (b === btn) b.classList.add('wrong');
    });
    const extra = q.mode === 'listen' ? `Слово: <b>${esc(entry.shown || entry.word)}</b>` : '';
    afterAnswer(entry, ok, extra);
  });
}

function afterAnswer(entry, ok, extra) {
  const q = RUNTIME.quiz;
  if (ok) q.right++;
  scheduleNext(entry, ok);
  DB.saveDict();
  if (!ok) q.queue.push(entry);                    // ошибку повторим в конце круга
  $('#verdict').innerHTML =
    `<span class="${ok ? 'v-ok' : 'v-no'}">${ok ? 'Верно' : 'Мимо'}</span>${extra ? ' · ' + extra : ''}
     ${entry.sentence ? `<div class="ctx" style="margin-top:12px">${esc(entry.sentence)}</div>` : ''}
     <div class="btn-row"><button class="btn primary" id="nextBtn">Дальше</button></div>`;
  const next = $('#nextBtn');
  next.onclick = () => { q.i++; renderQuestion(); };
  next.focus();
}

function renderResult() {
  const q = RUNTIME.quiz;
  const total = q.queue.length;
  const pct = Math.round((q.right / total) * 100);
  $('#view').innerHTML = `
    <div class="result">
      <p class="score">${pct}%</p>
      <p>${q.right} из ${total} с первого раза</p>
    </div>
    <div class="btn-row">
      <button class="btn primary" id="again">Ещё круг</button>
      <a class="btn" href="#/dictionary">В словарь</a>
      <a class="btn ghost" href="#/library">К книгам</a>
    </div>`;
  $('#again').onclick = () => startQuiz(q.mode);
}

/* ============ экран: импорт книги ============ */
function viewImport(existingId) {
  const b = existingId ? findBook(existingId) : null;
  $('#topTitle').textContent = b ? 'Новая глава' : 'Новая книга';

  $('#view').innerHTML = `
    <h2 class="section">${b ? 'Глава в «' + esc(b.title) + '»' : 'Добавить книгу'}</h2>
    <p class="form-note">Скопируй текст главы из своего учебника или PDF и вставь сюда.
      Абзацы разделяй пустой строкой. Книга сохранится в этом браузере;
      кнопкой ниже её можно скачать файлом и положить в папку <code>books/</code> репозитория,
      чтобы она открывалась на всех устройствах.</p>

    ${b ? '' : `
      <label class="field"><span class="field-label">Название</span>
        <input type="text" id="fTitle" placeholder="Mary Poppins"></label>
      <label class="field"><span class="field-label">Автор и уровень — по желанию</span>
        <input type="text" id="fAuthor" placeholder="P. L. Travers · Elementary"></label>`}

    <label class="field"><span class="field-label">Название главы</span>
      <input type="text" id="fChapter" placeholder="Chapter 1. The East Wind"></label>
    <label class="field"><span class="field-label">Текст главы</span>
      <textarea id="fText" rows="12" placeholder="Cherry Tree Lane is a nice London street…"></textarea></label>

    <div class="btn-row">
      <button class="btn primary" id="saveBook">Сохранить</button>
      ${b && !b.builtin ? `<button class="btn" id="dlBook">Скачать книгу файлом</button>` : ''}
    </div>`;

  $('#saveBook').onclick = () => {
    const text = $('#fText').value.trim();
    const chTitle = $('#fChapter').value.trim();
    if (!text) { toast('Вставь текст главы'); return; }

    if (b) {
      if (b.builtin) {                                  // встроенную не трогаем — делаем свою копию
        const copy = JSON.parse(JSON.stringify(b));
        copy.id = b.id + '-my'; copy.builtin = false; copy.title = b.title + ' (моя копия)';
        copy.chapters.push({ title: chTitle || 'Глава ' + (copy.chapters.length + 1), text });
        DB.user.push(copy); DB.saveBooks(); BOOKS.push(copy);
        toast('Глава добавлена в копию'); return go('#/book/' + copy.id);
      }
      b.chapters.push({ title: chTitle || 'Глава ' + (b.chapters.length + 1), text });
      DB.saveBooks(); toast('Глава добавлена'); return go('#/book/' + b.id);
    }

    const title = $('#fTitle').value.trim();
    if (!title) { toast('Впиши название книги'); return; }
    const authorRaw = $('#fAuthor').value.trim();
    const book = {
      id: slug(title) + '-' + Math.random().toString(36).slice(2, 6),
      title, author: authorRaw, chapters: [{ title: chTitle || 'Глава 1', text }]
    };
    DB.user.push(book); DB.saveBooks(); BOOKS.push(book);
    toast('Книга добавлена'); go('#/book/' + book.id);
  };

  const dl = $('#dlBook');
  if (dl) dl.onclick = () => {
    const clean = JSON.parse(JSON.stringify(b)); delete clean.builtin;
    download(b.id + '.json', JSON.stringify(clean, null, 2));
  };
}
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'book';

/* ============ настройки ============ */
$('#settingsBtn').onclick = () => {
  $('#fontRange').value = DB.prefs.font;
  $('#markKnown').checked = DB.prefs.mark;
  $$('#themeSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.theme === DB.prefs.theme));
  $('#prefs').hidden = false;
};
$$('#prefs [data-close-prefs], #prefs .sheet-scrim').forEach(el =>
  el.addEventListener('click', () => { $('#prefs').hidden = true; }));
$('#fontRange').addEventListener('input', e => {
  DB.prefs.font = +e.target.value; DB.savePrefs(); applyPrefs();
});
$('#themeSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  DB.prefs.theme = b.dataset.theme; DB.savePrefs(); applyPrefs();
  $$('#themeSeg button').forEach(x => x.setAttribute('aria-pressed', x === b));
});
$('#markKnown').addEventListener('change', e => {
  DB.prefs.mark = e.target.checked; DB.savePrefs(); route();
});
$('#backBtn').onclick = () => history.back();

/* ============ старт ============ */
window.addEventListener('hashchange', route);
loadBooks().then(route);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
