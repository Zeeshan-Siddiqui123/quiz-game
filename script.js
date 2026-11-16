(() => {
  'use strict';

  const SIZE = 12;
  const MAX_WORD_LENGTH = 9;
  const ROUND_SECONDS = 300;
  const STORAGE_KEY = 'word-swipe-quiz-scores-v2';
  const CATEGORY_STORAGE_KEY = 'word-swipe-quiz-category-v1';
  const STRAIGHT_DIRECTIONS = [[0,1],[1,0]];
  const DIAGONAL_DIRECTIONS = [[1,1],[1,-1]];
  const CATEGORIES = [
    {key:'cricket',name:'Cricket',button:'Cricket Logo Quiz',levels:8,description:'Find team logos from PSL, international cricket, IPL, BBL, CPL, SA20, ILT20 and MLC.'},
    {key:'famous_brands',name:'Famous Brands',button:'Famous brands logo quiz',levels:6,description:'Match famous brand logos to their names.'},
    {key:'mlb',name:'MLB',button:'MLB logo quiz',levels:3,description:'Find the Major League Baseball team logos.'},
    {key:'nba',name:'NBA',button:'NBA logo quiz',levels:3,description:'Find the National Basketball Association team logos.'},
    {key:'nfl',name:'NFL',button:'NFL logo quiz',levels:3,description:'Find the National Football League team logos.'},
    {key:'uefa_soccer',name:'UEFA Soccer',button:'UEFA Soccer Team logo quiz',levels:4,description:'Find European football club logos.'},
    {key:'video_games',name:'Video Games & Gaming Studios',button:'Video Games logo quiz',levels:3,description:'Find iconic video game studios, publishers, and console brands.'},
    {key:'design_a_logo',name:'Design a Logo',button:'Design a Logo',levels:0,description:''}
  ];

  function initialCategoryIndex() {
    try {
      const saved = localStorage.getItem(CATEGORY_STORAGE_KEY);
      if (saved) {
        const idx = CATEGORIES.findIndex(c => c.key === saved);
        if (idx !== -1 && CATEGORIES[idx]?.key !== 'design_a_logo') return idx;
      }
    } catch (_) {}
    return 0;
  }

  const categoryTotalLevels = () => activeCategory()?.levels || 8;

  const COLOR_CLASSES = ['found-0','found-1','found-2','found-3','found-4','found-5'];
  const gridEl = document.getElementById('word-grid');
  const timerEl = document.getElementById('timer');
  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');
  const dialog = document.getElementById('game-dialog');
  const dialogTitle = document.getElementById('dialog-title');
  const dialogMessage = document.getElementById('dialog-message');
  const dialogKicker = document.getElementById('dialog-kicker');
  const dialogAction = document.getElementById('dialog-action');
  const playerNameWrap = document.getElementById('player-name-wrap');
  const playerName = document.getElementById('player-name');
  let categoryIndex = initialCategoryIndex(), roundIndex = 0, remaining = ROUND_SECONDS, totalElapsed = 0;
  let usedLogos = new Map();
  let grid = [], placements = [], currentRoundItems = [], found = new Set(), selected = [], pointerStart = null, timerId = null, paused = false, dialogMode = '';

  const activeCategory = () => CATEGORIES[categoryIndex];
  const randomInt = max => Math.floor(Math.random() * max);
  const shuffle = items => { const shuffled=[...items]; for(let i=shuffled.length-1;i>0;i--){const j=randomInt(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];} return shuffled; };
  const companyLogoUrl = domain => `https://api.companyenrich.com/logo/${encodeURIComponent(domain)}`;

  const SHORT_ANSWERS = {
    "Arizona Diamondbacks":"DBACKS","Boston Red Sox":"REDSOX","Chicago White Sox":"WHITESOX",
    "H&M":"HANDM","Louis Vuitton":"VUITTON","Mercedes-Benz":"MERCEDES","Under Armour":"ARMOUR",
    "San Francisco 49ers":"NINERS","Philadelphia 76ers":"SIXERS","Manchester City":"MANCITY",
    "Manchester United":"MANUTD","Newcastle United":"NEWCASTLE","Atletico Madrid":"ATLETICO",
    "Real Madrid":"MADRID","Inter Milan":"INTER","AC Milan":"MILAN","Paris Saint-Germain":"PSG",
    "RB Leipzig":"LEIPZIG","Karachi Kings":"KARACHI","Islamabad United":"ISLAMABAD",
    "Lahore Qalandars":"LAHORE","Peshawar Zalmi":"PESHAWAR","Quetta Gladiators":"QUETTA",
    "Multan Sultans":"MULTAN","Pakistan (PCB)":"PAKISTAN","India (BCCI)":"INDIA",
    "Australia (CA)":"AUSTRALIA","England (ECB)":"ENGLAND","South Africa (CSA)":"SAFRICA",
    "New Zealand (NZC)":"NEWZEAL","West Indies (CWI)":"WINDIES","Sri Lanka (SLC)":"SRILANKA",
    "Bangladesh (BCB)":"BANGLA","Afghanistan (ACB)":"AFGHAN","Netherlands":"HOLLAND",
    "Chennai Super Kings":"CSK","Delhi Capitals":"DELHI","Gujarat Titans":"GUJARAT",
    "Kolkata Knight Riders":"KKR","Lucknow Super Giants":"LUCKNOW","Mumbai Indians":"MUMBAI",
    "Punjab Kings":"PUNJAB","Rajasthan Royals":"RAJASTHAN","Royal Challengers Bengaluru":"RCB",
    "Sunrisers Hyderabad":"SUNRISE","Trinbago Knight Riders":"TRINBAGO","Adelaide Strikers":"STRIKERS",
    "Brisbane Heat":"BRISBANE","Hobart Hurricanes":"HOBART","Melbourne Renegades":"RENEGADES",
    "Melbourne Stars":"MELBOURNE","Perth Scorchers":"SCORCHERS","Sydney Sixers":"SYDNEY",
    "Sydney Thunder":"THUNDER","The Hundred (All 8 Teams)":"HUNDRED",
    "Washington Commanders":"COMMANDER","Galatasaray":"GALA","Fenerbahce":"FENER","Rawalpindi":"PINDI",
    "PlayStation":"PLAYSTN","Activision":"ACTIVISN","2K Games":"TWOK",
    "Square Enix":"SQUARE","Bandai Namco":"NAMCO","Riot Games":"RIOT",
    "Epic Games":"EPIC","Rockstar Games":"ROCKSTAR","Insomniac Games":"INSOMNIAC",
    "Lucasfilm Games":"LUCASFILM","Naughty Dog":"NAUGHTY"
  };

  function answerCandidates(name) {
    const candidates=[];
    if(SHORT_ANSWERS[name])candidates.push(SHORT_ANSWERS[name]);
    const normalized=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
    const tokens=normalized.replace(/49ERS/g,'NINERS').replace(/76ERS/g,'SIXERS').match(/[A-Z]+/g)||[];
    const compact=tokens.join('');
    if(compact.length>=2&&compact.length<=MAX_WORD_LENGTH)candidates.push(compact);
    for(const token of [...tokens].reverse())if(token.length>=2&&token.length<=MAX_WORD_LENGTH)candidates.push(token);
    for(let i=tokens.length-2;i>=0;i--){
      const joined=`${tokens[i]}${tokens[i+1]}`;
      if(joined.length>=2&&joined.length<=MAX_WORD_LENGTH)candidates.push(joined);
    }
    return [...new Set(candidates)];
  }

  function logoPool(index) {
    if(CATEGORIES[index]?.key==='design_a_logo')return [];
    const catalog=window.LOGO_CATALOG;
    if(!catalog)return [];
    const entries=index===0
      ? Object.values(catalog.cricket||{}).flat()
      : catalog[activeCategory().key]||[];
    return entries.filter(e => e.name && e.domain && answerCandidates(e.name).length > 0);
  }
  function directionsForLevel(level) {
    const total = categoryTotalLevels();
    const directions=[...STRAIGHT_DIRECTIONS];
    const reverseThreshold = total <= 4 ? 2 : 3;
    const diagonalThreshold = total <= 4 ? total : 6;
    if(level>=reverseThreshold) directions.push(...STRAIGHT_DIRECTIONS.map(([dr,dc])=>[-dr,-dc]));
    if(level>=diagonalThreshold) directions.push(...DIAGONAL_DIRECTIONS,...DIAGONAL_DIRECTIONS.map(([dr,dc])=>[-dr,-dc]));
    return directions;
  }

  function chooseLevelItems(pool, level) {
    const total = categoryTotalLevels();
    const used = usedLogos.get(categoryIndex) || new Set();
    const available = shuffle(pool.filter(item => !used.has(item.name)));
    const repeats = shuffle(pool.filter(item => used.has(item.name)));
    const orderedCandidates = [...available, ...repeats];

    const step = Math.min(Math.floor(((level - 1) / Math.max(1, total - 1)) * 7), 7);
    const minLengths = [2,3,4,4,5,5,6,7];
    const maxLengths = [5,6,6,7,7,8,8,9];
    const minLength = minLengths[step];
    const maxLength = maxLengths[step];

    const chosen = [];
    const chosenWords = new Set();

    function pickWord(item) {
      const candidates = answerCandidates(item.name);
      const preferred = candidates.find(c => c.length >= minLength && c.length <= maxLength && !chosenWords.has(c));
      if (preferred) return preferred;
      return candidates.find(c => !chosenWords.has(c));
    }

    for (const item of orderedCandidates) {
      if (chosen.length >= 6) break;
      const candidates = answerCandidates(item.name);
      const word = candidates.find(c => c.length >= minLength && c.length <= maxLength && !chosenWords.has(c));
      if (word) {
        chosen.push({ word, name: item.name, domain: item.domain });
        chosenWords.add(word);
      }
    }

    if (chosen.length < 6) {
      for (const item of orderedCandidates) {
        if (chosen.length >= 6) break;
        if (chosen.some(c => c.name === item.name)) continue;
        const word = pickWord(item);
        if (word) {
          chosen.push({ word, name: item.name, domain: item.domain });
          chosenWords.add(word);
        }
      }
    }

    chosen.sort((a,b) => a.word.length - b.word.length);
    const nextUsed = new Set(used);
    chosen.forEach(item => nextUsed.add(item.name));
    usedLogos.set(categoryIndex, nextUsed);
    return chosen;
  }

  function generateGrid(words) {
    const directions=directionsForLevel(roundIndex+1);
    for (let generation = 0; generation < 60; generation++) {
      const cells = Array.from({length:SIZE}, () => Array(SIZE).fill(''));
      const placedWords = [];
      for (const word of [...words].sort((a,b) => b[0].length - a[0].length)) {
        let placed = false;
        for (let attempt = 0; attempt < 900 && !placed; attempt++) {
          const [dr,dc] = directions[randomInt(directions.length)];
          const row = randomInt(SIZE), col = randomInt(SIZE);
          const endRow = row + dr * (word[0].length - 1), endCol = col + dc * (word[0].length - 1);
          if (endRow < 0 || endRow >= SIZE || endCol < 0 || endCol >= SIZE) continue;
          const coords = []; let fits = true;
          for (let i=0; i<word[0].length; i++) {
            const r=row+dr*i, c=col+dc*i;
            if (cells[r][c] && cells[r][c] !== word[0][i]) { fits=false; break; }
            coords.push([r,c]);
          }
          if (!fits) continue;
          coords.forEach(([r,c], i) => cells[r][c]=word[0][i]);
          placedWords.push({word:word[0], coords}); placed=true;
        }
        if (!placed) break;
      }
      if (placedWords.length === words.length) {
        for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(!cells[r][c]) cells[r][c]=String.fromCharCode(65+randomInt(26));
        return {cells,placedWords};
      }
    }
    const cells = Array.from({length:SIZE}, () => Array(SIZE).fill(''));
    const placedWords = [];
    words.forEach((word, idx) => {
      const w = word[0];
      const r = Math.min(idx * 2, SIZE - 1), c = 0;
      const coords = [];
      for(let i=0; i<w.length; i++) { cells[r][c+i] = w[i]; coords.push([r, c+i]); }
      placedWords.push({word:w, coords});
    });
    for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(!cells[r][c]) cells[r][c]=String.fromCharCode(65+randomInt(26));
    return {cells,placedWords};
  }

  function renderClues() {
    const words = currentRoundItems;
    [['clues-left',words.slice(0,3),0],['clues-right',words.slice(3),3],['clues-mobile',words,0]].forEach(([id,subset,offset]) => {
      const host=document.getElementById(id); host.replaceChildren();
      subset.forEach((item,i) => {
        const {word,name,domain}=item,index=Number(offset)+i,isFound=found.has(word);
        const card=document.createElement('div'); card.className='clue-card'+(isFound?' found':'');
        const tab=document.createElement('span'); tab.className='clue-tab'; tab.textContent=isFound?word:'?';
        const picture=document.createElement('span'); picture.className='clue-picture';
        picture.setAttribute('role','img');
        picture.setAttribute('aria-label',domain?`${name} logo`:`${name} logo unavailable`);
        if(domain){const image=document.createElement('img');image.src=companyLogoUrl(domain);image.alt=`${name} logo`;image.loading='lazy';image.onerror=()=>{image.remove();picture.classList.add('logo-unavailable');};picture.append(image);}
        const answer=document.createElement('span'); answer.className='clue-answer'; answer.textContent=isFound?'FOUND':'';
        card.append(tab,picture,answer); host.append(card);
      });
    });
  }

  function renderGrid() {
    gridEl.replaceChildren();
    const ownerMap=new Map();
    placements.forEach((p,i)=>p.coords.forEach(([r,c])=>{
      const key=`${r},${c}`; if(!ownerMap.has(key)) ownerMap.set(key,[]); ownerMap.get(key).push(i);
    }));
    for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) {
      const cell=document.createElement('div'); cell.className='cell'; cell.textContent=grid[r][c]; cell.dataset.row=r; cell.dataset.col=c;
      cell.setAttribute('role','gridcell'); cell.setAttribute('aria-label',`${grid[r][c]}, row ${r+1}, column ${c+1}`);
      const owners=ownerMap.get(`${r},${c}`)||[]; const foundOwner=owners.find(i=>found.has(placements[i].word));
      if(foundOwner!==undefined) cell.classList.add('found',COLOR_CLASSES[foundOwner%COLOR_CLASSES.length]);
      gridEl.append(cell);
    }
  }

  function updateStats() {
    timerEl.textContent=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
    scoreEl.textContent=`${found.size} / 6`; levelEl.textContent=`${roundIndex+1} / ${categoryTotalLevels()}`;
  }

  function startTimer() {
    clearInterval(timerId);
    timerId=setInterval(()=>{ if(paused)return; remaining--; totalElapsed++; updateStats(); if(remaining<=0) timeUp(); },1000);
  }

  function setCategory(index, shouldScroll = true) {
    if(CATEGORIES[index]?.key==='design_a_logo')return;
    categoryIndex=index;
    try {
      localStorage.setItem(CATEGORY_STORAGE_KEY, activeCategory().key);
    } catch (_) {}
    usedLogos.set(index,new Set());
    document.getElementById('quiz-title').textContent=`Word Swipe Quiz: ${activeCategory().name}`;
    document.getElementById('quiz-description').textContent=activeCategory().description;
    document.querySelectorAll('.game-option').forEach(button=>{const selected=Number(button.dataset.category)===index;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
    startRound(0,true);
    if(shouldScroll){
      document.getElementById('game').scrollIntoView({behavior:'smooth',block:'start'});
    }
  }

  function renderOptions() {
    const host=document.getElementById('game-options'); host.replaceChildren();
    CATEGORIES.forEach((category,index)=>{
      const button=document.createElement('button'); button.type='button'; button.className='game-option'+(index===categoryIndex?' active':''); button.textContent=category.button; button.dataset.category=index; button.setAttribute('aria-pressed',String(index===categoryIndex));
      if(category.key==='design_a_logo'){button.setAttribute('aria-disabled','true');button.title='This option is not active yet.';}
      else button.addEventListener('click',()=>setCategory(index));
      host.append(button);
    });
  }

  function startRound(index,resetElapsed=false) {
    clearInterval(timerId); roundIndex=index; remaining=ROUND_SECONDS; found=new Set(); selected=[]; pointerStart=null;
    if(resetElapsed) totalElapsed=0;
    const pool=logoPool(categoryIndex);
    currentRoundItems=chooseLevelItems(pool,roundIndex+1);
    if(currentRoundItems.length<6){console.error('The selected quiz category needs at least six logo options.');return;}
    const generated=generateGrid(currentRoundItems.map(item=>[item.word])); grid=generated.cells; placements=generated.placedWords;
    renderGrid(); renderClues(); updateStats(); paused=false; startTimer();
  }

  function cellAtPoint(x,y) { const node=document.elementFromPoint(x,y); return node?.classList.contains('cell')?node:null; }
  function getLine(start,end) {
    const dr=Number(end.dataset.row)-Number(start.dataset.row),dc=Number(end.dataset.col)-Number(start.dataset.col);
    if(dr===0&&dc===0) return [start];
    const level=roundIndex+1;
    const allowed=directionsForLevel(level);
    const sr=Math.sign(dr),sc=Math.sign(dc);
    if(!allowed.some(([r,c])=>r===sr&&c===sc)) return null;
    if(!(dr===0||dc===0||Math.abs(dr)===Math.abs(dc))) return null;
    const count=Math.max(Math.abs(dr),Math.abs(dc)),cells=[];
    for(let i=0;i<=count;i++) { const cell=gridEl.querySelector(`[data-row="${Number(start.dataset.row)+sr*i}"][data-col="${Number(start.dataset.col)+sc*i}"]`); if(cell)cells.push(cell); }
    return cells;
  }
  function showSelection(cells) { selected.forEach(cell=>cell.classList.remove('selected')); selected=cells; selected.forEach(cell=>cell.classList.add('selected')); }
  function finishSelection() {
    if(selected.length<2){showSelection([]);return;}
    const letters=selected.map(cell=>cell.textContent).join('');
    const match=placements.find(p=>!found.has(p.word)&&p.word===letters);
    if(!match){showSelection([]);return;}
    found.add(match.word); const wordIndex=placements.indexOf(match);
    selected.forEach(cell=>{cell.classList.remove('selected');cell.classList.add('found',COLOR_CLASSES[wordIndex%COLOR_CLASSES.length]);}); selected=[]; renderClues(); updateStats();
    if(found.size===6){clearInterval(timerId);paused=true;setTimeout(showLevelComplete,250);}
  }

  gridEl.addEventListener('pointerdown',event=>{const cell=event.target.closest('.cell');if(!cell||paused)return;event.preventDefault();pointerStart=cell;try{gridEl.setPointerCapture(event.pointerId);}catch(_){}showSelection([cell]);});
  gridEl.addEventListener('pointermove',event=>{if(!pointerStart||paused)return;const cell=cellAtPoint(event.clientX,event.clientY);if(!cell)return;const line=getLine(pointerStart,cell);if(line)showSelection(line);});
  gridEl.addEventListener('pointerup',()=>{if(pointerStart)finishSelection();pointerStart=null;});
  gridEl.addEventListener('pointercancel',()=>{pointerStart=null;showSelection([]);});

  function showDialog(mode,kicker,title,message,action,askName=false) {
    paused=true;dialogMode=mode;document.getElementById('dialog-kicker').textContent=kicker;dialogTitle.textContent=title;dialogMessage.textContent=message;playerNameWrap.hidden=!askName;dialogAction.textContent=action;
    if(dialog.open)dialog.close();dialog.showModal();if(askName)setTimeout(()=>playerName.focus(),60);
  }
  function showLevelComplete() {
    const total = categoryTotalLevels();
    if(roundIndex === total - 1) showDialog('victory','PERFECT SCORE','You found them all!',`You completed all ${total} levels. Add your name to this week’s top scorer board.`,'Save Score',true);
    else showDialog('next','GREAT WORK','Level complete!',`All six words found! ${timerEl.textContent} remains on the clock.`,'Next Level →');
  }
  function timeUp() { clearInterval(timerId);paused=true;showDialog('timeup','TIME’S UP','The clock ran out.','Start from level one and see if you can beat your score.','Play Again'); }
  function help() { clearInterval(timerId);showDialog('help','HOW TO PLAY','Find a word. Swipe it.',`Swipe in any straight direction on early levels. From level 3, words can be placed in reverse directions. From level 6, diagonal words join in. Find all six before the five-minute timer reaches zero.`,'Got it'); }

  function weekKey(date=new Date()) {
    const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);
    const start=new Date(Date.UTC(d.getUTCFullYear(),0,1));const week=Math.ceil((((d-start)/86400000)+1)/7);return `${d.getUTCFullYear()}-${String(week).padStart(2,'0')}`;
  }
  function readScores() { try { const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return Array.isArray(data[weekKey()])?data[weekKey()]:[]; } catch(_){return [];} }
  function saveScore() {
    const total = categoryTotalLevels();
    try { const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'),week=weekKey(),scores=Array.isArray(data[week])?data[week]:[];scores.push({name:(playerName.value.trim().slice(0,20)||'Player'),level:total,seconds:totalElapsed,date:Date.now()});scores.sort((a,b)=>b.level-a.level||a.seconds-b.seconds||a.date-b.date);data[week]=scores.slice(0,10);localStorage.setItem(STORAGE_KEY,JSON.stringify(data)); }catch(_){}
    playerName.value='';
    renderLeaderboard();
  }
  function formatTime(seconds) { return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`; }
  function renderLeaderboard() {
    const body=document.getElementById('leaderboard-body');body.replaceChildren();const scores=readScores();
    if(!scores.length){const row=body.insertRow();const cell=row.insertCell();cell.colSpan=3;cell.textContent='No data found.';return;}
    scores.slice(0,10).forEach((score,index)=>{const row=body.insertRow();[score.name||'Player',String(score.level||8),formatTime(Number(score.seconds)||0)].forEach((value,i)=>{const cell=row.insertCell();cell.textContent=i===0?`${String(index+1).padStart(2,'0')}. ${value}`:value;});});
  }

  function closeDialog(mode) {
    dialogMode='';if(dialog.open)dialog.close();
    if(mode==='help'){paused=false;startTimer();}
    else if(mode==='next')startRound(roundIndex+1);
    else if(mode==='victory'){saveScore();usedLogos.set(categoryIndex,new Set());startRound(0,true);}
    else if(mode==='timeup'){usedLogos.set(categoryIndex,new Set());startRound(0,true);}
  }
  dialogAction.addEventListener('click',()=>{const mode=dialogMode;const asksName=mode==='victory';if(asksName)saveScore();dialogMode='';dialog.close();if(mode==='help'){paused=false;startTimer();}else if(mode==='next')startRound(roundIndex+1);else if(mode==='victory'||mode==='timeup'){usedLogos.set(categoryIndex,new Set());startRound(0,true);}});
  document.getElementById('dialog-close').addEventListener('click',()=>closeDialog(dialogMode));
  dialog.addEventListener('cancel',event=>event.preventDefault());
  document.getElementById('help-open').addEventListener('click',help);
  document.getElementById('show-scorer').addEventListener('click',()=>document.getElementById('top-scorer').scrollIntoView({behavior:'smooth',block:'center'}));
  const mobileMenu=document.getElementById('mobile-menu'),navigation=document.getElementById('navigation');
  mobileMenu.addEventListener('click',()=>{const open=navigation.classList.toggle('open');mobileMenu.setAttribute('aria-expanded',String(open));mobileMenu.textContent=open?'×':'☰';});
  navigation.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{navigation.classList.remove('open');mobileMenu.setAttribute('aria-expanded','false');mobileMenu.textContent='☰';}));

  renderOptions();renderLeaderboard();setCategory(categoryIndex,false);
})();
