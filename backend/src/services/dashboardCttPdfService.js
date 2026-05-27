import PDFDocument from 'pdfkit';
import { getColheitaPostgresSummary } from './dashboardColheitaPostgresService.js';

const COLORS = {
  bg: '#020814', panel: '#07101d', card: '#0b1423', card2: '#0f1f37', border: '#1e2d45', grid: '#17304a',
  text: '#f8fbff', muted: '#9aa8bf', blue: '#60a5fa', green: '#25d6a5', amber: '#f6b73c', purple: '#b985ff', red: '#ff6166', orange: '#fb923c'
};
const FRONT_COLORS = [COLORS.green, COLORS.blue, COLORS.amber, COLORS.purple, COLORS.red, '#34d399', '#f59e0b', '#5ba6ff', '#2dd4bf', '#a78bfa'];
function n(v){ const x = Number(v); return Number.isFinite(x) ? x : 0; }
function fmt(v,d=0){ return new Intl.NumberFormat('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n(v)); }
function nowBR(){ return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short', timeStyle:'short', timeZone:'America/Sao_Paulo'}).format(new Date()); }
function dateBR(v){ if(!v) return ''; const [y,m,d] = String(v).slice(0,10).split('-'); return y && m && d ? `${d}/${m}/${y}` : String(v); }
function shortLabel(v, max = 16){ const s = String(v ?? ''); return s.length > max ? `${s.slice(0,max-1)}…` : s; }
function valueOf(obj, keys){ for (const k of keys) { if (obj && obj[k] !== undefined && obj[k] !== null) return n(obj[k]); } return 0; }
function roundedPanel(doc,x,y,w,h){ doc.roundedRect(x,y,w,h,12).fillAndStroke(COLORS.panel, COLORS.border); }
function header(doc, title, subtitle, filters = {}){
  doc.rect(0,0,doc.page.width,doc.page.height).fill(COLORS.bg);
  doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(17).text(title,28,22);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5).text(subtitle || 'Relatório gerado pelo servidor',28,44,{width:430});
  const info = [`Gerado em ${nowBR()}`];
  if(filters?.safra) info.push(`Safra ${filters.safra}`);
  if(filters?.dataInicio || filters?.dataFim) info.push(`${dateBR(filters.dataInicio)} até ${dateBR(filters.dataFim)}`);
  doc.fillColor('#d4aa4a').font('Helvetica').fontSize(8).text(info.join('  |  '),500,30,{width:315,align:'right'});
}
function addPage(doc, title, subtitle, filters){ doc.addPage(); header(doc,title,subtitle,filters); }
function metricCard(doc,x,y,w,h,title,value,suffix='',color=COLORS.blue){
  doc.roundedRect(x,y,w,h,10).fillAndStroke(COLORS.card, COLORS.border);
  doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(6.4).text(String(title||'').toUpperCase(),x+10,y+10,{characterSpacing:1.1,width:w-20});
  doc.fillColor(color).font('Helvetica-Bold').fontSize(15).text(String(value),x+10,y+29,{width:w-42});
  if(suffix) doc.fillColor('#d7e0f2').font('Helvetica').fontSize(7).text(suffix,x+w-38,y+35,{width:32,align:'right'});
}
function doubleMetricCard(doc,x,y,w,h,title,aLabel,aValue,bLabel,bValue){
  doc.roundedRect(x,y,w,h,10).fillAndStroke(COLORS.card, COLORS.border);
  doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(6.4).text(String(title).toUpperCase(),x+10,y+8,{characterSpacing:1.1,width:w-20});
  const mid = x + w/2;
  doc.fillColor(COLORS.muted).fontSize(5.8).text(aLabel.toUpperCase(),x+10,y+28,{characterSpacing:.8});
  doc.fillColor(COLORS.red).fontSize(13).text(aValue,x+10,y+40,{continued:true}); doc.fontSize(7).text(' %');
  doc.moveTo(mid,y+27).lineTo(mid,y+h-10).strokeColor('#30425c').lineWidth(.7).stroke();
  doc.fillColor(COLORS.muted).fontSize(5.8).text(bLabel.toUpperCase(),mid+10,y+28,{characterSpacing:.8});
  doc.fillColor(COLORS.amber).fontSize(13).text(bValue,mid+10,y+40,{continued:true}); doc.fontSize(7).text(' %');
}
function chartTitle(doc,x,y,title,subtitle){
  doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(11).text(title,x+16,y+14,{width:330});
  if(subtitle) doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text(subtitle,x+16,y+30,{width:340});
}
function axes(doc,x,y,w,h,max,labels=true){
  const left=38, right=18, top=48, bottom=32;
  const baseY=y+h-bottom, plotTop=y+top, plotH=baseY-plotTop, plotW=w-left-right;
  doc.strokeColor(COLORS.grid).lineWidth(.45).dash(2,4);
  for(let i=0;i<=4;i++){ const yy=baseY-(plotH*i/4); doc.moveTo(x+left,yy).lineTo(x+left+plotW,yy).stroke(); if(labels){ doc.fillColor(COLORS.muted).font('Helvetica').fontSize(5.8).text(fmt(max*i/4),x+5,yy-4,{width:28,align:'right'}); } }
  doc.undash();
  return {left,right,top,bottom,baseY,plotTop,plotH,plotW,max:Math.max(max,1)};
}
function drawBars(doc,x,y,w,h,data,labelKey,valueKey,opts={}){
  roundedPanel(doc,x,y,w,h); chartTitle(doc,x,y,opts.title,opts.subtitle);
  const values = (data || []).map(r => valueOf(r, Array.isArray(valueKey) ? valueKey : [valueKey]));
  const max = Math.max(opts.meta || 0, ...values, 1) * (opts.topPaddingFactor || 1.12);
  const a = axes(doc,x,y,w,h,max,opts.yLabels !== false);
  if(opts.meta){ const my = a.baseY-(n(opts.meta)/a.max)*a.plotH; doc.strokeColor(opts.metaColor || COLORS.amber).dash(4,4).moveTo(x+a.left,my).lineTo(x+a.left+a.plotW,my).stroke().undash(); doc.fillColor(opts.metaColor || COLORS.amber).font('Helvetica-Bold').fontSize(6.5).text(`Meta ${fmt(opts.meta, opts.decimals || 0)}`,x+w-84,my-11,{width:66,align:'right'}); }
  const arr = data || [];
  const gap = arr.length > 20 ? 2 : 5;
  const bw = Math.max(4, Math.min(26, (a.plotW / Math.max(arr.length,1)) - gap));
  arr.forEach((r,i)=>{
    const v = valueOf(r, Array.isArray(valueKey) ? valueKey : [valueKey]);
    const bh = (v/a.max)*a.plotH;
    const xx = x+a.left + (a.plotW/Math.max(arr.length,1))*i + Math.max(0, ((a.plotW/Math.max(arr.length,1))-bw)/2);
    const col = r.fill || opts.color || FRONT_COLORS[i % FRONT_COLORS.length];
    doc.roundedRect(xx,a.baseY-bh,bw,Math.max(bh,0),3).fill(col);
    if(v>0 && arr.length <= 16) doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(6).text(fmt(v, opts.decimals || 0),xx-10,a.baseY-bh-10,{width:bw+20,align:'center'});
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(5.5).text(shortLabel(r[labelKey], opts.labelMax || 7),xx-15,a.baseY+6,{width:bw+30,align:'center'});
  });
}
function drawLine(doc,x,y,w,h,data,labelKey,valueKey,opts={}){
  roundedPanel(doc,x,y,w,h); chartTitle(doc,x,y,opts.title,opts.subtitle);
  const arr = data || [];
  const max = Math.max(opts.meta || 0, ...arr.map(r => valueOf(r, Array.isArray(valueKey) ? valueKey : [valueKey])), 1) * 1.12;
  const a = axes(doc,x,y,w,h,max,opts.yLabels !== false);
  if(opts.meta){ const my = a.baseY-(n(opts.meta)/a.max)*a.plotH; doc.strokeColor(opts.metaColor || COLORS.amber).dash(4,4).moveTo(x+a.left,my).lineTo(x+a.left+a.plotW,my).stroke().undash(); }
  const color = opts.color || COLORS.blue;
  if(arr.length){
    doc.strokeColor(color).lineWidth(2);
    arr.forEach((r,i)=>{ const xx=x+a.left+(a.plotW/Math.max(arr.length-1,1))*i; const yy=a.baseY-(valueOf(r, Array.isArray(valueKey)?valueKey:[valueKey])/a.max)*a.plotH; if(i===0) doc.moveTo(xx,yy); else doc.lineTo(xx,yy); });
    doc.stroke();
    arr.forEach((r,i)=>{ const xx=x+a.left+(a.plotW/Math.max(arr.length-1,1))*i; const yy=a.baseY-(valueOf(r, Array.isArray(valueKey)?valueKey:[valueKey])/a.max)*a.plotH; doc.circle(xx,yy,2.3).fill(color); if(arr.length <= 14) doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(5.8).text(fmt(valueOf(r, Array.isArray(valueKey)?valueKey:[valueKey]), opts.decimals || 0),xx-14,yy-11,{width:28,align:'center'}); doc.fillColor(COLORS.muted).font('Helvetica').fontSize(5.5).text(shortLabel(r[labelKey],8),xx-15,a.baseY+7,{width:30,align:'center'}); });
  }
}
function drawComboMonthly(doc,x,y,w,h,data,opts={}){
  roundedPanel(doc,x,y,w,h); chartTitle(doc,x,y,opts.title,opts.subtitle);
  const arr=data||[];
  const max = Math.max(...arr.map(r=>Math.max(n(r.meta), n(r.entrada), n(r.realizado))), 1)*1.12;
  const a=axes(doc,x,y,w,h,max,true);
  const bw=Math.max(8, Math.min(22, a.plotW/Math.max(arr.length,1)*0.35));
  arr.forEach((r,i)=>{ const v=n(r.entrada || r.realizado); const bh=(v/a.max)*a.plotH; const xx=x+a.left+(a.plotW/Math.max(arr.length,1))*i+(a.plotW/Math.max(arr.length,1)-bw)/2; doc.roundedRect(xx,a.baseY-bh,bw,bh,3).fill(COLORS.green); doc.fillColor(COLORS.muted).fontSize(5.5).text(shortLabel(r.mes,4),xx-10,a.baseY+7,{width:bw+20,align:'center'}); });
  doc.strokeColor(COLORS.blue).lineWidth(2);
  arr.forEach((r,i)=>{ const xx=x+a.left+(a.plotW/Math.max(arr.length-1,1))*i; const yy=a.baseY-(n(r.meta)/a.max)*a.plotH; if(i===0) doc.moveTo(xx,yy); else doc.lineTo(xx,yy); }); doc.stroke();
}
function drawWeeklyGrouped(doc,x,y,w,h,data,fronts,opts={}){
  roundedPanel(doc,x,y,w,h); chartTitle(doc,x,y,opts.title,opts.subtitle);
  const arr=data||[]; const frontList=(fronts && fronts.length ? fronts : Object.keys(arr[0]||{}).filter(k=>k.startsWith('f'))).slice(0,8);
  const max=Math.max(...arr.flatMap(r=>frontList.map(f=>n(r[f.key || f]))),1)*1.15;
  const a=axes(doc,x,y,w,h,max,true);
  const groupW=a.plotW/Math.max(arr.length,1); const bw=Math.max(3, Math.min(9,(groupW-8)/Math.max(frontList.length,1)));
  arr.forEach((r,i)=>{ const gx=x+a.left+groupW*i+4; frontList.forEach((f,j)=>{ const key=f.key||f; const v=n(r[key]); const bh=(v/a.max)*a.plotH; doc.roundedRect(gx+j*bw,a.baseY-bh,bw-1,bh,2).fill(f.fill||FRONT_COLORS[j%FRONT_COLORS.length]); }); doc.fillColor(COLORS.muted).fontSize(5.5).text(shortLabel(r.dia,5),gx,a.baseY+7,{width:groupW-4,align:'center'}); });
}
function drawTurnoGrouped(doc,x,y,w,h,data,opts={}){
  roundedPanel(doc,x,y,w,h); chartTitle(doc,x,y,opts.title,opts.subtitle);
  const turnos=['turnoA','turnoB','turnoC']; const labels=['Turno A','Turno B','Turno C']; const arr=data||[];
  const max=Math.max(opts.meta||0, ...arr.flatMap(r=>turnos.map(t=>n(r[t]))),1)*1.15;
  const a=axes(doc,x,y,w,h,max,true);
  if(opts.meta){ const my=a.baseY-(n(opts.meta)/a.max)*a.plotH; doc.strokeColor(COLORS.red).dash(4,4).moveTo(x+a.left,my).lineTo(x+a.left+a.plotW,my).stroke().undash(); doc.fillColor(COLORS.red).font('Helvetica-Bold').fontSize(6.5).text(`M ${fmt(opts.meta,2)}%`,x+w-70,my-11,{width:50,align:'right'}); }
  const groupW=a.plotW/3; const bw=Math.max(4,Math.min(11,(groupW-20)/Math.max(arr.length,1)));
  turnos.forEach((t,ti)=>{ const gx=x+a.left+groupW*ti+10; arr.forEach((r,i)=>{ const v=n(r[t]); const bh=(v/a.max)*a.plotH; const xx=gx+i*(bw+1); doc.roundedRect(xx,a.baseY-bh,bw,Math.max(bh,0),2).fill(r.fill||FRONT_COLORS[i%FRONT_COLORS.length]); if(v>0) doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(5.5).text(fmt(v,2),xx-6,a.baseY-bh-9,{width:bw+12,align:'center'}); }); doc.fillColor(COLORS.muted).fontSize(5.8).text(labels[ti],gx,a.baseY+7,{width:groupW-20,align:'center'}); });
}
function drawTwoChartsPage(doc, filters, title, subtitle, left, right){
  // Mantido apenas por compatibilidade, mas agora cada gráfico sai em página separada.
  drawSingleChartPage(doc, filters, title, subtitle, left);
  if (right) drawSingleChartPage(doc, filters, title, subtitle, right);
}
function drawSingleChartPage(doc, filters, title, subtitle, draw){
  addPage(doc,title,subtitle || 'Gráfico individual em página única',filters);
  draw(28,82,786,455);
}
function footer(doc){
  const range=doc.bufferedPageRange();
  for(let i=0;i<range.count;i++){ doc.switchToPage(i); doc.fillColor('#74839c').font('Helvetica').fontSize(8).text(`Página ${i+1} de ${range.count}`,730,565,{width:90,align:'right'}); }
}
export async function gerarDashboardCttPdf(companyId, filters = {}) {
  const summary = await getColheitaPostgresSummary(companyId, filters);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, bufferPages: true });
  const chunks=[]; doc.on('data', c=>chunks.push(c));
  const done=new Promise((resolve,reject)=>{ doc.on('end',()=>resolve(Buffer.concat(chunks))); doc.on('error',reject); });
  const c=summary.cards||{};
  header(doc,'Dashboard CTT - Entrada de Cana','Resumo operacional da entrada de cana',filters);
  const y=72, gap=8, x0=18, cw=146;
  metricCard(doc,x0,y,cw,55,'Moagem Prevista',fmt(c.moagemPrevista),'ton',COLORS.blue);
  metricCard(doc,x0+(cw+gap),y,cw,55,'Moagem Realizada',fmt(c.moagemRealizada),'ton',COLORS.green);
  metricCard(doc,x0+2*(cw+gap),y,cw,55,'Saldo de Moagem',fmt(c.saldoMoagem),'ton',COLORS.amber);
  metricCard(doc,x0+3*(cw+gap),y,cw,55,'ATR Acumulado',fmt(c.atrReal,2),'kg/t',COLORS.purple);
  doubleMetricCard(doc,x0+4*(cw+gap),y,204,55,'Parada Acumulada','Industrial',fmt(c.paradaIndustriaAcumuladaPercentual,2),'Agrícola',fmt(c.paradaAgricolaAcumuladaPercentual,2));
  const small=[['Meta Dia',c.metaDia,'ton',COLORS.blue],['Meta/Hora',c.metaHora,'ton',COLORS.blue],['Realizado',c.realizadoDia,'ton',COLORS.green],['Realizado Últ. Hora',c.realizadoUltimaHora,'ton',COLORS.green],['Saldo',c.saldoDia,'ton',COLORS.amber],['Moagem Prevista',c.moagemPrevistaDia24h,'ton',COLORS.blue],['Meta Reproj.',c.metaReprojetada,'ton/h',COLORS.purple]];
  small.forEach((it,i)=>metricCard(doc,18+i*116,145,106,50,it[0],fmt(it[1]),it[2],it[3]));
  drawLine(doc,18,215,804,320,summary.hourlyData||[],'hora','realizado',{title:'Moagem Horária Efetiva',subtitle:'Acompanhamento hora a hora',color:COLORS.green,meta:c.metaHora});
  const dynamicFronts = (summary.frontVolumeData || []).map((f,i)=>({key:f.key || `f${String(f.frenteOriginal ?? f.frente).replace(/\D/g,'')}`, label:f.frente, fill:f.fill || FRONT_COLORS[i%FRONT_COLORS.length]}));
  drawTwoChartsPage(doc,filters,'Moagem e Volume','Gráfico individual em página única',
    (x,y,w,h)=>drawBars(doc,x,y,w,h,summary.moagemDiaDiaData||[],'dia','moagem',{title:'Moagem Dia a Dia',subtitle:'Volume diário do mês',color:COLORS.green,meta:c.metaDia}),
    (x,y,w,h)=>drawComboMonthly(doc,x,y,w,h,summary.monthlyData||[],{title:'Volume Mensal',subtitle:'Meta x realizado por mês'}));
  drawTwoChartsPage(doc,filters,'Frentes de Colheita','Gráfico individual em página única',
    (x,y,w,h)=>drawWeeklyGrouped(doc,x,y,w,h,summary.weeklyFrontData||[],dynamicFronts,{title:'Entrega Semanal por Frente',subtitle:'Semana selecionada'}),
    (x,y,w,h)=>drawBars(doc,x,y,w,h,summary.frontVolumeData||summary.frontMonthlyData||[],'frente','total',{title:'Volume por Frente',subtitle:'Volume mensal entregue por frente',labelMax:8}));
  drawTwoChartsPage(doc,filters,'ATR','Gráfico individual em página única',
    (x,y,w,h)=>drawLine(doc,x,y,w,h,summary.monthlyData||[],'mes','atr',{title:'ATR Mensal',subtitle:'Meta vs realizado mês a mês',color:COLORS.blue,meta:c.atrMeta}),
    (x,y,w,h)=>drawBars(doc,x,y,w,h,summary.atrFazendaData||[],'fazenda','atr',{title:'ATR Fazenda Dia',subtitle:'ATR direto do laboratório',color:COLORS.purple,decimals:2,labelMax:18,labelFontSize:7.2,topPaddingFactor:1.20}));
  drawTwoChartsPage(doc,filters,'Qualidade','Gráfico individual em página única',
    (x,y,w,h)=>drawBars(doc,x,y,w,h,summary.densidadeFrenteData||[],'frente','densidade',{title:'Densidade por Frente',subtitle:'Média das últimas entregas',meta:c.metaDensidade || c.densidadeMeta || 0,color:COLORS.green}),
    (x,y,w,h)=>drawLine(doc,x,y,w,h,summary.monthlyData||[],'mes','broca',{title:'Broca Mensal',subtitle:'Meta vs realizado de broca',color:'#ff7aa2',meta:c.brocaMeta || 0,decimals:2}));
  drawTwoChartsPage(doc,filters,'Impurezas por Frente e Turno','Gráfico individual em página única',
    (x,y,w,h)=>drawTurnoGrouped(doc,x,y,w,h,summary.impurezaMineralTurnoData||[],{title:'Impureza Mineral por Frente e Turno',subtitle: summary.impurezaTurnoDataSelecionada ? `Data usada: ${dateBR(summary.impurezaTurnoDataSelecionada)}` : '',meta:c.impurezaMineralMeta || 0}),
    (x,y,w,h)=>drawTurnoGrouped(doc,x,y,w,h,summary.impurezaVegetalTurnoData||[],{title:'Impureza Vegetal por Frente e Turno',subtitle: summary.impurezaTurnoDataSelecionada ? `Data usada: ${dateBR(summary.impurezaTurnoDataSelecionada)}` : '',meta:c.impurezaVegetalMeta || 0}));
  drawTwoChartsPage(doc,filters,'Impurezas Mensais','Gráfico individual em página única',
    (x,y,w,h)=>drawBars(doc,x,y,w,h,summary.monthlyData||[],'mes','vegetal',{title:'Impureza Vegetal (%)',subtitle:'Safra x meta mensal',color:COLORS.green,meta:c.impurezaVegetalMeta || 0,decimals:2}),
    (x,y,w,h)=>drawBars(doc,x,y,w,h,summary.monthlyData||[],'mes','mineral',{title:'Impureza Mineral (%)',subtitle:'Safra x meta mensal',color:COLORS.orange,meta:c.impurezaMineralMeta || 0,decimals:2}));
  footer(doc); doc.end(); return done;
}
