const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {Pool}=require('pg');
const app=express(),server=http.createServer(app),io=new Server(server,{maxHttpBufferSize:1e5});
app.use(express.static(path.join(__dirname,'public')));
app.use('/assets',express.static(path.join(__dirname,'assets')));
const FILE=path.join(__dirname,'sessions.json');
const sessions={};
const pool=process.env.DATABASE_URL ? new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:15000,idleTimeoutMillis:30000}) : null;
let saveQueue=Promise.resolve();
async function initializeStorage(){
 if(pool){
   await pool.query('CREATE TABLE IF NOT EXISTS escalation_state (id integer PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
   const result=await pool.query('SELECT data FROM escalation_state WHERE id=1');
   if(result.rows.length) Object.assign(sessions,result.rows[0].data);
   console.log('Supabase PostgreSQL storage connected; restored '+Object.keys(sessions).length+' sessions.');
 }else if(fs.existsSync(FILE)) Object.assign(sessions,JSON.parse(fs.readFileSync(FILE,'utf8')));
 else console.warn('DATABASE_URL not set: using local sessions.json (NOT durable on Render free).');
}
const secret=process.env.ADMIN_PASSWORD;
if(!secret)console.warn('WARNING: Set ADMIN_PASSWORD environment variable before exposing the server publicly.');
const uid=()=>crypto.randomBytes(12).toString('hex');
function save(){
 const snapshot=JSON.stringify(sessions);
 if(!pool){fs.writeFileSync(FILE,snapshot);return saveQueue;}
 saveQueue=saveQueue.catch(e=>{console.error('Previous database write failed:',e.message)}).then(()=>pool.query(
  'INSERT INTO escalation_state (id,data,updated_at) VALUES (1,$1::jsonb,now()) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()',
  [snapshot]
 )).catch(e=>{console.error('CRITICAL: Supabase save failed:',e.message)});
 return saveQueue;
}
function publicState(s){return {code:s.code,phase:s.phase,activeQuestion:s.activeQuestion,teacherName:s.teacherName}}
function adminState(s){return {...publicState(s),participants:Object.values(s.participants),votes:s.votes,questions:s.questions,studentVotes:s.studentVotes}}
function safeName(v){return String(v||'').trim().slice(0,24)}
function admin(socket,s){return socket.data.role==='admin'&&socket.data.code===s.code}
function broadcast(s){io.to(s.code).emit('state',publicState(s));io.to('admin:'+s.code).emit('adminState',adminState(s));io.to(s.code).emit('opinions',s.phase==='opinions'? Object.values(s.participants).filter(p=>p.student&&p.reason).map(p=>({id:p.id,name:p.name,student:p.student,reason:p.reason,votes:Object.values(s.votes).filter(v=>v[p.student]===p.id).length})):[])}
function ensure(s){if(!s)throw Error('세션을 찾을 수 없습니다.')}
function answerErr(socket,e){socket.emit('errorMessage',e.message||String(e))}
io.on('connection',socket=>{
 socket.on('create',({password,teacherName},cb)=>{try{if(!secret||password!==secret)throw Error('관리자 비밀번호가 올바르지 않거나 설정되지 않았습니다.');let code;do{code=String(100000+Math.floor(Math.random()*900000))}while(sessions[code]);sessions[code]={code,teacherName:safeName(teacherName)||'발표자',phase:'think',activeQuestion:0,participants:{},votes:{},questions:{},studentVotes:{}};socket.data={role:'admin',code};socket.join(code);socket.join('admin:'+code);save();broadcast(sessions[code]);cb({ok:true,code});}catch(e){cb({ok:false,error:e.message})}});
 socket.on('adminJoin',({code,password},cb)=>{try{const s=sessions[String(code)];ensure(s);if(!secret||password!==secret)throw Error('비밀번호가 틀렸습니다.');socket.data={role:'admin',code:s.code};socket.join(s.code);socket.join('admin:'+s.code);broadcast(s);cb({ok:true});}catch(e){cb({ok:false,error:e.message})}});
 socket.on('join',({code,name,participantId},cb)=>{try{const s=sessions[String(code)];ensure(s);let p=participantId&&s.participants[participantId];if(!p){if(!safeName(name))throw Error('이름 또는 별칭을 입력하세요.');p={id:uid(),name:safeName(name),student:null,confidence:70,reason:'',classification:[],answered:{}};s.participants[p.id]=p;} p.votes=s.votes[p.id]||{};socket.data={role:'participant',code:s.code,pid:p.id};socket.join(s.code);save();broadcast(s);cb({ok:true,participant:p,state:publicState(s)});}catch(e){cb({ok:false,error:e.message})}});
 socket.on('questionAnswer',({index,answer},cb)=>{try{const s=sessions[socket.data.code];ensure(s);if(socket.data.role!=='participant')throw Error('참가자 전용입니다.');if(s.phase!=='think')throw Error('지금은 THINK ROOM 응답 시간이 아닙니다.');if(index!==s.activeQuestion)throw Error('현재 공개된 질문에만 응답할 수 있습니다.');if(!Number.isInteger(answer)||answer<0||answer>3)throw Error('올바른 응답을 선택하세요.');let p=s.participants[socket.data.pid];p.answered[index]=answer;save();broadcast(s);cb?.({ok:true})}catch(e){cb?.({ok:false,error:e.message})}});
 socket.on('decision',({student,confidence,reason},cb)=>{try{const s=sessions[socket.data.code];ensure(s);if(socket.data.role!=='participant'||s.phase!=='mission')throw Error('현재 판단 제출 단계가 아닙니다.');if(!['A','B','C','D'].includes(student))throw Error('학생을 선택하세요.');reason=String(reason||'').trim();if(reason.length<15||reason.length>600)throw Error('선택 이유를 15~600자로 작성하세요.');if(!Number.isFinite(confidence)||confidence<0||confidence>100)throw Error('확신도가 올바르지 않습니다.');let p=s.participants[socket.data.pid];p.student=student;p.confidence=confidence;p.reason=reason;p.classification=[];save();broadcast(s);cb?.({ok:true})}catch(e){cb?.({ok:false,error:e.message})}});
 socket.on('classify',({values},cb)=>{try{const s=sessions[socket.data.code],p=s?.participants[socket.data.pid];ensure(s);if(!p?.reason)throw Error('판단을 먼저 제출해주세요.');p.classification=Array.isArray(values)?values.map(x=>String(x).slice(0,40)).slice(0,3):[];save();cb?.({ok:true})}catch(e){cb?.({ok:false,error:e.message})}});
 socket.on('vote',({student,targetId},cb)=>{try{const s=sessions[socket.data.code];ensure(s);if(socket.data.role!=='participant'||s.phase!=='opinions')throw Error('현재 최고 투표 단계가 아닙니다.');const p=s.participants[socket.data.pid],target=s.participants[targetId];if(!['A','B','C','D'].includes(student)||!target||target.student!==student||target.id===p.id)throw Error('자신을 제외한 해당 학생의 의견에만 투표할 수 있습니다.');s.votes[p.id]??={};s.votes[p.id][student]=target.id;save();broadcast(s);cb?.({ok:true})}catch(e){cb?.({ok:false,error:e.message})}});
 socket.on('control',({phase,activeQuestion},cb)=>{try{const s=sessions[socket.data.code];ensure(s);if(!admin(socket,s))throw Error('교수자 권한이 필요합니다.');if(phase!==undefined){if(!['think','mission','opinions','finished'].includes(phase))throw Error('잘못된 단계입니다.');s.phase=phase}if(activeQuestion!==undefined){if(!Number.isInteger(activeQuestion)||activeQuestion<0||activeQuestion>4)throw Error('질문 번호가 올바르지 않습니다.');s.activeQuestion=activeQuestion}save();broadcast(s);cb?.({ok:true})}catch(e){cb?.({ok:false,error:e.message})}});
 socket.on('getMine',cb=>{const s=sessions[socket.data.code];cb?.(s?.participants[socket.data.pid]||null)});
});
app.get('/api/status',(req,res)=>res.json({ok:true}));
initializeStorage().then(()=>server.listen(process.env.PORT||3000,()=>console.log('Escalation Room listening on port '+(process.env.PORT||3000)))).catch(e=>{console.error('Unable to initialize Supabase storage:',e);process.exit(1)});
process.on('SIGTERM',()=>{server.close();saveQueue.finally(()=>pool?.end()).finally(()=>process.exit(0));setTimeout(()=>process.exit(1),9000).unref()});
