// ======================================================================
// LLDB Live - Main Logic (Final Fixed Version)
// ======================================================================

// --- Configuration & Constants ---
const API_URL = "https://script.google.com/macros/s/AKfycbzy7CNn83anQMEsvNxyK3zHMtTRtjHk6XZ-jWBNllRNxcXv41hKw-TenGoGjfpps6rLUw/exec";
const CACHE_KEY = 'lldb_data_v4_1_update_history_v6';
const AIKO_BIRTH = new Date(1975, 10, 22); // 1975/11/22

// 配色定義 (Maintenance: Change colors here)
const THEME_COLORS = {
  POP:   '#FF6B6B', // 新色
  ROCK:  '#54A0FF', // 新色
  ALOHA: '#FFC048', // 新色
  EVENT: '#B2BEC3', // 新色
  PINK:  '#FF69B4', // aiko-pink (維持)
  GRAY:  '#9CA3AF',
  BG_GRAY: '#E5E7EB',
  BG_GRAY_ALPHA: 'rgba(229, 231, 235, 0.8)'
};

// --- Global State ---
let userUserData = { attendedLives: {} };

let appInitializedResolver;
const appInitializedPromise = new Promise(resolve => {
  appInitializedResolver = resolve;
});

let animationFinishedResolver;
const animationFinishedPromise = new Promise(resolve => {
  animationFinishedResolver = resolve;
});

let hasCheckedTodayEvents = false;
let allLiveRecords = [], 
    songStats = {},                      
    songStatsNoMedley = {},
    songLastYears = {},
    songLastYearsNoMedley = {},
    songSortState = 'count-desc', 
    patternStats = {}, 
    albumData = [], 
    songData = {}, 
    historyData = [], 
    listData = [], 
    anniversaryQueue = [];
let chartInstances = {};

let selectedVenueInfo = null;
let currentDisplayingRecord = null;
let lastScrollPosition = 0;
let isLoadingFinished = false;

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    const CURRENT_VERSION = 'v4.4.7'; 
    const VERSION_KEY = 'lldb_installed_version';
    
    const savedVersion = localStorage.getItem(VERSION_KEY);

    if (savedVersion !== CURRENT_VERSION) {
        console.log(`Version Updated: ${savedVersion} -> ${CURRENT_VERSION}`);
        localStorage.clear();
        localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
    }

  let isCachedLoaded = false;
  try {
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
      JSON.parse(cachedData);
      isCachedLoaded = true;
    }
  } catch (e) {
    console.warn("Cache check failed:", e);
  }

  startLoadingAnimation(isCachedLoaded ? 'smart' : 'normal');

  try { if (typeof lucide !== 'undefined') lucide.createIcons(); } catch(e) {}
  try { setupRandomTriggers(); } catch(e) {}

  loadAllData(isCachedLoaded);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
       console.log("App resumed. Checking events...");
       setTimeout(checkTodayEvents, 1500);
    }
  });

  Promise.all([appInitializedPromise, animationFinishedPromise])
    .then(() => {
      finishLoading();
    })
    .catch(e => {
      console.error("Loading process failed:", e);
      finishLoading();
    });
});

// --- Data Loading & Caching ---

function saveToCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Cache save failed:", e);
    if (e.name === 'QuotaExceededError' || e.message.includes('quota')) {
       console.log("Clearing old cache...");
       localStorage.clear(); 
       try {
         localStorage.setItem(CACHE_KEY, JSON.stringify(data));
       } catch (e2) {
         console.error("Retry failed. App will run without cache.", e2);
       }
    }
  }
}

async function loadAllData(useCache = false) {
  if (useCache) {
      try {
          const cachedRaw = localStorage.getItem(CACHE_KEY);
          if (cachedRaw) {
              const cachedData = JSON.parse(cachedRaw);
              console.log("Loaded from cache.");
              initializeApp(cachedData);
              return; 
          }
      } catch (e) {
          console.warn("Cache load failed, falling back to fetch", e);
      }
  }

  try {
    const response = await fetch(`${API_URL}?action=getAllData`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    if (data.status === 'error') {
        throw new Error(data.message);
    }

    saveToCache(data);
    initializeApp(data);

  } catch (error) {
      handleError(error); 
  }
}

// --- Loading Animation & Transition ---

function startLoadingAnimation(mode) {
  const delays = (mode === 'smart') 
    ? [{ id: 'loading-text-1', delay: 0 }, { id: 'loading-text-2', delay: 200 }, { id: 'loading-text-3', delay: 400 }, { id: 'loading-text-4', delay: 600 }, { id: 'loading-text-5', delay: 800 }]
    : [{ id: 'loading-text-1', delay: 1000 }, { id: 'loading-text-2', delay: 1900 }, { id: 'loading-text-3', delay: 2800 }, { id: 'loading-text-4', delay: 3800 }, { id: 'loading-text-5', delay: 4600 }];
  
  delays.forEach(item => {
            setTimeout(() => {
              const element = document.getElementById(item.id);
              if (element) {
                  // 強制的に表示させるためのスタイルを複数適用
                  element.classList.remove('opacity-0');
                  element.classList.remove('hidden'); 
                  element.style.opacity = '1';
                  element.style.display = 'inline'; // ← inlineに変更（これで横並びになります）
                  element.style.visibility = 'visible';
              }
            }, item.delay);
          });

  setTimeout(() => {
    finishLoading();
  }, (mode === 'smart' ? 1200 : 5500));
}

function finishLoading() {
  if (isLoadingFinished) return;
  isLoadingFinished = true;

  startConfetti();
  const loadingDiv = document.getElementById('loading-container');
  if (loadingDiv) {
      loadingDiv.classList.add('fade-out');
      setTimeout(() => { loadingDiv.style.display = 'none'; }, 500);
  }
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
      mainContent.style.opacity = '1';
  }
  setTimeout(checkTodayEvents, 800);
  
  if (animationFinishedResolver) animationFinishedResolver();
}

function initializeApp(data) {
  allLiveRecords = data.liveRecords || [];
  albumData = data.albumData || [];
  songData = data.songData || {};
  historyData = data.historyData || []; 
  listData = data.listData || [];

  const updateEl = document.getElementById('last-update-date');
  if (updateEl) {
    if (data.lastUpdate) {
        updateEl.textContent = data.lastUpdate;
    } else if (allLiveRecords.length > 0) {
        try {
            const latestDate = allLiveRecords.reduce((latest, rec) => {
                const d = new Date(rec.date);
                return d > latest ? d : latest;
            }, new Date(0));
            
            if (!isNaN(latestDate.getTime())) {
                updateEl.textContent = `${latestDate.getFullYear()}/${('0' + (latestDate.getMonth() + 1)).slice(-2)}/${('0' + latestDate.getDate()).slice(-2)}`;
            }
        } catch(e) { console.error(e); }
    }
  }

  analyzeSongStats(allLiveRecords);
  analyzePatterns(allLiveRecords);
  populateFilters(allLiveRecords);
  
  if (historyData.length > 0) {
      renderHistoryTab();
  }

  const searchInput = document.getElementById('search-input');
  if (searchInput && !searchInput.hasAttribute('data-listener-attached')) {
    setupEventListeners();
    searchInput.setAttribute('data-listener-attached', 'true');
  }

  applyFilters();
  checkOrientation();
  window.addEventListener('resize', checkOrientation);

  renderLiveCountChart();
  renderTotalLiveCategorySummary();
  renderAlbumChart();
  renderSongRanking(); 
  renderPatternStats();
  renderVenueRanking();
  renderVenueLiveCountChart();

  const loadingDiv = document.getElementById('loading-container');
  if (loadingDiv && loadingDiv.style.display === 'none') {
      checkTodayEvents();
  }
  
  if (appInitializedResolver) appInitializedResolver();
}

// --- Helper Functions ---

function formatTourName(name) {
  if (!name) return "";
  let n = name;
  
  n = n.split(/[〜~]/)[0];
  
  if (n.match(/Love Like (Pop|Rock|Aloha)/i)) {
      n = n.replace(/Love Like /i, '');
      n = n.replace(/ vol\.?/i, ''); 
      n = n.replace(/追加公演/g, ''); 
      n = n.trim();
      n = n.replace(/\s+/g, '');
  }
  return n.trim();
}

// -----------------------------------------------------------
// Chart & Visualization
// -----------------------------------------------------------

const chartCommonOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { font: { size: 10 } } },
    y: { ticks: { font: { size: 10 } } }
  }
};

function renderAlbumChart() {
  const canvas = document.getElementById('album-chart');
  if (!canvas || !albumData.length) return;
  if (chartInstances.album) {
    chartInstances.album.destroy();
    chartInstances.album = null;
  }
  chartInstances.album = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: albumData.map(item => item.albumName),
      datasets: [{
        label: '演奏回数',
        data: albumData.map(item => item.playCount),
        backgroundColor: 'rgba(255, 105, 180, 0.8)',
        borderColor: 'rgba(255, 105, 180, 1)',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      ...chartCommonOptions,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        datalabels: {
          color: 'white',
          anchor: 'end',
          align: 'start',
          offset: 4,
          font: { weight: 'bold', size: 11 },
          formatter: (value) => value > 0 ? value : ''
        }
      },
      scales: {
        x: { beginAtZero: true, ticks: { font: { size: 10 } } },
        y: { ticks: { font: { size: 10 }, autoSkip: false } }
      }
    },
    plugins: [ChartDataLabels]
  });
}

function renderLiveCountChart() {
  const canvas = document.getElementById('live-count-chart');
  if (!canvas) return;
  if (chartInstances.liveCount) chartInstances.liveCount.destroy();

  const songToSearch = document.getElementById('song-search-input').value.trim();
  const isMedleyIncluded = document.getElementById('medley-toggle').checked;

  const years = [];
  const breakdown = { pop: {}, rock: {}, aloha: {}, other: {}, total: {} };
  
  allLiveRecords.forEach(rec => {
    if(!rec.year) return;
    if(!breakdown.total[rec.year]) {
      years.push(rec.year);
      breakdown.total[rec.year] = 0;
      breakdown.pop[rec.year] = 0;
      breakdown.rock[rec.year] = 0;
      breakdown.aloha[rec.year] = 0;
      breakdown.other[rec.year] = 0;
    }
    breakdown.total[rec.year]++;
  });
  years.sort((a,b) => a - b);

  allLiveRecords.forEach(rec => {
    if(!rec.year) return;
    
    let isCounted = false;

    if (songToSearch) {
      let inMedley = false;
      let count = 0;
      rec.setlist.forEach(s => {
        if (s === '__MEDLEY_START__') { inMedley = true; return; }
        if (s === '__MEDLEY_END__') { inMedley = false; return; }
        if (!isMedleyIncluded && inMedley) return;
        
        const clean = s.replace(/_アンコール/g, '').replace(/#\d+$/g, '').trim();
        if (clean.toLowerCase() === songToSearch.toLowerCase()) count++;
      });
      if(count > 0) isCounted = true;
    } else {
      isCounted = true;
    }

    if (isCounted) {
      const name = rec.tourName.toLowerCase();
      if (name.includes('pop')) breakdown.pop[rec.year]++;
      else if (name.includes('rock')) breakdown.rock[rec.year]++;
      else if (name.includes('aloha')) breakdown.aloha[rec.year]++;
      else breakdown.other[rec.year]++;
    }
  });

  const getDatalabelsConfig = () => ({
    display: (ctx) => {
      const dsIndex = ctx.datasetIndex;
      const dataIndex = ctx.dataIndex;
      const datasets = ctx.chart.data.datasets;
      if (datasets[dsIndex].data[dataIndex] === 0) return false;
      for (let i = dsIndex + 1; i <= 3; i++) {
        if (datasets[i].data[dataIndex] > 0) return false;
      }
      return true;
    },
    color: 'gray', anchor: 'end', align: 'end', offset: -2,
    font: { size: 10, weight: 'bold' },
    formatter: (value, ctx) => {
      const idx = ctx.dataIndex;
      const ds = ctx.chart.data.datasets;
      return ds[0].data[idx] + ds[1].data[idx] + ds[2].data[idx] + ds[3].data[idx];
    }
  });

  const datalabelsConfig = getDatalabelsConfig();

  const datasets = [
    { label: 'Pop', data: years.map(y => breakdown.pop[y]), backgroundColor: THEME_COLORS.POP, stack: 'stack1', borderRadius: 2, datalabels: datalabelsConfig },
    { label: 'Rock', data: years.map(y => breakdown.rock[y]), backgroundColor: THEME_COLORS.ROCK, stack: 'stack1', borderRadius: 2, datalabels: datalabelsConfig },
    { label: 'Aloha', data: years.map(y => breakdown.aloha[y]), backgroundColor: THEME_COLORS.ALOHA, stack: 'stack1', borderRadius: 2, datalabels: datalabelsConfig },
    { label: 'Other', data: years.map(y => breakdown.other[y]), backgroundColor: THEME_COLORS.EVENT, stack: 'stack1', borderRadius: 2, datalabels: datalabelsConfig }
  ];

  if (songToSearch) {
    datasets.push({
      label: '未演奏',
      data: years.map(y => {
        const played = breakdown.pop[y] + breakdown.rock[y] + breakdown.aloha[y] + breakdown.other[y];
        return Math.max(0, breakdown.total[y] - played);
      }),
      backgroundColor: THEME_COLORS.BG_GRAY_ALPHA,
      borderColor: THEME_COLORS.BG_GRAY_ALPHA,
      borderWidth: 1,
      stack: 'stack1',
      datalabels: { display: false }
    });
  }

  chartInstances.liveCount = new Chart(canvas, {
    type: 'bar',
    data: { labels: years, datasets: datasets },
    plugins: [ChartDataLabels],
    options: {
      ...chartCommonOptions,
      scales: {
        x: { stacked: true, ticks: { font: { size: 10 }, maxRotation: 90, minRotation: 90, autoSkip: false } },
        y: { stacked: true, beginAtZero: true, min: 0, ticks: { font: { size: 10 }, stepSize: 5 } }
      }
    }
  });
}

function renderTotalLiveCategorySummary(targetSong = null) {
  // 文言更新
  const labelEl = document.getElementById('song-stats-label');
  if (labelEl) labelEl.textContent = targetSong ? 'この曲の演奏回数' : '全ライブ開催回数';

  let targetRecords = allLiveRecords;
  
  if (targetSong) {
    const isMedleyIncluded = document.getElementById('medley-toggle').checked;
    targetRecords = allLiveRecords.filter(rec => {
      let count = 0;
      let inMedley = false;
      rec.setlist.forEach(s => {
        if (s === '__MEDLEY_START__') { inMedley = true; return; }
        if (s === '__MEDLEY_END__') { inMedley = false; return; }
        if (!isMedleyIncluded && inMedley) return;
        const clean = s.replace(/_アンコール/g, '').replace(/#\d+$/g, '').trim();
        if (clean === targetSong) count++;
      });
      return count > 0;
    });
  }

  const totalCount = targetRecords.length;
  document.getElementById('total-held-lives').textContent = totalCount;

  const counts = { pop: 0, rock: 0, aloha: 0, other: 0 };
  targetRecords.forEach(rec => {
    const name = rec.tourName.toLowerCase();
    if (name.includes('pop')) counts.pop++;
    else if (name.includes('rock')) counts.rock++;
    else if (name.includes('aloha')) counts.aloha++;
    else counts.other++;
  });

  // 改修: 色指定をクラス名に変更 (CSSで定義)
  document.getElementById('live-category-counts').innerHTML = `
    <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-base">
      <p class="text-pop truncate">・Pop: ${counts.pop}</p>
      <p class="text-aloha truncate">・Aloha: ${counts.aloha}</p>
      <p class="text-rock truncate">・Rock: ${counts.rock}</p>
      <p class="text-event truncate">・Event: ${counts.other}</p>
    </div>
  `;

  const canvas = document.getElementById('live-category-doughnut');
  if (!canvas) return;
  
  if (chartInstances.liveCategory) chartInstances.liveCategory.destroy();

  chartInstances.liveCategory = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Pop', 'Rock', 'Aloha', 'Other'],
      datasets: [{
        data: [counts.pop, counts.rock, counts.aloha, counts.other],
        backgroundColor: [THEME_COLORS.POP, THEME_COLORS.ROCK, THEME_COLORS.ALOHA, THEME_COLORS.EVENT],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } }
    }
  });
}

function renderVenueLiveCountChart() {
  const canvas = document.getElementById('venue-live-count-chart');
  if (!canvas) return;
  if (chartInstances.venueLiveCount) chartInstances.venueLiveCount.destroy();

  const liveCountsByYear = allLiveRecords.reduce((acc, rec) => {
    if (rec.year) acc[rec.year] = (acc[rec.year] || 0) + 1;
    return acc;
  }, {});

  const selectedPlaysByYear = {};
  if (selectedVenueInfo) {
    allLiveRecords.forEach(rec => {
      if (!rec.year) return;
      let isMatch = false;
      if (selectedVenueInfo.type === 'venue') {
        const venueKey = rec.region === 'オンライン' ? 'オンライン' : `${rec.venue} (${rec.region})`;
        if (venueKey === selectedVenueInfo.name) isMatch = true;
      } else if (selectedVenueInfo.type === 'region') {
        if (rec.region === selectedVenueInfo.name) isMatch = true;
      }
      if (isMatch) selectedPlaysByYear[rec.year] = (selectedPlaysByYear[rec.year] || 0) + 1;
    });
  }

  const years = Object.keys(liveCountsByYear).sort((a, b) => a - b);
  const totalLiveData = years.map(year => liveCountsByYear[year]);
  const selectedPlayData = years.map(year => selectedPlaysByYear[year] || 0);

  const datasets = [{
    label: '選択場所',
    data: selectedPlayData,
    backgroundColor: 'rgba(255, 105, 180, 0.8)',
    borderColor: 'rgba(255, 105, 180, 1)',
    borderWidth: 1,
    stack: 'stack1',
    datalabels: {
      display: ctx => ctx.dataset.data[ctx.dataIndex] > 0,
      color: 'gray',
      anchor: 'end',
      align: 'end',
      offset: -2,
      font: { size: 10, weight: 'bold' },
      formatter: val => val
    }
  }, {
    label: 'その他',
    data: totalLiveData.map((total, i) => Math.max(0, total - selectedPlayData[i])),
    backgroundColor: THEME_COLORS.BG_GRAY_ALPHA,
    borderColor: 'rgba(229, 231, 235, 1)',
    borderWidth: 1,
    stack: 'stack1',
    datalabels: { display: false }
  }];

  chartInstances.venueLiveCount = new Chart(canvas, {
    type: 'bar',
    data: { labels: years, datasets },
    plugins: [ChartDataLabels],
    options: {
      ...chartCommonOptions,
      scales: {
        x: {
          stacked: true,
          ticks: { font: { size: 10 }, maxRotation: 90, minRotation: 90, autoSkip: false }
        },
        y: { stacked: true, beginAtZero: true, min: 0, ticks: { font: { size: 10 }, stepSize: 5 } }
      }
    }
  });
}

function renderHeatmap(setlist) {
  const container = document.getElementById('heatmap-container');
  if (!container) return;

  const startYear = 1998;
  const endYear = new Date().getFullYear();
  
  // ヒートマップ用のデータ集計 (数だけでなく曲名も保持するように変更)
  const counts = { '表題曲': {}, 'カップリング曲': {}, 'アルバム曲': {} };
  
  setlist.forEach(s => {
    if (!s || s === '__MEDLEY_START__' || s === '__MEDLEY_END__') return;
    const clean = s.replace(/_アンコール(?: #\d+)?/g, '').replace(/#\d+$/g, '').trim();
    const info = songData[clean];
    if (!info || !info.year) return;

    let type = 'その他';
    if (info.type) {
          if (info.type.includes('表題') || info.type.includes('シングル')) type = '表題曲';
          else if (info.type.includes('カップリング') || info.type.includes('C/W') || info.type.includes('B面')) type = 'カップリング曲';
          else if (info.type.includes('アルバム') || info.type.includes('Album')) type = 'アルバム曲';
    }
    
    if (counts[type]) {
        // オブジェクト初期化 { count: 0, songs: [] }
        if (!counts[type][info.year]) counts[type][info.year] = { count: 0, songs: [] };
        counts[type][info.year].count++;
        counts[type][info.year].songs.push(clean);
    }
  });

  // ライブ開催年を取得（未来判定用）
  const liveYear = currentDisplayingRecord && currentDisplayingRecord.year ? parseInt(currentDisplayingRecord.year) : endYear;

  // HTML生成
  let html = '<div class="flex items-end justify-between w-full pt-2 gap-px">';
  
  for (let y = startYear; y <= endYear; y++) {
     const dTitle = counts['表題曲'][y] || { count: 0, songs: [] };
     const dCW = counts['カップリング曲'][y] || { count: 0, songs: [] };
     const dAlbum = counts['アルバム曲'][y] || { count: 0, songs: [] };

     // 濃さの計算
     const getOpacity = (c) => c >= 3 ? 1 : c === 2 ? 0.7 : c === 1 ? 0.4 : 0.05;
     
     const colorTitle = `rgba(255, 105, 180, ${getOpacity(dTitle.count)})`;
     const colorCW    = `rgba(59, 130, 246, ${getOpacity(dCW.count)})`;
     const colorAlbum = `rgba(234, 179, 8, ${getOpacity(dAlbum.count)})`;

     // セルのスタイル
     const cellBase = "w-full h-5 flex items-center justify-center text-[8px] font-bold text-gray-700 leading-none select-none rounded-[1px] overflow-hidden cursor-pointer";
     
     const isFuture = y > liveYear;
     const emptyStyle = isFuture 
        ? "background-color: #d1d5db; color: transparent; cursor: default;" 
        : "background-color: #f3f4f6; color: transparent; cursor: default;";

     html += `<div class="flex flex-col gap-px flex-1">`;

     // クリック時のアクション生成関数
      const getOnClick = (year, type, data) => {
        if (data.count === 0) return '';
        
        // 1行目: XXXX年 [タイプ]
        let msg = `${year}年 ${type}`;

        // カップリング曲またはアルバム曲の場合、収録元ごとにグループ化
        if (type === 'カップリング曲' || type === 'アルバム曲') {
           const groups = {}; // { 'タイトル': [曲名, 曲名...] }

           data.songs.forEach(song => {
             const info = songData[song];
             let sourceTitle = '';
             
             // シングル/アルバムタイトルを取得
             if (info) {
                if (type === 'カップリング曲') sourceTitle = info.singleTitle;
                else if (type === 'アルバム曲') sourceTitle = info.albumTitle;
             }
             
             // タイトルがない場合は「不明」などにせず空文字扱いでグループ化
             const key = sourceTitle || 'その他';
             if (!groups[key]) groups[key] = [];
             groups[key].push(song);
           });

           // フォーマットに従ってメッセージを作成
           Object.keys(groups).forEach(src => {
              msg += `\\n\\n`;
              // タイトルがある場合は『』で囲んで表示
              if (src !== 'その他') {
                  msg += `『${src}』に収録の\\n`;
              }
              msg += groups[src].map(s => `・${s}`).join('\\n');
           });

        } else {
           // 表題曲などは今まで通り単純リスト
           msg += `\\n` + data.songs.map(s => `・${s}`).join('\\n');
        }

        return `onclick="alert('${msg}')"`;
      };

     // 上段: 表題
     let styleTitle = dTitle.count > 0 ? `background-color:${colorTitle}; color:${dTitle.count >= 3 ? 'white' : 'inherit'}` : emptyStyle;
     html += `<div class="${cellBase}" style="${styleTitle}" ${getOnClick(y, '表題曲', dTitle)}>${dTitle.count > 0 ? dTitle.count : ''}</div>`;
     
     // 中段: カップリング
     let styleCW = dCW.count > 0 ? `background-color:${colorCW}; color:${dCW.count >= 3 ? 'white' : 'inherit'}` : emptyStyle;
     html += `<div class="${cellBase}" style="${styleCW}" ${getOnClick(y, 'カップリング曲', dCW)}>${dCW.count > 0 ? dCW.count : ''}</div>`;
     
     // 下段: アルバム
     let styleAlbum = dAlbum.count > 0 ? `background-color:${colorAlbum}; color:${dAlbum.count >= 3 ? 'white' : 'inherit'}` : emptyStyle;
     html += `<div class="${cellBase}" style="${styleAlbum}" ${getOnClick(y, 'アルバム曲', dAlbum)}>${dAlbum.count > 0 ? dAlbum.count : ''}</div>`;

     // 年ラベル (修正: グラフに合わせてサイズ10px、色を濃く、フォントを標準に変更)
     html += `<div class="w-full h-10 relative mt-1"><div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-[10px] text-gray-500 whitespace-nowrap">${y}</div></div>`;

     html += `</div>`;
  }
  html += '</div>';
  container.innerHTML = html;
}

// -----------------------------------------------------------
// Analysis & Ranking
// -----------------------------------------------------------

function analyzeSongStats(records) {
  songStats = {};
  songStatsNoMedley = {};
  songLastYears = {};
  songLastYearsNoMedley = {};

  if (songData) {
    Object.keys(songData).forEach(songName => {
      if (!songName.includes('[') && !songName.includes(']')) {
        songStats[songName] = 0;
        songStatsNoMedley[songName] = 0;
        songLastYears[songName] = 0;
        songLastYearsNoMedley[songName] = 0;
      }
    });
  }

  records.forEach(rec => {
    let inMedley = false;
    const currentYear = parseInt(rec.year);

    rec.setlist.forEach(s => {
      if (s === '__MEDLEY_START__') { inMedley = true; return; }
      if (s === '__MEDLEY_END__') { inMedley = false; return; }

      const clean = s.replace(/_アンコール/g, '').replace(/#\d+$/g, '').trim();

      if (clean && clean !== 'メドレー' && !clean.includes('[') && !clean.includes(']')) {
        songStats[clean] = (songStats[clean] || 0) + 1;
        if (!songLastYears[clean] || currentYear > songLastYears[clean]) {
          songLastYears[clean] = currentYear;
        }

        if (!inMedley) {
          songStatsNoMedley[clean] = (songStatsNoMedley[clean] || 0) + 1;
          if (!songLastYearsNoMedley[clean] || currentYear > songLastYearsNoMedley[clean]) {
            songLastYearsNoMedley[clean] = currentYear;
          }
        }
      }
    });
  });
}

function analyzePatterns(records) {
  const o = {}, e = {}, l = {};
  records.forEach(rec => {
    const cleanSetlist = [];
    let inMedley = false;
    
    rec.setlist.forEach(s => {
        if (s === '__MEDLEY_START__') { inMedley = true; return; }
        if (s === '__MEDLEY_END__') { inMedley = false; return; }
        
        if (inMedley) return;

        const clean = s.replace(/_アンコール/g, '').replace(/#\d+$/g, '').trim();
        if (clean && clean !== 'メドレー' && !clean.includes('[') && !clean.includes(']')) {
            cleanSetlist.push(clean);
        }
    });

    if (cleanSetlist.length > 0) {
        o[cleanSetlist[0]] = (o[cleanSetlist[0]] || 0) + 1;
        l[cleanSetlist[cleanSetlist.length - 1]] = (l[cleanSetlist[cleanSetlist.length - 1]] || 0) + 1;
    }

    let inMedleyForEncore = false;
    rec.setlist.forEach(s => {
        if (s === '__MEDLEY_START__') { inMedleyForEncore = true; return; }
        if (s === '__MEDLEY_END__') { inMedleyForEncore = false; return; }
        if (inMedleyForEncore) return;
        
        if (s.includes('_アンコール')) {
            const clean = s.replace(/_アンコール/g, '').replace(/#\d+$/g, '').trim();
            if (clean && clean !== 'メドレー' && !clean.includes('[') && !clean.includes(']')) {
                e[clean] = (e[clean] || 0) + 1;
            }
        }
    });
  });
  patternStats = { openingSongs: o, encoreSongs: e, lastSongs: l };
}

// -----------------------------------------------------------
// Filters & UI List Generation
// -----------------------------------------------------------

function populateFilters(records, skipApply = false) {
  const yearSelect = document.getElementById('year-select');
  const regionSelect = document.getElementById('region-select');
  const years = new Set(), regions = new Set();
  records.forEach(rec => {
    if (rec.year) years.add(rec.year);
    if (rec.region) regions.add(rec.region);
  });

  const createOptions = (select, current, data, suffix) => {
    select.innerHTML = `<option value="">すべての${suffix}</option>`;
    data.forEach(item => {
      select.innerHTML += `<option value="${item}" ${item == current ? 'selected' : ''}>${item}${suffix === '年' ? '年' : ''}</option>`;
    });
  };

  createOptions(yearSelect, yearSelect.value, Array.from(years).sort((a, b) => b - a), '年');
  
  const prefectureOrder = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県", "オンライン"
  ];

  createOptions(regionSelect, regionSelect.value, Array.from(regions).sort((a, b) => {
      let ia = prefectureOrder.indexOf(a);
      let ib = prefectureOrder.indexOf(b);
      if (ia === -1) ia = 999;
      if (ib === -1) ib = 999;
      return ia - ib;
  }), '都道府県');
  if (!skipApply) applyFilters();
}

function applyFilters() {
  const songFilterInput = document.getElementById('song-filter-input');
  let songFilterValue = songFilterInput.value;
  songFilterValue = songFilterValue.replace('（楽曲タブから選択）', '').replace('　※楽曲タブから選択', '').replace('(メドレー除外)', '');

  const isMedleyIncluded = document.getElementById('medley-toggle').checked;
  const isAttendedOnly = document.getElementById('attended-filter-toggle').checked;

  const filters = {
    search: document.getElementById('search-input').value.toLowerCase(),
    tour: document.getElementById('tour-select').value,
    year: document.getElementById('year-select').value,
    region: document.getElementById('region-select').value,
    song: songFilterValue.toLowerCase(),
  };

  const searchInputVal = document.getElementById('search-input').value.trim();
  const searchLower = searchInputVal.toLowerCase();
  
  const isExactTourMatch = searchInputVal && allLiveRecords.some(r => 
    r.tourName.toLowerCase() === searchLower || 
    (r.shortTourName && r.shortTourName.toString().toLowerCase() === searchLower)
  );

  const filteredRecords = allLiveRecords.filter(rec => {
    if (isAttendedOnly) {
       if (!userUserData.attendedLives || !userUserData.attendedLives[rec.date]) {
           return false;
       }
    }

    const tourName = rec.tourName.toLowerCase();
    let tourMatch = true;
    if (filters.tour === 'pop') tourMatch = tourName.includes('love like pop');
    else if (filters.tour === 'rock') tourMatch = tourName.includes('love like rock');
    else if (filters.tour === 'aloha') tourMatch = tourName.includes('love like aloha');
    else if (filters.tour === 'other') tourMatch = !/love like (pop|rock|aloha)/.test(tourName);

    let songMatch = true;
    if (filters.song) {
        if (isMedleyIncluded) {
            songMatch = rec.setlist.some(s => s.replace(/_アンコール/g, '').replace(/#\d+$/g, '').trim().toLowerCase() === filters.song);
        } else {
            let inMedley = false;
            let found = false;
            for (const s of rec.setlist) {
                if (s === '__MEDLEY_START__') { inMedley = true; continue; }
                if (s === '__MEDLEY_END__') { inMedley = false; continue; }
                if (inMedley) continue; 
                const clean = s.replace(/_アンコール/g, '').replace(/#\d+$/g, '').trim().toLowerCase();
                if (clean === filters.song) { found = true; break; }
            }
            songMatch = found;
        }
    }
    
    let searchMatch = true;
    if (filters.search) {
        if (isExactTourMatch) {
            const nameMatch = rec.tourName.toLowerCase() === filters.search;
            const shortNameMatch = rec.shortTourName && rec.shortTourName.toString().toLowerCase() === filters.search;
            searchMatch = nameMatch || shortNameMatch;
        } else {
            const targets = [
                rec.tourName,
                rec.shortTourName || '',
                rec.date,
                rec.venue,
                rec.region
            ].join(' ').toLowerCase();
            searchMatch = targets.includes(filters.search);
        }
    }

    return tourMatch && songMatch && searchMatch &&
      (!filters.year || rec.year == filters.year) &&
      (!filters.region || rec.region == filters.region);
  });

  document.getElementById('display-count').textContent = filteredRecords.length;
  document.getElementById('total-count').textContent = allLiveRecords.length;
  
  if (filters.search && filters.search.length > 0) {
    safeTrackEvent('search', { search_term: filters.search, search_category: 'live_search' });
  }

  renderLiveList(filteredRecords);
}

function renderLiveList(records) {
  const container = document.getElementById('live-list-container');
  container.innerHTML = '';
  if (!records.length) {
    container.innerHTML = '<p class="text-center text-gray-500 py-8 text-sm">該当する公演が見つかりませんでした。</p>';
    return;
  }

  records.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(rec => {
    const tourNameLower = rec.tourName.toLowerCase();
    let labelType = 'other', labelText = 'Event';
    if (tourNameLower.includes('love like pop')) { labelType = 'pop'; labelText = 'POP'; }
    else if (tourNameLower.includes('love like rock')) { labelType = 'rock'; labelText = 'ROCK'; }
    else if (tourNameLower.includes('love like aloha')) { labelType = 'aloha'; labelText = 'ALOHA'; }

    const isAttended = userUserData.attendedLives && userUserData.attendedLives[rec.date];

    const card = document.createElement('div');
    card.className = 'card-base live-card cursor-pointer hover:shadow-md transition bg-white';
    card.innerHTML = `
      <div class="live-card-label ${labelType}">${labelText}</div>
      <div class="flex items-center gap-2 mt-1">
          <p class="text-gray-500 font-medium text-xs">${rec.date} (${rec.dayOfWeek})</p>
          ${isAttended ? '<span class="attended-badge" style="margin-left:0;"><i data-lucide="check" class="w-3 h-3"></i> 参戦</span>' : ''}
      </div>
      <p class="font-bold mt-1 text-gray-800 text-lg leading-tight">${rec.tourName}</p>
      <p class="text-gray-600 text-sm mt-1">${rec.venue} (${rec.region})</p>
      <p class="mt-2 font-semibold text-aiko-pink text-sm">セットリスト: ${rec.songCount}曲</p>`;
    card.onclick = () => showLiveDetail(rec);
    container.appendChild(card);
  });
  lucide.createIcons();
}

// -----------------------------------------------------------
// Detailed Views
// -----------------------------------------------------------

function showLiveDetail(rec) {
  safeTrackEvent('select_content', { content_type: 'live_detail', item_id: rec.date, item_name: rec.tourName });

  lastScrollPosition = document.getElementById('app').scrollTop;

  document.body.classList.add('detail-view');
  currentDisplayingRecord = rec;

  document.querySelectorAll('.tab-content, nav').forEach(el => el.style.display = 'none');

  let backBtn = document.getElementById('back-button-fixed');
  if (!backBtn) {
    backBtn = document.createElement('div');
    backBtn.id = 'back-button-fixed';
    backBtn.className = 'back-button-circle';
    backBtn.innerHTML = '<i data-lucide="arrow-left"></i>';
    document.body.appendChild(backBtn);
    backBtn.onclick = hideDetailView;
  }
  backBtn.style.display = 'flex';

  const detailContainer = document.getElementById('live-detail');
  detailContainer.style.display = 'block';

  const userData = (userUserData.attendedLives && userUserData.attendedLives[rec.date]) || null;
  const isAttended = !!userData;
  const memo = userData ? userData.memo : '';

  const linkify = (text) => {
      if(!text) return '';
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline break-all">$1</a>');
  };

  let memoHtml = '';
  if (isAttended) {
      if (memo) {
          memoHtml = `
            <div class="user-memo-area has-content clickable-item" onclick="openMemoModal()">
                <div class="memo-edit-btn"><i data-lucide="edit-3" class="w-3 h-3 inline"></i> 編集</div>
                <div class="memo-content">${linkify(memo)}</div>
            </div>`;
      } else {
          memoHtml = `
            <div class="user-memo-area clickable-item" onclick="openMemoModal()">
                <div class="memo-placeholder" style="pointer-events:none;">
                    <i data-lucide="edit-3" class="w-4 h-4 inline mb-1"></i><br>
                    タップしてメモやリンクを記録
                </div>
            </div>`;
      }
  }

  const toggleText = isAttended 
      ? '参戦しました！<br><span class="text-[10px] font-normal text-gray-400">【注意】オフにするとメモが消えるよ。</span>' 
      : '参戦記録をつける';

  const attendanceHtml = `
    <div class="attendance-toggle-container">
        <div class="attendance-toggle-label">
            <i data-lucide="${isAttended ? 'check-circle-2' : 'circle'}" class="w-5 h-5 ${isAttended ? 'text-green-600' : 'text-gray-300'}"></i>
            <span class="leading-tight">${toggleText}</span>
        </div>
        <div class="relative inline-block align-middle select-none">
            <input type="checkbox" id="detail-attendance-toggle" class="toggle-checkbox" ${isAttended ? 'checked' : ''} onchange="toggleAttendance(this.checked)"/>
            <label for="detail-attendance-toggle" class="toggle-label"></label>
        </div>
    </div>
    ${memoHtml}
  `;

  const minYear = 1998;
  const maxYear = new Date().getFullYear();

  function normalizeType(rawType) {
    if (!rawType) return 'その他';
    if (rawType.includes('表題') || rawType.includes('シングル')) return '表題曲';
    if (rawType.includes('カップリング') || rawType.includes('C/W') || rawType.includes('B面')) return 'カップリング曲';
    if (rawType.includes('アルバム') || rawType.includes('Album')) return 'アルバム曲';
    return 'その他';
  }

  function createTimelineHtml(songName) {
    const songInfo = songData[songName];
    if (!songInfo || !songInfo.year) return '';
    const songYear = songInfo.year;
    
    // 位置計算
    let percent = ((songYear - minYear) / (maxYear - minYear)) * 100;
    percent = Math.max(0, Math.min(100, percent));

    // タイプ判定と行の決定
    const type = normalizeType(songInfo.type);
    let row = 3; 
    let dotColor = '#D1D5DB';

    // 修正: 色を成分分布図の「1回演奏(濃度0.4)」と同じ薄さに変更
    if (type === '表題曲') {
      row = 0;
      dotColor = 'rgba(255, 105, 180, 0.4)';
    } else if (type === 'カップリング曲') {
      row = 1;
      dotColor = 'rgba(59, 130, 246, 0.4)';
    } else if (type === 'アルバム曲') {
      row = 2;
      dotColor = 'rgba(234, 179, 8, 0.4)';
    }

    if (row === 3) return ''; 

    // スタイル定義
    // 修正: 高さは24pxのまま維持
    const containerStyle = 'position:relative; width:100%; height:24px; display:flex; flex-direction:column; justify-content:space-between; margin-top:0px; cursor:pointer;'; 
    // 修正: ライン7px
    const lineStyle = 'width:100%; height:7px; background-color:#f3f4f6; border-radius:1px;';
    
    // 修正: マーカー位置 (row * 8.5px)
    const topPos = row * 8.5; 
    // 修正: マーカー高さ7px
    const markerStyle = `position:absolute; left:${percent}%; top:${topPos}px; width:6px; height:7px; background-color:${dotColor}; border-radius:1px; z-index:2;`;

    // 吹き出し（ツールチップ）のスタイル
    const tooltipStyle = 'position:absolute; bottom:100%; left:50%; transform:translateX(-50%); margin-bottom:4px; padding:2px 6px; background:rgba(0,0,0,0.8); color:#fff; font-size:10px; border-radius:3px; white-space:nowrap; display:none; z-index:10; pointer-events:none;';

    // クリックで吹き出し表示をトグルする
    return `
      <div class="timeline-container" style="height:auto; padding:0; background:transparent;" onclick="const t=this.querySelector('.tooltip'); t.style.display = (t.style.display==='none') ? 'block' : 'none'; event.stopPropagation();">
        <div style="${containerStyle}">
          <div style="${lineStyle}"></div>
          <div style="${lineStyle}"></div>
          <div style="${lineStyle}"></div>
          <div style="${markerStyle}">
             <div class="tooltip" style="${tooltipStyle}">${songYear}</div>
          </div>
        </div>
      </div>`;
  }

  let setlistHtml = '', songNum = 1, inMedley = false, medleyNum = 1, encoreNum = 0;
  let typeCounts = { '表題曲': 0, 'カップリング曲': 0, 'アルバム曲': 0, 'その他': 0 };
  
  rec.setlist.forEach((s, idx) => {
    if (!s || !s.trim()) return;
    if (s === '__MEDLEY_END__') { inMedley = false; return; }
    if (s === '__MEDLEY_START__') {
      const nextSongIsEncore = idx + 1 < rec.setlist.length && rec.setlist[idx + 1].includes('_アンコール');
      if (nextSongIsEncore) {
        let currentEncore = rec.setlist[idx+1].includes('#3') ? 3 : rec.setlist[idx+1].includes('#2') ? 2 : 1;
        if (currentEncore > encoreNum) {
          encoreNum = currentEncore;
          setlistHtml += `<div class="setlist-encore-header">アンコール ${'👏'.repeat(encoreNum)}</div>`;
        }
      }
      inMedley = true;
      setlistHtml += `<div class="setlist-item setlist-medley-title${nextSongIsEncore ? ' setlist-encore' : ''}" style="justify-content: flex-start;"><div class="setlist-left-content"><span class="setlist-item-number">${songNum++}.</span><span class="setlist-item-title">メドレー</span></div></div>`;
      medleyNum = 1;
      return;
    }

    const cleanSong = s.replace(/_アンコール(?: #\d+)?/g, '').trim();
    const songInfo = songData[cleanSong];
    if (songInfo) {
      const normalizedType = normalizeType(songInfo.type);
      if (typeCounts[normalizedType] !== undefined) typeCounts[normalizedType]++;
      else typeCounts['その他']++;
    }

    let currentEncore = s.includes('_アンコール') ? (s.includes('#3') ? 3 : s.includes('#2') ? 2 : 1) : 0;
    if (currentEncore > encoreNum && !inMedley) {
      encoreNum = currentEncore;
      setlistHtml += `<div class="setlist-encore-header">アンコール ${'👏'.repeat(encoreNum)}</div>`;
    }

    const timeline = createTimelineHtml(cleanSong);

    // --- ジャケット画像エリア生成 (Start) ---
    let jacketsHtml = '';
    if (songInfo) {
      // 共通スタイル (長押し・選択・ドラッグを無効化するスタイルを追加)
      const imgStyle = 'width:24px; height:24px; border-radius:3px; object-fit:cover; display:block; box-shadow: 0 1px 2px rgba(0,0,0,0.1); background-color:#f1f5f9; pointer-events: none; -webkit-touch-callout: none; user-select: none; -webkit-user-drag: none;';
      const spacerStyle = 'width:24px; height:24px; display:block;';

      // シングル画像 (青位置)
      const sImg = songInfo.imgS ? `<img src="${songInfo.imgS}" style="${imgStyle}" loading="lazy" alt="S">` : `<span style="${spacerStyle}"></span>`;
      
      // アルバム画像 (赤位置)
      const aImg = songInfo.imgA ? `<img src="${songInfo.imgA}" style="${imgStyle}" loading="lazy" alt="A">` : `<span style="${spacerStyle}"></span>`;

      // 横並びコンテナ (余計なマージンを削除)
      jacketsHtml = `<div style="display:flex; gap:4px; margin-right:8px; flex-shrink:0;">${sImg}${aImg}</div>`;
    } else {
      // songInfoがない場合のスペース確保
      jacketsHtml = `<div style="display:flex; gap:4px; margin-right:8px; flex-shrink:0;"><span style="width:24px;"></span><span style="width:24px;"></span></div>`;
    }
    // --- ジャケット画像エリア生成 (End) ---

    // ★修正: 曲名エリアの幅を「60%」に変更して、画像を少し右へ移動させます。(数字を大きくするとさらに右へ行きます)
    setlistHtml += `<div class="setlist-item${inMedley ? ' setlist-medley' : ''}${currentEncore > 0 ? ' setlist-encore' : ''}"><div class="setlist-left-content" style="width: 60%;"><span class="setlist-item-number">${inMedley ? `(${medleyNum++})` : `${songNum++}.`}</span><span class="setlist-item-title">${cleanSong}</span></div>${jacketsHtml}${timeline}</div>`;
  });

  // 凡例(legendHtml)は削除しました。

  const summaryHtml = `
    <div class="mt-8 mb-4">
      <div class="card-base bg-white p-4 border border-gray-100 shadow-sm">
        <h3 class="font-bold text-gray-700 text-sm mb-2 flex items-center gap-2">📊 成分分布図</h3>
        <!-- 修正: mb-3 を mb-1 に変更して、下のグラフとの余白を狭くしました -->
        <div class="flex flex-wrap gap-x-3 gap-y-1 text-sm font-bold mb-1">
          <span class="text-aiko-pink">● 表題曲: ${typeCounts['表題曲']}</span>
          <span class="text-blue-500">● カップリング曲: ${typeCounts['カップリング曲']}</span>
          <span class="text-yellow-500">● アルバム曲: ${typeCounts['アルバム曲']}</span>
        </div>
        <div id="heatmap-container" class="w-full overflow-hidden pb-2"></div>
      </div>
    </div>`;

  // 修正: 右側に表示していた凡例変数を削除してスッキリさせました
  const setlistHeaderHtml = `<div class="flex justify-between items-end mt-8 mb-2"><h3 class="font-bold text-gray-700 text-lg cursor-pointer flex items-center gap-2" onclick="copySetlist()">🎵 セットリスト</h3></div>`;

  const setlistSection = setlistHtml.trim() 
    ? `${summaryHtml}${setlistHeaderHtml}<div class="card-base shadow-none border border-gray-100 pb-2 bg-white">${setlistHtml}</div>` 
    : `<h3 class="font-bold mb-3 text-gray-700 text-lg">🎵 セットリスト</h3>
       <div class="card-base text-gray-500 text-sm leading-relaxed bg-white">
         この日のセトリがわかる方は　<span class="text-blue-500 underline cursor-pointer font-bold" onclick="if(confirm('セトリ投稿フォームに移動しますか？')){ window.open('https://nokidochibi.github.io/LLDB_SetoriForm/', '_blank'); }">こちら</span>　から教えてください。<br>
         セットリストは　2026年3月4日以降に更新予定です。
       </div>`;

  // ★修正: 終演後ツイートの表示用HTML生成
  let tweetHtml = '';
  if (rec.afterLiveTweet) {
      // 埋め込み用は twitter.com に統一（widgets.jsの互換性のため）
      let embedUrl = rec.afterLiveTweet.replace('x.com', 'twitter.com');
      // リンク用は元のURLを使用（リダイレクトを避けてアプリ起動率を高める）
      let linkUrl = rec.afterLiveTweet;

      tweetHtml = `
        <div class="mt-10 pt-8 border-t border-dashed border-gray-200">
           <h3 class="font-bold text-gray-700 text-lg mb-4 flex items-center gap-2 justify-start">
             <svg viewBox="0 0 24 24" class="w-5 h-5" fill="currentColor" style="color: #000000;">
               <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
             </svg>
             <span style="color: #000000;">After Live</span>
           </h3>

           <div class="relative w-full flex justify-center" style="min-height: 200px;">
             <blockquote class="twitter-tweet" data-lang="ja" data-theme="light" data-align="center">
               <a href="${embedUrl}"></a>
             </blockquote>
             <a href="${linkUrl}" target="_blank" rel="noopener noreferrer" 
                class="absolute inset-0 z-20 w-full h-full cursor-pointer" 
                style="background: transparent;">
             </a>
           </div>
        </div>`;
  }

  // --- 年齢計算ロジック (Start) ---
  const eventDate = new Date(rec.date);
  let aikoAge = eventDate.getFullYear() - AIKO_BIRTH.getFullYear();
  if (eventDate.getMonth() < AIKO_BIRTH.getMonth() || (eventDate.getMonth() === AIKO_BIRTH.getMonth() && eventDate.getDate() < AIKO_BIRTH.getDate())) {
    aikoAge--;
  }

  let userAgeInfo = '';
  // ユーザーの生年月日設定がある場合のみ計算
  // ※index.htmlのUserDataManagerの構造に合わせて profile.birthday を参照
  const userBirthday = userUserData.profile && userUserData.profile.birthday;
  
  if (userBirthday) {
    const userBirth = new Date(userBirthday);
    if (!isNaN(userBirth.getTime())) {
      let userAge = eventDate.getFullYear() - userBirth.getFullYear();
      if (eventDate.getMonth() < userBirth.getMonth() || (eventDate.getMonth() === userBirth.getMonth() && eventDate.getDate() < userBirth.getDate())) {
        userAge--;
      }
      
      // 生まれる前かどうかで分岐
      if (userAge >= 0) {
         userAgeInfo = ` <span class="text-gray-300">/</span> <span class="text-[10px]">あなた</span> ${userAge}歳`;
      } else {
         userAgeInfo = ` <span class="text-gray-300">/</span> <span class="text-[10px] text-gray-300">誕生前</span>`;
      }
    }
  }
  // --- 年齢計算ロジック (End) ---

  detailContainer.innerHTML = `
    <div id="detail-header-area" class="pt-2 -mt-2 cursor-pointer pl-[70px]">
      <h2 class="font-extrabold mb-2 text-aiko-pink text-2xl leading-tight">${rec.tourName}</h2>
    </div>
    <div class="card-base mb-6 bg-white">
      <p class="text-gray-500 text-xs font-semibold mb-1">開催日</p>
      <div class="flex items-baseline gap-2">
        <p class="font-bold text-lg text-gray-800">${rec.date} (${rec.dayOfWeek})</p>
        <span class="text-xs text-gray-500 font-medium">aiko ${aikoAge}歳${userAgeInfo}</span>
      </div>
      <div class="border-t my-3 border-gray-100"></div>
      <p class="text-gray-500 text-xs font-semibold mb-1">会場</p><p class="font-bold text-lg text-gray-800">${rec.venue} (${rec.region})</p>
    </div>
    ${attendanceHtml}
    
    ${setlistSection}
    ${tweetHtml}
    <p class="text-center text-gray-400 mt-8 text-xs">※注:今まさにあなたが見ているセトリ 間違いじゃないとは言い切れない🌸</p>`;

  document.getElementById('detail-header-area').onclick = hideDetailView;
  document.getElementById('app').scrollTop = 0;
  lucide.createIcons(); 

  // ★追加: Twitter埋め込みウィジェットのロード処理
  if (rec.afterLiveTweet) {
      if (window.twttr && window.twttr.widgets) {
          // すでにロード済みの場合は再スキャン
          window.twttr.widgets.load(document.getElementById('live-detail'));
      } else {
          // まだスクリプトがない場合はロード
          if (!document.getElementById('twitter-wjs')) {
              const script = document.createElement('script');
              script.id = 'twitter-wjs';
              script.src = "https://platform.twitter.com/widgets.js";
              script.charset = "utf-8";
              script.async = true;
              document.body.appendChild(script);
          }
      }
  }

  setTimeout(() => renderHeatmap(rec.setlist), 0);
}

function hideDetailView() {
  document.body.classList.remove('detail-view');
  document.getElementById('live-detail').style.display = 'none';
  document.getElementById('back-button-fixed').style.display = 'none';
  document.querySelector('nav').style.display = 'flex';
  
  // ヒートマップはinnerHTML書き換えのため明示的な破棄は不要

  applyFilters();

  const currentTab = document.querySelector('.tab-item.active').dataset.tab;
  document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
  document.getElementById(`tab-${currentTab}`).style.display = 'block';

  if (currentTab === 'search') {
      document.getElementById('app').scrollTop = lastScrollPosition;
  }

  currentDisplayingRecord = null;
}

function copySetlist() {
  if (!currentDisplayingRecord) return;
  if (!confirm('セットリストをコピーしますか？')) return;

  let text = '';
  let songNum = 1;
  let medleyNum = 1;
  let inMedley = false;
  
  currentDisplayingRecord.setlist.forEach((s) => {
    if (s === '__MEDLEY_START__') {
        text += `${songNum++}. メドレー\n`;
        inMedley = true;
        medleyNum = 1;
        return;
    }
    if (s === '__MEDLEY_END__') {
        inMedley = false;
        return;
    }

    const cleanName = s.replace(/_アンコール(?: #\d+)?/g, '').trim();
    
    if (inMedley) {
        text += `  (${medleyNum++}) ${cleanName}\n`;
    } else {
        text += `${songNum++}. ${cleanName}\n`;
    }
  });
    
  navigator.clipboard.writeText(text).then(() => {
      alert('コピーしました！');
      safeTrackEvent('share', {
        method: 'clipboard',
        content_type: 'setlist',
        item_id: currentDisplayingRecord.tourName
      });
  }).catch(err => {
      console.error(err);
      alert('コピーに失敗しました');
  });
}

// -----------------------------------------------------------
// Search & Tab Control
// -----------------------------------------------------------

function searchVenue(venue) {
  ['tour-select', 'year-select', 'region-select', 'song-filter-input'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('search-input').value = venue;
  switchToTab('search');
  applyFilters();
}

function searchRegion(region) {
  ['search-input', 'tour-select', 'year-select', 'song-filter-input'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('region-select').value = region;
  switchToTab('search');
  applyFilters();
}

function selectSong(songName) {
  document.getElementById('song-search-input').value = songName;
  switchToTab('song'); 
  renderSongRanking();
  renderLiveCountChart();
  renderTotalLiveCategorySummary(songName);
  document.getElementById('show-setlist-btn').style.display = 'inline-block';
}

function selectVenue(fullVenueName) {
  selectedVenueInfo = { type: 'venue', name: fullVenueName };
  document.getElementById('venue-search-input').value = fullVenueName;
  switchToTab('venue');
  document.querySelectorAll('.venue-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.venue-tab[data-venue-tab="venue"]').classList.add('active');
  document.getElementById('venue-ranking-container').style.display = 'block';
  document.getElementById('region-ranking-container').style.display = 'none';
  
  renderVenueRanking();
  renderVenueLiveCountChart();
  document.getElementById('venue-show-setlist-btn').style.display = 'inline-block';
}

function selectRegion(regionName) {
  selectedVenueInfo = { type: 'region', name: regionName };
  document.getElementById('venue-search-input').value = regionName;
  switchToTab('venue');
  document.querySelectorAll('.venue-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.venue-tab[data-venue-tab="region"]').classList.add('active');
  document.getElementById('venue-ranking-container').style.display = 'none';
  document.getElementById('region-ranking-container').style.display = 'block';

  renderVenueRanking();
  renderVenueLiveCountChart();
  document.getElementById('venue-show-setlist-btn').style.display = 'inline-block';
}

function switchToTab(tabId) {
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    const targetTabItem = document.querySelector(`.tab-item[data-tab="${tabId}"]`);
    if (targetTabItem) targetTabItem.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    const targetTabContent = document.getElementById(`tab-${tabId}`);
    if (targetTabContent) targetTabContent.style.display = 'block';

    document.getElementById('app').scrollTop = 0;
    lucide.createIcons();

    if (tabId === 'records') {
        renderRecordsTab();
    }

    if (tabId === 'song') {
        if(chartInstances.liveCount) chartInstances.liveCount.resize();
    }
    if (tabId === 'pattern') {
        renderAlbumChart();
    }
    if (tabId === 'venue' && chartInstances.venueLiveCount) {
        chartInstances.venueLiveCount.resize();
    }
}

// -----------------------------------------------------------
// Records Tab (My LLDB)
// -----------------------------------------------------------

let userSongSortState = 'count-desc';

function switchUserSongSort(key) {
    if (userSongSortState.startsWith(key)) {
        userSongSortState = userSongSortState.endsWith('desc') ? key + '-asc' : key + '-desc';
    } else {
        userSongSortState = key + '-desc';
    }
    renderUserSongRanking();
}

function renderRecordsTab() { 
    // 文言リセット
    const labelEl = document.getElementById('user-stats-label');
    if (labelEl) labelEl.textContent = 'あなたの参戦回数';

    const isRegistered = userUserData.settings && userUserData.settings.syncId;
    const unregisteredDiv = document.getElementById('records-unregistered');
    const contentDiv = document.getElementById('records-content');

    if (!isRegistered) {
        unregisteredDiv.classList.remove('hidden');
        contentDiv.classList.add('hidden');
        return;
    }

    unregisteredDiv.classList.add('hidden');
    contentDiv.classList.remove('hidden');

    const attendedDates = Object.keys(userUserData.attendedLives || {});
    const attendedRecords = allLiveRecords.filter(r => attendedDates.includes(r.date));

    document.getElementById('user-total-attended').textContent = attendedDates.length;

    const allYearlyCounts = {};
    allLiveRecords.forEach(r => { if(r.year) allYearlyCounts[r.year] = (allYearlyCounts[r.year] || 0) + 1; });

    const userYearlyCounts = {};
    const catCounts = { pop: 0, rock: 0, aloha: 0, other: 0 };
    const breakdown = { pop: {}, rock: {}, aloha: {}, other: {} };
    
    const songFreq = {};

    attendedRecords.forEach(rec => {
        userYearlyCounts[rec.year] = (userYearlyCounts[rec.year] || 0) + 1;

        const name = rec.tourName.toLowerCase();
        let catKey = 'other';
        if (name.includes('pop')) catKey = 'pop';
        else if (name.includes('rock')) catKey = 'rock';
        else if (name.includes('aloha')) catKey = 'aloha';

        catCounts[catKey]++;

        if (rec.year) {
            if (!breakdown[catKey][rec.year]) breakdown[catKey][rec.year] = 0;
            breakdown[catKey][rec.year]++;
        }

        let inMedley = false;
        rec.setlist.forEach(s => {
            if (s === '__MEDLEY_START__') { inMedley = true; return; }
            if (s === '__MEDLEY_END__') { inMedley = false; return; }
            const clean = s.replace(/_アンコール/g, '').replace(/#\d+$/g, '').trim();
            if (!clean || clean === 'メドレー' || clean.includes('[') || clean.includes(']')) return;

            if (!songFreq[clean]) songFreq[clean] = { count: 0, countNoMedley: 0, lastYear: 0 };
            songFreq[clean].count++;
            if (!inMedley) songFreq[clean].countNoMedley++;
            if (parseInt(rec.year) > songFreq[clean].lastYear) songFreq[clean].lastYear = parseInt(rec.year);
        });
    });

    document.getElementById('user-category-counts').innerHTML = `
        <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-base">
            <p class="text-pop truncate">・Pop: ${catCounts.pop}</p>
            <p class="text-aloha truncate">・Aloha: ${catCounts.aloha}</p>
            <p class="text-rock truncate">・Rock: ${catCounts.rock}</p>
            <p class="text-event truncate">・Event: ${catCounts.other}</p>
        </div>
    `;

    renderUserCharts(allYearlyCounts, userYearlyCounts, catCounts, null, breakdown);

    window.currentUserSongStats = songFreq;
    renderUserSongRanking();
}

function renderUserCharts(allYearly, userYearly, cat, targetSong = null, breakdown = null) {
    const ctxYear = document.getElementById('user-yearly-chart').getContext('2d');
    if (chartInstances.userYearly) chartInstances.userYearly.destroy();

    const years = Object.keys(allYearly).sort();
    let datasets = [];

    const getDatalabelsConfig = () => {
        return {
            display: (ctx) => {
                const dsIndex = ctx.datasetIndex;
                const dataIndex = ctx.dataIndex;
                const datasets = ctx.chart.data.datasets;
                
                if (datasets[dsIndex].data[dataIndex] === 0) return false;

                for (let i = dsIndex + 1; i <= 3; i++) {
                    if (datasets[i].data[dataIndex] > 0) {
                        return false; 
                    }
                }
                return true; 
            },
            color: 'gray',
            anchor: 'end',
            align: 'end',
            offset: -2,
            font: { size: 10, weight: 'bold' },
            formatter: (value, ctx) => {
                const idx = ctx.dataIndex;
                const ds = ctx.chart.data.datasets;
                return ds[0].data[idx] + ds[1].data[idx] + ds[2].data[idx] + ds[3].data[idx];
            }
        };
    };

    if (targetSong) {
        const songBreakdown = { pop: {}, rock: {}, aloha: {}, other: {} };
        const attendedDates = Object.keys(userUserData.attendedLives || {});
        const isMedleyIncluded = document.getElementById('user-medley-toggle').checked;

        allLiveRecords.forEach(rec => {
            if (!attendedDates.includes(rec.date)) return;

            let count = 0;
            let inMedley = false;
            rec.setlist.forEach(s => {
                if (s === '__MEDLEY_START__') { inMedley = true; return; }
                if (s === '__MEDLEY_END__') { inMedley = false; return; }
                if (!isMedleyIncluded && inMedley) return;

                const clean = s.replace(/_アンコール/g, '').replace(/#\d+$/g, '').trim();
                if (clean === targetSong) count++;
            });

            if (count > 0 && rec.year) {
                const name = rec.tourName.toLowerCase();
                let catKey = 'other';
                if (name.includes('pop')) catKey = 'pop';
                else if (name.includes('rock')) catKey = 'rock';
                else if (name.includes('aloha')) catKey = 'aloha';
                
                songBreakdown[catKey][rec.year] = (songBreakdown[catKey][rec.year] || 0) + 1;
            }
        });

        const datalabelsConfig = getDatalabelsConfig();

        datasets = [
            { label: 'Pop', data: years.map(y => songBreakdown.pop[y] || 0), backgroundColor: THEME_COLORS.POP, stack: 'stack1', borderRadius: 2, datalabels: datalabelsConfig },
            { label: 'Rock', data: years.map(y => songBreakdown.rock[y] || 0), backgroundColor: THEME_COLORS.ROCK, stack: 'stack1', borderRadius: 2, datalabels: datalabelsConfig },
            { label: 'Aloha', data: years.map(y => songBreakdown.aloha[y] || 0), backgroundColor: THEME_COLORS.ALOHA, stack: 'stack1', borderRadius: 2, datalabels: datalabelsConfig },
            { label: 'Other', data: years.map(y => songBreakdown.other[y] || 0), backgroundColor: THEME_COLORS.EVENT, stack: 'stack1', borderRadius: 2, datalabels: datalabelsConfig },
            {
                label: 'その他参戦',
                data: years.map(y => {
                    const listenedCount = (songBreakdown.pop[y] || 0) + (songBreakdown.rock[y] || 0) + (songBreakdown.aloha[y] || 0) + (songBreakdown.other[y] || 0);
                    return Math.max(0, (userYearly[y] || 0) - listenedCount);
                }),
                backgroundColor: THEME_COLORS.BG_GRAY_ALPHA,
                borderColor: THEME_COLORS.BG_GRAY_ALPHA,
                borderWidth: 1,
                borderRadius: 4,
                stack: 'stack1',
                datalabels: { display: false }
            }
        ];

    } else {
        if (breakdown) {
            const datalabelsConfig = getDatalabelsConfig();

            datasets = [
                { label: 'Pop', data: years.map(y => breakdown.pop[y] || 0), backgroundColor: THEME_COLORS.POP, stack: 'stack1', borderRadius: 2, datalabels: datalabelsConfig },
                { label: 'Rock', data: years.map(y => breakdown.rock[y] || 0), backgroundColor: THEME_COLORS.ROCK, stack: 'stack1', borderRadius: 2, datalabels: datalabelsConfig },
                { label: 'Aloha', data: years.map(y => breakdown.aloha[y] || 0), backgroundColor: THEME_COLORS.ALOHA, stack: 'stack1', borderRadius: 2, datalabels: datalabelsConfig },
                { label: 'Event/Other', data: years.map(y => breakdown.other[y] || 0), backgroundColor: THEME_COLORS.EVENT, stack: 'stack1', borderRadius: 2, datalabels: datalabelsConfig },
                {
                    label: '未参戦 (全ライブ)',
                    data: years.map(y => Math.max(0, (allYearly[y] || 0) - (userYearly[y] || 0))),
                    backgroundColor: 'rgba(229, 231, 235, 0.5)',
                    borderColor: 'rgba(229, 231, 235, 1)',
                    borderWidth: 1,
                    borderRadius: 4,
                    stack: 'stack1',
                    datalabels: { display: false }
                }
            ];
        }
    }

    chartInstances.userYearly = new Chart(ctxYear, {
        type: 'bar',
        data: { labels: years, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        footer: (tooltipItems) => {
                            let total = 0;
                            tooltipItems.forEach(t => { 
                                total += t.parsed.y; 
                            });
                            return 'Total: ' + total;
                        }
                    }
                }
            },
            scales: {
                y: { stacked: true, beginAtZero: true, min: 0, ticks: { font: { size: 10 }, stepSize: 5 } },
                x: { stacked: true, ticks: { font: { size: 10 }, maxRotation: 90, minRotation: 90, autoSkip: false } }
            }
        },
        plugins: [ChartDataLabels]
    });

    const ctxCat = document.getElementById('user-category-doughnut').getContext('2d');
    if (chartInstances.userCategory) chartInstances.userCategory.destroy();
    chartInstances.userCategory = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
            labels: ['Pop', 'Rock', 'Aloha', 'Other'],
            datasets: [{
                data: [cat.pop, cat.rock, cat.aloha, cat.other],
                backgroundColor: [THEME_COLORS.POP, THEME_COLORS.ROCK, THEME_COLORS.ALOHA, THEME_COLORS.EVENT],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    });
}

function renderUserSongRanking() {
  const container = document.getElementById('user-song-ranking-container');
  if (!container) return;
  const searchInputText = document.getElementById('record-song-search').value.toLowerCase();
  const isMedley = document.getElementById('user-medley-toggle').checked;
  const stats = window.currentUserSongStats || {};

  const countIcon = document.getElementById('user-sort-icon-count');
  const yearIcon = document.getElementById('user-sort-icon-year');
  [countIcon, yearIcon].forEach(icon => {
      icon.setAttribute('data-lucide', 'chevrons-up-down');
      icon.classList.remove('text-aiko-red');
      icon.classList.add('text-gray-300');
  });
  const activeIcon = userSongSortState.startsWith('count') ? countIcon : yearIcon;
  activeIcon.classList.remove('text-gray-300');
  activeIcon.classList.add('text-aiko-red');
  activeIcon.setAttribute('data-lucide', userSongSortState.endsWith('desc') ? 'chevron-down' : 'chevron-up');
  lucide.createIcons();

  const list = Object.entries(stats)
    .filter(([name]) => name.toLowerCase().includes(searchInputText))
    .map(([name, data]) => ({ 
      name, 
      count: isMedley ? data.count : data.countNoMedley,
      lastYear: data.lastYear 
    }))
    .filter(item => item.count > 0)
    .sort((a, b) => {
      if (userSongSortState === 'count-desc') return b.count - a.count || b.lastYear - a.lastYear;
      if (userSongSortState === 'count-asc') return a.count - b.count || a.lastYear - b.lastYear;
      if (userSongSortState === 'year-desc') return b.lastYear - a.lastYear || b.count - a.count;
      if (userSongSortState === 'year-asc') return a.lastYear - b.lastYear || b.count - a.count;
      return 0;
    });

  document.getElementById('user-total-songs').textContent = list.length;

  let currentRank = 0;
  let lastVal = -1;
  let skip = 1;

  container.innerHTML = list.map((item, i) => {
    if (item.count !== lastVal) {
      if (lastVal !== -1) { currentRank += skip; skip = 1; } 
      else { currentRank = 1; }
      lastVal = item.count;
    } else {
      skip++;
    }

    const rankColor = currentRank <= 3 && searchInputText === '' ? ['text-aiko-pink','text-aiko-yellow','text-aiko-blue'][currentRank-1] : 'text-gray-300';

    return `
      <div class="card-base p-3 mb-2 clickable-item flex items-center border border-gray-100 bg-white" onclick="selectUserSong('${item.name.replace(/'/g, "\\'")}')">
        <span class="rank-number ${rankColor}">${currentRank}</span>
        <span class="song-title text-gray-700">${item.name}</span>
        <span class="song-count">${item.count} <span>回</span></span>
        <span class="text-[11px] text-gray-400 ml-2 w-14 text-right">(${item.lastYear}年)</span>
      </div>`;
  }).join('');
}
  
function renderSongRanking() {
  const container = document.getElementById('song-ranking-container');
  if (!container) return;
  const sortOrder = songSortState; 
  const searchTerm = document.getElementById('song-search-input').value.toLowerCase();

  updateSortIcons();

  const isMedleyIncluded = document.getElementById('medley-toggle').checked;
  const targetStats = isMedleyIncluded ? songStats : songStatsNoMedley;
  const targetYears = isMedleyIncluded ? songLastYears : songLastYearsNoMedley;

  const sortedSongs = Object.entries(targetStats)
    .filter(([song]) => song.toLowerCase().startsWith(searchTerm))
    .map(([song, count]) => ({ song, count, year: targetYears[song] || 0 }))
    .sort((a, b) => {
    if (sortOrder === 'count-desc') return b.count - a.count || b.year - a.year;
    if (sortOrder === 'count-asc') return a.count - b.count || a.year - b.year;
    if (sortOrder === 'year-desc') return b.year - a.year || b.count - a.count;
    if (sortOrder === 'year-asc') {
    if (a.year === 0) return 1;
    if (b.year === 0) return -1;
    return a.year - b.year || b.count - a.count;
    }
    return 0;
    });

  document.getElementById('total-songs').textContent = Object.keys(songStats).length;

  let currentRank = 0;
  let lastVal = -1;
  let skip = 1;

  container.innerHTML = sortedSongs.map((item, index) => {
    if (item.count !== lastVal) {
      if (lastVal !== -1) {
        currentRank += skip;
        skip = 1;
      } else {
        currentRank = 1;
      }
      lastVal = item.count;
    } else {
      skip++;
    }

    const rankColor = currentRank <= 3 && searchTerm === '' ? ['text-aiko-pink','text-aiko-yellow','text-aiko-blue'][currentRank-1] : 'text-gray-300';
    const yearText = item.year > 0 ? `(${item.year}年)` : '(ー)';

    return `
    <div class="card-base p-3 mb-2 clickable-item flex items-center border border-gray-100 bg-white" onclick="selectSong('${item.song.replace(/'/g, "\\'")}')">
    <span class="rank-number ${rankColor}">${currentRank}</span>
    <span class="song-title text-gray-700">${item.song}</span>
    <span class="song-count">${item.count} <span>回</span></span>
    <span class="text-[11px] text-gray-400 ml-2 w-14 text-right">${yearText}</span>
    </div>`}).join('');
}

function updateSongSort(key) {
    if (songSortState.startsWith(key)) {
        songSortState = songSortState.endsWith('desc') ? key + '-asc' : key + '-desc';
    } else {
        songSortState = key + '-desc';
    }
    renderSongRanking();
}

function updateSortIcons() {
    const countIcon = document.getElementById('sort-icon-count');
    const yearIcon = document.getElementById('sort-icon-year');
    if (!countIcon || !yearIcon) return;

    [countIcon, yearIcon].forEach(icon => {
        icon.setAttribute('data-lucide', 'chevrons-up-down');
        icon.classList.remove('text-aiko-red');
        icon.classList.add('text-gray-300');
    });

    const activeIcon = songSortState.startsWith('count') ? countIcon : yearIcon;
    activeIcon.classList.remove('text-gray-300');
    activeIcon.classList.add('text-aiko-red');
    activeIcon.setAttribute('data-lucide', songSortState.endsWith('desc') ? 'chevron-down' : 'chevron-up');

    lucide.createIcons();
}

function renderPatternStats() {
  const types = ['opening', 'encore', 'last'];
  types.forEach(type => {
    const container = document.getElementById(type + '-songs');
    if (!container) return;
    const data = Object.entries(patternStats[type + 'Songs']).sort((a, b) => b[1] - a[1]).slice(0, 10);
    container.innerHTML = data.map(([song, count], i) => {
      const rankColor = i < 3 ? ['text-aiko-pink','text-aiko-yellow','text-aiko-blue'][i] : 'text-gray-300';
      const borderClass = i !== data.length -1 ? 'border-b border-gray-100' : '';
      return `<div class="p-3 clickable-item flex items-center ${borderClass}" onclick="showModal('${song.replace(/'/g, "\\'")}', '${type}')">
        <span class="rank-number ${rankColor}">${i + 1}</span>
        <span class="song-title text-gray-700">${song}</span>
        <span class="song-count">${count} <span>回</span></span>
      </div>`
    }).join('');
  });
}

function renderVenueRanking() {
  const venueContainer = document.getElementById('venue-ranking-container');
  const regionContainer = document.getElementById('region-ranking-container');
  if (!venueContainer || !regionContainer) return;

  const vcs = {}, rcs = {};
  allLiveRecords.forEach(rec => {
    const venueKey = rec.region === 'オンライン' ? 'オンライン' : `${rec.venue} (${rec.region})`;
    vcs[venueKey] = (vcs[venueKey] || 0) + 1;
    if (rec.region) rcs[rec.region] = (rcs[rec.region] || 0) + 1;
  });

  const searchTerm = document.getElementById('venue-search-input').value.toLowerCase();
  const rankColors = ['text-aiko-pink', 'text-aiko-yellow', 'text-aiko-blue'];

  const filteredVenues = Object.entries(vcs)
    .filter(([name]) => name.toLowerCase().includes(searchTerm))
    .sort((a, b) => b[1] - a[1]);

  venueContainer.innerHTML = filteredVenues.map(([name, count], i) => `
    <div class="card-base p-3 mb-2 clickable-item flex items-center border border-gray-100 bg-white" onclick="selectVenue('${name.replace(/'/g, "\\'")}')">
      <span class="rank-number ${i < 3 && searchTerm === '' ? rankColors[i] : 'text-gray-300'}">${filteredVenues.findIndex(v => v[0] === name) + 1}</span>
      <span class="venue-name text-gray-700">${name}</span>
      <span class="song-count">${count} <span>回</span></span>
    </div>`).join('');

  const filteredRegions = Object.entries(rcs)
    .filter(([name]) => name.toLowerCase().includes(searchTerm))
    .sort((a, b) => b[1] - a[1]);

  let regionHtml = filteredRegions.map(([name, count], i) => `
    <div class="card-base p-3 mb-2 clickable-item flex items-center border border-gray-100 bg-white" onclick="selectRegion('${name.replace(/'/g, "\\'")}')">
      <span class="rank-number ${i < 3 && searchTerm === '' ? rankColors[i] : 'text-gray-300'}">${filteredRegions.findIndex(r => r[0] === name) + 1}</span>
      <span class="venue-name text-gray-700">${name}</span>
      <span class="song-count">${count} <span>回</span></span>
    </div>`).join('');

  if (searchTerm === '') {
    const allRegions = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
    const heldRegions = new Set(Object.keys(rcs));
    const zeroRegions = allRegions.filter(r => !heldRegions.has(r));
    if (zeroRegions.length > 0) {
      regionHtml += '<div class="mt-6 mb-3 px-1"><h4 class="font-bold text-gray-500 text-sm">開催なし</h4></div>';
      regionHtml += zeroRegions.sort().map(region =>
        `<div class="card-base p-3 mb-2 flex items-center opacity-50 bg-gray-50 border border-gray-100">
          <span class="rank-number text-gray-300 text-sm" style="min-width:30px;">-</span>
          <span class="venue-name text-gray-500">${region}</span>
          <span class="song-count text-gray-400">0 <span>回</span></span>
        </div>`
      ).join('');
    }
  }
  regionContainer.innerHTML = regionHtml;
}

// -----------------------------------------------------------
// Event Listeners & Interaction
// -----------------------------------------------------------

function setupEventListeners() {
  ['search-input', 'tour-select', 'year-select', 'region-select', 'song-filter-input'].forEach(id => {
    document.getElementById(id).addEventListener(id.includes('select') ? 'change' : 'input', applyFilters);
  });

  document.getElementById('clear-all-btn').addEventListener('click', () => {
    ['search-input', 'tour-select', 'year-select', 'region-select'].forEach(id => document.getElementById(id).value = '');
    const songInput = document.getElementById('song-filter-input');
    songInput.value = '';
    songInput.placeholder = '曲名で絞り込み（楽曲タブで選択）';
    document.getElementById('attended-filter-toggle').checked = false;
    applyFilters();
  });

  document.getElementById('attended-filter-toggle').addEventListener('change', applyFilters);

  document.getElementById('song-search-input').addEventListener('input', () => {
    renderSongRanking();
    document.getElementById('show-setlist-btn').style.display = 'none';
  });
  document.getElementById('song-clear-btn').addEventListener('click', () => {
    document.getElementById('song-search-input').value = '';
    renderSongRanking();
    renderLiveCountChart();
    renderTotalLiveCategorySummary(); // 文言とチャートをリセット
    document.getElementById('show-setlist-btn').style.display = 'none';
  });

  document.getElementById('medley-toggle').addEventListener('change', () => {
      renderSongRanking();
      renderLiveCountChart();
      // メドレー切り替え時に、現在選択中の曲の演奏回数パネルも更新する
      const currentSong = document.getElementById('song-search-input').value;
      renderTotalLiveCategorySummary(currentSong);
  });

  document.getElementById('show-setlist-btn').addEventListener('click', () => {
    const songName = document.getElementById('song-search-input').value;
    if (songName) {
      const songInput = document.getElementById('song-filter-input');
      const isMedleyIncluded = document.getElementById('medley-toggle').checked;
      if (isMedleyIncluded) {
          songInput.value = `${songName}　※楽曲タブから選択`;
      } else {
          songInput.value = `${songName}(メドレー除外)　※楽曲タブから選択`;
      }
      switchToTab('search');
      applyFilters();
    }
  });

  document.getElementById('venue-search-input').addEventListener('input', renderVenueRanking);
  document.getElementById('venue-clear-btn').addEventListener('click', () => {
    document.getElementById('venue-search-input').value = '';
    selectedVenueInfo = null;
    document.getElementById('venue-show-setlist-btn').style.display = 'none';
    renderVenueRanking();
    renderVenueLiveCountChart();
  });

  document.getElementById('venue-show-setlist-btn').addEventListener('click', () => {
    if (!selectedVenueInfo) return;
    if (selectedVenueInfo.type === 'venue') {
      const venueOnlyName = selectedVenueInfo.name.split(' (')[0];
      searchVenue(venueOnlyName);
    } else if (selectedVenueInfo.type === 'region') {
      searchRegion(selectedVenueInfo.name);
    }
  });

  document.querySelectorAll('.venue-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.venue-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isVenue = tab.dataset.venueTab === 'venue';
      document.getElementById('venue-ranking-container').style.display = isVenue ? 'block' : 'none';
      document.getElementById('region-ranking-container').style.display = isVenue ? 'none' : 'block';
    });
  });

  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('click', e => { e.preventDefault(); switchToTab(tab.dataset.tab); });
  });

  [document.getElementById('modal-overlay'), document.getElementById('memo-modal')].forEach(modal => {
    if(modal) modal.addEventListener('click', e => { if (e.target === e.currentTarget) e.target.style.display = 'none'; });
  });

  ['tour-select', 'year-select', 'region-select'].forEach(id => {
      const el = document.getElementById(id);
      if(el) {
          el.addEventListener('change', (e) => {
              if(e.target.value) {
                  safeTrackEvent('select_content', {
                      content_type: 'filter_' + id.replace('-select', ''),
                      item_id: e.target.value
                  });
              }
          });
      }
  });

  // --- Records Tab Listeners ---

  function selectUserSong(songName, skipScroll = false) {
    // 文言更新
    const labelEl = document.getElementById('user-stats-label');
    if (labelEl) labelEl.textContent = songName ? 'この曲を聴いた回数' : 'あなたの参戦回数';

    document.getElementById('record-song-search').value = songName;
    renderUserSongRanking();
    
    const allYearlyCounts = {};
    allLiveRecords.forEach(r => { if(r.year) allYearlyCounts[r.year] = (allYearlyCounts[r.year] || 0) + 1; });
    
    const userYearlyCounts = {};
    const catCounts = { pop: 0, rock: 0, aloha: 0, other: 0 };
    const attendedDates = Object.keys(userUserData.attendedLives || {});
    const isMedleyIncluded = document.getElementById('user-medley-toggle').checked;
    
    let totalHitCount = 0; // 追加：聴いた回数の合計

    allLiveRecords.forEach(rec => {
      if (attendedDates.includes(rec.date)) {
          let isMatch = true;
          if (songName) {
            let count = 0;
            let inMedley = false;
            rec.setlist.forEach(s => {
              if (s === '__MEDLEY_START__') { inMedley = true; return; }
              if (s === '__MEDLEY_END__') { inMedley = false; return; }
              if (!isMedleyIncluded && inMedley) return;
              const clean = s.replace(/_アンコール/g, '').replace(/#\d+$/g, '').trim();
              if (clean === songName) count++;
            });
            if (count === 0) {
                isMatch = false;
            } else {
                totalHitCount += count; // 追加：回数を加算
            }
          }

          if (isMatch) {
            userYearlyCounts[rec.year] = (userYearlyCounts[rec.year] || 0) + 1;
            const name = rec.tourName.toLowerCase();
            if (name.includes('pop')) catCounts.pop++;
            else if (name.includes('rock')) catCounts.rock++;
            else if (name.includes('aloha')) catCounts.aloha++;
            else catCounts.other++;
          }
      }
    });

    // 追加：数字の更新処理
    if (songName) {
        document.getElementById('user-total-attended').textContent = totalHitCount;
    } else {
        // 曲が選択されていない場合は参戦公演数（元々のロジックと同じ数字）に戻す
        document.getElementById('user-total-attended').textContent = attendedDates.length;
    }

    document.getElementById('user-category-counts').innerHTML = `
        <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-base">
            <p class="text-pop truncate">・Pop: ${catCounts.pop}</p>
            <p class="text-aloha truncate">・Aloha: ${catCounts.aloha}</p>
            <p class="text-rock truncate">・Rock: ${catCounts.rock}</p>
            <p class="text-event truncate">・Event: ${catCounts.other}</p>
        </div>
    `;

    renderUserCharts(allYearlyCounts, userYearlyCounts, catCounts, songName);
    document.getElementById('user-show-setlist-btn').style.display = 'inline-block';
    
    if (!skipScroll) {
        document.getElementById('app').scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  document.getElementById('record-song-clear-btn').addEventListener('click', () => {
      document.getElementById('record-song-search').value = '';
      renderUserSongRanking();
      renderRecordsTab(); 
      document.getElementById('user-show-setlist-btn').style.display = 'none';
  });

  document.getElementById('user-medley-toggle').addEventListener('change', () => {
      const songName = document.getElementById('record-song-search').value;
      if (songName) {
          selectUserSong(songName, true); 
      } else {
          renderUserSongRanking();
      }
  });

  document.getElementById('user-show-setlist-btn').addEventListener('click', () => {
      const songName = document.getElementById('record-song-search').value;
      if (!songName) return;
      
      const songInput = document.getElementById('song-filter-input');
      const isMedleyIncluded = document.getElementById('user-medley-toggle').checked;
      
      document.getElementById('medley-toggle').checked = isMedleyIncluded;

      if (isMedleyIncluded) {
            songInput.value = `${songName}　※楽曲タブから選択`;
      } else {
            songInput.value = `${songName}(メドレー除外)　※楽曲タブから選択`;
      }
      
      document.getElementById('attended-filter-toggle').checked = true;
      
      switchToTab('search');
      applyFilters();
  });

  window.selectUserSong = selectUserSong;
}

function handleError(error) {
  console.error("API Error:", error);
  safeTrackEvent('exception', {
      description: error.message,
      fatal: true
  });
  document.getElementById('live-list-container').innerHTML = `<p class="text-center text-red-500 py-8 text-sm">データ読み込み中にエラーが発生しました。<br>(${error.message})</p>`;
}

// -----------------------------------------------------------
// History Tab
// -----------------------------------------------------------

function renderHistoryTab() {
    const tbody = document.getElementById('timeline-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!historyData || historyData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400 text-xs">データ読込中...<br>表示されない場合はリロードしてください</td></tr>';
        return;
    }

    const eventsMap = {}; 
    historyData.forEach(row => {
        if (!row.date) return;
        const d = new Date(row.date);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        if (!eventsMap[key]) eventsMap[key] = { lives: new Set(), singles: [], albums: [] };
        
        if (row.type) {
            if (row.type === 'live') eventsMap[key].lives.add(formatTourName(row.title));
            if (row.type === 'single') eventsMap[key].singles.push(row.title);
            if (row.type === 'album') eventsMap[key].albums.push(row.title);
        }
        else {
            if (row.live) eventsMap[key].lives.add(formatTourName(row.live));
            if (row.single) eventsMap[key].singles.push(row.single);
            if (row.album) eventsMap[key].albums.push(row.album);
        }
    });

    let current = new Date(1996, 7, 1);
    const end = new Date(); 
    let prevYear = -1;

    while (current <= end) {
        const y = current.getFullYear();
        const m = current.getMonth() + 1;
        const key = `${y}-${m}`;
        
        let age = y - AIKO_BIRTH.getFullYear();
        if (m < (AIKO_BIRTH.getMonth() + 1)) age--;
        
        let liveHtml = '';
        let cdHtml = '';
        
        if (eventsMap[key]) {
            eventsMap[key].lives.forEach(liveName => { 
                const safeName = liveName.replace(/'/g, "\\'");
                liveHtml += `<div class="event-chip chip-live" onclick="findAndShowLive('${y}/${m}/01', '${safeName}')">${liveName}</div>`; 
            });
            eventsMap[key].singles.forEach(s => { cdHtml += `<div class="event-chip chip-single">S: ${s}</div>`; });
            eventsMap[key].albums.forEach(a => { cdHtml += `<div class="event-chip chip-album">Al: ${a}</div>`; });
        }

        const yearDisplay = (y !== prevYear) ? `<span class="text-xs font-bold block text-gray-500">${y}</span>` : '';
        prevYear = y;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-center text-gray-400 font-mono border-r border-gray-100">
                ${yearDisplay}
                <span class="text-[10px] text-gray-300">${m}月</span>
            </td>
            <td class="text-center font-bold text-aiko-red border-r border-gray-100">${age >= 0 ? age : ''}</td>
            <td class="pl-1">${liveHtml}</td>
            <td class="pl-1">${cdHtml}</td>
        `;
        tbody.appendChild(tr);
        current.setMonth(current.getMonth() + 1);
    }
}

window.findAndShowLive = function(dateStr, tourName) {
    document.getElementById('search-input').value = tourName;
    document.getElementById('tour-select').value = '';
    document.getElementById('year-select').value = '';
    document.getElementById('region-select').value = '';
    document.getElementById('song-filter-input').value = '';
    switchToTab('search');
    applyFilters();
}

// -----------------------------------------------------------
// Daily Events & Anniversary Logic
// -----------------------------------------------------------

function checkTodayEvents() {
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Tokyo"}));
    const todayMonth = now.getMonth() + 1;
    const todayDate = now.getDate();
    const currentYear = now.getFullYear();

    const todayKey = `${currentYear}-${todayMonth}-${todayDate}`;
    const lastGreetingDate = localStorage.getItem('lldb_last_greeting_date');

    console.log(`Check Events: ${todayKey} (Last greeted: ${lastGreetingDate})`);

    if (lastGreetingDate === todayKey) {
        console.log("Today's greeting already done. Skip.");
        return;
    }

    anniversaryQueue = [];

    const isSameDate = (val) => {
        if (!val) return false;
        
        const dateObj = new Date(val);
        if (isNaN(dateObj.getTime())) return false;

        const jstObj = new Date(dateObj.toLocaleString("en-US", {timeZone: "Asia/Tokyo"}));
        const m = jstObj.getMonth() + 1;
        const d = jstObj.getDate();

        return m === todayMonth && d === todayDate;
    };

    allLiveRecords.forEach(rec => {
        if (isSameDate(rec.date)) {
            anniversaryQueue.push({ type: 'live', data: rec });
        }
    });

    if (typeof listData !== 'undefined' && Array.isArray(listData)) {
        listData.forEach(item => {
            if (isSameDate(item.releaseDate)) {
                anniversaryQueue.push({ type: 'cd', data: item });
            }
        });
    }

    console.log(`Hits: ${anniversaryQueue.length}`);

    if (anniversaryQueue.length > 0) {
        processNextAnniversary();
        localStorage.setItem('lldb_last_greeting_date', todayKey);
    }
}

function processNextAnniversary() {
    if (anniversaryQueue.length === 0) return;
    
    if (document.getElementById('modal-overlay').style.display === 'flex') return;
    
    showAnniversaryModal([...anniversaryQueue]);
    
    anniversaryQueue = [];
}

function showAnniversaryModal(events) {
    const contentDiv = document.getElementById('modal-body');
    if (!contentDiv) return;

    let html = '';
    const nowYear = new Date().getFullYear();
    const birth = new Date(1975, 10, 22); 

    if (!Array.isArray(events)) {
        events = [events];
    }

    events.forEach(event => {
        html += '<div class="mb-8 last:mb-0 border-b border-dashed border-gray-200 pb-8 last:border-0 last:pb-0">';

        if (event.type === 'live') {
            const rec = event.data;
            const recYear = new Date(rec.date).getFullYear();
            const yearsAgo = nowYear - recYear;
            const yearsAgoText = yearsAgo > 0 ? `${yearsAgo}年前の` : '';
            
            const tourNameLower = rec.tourName.toLowerCase();
            let labelType = 'other', labelText = 'Event';
            if (tourNameLower.includes('love like pop')) { labelType = 'pop'; labelText = 'POP'; }
            else if (tourNameLower.includes('love like rock')) { labelType = 'rock'; labelText = 'ROCK'; }
            else if (tourNameLower.includes('love like aloha')) { labelType = 'aloha'; labelText = 'ALOHA'; }

            html += `
                <h2 class="font-bold text-center text-xl mb-4 text-aiko-pink">🎉 ${yearsAgoText}今日は何の日？</h2>
                <div class="card-base live-card cursor-pointer shadow-md" onclick="closeModal(); showLiveDetail(allLiveRecords.find(r => r.date === '${rec.date}' && r.tourName === '${rec.tourName.replace(/'/g, "\\'")}' ))">
                    <div class="live-card-label ${labelType}">${labelText}</div>
                    <p class="text-gray-500 font-medium text-xs">${rec.date} (${rec.dayOfWeek})</p>
                    <p class="font-bold mt-1 text-gray-800 text-lg leading-tight">${rec.tourName}</p>
                    <p class="text-gray-600 text-sm mt-1">${rec.venue} (${rec.region})</p>
                    <p class="mt-2 font-semibold text-aiko-pink text-sm">セットリスト: ${rec.songCount}曲</p>
                </div>
                <p class="text-center text-gray-400 text-xs mt-2">👆 タップで詳細へ</p>
            `;
        } else if (event.type === 'cd') {
            const item = event.data;
            
            let releaseDateObj = new Date(item.releaseDate);
            if (isNaN(releaseDateObj.getTime())) {
                 const parts = String(item.releaseDate).split('/');
                 if (parts.length === 3) {
                     releaseDateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                 } else {
                     releaseDateObj = new Date();
                 }
            }
            
            const rYear = releaseDateObj.getFullYear();
            const rMonth = releaseDateObj.getMonth() + 1;
            const rDay = releaseDateObj.getDate();
            
            const yearsAgo = nowYear - rYear;
            const yearsAgoText = yearsAgo > 0 ? `${yearsAgo}年前の` : '';
            
            let ageY = rYear - birth.getFullYear();
            let ageM = rMonth - (birth.getMonth() + 1);
            let ageD = rDay - birth.getDate();
            
            if (ageD < 0) {
                ageM--;
                const prevMonthLastDay = new Date(rYear, rMonth - 1, 0).getDate();
                ageD += prevMonthLastDay;
            }
            if (ageM < 0) {
                ageY--;
                ageM += 12;
            }

            const d1 = new Date(birth.getFullYear(), birth.getMonth(), birth.getDate(), 12, 0, 0);
            const d2 = new Date(rYear, rMonth - 1, rDay, 12, 0, 0);
            const diffTime = Math.abs(d2 - d1);
            const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 

            const img1 = item.img1 || 'https://placehold.jp/150x150.png?text=No%20Image';
            const img2 = item.img2; 

            html += `
                <h2 class="font-bold text-center text-xl mb-4 text-aiko-pink">🎂 ${yearsAgoText}今日は何の日？</h2>
                <div class="card-base bg-white p-5 shadow-md rounded-2xl">
                    <div class="flex justify-between items-center mb-4">
                        <span class="border border-gray-300 px-2 py-0.5 rounded text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-white">${item.type}</span>
                        <span class="text-xs text-gray-400 font-mono tracking-widest">${rYear}.${rMonth}.${rDay}</span>
                    </div>

                    <h3 class="text-center font-bold text-gray-800 text-xl mb-5 leading-tight">${item.title}</h3>

                    <div class="flex justify-center gap-3 mb-6">
                        <img src="${img1}" class="${img2 ? 'w-[45%]' : 'w-[60%]'} rounded-lg shadow-sm border border-gray-100 object-cover aspect-square" onerror="this.src='https://placehold.jp/150x150.png?text=No%20Image'">
                        ${img2 ? `<img src="${img2}" class="w-[45%] rounded-lg shadow-sm border border-gray-100 object-cover aspect-square" onerror="this.style.display='none'">` : ''}
                    </div>

                    <div class="bg-[#EFF8F7] rounded-xl p-3 mb-5 flex justify-between items-center">
                        <span class="text-xs font-bold text-[#4A8078]">当時のaiko</span>
                        <div class="text-right">
                            <div class="text-sm font-bold text-[#4A8078]">
                                ${ageY}歳${ageM}カ月${ageD}日
                            </div>
                            <div class="text-[10px] text-gray-400 font-mono">
                                (${totalDays.toLocaleString()}日)
                            </div>
                        </div>
                    </div>

                    <div class="text-left">
                        <p class="text-[10px] text-gray-400 mb-1 flex items-center gap-1 font-bold">
                            <i data-lucide="music" class="w-3 h-3"></i> 収録曲
                        </p>
                        <div class="border border-dashed border-gray-200 rounded-xl p-3 bg-gray-50 text-sm text-gray-700 leading-relaxed">
                            ${item.tracks ? item.tracks.replace(/\//g, '<br>') : '収録曲情報なし'}
                        </div>
                    </div>
                </div>
            `;
        }
        
        html += '</div>'; 
    });

    contentDiv.innerHTML = html;
    document.getElementById('modal-overlay').style.display = 'flex';
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

// -----------------------------------------------------------
// Confetti Animation
// -----------------------------------------------------------

function startConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  let width = window.innerWidth;
  let height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;

  const particles = [];
  // 改修: 色定義を使用
  const colors = [
      THEME_COLORS.ALOHA, 
      '#C0C0C0', 
      '#E5E4E2', 
      '#DAA520', 
      THEME_COLORS.PINK, 
      THEME_COLORS.POP, 
      '#FFA500'
  ]; 
  
  class ExplosionParticle {
    constructor() {
      const menuRect = document.getElementById('tour-select')?.getBoundingClientRect();
      const originX = menuRect ? (menuRect.left + menuRect.width / 2) : (width / 2);
      const originY = menuRect ? (menuRect.top + menuRect.height / 2) : (height / 2);

      this.x = originX;
      this.y = originY;
      
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.w = Math.random() * 8 + 4;
      this.h = Math.random() * 4 + 2; 
      
      const angle = Math.random() * Math.PI * 2;
      const velocity = Math.random() * 18 + 10; 
      this.vx = Math.cos(angle) * velocity;
      this.vy = Math.sin(angle) * velocity - 8; 
      
      this.gravity = 0.4;
      this.friction = 0.92; 
      this.rotation = Math.random() * 360;
      this.rotationSpeed = (Math.random() - 0.5) * 20;
      this.alpha = 1;
    }
    update() {
      this.vy += this.gravity;
      this.vx *= this.friction;
      this.vy *= this.friction;
      this.x += this.vx;
      this.y += this.vy;
      this.rotation += this.rotationSpeed;
      if (this.y > height + 20) this.alpha -= 0.05; 
    }
    draw(ctx) {
      if (this.alpha <= 0) return;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation * Math.PI / 180);
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = this.color;
      ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
      ctx.restore();
    }
  }

  class CannonParticle {
    constructor() {
      this.x = Math.random() * width; 
      this.y = - (Math.random() * 300 + 100); 
      
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.w = Math.random() * 8 + 4; 
      this.h = Math.random() * 60 + 30; 
      this.vy = Math.random() * 5 + 5; 
      this.vx = (Math.random() - 0.5) * 10; 
      this.gravity = 0.2; 
      this.friction = 0.94; 
      this.angle = Math.random() * 360;
      this.angleSpeed = (Math.random() - 0.5) * 15;
      this.flip = 0;
      this.flipSpeed = Math.random() * 0.2 + 0.05;
    }
    update() {
      this.vy += this.gravity;
      this.vx *= this.friction;
      this.x += this.vx;
      this.y += this.vy;
      if (this.vy > 6) this.vy *= 0.95; 
      this.angle += this.angleSpeed;
      this.flip += this.flipSpeed;
    }
    draw(ctx) {
      if (this.y > height + 100 && this.vy > 0) return;
      
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle * Math.PI / 180);
      const scaleY = Math.cos(this.flip); 
      ctx.scale(1, scaleY);
      ctx.fillStyle = this.color;
      ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
      ctx.restore();
    }
  }

  for (let i = 0; i < 200; i++) {
    particles.push(new ExplosionParticle());
  }

  setTimeout(() => {
      for (let i = 0; i < 100; i++) {
        particles.push(new CannonParticle());
      }
  }, 350); 

  function animate() {
    ctx.clearRect(0, 0, width, height);
    let activeParticles = 0;
    
    particles.forEach(p => {
      p.update();
      p.draw(ctx);
      if (p.alpha > 0 && (p.y < height + 100 || (p.vy && p.vy < 0))) {
          activeParticles++;
      }
    });
    
    if (activeParticles > 0) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
  }
    
  animate();
    
  const resizeHandler = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
  };
  window.addEventListener('resize', resizeHandler);
}

// -----------------------------------------------------------
// Miscellaneous & Random Triggers
// -----------------------------------------------------------

function setupRandomTriggers() {
  function createDoubleTapHandler(callback) {
    let tapCount = 0;
    let timer = null;
    let lastTouchX = 0;
    let lastTouchY = 0;

    const reset = () => {
        tapCount = 0;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const handler = (e) => {
        if (e.type === 'touchstart') {
            lastTouchX = e.changedTouches[0].screenX;
            lastTouchY = e.changedTouches[0].screenY;
            return;
        }

        if (e.type === 'touchend') {
            const touch = e.changedTouches[0];
            if (Math.abs(touch.screenX - lastTouchX) > 10 || Math.abs(touch.screenY - lastTouchY) > 10) {
                reset();
                return;
            }
        }

        tapCount++;
        
        if (tapCount === 1) {
            timer = setTimeout(reset, 350); 
        } else if (tapCount === 2) {
            e.preventDefault();
            reset();
            
            const target = e.currentTarget;
            target.classList.remove('tap-highlight');
            void target.offsetWidth;
            target.classList.add('tap-highlight');
            
            callback();
        }
    };

    return {
        touchstart: handler,
        touchend: handler,
        dblclick: (e) => {
            e.preventDefault();
            callback();
        }
    };
  }

  const omikujiArea = document.getElementById('omikuji-trigger-area');
  if (omikujiArea) {
    const handlers = createDoubleTapHandler(() => { 
        safeTrackEvent('select_content', { content_type: 'random_trigger', item_id: 'omikuji_double_tap' });
        playOmikuji(); 
    });
    omikujiArea.addEventListener('touchstart', handlers.touchstart, {passive: false});
    omikujiArea.addEventListener('touchend', handlers.touchend, {passive: false});
    omikujiArea.addEventListener('dblclick', handlers.dblclick);
  }

  const songHeader = document.getElementById('song-ranking-header');
  if (songHeader) {
    const handlers = createDoubleTapHandler(() => {
        safeTrackEvent('select_content', { content_type: 'random_trigger', item_id: 'song_ranking_double_tap' });
        const icon = document.getElementById('song-ranking-icon');
        if (icon) {
            icon.classList.remove('spin-once');
            void icon.offsetWidth; 
            icon.classList.add('spin-once');
        }
        const songs = Object.keys(songStats);
        if (songs.length === 0) return;
        const randomSong = songs[Math.floor(Math.random() * songs.length)];
        setTimeout(() => {
            selectSong(randomSong);
            document.getElementById('app').scrollTo({ top: 0, behavior: 'smooth' });
        }, 600);
    });
    
    songHeader.addEventListener('touchstart', handlers.touchstart, {passive: false});
    songHeader.addEventListener('touchend', handlers.touchend, {passive: false});
    songHeader.addEventListener('dblclick', handlers.dblclick);
  }

  // 追加：記録タブのランダム選曲
  const userSongHeader = document.getElementById('user-song-ranking-header');
  if (userSongHeader) {
    const handlers = createDoubleTapHandler(() => {
        safeTrackEvent('select_content', { content_type: 'random_trigger', item_id: 'user_song_ranking_double_tap' });
        
        const icon = document.getElementById('user-song-ranking-icon');
        if (icon) {
            icon.classList.remove('spin-once');
            void icon.offsetWidth;
            icon.classList.add('spin-once');
        }

        // 表示中のランキング（聴いた曲リスト）からランダムに選ぶ
        const stats = window.currentUserSongStats || {};
        const songs = Object.keys(stats);
        
        if (songs.length === 0) return;
        
        const randomSong = songs[Math.floor(Math.random() * songs.length)];
        
        setTimeout(() => {
            selectUserSong(randomSong);
        }, 600);
    });
    
    userSongHeader.addEventListener('touchstart', handlers.touchstart, {passive: false});
    userSongHeader.addEventListener('touchend', handlers.touchend, {passive: false});
    userSongHeader.addEventListener('dblclick', handlers.dblclick);
  }

  ['venue-tab-header', 'region-tab-header'].forEach(id => {
      const el = document.getElementById(id);
      if(el) {
          const handlers = createDoubleTapHandler(() => {
              if(!el.classList.contains('active')) return;
              safeTrackEvent('select_content', { content_type: 'random_trigger', item_id: id + '_double_tap' });

              if(id === 'venue-tab-header') {
                  const venues = [];
                  allLiveRecords.forEach(rec => {
                        const v = rec.region === 'オンライン' ? 'オンライン' : `${rec.venue} (${rec.region})`;
                        if (!venues.includes(v)) venues.push(v);
                  });
                  if(venues.length > 0) {
                      const randomVenue = venues[Math.floor(Math.random() * venues.length)];
                      selectVenue(randomVenue);
                  }
              } else {
                  const regions = [];
                  allLiveRecords.forEach(rec => {
                      if (rec.region && !regions.includes(rec.region)) regions.push(rec.region);
                  });
                  if(regions.length > 0) {
                      const randomRegion = regions[Math.floor(Math.random() * regions.length)];
                      selectRegion(randomRegion);
                  }
              }
          });
          el.addEventListener('touchstart', handlers.touchstart, {passive: false});
          el.addEventListener('touchend', handlers.touchend, {passive: false});
          el.addEventListener('dblclick', handlers.dblclick);
      }
  });
}

function playOmikuji() {
    const icon = document.getElementById('omikuji-icon');
    icon.classList.remove('spin-once');
    void icon.offsetWidth; 
    icon.classList.add('spin-once');

    const randomLive = allLiveRecords[Math.floor(Math.random() * allLiveRecords.length)];
    setTimeout(() => {
        showOmikujiResult(randomLive);
    }, 600);
}

function showOmikujiResult(rec) {
    safeTrackEvent('earn_virtual_currency', { 
        virtual_currency_name: 'omikuji', 
        value: 1, 
        item_name: rec.tourName 
    });

    const tourNameLower = rec.tourName.toLowerCase();
    let labelType = 'other', labelText = 'Event';
    if (tourNameLower.includes('love like pop')) { labelType = 'pop'; labelText = 'POP'; }
    else if (tourNameLower.includes('love like rock')) { labelType = 'rock'; labelText = 'ROCK'; }
    else if (tourNameLower.includes('love like aloha')) { labelType = 'aloha'; labelText = 'ALOHA'; }

    document.getElementById('modal-body').innerHTML = `
        <h2 class="font-bold text-center text-xl mb-4 text-aiko-pink">今日のラッキーセトリ🤞</h2>
        <div class="card-base live-card cursor-pointer shadow-md" onclick="closeModal(); showLiveDetail(allLiveRecords.find(r => r.date === '${rec.date}' && r.tourName === '${rec.tourName}' ))">
        <div class="live-card-label ${labelType}">${labelText}</div>
        <p class="text-gray-500 font-medium text-xs">${rec.date} (${rec.dayOfWeek})</p>
        <p class="font-bold mt-1 text-gray-800 text-lg leading-tight">${rec.tourName}</p>
        <p class="text-gray-600 text-sm mt-1">${rec.venue} (${rec.region})</p>
        <p class="mt-2 font-semibold text-aiko-pink text-sm">セットリスト: ${rec.songCount}曲</p>
      </div>
      <p class="text-center text-gray-400 text-xs mt-2">👆 タップで詳細へ</p>
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
}

function checkOrientation() {
  if ('ontouchend' in document && window.innerWidth > window.innerHeight) {
    document.body.classList.add('landscape');
  } else {
    document.body.classList.remove('landscape');
  }
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  if (anniversaryQueue.length > 0) {
      setTimeout(processNextAnniversary, 300);
  }
}

// -----------------------------------------------------------
// External Communication
// -----------------------------------------------------------

function safeTrackEvent(eventName, params) {
  try {
    if (typeof gtag === 'function') {
      gtag('event', eventName, params);
    }
  } catch (e) {
    console.warn('GA4 Tracking Error:', e);
  }
}

window.addEventListener('message', (event) => {
  if (event.data.type === 'userDataUpdated') {
    userUserData = event.data.data;
    if (!document.body.classList.contains('detail-view')) {
        applyFilters();
    } else if (currentDisplayingRecord) {
        const modal = document.getElementById('memo-modal');
        if (modal.style.display === 'none') {
            showLiveDetail(currentDisplayingRecord);
        }
    }
  }

  if (event.data.type === 'execLiveSearch') {
    if (typeof window.findAndShowLive === 'function') {
      window.findAndShowLive('', event.data.tourName);
    }
  }

  if (event.data.type === 'forceUpdateData') {
     console.log("Received update command from Hub. New Version:", event.data.newVersion);
     fetchAndHotSwap();
  }
});

async function fetchAndHotSwap() {
  try {
    const response = await fetch(`${API_URL}?action=getAllData`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    if (data.status !== 'error') {
      saveToCache(data);
      initializeApp(data);
      
      console.log("Data hot-swapped to latest.");
    }
  } catch (e) {
    console.error("Hot swap failed:", e);
  }
}

// -----------------------------------------------------------
// My LLDB Actions
// -----------------------------------------------------------

function openMyLLDBInfo() {
    const html = `
        <h2 class="font-bold text-center text-xl mb-4 text-aiko-pink">My LLDB とは？</h2>
        <div class="text-sm text-gray-600 leading-relaxed space-y-3">
            <p>あなたが参戦したライブや、思い出の公演を記録できる機能です。</p>
            <div class="bg-green-50 p-3 rounded-lg border border-green-100">
                <p class="font-bold text-green-800 mb-1">✅ 参戦記録</p>
                <p class="text-xs">公演詳細ページの「参戦しました！」をONにすると記録されます。</p>
            </div>
            <div class="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <p class="font-bold text-blue-800 mb-1">📝 メモ・リンク</p>
                <p class="text-xs">当時の思い出や、SNSの投稿リンクなどを公演ごとに保存できます。</p>
            </div>
            <p class="text-xs text-gray-400 mt-4">※記録は現在お使いのブラウザに保存されます。</p>
        </div>
    `;
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-overlay').style.display = 'flex';
}

function toggleAttendance(isChecked) {
    if (!userUserData.settings || !userUserData.settings.syncId) {
        document.getElementById('detail-attendance-toggle').checked = !isChecked;
        
        if(confirm('参戦記録をつけるには「My LLDB」の設定が必要です。\n設定画面を開きますか？')) {
            window.parent.postMessage({ type: 'openMyLLDB' }, '*');
        }
        return;
    }

    if (!currentDisplayingRecord) return;
    const dateId = currentDisplayingRecord.date;

    const currentData = (userUserData.attendedLives && userUserData.attendedLives[dateId]) || {};
    
    window.parent.postMessage({
        type: 'updateUserLiveRecord',
        id: dateId,
        attended: isChecked,
        memo: currentData.memo || '',
        link: currentData.link || ''
    }, '*');
    
    if(!userUserData.attendedLives) userUserData.attendedLives = {};
    if(!userUserData.attendedLives[dateId]) userUserData.attendedLives[dateId] = {};
    
    if(isChecked) {
    } else {
        delete userUserData.attendedLives[dateId];
    }
    showLiveDetail(currentDisplayingRecord);
}

function openMemoModal() {
    if (!currentDisplayingRecord) return;
    const dateId = currentDisplayingRecord.date;
    const data = (userUserData.attendedLives && userUserData.attendedLives[dateId]) || {};
    
    document.getElementById('memo-textarea').value = data.memo || '';
    
    document.getElementById('memo-modal').style.display = 'flex';
}

function closeMemoModal() {
    document.getElementById('memo-modal').style.display = 'none';
}

function saveMemo() {
    if (!currentDisplayingRecord) return;
    const dateId = currentDisplayingRecord.date;
    
    const memoVal = document.getElementById('memo-textarea').value;
    
    if(!userUserData.attendedLives) userUserData.attendedLives = {};
    if(!userUserData.attendedLives[dateId]) userUserData.attendedLives[dateId] = {};
    userUserData.attendedLives[dateId].memo = memoVal;
    userUserData.attendedLives[dateId].link = ''; 

    window.parent.postMessage({
        type: 'updateUserLiveRecord',
        id: dateId,
        attended: true,
        memo: memoVal,
        link: '' 
    }, '*');
    
    closeMemoModal();
    setTimeout(() => showLiveDetail(currentDisplayingRecord), 100);
}

function deleteMemo() {
    if(!confirm('メモを削除しますか？')) return;
    document.getElementById('memo-textarea').value = '';
    saveMemo();
}
