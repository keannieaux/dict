/* ============ КУРС: две книги, юниты по программе ============ */
let course = null, curBook = 1, openUnit = null;   // curBook: 0 — Elementary, 1 — Pre-Intermediate

/* Слова всех юнитов вливаются в общий словарь: их подхватывают
   поиск, «Тест» и интервальное повторение. */
function mergeCourseWords(){
  const have = new Set(words.map(w => w.w.toLowerCase()));
  course.courses.forEach(bk => bk.units.forEach(u => {
    u.words.forEach(w => {
      if (have.has(w.w.toLowerCase())) return;
      have.add(w.w.toLowerCase());
      words.push(Object.assign({ book: bk.id, unit: u.n }, w));
    });
  }));
  words.sort((a, b) => a.w.localeCompare(b.w));
  buildRail();
  renderDict();
}

function unitStats(u){
  const done = u.words.filter(w => (store.data[w.w]?.b || 0) >= 4).length;
  return { done, total: u.words.length };
}

function renderCourse(){
  const body = $('#courseBody');
  if (!course){ body.innerHTML = '<p class="blank">Курс не загрузился.</p>'; return; }
  const bk = course.courses[curBook];

  /* ---------- список юнитов ---------- */
  if (openUnit === null){
    $('#courseTitle').textContent = 'Курс';
    $('#courseSub').textContent = bk.book + ' · ' + bk.level;
    $('#courseStat').textContent = bk.units.length + ' ' +
      plural(bk.units.length, 'юнит', 'юнита', 'юнитов');

    body.innerHTML = `
      <div class="switch">
        ${course.courses.map((c, i) => `
          <button class="sw-b ${i === curBook ? 'on' : ''}" data-bk="${i}">
            ${i === 0 ? 'Elementary' : 'Pre-Intermediate'}
            <span>${esc(c.level)}</span>
          </button>`).join('')}
      </div>` +
      bk.units.map(u => {
        const s = unitStats(u);
        return `
        <button class="unit" data-unit="${u.n}">
          <div class="unit-n">${u.n}</div>
          <div class="unit-main">
            <div class="unit-t">${esc(u.title)}</div>
            <div class="unit-g">${u.map.map(m => esc(m.g)).join(' · ')}</div>
            <div class="unit-bar"><i style="width:${Math.round(s.done / s.total * 100)}%"></i></div>
          </div>
          <div class="unit-c">${s.done}/${s.total}</div>
        </button>`;
      }).join('') +
      `<p class="fineprint">${esc(course.note)}</p>`;

    body.querySelectorAll('[data-bk]').forEach(b =>
      b.addEventListener('click', () => { curBook = +b.dataset.bk; renderCourse(); }));
    body.querySelectorAll('[data-unit]').forEach(b =>
      b.addEventListener('click', () => {
        openUnit = +b.dataset.unit; renderCourse(); window.scrollTo({top: 0});
      }));
    return;
  }

  /* ---------- один юнит ---------- */
  const u = bk.units.find(x => x.n === openUnit);
  if (!u){ openUnit = null; renderCourse(); return; }

  $('#courseTitle').textContent = 'Юнит ' + u.n + '. ' + u.title;
  $('#courseSub').textContent = u.goal;
  $('#courseStat').textContent = curBook === 0 ? 'Elementary' : 'Pre-Int';

  body.innerHTML = `
    <button class="btn ghost back" id="backToUnits">← Все юниты</button>

    <div class="map">
      ${u.map.map(m => `
        <div class="map-row">
          <span class="map-id">${esc(m.id)}</span>
          <span class="map-g">${esc(m.g)}</span>
          <span class="map-v">${esc(m.v)}</span>
        </div>`).join('')}
    </div>

    <details class="sec" open>
      <summary><h3>Слова</h3><span class="lvl">${u.words.length}</span></summary>
      <div class="sec-body">
        ${u.words.map(w => `
          <div class="cw">
            <div class="cw-head">
              <b>${esc(w.w)}</b>
              <span class="ipa">${esc(w.ipa || '')}</span>
              <button class="speak tiny" data-say="${esc(w.w)}">▸</button>
            </div>
            <div class="cw-tr">${esc(w.tr)}</div>
            <div class="cw-ex">${esc(w.ex)}</div>
          </div>`).join('')}
        <p class="fineprint">Эти слова уже в общем словаре: их спросят «Повтор» и «Тест».</p>
      </div>
    </details>

    <details class="sec">
      <summary><h3>Грамматика</h3><span class="lvl">${u.rules.length}</span></summary>
      <div class="sec-body">
        ${u.rules.map(r => `
          <div class="crule">
            <h4>${esc(r.t)}</h4>
            <p>${esc(r.body)}</p>
            ${r.ex.map(([en, why]) => `
              <div class="rule-ex">
                <div class="en">${esc(en)}</div>
                <div class="why">${esc(why)}</div>
              </div>`).join('')}
            <button class="speak" data-say="${esc(r.ex.map(e => e[0]).join('. '))}">Прочитать примеры</button>
          </div>`).join('')}
      </div>
    </details>

    <details class="sec">
      <summary><h3>Текст</h3><span class="lvl">${u.text.body.split(' ').length} слов</span></summary>
      <div class="sec-body">
        <h4>${esc(u.text.title)}</h4>
        <p class="story">${esc(u.text.body)}</p>
        <button class="speak" data-say="${esc(u.text.body)}">Прочитать вслух</button>
        <details class="gloss">
          <summary>Словарик к тексту</summary>
          ${u.text.glossary.map(([en, ru]) => `
            <div class="gl"><b>${esc(en)}</b> — ${esc(ru)}</div>`).join('')}
        </details>
        <div class="quiz" data-quiz="text"></div>
      </div>
    </details>

    <details class="sec">
      <summary><h3>Упражнения</h3><span class="lvl">${u.drills.length}</span></summary>
      <div class="sec-body"><div class="quiz" data-quiz="drills"></div></div>
    </details>

    <details class="sec">
      <summary><h3>Видео</h3></summary>
      <div class="sec-body">
        <a class="link" href="${esc(u.video.u)}" target="_blank" rel="noopener">
          <div class="n">${esc(u.video.n)}</div>
          <div class="d">${esc(u.video.d)}</div>
        </a>
      </div>
    </details>`;

  $('#backToUnits').addEventListener('click', () => {
    openUnit = null; renderCourse(); window.scrollTo({top: 0});
  });

  drawQuiz(body.querySelector('[data-quiz="text"]'),
           u.text.questions.map(q => ({ q: q.q, options: q.options, a: q.a, why: q.why })));
  drawQuiz(body.querySelector('[data-quiz="drills"]'),
           u.drills.map(d => ({ q: d.prompt, options: d.options, a: d.a, why: d.why })));
}

/* Общий рисовальщик вопросов с вариантами: и для текста, и для упражнений. */
function drawQuiz(box, items){
  if (!box) return;
  box.innerHTML = items.map((it, i) => `
    <div class="qz" data-i="${i}">
      <div class="qz-q">${esc(it.q)}</div>
      <div class="qz-opts">
        ${it.options.map((o, k) => `<button class="qz-o" data-k="${k}">${esc(o)}</button>`).join('')}
      </div>
      <div class="qz-why" hidden></div>
    </div>`).join('');

  box.querySelectorAll('.qz').forEach((qz, i) => {
    const it = items[i];
    const why = qz.querySelector('.qz-why');
    qz.querySelectorAll('.qz-o').forEach(btn => {
      btn.addEventListener('click', () => {
        if (qz.dataset.done) return;
        qz.dataset.done = '1';
        const picked = +btn.dataset.k;
        qz.querySelectorAll('.qz-o').forEach((b, k) => {
          if (k === it.a) b.classList.add('ok');
          else if (k === picked) b.classList.add('no');
          b.disabled = true;
        });
        why.hidden = false;
        why.innerHTML = `<b>${picked === it.a ? 'Верно' : 'Не так'}</b>${esc(it.why)}`;
      });
    });
  });
}

/* ---- запуск ----
   Курс разбит на четыре файла, чтобы каждый было легко загружать по отдельности.
   Если какая-то часть не пришла, остальные всё равно работают. */
const PARTS = ['course-elem-1.json', 'course-elem-2.json',
               'course-pre-1.json',  'course-pre-2.json'];

function assemble(loaded){
  const byId = {};
  loaded.filter(Boolean).forEach(p => {
    if (!byId[p.id]) byId[p.id] = { id: p.id, book: p.book, level: p.level, units: [] };
    byId[p.id].units.push(...p.units);
  });
  const order = ['elem', 'pre'];
  return {
    note: 'Программа юнитов повторяет учебник. Тексты, слова и упражнения написаны для этого приложения.',
    missing: PARTS.length - loaded.filter(Boolean).length,
    courses: order.filter(id => byId[id]).map(id => {
      byId[id].units.sort((a, b) => a.n - b.n);
      return byId[id];
    })
  };
}

(window.appReady || Promise.resolve())
  .then(() => Promise.all(PARTS.map(p =>
      fetch(p).then(r => r.ok ? r.json() : null).catch(() => null))))
  .then(loaded => {
    course = assemble(loaded);
    if (!course.courses.length) throw new Error('нет ни одной части');
    mergeCourseWords(); renderCourse(); renderMore();
  })
  .catch(() => {
    course = { failed: true, courses: [] };
    renderMore();
    const b = $('#courseBody');
    if (b) b.innerHTML = '<p class="blank"><b>Курс не загрузился</b>Проверьте, что файлы course-elem-1.json и остальные три лежат рядом с index.html.</p>';
  });
