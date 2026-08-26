const BUILD = 'v17';   /* номер сборки — виден внизу вкладки «Ещё» */

/* ================= вспомогательное ================= */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let words = [], grammar = [], links = [];

function esc(s){
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function shuffle(a){
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function plural(n, one, few, many){
  const a = n % 100, b = n % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

/* ================= память о прогрессе ================= */
/* Хранится в самом браузере. Если хранилище недоступно (режим инкогнито,
   предпросмотр), прогресс живёт до закрытия вкладки — приложение не ломается. */
const KEY = 'dict-progress-v1';
const store = {
  data: {},
  load(){ try { this.data = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch(e){ this.data = {}; } },
  save(){ try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch(e){} }
};
const STEPS = [0, 1, 3, 7, 16, 35];   // интервалы повторения в днях

function grade(word, ok){
  const p = store.data[word] || { b: 0 };
  p.b = ok ? Math.min(p.b + 1, STEPS.length - 1) : 1;
  p.due = Date.now() + STEPS[p.b] * 864e5;
  store.data[word] = p;
  store.save();
}
function dueCount(){
  const now = Date.now();
  return words.filter(w => { const p = store.data[w.w]; return !p || p.due <= now; }).length;
}
function learnedCount(){
  return words.filter(w => (store.data[w.w]?.b || 0) >= 4).length;
}

/* ================= озвучка ================= */
function speak(text, lang = 'en-GB'){
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.88;
  const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.replace('_','-').startsWith(lang))
         || speechSynthesis.getVoices().find(v => v.lang && v.lang.startsWith('en'));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
if ('speechSynthesis' in window) speechSynthesis.getVoices();

document.addEventListener('click', e => {
  const b = e.target.closest('[data-say]');
  if (b) speak(b.dataset.say);
});

/* ================= сверка ответа ================= */
function normEn(s){
  return s.toLowerCase().trim()
    .replace(/[.,!?;:'"()]/g, '')
    .replace(/^(to|a|an|the)\s+/, '')
    .replace(/\s+/g, ' ');
}
function normRu(s){
  return s.toLowerCase().replace(/ё/g, 'е').trim()
    .replace(/[.,!?;:()]/g, '')
    .replace(/\s+/g, ' ');
}
function lev(a, b){
  const m = Array.from({length: a.length + 1}, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i-1][j] + 1, m[i][j-1] + 1, m[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return m[a.length][b.length];
}
/* Возвращает 'ok' | 'typo' | 'no' */
function checkEn(given, expected){
  const g = normEn(given), e = normEn(expected);
  if (!g) return 'no';
  if (g === e) return 'ok';
  if (e.length >= 5 && lev(g, e) === 1) return 'typo';
  return 'no';
}
function checkRu(given, expected){
  const g = normRu(given);
  if (!g) return 'no';
  const variants = expected.split(/[,;]/).map(normRu).filter(Boolean).concat(normRu(expected));
  if (variants.includes(g)) return 'ok';
  if (variants.some(v => v.length >= 5 && lev(g, v) === 1)) return 'typo';
  return 'no';
}

/* ================= раздел: СЛОВАРЬ ================= */
let letter = null;

function renderDict(){
  const term = normRu($('#q').value);
  $('#clear').hidden = !$('#q').value;

  let items = words;
  if (term) items = items.filter(e => normEn(e.w).includes(term) || normRu(e.tr).includes(term));
  else if (letter) items = items.filter(e => e.w[0].toUpperCase() === letter);

  $('#count').textContent = items.length
    ? items.length + ' ' + plural(items.length, 'слово', 'слова', 'слов')
    : '';

  const list = $('#list');
  if (!items.length){
    list.innerHTML = '<p class="blank"><b>Ничего не нашлось</b>' +
      (term ? 'Попробуйте часть слова или перевод.' : 'На эту букву статей пока нет.') + '</p>';
    guide();
    return;
  }

  list.innerHTML = items.map(e => `
    <article class="entry" data-w="${esc(e.w)}">
      <div class="line1">
        <h2 class="hw">${hl(e.w, term)}</h2>
        ${e.lvl ? `<span class="lvl">${esc(e.lvl)}</span>` : ''}
        <span class="pos">${esc(e.pos || '')}</span>
      </div>
      ${e.ipa ? `<div class="ipa">${esc(e.ipa)}</div>` : ''}
      <div class="tr">${hl(e.tr, term)}</div>
      <div class="detail">
        ${e.def ? `<p class="def">${esc(e.def)}</p>` : ''}
        ${e.ex ? `<p class="ex">${esc(e.ex)}</p>` : ''}
        <button class="speak" data-say="${esc(e.w)}">Произнести</button>
      </div>
    </article>`).join('');
  guide();
}

function hl(text, term){
  const safe = esc(text);
  if (!term) return safe;
  const i = normRu(safe).indexOf(term);
  if (i < 0) return safe;
  return safe.slice(0, i) + '<mark>' + safe.slice(i, i + term.length) + '</mark>' + safe.slice(i + term.length);
}

/* колонтитул: первое и последнее слово на экране, как на странице бумажного словаря */
function guide(){
  const items = $$('#list .entry');
  if (!items.length){ $('#gFirst').textContent = $('#gLast').textContent = ''; return; }
  const top = $('#view-dict .masthead').getBoundingClientRect().bottom;
  const vis = items.filter(el => {
    const r = el.getBoundingClientRect();
    return r.bottom > top && r.top < window.innerHeight;
  });
  $('#gFirst').textContent = (vis[0] || items[0]).dataset.w;
  $('#gLast').textContent  = (vis[vis.length - 1] || items[0]).dataset.w;
}

function buildRail(){
  const letters = [...new Set(words.map(e => e.w[0].toUpperCase()))].sort();
  $('#rail').innerHTML = letters.map(L => `<button data-l="${L}">${L}</button>`).join('');
}
function syncRail(){
  $$('#rail button').forEach(b => b.classList.toggle('on', b.dataset.l === letter));
}

$('#q').addEventListener('input', () => { letter = null; syncRail(); renderDict(); });
$('#clear').addEventListener('click', () => { $('#q').value = ''; $('#q').focus(); renderDict(); });
$('#rail').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  letter = (letter === b.dataset.l) ? null : b.dataset.l;
  $('#q').value = ''; syncRail(); renderDict(); window.scrollTo({top: 0});
});
$('#list').addEventListener('click', e => {
  if (e.target.closest('[data-say]')) return;
  const card = e.target.closest('.entry');
  if (card) card.classList.toggle('open');
});
$('#rand').addEventListener('click', () => {
  if (!words.length) return;
  const pick = words[Math.floor(Math.random() * words.length)];
  letter = null; syncRail();
  $('#q').value = pick.w; renderDict();
  const card = $('#list .entry'); if (card) card.classList.add('open');
});
let tick = false;
addEventListener('scroll', () => {
  if (tick || $('#view-dict').hidden) return;
  tick = true;
  requestAnimationFrame(() => { guide(); tick = false; });
}, {passive: true});


/* ================= охват: всё, тема или уровень ================= */
let scope = { kind: 'all', book: null, unit: null, level: null };

function books(){
  return (typeof course !== 'undefined' && course) ? course.courses : [];
}
function bookName(id){ return id === 'elem' ? 'Elementary' : 'Pre-Intermediate'; }

function scopedWords(){
  if (scope.kind === 'unit')  return words.filter(w => w.book === scope.book && w.unit === scope.unit);
  if (scope.kind === 'level') return words.filter(w => w.lvl === scope.level);
  return words;
}
function scopeLabel(){
  if (scope.kind === 'unit'){
    const bk = books().find(c => c.id === scope.book);
    const u  = bk && bk.units.find(x => x.n === scope.unit);
    return bookName(scope.book) + ', юнит ' + scope.unit + (u ? ': ' + u.title : '');
  }
  if (scope.kind === 'level') return 'Уровень ' + scope.level;
  return 'Все слова';
}
function scopeDue(){
  const now = Date.now();
  return scopedWords().filter(w => { const p = store.data[w.w]; return !p || p.due <= now; }).length;
}

/* Рисует переключатель охвата и перерисовывает экран через onChange. */
function drawScope(box, onChange){
  const levels = [...new Set(words.map(w => w.lvl).filter(Boolean))].sort();
  let inner = '';

  if (scope.kind === 'unit'){
    inner = books().map(bk => `
      <div class="scope-group">${esc(bookName(bk.id))}</div>
      <div class="chips">
        ${bk.units.map(u => `
          <button class="chip2 ${scope.book === bk.id && scope.unit === u.n ? 'on' : ''}"
                  data-book="${bk.id}" data-unit="${u.n}">
            <b>${u.n}</b> ${esc(u.title)}
          </button>`).join('')}
      </div>`).join('') || '<p class="fineprint">Курс ещё не загрузился.</p>';
  }
  if (scope.kind === 'level'){
    inner = `<div class="chips">
      ${levels.map(L => `
        <button class="chip2 ${scope.level === L ? 'on' : ''}" data-level="${L}">
          <b>${L}</b> ${words.filter(w => w.lvl === L).length}
        </button>`).join('')}
    </div>`;
  }

  box.innerHTML = `
    <div class="scope">
      <div class="scope-tabs">
        <button data-k="all"   class="${scope.kind === 'all'   ? 'on' : ''}">Все слова</button>
        <button data-k="unit"  class="${scope.kind === 'unit'  ? 'on' : ''}">По теме</button>
        <button data-k="level" class="${scope.kind === 'level' ? 'on' : ''}">По уровню</button>
      </div>
      ${inner}
    </div>`;

  box.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
    scope.kind = b.dataset.k;
    if (scope.kind === 'unit' && scope.unit === null){
      const bk = books()[0];
      if (bk){ scope.book = bk.id; scope.unit = bk.units[0].n; }
    }
    if (scope.kind === 'level' && !scope.level){
      scope.level = [...new Set(words.map(w => w.lvl).filter(Boolean))].sort()[0];
    }
    onChange();
  }));
  box.querySelectorAll('[data-unit]').forEach(b => b.addEventListener('click', () => {
    scope.book = b.dataset.book; scope.unit = +b.dataset.unit; onChange();
  }));
  box.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => {
    scope.level = b.dataset.level; onChange();
  }));
}

/* ================= раздел: УРОК ================= */
/* Урок = 4 слова, для каждого три шага: знакомство → перевод → предложение. */
let lesson = null;

function pickLesson(n = 4){
  const now = Date.now();
  return scopedWords().map(w => {
    const p = store.data[w.w];
    let pri;
    if (!p)            pri = 1;          // новое слово
    else if (p.due <= now) pri = 0;      // пора повторить
    else               pri = 2 + p.b;    // ещё рано
    return { w, pri, r: Math.random() };
  })
  .sort((a, b) => a.pri - b.pri || a.r - b.r)
  .slice(0, n)
  .map(s => s.w);
}

function startLesson(){
  const picked = pickLesson(4);
  const steps = [];
  picked.forEach(w => {
    steps.push({ kind: 'intro', w });
    steps.push({ kind: 'type',  w });
    if (w.ex && w.ex.split(' ').length >= 4) steps.push({ kind: 'build', w });
  });
  lesson = { steps, i: 0, right: 0, asked: 0 };
  renderLesson();
}

function renderLesson(){
  const body = $('#lessonBody');
  $('#lessonSub').textContent = '';

  if (!lesson){
    const pool = scopedWords(), due = scopeDue();
    const done = pool.filter(w => (store.data[w.w]?.b || 0) >= 4).length;
    $('#lessonTitle').textContent = 'Занятие на сегодня';
    $('#lessonStat').textContent = done + ' / ' + pool.length + ' выучено';
    $('#lessonSub').textContent = scopeLabel();
    body.innerHTML = '<div id="lessonScope"></div>' + `
      <div class="card">
        <div class="prompt-label">${pool.length ? esc(scopeLabel()) : 'Пусто'}</div>
        <p class="def">${pool.length
          ? (due ? `${due} ${plural(due, 'слово ждёт', 'слова ждут', 'слов ждут')} повторения. ` : 'Всё повторено, возьмём новые слова. ')
            + 'Четыре слова за урок, каждое проходит три шага: знакомство с произношением, перевод с русского, сборка предложения.'
          : 'В этой теме пока нет слов. Выберите другую.'}</p>
        <div class="btnrow"><button class="btn" id="go" ${pool.length ? '' : 'disabled'}>Начать урок</button></div>
      </div>`;
    drawScope($('#lessonScope'), renderLesson);
    if (pool.length) $('#go').addEventListener('click', startLesson);
    return;
  }

  if (lesson.i >= lesson.steps.length){
    const pct = lesson.asked ? Math.round(lesson.right / lesson.asked * 100) : 100;
    $('#lessonTitle').textContent = 'Урок пройден';
    $('#lessonStat').textContent = '';
    body.innerHTML = `
      <div class="card">
        <div class="prompt-label">Результат</div>
        <p class="prompt">${lesson.right} из ${lesson.asked}</p>
        <p class="def" style="margin-top:10px">${
          pct >= 80 ? 'Эти слова уже держатся. Приложение вернёт их через несколько дней.'
                    : 'Слова с ошибками вернутся завтра — так они и запоминаются.'}</p>
        <div class="btnrow">
          <button class="btn" id="again">Ещё урок</button>
          <button class="btn ghost" id="toDict">В словарь</button>
        </div>
      </div>`;
    lesson = null;
    $('#again').addEventListener('click', startLesson);
    $('#toDict').addEventListener('click', () => show('dict'));
    return;
  }

  const st = lesson.steps[lesson.i];
  $('#lessonTitle').textContent = { intro: 'Знакомство', type: 'Переведите', build: 'Соберите фразу' }[st.kind];
  $('#lessonStat').textContent = (lesson.i + 1) + ' / ' + lesson.steps.length;

  const bar = `<div class="progress">${lesson.steps.map((_, k) =>
    `<i class="${k < lesson.i ? 'done' : k === lesson.i ? 'now' : ''}"></i>`).join('')}</div>`;

  if (st.kind === 'intro') body.innerHTML = bar + introCard(st.w);
  if (st.kind === 'type')  body.innerHTML = bar + typeCard(st.w, 'ru2en');
  if (st.kind === 'build') body.innerHTML = bar + buildCard(st.w);

  wireCard(body, st, () => { lesson.i++; renderLesson(); });
}

function introCard(w){
  return `
    <div class="card">
      <div class="prompt-label">${esc(w.pos || '')} ${w.lvl ? '· ' + esc(w.lvl) : ''}</div>
      <p class="prompt">${esc(w.w)}</p>
      <div class="ipa" style="margin-top:6px">${esc(w.ipa || '')}</div>
      <p class="tr" style="font-size:19px;margin-top:10px">${esc(w.tr)}</p>
      ${w.def ? `<p class="def" style="margin-top:10px">${esc(w.def)}</p>` : ''}
      ${w.ex ? `<p class="ex">${esc(w.ex)}</p>` : ''}
      <button class="speak" data-say="${esc(w.w)}">Произнести</button>
      <div class="btnrow"><button class="btn" data-next>Дальше</button></div>
    </div>`;
}

function typeCard(w, dir){
  const ru = dir === 'ru2en';
  return `
    <div class="card">
      <div class="prompt-label">${ru ? 'Как это по-английски' : 'Как это по-русски'}</div>
      <p class="prompt ${ru ? 'ru' : ''}">${esc(ru ? w.tr : w.w)}</p>
      ${!ru && w.ipa ? `<div class="ipa" style="margin-top:6px">${esc(w.ipa)}</div>` : ''}
      <input class="answer" data-answer autocomplete="off" autocorrect="off"
             autocapitalize="none" spellcheck="false" enterkeyhint="done"
             placeholder="${ru ? 'ваш ответ на английском' : 'ваш ответ на русском'}">
      <div class="verdict" data-verdict hidden></div>
      <div class="btnrow">
        <button class="btn" data-check>Проверить</button>
        <button class="btn ghost" data-skip>Не знаю</button>
      </div>
    </div>`;
}

function buildCard(w){
  const tokens = shuffle(w.ex.split(' '));
  return `
    <div class="card">
      <div class="prompt-label">Составьте предложение со словом «${esc(w.w)}»</div>
      <p class="tr" style="font-size:18px;margin:0 0 12px">${esc(w.tr)}</p>
      <div class="slot" data-slot></div>
      <div class="bank" data-bank>${tokens.map(t =>
        `<button class="chip">${esc(t)}</button>`).join('')}</div>
      <div class="verdict" data-verdict hidden></div>
      <div class="btnrow">
        <button class="btn" data-check>Проверить</button>
        <button class="btn ghost" data-skip>Показать ответ</button>
      </div>
    </div>`;
}

/* Общая обвязка карточек — используется и уроком, и тестом. */
function wireCard(box, st, done){
  const card = box.querySelector('.card');
  if (!card) return;

  const next = card.querySelector('[data-next]');
  if (next){ next.addEventListener('click', done); return; }

  const verdict = card.querySelector('[data-verdict]');
  const input   = card.querySelector('[data-answer]');
  const checkBtn = card.querySelector('[data-check]');
  const skipBtn  = card.querySelector('[data-skip]');
  let answered = false;

  if (input) setTimeout(() => input.focus(), 60);

  /* --- сборка предложения: перекладывание слов --- */
  const slot = card.querySelector('[data-slot]');
  if (slot){
    const bank = card.querySelector('[data-bank]');
    slot.addEventListener('click', e => {
      const c = e.target.closest('.chip'); if (c && !answered) bank.appendChild(c);
    });
    bank.addEventListener('click', e => {
      const c = e.target.closest('.chip'); if (c && !answered) slot.appendChild(c);
    });
  }

  function finish(result){
    answered = true;
    const w = st.w;
    const ok = result === 'ok' || result === 'typo';
    if (st.kind !== 'intro'){
      grade(w.w, ok);
      if (lesson){ lesson.asked++; if (ok) lesson.right++; }
      if (test){ test.asked++; if (ok) test.right++; else test.wrong.push(w); }
    }
    verdict.hidden = false;
    verdict.className = 'verdict ' + (ok ? 'ok' : 'no');
    const correct = st.kind === 'build' ? w.ex : (st.dir === 'en2ru' ? w.tr : w.w);
    verdict.innerHTML =
      (result === 'ok'   ? '<b>Верно</b>' :
       result === 'typo' ? '<b>Почти — опечатка</b>' :
                           '<b>Пока нет</b>') +
      `<span class="right">${esc(correct)}</span>` +
      (st.dir === 'en2ru' ? '' : `<button class="speak" data-say="${esc(correct)}">Произнести</button>`);
    checkBtn.textContent = 'Дальше';
    if (skipBtn) skipBtn.hidden = true;
    if (input) input.blur();
    if (st.dir !== 'en2ru') speak(correct);
  }

  checkBtn.addEventListener('click', () => {
    if (answered){ done(); return; }
    if (slot){
      const built = [...slot.querySelectorAll('.chip')].map(c => c.textContent).join(' ');
      finish(built === st.w.ex ? 'ok' : 'no');
    } else {
      const val = input.value;
      finish(st.dir === 'en2ru' ? checkRu(val, st.w.tr) : checkEn(val, st.w.w));
    }
  });

  if (skipBtn) skipBtn.addEventListener('click', () => finish('no'));
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') checkBtn.click(); });
}

/* ================= раздел: ТЕСТ ================= */
let test = null;

function renderTest(){
  const body = $('#testBody');

  if (!test){
    const pool = scopedWords();
    const n = Math.min(10, pool.length);
    $('#testStat').textContent = pool.length + ' ' + plural(pool.length, 'слово', 'слова', 'слов');
    $('#testSub').textContent = scopeLabel();
    body.innerHTML = '<div id="testScope"></div>' + `
      <div class="card">
        <div class="prompt-label">Направление</div>
        <div class="btnrow">
          <button class="btn" data-dir="ru2en" ${n ? '' : 'disabled'}>Рус → Англ</button>
          <button class="btn ghost" data-dir="en2ru" ${n ? '' : 'disabled'}>Англ → Рус</button>
        </div>
        <div class="btnrow"><button class="btn mark" data-dir="mix" ${n ? '' : 'disabled'}>Вперемешку</button></div>
        <p class="def" style="margin-top:14px;color:var(--ink-soft)">${n
          ? `${n} ${plural(n, 'слово', 'слова', 'слов')} из выбранного набора. Мелкие опечатки засчитываются, правильное написание всё равно показывается.`
          : 'В этом наборе нет слов. Выберите другую тему или уровень.'}</p>
      </div>`;
    drawScope($('#testScope'), renderTest);
    $$('#testBody [data-dir]').forEach(b =>
      b.addEventListener('click', () => { if (n) startTest(b.dataset.dir); }));
    return;
  }

  if (test.i >= test.qs.length){
    $('#testStat').textContent = '';
    $('#testSub').textContent = 'Результат';
    const pct = Math.round(test.right / test.asked * 100);
    body.innerHTML = `
      <div class="card">
        <div class="prompt-label">Верно</div>
        <p class="prompt">${test.right} из ${test.asked}</p>
        <p class="def" style="margin-top:10px">${
          pct === 100 ? 'Все десять. Эти слова можно считать своими.' :
          pct >= 70   ? 'Хороший результат. Ошибки вернутся в уроке завтра.' :
                        'Меньше половины — пройдите урок по этим словам, там есть разбор.'}</p>
        <div class="btnrow">
          <button class="btn" id="retest">Ещё тест</button>
          <button class="btn ghost" id="toLesson">К уроку</button>
        </div>
      </div>
      ${test.wrong.length ? `
      <div class="card">
        <div class="prompt-label">Разобрать</div>
        ${test.wrong.map(w => `
          <div class="rule-ex" style="margin-bottom:12px">
            <div class="en">${esc(w.w)} — ${esc(w.tr)}</div>
            <div class="why">${esc(w.ex || '')}</div>
            <button class="speak" data-say="${esc(w.w)}">Произнести</button>
          </div>`).join('')}
      </div>` : ''}`;
    test = null;
    $('#retest').addEventListener('click', () => { renderTest(); });
    $('#toLesson').addEventListener('click', () => show('review'));
    return;
  }

  const q = test.qs[test.i];
  $('#testStat').textContent = (test.i + 1) + ' / ' + test.qs.length;
  $('#testSub').textContent = 'Верно: ' + test.right;
  body.innerHTML = `<div class="progress">${test.qs.map((_, k) =>
      `<i class="${k < test.i ? 'done' : k === test.i ? 'now' : ''}"></i>`).join('')}</div>`
    + typeCard(q.w, q.dir);
  wireCard(body, q, () => { test.i++; renderTest(); });
}

function startTest(mode){
  const pool = shuffle(scopedWords()).slice(0, 10);
  test = {
    qs: pool.map(w => ({
      kind: 'type', w,
      dir: mode === 'mix' ? (Math.random() < 0.5 ? 'ru2en' : 'en2ru') : mode
    })),
    i: 0, right: 0, asked: 0, wrong: []
  };
  renderTest();
}

/* ================= раздел: ПРАВИЛА ================= */
function renderRules(){
  $('#rulesCount').textContent = grammar.length + ' ' + plural(grammar.length, 'правило', 'правила', 'правил');
  $('#rulesBody').innerHTML = grammar.map(r => `
    <details class="rule">
      <summary><h3>${esc(r.t)}</h3>${r.lvl ? `<span class="lvl">${esc(r.lvl)}</span>` : ''}</summary>
      <div class="rule-body">
        <p>${esc(r.body)}</p>
        ${r.ex.map(([en, why]) => `
          <div class="rule-ex">
            <div class="en">${esc(en)}</div>
            <div class="why">${esc(why)}</div>
          </div>`).join('')}
        <button class="speak" data-say="${esc(r.ex.map(e => e[0]).join('. '))}">Прочитать примеры</button>
      </div>
    </details>`).join('');
}

/* ================= раздел: МАТЕРИАЛЫ ================= */
function renderMore(){
  $('#moreBody').innerHTML = links.map(g => `
    <div class="cat">${esc(g.cat)}</div>
    ${g.items.map(it => `
      <a class="link" href="${esc(it.u)}" target="_blank" rel="noopener">
        <div class="n">${esc(it.n)}</div>
        <div class="d">${esc(it.d)}</div>
      </a>`).join('')}`).join('')
    + `<p class="build">Сборка ${BUILD} · ${words.length} слов<br>${courseInfo()}</p>`;
}

/* Состояние курса — чтобы сразу было видно, загрузился он или нет. */
function courseInfo(){
  if (typeof course === 'undefined' || course === null) return 'курс не загружен';
  if (course.failed) return 'ни одна часть курса не читается';
  const s = course.courses.map(c =>
    (c.id === 'elem' ? 'Elem' : 'Pre-Int') + ' ' + c.units.length).join(' · ') + ' юнитов';
  return course.missing ? s + ' · не хватает частей: ' + course.missing : s;
}

/* ================= переключение разделов ================= */
function show(v){
  $$('.view').forEach(s => s.hidden = (s.id !== 'view-' + v));
  $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  window.scrollTo({top: 0});
  if (v === 'review') renderLesson();
  if (v === 'test')   renderTest();
  if (v === 'dict')   guide();
}
$('#tabbar').addEventListener('click', e => {
  const b = e.target.closest('button'); if (b) show(b.dataset.v);
});

/* ================= запуск ================= */
store.load();

window.appReady = Promise.all([
  fetch('words.json').then(r => r.json()),
  fetch('grammar.json').then(r => r.json()).catch(() => []),
  fetch('links.json').then(r => r.json()).catch(() => [])
]).then(([w, g, l]) => {
  words = w.sort((a, b) => a.w.localeCompare(b.w));
  grammar = g; links = l;
  buildRail(); renderDict(); renderRules(); renderMore();
}).catch(() => {
  $('#list').innerHTML = '<p class="blank"><b>Словарь не загрузился</b>' +
    'Файл words.json должен лежать рядом с index.html, а сайт — открываться по http или https.</p>';
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
