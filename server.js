// M.E.A Digital — server permainan kelompok (guru memandu, murid main dari HP masing-masing)
const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const PORT=process.env.PORT||3000,END=21,MYST=5,MYST_TILE=9,CORRECT=[0,1,2,0,1,0,0,1];let ROOM=null;
const page=path.join(__dirname,'public','index.html');
const srv=http.createServer((q,r)=>q.url.startsWith('/ping')?r.end('mea'):fs.readFile(page,(e,d)=>{r.writeHead(e?500:200,{'Content-Type':'text/html; charset=utf-8'});r.end(e?'Error':d)}));
const wss=new WebSocketServer({server:srv});
const shuffle=a=>a.sort(()=>Math.random()-.5);
const mkRoom=()=>({code:'MEA',phase:'lobby',paused:false,players:[],turn:0,card:null,answered:null,move:null,log:[],deck:[],host:null,seq:0,born:Date.now()});
const send=(w,o)=>{if(w&&w.readyState===1)w.send(JSON.stringify(o))};
const BANK=require('./bank.json');
const SEQ=['M','E','C','A','S','M','E','C','A','S','M','E','X','A','S','C','M','E','S','A'],catOf=i=>i===9?'X':SEQ[(i<=8?i:i-1)-1];
function draw(R,i){const c=catOf(i);R.decks=R.decks||{};if(!(R.decks[c]&&R.decks[c].length))R.decks[c]=shuffle(BANK.cat.map((k,j)=>k===c?j:-1).filter(j=>j>=0));return R.decks[c].pop()}
const view=(R,h)=>({code:R.code,phase:R.phase,paused:R.paused,turn:R.turn,card:R.card,answered:R.answered,move:R.move,log:R.log.slice(-40),players:R.players.map(p=>({name:p.name,pos:p.pos,pts:p.pts,on:!!p.on,ref:h?(p.ref||null):!!p.ref}))});
const bc=R=>{const s=view(R),sh=view(R,1);R.players.forEach((p,i)=>send(p.ws,{t:'state',s,you:i}));send(R.host,{t:'state',s:sh,you:-1})};
function advance(R){R.card=null;R.answered=null;
  if(R.players.every(p=>p.pos>=END)){R.phase='done';return}
  let n=R.turn;for(let k=0;k<R.players.length;k++){n=(n+1)%R.players.length;if(R.players[n].pos<END)break}R.turn=n}
wss.on('connection',ws=>{let R=null,me=-2;
  ws.on('message',m=>{let d;try{d=JSON.parse(m)}catch{return}
    if(d.t==='host'){if(!ROOM)ROOM=mkRoom();R=ROOM;R.host=ws;me=-1;return bc(R)}
    if(d.t==='join'){R=ROOM;if(!R)return send(ws,{t:'err',m:'Guru belum membuka sesi. Tunggu sebentar lalu coba lagi ya.'});
      let i=R.players.findIndex(p=>p.tok&&p.tok===d.tok);
      if(i<0){if(R.phase!=='lobby')return send(ws,{t:'err',m:'Permainan sudah dimulai'});if(R.players.length>=12)return send(ws,{t:'err',m:'Kelompok penuh (maks. 12)'});
        i=R.players.push({name:String(d.name||'Anggota').slice(0,16),pos:0,pts:0,tok:String(d.tok||Math.random())})-1}
      const p=R.players[i];p.ws=ws;p.on=true;me=i;send(ws,{t:'joined'});return bc(R)}
    if(!R)return;const host=me===-1,P=R.players[me];
    if(host&&d.t==='clear'){R.players.forEach(p=>send(p.ws,{t:'kicked'}));ROOM=mkRoom();ROOM.host=ws;R=ROOM;return bc(R)}
    if(host&&d.t==='start'&&R.phase==='lobby'&&R.players.length){R.phase='play';R.turn=0;R.deck=shuffle([0,1,2,3,4,6,7]);return bc(R)}
    if(host&&d.t==='pause'){R.paused=!R.paused;return bc(R)}
    if(host&&d.t==='reset'){R.phase='lobby';R.paused=false;R.turn=0;R.card=null;R.answered=null;R.move=null;R.log=[];R.players.forEach(p=>{p.pos=0;p.pts=0;p.ref=null});return bc(R)}
    if(d.t==='reflect'&&P){const c=k=>String(d[k]||'').slice(0,600);P.ref={feel:c('feel'),learn:c('learn'),action:c('action')};return bc(R)}
    if(R.phase!=='play'||R.paused)return;
    if(d.t==='roll'&&me===R.turn&&R.card===null){const die=1+Math.floor(Math.random()*6),from=P.pos,to=Math.min(END,from+die);P.pos=to;
      R.card=draw(R,to);R.again=false;R.answered=null;{const fx=BANK.fx[R.card];if(BANK.kind[R.card]==='box'&&fx){if(fx.pts)P.pts+=fx.pts;if(fx.all)R.players.forEach(p=>p.pts+=fx.all);R.again=!!fx.again;R.answered={pick:-1,good:true,correct:-1,box:true};R.log.push({pi:me,card:R.card,box:true})}}R.move={seq:++R.seq,pi:me,from,to,die};return bc(R)}
    if(d.t==='done'&&me===R.turn&&R.card!==null&&!R.answered&&['act','share'].includes(BANK.kind[R.card])){const ok=!!d.ok;if(ok)P.pts+=10;R.answered={pick:-1,good:ok,correct:-1,done:true};R.log.push({pi:me,card:R.card,done:true,ok});return bc(R)}
    if(d.t==='answer'&&me===R.turn&&R.card!==null&&!R.answered&&BANK.kind[R.card]==='quiz'){const good=d.i===BANK.ans[R.card];if(good)P.pts+=10;
      R.answered={pick:d.i,good,correct:BANK.ans[R.card]};R.log.push({pi:me,card:R.card,pick:d.i,good});return bc(R)}
    if(d.t==='next'&&((me===R.turn&&R.answered)||host)){if(R.again&&R.players[R.turn].pos<END){R.again=false;R.card=null;R.answered=null}else{R.again=false;advance(R)}return bc(R)}
  });
  ws.on('close',()=>{if(!R)return;if(me===-1&&R.host===ws)R.host=null;else if(me>=0&&R.players[me].ws===ws)R.players[me].on=false;bc(R)});
});
setInterval(()=>{if(ROOM&&Date.now()-ROOM.born>12*36e5)ROOM=null},36e5);
srv.listen(PORT,'0.0.0.0',()=>{console.log('M.E.A Digital berjalan di port '+PORT)});
