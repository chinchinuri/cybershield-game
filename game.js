const $=id=>document.getElementById(id);
const screens={menu:$("menu"),how:$("how"),game:$("game"),results:$("results")};
const canvas=$("canvas"),ctx=canvas.getContext("2d");
let W,H,dpr,raf,last,spawnTimer,gameTime,score,hp,hits,attempts,combo,maxCombo,wave,paused,running,threats,particles;
let bonuses,bonusTimer,effects,boss,bossActive,bossPhaseEnd,bossDefeated,audioCtx,soundEnabled,typeStats,falseBlocks;

// Design tokens — single source of truth for the game's palette, shared with style.css (:root).
// Офіційна палітра Держспецзв'язку (gold/blue/ink/bg) — див. THEME.md.
const THEME={
 gold:"#FFD96A",goldRGB:"255,217,106",
 blue:"#263D9D",blueRGB:"38,61,157",
 ink:"#000000",
 bg:"#000120",
 danger:"#f04a3c",dangerRGB:"240,74,60",
 info:"#69a7c9",infoRGB:"105,167,201",
 success:"#69e0a0",successRGB:"105,224,160",
 warning:"#f2952c",
 boss:"#c04af0",bossRGB:"192,74,240",
 textSoft:"#dbe6ef",
 gridRGB:"38,61,157",
 nodeRGB:"104,130,151",
 shieldFillRGB:"13,42,68",
 bubbleBgRGB:"6,18,34"
};

const TYPES={
 ddos:{speed:125,r:9,damage:4,points:100,shape:"circle"},
 malware:{speed:74,r:15,damage:10,points:180,shape:"diamond"},
 scout:{speed:205,r:7,damage:6,points:150,shape:"ring"},
 phishing:{speed:92,r:18,damage:12,points:260,shape:"phish"},
 normal:{speed:105,r:15,damage:0,points:0,shape:"normal"}
};
const BONUS_TYPES={
 quick:{label:"ШВИДКЕ РЕАГУВАННЯ",icon:"⚡",effect:"slow",duration:5},
 shield:{label:"РЕЗЕРВНА КОПІЯ",icon:"⛨",effect:"shield",duration:0},
 heal:{label:"ПОСИЛЕНИЙ ЗАХИСТ",icon:"✚",effect:"heal",duration:0},
 intel:{label:"КІБЕРРОЗВІДКА",icon:"◎",effect:"multiplier",duration:6}
};
const PHISHING_MSGS=[
 "Ваш акаунт буде заблоковано. Підтвердіть пароль за посиланням.",
 "Терміново! Оновіть дані картки, натисніть тут.",
 "Ви виграли приз! Заберіть за посиланням протягом години.",
 "Підтвердіть вхід, натиснувши посилання нижче.",
 "Вашу посилку затримано. Сплатіть мито за посиланням."
];
const LEGIT_MSGS=[
 "Нагадування: завтра планове технічне обслуговування.",
 "Ваш звіт успішно збережено на сервері.",
 "Новий документ додано до спільної теки.",
 "Пароль змінено адміністратором за вашим запитом.",
 "Заплановане оновлення ПЗ виконано успішно."
];
function truncateMsg(s){return s.length>30?s.slice(0,29)+"…":s}
function isHarmless(t){return t.type==="normal"||(t.type==="phishing"&&t.msgPhish===false)}
const UKRAINE_PTS=[[0.08,0.18],[0.24,0.09],[0.42,0.07],[0.58,0.11],[0.74,0.20],[0.90,0.34],
 [0.93,0.48],[0.86,0.56],[0.80,0.63],[0.72,0.68],[0.63,0.72],[0.60,0.80],[0.58,0.93],
 [0.53,0.80],[0.50,0.74],[0.40,0.79],[0.27,0.76],[0.16,0.68],[0.09,0.56],[0.05,0.42],[0.03,0.28]];
function drawUkraineMap(){
 let minX=1,maxX=0,minY=1,maxY=0;
 UKRAINE_PTS.forEach(p=>{minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1])});
 const bw=maxX-minX,bh=maxY-minY,cx=(minX+maxX)/2,cy=(minY+maxY)/2,size=Math.min(W,H)*.52,scale=size/Math.max(bw,bh),c=center();
 ctx.save();ctx.beginPath();
 UKRAINE_PTS.forEach((p,i)=>{const x=c.x+(p[0]-cx)*scale,y=c.y+(p[1]-cy)*scale;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)});
 ctx.closePath();
 const glow=.10+Math.sin(gameTime*.8)*.03;
 ctx.fillStyle=`rgba(${THEME.blueRGB},${.02+glow*.18})`;ctx.fill();
 ctx.strokeStyle=`rgba(${THEME.goldRGB},${.07+glow*.4})`;ctx.lineWidth=1;ctx.stroke();
 ctx.restore();
}
const TYPE_LABELS={ddos:"DDoS",malware:"ШКІДЛИВЕ ПЗ",scout:"РОЗВІДНИК",phishing:"ФІШИНГ"};
const TYPE_ICONS={ddos:"●",malware:"◆",scout:"◇",phishing:"▣"};
const ACH=[
 {id:"hits100",title:"100 ВІДБИТИХ АТАК",icon:"🛡",check:s=>s.hits>=100},
 {id:"combo10",title:"COMBO ×10",icon:"🔥",check:s=>s.maxCombo>=10},
 {id:"perfect",title:"100% ТОЧНІСТЬ",icon:"🎯",check:s=>s.attempts>0&&s.hits===s.attempts},
 {id:"boss",title:"КІБЕРШТУРМ ВІДБИТО",icon:"🏆",check:s=>s.bossDefeated},
 {id:"survivor",title:"СТІЙКІСТЬ 100%",icon:"💪",check:s=>s.hpEnd>=100}
];

function show(s){Object.values(screens).forEach(x=>x.classList.remove("active"));s.classList.add("active")}
function resize(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+"px";canvas.style.height=H+"px";ctx.setTransform(dpr,0,0,dpr,0,0)}
addEventListener("resize",resize);resize();

soundEnabled=localStorage.cyberShieldSound!=="off";
function updateSoundBtn(){const b=$("soundBtn");if(b)b.textContent="ЗВУК: "+(soundEnabled?"УВІМК":"ВИМК")}
function ensureAudio(){if(!audioCtx){try{audioCtx=new (window.AudioContext||window.webkitAudioContext)()}catch(e){soundEnabled=false}}}
function beep(freq,dur,type,vol){if(!soundEnabled)return;ensureAudio();if(!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type||"sine";o.frequency.value=freq;g.gain.value=vol||.06;o.connect(g);g.connect(audioCtx.destination);o.start();g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+dur);o.stop(audioCtx.currentTime+dur)}
function playSound(kind){
 if(kind==="hit")beep(520,.08,"square",.05);
 else if(kind==="miss")beep(140,.25,"sawtooth",.07);
 else if(kind==="combo")beep(720,.12,"triangle",.06);
 else if(kind==="bonus")beep(880,.15,"sine",.07);
 else if(kind==="boss_hit")beep(300,.1,"square",.06);
 else if(kind==="alarm"){beep(200,.3,"sawtooth",.09);setTimeout(()=>beep(160,.3,"sawtooth",.09),200)}
 else if(kind==="victory"){beep(660,.15,"triangle",.08);setTimeout(()=>beep(880,.2,"triangle",.08),150)}
}

$("playBtn").onclick=startGame;$("againBtn").onclick=startGame;$("howBtn").onclick=()=>show(screens.how);$("backBtn").onclick=()=>show(screens.menu);$("menuBtn").onclick=()=>show(screens.menu);
$("pauseBtn").onclick=()=>{paused=!paused;$("pauseBtn").textContent=paused?"▶":"Ⅱ";if(!paused)last=performance.now()};
$("shareBtn").onclick=openShare;$("closeShare").onclick=()=>$("shareModal").classList.remove("open");
$("copyBtn").onclick=async()=>{const text=`КІБЕРЩИТ — ${Math.floor(score).toLocaleString("uk-UA")} балів. Відбито атак: ${hits}. Точність: ${attempts?Math.round(hits/attempts*100):100}%.`;try{await navigator.clipboard.writeText(text);$("copyBtn").textContent="СКОПІЙОВАНО ✓";setTimeout(()=>$("copyBtn").textContent="КОПІЮВАТИ РЕЗУЛЬТАТ",1400)}catch{alert(text)}};
if($("soundBtn")){updateSoundBtn();$("soundBtn").onclick=()=>{soundEnabled=!soundEnabled;localStorage.cyberShieldSound=soundEnabled?"on":"off";updateSoundBtn();if(soundEnabled)beep(600,.08,"sine",.05)}}

function startGame(){
 show(screens.game);score=0;hp=100;hits=0;attempts=0;combo=0;maxCombo=0;wave=1;gameTime=0;paused=false;running=true;
 threats=[];particles=[];bonuses=[];bonusTimer=9;effects={slowUntil:0,shieldCharges:0,multiplierUntil:0};
 typeStats={ddos:{stopped:0,leaked:0},malware:{stopped:0,leaked:0},scout:{stopped:0,leaked:0},phishing:{stopped:0,leaked:0}};falseBlocks=0;
 boss=null;bossActive=false;bossPhaseEnd=0;bossDefeated=false;
 spawnTimer=.2;last=performance.now();$("pauseBtn").textContent="Ⅱ";$("objective").textContent="ЗАХИСТИ СИСТЕМУ";if($("bossBar"))$("bossBar").classList.remove("show");
 $("toast").classList.remove("show");$("toast").textContent="";$("combo").classList.remove("show");
 updateHUD();requestAnimationFrame(loop);
}
function center(){return{x:W/2,y:H/2+10}}
function pickType(){
 if(gameTime>70&&Math.random()<.12)return"phishing";
 if(gameTime>48&&Math.random()<.09)return"normal";
 const keys=wave>=4?["ddos","ddos","malware","scout","scout","phishing"]:wave>=2?["ddos","ddos","malware","scout"]:["ddos","ddos","scout","malware"];
 return keys[Math.floor(Math.random()*keys.length)];
}
function spawn(){
 const type=pickType(),a=Math.random()*Math.PI*2,dist=Math.max(W,H)*.58+45,c=center();
 const obj={type,x:c.x+Math.cos(a)*dist,y:c.y+Math.sin(a)*dist,phase:Math.random()*6.28};
 if(type==="phishing"){obj.msgPhish=Math.random()<.72;obj.msg=(obj.msgPhish?PHISHING_MSGS:LEGIT_MSGS)[Math.floor(Math.random()*5)]}
 threats.push(obj);
}
function spawnBonus(){
 const keys=Object.keys(BONUS_TYPES),kind=keys[Math.floor(Math.random()*keys.length)],a=Math.random()*Math.PI*2,dist=Math.max(W,H)*.55+45,c=center();
 bonuses.push({kind,x:c.x+Math.cos(a)*dist,y:c.y+Math.sin(a)*dist,phase:Math.random()*6.28});
}
function burst(x,y,normal=false){for(let i=0;i<(normal?8:16);i++){const a=Math.random()*Math.PI*2,s=normal?30+Math.random()*70:40+Math.random()*130;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.45})}}

function currentMultiplier(){let m=combo>=10?2:combo>=5?1.5:1;if(gameTime<effects.multiplierUntil)m*=1.5;return m}

function applyBonus(b){
 const d=BONUS_TYPES[b.kind];
 if(d.effect==="slow")effects.slowUntil=gameTime+d.duration;
 if(d.effect==="multiplier")effects.multiplierUntil=gameTime+d.duration;
 if(d.effect==="shield")effects.shieldCharges++;
 if(d.effect==="heal")hp=Math.min(100,hp+15);
 toast(d.icon+" "+d.label);
 playSound("bonus");
}
function absorbDamage(){
 if(effects.shieldCharges>0){effects.shieldCharges--;toast("⛨ РЕЗЕРВНА КОПІЯ ПОГЛИНУЛА АТАКУ");return true}
 return false;
}

function hitThreat(t){
 const i=threats.indexOf(t);if(i<0)return;threats.splice(i,1);const d=TYPES[t.type];attempts++;
 if(isHarmless(t)){hp=Math.max(0,hp-9);combo=0;falseBlocks++;toast(t.type==="phishing"?"ЦЕ ЛЕГІТИМНЕ ПОВІДОМЛЕННЯ — НЕ БЛОКУЙ":"ЦЕ НОРМАЛЬНИЙ ТРАФІК — НЕ БЛОКУЙ");burst(t.x,t.y,true);playSound("miss");return}
 hits++;combo++;maxCombo=Math.max(maxCombo,combo);score+=d.points*currentMultiplier();typeStats[t.type].stopped++;burst(t.x,t.y);showCombo();playSound(combo>=5?"combo":"hit");
}
function hitBonus(b){
 const i=bonuses.indexOf(b);if(i<0)return;bonuses.splice(i,1);applyBonus(b);burst(b.x,b.y);
}
function hitBoss(){
 if(!boss)return;boss.hp--;score+=140*currentMultiplier();burst(boss.x,boss.y);playSound("boss_hit");
 if(boss.hp<=0){bossDefeated=true;toast("⚔ КІБЕРШТУРМ ВІДБИТО");playSound("victory");score+=1500;endBossPhase()}
}
function showCombo(){if(combo<3)return;$("combo").textContent=`COMBO ×${combo}`;$("combo").classList.remove("show");void $("combo").offsetWidth;$("combo").classList.add("show")}
function toast(t){$("toast").textContent=t;$("toast").classList.remove("show");void $("toast").offsetWidth;$("toast").classList.add("show")}

canvas.addEventListener("pointerdown",e=>{
 if(!running||paused)return;const x=e.clientX,y=e.clientY;
 if(boss){const db=Math.hypot(boss.x-x,boss.y-y);if(db<boss.r+18){hitBoss();return}}
 let found=null,best=Infinity;
 for(const b of bonuses){const d=Math.hypot(b.x-x,b.y-y);if(d<28&&d<best){found={obj:b,kind:"bonus"};best=d}}
 for(const t of threats){const d=Math.hypot(t.x-x,t.y-y),r=TYPES[t.type].r+16;if(d<r&&d<best){found={obj:t,kind:"threat"};best=d}}
 if(found&&found.kind==="bonus")hitBonus(found.obj);
 else if(found&&found.kind==="threat")hitThreat(found.obj);
 else{attempts++;combo=0}
});

function startBossPhase(){
 bossActive=true;bossPhaseEnd=gameTime+22;boss={x:center().x,y:center().y-190,r:34,hp:16,maxHp:16,angle:0};
 threats.length=0;$("objective").textContent="ПЕРЕМОЖИ КІБЕРШТУРМ";toast("⚠ УВАГА: КІБЕРШТУРМ");playSound("alarm");
 if($("bossBar"))$("bossBar").classList.add("show");
}
function endBossPhase(){
 bossActive=false;boss=null;if($("bossBar"))$("bossBar").classList.remove("show");endGame();
}

function loop(now){
 if(!running)return;
 if(!paused){
  const dt=Math.min((now-last)/1000,.05);last=now;gameTime+=dt;
  if(!bossActive){
   wave=Math.min(5,1+Math.floor(gameTime/20));
   spawnTimer-=dt;const interval=Math.max(.17,.62-wave*.075);if(spawnTimer<=0){spawn();spawnTimer=interval*(.65+Math.random()*.55)}
   bonusTimer-=dt;if(bonusTimer<=0){spawnBonus();bonusTimer=13+Math.random()*7}
   if(gameTime>=100&&!bossDefeated)startBossPhase();
  }else{
   spawnTimer-=dt;if(spawnTimer<=0){spawn();spawnTimer=.42}
   boss.angle+=dt*.5;const cc=center();boss.x=cc.x+Math.cos(boss.angle)*150;boss.y=cc.y+Math.sin(boss.angle)*150;
   if($("bossHp"))$("bossHp").style.width=Math.max(0,boss.hp/boss.maxHp*100)+"%";
   if(gameTime>=bossPhaseEnd)endBossPhase();
  }
  const slow=gameTime<effects.slowUntil?0.45:1;
  const c=center();
  for(let i=threats.length-1;i>=0;i--){const t=threats[i],d=TYPES[t.type],dx=c.x-t.x,dy=c.y-t.y,len=Math.hypot(dx,dy),step=d.speed*slow*dt;t.x+=dx/len*step;t.y+=dy/len*step;
   if(len<38){if(!isHarmless(t)){typeStats[t.type].leaked++;if(!absorbDamage()){hp=Math.max(0,hp-d.damage);toast(t.type==="phishing"?"ФІШИНГ ПРОЙШОВ":"АТАКА ПРОЙШЛА")}}threats.splice(i,1);combo=0;attempts++;burst(c.x,c.y)}
  }
  for(let i=bonuses.length-1;i>=0;i--){const b=bonuses[i],dx=c.x-b.x,dy=c.y-b.y,len=Math.hypot(dx,dy),step=60*dt;b.x+=dx/len*step;b.y+=dy/len*step;if(len<38)bonuses.splice(i,1)}
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.97;p.vy*=.97;p.life-=dt;if(p.life<=0)particles.splice(i,1)}
  updateHUD();if(hp<=0&&!bossActive)endGame();if(hp<=0&&bossActive)endBossPhase();
 }
 draw();raf=requestAnimationFrame(loop);
}
function updateHUD(){$("hp").textContent=Math.round(hp)+"%";$("hpBar").style.width=hp+"%";$("wave").textContent=bossActive?"⚔":wave;$("score").textContent=Math.floor(score).toLocaleString("uk-UA")}

function draw(){
 ctx.clearRect(0,0,W,H);ctx.fillStyle=THEME.bg;ctx.fillRect(0,0,W,H);const c=center();
 ctx.lineWidth=1;ctx.strokeStyle=`rgba(${THEME.gridRGB},.20)`;
 for(let x=0;x<W;x+=48){ctx.beginPath();ctx.moveTo(x,65);ctx.lineTo(x,H);ctx.stroke()}
 for(let y=80;y<H;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
 drawUkraineMap();
 ctx.strokeStyle=`rgba(${THEME.goldRGB},.09)`;for(let a=0;a<Math.PI*2;a+=Math.PI/6){ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(c.x+Math.cos(a)*Math.max(W,H),c.y+Math.sin(a)*Math.max(W,H));ctx.stroke()}
 const hpRatio=hp/100,shieldColor=hpRatio>.5?THEME.gold:hpRatio>.25?THEME.warning:THEME.danger;
 const pulse=1+Math.sin(gameTime*3)*.03;
 ctx.save();ctx.translate(c.x,c.y);ctx.scale(pulse,pulse);ctx.beginPath();ctx.moveTo(0,-58);ctx.lineTo(48,-42);ctx.lineTo(40,30);ctx.lineTo(0,62);ctx.lineTo(-40,30);ctx.lineTo(-48,-42);ctx.closePath();ctx.fillStyle=`rgba(${THEME.shieldFillRGB},.94)`;ctx.fill();ctx.strokeStyle=shieldColor;ctx.lineWidth=2;ctx.stroke();
 ctx.beginPath();ctx.arc(0,0,26,0,Math.PI*2);ctx.strokeStyle=shieldColor+"88";ctx.stroke();ctx.fillStyle=shieldColor;ctx.font="bold 21px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("⌁",0,0);
 if(effects.shieldCharges>0){ctx.beginPath();ctx.arc(0,0,70,0,Math.PI*2);ctx.strokeStyle=`rgba(${THEME.infoRGB},.5)`;ctx.lineWidth=2;ctx.setLineDash([6,6]);ctx.stroke();ctx.setLineDash([])}
 ctx.restore();
 const labels=["ДЕРЖАВА","МЕРЕЖІ","ДАНІ","ВЕБ","ІНФРА"];
 for(let i=0;i<5;i++){const a=-Math.PI/2+i*Math.PI*2/5;const x=c.x+Math.cos(a)*112,y=c.y+Math.sin(a)*112;
  ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle=`rgba(${THEME.goldRGB},.55)`;ctx.fill();
  ctx.fillStyle=`rgba(${THEME.nodeRGB},.55)`;ctx.font="8px system-ui";ctx.textAlign="center";ctx.fillText(labels[i],x,y+16)}
 if(boss){ctx.save();ctx.translate(boss.x,boss.y);const bp=1+Math.sin(gameTime*4)*.05;ctx.scale(bp,bp);ctx.shadowBlur=26;ctx.shadowColor=THEME.boss;ctx.strokeStyle=THEME.boss;ctx.fillStyle=`rgba(${THEME.bossRGB},.18)`;ctx.lineWidth=3;
  ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2===0?boss.r:boss.r*.6;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle=THEME.boss;ctx.font="bold 18px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("☠",0,1);ctx.restore()}
 for(const b of bonuses){const d=BONUS_TYPES[b.kind];ctx.save();ctx.translate(b.x,b.y);const bp=1+Math.sin(gameTime*5+b.phase)*.12;ctx.scale(bp,bp);ctx.shadowBlur=16;ctx.shadowColor=THEME.success;ctx.strokeStyle=THEME.success;ctx.fillStyle=`rgba(${THEME.successRGB},.16)`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=THEME.success;ctx.font="bold 15px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(d.icon,0,1);ctx.restore()}
 for(const t of threats){const d=TYPES[t.type],col=t.type==="normal"?THEME.info:THEME.danger,colRGB=t.type==="normal"?THEME.infoRGB:THEME.dangerRGB;ctx.save();ctx.translate(t.x,t.y);ctx.shadowBlur=18;ctx.shadowColor=col;ctx.strokeStyle=col;ctx.fillStyle=`rgba(${colRGB},.15)`;ctx.lineWidth=2;
   if(d.shape==="diamond"){ctx.rotate(Math.PI/4);ctx.fillRect(-d.r/1.4,-d.r/1.4,d.r*1.4,d.r*1.4);ctx.strokeRect(-d.r/1.4,-d.r/1.4,d.r*1.4,d.r*1.4)}
   else if(d.shape==="ring"){ctx.beginPath();ctx.arc(0,0,d.r,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(0,0,d.r/2,0,Math.PI*2);ctx.stroke()}
   else if(d.shape==="phish"){ctx.beginPath();ctx.roundRect(-d.r*1.1,-d.r*.72,d.r*2.2,d.r*1.44,4);ctx.fill();ctx.stroke();ctx.fillStyle=col;ctx.font="bold 9px system-ui";ctx.textAlign="center";ctx.fillText("!",0,3);
    if(t.msg){ctx.font="8px system-ui";const label=truncateMsg(t.msg),tw=ctx.measureText(label).width+12;
     ctx.fillStyle=`rgba(${THEME.bubbleBgRGB},.88)`;ctx.strokeStyle=`rgba(${THEME.infoRGB},.4)`;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(-tw/2,-d.r*1.3-18,tw,15,4);ctx.fill();ctx.stroke();
     ctx.fillStyle=THEME.textSoft;ctx.textAlign="center";ctx.fillText(label,0,-d.r*1.3-10)}}
   else{ctx.beginPath();ctx.arc(0,0,d.r,0,Math.PI*2);ctx.fill();ctx.stroke()}
   ctx.restore()
 }
 for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/.45);ctx.fillStyle=THEME.gold;ctx.fillRect(p.x,p.y,3,3);ctx.globalAlpha=1}
}

function loadAchievements(){try{return JSON.parse(localStorage.cyberShieldAch||"[]")}catch(e){return[]}}
function saveAchievements(list){localStorage.cyberShieldAch=JSON.stringify(list)}
function renderAchievements(stats){
 const box=$("achievements");if(!box)return;box.innerHTML="";
 const earnedBefore=loadAchievements(),earnedNow=[...earnedBefore];
 ACH.forEach(a=>{
  const unlocked=a.check(stats)||earnedBefore.includes(a.id);
  if(unlocked&&!earnedNow.includes(a.id))earnedNow.push(a.id);
  const el=document.createElement("div");el.className="badge"+(unlocked?" unlocked":"");
  el.innerHTML=`<span class="badge-icon">${a.icon}</span><span class="badge-title">${a.title}</span>`;
  box.appendChild(el);
 });
 saveAchievements(earnedNow);
}

function renderTypeStats(){
 const box=$("typeStats");if(!box)return;box.innerHTML="";
 Object.keys(TYPE_LABELS).forEach(k=>{
  const s=typeStats[k],total=s.stopped+s.leaked,pct=total?Math.round(s.stopped/total*100):100;
  const row=document.createElement("div");row.className="type-row";
  row.innerHTML=`<span class="type-icon">${TYPE_ICONS[k]}</span><span class="type-name">${TYPE_LABELS[k]}</span><span class="type-nums">${s.stopped}/${total}<i>${pct}%</i></span>`;
  box.appendChild(row);
 });
 const fb=document.createElement("div");fb.className="type-row false";
 fb.innerHTML=`<span class="type-icon">⚠</span><span class="type-name">ПОМИЛКОВІ БЛОКУВАННЯ</span><span class="type-nums">${falseBlocks}</span>`;
 box.appendChild(fb);
}

function endGame(){
 if(!running)return;running=false;const final=Math.floor(score),best=Math.max(Number(localStorage.cyberShieldBest||0),final);localStorage.cyberShieldBest=best;$("bestScore").textContent=best.toLocaleString("uk-UA");
 $("finalScore").textContent=final.toLocaleString("uk-UA");$("finalHits").textContent=hits;$("finalAccuracy").textContent=(attempts?Math.round(hits/attempts*100):100)+"%";$("finalCombo").textContent="×"+maxCombo;
 $("resultTitle").textContent=bossDefeated?"КІБЕРШТУРМ ВІДБИТО":(hp>0?"КІБЕРЩИТ ВИСТОЯВ":"СИСТЕМУ ПОТРІБНО ВІДНОВИТИ");
 renderTypeStats();
 renderAchievements({hits,attempts,maxCombo,bossDefeated,hpEnd:hp});
 show(screens.results);
}
function openShare(){
 $("shareScore").textContent=Math.floor(score).toLocaleString("uk-UA");$("shareHits").textContent=hits;$("shareAccuracy").textContent=(attempts?Math.round(hits/attempts*100):100)+"%";$("shareModal").classList.add("open");
}
$("bestScore").textContent=Number(localStorage.cyberShieldBest||0).toLocaleString("uk-UA");
