/* =============================================
   うんこ＆紫外線チェッカー - メインロジック
   ============================================= */

'use strict';

// =============================================
// 定数・設定
// =============================================
const STORAGE_KEY = 'unko_checker_records';
const THEME_KEY   = 'unko_checker_theme';

const UV_LEVELS = [
  { max: 2,   cls: 'uv-low',  textCls: 'uv-text-low',  label: '弱い',     comment: '特別な対策は不要です。外出を楽しみましょう！☀️',         emoji: '😎' },
  { max: 5,   cls: 'uv-mod',  textCls: 'uv-text-mod',  label: '普通',     comment: '長時間の外出には日焼け止めを塗りましょう。🧴',           emoji: '🙂' },
  { max: 7,   cls: 'uv-high', textCls: 'uv-text-high', label: '強い',     comment: '日焼け止め（SPF30以上）と帽子を着用してください。🧢',      emoji: '😬' },
  { max: 10,  cls: 'uv-very', textCls: 'uv-text-very', label: '非常に強い', comment: '日焼け止め・帽子・サングラスが必須です。外出を控えめに。🕶️', emoji: '😰' },
  { max: Infinity, cls: 'uv-ext', textCls: 'uv-text-ext', label: '危険', comment: '外出はできる限り避けてください！肌・目の保護を徹底して。⛔',  emoji: '🆘' },
];

// =============================================
// ユーティリティ
// =============================================

/** 今日の日付キー (YYYY-MM-DD) */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** 指定年月のキープレフィックス */
function monthPrefix(year, month) {
  return `${year}-${String(month+1).padStart(2,'0')}-`;
}

/** 日付キーをDateに変換 */
function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m-1, d);
}

/** Dateを日付キーに変換 */
function dateToKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// =============================================
// データストレージ
// =============================================

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch { return {}; }
}

function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function getRecord(key) {
  return loadRecords()[key] || null;
}

function setRecord(key, value) {
  const records = loadRecords();
  records[key] = value;
  saveRecords(records);
}

// =============================================
// テーマ管理
// =============================================

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  const btn = document.getElementById('darkToggleBtn');
  if (btn) btn.querySelector('.toggle-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// =============================================
// 紫外線取得
// =============================================

let uvCache = null;
let uvCacheTime = 0;

function getUVLevel(index) {
  return UV_LEVELS.find(l => index <= l.max) || UV_LEVELS[UV_LEVELS.length - 1];
}

/** Open-Meteo API（無料・制限なし）からUV取得 */
async function fetchUV(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=uv_index&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('UV API error');
  const data = await res.json();
  return data.current?.uv_index ?? 0;
}

/** 逆ジオコード（Open-Meteo自体は都市名返さないのでnominatim） */
async function fetchCityName(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ja`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'ja' } });
    const data = await res.json();
    const addr = data.address || {};
    return addr.city || addr.town || addr.village || addr.county || '現在地';
  } catch {
    return '現在地';
  }
}

function renderUVLoading() {
  document.getElementById('uvContent').innerHTML = `
    <div class="uv-loading">
      <div class="spinner"></div>
      <p>位置情報を取得中...</p>
    </div>`;
}

function renderUVError(msg) {
  document.getElementById('uvContent').innerHTML = `
    <div class="uv-error">
      <p>📍 ${msg}</p>
      <p><small>位置情報の許可が必要です。<br>またはブラウザの設定をご確認ください。</small></p>
    </div>`;
}

function renderUV(uvIndex, cityName) {
  const level = getUVLevel(uvIndex);
  const barPct = Math.min(uvIndex / 12 * 100, 100).toFixed(1);

  document.getElementById('uvContent').innerHTML = `
    <div class="uv-display">
      <div class="uv-main">
        <div class="uv-index-badge ${level.cls}">
          <span class="uv-num">${uvIndex.toFixed(1)}</span>
          <span class="uv-unit">UV</span>
        </div>
        <div class="uv-info">
          <div class="uv-level ${level.textCls}">${level.emoji} ${level.label}</div>
          <div class="uv-location">📍 ${cityName}</div>
        </div>
      </div>
      <div class="uv-bar-wrap">
        <div class="uv-bar">
          <div class="uv-bar-marker" style="left:${barPct}%"></div>
        </div>
      </div>
      <div class="uv-comment">${level.comment}</div>
    </div>`;
}

async function loadUV() {
  // 5分キャッシュ
  const now = Date.now();
  if (uvCache && (now - uvCacheTime) < 5 * 60 * 1000) {
    renderUV(uvCache.index, uvCache.city);
    return;
  }

  renderUVLoading();

  if (!navigator.geolocation) {
    renderUVError('お使いのブラウザは位置情報に対応していません。');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const [uvIndex, cityName] = await Promise.all([
          fetchUV(latitude, longitude),
          fetchCityName(latitude, longitude),
        ]);
        uvCache = { index: uvIndex, city: cityName };
        uvCacheTime = Date.now();
        renderUV(uvIndex, cityName);
      } catch (e) {
        console.error(e);
        renderUVError('紫外線データの取得に失敗しました。');
      }
    },
    (err) => {
      let msg = '位置情報を取得できませんでした。';
      if (err.code === 1) msg = '位置情報の使用が許可されていません。';
      renderUVError(msg);
    },
    { timeout: 10000, maximumAge: 300000 }
  );
}

// =============================================
// 今日の記録UI
// =============================================

function updateTodayDate() {
  const d = new Date();
  const days = ['日','月','火','水','木','金','土'];
  document.getElementById('todayDate').textContent =
    `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`;
}

function renderTodayRecord() {
  const key = todayKey();
  const rec = getRecord(key);

  const statusEmoji  = document.getElementById('statusEmoji');
  const statusText   = document.getElementById('statusText');
  const recordTime   = document.getElementById('recordTime');
  const noNotice     = document.getElementById('noRecordNotice');
  const btnPooped    = document.getElementById('btnPooped');
  const btnNotPooped = document.getElementById('btnNotPooped');

  btnPooped.classList.remove('selected-pooped');
  btnNotPooped.classList.remove('selected-not');

  if (!rec) {
    statusEmoji.textContent = '❓';
    statusText.textContent  = '未記録';
    recordTime.classList.add('hidden');
    noNotice.classList.remove('hidden');
  } else if (rec.status === 'pooped') {
    statusEmoji.textContent = '💩';
    statusEmoji.classList.add('pop-animate');
    setTimeout(() => statusEmoji.classList.remove('pop-animate'), 500);
    statusText.textContent  = '出た！';
    recordTime.textContent  = `記録時刻：${rec.time}`;
    recordTime.classList.remove('hidden');
    noNotice.classList.add('hidden');
    btnPooped.classList.add('selected-pooped');
  } else {
    statusEmoji.textContent = '❌';
    statusText.textContent  = '出てない';
    recordTime.textContent  = `記録時刻：${rec.time}`;
    recordTime.classList.remove('hidden');
    noNotice.classList.add('hidden');
    btnNotPooped.classList.add('selected-not');
  }
}

function recordToday(status) {
  const key = todayKey();
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  setRecord(key, { status, time: hhmm });
  renderTodayRecord();
  updateStats();
  renderCalendar();
  checkWarnings();
}

// =============================================
// 統計
// =============================================

function calcStats() {
  const records = loadRecords();
  const now = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();
  const prefix = monthPrefix(year, month);

  // 今月の集計
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const today = now.getDate();
  let total = 0, recorded = 0;

  for (let d = 1; d <= today; d++) {
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const rec = records[key];
    if (rec) {
      recorded++;
      if (rec.status === 'pooped') total++;
    }
  }

  const rate = recorded > 0 ? Math.round(total / recorded * 100) : 0;

  // 連続排便日数（今日から遡る）
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = dateToKey(d);
    const rec = records[key];
    if (rec && rec.status === 'pooped') {
      streak++;
    } else if (rec && rec.status === 'not') {
      break;
    } else if (!rec && i > 0) {
      break; // 未記録は打ち切り
    } else if (!rec && i === 0) {
      // 今日が未記録なら昨日から
      continue;
    }
  }

  // 今日が未記録なら昨日から連続排便を再計算
  const todayRec = records[dateToKey(now)];
  if (!todayRec) {
    streak = 0;
    for (let i = 1; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = dateToKey(d);
      const rec = records[key];
      if (rec && rec.status === 'pooped') streak++;
      else break;
    }
  }

  // 連続未排便日数（今日から遡る）
  let missStreak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = dateToKey(d);
    const rec = records[key];
    if (rec && rec.status === 'not') {
      missStreak++;
    } else if (rec && rec.status === 'pooped') {
      break;
    } else if (!rec) {
      break;
    }
  }

  return { total, rate, streak, missStreak };
}

function updateStats() {
  const { total, rate, streak, missStreak } = calcStats();
  document.getElementById('statTotal').textContent  = total;
  document.getElementById('statRate').textContent   = `${rate}%`;
  document.getElementById('statStreak').textContent = `${streak}日`;
  document.getElementById('statMiss').textContent   = `${missStreak}日`;
}

// =============================================
// 警告チェック
// =============================================

function checkWarnings() {
  const banner  = document.getElementById('warningBanner');
  const wText   = document.getElementById('warningText');
  const records = loadRecords();
  const now     = new Date();

  // 連続未排便日数をカウント（今日を含む）
  let missCount = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = dateToKey(d);
    const rec = records[key];
    if (rec && rec.status === 'not') {
      missCount++;
    } else if (rec && rec.status === 'pooped') {
      break;
    } else if (!rec) {
      // 未記録はカウント外
      if (i === 0) continue;
      break;
    }
  }

  if (missCount >= 3) {
    banner.classList.remove('hidden');
    wText.textContent = `${missCount}日以上排便記録がありません！お身体の様子はいかがですか？`;
    return;
  }

  banner.classList.add('hidden');
}

// =============================================
// カレンダー
// =============================================

let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();

function renderCalendar() {
  const grid       = document.getElementById('calendarGrid');
  const monthLabel = document.getElementById('calMonthLabel');
  const records    = loadRecords();
  const today      = new Date();
  const todayStr   = dateToKey(today);

  monthLabel.textContent = `${calYear}/${String(calMonth+1).padStart(2,'0')}`;

  const html = [];
  const dows = ['日','月','火','水','木','金','土'];

  // 曜日ヘッダー
  dows.forEach((d, i) => {
    const cls = i === 0 ? 'sun' : i === 6 ? 'sat' : '';
    html.push(`<div class="cal-dow ${cls}">${d}</div>`);
  });

  // 月初の曜日を特定
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const prevDays = new Date(calYear, calMonth, 0).getDate();

  // 前月の日（灰色）
  for (let i = 0; i < firstDay; i++) {
    const d = prevDays - firstDay + 1 + i;
    html.push(`<div class="cal-cell other-month"><span class="cal-date">${d}</span></div>`);
  }

  // 今月の日
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const rec = records[key];
    const dow = (firstDay + d - 1) % 7;
    const isToday = key === todayStr;

    let mark = '';
    if (rec?.status === 'pooped') mark = `<span class="cal-mark">💩</span>`;
    else if (rec?.status === 'not') mark = `<span class="cal-mark">❌</span>`;

    const dowCls = dow === 0 ? 'sun' : dow === 6 ? 'sat' : '';
    const todayCls = isToday ? 'today' : '';

    html.push(`<div class="cal-cell ${dowCls} ${todayCls}">
      <span class="cal-date">${d}</span>
      ${mark}
    </div>`);
  }

  // 次月の日（灰色）
  const total = firstDay + daysInMonth;
  const remain = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= remain; d++) {
    html.push(`<div class="cal-cell other-month"><span class="cal-date">${d}</span></div>`);
  }

  grid.innerHTML = html.join('');
}

// =============================================
// Service Worker登録
// =============================================

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.warn('SW failed:', err));
  }
}

// =============================================
// イベント初期化
// =============================================

function initEvents() {
  document.getElementById('darkToggleBtn').addEventListener('click', toggleTheme);

  document.getElementById('uvRefreshBtn').addEventListener('click', () => {
    uvCache = null;
    loadUV();
  });

  document.getElementById('btnPooped').addEventListener('click', () => recordToday('pooped'));
  document.getElementById('btnNotPooped').addEventListener('click', () => recordToday('not'));

  document.getElementById('prevMonth').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });

  document.getElementById('nextMonth').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });
}

// =============================================
// アプリ起動
// =============================================

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initEvents();
  updateTodayDate();
  loadUV();
  renderTodayRecord();
  updateStats();
  renderCalendar();
  checkWarnings();
  registerSW();

  // OS ダークモード変更を検知
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(THEME_KEY)) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
});
