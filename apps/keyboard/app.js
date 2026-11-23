(()=>{
  const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const keyboardBands={
    bottom:{whiteCodes:['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma'],whiteOffsets:[0,2,4,5,7,9,11,12],blackCodes:['KeyS','KeyD','KeyG','KeyH','KeyJ'],blackOffsets:[1,3,6,8,10]},
    top:{whiteCodes:['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight','Backslash'],whiteOffsets:[0,2,4,5,7,9,11,12,14,16,17,19,21],blackCodes:['Digit2','Digit3','Digit5','Digit6','Digit7','Digit9','Digit0','Minus','Equal'],blackOffsets:[1,3,6,8,10,13,15,18,20]}
  };
  const keyNames={KeyZ:'Z',KeyX:'X',KeyC:'C',KeyV:'V',KeyB:'B',KeyN:'N',KeyM:'M',Comma:',',KeyS:'S',KeyD:'D',KeyG:'G',KeyH:'H',KeyJ:'J',KeyQ:'Q',KeyW:'W',KeyE:'E',KeyR:'R',KeyT:'T',KeyY:'Y',KeyU:'U',KeyI:'I',KeyO:'O',KeyP:'P',BracketLeft:'[',BracketRight:']',Backslash:'\\',Digit2:'2',Digit3:'3',Digit5:'5',Digit6:'6',Digit7:'7',Digit9:'9',Digit0:'0',Minus:'-',Equal:'='};
  const $=id=>document.getElementById(id);
  const els={temperament:$('temperament'),tonic:$('tonic'),mode:$('mode'),reference:$('reference'),customWrap:$('customWrap'),customHz:$('customHz'),volume:$('volume'),transValue:$('transValue'),octValue:$('octValue'),sustain:$('sustain'),notesNow:$('notesNow'),audioStatus:$('audioStatus'),statusText:$('statusText'),keyboardOctave:$('keyboardOctave')};
  for(let i=0;i<12;i++){const option=document.createElement('option');option.value=i;option.textContent=names[i];els.tonic.append(option)}
  let audio=null,master=null,active=new Map(),held=new Set(),pointerNotes=new Map(),downCodes=new Map(),sustain=false,oct=2,keyboardOctave=0,transpose=0;
  const ratios={major:[1,9/8,5/4,4/3,3/2,5/3,15/8],minor:[1,9/8,6/5,4/3,3/2,8/5,9/5]};
  const degrees=[0,2,4,5,7,9,11];
  function getRef(){return els.reference.value==='custom'?Math.max(300,Math.min(500,Number(els.customHz.value)||440)):Number(els.reference.value)}
  function midiName(m){return names[((m%12)+12)%12]+(Math.floor(m/12)-1)}
  function freq(m){
    const soundingMidi=m+transpose;
    const tonicMidi=60+Number(els.tonic.value)+transpose;
    const rootHz=getRef()*Math.pow(2,(tonicMidi-69)/12);
    if(els.temperament.value!=='just')return getRef()*Math.pow(2,(soundingMidi-69)/12);
    const diff=soundingMidi-tonicMidi,d=((diff%12)+12)%12,octaves=Math.floor(diff/12),scale=ratios[els.mode.value];
    let bestDelta=99,ratio=1;
    degrees.forEach((degree,index)=>{const delta=((d-degree+18)%12)-6;if(Math.abs(delta)<Math.abs(bestDelta)){bestDelta=delta;ratio=scale[index]}});
    return rootHz*Math.pow(2,octaves)*ratio*Math.pow(2,bestDelta/12);
  }
  function ensureAudio(){
    if(!audio){audio=new(window.AudioContext||window.webkitAudioContext)();master=audio.createGain();master.gain.value=Number(els.volume.value);master.connect(audio.destination)}
    if(audio.state==='suspended')audio.resume();els.audioStatus.classList.add('ready');els.statusText.textContent='音声準備完了';
  }
  function refreshNotes(){els.notesNow.textContent=active.size?[...active.keys()].sort((a,b)=>a-b).map(m=>midiName(m+transpose)).join(' · '):'—'}
  function start(m){
    ensureAudio();
    if(active.has(m)){if(sustain&&!held.has(m)){stop(m);return}held.add(m);return}
    const now=audio.currentTime,gain=audio.createGain();gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.2,now+.035);gain.connect(master);
    const partials=[];
    [[1,.68],[2,.20],[3,.075],[4,.025]].forEach(([multiple,amplitude])=>{const oscillator=audio.createOscillator(),level=audio.createGain();oscillator.type='sine';oscillator.frequency.value=freq(m)*multiple;level.gain.value=amplitude;oscillator.connect(level);level.connect(gain);oscillator.start(now);partials.push({oscillator,multiple})});
    active.set(m,{gain,partials});held.add(m);document.querySelectorAll(`[data-midi="${m}"]`).forEach(key=>key.classList.add('active'));refreshNotes();
  }
  function stop(m){
    const voice=active.get(m);if(!voice)return;
    const now=audio.currentTime;voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setTargetAtTime(.0001,now,.045);
    voice.partials.forEach(({oscillator})=>{try{oscillator.stop(now+.24)}catch{}});active.delete(m);
    document.querySelectorAll(`[data-midi="${m}"]`).forEach(key=>key.classList.remove('active'));refreshNotes();
  }
  function release(m){if([...downCodes.values()].includes(m)||[...pointerNotes.values()].includes(m))return;held.delete(m);if(!sustain)stop(m)}
  function stopAll(){sustain=false;els.sustain.setAttribute('aria-pressed','false');els.sustain.querySelector('strong').textContent='OFF';[...active.keys()].forEach(stop);held.clear();pointerNotes.clear()}
  function keyboardCodesFor(band){
    const spec=keyboardBands[band],base=12*(oct+2)+12*keyboardOctave+(band==='top'?12:0),byMidi=new Map(),byCode=new Map();
    spec.whiteOffsets.forEach((offset,index)=>{const code=spec.whiteCodes[index],midi=base+offset;byMidi.set(midi,code);byCode.set(code,midi)});
    spec.blackOffsets.forEach((offset,index)=>{const code=spec.blackCodes[index],midi=base+offset;byMidi.set(midi,code);byCode.set(code,midi)});
    return {byMidi,byCode};
  }
  function updateKeyLabels(){document.querySelectorAll('.key[data-midi]').forEach(key=>{const midi=Number(key.dataset.midi),label=key.querySelector(':scope > span'),codes=keyboardCodesFor(key.dataset.band),code=codes.byMidi.get(midi);if(label)label.textContent=midiName(midi+transpose);let hint=key.querySelector('.kbd');if(code){if(!hint){hint=document.createElement('span');hint.className='kbd';key.append(hint)}hint.textContent=keyNames[code]||code}else if(hint)hint.remove()})}
  function updateKeyboardOctave(){els.keyboardOctave.textContent=(keyboardOctave>0?'+':'')+keyboardOctave+' oct';updateKeyLabels()}
  function updatePitches(){
    if(audio){const now=audio.currentTime;active.forEach((voice,m)=>voice.partials.forEach(({oscillator,multiple})=>oscillator.frequency.setTargetAtTime(freq(m)*multiple,now,.025)))}
    updateKeyLabels();refreshNotes();
  }
  function getWhiteOffsets(){const count=window.innerWidth<600?10:15;return Array.from({length:count},(_,index)=>[0,2,4,5,7,9,11][index%7]+12*Math.floor(index/7))}
  function buildRow(containerId,labelId,startMidi,band){
    const container=$(containerId);container.innerHTML='';const whiteOffsets=getWhiteOffsets(),whiteCount=whiteOffsets.length,lastOffset=whiteOffsets[whiteOffsets.length-1];$(labelId).textContent=`${midiName(startMidi+transpose)} – ${midiName(startMidi+lastOffset+transpose)}`;
    function addKey(m,black=false,left=0){
      const key=document.createElement('div');key.className=black?'key black':'key';key.dataset.midi=m;key.dataset.band=band;if(active.has(m))key.classList.add('active');if(black){key.style.left=`${left*100/whiteCount}%`;key.style.width=`${58/whiteCount}%`;}
      const code=keyboardCodesFor(band).byMidi.get(m);key.innerHTML=`<span>${midiName(m+transpose)}</span>${code?`<span class="kbd">${keyNames[code]||code}</span>`:''}`;
      key.addEventListener('pointerdown',event=>{event.preventDefault();key.setPointerCapture(event.pointerId);pointerNotes.set(event.pointerId,m);start(m)});
      container.append(key);
    }
    whiteOffsets.forEach((offset,index)=>addKey(startMidi+offset,false,index));
    for(let offset=1;offset<=lastOffset;offset++){if(!names[offset%12].includes('♯'))continue;const preceding=whiteOffsets.filter(note=>note<offset).length;addKey(startMidi+offset,true,preceding)}
    container.onpointermove=event=>{
      if(!pointerNotes.has(event.pointerId))return;
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.key[data-midi]');
      const previous=pointerNotes.get(event.pointerId),next=target?Number(target.dataset.midi):null;
      if(previous===next)return;
      if(next===null){pointerNotes.delete(event.pointerId);if(previous!==undefined)release(previous);return}
      pointerNotes.set(event.pointerId,next);if(previous!==undefined)release(previous);start(next);
    };
    const finishPointer=event=>{if(!pointerNotes.has(event.pointerId))return;const midi=pointerNotes.get(event.pointerId);pointerNotes.delete(event.pointerId);release(midi)};
    container.onpointerup=finishPointer;container.onpointercancel=finishPointer;
  }
  function render(){
    const pointerRelease=[...pointerNotes.values()];pointerNotes.clear();pointerRelease.forEach(release);
    buildRow('keys1','rowLabel1',12*(oct+3),'top');
    buildRow('keys2','rowLabel2',12*(oct+1),'bottom');
    const last=getWhiteOffsets().at(-1);els.octValue.textContent=`C${oct}–${midiName(12*(oct+1)+last)} / C${oct+2}–${midiName(12*(oct+3)+last)}`;
  }
  function updateTranspose(){
    els.transValue.textContent=(transpose>0?'+':'')+transpose+' semitone'+(Math.abs(transpose)===1?'':'s');
    document.querySelectorAll('.row-label').forEach((label,index)=>{const start=12*(oct+(index===0?3:1)),last=getWhiteOffsets().at(-1);label.textContent=`${midiName(start+transpose)} – ${midiName(start+last+transpose)}`});
    updatePitches();
  }
  document.addEventListener('keydown',event=>{
    if(event.repeat||event.target.matches('input,select,button'))return;
    if(event.code==='ArrowDown'||event.code==='ArrowUp'){event.preventDefault();keyboardOctave=Math.max(-2,Math.min(2,keyboardOctave+(event.code==='ArrowUp'?1:-1)));updateKeyboardOctave();return}
    const bottom=keyboardCodesFor('bottom').byCode,top=keyboardCodesFor('top').byCode,midi=bottom.get(event.code)??top.get(event.code);
    if(midi===undefined)return;event.preventDefault();if(downCodes.has(event.code))return;downCodes.set(event.code,midi);start(midi);
  });
  document.addEventListener('keyup',event=>{if(!downCodes.has(event.code))return;const midi=downCodes.get(event.code);downCodes.delete(event.code);release(midi)});
  document.addEventListener('change',event=>{if(event.target.matches('select,input[type=range],input[type=number]'))event.target.blur()});
  document.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>button.blur()));
  window.addEventListener('blur',()=>{const released=[...downCodes.values()];downCodes.clear();released.forEach(release);if(!sustain)[...active.keys()].forEach(stop)});
  els.temperament.addEventListener('change',updatePitches);els.tonic.addEventListener('change',updatePitches);els.mode.addEventListener('change',updatePitches);
  els.reference.addEventListener('change',()=>{els.customWrap.hidden=els.reference.value!=='custom';updatePitches()});els.customHz.addEventListener('input',updatePitches);
  els.volume.addEventListener('input',()=>{if(master)master.gain.setTargetAtTime(Number(els.volume.value),audio.currentTime,.02)});
  $('transDown').onclick=()=>{transpose=Math.max(-12,transpose-1);updateTranspose()};$('transUp').onclick=()=>{transpose=Math.min(12,transpose+1);updateTranspose()};$('transReset').onclick=()=>{transpose=0;updateTranspose()};
  $('octDown').onclick=()=>{oct=Math.max(0,oct-1);render()};$('octUp').onclick=()=>{oct=Math.min(7,oct+1);render()};$('stopAll').onclick=stopAll;
  els.sustain.onclick=()=>{sustain=!sustain;els.sustain.setAttribute('aria-pressed',String(sustain));els.sustain.querySelector('strong').textContent=sustain?'ON':'OFF';if(!sustain)[...active.keys()].filter(m=>!held.has(m)).forEach(stop)};
  function setTheme(dark){document.documentElement.dataset.theme=dark?'dark':'light';document.querySelector('meta[name=theme-color]').content=dark?'#171a17':'#f3f0e8';const button=$('themeToggle');button.setAttribute('aria-pressed',String(dark));button.querySelector('.theme-icon').textContent=dark?'☀':'☾';button.querySelector('.theme-label').textContent=dark?'ライト':'ダーク';try{localStorage.setItem('oto-keyboard-theme',dark?'dark':'light')}catch{}}
  let dark=false;try{dark=localStorage.getItem('oto-keyboard-theme')==='dark'}catch{}setTheme(dark);$('themeToggle').onclick=()=>setTheme(document.documentElement.dataset.theme!=='dark');
  let lastCompact=window.innerWidth<600;window.addEventListener('resize',()=>{const compact=window.innerWidth<600;if(compact!==lastCompact){lastCompact=compact;render()}});
  updateKeyboardOctave();render();if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
