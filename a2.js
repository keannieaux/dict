/* ================= раздел: A2 =================
   Отдельный модуль: темы, истории, правила в деле, письмо и видео.
   Данные приходят из a2.json через initA2(pack) после загрузки app.js. */
let A2 = null;
const A2WKEY = 'dict-a2-writing-v1';
const A2W = {
  data: {},
  load(){ try { this.data = JSON.parse(localStorage.getItem(A2WKEY) || '{}'); } catch(e){ this.data = {}; } },
  save(){ try { localStorage.setItem(A2WKEY, JSON.stringify(this.data)); } catch(e){} }
};
let a2s = { tab: 'topics', topic: null, quiz: null, story: null, drill: null, writing: null };

function a2Words(){
  return A2 ? A2.topics.reduce((acc, t) => acc.concat(t.words), []) : [];
}
function a2TopicWords(i){
  return (A2 && A2.topics[i]) ? A2.topics[i].words : [];
}
function a2Tabs(){
  return [
    ['topics', 'Темы'],
    ['stories', 'Истории'],
    ['drills', 'Правила в деле'],
    ['writing', 'Письмо'],
    ['videos', 'Видео']
  ];
}

function initA2(pack){
  A2 = pack;
  A2W.load();
  const body = document.getElementById('a2Body');
  if (body && !body.dataset.bound){
    body.dataset.bound = '1';
    body.addEventListener('click', a2Click);
    body.addEventListener('input', a2Input);
  }
  if (!document.getElementById('view-a2').hidden) renderA2();
}

function renderA2(){
  const body = document.getElementById('a2Body');
  if (!body) return;
  if (!A2){
    document.getElementById('a2Stat').textContent = '';
    body.innerHTML = '<p class="blank"><b>A2 ещё загружается</b>Если сообщение не исчезает, проверьте, что a2.json лежит рядом с index.html.</p>';
    return;
  }
  document.getElementById('a2Stat').textContent =
    a2Words().length + ' слов · ' + A2.stories.length + ' историй · ' + A2.drills.length + ' упражнений';
  body.innerHTML =
    '<div class="a2tabs">' + a2Tabs().map(([id, name]) =>
      '<button class="pill' + (a2s.tab === id ? ' on' : '') + '" data-a2="tab" data-tab="' + id + '">' + name + '</button>').join('') +
    '</div><div id="a2Stage"></div>';
  renderA2Stage();
}

function renderA2Stage(){
  const stage = document.getElementById('a2Stage');
  if (!stage || !A2) return;
  if (a2s.tab === 'topics') stage.innerHTML = a2s.topic === null ? a2TopicList() : a2TopicDetail(a2s.topic);
  if (a2s.tab === 'stories') stage.innerHTML = a2s.story === null ? a2StoryList() : a2StoryDetail(a2s.story);
  if (a2s.tab === 'drills') stage.innerHTML = a2Drills();
  if (a2s.tab === 'writing') stage.innerHTML = a2s.writing === null ? a2WritingList() : a2WritingDetail(a2s.writing);
  if (a2s.tab === 'videos') stage.innerHTML = a2Videos();
}

/* ---------- Темы ---------- */
function a2TopicList(){
  return A2.topics.map((t, i) => `
    <div class="card">
      <div class="prompt-label">${esc(t.ru)} · ${t.words.length} слов</div>
      <p class="prompt" style="font-size:24px">${esc(t.t)}</p>
      <p class="def" style="margin-top:8px">${esc(t.words.slice(0, 4).map(w => w.w).join(', '))}…</p>
      <div class="btnrow">
        <button class="btn" data-a2="topic" data-i="${i}">Смотреть слова</button>
        <button class="btn ghost" data-a2="topicquiz" data-i="${i}">Мини-тест</button>
      </div>
    </div>`).join('');
}

function a2TopicDetail(i){
  if (a2s.quiz && a2s.quiz.topic === i) return a2Quiz();
  const t = A2.topics[i];
  return `
    <div class="card">
      <div class="prompt-label">Тема</div>
      <p class="prompt" style="font-size:25px">${esc(t.t)} <span class="pos">${esc(t.ru)}</span></p>
      <div class="btnrow">
        <button class="btn" data-a2="topicquiz" data-i="${i}">Проверить себя</button>
        <button class="btn ghost" data-a2="back">К темам</button>
      </div>
    </div>
    ${t.words.map(w => `
      <div class="rule-ex" style="background:var(--slip);border:1px solid var(--rule);border-left:2px solid var(--mark);border-radius:10px;padding:12px 14px;margin-bottom:10px">
        <div class="en">${esc(w.w)} <span class="pos">${esc(w.pos || '')}</span> — ${esc(w.tr)}</div>
        <div class="ipa">${esc(w.ipa || '')}</div>
        <div class="why" style="margin-top:5px">${esc(w.def)}</div>
        <div class="ex">${esc(w.ex)}</div>
        <button class="speak" data-say="${esc(w.w)}">Произнести</button>
      </div>`).join('')}`;
}

function a2MakeQuiz(i){
  const pool = a2TopicWords(i);
  const qs = shuffle(pool).slice(0, Math.min(5, pool.length)).map(w => {
    const wrong = shuffle(a2Words().filter(x => x.w !== w.w)).slice(0, 3).map(x => x.tr);
    const opts = shuffle([w.tr].concat(wrong));
    return { w, opts, correct: opts.indexOf(w.tr), picked: null };
  });
  a2s.quiz = { topic: i, qs, i: 0, right: 0, locked: false };
}

function a2Quiz(){
  const qz = a2s.quiz;
  const t = A2.topics[qz.topic];
  if (qz.i >= qz.qs.length){
    const total = qz.qs.length;
    return `
      <div class="card">
        <div class="prompt-label">Мини-тест · ${esc(t.t)}</div>
        <p class="prompt">${qz.right} из ${total}</p>
        <p class="def" style="margin-top:10px">${qz.right === total ? 'Тема выглядит знакомой. Повторите через пару дней.' : 'Ошибки нормальны: откройте слова темы и пройдите тест ещё раз.'}</p>
        <div class="btnrow">
          <button class="btn" data-a2="topicquiz" data-i="${qz.topic}">Ещё раз</button>
          <button class="btn ghost" data-a2="topic" data-i="${qz.topic}">К словам</button>
          <button class="btn ghost" data-a2="back">К темам</button>
        </div>
      </div>`;
  }
  const q = qz.qs[qz.i];
  const done = q.picked !== null;
  return `
    <div class="card">
      <div class="prompt-label">Мини-тест · ${qz.i + 1} / ${qz.qs.length}</div>
      <p class="prompt">${esc(q.w.w)}</p>
      <div class="ipa">${esc(q.w.ipa || '')}</div>
      <div class="a2opts">
        ${q.opts.map((o, k) => `<button class="a2opt ${done ? (k === q.correct ? 'ok' : k === q.picked ? 'no' : '') : ''}" data-a2="opt" data-v="${k}" ${done ? 'disabled' : ''}>${esc(o)}</button>`).join('')}
      </div>
      ${done ? `<div class="verdict ${q.picked === q.correct ? 'ok' : 'no'}">
        <b>${q.picked === q.correct ? 'Верно' : 'Пока нет'}</b>
        <span class="right">${esc(q.w.w)} — ${esc(q.w.tr)}</span>
        <span class="ex">${esc(q.w.ex)}</span>
      </div>` : ''}
      <div class="btnrow">
        ${done ? '<button class="btn" data-a2="quiznext">Дальше</button>' : ''}
        <button class="btn ghost" data-a2="topic" data-i="${qz.topic}">Выйти</button>
      </div>
    </div>`;
}

/* ---------- Истории ---------- */
function a2StoryList(){
  return A2.stories.map((s, i) => `
    <div class="card">
      <div class="prompt-label">История ${i + 1} · ${esc(s.lvl)}</div>
      <p class="prompt" style="font-size:24px">${esc(s.title)}</p>
      <p class="def" style="margin-top:8px">${esc(s.text.split(' ').slice(0, 16).join(' '))}…</p>
      <div class="btnrow"><button class="btn" data-a2="story" data-i="${i}">Читать и отвечать</button></div>
    </div>`).join('');
}

function a2StoryDetail(i){
  const s = A2.stories[i];
  if (!a2s.storyAnswers) a2s.storyAnswers = {};
  const ans = a2s.storyAnswers[i] || (a2s.storyAnswers[i] = {});
  const answered = Object.keys(ans).length;
  const right = s.questions.reduce((n, q, qi) => n + (ans[qi] === q.a ? 1 : 0), 0);
  return `
    <div class="card">
      <div class="prompt-label">История · ${esc(s.lvl)}</div>
      <p class="prompt" style="font-size:25px">${esc(s.title)}</p>
      <p class="def" style="margin:12px 0 0;line-height:1.65">${esc(s.text)}</p>
      <button class="speak" data-say="${esc(s.title + '. ' + s.text)}">Прочитать вслух</button>
      <div class="btnrow"><button class="btn ghost" data-a2="back">К историям</button></div>
    </div>
    <div class="card">
      <div class="prompt-label">Слова из рассказа</div>
      ${s.glossary.map(([en, ru]) => `<div class="rule-ex"><div class="en">${esc(en)}</div><div class="why">${esc(ru)}</div></div>`).join('')}
    </div>
    <div class="card">
      <div class="prompt-label">Понимание · ${right} / ${s.questions.length}</div>
      ${s.questions.map((q, qi) => `
        <div class="a2q">
          <p class="def" style="font-weight:700">${qi + 1}. ${esc(q.q)}</p>
          <div class="a2opts">
            ${q.options.map((o, k) => {
              const chosen = ans[qi];
              const cls = chosen === undefined ? '' : (k === q.a ? ' ok' : k === chosen ? ' no' : '');
              return `<button class="a2opt${cls}" data-a2="sq" data-i="${i}" data-q="${qi}" data-v="${k}">${esc(o)}</button>`;
            }).join('')}
          </div>
        </div>`).join('')}
      ${answered === s.questions.length ? `<div class="verdict ${right === s.questions.length ? 'ok' : 'no'}"><b>${right === s.questions.length ? 'Отлично' : 'Есть над чем поработать'}</b><span class="right">Понято ${right} из ${s.questions.length}</span></div>
      <div class="btnrow"><button class="btn ghost" data-a2="storyreset" data-i="${i}">Сбросить ответы</button></div>` : ''}
    </div>`;
}

/* ---------- Правила в деле ---------- */
function a2Drills(){
  if (!a2s.drill) a2s.drill = { i: 0, right: 0, locked: false };
  const d = a2s.drill;
  if (d.i >= A2.drills.length){
    const total = A2.drills.length;
    return `
      <div class="card">
        <div class="prompt-label">Правила в деле</div>
        <p class="prompt">${d.right} из ${total}</p>
        <p class="def" style="margin-top:10px">${d.right >= total * 0.8 ? 'Правила уже работают, не только читаются.' : 'Откройте раздел «Правила», найдите тему ошибки и вернитесь сюда.'}</p>
        <div class="btnrow"><button class="btn" data-a2="drillrestart">Пройти снова</button></div>
      </div>`;
  }
  const item = A2.drills[d.i];
  const done = d.locked;
  return `
    <div class="card">
      <div class="prompt-label">${esc(item.rule)} · ${d.i + 1} / ${A2.drills.length}</div>
      <p class="prompt" style="font-size:24px">${esc(item.prompt).replace('___', '<span class="a2gap">___</span>')}</p>
      <div class="a2opts">
        ${item.options.map((o, k) => `<button class="a2opt ${done ? (k === item.a ? 'ok' : k === d.picked ? 'no' : '') : ''}" data-a2="drillopt" data-v="${k}" ${done ? 'disabled' : ''}>${esc(o)}</button>`).join('')}
      </div>
      ${done ? `<div class="verdict ${d.picked === item.a ? 'ok' : 'no'}"><b>${d.picked === item.a ? 'Верно' : 'Пока нет'}</b><span class="right">${esc(item.options[item.a])}</span><span class="ex">${esc(item.why)}</span></div>` : ''}
      <div class="btnrow">${done ? '<button class="btn" data-a2="drillnext">Дальше</button>' : ''}<button class="btn ghost" data-a2="drillrestart">Сначала</button></div>
    </div>`;
}

/* ---------- Письмо ---------- */
function a2WriteState(i){
  if (!A2W.data[i]) A2W.data[i] = { text: '', checks: {} };
  return A2W.data[i];
}
function a2WritingList(){
  return A2.writing.map((p, i) => {
    const st = a2WriteState(i);
    const words = (st.text.trim().match(/\S+/g) || []).length;
    return `
      <div class="card">
        <div class="prompt-label">Письмо · ${words ? words + ' слов сохранено' : 'новое задание'}</div>
        <p class="prompt" style="font-size:24px">${esc(p.title)}</p>
        <p class="def" style="margin-top:8px">${esc(p.prompt)}</p>
        <div class="btnrow"><button class="btn" data-a2="writing" data-i="${i}">Писать</button></div>
      </div>`;
  }).join('');
}
function a2WritingDetail(i){
  const p = A2.writing[i];
  const st = a2WriteState(i);
  const words = (st.text.trim().match(/\S+/g) || []).length;
  return `
    <div class="card">
      <div class="prompt-label">Письмо A2</div>
      <p class="prompt" style="font-size:25px">${esc(p.title)}</p>
      <p class="def" style="margin-top:10px">${esc(p.prompt)}</p>
      <div class="btnrow">
        <button class="btn ghost" data-a2="back">К заданиям</button>
        <button class="btn ghost" data-a2="sample" data-i="${i}">Показать пример</button>
      </div>
    </div>
    <div class="card">
      <div class="prompt-label">Фразы-помощники · нажмите, чтобы вставить</div>
      <div class="bank">${p.phrases.map((ph, k) => `<button class="chip" data-a2="phrase" data-i="${i}" data-p="${k}">${esc(ph)}</button>`).join('')}</div>
      <textarea class="a2write" data-writing-text="${i}" rows="8" placeholder="Пишите здесь. Черновик сохраняется в браузере.">${esc(st.text)}</textarea>
      <div class="stat">${words} слов · цель: 50–90</div>
    </div>
    <div class="card">
      <div class="prompt-label">Самопроверка</div>
      ${p.checklist.map((c, k) => `<label class="a2check"><input type="checkbox" data-a2="check" data-i="${i}" data-c="${k}" ${st.checks[k] ? 'checked' : ''}> <span>${esc(c)}</span></label>`).join('')}
      <div class="btnrow"><button class="btn ghost" data-a2="clearwrite" data-i="${i}">Очистить черновик</button></div>
    </div>
    ${a2s.showSample === i ? `<div class="card"><div class="prompt-label">Пример ответа</div><p class="def" style="line-height:1.6">${esc(p.sample)}</p><button class="speak" data-say="${esc(p.sample)}">Прочитать пример</button></div>` : ''}`;
}

/* ---------- Видео ---------- */
function a2Videos(){
  return `
    <div class="card">
      <div class="prompt-label">Как смотреть</div>
      <p class="def">Видео нужен интернет, в офлайн-кэш они не сохраняются. Схема на A2: 1 раз без субтитров → 1 раз с английскими субтитрами → выписать 5 слов → пересказать 3 предложениями вслух.</p>
    </div>
    ${A2.videos.map(v => `
      <a class="link" href="${esc(v.u)}" target="_blank" rel="noopener">
        <div class="n">${esc(v.n)}</div>
        <div class="d">${esc(v.d)}</div>
      </a>`).join('')}`;
}

/* ---------- обработчики ---------- */
function a2Click(e){
  const b = e.target.closest('[data-a2]');
  if (!b) return;
  const act = b.dataset.a2;

  if (act === 'tab'){ a2s.tab = b.dataset.tab; a2s.topic = a2s.story = a2s.writing = null; a2s.quiz = null; a2s.drill = null; renderA2(); return; }
  if (act === 'back'){ a2s.topic = a2s.story = a2s.writing = null; a2s.quiz = null; renderA2Stage(); return; }
  if (act === 'topic'){ a2s.topic = +b.dataset.i; a2s.quiz = null; renderA2Stage(); return; }
  if (act === 'topicquiz'){ const i = +b.dataset.i; a2s.topic = i; a2MakeQuiz(i); renderA2Stage(); return; }
  if (act === 'opt'){
    const qz = a2s.quiz; if (!qz || qz.locked) return;
    const q = qz.qs[qz.i]; q.picked = +b.dataset.v; qz.locked = true;
    if (q.picked === q.correct) qz.right++;
    renderA2Stage(); return;
  }
  if (act === 'quiznext'){ const qz = a2s.quiz; qz.i++; qz.locked = false; renderA2Stage(); return; }
  if (act === 'story'){ a2s.story = +b.dataset.i; renderA2Stage(); return; }
  if (act === 'sq'){
    const i = +b.dataset.i, q = +b.dataset.q, v = +b.dataset.v;
    if (!a2s.storyAnswers) a2s.storyAnswers = {};
    const ans = a2s.storyAnswers[i] || (a2s.storyAnswers[i] = {});
    if (ans[q] === undefined) ans[q] = v;
    renderA2Stage(); return;
  }
  if (act === 'storyreset'){ if (a2s.storyAnswers) delete a2s.storyAnswers[+b.dataset.i]; renderA2Stage(); return; }
  if (act === 'drillopt'){
    const d = a2s.drill; if (!d || d.locked) return;
    const item = A2.drills[d.i]; d.picked = +b.dataset.v; d.locked = true;
    if (d.picked === item.a) d.right++;
    renderA2Stage(); return;
  }
  if (act === 'drillnext'){ a2s.drill.i++; a2s.drill.locked = false; a2s.drill.picked = null; renderA2Stage(); return; }
  if (act === 'drillrestart'){ a2s.drill = { i: 0, right: 0, locked: false, picked: null }; renderA2Stage(); return; }
  if (act === 'writing'){ a2s.writing = +b.dataset.i; renderA2Stage(); return; }
  if (act === 'phrase'){
    const i = +b.dataset.i, p = +b.dataset.p;
    const ta = document.querySelector('[data-writing-text="' + i + '"]');
    if (ta){ ta.value = (ta.value ? ta.value.replace(/\s+$/, '') + ' ' : '') + A2.writing[i].phrases[p] + ' '; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); }
    return;
  }
  if (act === 'check'){
    const st = a2WriteState(+b.dataset.i);
    st.checks[+b.dataset.c] = b.checked;
    A2W.save(); return;
  }
  if (act === 'sample'){ a2s.showSample = a2s.showSample === +b.dataset.i ? null : +b.dataset.i; renderA2Stage(); return; }
  if (act === 'clearwrite'){
    const st = a2WriteState(+b.dataset.i);
    st.text = ''; st.checks = {}; A2W.save(); renderA2Stage(); return;
  }
}
function a2Input(e){
  const ta = e.target.closest('[data-writing-text]');
  if (!ta) return;
  const st = a2WriteState(+ta.dataset.writingText);
  st.text = ta.value;
  A2W.save();
}

window.initA2 = initA2;
window.renderA2 = renderA2;
